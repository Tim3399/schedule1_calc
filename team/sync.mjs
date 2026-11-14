#!/usr/bin/env node
// Builds the team for Claude Code (and optionally Codex) from team/roles/*.md.
//
// Each role is a chat of its own (output style), a subagent, or both:
//   kind: chat              -> .claude/output-styles/<chat.style>.md
//   kind: subagent          -> .claude/agents/<name>.md
//   kind: chat+subagent     -> both
// Plus team/roles.json (for hooks and team setup) and the team entries in .claude/settings.json.
// With "codex" in targets also: .codex/config.toml, .codex/agents/<name>.toml per role
// and .codex/profiles/<name>.config.toml for the main session (chat.main). sync never writes to ~/.codex.
//
//   node team/sync.mjs          generate
//   node team/sync.mjs --check  only check whether everything is current
//
// Source of truth: team/roles/*.md, team/roles/_chat-basis.md and team/team.config.json
// (there roles.<role>.codex|claude.<key> replaces the head field of the same name in a role).

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { KB_PLACEHOLDER, mainCheckoutDir, resolveKbRoot } from "./hooks/kb-root.mjs";
import {
    LANGUAGE_RULE,
    MARKER,
    codexConfigErrors,
    hasMarker,
    roleOverrideErrors,
} from "./sync-rules.mjs";

const TEAM_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.dirname(TEAM_DIR);
const HOOK_MARK = "team/hooks/";
const args = new Set(process.argv.slice(2));
const config = JSON.parse(fs.readFileSync(path.join(TEAM_DIR, "team.config.json"), "utf8"));
const targets = config.targets ?? ["claude"];
const checkOnly = args.has("--check");
const testCommand = (config.project?.testCommand ?? "").trim();

// Config mode: kbRoot in team.config.json is substituted for the KB placeholder in the generated files.
// Placeholder mode (no kbRoot field): the generated files keep the placeholder; the resolved path only goes
// into .claude/settings.local.json (not tracked) of the main checkout and its team worktrees.
const configMode = "kbRoot" in config;
let KB; // the resolved knowledge base path (a string)
try {
    KB = resolveKbRoot({
        env: configMode ? {} : process.env, // config mode: kbRoot wins, the environment must not matter
        projectDir: REPO,
        config,
    }).path;
} catch (e) {
    console.error(`team/team.config.json: ${e.message}`);
    console.error("Nothing written.");
    process.exit(2);
}

// With "codex" in targets the Codex side needs a complete codex block (rules in sync-rules.mjs).
// Stops with exit 2 before generating, without writing anything.
if (targets.includes("codex")) {
    const errors = codexConfigErrors(config.codex);
    if (errors.length) {
        for (const e of errors) console.error(`team/team.config.json: ${e}`);
        console.error(
            'Nothing written. Add the values or remove "codex" from targets, then run node team/sync.mjs.',
        );
        process.exit(2);
    }
}

// Test command of the last run (stored in roles.json), to remove its permission again
function previousTestCommand() {
    const file = path.join(TEAM_DIR, "roles.json");
    if (!fs.existsSync(file)) return "";
    try {
        return JSON.parse(fs.readFileSync(file, "utf8")).testCommand ?? "";
    } catch {
        return "";
    }
}

// kbRoot of the last run (stored in roles.json), to remove its permission again
function previousKbRoot() {
    const file = path.join(TEAM_DIR, "roles.json");
    if (!fs.existsSync(file)) return "";
    try {
        return JSON.parse(fs.readFileSync(file, "utf8")).kbRoot ?? "";
    } catch {
        return "";
    }
}

// ---------- Main checkout, team worktrees, .claude/settings.local.json ----------
// A session in a worktree reads the settings.local.json of its own worktree. In placeholder mode sync therefore
// writes the resolved KB path into the main checkout and every worktree under <main>/.claude/worktrees/, nowhere else.
// Tracked outputs always go to the calling checkout (REPO); the main checkout only supplies team.config.local.json
// (read by the resolver) and the state file below.

const MAIN = mainCheckoutDir(REPO);
// The path sync wrote last. Only this and the placeholder count as team entries; every other entry is foreign.
const STATE_REL = "team/sync.local.json";
const STATE_FILE = path.join(MAIN, STATE_REL);

const real = (p) => {
    try {
        return fs.realpathSync.native(p);
    } catch {
        return path.resolve(p);
    }
};
const sameDir = (a, b) => path.relative(real(a), real(b)) === "";
const inside = (parent, child) => {
    const r = path.relative(parent, child);
    return !!r && !r.startsWith("..") && !path.isAbsolute(r);
};

// -> { dirs: [main checkout, team worktrees ...], orphaned: [team worktrees whose folder is missing] }
function checkouts() {
    const alone = { dirs: [REPO], orphaned: [] };
    if (!fs.existsSync(path.join(MAIN, ".git"))) return alone;
    const r = spawnSync("git", ["-C", MAIN, "worktree", "list", "--porcelain"], {
        encoding: "utf8",
    });
    if (r.status !== 0) return alone;
    const teamRoot = path.join(real(MAIN), ".claude", "worktrees");
    const dirs = [MAIN];
    const orphaned = [];
    for (const block of r.stdout.split(/\r?\n\r?\n/)) {
        const lines = block.split(/\r?\n/);
        const wt = lines.find((l) => l.startsWith("worktree "))?.slice("worktree ".length);
        if (!wt || lines.includes("bare")) continue;
        const dir = path.resolve(wt);
        if (!inside(teamRoot, dir) && !inside(teamRoot, real(dir))) continue; // not a team worktree: never touch
        const prunable = lines.some((l) => l === "prunable" || l.startsWith("prunable "));
        if (prunable || !fs.existsSync(dir)) {
            orphaned.push(dir); // reported only, never recreated
            continue;
        }
        dirs.push(dir);
    }
    return { dirs: dirs.filter((d, n) => dirs.findIndex((x) => sameDir(x, d)) === n), orphaned };
}

function readState() {
    try {
        const v = JSON.parse(fs.readFileSync(STATE_FILE, "utf8")).additionalDirectory;
        return typeof v === "string" ? v : "";
    } catch {
        return "";
    }
}

const normDir = (p) =>
    (process.platform === "win32" ? p.replace(/\\/g, "/").toLowerCase() : p).replace(/\/+$/, "");

// Minimal JSON scanner that keeps positions, so that settings.local.json can be changed by text surgery
// (the file belongs to the user; everything but the team entry must stay byte-identical).
// -> { type, start, end, open, entries: [{ key, keyStart, node }] }
function scanJson(text) {
    let i = 0;
    const bad = () => {
        throw new Error(`not valid JSON at position ${i}`);
    };
    const ws = () => {
        while (i < text.length && " \t\r\n".includes(text[i])) i++;
    };
    const str = () => {
        if (text[i] !== '"') bad();
        const s = i++;
        while (i < text.length && text[i] !== '"') i += text[i] === "\\" ? 2 : 1;
        if (i++ >= text.length) bad();
        return JSON.parse(text.slice(s, i));
    };
    function value() {
        ws();
        const start = i;
        const c = text[i];
        if (c === "{" || c === "[") {
            const obj = c === "{";
            const close = obj ? "}" : "]";
            const node = { type: obj ? "object" : "array", start, open: i, entries: [] };
            i++;
            ws();
            if (text[i] === close) {
                i++;
                node.end = i;
                return node;
            }
            for (;;) {
                ws();
                const keyStart = i;
                let key = null;
                if (obj) {
                    key = str();
                    ws();
                    if (text[i++] !== ":") bad();
                }
                node.entries.push({ key, keyStart, node: value() });
                ws();
                if (text[i] === ",") {
                    i++;
                    continue;
                }
                if (text[i++] !== close) bad();
                node.end = i;
                return node;
            }
        }
        if (c === '"') {
            str();
            return { type: "string", start, end: i };
        }
        const m = /^(?:true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(i));
        if (!m) bad();
        i += m[0].length;
        return { type: "scalar", start, end: i };
    }
    const root = value();
    ws();
    if (i !== text.length) bad();
    return root;
}

const eol = (text) => (text.includes("\r\n") ? "\r\n" : "\n");
const lineStart = (text, pos) => text.lastIndexOf("\n", pos - 1) + 1;
const indentAt = (text, pos) => /^[ \t]*/.exec(text.slice(lineStart(text, pos)))[0];
const member = (obj, key) => obj.entries.find((e) => e.key === key) ?? null;

// Insert a new first member into an object; valueText(indent) renders the value for that indentation.
function insertMember(text, obj, key, valueText) {
    const nl = eol(text);
    const base = indentAt(text, obj.start);
    if (obj.entries.length) {
        const gap = text.slice(obj.open + 1, obj.entries[0].keyStart);
        const indent = /[ \t]*$/.exec(gap)[0];
        const entry = `${JSON.stringify(key)}: ${valueText(indent)},`.replace(/\n/g, nl);
        return text.slice(0, obj.open + 1) + gap + entry + text.slice(obj.open + 1);
    }
    const indent = base + "  ";
    const entry = `\n${indent}${JSON.stringify(key)}: ${valueText(indent)}\n${base}`.replace(
        /\n/g,
        nl,
    );
    return text.slice(0, obj.open + 1) + entry + text.slice(obj.end - 1);
}

// -> the new text of settings.local.json (the same string when there is nothing to do). text === null: no file yet.
// Team entries (the placeholder, the path of the last run) are replaced by kb; an entry that already is kb stays.
function mergeLocalSettings(text, kb, oldTeamPath) {
    const pretty = (value, indent) => JSON.stringify(value, null, 2).replace(/\n/g, "\n" + indent);
    if (text === null) return pretty({ permissions: { additionalDirectories: [kb] } }, "") + "\n";
    const data = JSON.parse(text); // broken file: error, never overwrite
    const root = scanJson(text);
    if (root.type !== "object") throw new Error("not a JSON object");
    const perms = member(root, "permissions");
    if (!perms)
        return insertMember(text, root, "permissions", (ind) =>
            pretty({ additionalDirectories: [kb] }, ind),
        );
    if (perms.node.type !== "object") throw new Error("permissions is not an object");
    const dirs = member(perms.node, "additionalDirectories");
    if (!dirs)
        return insertMember(text, perms.node, "additionalDirectories", (ind) => pretty([kb], ind));
    if (dirs.node.type !== "array") throw new Error("additionalDirectories is not a list");

    const current = data.permissions.additionalDirectories;
    const isKb = (d) => typeof d === "string" && normDir(d) === normDir(kb);
    const isTeam = (d) =>
        typeof d === "string" &&
        !isKb(d) &&
        (d === KB_PLACEHOLDER || (oldTeamPath !== "" && normDir(d) === normDir(oldTeamPath)));
    const stale = current.some(isTeam);
    const present = current.some(isKb);
    if (!stale && present) return text; // already current
    const nl = eol(text);
    const base = indentAt(text, dirs.keyStart);
    const entries = dirs.node.entries;
    const item = JSON.stringify(kb);
    if (!stale) {
        if (!entries.length)
            return (
                text.slice(0, dirs.node.start) +
                `[${nl}${base}  ${item}${nl}${base}]` +
                text.slice(dirs.node.end)
            );
        // append only: everything before the new entry stays byte-identical
        const last = entries.at(-1).node;
        const ownLine = text.slice(lineStart(text, last.start), last.start).trim() === "";
        const sep = ownLine ? `,${nl}${indentAt(text, last.start)}` : ", ";
        return text.slice(0, last.end) + sep + item + text.slice(last.end);
    }
    const kept = entries
        .filter((e, n) => !isTeam(current[n]))
        .map((e) => text.slice(e.node.start, e.node.end));
    const items = present ? kept : [...kept, item];
    const array = items.length
        ? `[${nl}${items.map((t) => base + "  " + t).join("," + nl)}${nl}${base}]`
        : "[]";
    return text.slice(0, dirs.node.start) + array + text.slice(dirs.node.end);
}

// ---------- Reading roles ----------

function parseRole(file) {
    const text = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
    const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!m) throw new Error(`${file}: head (--- … ---) is missing`);
    const head = {};
    for (const line of m[1].split("\n")) {
        if (!line.trim() || line.trim().startsWith("#")) continue;
        const i = line.indexOf(":");
        if (i < 0) throw new Error(`${file}: line without ":" in the head: ${line}`);
        head[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
    for (const key of ["name", "kind", "targets", "description"]) {
        if (!head[key]) throw new Error(`${file}: required field "${key}" is missing`);
    }
    const forms = head.kind.split("+").map((s) => s.trim());
    for (const f of forms)
        if (!["chat", "subagent"].includes(f)) throw new Error(`${file}: unknown kind "${f}"`);
    if (forms.includes("chat") && (!head["chat.style"] || !head["chat.title"])) {
        throw new Error(`${file}: chat roles need chat.style and chat.title`);
    }
    return { file, head, body: m[2], forms, targets: head.targets.split(",").map((s) => s.trim()) };
}

// Blocks <!-- only: claude --> … <!-- /only -->. Conditions joined with +:
// target (claude, codex) and form (chat, subagent). A block applies when all conditions match.
// Role files from before 0.4.0 use the German keyword (second alternative below); both are read (T-69).
function filterBody(body, target, form) {
    const out = [];
    let keep = true;
    let open = false;
    for (const line of body.split("\n")) {
        const start = line.match(/^\s*<!--\s*(?:only|nur):\s*([a-z+\s]+?)\s*-->\s*$/);
        if (start) {
            if (open) throw new Error("Nested <!-- only --> blocks are not supported");
            const conds = start[1].split("+").map((s) => s.trim());
            for (const c of conds) {
                if (!["claude", "codex", "chat", "subagent"].includes(c))
                    throw new Error(`Unknown condition in <!-- only: ${start[1]} -->`);
            }
            keep = conds.every((c) =>
                c === "claude" || c === "codex" ? c === target : c === form,
            );
            open = true;
            continue;
        }
        if (/^\s*<!--\s*\/(?:only|nur)\s*-->\s*$/.test(line)) {
            if (!open) throw new Error("<!-- /only --> without a start");
            keep = true;
            open = false;
            continue;
        }
        if (keep) out.push(line);
    }
    if (open) throw new Error("<!-- only --> block is not closed");
    return (
        out
            .join("\n")
            // replacer functions, so that $$, $&, $` and $' in the values stay literal
            // config mode only; in placeholder mode the placeholder stays
            .replaceAll(KB_PLACEHOLDER, (m) => (configMode ? config.kbRoot : m))
            .replace(/<DEV_POOL>/g, () => String(config.devPool))
            .replace(/\n{3,}/g, "\n\n")
            .trim() + "\n"
    );
}

function prefixed(head, prefix) {
    return Object.fromEntries(
        Object.entries(head)
            .filter(([k]) => k.startsWith(prefix + "."))
            .map(([k, v]) => [k.slice(prefix.length + 1), v]),
    );
}

const list = (v) =>
    v
        ? v
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
        : [];
const yamlString = (s) => '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';

// ---------- Claude outputs ----------

// Subagent and Codex files do not get _chat-basis.md, so the language rule (F-69-2) is appended to them.
const LANGUAGE_BLOCK = `\n## Language\n\n${LANGUAGE_RULE}\n`;

function claudeAgent(role) {
    const c = prefixed(role.head, "claude");
    const name = c.name || role.head.name;
    delete c.name;
    const description = role.head["subagent.description"] || role.head.description;
    const lines = ["---", `name: ${name}`, `description: ${yamlString(description)}`];
    for (const [k, v] of Object.entries(c)) lines.push(`${k}: ${v}`);
    lines.push(
        "---",
        `<!-- ${MARKER} -->`,
        "",
        filterBody(role.body, "claude", "subagent") + LANGUAGE_BLOCK,
    );
    return [`.claude/agents/${name}.md`, lines.join("\n")];
}

function claudeOutputStyle(role, chatBasis) {
    const style = role.head["chat.style"];
    const body =
        filterBody(role.body, "claude", "chat") + "\n" + filterBody(chatBasis, "claude", "chat");
    const lines = [
        "---",
        `name: ${style}`,
        `description: ${yamlString(role.head.description)}`,
        "keep-coding-instructions: true",
        "---",
        `<!-- ${MARKER} -->`,
        "",
        body,
    ];
    return [`.claude/output-styles/${style}.md`, lines.join("\n")];
}

// Machine-readable role description for hooks and team setup
function rolesJson(roles) {
    const chats = roles
        .filter((r) => r.forms.includes("chat"))
        .map((r) => {
            const c = prefixed(r.head, "chat");
            // roles.<role>.claude.model moves to the front of the model order
            const order = r.claudeModel
                ? [r.claudeModel, ...list(c.model).filter((m) => m !== r.claudeModel)]
                : list(c.model);
            return {
                role: r.head.name,
                title: c.title,
                style: c.style,
                external: c.external === "true",
                main: c.main === "true",
                worktree: c.worktree === "true",
                models_order: order,
                model: order[0] ?? null,
                effort: r.claudeEffort ?? c.effort ?? null,
                models: list(c.models),
                subagents: list(c.subagents),
            };
        });
    return (
        JSON.stringify(
            {
                _hint: MARKER,
                devPool: config.devPool,
                kbRoot: configMode ? config.kbRoot : undefined, // JSON.stringify drops undefined
                testCommand,
                chats,
            },
            null,
            2,
        ) + "\n"
    );
}

const SESSION_TOOLS_ALLOW = [
    "list_sessions",
    "get_session",
    "list_events",
    "search_session_transcripts",
    "set_session_title",
    "set_session_output_style",
    "set_session_model",
    "set_session_effort",
    "stop_session",
    "archive_session",
    "clear_session",
].map((t) => `mcp__ccd_session_mgmt__${t}`);

const SESSION_TOOLS_DENY = [
    "mcp__ccd_session_mgmt__delete_session",
    "mcp__ccd_session_mgmt__set_session_permission_mode",
    "mcp__ccd_session_mgmt__set_session_fast_mode",
    "mcp__ccd_session__move_to_cloud",
];
// Team-owned deny entries of older versions: sync removes exactly these (T-138: Remote Control on is allowed).
const SESSION_TOOLS_DENY_OLD = ["mcp__ccd_session_mgmt__set_remote_control"];

function hookCommand(script) {
    return `node "$CLAUDE_PROJECT_DIR/team/hooks/${script}"`;
}

function claudeSettings(existing) {
    const s = existing ?? {};
    const c = config.claude;
    delete s.outputStyle; // roles are set per chat, not for the whole project
    s.model = c.model;
    s.effortLevel = c.effortLevel;
    s.worktree = { ...(s.worktree ?? {}), baseRef: "head" };

    s.permissions = s.permissions ?? {};
    // defaultMode has no effect in project settings (D-66): the mode belongs in the user settings.
    delete s.permissions.defaultMode;
    // Only the kbRoot written by the last run is dropped; other entries of the user stay.
    // Placeholder mode: this tracked file never names the path (it goes to settings.local.json).
    const oldKbRoot = previousKbRoot();
    const dirs = new Set(
        (s.permissions.additionalDirectories ?? []).filter(
            (d) => d !== KB_PLACEHOLDER && !(oldKbRoot && d === oldKbRoot),
        ),
    );
    if (configMode) dirs.add(config.kbRoot);
    s.permissions.additionalDirectories = [...dirs];
    const merge = (current, add) => [...new Set([...(current ?? []), ...add])];
    const OLD = [
        "mcp__scheduled-tasks__run_scheduled_task",
        "mcp__scheduled-tasks__list_scheduled_tasks",
        "mcp__scheduled-tasks__list_task_runs",
    ];
    // The project's test command: the entry generated last (from roles.json) is replaced
    const testRule = (testCommand) => (testCommand ? `Bash(${testCommand})` : null);
    const staleRules = [...OLD, testRule(previousTestCommand())];
    s.permissions.allow = (s.permissions.allow ?? []).filter((r) => !staleRules.includes(r));
    s.permissions.allow = merge(s.permissions.allow, [
        ...SESSION_TOOLS_ALLOW,
        "mcp__ccd_session_mgmt__send_message",
        "SendMessage",
        "ListAgents",
        "Bash(node team/bootstrap.mjs*)",
        ...[testRule(testCommand)].filter(Boolean),
    ]);
    s.permissions.deny = merge(
        (s.permissions.deny ?? []).filter((r) => !SESSION_TOOLS_DENY_OLD.includes(r)),
        SESSION_TOOLS_DENY,
    );

    // replace team hooks, keep foreign hooks
    const own = {
        SessionStart: [{ hooks: [{ type: "command", command: hookCommand("session-start.mjs") }] }],
        SubagentStart: [
            { hooks: [{ type: "command", command: hookCommand("subagent-start.mjs") }] },
        ],
        PreToolUse: [
            {
                matcher:
                    "^(mcp__ccd_session_mgmt__.*|mcp__scheduled-tasks__.*|Agent|Write|Edit|NotebookEdit|Bash|PowerShell)$",
                hooks: [{ type: "command", command: hookCommand("policy.mjs") }],
            },
        ],
        PostToolUse: [
            {
                matcher: "mcp__ccd_session_mgmt__set_session_title",
                hooks: [{ type: "command", command: hookCommand("registry-title.mjs") }],
            },
        ],
        PreCompact: [{ hooks: [{ type: "command", command: hookCommand("pre-compact.mjs") }] }],
    };
    s.hooks = s.hooks ?? {};
    for (const [event, groups] of Object.entries(own)) {
        const foreign = (s.hooks[event] ?? []).filter(
            (g) => !JSON.stringify(g).includes(HOOK_MARK),
        );
        s.hooks[event] = [...foreign, ...groups];
    }

    s.env = {
        ...(s.env ?? {}),
        CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH: "3",
        CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "0",
        CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS: "1", // one subagent at a time (D-65, D-66)
    };
    return JSON.stringify(s, null, 2) + "\n";
}

// ---------- Codex outputs ----------

// TOML strings: literal ('…') as in the existing files, basic ("…") only when ' or control characters occur
function tomlString(s) {
    if (!/['\u0000-\u001f\u007f]/.test(s)) return `'${s}'`;
    return (
        '"' +
        s.replace(/[\\"\u0000-\u001f\u007f]/g, (c) => {
            const named = { "\\": "\\\\", '"': '\\"', "\n": "\\n", "\t": "\\t", "\r": "\\r" }[c];
            return named ?? "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0");
        }) +
        '"'
    );
}

function tomlMultiline(s) {
    if (!s.includes("'''") && !/[\u0000-\u0008\u000b-\u001f\u007f]/.test(s)) return `'''\n${s}'''`;
    return (
        '"""\n' +
        s
            .replace(/\\/g, "\\\\")
            .replace(/"""/g, '""\\"')
            .replace(
                /[\u0000-\u0008\u000b-\u001f\u007f]/g,
                (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"),
            ) +
        '"""'
    );
}

function tomlValue(v) {
    if (v === "true" || v === "false" || /^-?\d+$/.test(v)) return v;
    return tomlString(v);
}

// Keys from the role head: codex.<key> goes 1:1 into the TOML, codex.effort is called model_reasoning_effort there.
// Missing values fall back to team.config.json or the role's chat.effort.
// No sandbox_mode default: a custom Codex agent inherits it from the parent session (D-66), so a read-only
// value here would not be enforced. A codex.sandbox_mode set in the role head still passes through.
function codexFields(role) {
    const c = prefixed(role.head, "codex");
    delete c.name;
    const fields = {
        model: c.model ?? config.codex.model,
        model_reasoning_effort: c.effort ?? role.head["chat.effort"] ?? config.codex.effort,
    };
    delete c.model;
    delete c.effort;
    return [...Object.entries(fields), ...Object.entries(c)].map(
        ([k, v]) => `${k} = ${tomlValue(v)}`,
    );
}

const codexName = (role) => role.head["codex.name"] || role.head.name;

function codexAgent(role) {
    const lines = [
        `# ${MARKER}`,
        `name = ${tomlString(codexName(role))}`,
        `description = ${tomlString(role.head["subagent.description"] || role.head.description)}`,
        ...codexFields(role),
        `developer_instructions = ${tomlMultiline(filterBody(role.body, "codex", "subagent") + LANGUAGE_BLOCK)}`,
        "",
    ];
    return [`.codex/agents/${codexName(role)}.toml`, lines.join("\n")];
}

// The main session (chat.main) is not a subagent but a profile
function codexProfile(role) {
    const lines = [
        `# ${MARKER}`,
        `# Codex profile for the main session. Start: codex --profile ${codexName(role)}`,
        ...codexFields(role),
        `developer_instructions = ${tomlMultiline(filterBody(role.body, "codex", "chat") + LANGUAGE_BLOCK)}`,
        "",
    ];
    return [`.codex/profiles/${codexName(role)}.config.toml`, lines.join("\n")];
}

function codexProjectConfig() {
    const x = config.codex;
    // Placeholder mode: the path is not known to tracked files, so there is no writable_roots line.
    const writable = configMode
        ? [
              "[sandbox_workspace_write]",
              "# The knowledge base lies outside the repo and must be writable.",
              `writable_roots = [${tomlString(config.kbRoot)}]`,
              "",
          ]
        : [];
    const lines = [
        `# ${MARKER}`,
        "# Loaded only when the project is marked as trusted in Codex.",
        `model = ${tomlString(x.model)}`,
        `model_reasoning_effort = ${tomlString(x.effort)}`,
        `review_model = ${tomlString(x.reviewModel)}`,
        `web_search = ${tomlString(x.webSearch)}`,
        `sandbox_mode = 'workspace-write'`,
        `approval_policy = 'on-request'`,
        "",
        ...writable,
        "[agents]",
        `max_concurrent_threads_per_session = ${Number(x.maxThreads)}`,
        "",
    ];
    return [".codex/config.toml", lines.join("\n")];
}

// ---------- Generating ----------

const roleFiles = fs.readdirSync(path.join(TEAM_DIR, "roles")).filter((f) => f.endsWith(".md"));
const chatBasis = fs
    .readFileSync(path.join(TEAM_DIR, "roles", "_chat-basis.md"), "utf8")
    .replace(/\r\n/g, "\n");
const roles = roleFiles
    .filter((f) => !f.startsWith("_"))
    .map((f) => parseRole(path.join(TEAM_DIR, "roles", f)));

// Project values per role: roles.<role>.codex.<key> and roles.<role>.claude.<key> from team.config.json
// replace the head fields codex.<key> and claude.<key> of the role file. Errors: exit 2, nothing written.
// Under claude only model and effort are allowed (rules in sync-rules.mjs); they apply to the subagent (front matter) and the chat role (roles.json).
{
    const errors = roleOverrideErrors(
        config.roles,
        roles.map((r) => r.head.name),
    );
    if (errors.length) {
        for (const e of errors) console.error(`team/team.config.json: ${e}`);
        console.error(
            'Nothing written. Fix "roles" in team/team.config.json, then run node team/sync.mjs.',
        );
        process.exit(2);
    }
    for (const role of roles) {
        for (const [group, values] of Object.entries(config.roles?.[role.head.name] ?? {})) {
            for (const [key, v] of Object.entries(values)) {
                role.head[`${group}.${key}`] = v.trim();
                if (group === "claude")
                    role[key === "model" ? "claudeModel" : "claudeEffort"] = v.trim();
            }
        }
    }
}

const outputs = new Map(); // relative path -> content
const generatedDirs = [];

if (targets.includes("claude")) {
    generatedDirs.push(".claude/agents", ".claude/output-styles");
    for (const role of roles) {
        if (!role.targets.includes("claude")) continue;
        if (role.forms.includes("subagent")) outputs.set(...claudeAgent(role));
        if (role.forms.includes("chat")) outputs.set(...claudeOutputStyle(role, chatBasis));
    }
    const settingsPath = path.join(REPO, ".claude/settings.json");
    const existing = fs.existsSync(settingsPath)
        ? JSON.parse(fs.readFileSync(settingsPath, "utf8"))
        : null;
    outputs.set(".claude/settings.json", claudeSettings(existing));
}
outputs.set("team/roles.json", rolesJson(roles));

// Codex: one file per role, regardless of its targets (those apply to Claude only).
// The Codex folders are always checked for stale files, even without "codex" in targets.
generatedDirs.push(".codex/agents", ".codex/profiles");
if (targets.includes("codex")) {
    for (const role of roles) {
        outputs.set(...(role.head["chat.main"] === "true" ? codexProfile(role) : codexAgent(role)));
    }
    outputs.set(...codexProjectConfig());
}

// find stale generated files (case-insensitive, Windows and macOS do not tell the cases apart)
// hasMarker accepts the old German marker too, so files from before 0.4.0 are cleaned up as well
const wantedLower = new Set([...outputs.keys()].map((k) => k.toLowerCase()));
const stale = [];
const isStale = (rel) => {
    const abs = path.join(REPO, rel);
    return (
        !wantedLower.has(rel.toLowerCase()) &&
        fs.statSync(abs).isFile() &&
        hasMarker(rel, fs.readFileSync(abs, "utf8"))
    );
};
for (const dir of generatedDirs) {
    const abs = path.join(REPO, dir);
    if (!fs.existsSync(abs)) continue;
    for (const f of fs.readdirSync(abs)) if (isStale(`${dir}/${f}`)) stale.push(`${dir}/${f}`);
}
// .codex/config.toml lies next to foreign files: check only this one
if (fs.existsSync(path.join(REPO, ".codex/config.toml")) && isStale(".codex/config.toml"))
    stale.push(".codex/config.toml");

// Existing files without a generator marker belong to the project and are never overwritten.
// Marker rule as when generating: Codex TOML has it in line 1 as "# <MARKER>", Claude Markdown
// as "<!-- <MARKER> -->" in the first line after the head (--- … ---). The old German marker counts too,
// so those files are overwritten with the new marker.
// Excluded: .claude/settings.json is merged (foreign entries stay, a marker has no place in JSON),
// team/roles.json is a file of the generator itself, not a project file.
const NO_MARKER_CHECK = new Set([".claude/settings.json", "team/roles.json"]);
const conflicts = [...outputs.keys()].filter((rel) => {
    const abs = path.join(REPO, rel);
    return (
        !NO_MARKER_CHECK.has(rel) &&
        fs.existsSync(abs) &&
        !hasMarker(rel, fs.readFileSync(abs, "utf8"))
    );
});
if (conflicts.length) {
    for (const rel of conflicts)
        console.error(`Conflict: ${rel} exists without a generator marker and is not overwritten.`);
    console.error(
        "Nothing was written in this run. Way out: rename or delete the file, then run node team/sync.mjs.",
    );
    process.exit(1);
}

let changed = 0;
for (const [rel, content] of outputs) {
    const abs = path.join(REPO, rel);
    const old = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8").replace(/\r\n/g, "\n") : null;
    if (old === content) continue;
    changed++;
    if (checkOnly) {
        console.log(`outdated: ${rel}`);
        continue;
    }
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
    console.log(`written: ${rel}`);
}
for (const rel of stale) {
    changed++;
    if (checkOnly) {
        console.log(`superfluous: ${rel}`);
        continue;
    }
    fs.rmSync(path.join(REPO, rel));
    console.log(`removed: ${rel}`);
}

// settings.local.json: only in placeholder mode (config mode keeps the path in the tracked settings.json)
let localErrors = 0;
if (!configMode && targets.includes("claude")) {
    const CHECKOUTS = checkouts();
    const oldTeamPath = readState();
    const show = (p) => path.relative(MAIN, p).replace(/\\/g, "/") || ".";
    for (const dir of CHECKOUTS.dirs) {
        const abs = path.join(dir, ".claude", "settings.local.json");
        const rel = show(abs);
        const old = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null;
        let next;
        try {
            next = mergeLocalSettings(old, KB, oldTeamPath);
        } catch (e) {
            localErrors++;
            console.error(`Error: ${rel}: ${e.message}`);
            continue;
        }
        if (next === old) continue;
        changed++;
        if (checkOnly) console.log(`outdated: ${rel} (KB path ${KB} missing)`);
        else {
            fs.mkdirSync(path.dirname(abs), { recursive: true });
            fs.writeFileSync(abs, next);
            console.log(`written: ${rel} (KB path ${KB})`);
        }
    }
    for (const dir of CHECKOUTS.orphaned) {
        console.log(
            `skipped: ${show(dir)} (orphaned worktree, folder is missing; clean up with git worktree prune)`,
        );
    }
    // remember what this run wrote, so that the next run replaces exactly this entry
    if (!checkOnly && !localErrors && oldTeamPath !== KB) {
        fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
        fs.writeFileSync(
            STATE_FILE,
            JSON.stringify({ _hint: MARKER, additionalDirectory: KB }, null, 2) + "\n",
        );
    }
}
if (!configMode && targets.includes("codex")) {
    console.log(
        "Hint: placeholder mode (no kbRoot in team/team.config.json): .codex/config.toml has no writable_roots for the knowledge base. Add the path to your own Codex configuration.",
    );
}

// Worktree folders and local files do not belong into the repo
const gitignore = path.join(REPO, ".gitignore");
const ignoreText = fs.existsSync(gitignore) ? fs.readFileSync(gitignore, "utf8") : "";
const missing = [
    ".claude/worktrees/",
    ".worktrees/",
    ".claude/settings.local.json",
    "team/team.config.local.json",
    STATE_REL,
].filter((e) => !ignoreText.split(/\r?\n/).includes(e));
if (missing.length) {
    changed++;
    if (checkOnly) console.log(`.gitignore is missing: ${missing.join(", ")}`);
    else {
        const sep = ignoreText && !ignoreText.endsWith("\n") ? "\n" : "";
        fs.writeFileSync(gitignore, ignoreText + sep + missing.join("\n") + "\n");
        console.log(`.gitignore extended: ${missing.join(", ")}`);
    }
}

console.log(`${checkOnly ? "Check" : "Done"}: ${changed} change(s).`);
if (checkOnly) {
    // team styles at user level are only reported (stderr), the exit code stays the same
    const { userLevelTeamStylesWarning } = await import("./hooks/user-styles.mjs");
    const warning = userLevelTeamStylesWarning();
    if (warning) process.stderr.write(warning);
}
if ((checkOnly && changed) || localErrors) process.exit(1);

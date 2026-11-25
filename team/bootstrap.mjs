#!/usr/bin/env node
// Team setup with empty chats: the user creates normal chats and sends the same prompt into each
// (see team/TEAM-BEITRETEN.txt). Each chat calls "claim", gets the next free role and sets
// itself up.
//
//   node team/bootstrap.mjs claim       next free role for this chat (start instructions on stdout)
//   node team/bootstrap.mjs plan        missing roles in start order (JSON)
//   node team/bootstrap.mjs deeplink    fallback: open missing chats by link (one click per chat)

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
    roles,
    loadRegistry,
    readRegistry,
    withRegistryLock,
    projectTitle,
    titleKey,
    entryKey,
    KB,
    REGISTRY,
} from "./hooks/lib.mjs";
import { mainCheckoutDir } from "./hooks/kb-root.mjs";
import {
    NUMBERED,
    POOL_LIMITS,
    ruleOfTitle,
    slotName,
    titlesOfChat,
    workStateDir,
} from "./hooks/pools.mjs";
import { workStateFile } from "./hooks/work-state.mjs";

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const START_DIR = path.join(KB, "team", "start");
const [command, ...rest] = process.argv.slice(2);
const flags = new Set(rest.filter((a) => a.startsWith("--")));
const names = rest.filter((a) => !a.startsWith("--")).map((a) => titleKey(a));
const WAIT_MINUTES = Number(rest.find((a) => a.startsWith("--minutes="))?.split("=")[1] ?? 15);

// Registered titles as comparison keys (T-155: "Dev 3" and "Dev 3 - <project>" are one title)
const registered = () =>
    new Set(
        Object.values(loadRegistry())
            .filter((e) => e.title)
            .map((e) => entryKey(e)),
    );

// All chats that should exist, in start order: Orchestrator, external (pooled roles first), internal, dev slots.
// Every chat entry expands to its slot titles (pools.mjs); "entry" keeps the roles.json entry for the title rules.
function allChats() {
    // Dev slots (title with {n}) come after every core role.
    // Inside the external block, roles with a pool setting (Critic) come before the others (Advisor).
    const order = (c) =>
        c.main
            ? 0
            : c.external
              ? POOL_LIMITS[c.role]
                  ? 1
                  : 1.5
              : ruleOfTitle(c.title) === NUMBERED
                ? 3
                : 2;
    return [...roles.chats]
        .sort((a, b) => order(a) - order(b))
        .flatMap((chat) =>
            titlesOfChat(chat, roles).map(({ title, slot }) => ({
                ...chat,
                title,
                slot,
                entry: chat,
            })),
        );
}

function missing({ intern = false, withMain = true } = {}) {
    const taken = registered();
    return allChats().filter((c) => {
        if (taken.has(titleKey(c.title))) return false;
        if (!withMain && c.main) return false;
        if (intern && (c.main || c.external)) return false;
        if (names.length && !names.includes(titleKey(c.title)) && !names.includes(c.role))
            return false;
        return true;
    });
}

const byTitle = (title) => allChats().find((c) => titleKey(c.title) === titleKey(title));
const slug = (c) => c.title.toLowerCase().replace(/\s+/g, "-");
const fwd = (p) => p.split(path.sep).join("/");
const worktreeName = (c) => slotName(c.entry, c.slot);
// Folder of a role worktree: always below the main checkout, also when claim runs elsewhere (D-60).
const worktreeDir = (c) =>
    path.join(mainCheckoutDir(REPO), ".claude", "worktrees", worktreeName(c));

// Path comparison for the project check: realpath (if it exists), "/" instead of "\\", no trailing separator,
// case-insensitive on win32.
function normalizeDir(p) {
    let abs = path.resolve(p);
    try {
        abs = fs.realpathSync.native(abs);
    } catch {
        // does not exist: the resolved path is enough
    }
    abs = abs.split(path.sep).join("/").replace(/\/+$/, "");
    return process.platform === "win32" ? abs.toLowerCase() : abs;
}

// claim runs only in this project (D-77, D-78). Project folder of the chat: CLAUDE_PROJECT_DIR (set only in hooks),
// else the cwd from its own registry entry (written by the SessionStart hook); read only. Returns the error text or null.
function projectError() {
    let dir = process.env.CLAUDE_PROJECT_DIR;
    let source = "CLAUDE_PROJECT_DIR";
    if (!dir) {
        source = "the registry entry of this chat";
        const { reg, broken } = readRegistry();
        if (broken) {
            console.error(
                `The team registry ${REGISTRY} is broken (${broken}) and stays unchanged. Nothing was changed. The user must repair it.`,
            );
            process.exit(2);
        }
        const host = process.env.CLAUDE_CODE_HOST_SESSION_ID;
        const cwd = host ? reg[host]?.cwd : null;
        dir = typeof cwd === "string" ? cwd : "";
    }
    if (dir && normalizeDir(dir) === normalizeDir(REPO)) return null;
    return `This chat does not run in this project: ${source} is ${dir ? `"${dir}"` : "missing"}, expected is the project ${REPO}. Nothing was written. The user must create the chat in the project ${REPO}.`;
}

function startPrompt(c) {
    const state = workStateOf(c);
    const steps = [
        `Name this chat: set_session_title with session_id "self" and title "${projectTitle(c.title)}".`,
        `Never write styles, agents or settings outside this project, in particular not to ~/.claude or %APPDATA%. If set_session_output_style does not find the style, stop and tell the user.`,
        `Set your role style: set_session_output_style with session_id "self" and style "${c.style}".`,
    ];
    if (c.worktree)
        steps.push(
            `Switch into your own worktree: EnterWorktree with path "${fwd(worktreeDir(c))}". You always work there from now on.`,
        );
    steps.push(
        `Your work state is ${state}. Create it if it is missing, with the content "${initialWorkState(c).trim().replace(/\n+/g, " · ")}".`,
    );
    if (c.main) {
        steps.push(
            'Check with get_session (session_id "self") whether you run on Opus. If not, tell the user to choose Opus in the model menu of this chat.',
        );
    } else {
        steps.push(
            `Report to the Orchestrator with the message "${projectTitle(c.title)} ready". Its session ID is in ${fwd(KB)}/team/registry.json (entry with title "${projectTitle("Orchestrator")}" or "Orchestrator"). Send with SendMessage to this ID, with send_message if that fails. If no Orchestrator is registered yet, skip this step. The Orchestrator then finds you in the registry.`,
        );
    }
    return [
        `Team setup: this chat becomes "${c.title}" (role ${c.role}). Set yourself up now, without asking back:`,
        ...steps.map((s, i) => `${i + 1}. ${s}`),
        c.main
            ? "Then end this turn. Your role applies from your next answer on."
            : "Then do nothing else and wait for assignments. Your role applies from your next answer on. The Orchestrator sets your model.",
    ].join("\n");
}

// Timeout for the git calls of claim, like every tool spawn of agent-team (T-75): AGENT_TEAM_SPAWN_TIMEOUT_MS
// (positive integer) overrides the default of 120000 ms.
function spawnTimeoutMs() {
    const raw = process.env.AGENT_TEAM_SPAWN_TIMEOUT_MS?.trim();
    return raw && /^\d+$/.test(raw) && Number(raw) > 0 ? Number(raw) : 120000;
}

// git in the main checkout. Returns null or the error text (with "timed out after <n> ms (git)" on a timeout).
function git(main, ...args) {
    const ms = spawnTimeoutMs();
    const r = spawnSync("git", ["-C", main, ...args], { encoding: "utf8", timeout: ms });
    if (r.error?.code === "ETIMEDOUT")
        return `git ${args.join(" ")}: timed out after ${ms} ms (git)`;
    if (r.error) return `git ${args.join(" ")}: ${r.error.message}`;
    if (r.status !== 0)
        return `git ${args.join(" ")}: ${(r.stderr || r.stdout).trim() || `exit ${r.status}`}`;
    return null;
}

// Creates the role worktree before the chat enters it by path (D-60): EnterWorktree with a name would create the
// forbidden branch worktree-<name>. Resting branch wt/<name>, based on HEAD of the main checkout. An existing folder
// (any branch, also an old worktree-<name>) stays as it is. Returns null or the error text.
function ensureWorktree(c) {
    const main = mainCheckoutDir(REPO);
    const dir = worktreeDir(c);
    if (fs.existsSync(dir)) return null;
    const branch = `wt/${worktreeName(c)}`;
    const known = git(main, "show-ref", "--verify", "--quiet", `refs/heads/${branch}`) === null;
    const longPathsErr = enableLongPaths(main);
    const err = known
        ? git(main, "worktree", "add", dir, branch)
        : git(main, "worktree", "add", "-b", branch, dir, "HEAD");
    if (err) {
        // A failed add can leave a half-created folder; the next claim would take it for an existing worktree.
        fs.rmSync(dir, { recursive: true, force: true });
        git(main, "worktree", "prune");
    }
    const hint = longPathsErr
        ? ` (long paths: core.longpaths could not be set, this may be the cause: ${longPathsErr})`
        : "";
    return err
        ? `The worktree for "${c.title}" could not be created (${fwd(dir)}, branch ${branch}): ${err}${hint}.`
        : null;
}

// Work state file of a slot: work-state.md, or an existing arbeitsstand.md (0.3.0 projects), in the slot folder
// (critic/critic-2/, dev/dev-3/).
const workStateOf = (c) =>
    workStateFile(fwd(path.join(KB, workStateDir(c.entry, c.slot))), (file) => fs.existsSync(file));

// On Windows a checkout with paths over MAX_PATH fails with "Filename too long" unless core.longpaths is set (T-135).
// Sets it in the local config of the repo only (never --global or --system) and only if it is not already true.
// Returns null or the error text.
function enableLongPaths(main) {
    if (process.platform !== "win32") return null;
    const r = spawnSync("git", ["-C", main, "config", "--local", "--get", "core.longpaths"], {
        encoding: "utf8",
        timeout: spawnTimeoutMs(),
    });
    if (r.stdout?.trim() === "true") return null;
    return git(main, "config", "--local", "core.longpaths", "true");
}

// Initial work state of a role, in English (T-61). Read by the clear check in hooks/policy.mjs.
const initialWorkState = (c) => `# Work state ${c.title}\n\nStatus: free\nAssignment: –\n`;

// Writes the initial work state of the claimed role if none exists yet. workStatePath keeps an existing
// arbeitsstand.md (0.3.0 projects); a new file is work-state.md.
function ensureWorkState(c) {
    const file = workStateOf(c);
    if (fs.existsSync(file)) return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, initialWorkState(c));
}

// Create the dev pool if it is missing; if it exists, add the slots missing for the current dev pool (N-8).
// Existing slots are never rewritten or reordered; without missing slots the file is not touched. After that only
// the Implementer maintains it.
// English values and keys (F-69-5, N-8): status free | busy | broken. Pools from before 0.4.0 have frei | belegt |
// defekt and the keys auftrag, seit; policy.mjs reads both status forms, no code reads assignment or since.
function ensurePool() {
    const file = path.join(KB, "implementer", "dev-pool.json");
    const fresh = (title) => ({
        title,
        status: "free",
        assignment: null,
        branch: null,
        since: null,
    });
    const titles = allChats()
        .filter((c) => c.role === "dev")
        .map((c) => c.title);
    if (!fs.existsSync(file)) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, JSON.stringify({ slots: titles.map(fresh) }, null, 2) + "\n");
        console.error(`Dev pool created: ${file}`);
        return;
    }
    let pool;
    try {
        pool = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
        return; // unreadable: the Implementer repairs it, claim does not touch it
    }
    if (!Array.isArray(pool?.slots)) return;
    const have = new Set(pool.slots.map((s) => String(s?.title).toLowerCase()));
    const add = titles.filter((t) => !have.has(t.toLowerCase())).map(fresh);
    if (!add.length) return;
    pool.slots.push(...add);
    fs.writeFileSync(file, JSON.stringify(pool, null, 2) + "\n");
    console.error(`Dev pool grown: ${add.map((s) => s.title).join(", ")} (${file})`);
}

// Selection for claim (D-73): runs entirely under the registry lock, so that two chats never remove the same expired
// claim and both get the role. Calls nothing that takes the lock again (registerTitle).
// Returns { out, code }: output and exit code, printed only after the lock is released. For a claimed
// role { chat, claim, code: 0 }: it is set up only after the release, because git can take time (D-60).
function selectRole(host) {
    // A broken registry would look empty: every taken role would be given out again.
    const { reg, broken } = readRegistry();
    if (broken)
        return {
            out: `The team registry ${REGISTRY} is broken (${broken}). No role claimed. The user must repair it.`,
            code: 2,
        };
    const own = reg[host];
    if (own?.role) return { out: `This chat already is "${own.title}". Nothing to do.`, code: 0 };
    const claimDir = path.join(KB, "team", "claims");
    const taken = new Set(
        Object.values(reg)
            .filter((e) => e.title)
            .map((e) => entryKey(e)),
    );
    for (const c of allChats()) {
        if (taken.has(titleKey(c.title))) continue;
        // The style of the chosen role must be in the project (D-77), otherwise no claim file.
        const styleFile = path.join(REPO, ".claude", "output-styles", `${c.style}.md`);
        if (!fs.existsSync(styleFile))
            return {
                out: `The role style for "${c.title}" is missing in the project: expected ${styleFile} (project ${REPO}). Nothing was written. The user must run "node team/sync.mjs" in the project.`,
                code: 2,
            };
        const file = path.join(claimDir, `${slug(c)}.json`);
        if (fs.existsSync(file)) {
            let old = null;
            let mtime = Date.now();
            try {
                mtime = fs.statSync(file).mtimeMs;
                old = JSON.parse(fs.readFileSync(file, "utf8"));
            } catch {
                // unreadable, empty or partial: a foreign claim until its mtime is 10 minutes old
            }
            if (old?.host === host) return { chat: c, claim: file, code: 0 };
            const at = Date.parse(old?.at);
            if (Date.now() - (Number.isNaN(at) ? mtime : at) < 10 * 60_000) continue;
            fs.rmSync(file, { force: true });
        }
        // Atomic (F-v031-3): write a temp file, then hard-link it to the claim name, so a reader never
        // sees an empty or partial claim. Temp files end in .tmp, never .json.
        const tmp = path.join(
            claimDir,
            `${slug(c)}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`,
        );
        try {
            fs.mkdirSync(claimDir, { recursive: true });
            fs.writeFileSync(tmp, JSON.stringify({ host, at: new Date().toISOString() }));
            fs.linkSync(tmp, file);
        } catch (e) {
            // EEXIST: a claim from a process outside the lock (older version), so the role is taken.
            if (e?.code === "EEXIST") continue;
            // Anything else (EPERM, ENOTSUP, ENOSPC, EACCES, ...) is a real failure: never report it as "taken".
            return {
                out: `The claim file could not be created (${e?.code ?? e?.message}): ${file} (temp file ${tmp}). No role claimed.`,
                code: 2,
            };
        } finally {
            try {
                fs.rmSync(tmp, { force: true });
            } catch {
                // a leftover .tmp is ignored by every reader of claims/
            }
        }
        return { chat: c, claim: file, code: 0 };
    }
    return {
        out: "All roles are taken. This chat is not needed and can be archived.",
        code: 0,
    };
}

// A broken registry would look empty: plan and deeplink would report every role as missing. Stop without writing.
function abortIfRegistryBroken() {
    const { broken } = readRegistry();
    if (!broken) return;
    console.error(
        `The team registry ${REGISTRY} is broken (${broken}) and stays unchanged. Nothing was changed. The user must repair it.`,
    );
    process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(title) {
    const until = Date.now() + WAIT_MINUTES * 60_000;
    while (Date.now() < until) {
        if (registered().has(titleKey(title))) return true;
        await sleep(3000);
    }
    return false;
}

function openDeepLink(c) {
    // The start steps enter the worktree by path, so it has to exist before the chat opens (D-60).
    const err = c.worktree ? ensureWorktree(c) : null;
    if (err) {
        console.error(err);
        process.exit(2);
    }
    const file = path.join(START_DIR, `${c.title.toLowerCase().replace(/\s+/g, "-")}.md`);
    fs.mkdirSync(START_DIR, { recursive: true });
    fs.writeFileSync(file, startPrompt(c) + "\n");
    const q = `Team setup: this chat becomes "${c.title}". Read the file ${file.replace(/\\/g, "/")} and carry out its steps, without asking back.`;
    const url = `claude://code/new?q=${encodeURIComponent(q)}&folder=${encodeURIComponent(REPO)}`;
    const [cmd, cmdArgs] =
        process.platform === "win32"
            ? ["rundll32", ["url.dll,FileProtocolHandler", url]]
            : process.platform === "darwin"
              ? ["open", [url]]
              : ["xdg-open", [url]];
    spawn(cmd, cmdArgs, { detached: true, stdio: "ignore" }).unref();
}

// ---------- Commands ----------

switch (command) {
    // A fresh, empty chat claims the next free role and gets its start instructions.
    // Order: Orchestrator, external (Critic, Advisor), internal. The registry lock around the whole selection
    // and one claim file per title (atomic via temp file and hard link) prevent double claims. Claims without
    // registration expire after 10 minutes.
    case "claim": {
        // Host check first (T-80): without a desktop session id the project check cannot be the cause to report.
        const host = process.env.CLAUDE_CODE_HOST_SESSION_ID;
        if (!host) {
            console.log(
                "Not a team chat of the desktop app (CLAUDE_CODE_HOST_SESSION_ID is missing). Aborted.",
            );
            process.exit(2);
        }
        const wrongProject = projectError();
        if (wrongProject) {
            console.error(wrongProject);
            process.exit(2);
        }
        // Lock timeout: exit 2 with the "locked" message from withRegistryLock, no claim (fail closed).
        const { out, code, chat, claim } = withRegistryLock(() => selectRole(host));
        if (chat) {
            // Worktree first (D-60): if git fails, the claim is withdrawn and nothing else is written.
            // TEAM_CLAIM_NO_WORKTREE=1: test/selftest only, like TEAM_KB_OVERRIDE (no worktree in the real project).
            const skip = process.env.TEAM_CLAIM_NO_WORKTREE === "1";
            const err = chat.worktree && !skip ? ensureWorktree(chat) : null;
            if (err) {
                fs.rmSync(claim, { force: true });
                console.error(`${err} No role was claimed.`);
                process.exit(2);
            }
            ensureWorkState(chat);
        }
        // Dev pool only after a successful selection: if claim fails, everything stays untouched (D-77).
        if (!code) ensurePool();
        if (chat) {
            console.log(startPrompt(chat));
            break;
        }
        console.log(out);
        if (code) process.exit(code);
        break;
    }

    case "plan": {
        abortIfRegistryBroken();
        ensurePool();
        const list = missing({ intern: flags.has("--intern"), withMain: false });
        console.log(
            JSON.stringify(
                list.map((c) => ({
                    title: c.title,
                    role: c.role,
                    models: c.models_order,
                    effort: c.effort,
                    external: c.external,
                })),
                null,
                2,
            ),
        );
        break;
    }

    case "deeplink": {
        abortIfRegistryBroken();
        ensurePool();
        const list = missing({ intern: flags.has("--intern") });
        if (!list.length) {
            console.log("All wanted role chats are already registered.");
            break;
        }
        if (flags.has("--print")) {
            for (const c of list) console.log(`\n--- ${c.title} ---\n${startPrompt(c)}`);
            break;
        }
        // The app keeps only one open, unsent input field: open chats one after the other.
        console.log(
            `Opening ${list.length} chat(s) one after the other: ${list.map((c) => c.title).join(", ")}`,
        );
        for (const [i, c] of list.entries()) {
            console.log(
                `\n[${i + 1}/${list.length}] ${c.title}: confirm the folder and send the message …`,
            );
            openDeepLink(c);
            if (!(await waitFor(c.title))) {
                console.log("No registration, aborted. Start again later.");
                process.exit(1);
            }
        }
        console.log("All chats are set up.");
        break;
    }

    default:
        console.log("Commands: claim | plan [--intern] | deeplink [--intern] [--print]");
        process.exit(command ? 2 : 0);
}

// Write guard for the user's global configuration (~/.claude, %APPDATA%). No side effects on import
// (only node:fs, node:os, node:path; reads no team configuration, installs no process handlers),
// so that policy.mjs can check ordinary write calls before lib.mjs loads team.config.json and roles.json.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const WRITE_TOOLS = ["Write", "Edit", "NotebookEdit", "Bash", "PowerShell"];
const WIN = process.platform === "win32";

// Fail closed: Claude Code treats exit 2 as a block.
export function fail(message) {
    process.stderr.write(`Team hook: ${message}
`);
    process.exit(2);
}

export function deny(reason) {
    process.stdout.write(
        JSON.stringify({
            hookSpecificOutput: {
                hookEventName: "PreToolUse",
                permissionDecision: "deny",
                permissionDecisionReason: reason,
            },
        }),
    );
    process.exit(0);
}

// Strict hook input: unreadable or empty input and anything but a JSON object blocks (fail).
export function readHookInput() {
    let input;
    try {
        input = JSON.parse(fs.readFileSync(0, "utf8") || "");
    } catch (e) {
        fail(`The hook input on stdin is not readable or not valid JSON (${e.message}).`);
    }
    if (input === null || typeof input !== "object" || Array.isArray(input))
        fail("The hook input on stdin is not a JSON object.");
    return input;
}

// Roots of the user's global configuration: <home>/.claude and (if set) %APPDATA%.
// Absolute and normalized (path.resolve). os.homedir() follows HOME or USERPROFILE, tests can redirect it.
export function userConfigRoots() {
    const roots = [path.resolve(os.homedir(), ".claude")];
    if (process.env.APPDATA) roots.push(path.resolve(process.env.APPDATA));
    return roots;
}

// Work data of the harness in <home>/.claude, not configuration (D-79): projects/<one segment>/memory/** and plans/**.
// Applies only to <home>/.claude, not to %APPDATA%. The path is already normalized (path.resolve, norm).
function isWorkData(target) {
    const claude = norm(path.resolve(os.homedir(), ".claude"));
    if (!target.startsWith(claude + "/")) return false;
    return /^(projects\/[^/]+\/memory|plans)(\/|$)/.test(target.slice(claude.length + 1));
}

// Resolve a path (already with forward slashes) and make it comparable; resolves "..".
function resolved(p, cwd) {
    return norm(path.resolve(cwd || process.cwd(), fromMsys(p)));
}

// Make a path comparable: forward slashes, no trailing slash, case-insensitive on Windows.
function norm(p) {
    const n = p.replace(/\\/g, "/").replace(/\/+$/, "");
    return WIN ? n.toLowerCase() : n;
}

// Git Bash spelling /c/Users/… is C:/Users/… on Windows
function fromMsys(p) {
    return WIN ? p.replace(/^\/([a-zA-Z])(?=\/|$)/, "$1:") : p;
}

// Reason (text) or null: does this tool call write into the user's global configuration?
export function userConfigWrite(tool, args, cwd) {
    if (!WRITE_TOOLS.includes(tool)) return null;
    const roots = userConfigRoots();
    if (tool === "Bash" || tool === "PowerShell") return shellConfigWrite(args?.command, roots);
    const file = tool === "NotebookEdit" ? args?.notebook_path : args?.file_path;
    if (typeof file !== "string" || !file) return null;
    const expanded = /^~(?=[/\\]|$)/.test(file) ? os.homedir() + file.slice(1) : file;
    const target = resolved(expanded, cwd); // resolves "..", only then root and exception count
    const hit =
        roots.map(norm).some((r) => target === r || target.startsWith(r + "/")) &&
        !isWorkData(target);
    return hit ? `writing to ${file}` : null;
}

// Heuristic for shell commands, deliberately without a full parser. It detects targets in the config roots of:
// redirection (> >> 1> 2>), tee, cp, mv, Copy-Item, Move-Item, Set-Content,
// Add-Content, Out-File, New-Item (plus mkdir, touch); deleting with rm, del, erase, rmdir, rd, unlink, Remove-Item, ri
// (every argument, also -Path:<target>); sed -i, -i<suffix>, --in-place (every argument; a script that names a config
// root is denied too, a safe false positive; sed without -i only reads). Targets and arguments are read as shell words:
// adjacent quoted and unquoted parts form one word ("$HOME/.claude/plans"/../x), quotes are removed afterwards and ".."
// is resolved before the exception check (F-81-1).
// Spellings of the roots: ~, $HOME, ${HOME}, $env:USERPROFILE, $env:APPDATA, %APPDATA%, %USERPROFILE%, absolute
// (both slashes, case-insensitive on Windows, also /c/Users/…). Reading (cat, Get-Content, ls) stays allowed.
// Exceptions (D-79): projects/<project>/memory/** and plans/** in <Home>/.claude, checked on the resolved path
// (~/.claude/plans/../settings.json stays denied).
// Limits: paths in own variables, cd + relative path, scripts (python -c, node -e), xargs, symlinks/junctions,
// 8.3 short names, program with path (/usr/bin/cp), ; | & inside strings.
function shellConfigWrite(command, roots) {
    if (typeof command !== "string" || !command) return null;
    const home = os.homedir();
    const sub = [
        [/(^|[\s"'=:(>|])~(?=[/\\]|$|[\s"';|&)])/g, (m, pre) => pre + home],
        [/\$\{?(?:env:)?(?:HOME|USERPROFILE)\}?|%USERPROFILE%/gi, () => home],
    ];
    if (process.env.APPDATA)
        sub.push([/\$\{?(?:env:)?APPDATA\}?|%APPDATA%/gi, () => process.env.APPDATA]);
    let text = command.replace(/\r/g, "");
    for (const [re, to] of sub) text = text.replace(re, to);
    text = norm(text);
    // Shell word: quoted parts ("…", '…', unterminated up to the end) and unquoted characters without a gap.
    const WORD = `(?:"[^"]*"?|'[^']*'?|[^\\s"'<>;|&])+`;
    const unquote = (w) => w.replace(/"([^"]*)"?|'([^']*)'?/g, (m, d, q) => d ?? q);
    const forms = roots.map(norm).flatMap((r) => [r, WIN ? r.replace(/^([a-z]):/, "/$1") : r]);
    const alt = [...new Set(forms)].map((r) => r.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    const ROOT = `(?:${alt})(?![\\w.-])`;
    const isRoot = (t) => new RegExp(ROOT).test(t);
    if (!isRoot(text.replace(/["']/g, ""))) return null; // fast exit: no config path in the command

    // Does the word hit the config roots and, resolved, lie outside an exception (memory, plans)?
    const hits = (t) => {
        const m = new RegExp(ROOT).exec(t);
        if (!m) return false;
        return !isWorkData(resolved(t.slice(m.index).replace(/[;|&)"']+$/, "")));
    };

    // The target is one shell word (T-81, F-81-1): quoted parts may contain spaces, adjacent parts belong to it.
    for (const redirect of text.matchAll(new RegExp(`>\\|?\\s*(${WORD})`, "g"))) {
        if (hits(unquote(redirect[1]))) return `redirection "${redirect[0]}"`;
    }

    const WRITE_ALL = /^(tee|set-content|add-content|out-file|new-item|mkdir|md|touch|ni|sc|ac)$/;
    const WRITE_DEST = /^(cp|copy|copy-item|cpi|mv|move|move-item|mi)$/;
    const DELETE = /^(rm|del|erase|rmdir|rd|unlink|remove-item|ri)$/;
    // sed edits in place with -i, -i<suffix>, a short option group containing i (-ni) or --in-place[=<suffix>].
    const inPlace = (a) => /^-[a-z]*i/i.test(a) || /^--in-place(=|$)/.test(a);
    for (const segment of text.split(/[;|&\n]+/)) {
        const tokens = (segment.match(new RegExp(WORD, "g")) ?? []).map(unquote);
        // program = first word of the sub-command (after sudo, call operator or opening bracket)
        while (tokens.length && /^(sudo|command|\{|\(|\.)$/.test(tokens[0])) tokens.shift();
        if (tokens.length) tokens[0] = tokens[0].replace(/^[{(]+/, "");
        const verb = (tokens[0] ?? "").toLowerCase();
        const rest = tokens.slice(1);
        if (WRITE_ALL.test(verb)) {
            const t = rest.find(hits);
            if (t) return `${tokens[0]} ${t}`;
        } else if (DELETE.test(verb) || (verb === "sed" && rest.some(inPlace))) {
            // Every argument counts (T-79); hits finds the root mid-word, so -Path:<target> counts with its value
            // (F-79-1). A sed script that names a config root is denied too (safe false positive).
            const t = rest.find(hits);
            if (t) return `${tokens[0]} ${t}`;
        } else if (WRITE_DEST.test(verb)) {
            // Target: last positional argument, -t/--target-directory/-Destination. For mv/Move-Item the source counts too (it disappears).
            const positional = rest.filter((t) => !/^-/.test(t));
            const named = rest.findIndex((t) =>
                /^(-t|--target-directory|-destination|-dest)$/i.test(t),
            );
            const dest = named >= 0 ? rest[named + 1] : positional.at(-1);
            const moves = /^(mv|move|move-item|mi)$/.test(verb);
            const t = hits(dest ?? "") ? dest : moves ? positional.find(hits) : null;
            if (t) return `${tokens[0]} … ${t}`;
        }
    }
    return null;
}

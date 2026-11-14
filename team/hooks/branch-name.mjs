// Branch naming convention (standard 1.5.0, D-60). The only definition of the allowed names: the PreToolUse
// hook (policy.mjs) and `agent-team check-branch` both use checkBranchName.
//
// No imports with side effects: like ids-shared.mjs this module must not import hooks/lib.mjs, so policy.mjs can
// check Bash calls before lib.mjs loads the team config.
//
//   main                     the only main line
//   kb                       knowledge base repo
//   task/<task-id>-<slug>    one task (T-57, V-0.4.0-A), integration branch of the implementer
//   dev/<part-id>-<slug>     one part of a dev or subagent (D-57-1, D-16F-1, D-V040-A4, D-T-127)
//   release/<x.y.z>          release preparation
//   patch/<x.y>              maintenance line of a published minor
//   wt/<role>                resting branch of a role worktree (wt/implementer, wt/dev-1)
//   release/0.1.x, release/0.2.x   old history, kept as they are (legacy)
// Slug: lowercase a-z, 0-9 and "-", at most 40 characters, names the goal.

import { classifyId } from "./ids-shared.mjs";

export const SLUG_MAX = 40;

export const BRANCH_HINT =
    "Branch names follow the branch convention (docs/standards, D-60): main, kb, task/<task-id>-<slug>, " +
    "dev/<part-id>-<slug>, release/<x.y.z>, patch/<x.y>, wt/<role>. " +
    `Slug: lowercase a-z, 0-9 and "-", at most ${SLUG_MAX} characters. Example: task/T-57-branch-convention.`;

// Tool and old prefixes that are never allowed (D-60). A subagent renames its automatic worktree-agent-<hash>
// branch at once; the harness creates that branch itself, so no hook ever sees its creation.
export const FORBIDDEN_PREFIXES = ["codex/", "claude/", "feature/", "int/", "worktree-"];

const SLUG_SEGMENT = /^[a-z0-9]+$/;
const TASK_KINDS = new Set(["T", "T-F", "V"]);
const DEV_KINDS = new Set(["D", "D-T", "D-V"]);

// "<id>-<slug>" → null when some split gives a valid ID of the wanted kinds and a valid slug, else the reason.
function idAndSlug(rest, kinds, what) {
    const parts = rest.split("-");
    let reason = `"${rest}" is not <${what}>-<slug>`;
    for (let k = parts.length - 1; k >= 1; k--) {
        const info = classifyId(parts.slice(0, k).join("-"));
        if (!info || !kinds.has(info.kind)) continue;
        if (info.kind === "D" && !info.linked) continue; // D-12 is a decision, not a dev part
        const slugParts = parts.slice(k);
        const slug = slugParts.join("-");
        if (!slugParts.every((s) => SLUG_SEGMENT.test(s)))
            reason = `slug "${slug}" may contain only lowercase a-z, 0-9 and "-"`;
        else if (slug.length > SLUG_MAX)
            reason = `slug "${slug}" has ${slug.length} characters, at most ${SLUG_MAX} are allowed`;
        else return null;
    }
    return reason;
}

// null when the name follows the convention, else a one-line reason (without BRANCH_HINT).
export function checkBranchName(name) {
    if (typeof name !== "string" || !name) return "empty branch name";
    if (name === "main" || name === "kb") return null;
    const forbidden = FORBIDDEN_PREFIXES.find((p) => name.startsWith(p));
    if (forbidden) return `the prefix "${forbidden}" is not allowed`;
    if (/^release\/0\.[12]\.x$/.test(name)) return null; // legacy history (D-60)
    if (/^release\/\d+\.\d+\.\d+$/.test(name)) return null;
    if (/^patch\/\d+\.\d+$/.test(name)) return null;
    if (/^wt\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) return null;
    if (name.startsWith("task/")) return idAndSlug(name.slice(5), TASK_KINDS, "task-id");
    if (name.startsWith("dev/")) return idAndSlug(name.slice(4), DEV_KINDS, "part-id");
    return `"${name}" matches none of the allowed forms`;
}

// Splits a shell command into simple commands (at ; & && | || and line breaks), each a list of shell words.
// Like user-config.mjs a word joins adjacent quoted and unquoted parts ("task/"T-1-x is task/T-1-x), quotes are
// removed; an unterminated quote runs to the end. Separators inside quotes do not split. The word after a
// redirection (> >> < 2>) is dropped. No full shell parser: no escapes, variables, subshells or bash -c "…".
function simpleCommands(command) {
    const commands = [];
    let words = [];
    let word = null; // null = no word started (an empty "" still starts one)
    let skipNext = false;
    const endWord = () => {
        if (word !== null && !skipNext) words.push(word);
        else if (word !== null) skipNext = false;
        word = null;
    };
    const endCommand = () => {
        endWord();
        if (words.length) commands.push(words);
        words = [];
        skipNext = false;
    };
    for (let i = 0; i < command.length; i++) {
        const c = command[i];
        if (c === '"' || c === "'") {
            const close = command.indexOf(c, i + 1);
            const end = close < 0 ? command.length : close;
            word = (word ?? "") + command.slice(i + 1, end);
            i = end;
        } else if (/\s/.test(c) && c !== "\n") endWord();
        else if (c === "\n" || c === ";" || c === "&" || c === "|") endCommand();
        else if (c === ">" || c === "<") {
            if (/^\d$/.test(word ?? "")) word = null; // 2> : the digit belongs to the redirection
            endWord();
            // >&2, 2>&1: a file descriptor, not a command separator and no word
            if (command[i + 1] === "&") for (i++; /\d|-/.test(command[i + 1] ?? ""); i++);
            else skipNext = true;
        } else word = (word ?? "") + c;
    }
    endCommand();
    return commands;
}

// git global options that take the next word as value (git -C <dir>, git -c <key=value> …).
const GIT_VALUED = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path"]);
// git branch options that list, delete or change something else: such a call creates no branch.
const BRANCH_OTHER =
    /^(-[dDarlvu]+|--(delete|all|remotes|list|verbose|show-current|contains|no-contains|merged|no-merged|points-at|sort|format|column|no-column|set-upstream-to|unset-upstream|edit-description|abbrev|no-abbrev|omit-empty|ignore-case)(=.*)?|-vv)$/;
// git branch options whose value is the next word (in a listing or upstream call).
const BRANCH_VALUED = new Set([
    "-u",
    "--set-upstream-to",
    "--contains",
    "--no-contains",
    "--merged",
    "--no-merged",
    "--points-at",
    "--sort",
    "--format",
]);

// Value of a short option with the value attached or in the next word (-b name, -bname). null = not this option.
function shortValue(args, i, letters) {
    const a = args[i];
    const m = /^-([A-Za-z])(.*)$/.exec(a);
    if (!m || !letters.includes(m[1])) return null;
    return m[2] ? { name: m[2], next: i } : { name: args[i + 1], next: i + 1 };
}

// Value of a long option (--create name, --create=name). null = not this option.
function longValue(args, i, names) {
    const a = args[i];
    const eq = a.indexOf("=");
    const key = eq < 0 ? a : a.slice(0, eq);
    if (!names.includes(key)) return null;
    return eq < 0 ? { name: args[i + 1], next: i + 1 } : { name: a.slice(eq + 1), next: i };
}

// Names after the given short and long options, up to "--".
function optionTargets(args, letters, longs) {
    const names = [];
    for (let i = 0; i < args.length; i++) {
        if (args[i] === "--") break;
        const hit = shortValue(args, i, letters) ?? longValue(args, i, longs);
        if (!hit) continue;
        if (hit.name !== undefined) names.push(hit.name);
        i = hit.next;
    }
    return names;
}

// git branch: create (<name> [<start>]), rename or copy (-m|-M|--move|-c|-C|--copy [<old>] <new>); else nothing.
function branchCommandTargets(args) {
    let move = false;
    const positional = [];
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a === "--") {
            positional.push(...args.slice(i + 1));
            break;
        }
        if (/^-[mMcC]$|^--(move|copy)$/.test(a)) move = true;
        else if (BRANCH_VALUED.has(a)) return [];
        else if (BRANCH_OTHER.test(a)) return [];
        else if (a === "-t" || a === "--track" || /^--track=/.test(a)) continue;
        else if (!a.startsWith("-")) positional.push(a);
    }
    if (move) return positional.length ? [positional.at(-1)] : [];
    return positional.length ? [positional[0]] : [];
}

// Branch names a shell command creates or renames to, in order of appearance (used by policy.mjs):
// git checkout -b|-B|--orphan <name>, git switch -c|-C|--create|--force-create|--orphan <name> (also --create=<name>),
// git branch <name> [<start>], git branch -m|-M|--move|-c|-C|--copy [<old>] <new>,
// git worktree add -b|-B <name> <path>; also behind git -C <dir> / git -c k=v and in ; && || | chains.
// Listing, deleting and other forms of git branch, and git checkout <existing>, create nothing and return no name.
// Subagent exception (D-57-1): the harness creates worktree-agent-<hash> itself, outside any tool call, so no hook
// sees it. Every worktree-… name created through the shell is checked like any other name (and denied);
// git branch -m worktree-agent-<hash> <new> returns only <new>, so the immediate rename to a conformant name passes.
// Limits: names in variables, git aliases, bash -c "…" / pwsh -Command "…", scripts that call git.
export function branchTargets(command) {
    if (typeof command !== "string" || !command) return [];
    const names = [];
    for (const words of simpleCommands(command.replace(/\r/g, ""))) {
        let i = 0;
        // Program: first word after sudo/command/env assignments/call operators and opening brackets.
        while (i < words.length && /^(sudo|command|env|\.|\{|\(+|\w+=.*)$/.test(words[i])) i++;
        if (i >= words.length) continue;
        const program = words[i].replace(/^[({]+/, "");
        if (!/^git(\.exe)?$/i.test(program.split(/[\\/]/).pop())) continue;
        i++;
        while (i < words.length && words[i].startsWith("-")) {
            if (GIT_VALUED.has(words[i])) i++;
            i++;
        }
        const sub = words[i];
        const args = words.slice(i + 1);
        if (sub === "checkout") names.push(...optionTargets(args, ["b", "B"], ["--orphan"]));
        else if (sub === "switch")
            names.push(
                ...optionTargets(args, ["c", "C"], ["--create", "--force-create", "--orphan"]),
            );
        else if (sub === "branch") names.push(...branchCommandTargets(args));
        else if (sub === "worktree" && args[0] === "add")
            names.push(...optionTargets(args.slice(1), ["b", "B"], []));
    }
    return names.filter((n) => typeof n === "string" && n !== "");
}

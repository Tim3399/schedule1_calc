// PreToolUse hook ("gatekeeper") for the app's chat management and for starting subagents.
//
// Rights matrix: see AGENTS.md, section 'Chat permissions'. In addition the code does this:
//   - Fast mode is blocked like delete, permission mode and cloud move (settings deny list);
//     every other management tool not handled below is denied for team chats.
//   - Remote Control (T-138, D-138): every chat may turn it on for itself and for chats it may manage, never off.
//   - Team chats do not manage routines (mcp__scheduled-tasks__*).
//   - Clearing checks the work state (checkWorkState) and the context size (T-145: only a compaction since the last
//     clear allows it, see context.mjs), archiving checks the dev pool (busy slots stay). This hook only checks:
//     session-start.mjs writes the clear entry once the clear has happened (F-145-1), so a rejected clear can retry.
// Branch names (D-60, D-57-1): Bash and PowerShell calls that create or rename a branch (branchTargets in
// branch-name.mjs) are denied when a name breaks the branch convention (checkBranchName). Like the user config check
// this runs before lib.mjs is loaded, so it works with a broken team config.
//
// Only "deny" is printed. Allowed calls pass on silently to the normal permission check
// (which holds the matching allow rules).

import fs from "node:fs";
import path from "node:path";
import { BRANCH_HINT, branchTargets, checkBranchName } from "./branch-name.mjs";
import { WRITE_TOOLS, deny, fail, readHookInput, userConfigWrite } from "./user-config.mjs";
import { idPart, normalizeStatus, readFieldValues, readWorkState } from "./work-state.mjs";
import { POOL_LIMITS } from "./pools.mjs";
import { contextState } from "./context.mjs";

// Write calls are checked only by the user config guard. It needs neither team.config.json nor roles.json:
// a broken team config must not block Bash/Edit/Write (otherwise no chat could repair it). lib.mjs (loads
// both files and stops with exit 2 on errors) is therefore loaded only for all other tools.
// Every unexpected error blocks (exit 2) instead of letting the call pass silently.
// Dev pool status values: busy, free, broken. Pools written before 0.4.0 use belegt, frei, defekt (F-69-5).
// Only a busy slot blocks archiving; free and broken slots may be archived.
const POOL_BUSY = ["busy", "belegt"];
// T-153: deny text for the Orchestrator's own clear_session
const ORCHESTRATOR_NO_CLEAR =
    "The Orchestrator never clears itself (T-153): enter the new assignment as `Assignment:` and keep working; compaction is the app's job.";

let input, lib;
try {
    input = readHookInput();
    const tool = input.tool_name ?? "";
    const configWrite = userConfigWrite(tool, input.tool_input ?? {}, input.cwd);
    if (configWrite) {
        deny(
            `The user's global configuration is off limits (AGENTS.md): ${configWrite}. Write only into the project, e.g. into the repo's .claude/.`,
        );
    }
    // Branch convention: the first name that breaks it is denied. worktree-agent-<hash> of a subagent is created by
    // the harness outside any tool call; created through the shell, a worktree-… name is denied like every other
    // non-conformant name, the rename git branch -m <old> <conformant name> passes (see branchTargets).
    if (tool === "Bash" || tool === "PowerShell") {
        for (const name of branchTargets(input.tool_input?.command)) {
            const reason = checkBranchName(name);
            if (reason) deny(`Branch "${name}" is not allowed: ${reason}. ${BRANCH_HINT}`);
        }
    }
    if (WRITE_TOOLS.includes(tool)) process.exit(0);
    lib = await import("./lib.mjs");
} catch (e) {
    fail(`policy.mjs aborted: ${e?.stack ?? e}`);
}
const {
    hostId,
    readRegistry,
    roleForTitle,
    holderOf,
    titleKey,
    entryKey,
    chatOf,
    roles,
    workStatePath,
    taskFamily,
    KB,
    REGISTRY,
} = lib;

try {
    main();
} catch (e) {
    fail(`policy.mjs aborted: ${e?.stack ?? e}`);
}

function main() {
    const tool = input.tool_name ?? "";
    const args = input.tool_input ?? {};

    const id = hostId();
    const { reg, missing, broken } = readRegistry();
    const caller = id ? reg[id] : null;
    const callerRole = caller?.role ?? null;

    const READ_ONLY = [
        "list_sessions",
        "get_session",
        "list_events",
        "search_session_transcripts",
        "send_message",
    ];
    // A chat setting itself up (team setup) stays possible without a readable registry.
    // Clearing is not part of it: without a registry the role is unknown, so clear_session blocks (see below).
    const SELF_SETUP = ["set_session_title", "set_session_output_style"];

    // ---------- Subagents ----------
    if (tool === "Agent") {
        const allowed = callerRole ? (chatOf(callerRole)?.subagents ?? []) : [];
        if (callerRole && allowed.length) {
            const type = (args.subagent_type || "general-purpose").toLowerCase();
            if (!allowed.some((a) => a.toLowerCase() === type)) {
                deny(
                    `The role ${callerRole} may start only these subagents: ${allowed.join(", ")}. Requested was "${type}".`,
                );
            }
        }
        process.exit(0);
    }

    // ---------- Routines ----------
    // Team chats do not manage routines. Chats without a role are left alone.
    if (tool.startsWith("mcp__scheduled-tasks__")) {
        if (callerRole) deny("Routines are not meant for team chats.");
        process.exit(0);
    }

    // ---------- Chat management ----------
    // Everything outside chat management (e.g. ListAgents, SendMessage) passes the gatekeeper.
    if (!tool.startsWith("mcp__ccd_session_mgmt__")) process.exit(0);
    const action = tool.replace(/^mcp__ccd_session_mgmt__/, "");
    if (READ_ONLY.includes(action)) process.exit(0);

    const self = args.session_id === "self" || (id && args.session_id === id);

    if (action === "set_remote_control" && args.enabled !== true)
        deny("Only the user turns Remote Control off. Agents may only turn it on (enabled: true).");

    // Without a readable registry roles are unknown: self setup allowed, managing other chats blocked.
    if (missing || broken) {
        // With a broken registry holderOf sees nobody: a taken role title would be given out twice.
        if (broken && self && action === "set_session_title") {
            fail(
                `Rename blocked: the team registry ${REGISTRY} is broken (${broken}), taken titles cannot be checked. The user must repair it.`,
            );
        }
        if (self && (SELF_SETUP.includes(action) || action === "set_remote_control"))
            process.exit(0);
        if (self && action === "clear_session") {
            fail(
                `Clear blocked: the team registry ${REGISTRY} ${broken ? `is broken (${broken})` : "is missing"}, the role of this chat is unknown.`,
            );
        }
        deny(
            broken
                ? `The team registry ${REGISTRY} is broken (${broken}). Managing other chats is blocked until the user repairs it.`
                : `The team registry ${REGISTRY} is missing. Managing other chats is blocked until the chats have registered.`,
        );
    }
    const targetId = self ? id : args.session_id;
    const target = targetId ? reg[targetId] : null;
    const targetChat = target?.role ? chatOf(target.role) : null;
    const internal = targetChat && !targetChat.external && !targetChat.main;

    // May the caller manage this other chat?
    // Only exception for external chats: during team setup the Orchestrator may set exactly the planned model and effort.
    function mayManage() {
        if (!target?.role)
            return `The target chat is not registered with a role in the team registry.`;
        if (targetChat.external) {
            const setup =
                callerRole === "orchestrator" &&
                ((action === "set_session_model" &&
                    (targetChat.models_order ?? [targetChat.model]).includes(args.model)) ||
                    (action === "set_session_effort" && args.effort === targetChat.effort));
            if (!setup)
                return `"${target.title}" is external. Only the user changes external chats (${externalTitles()}). Exception: model and effort from team/roles.json, set by the Orchestrator during team setup.`;
            return null;
        }
        if (callerRole === "orchestrator" && internal) return null;
        if (callerRole === "implementer" && target.role === "dev") return null;
        return `The role ${callerRole ?? "(none)"} may not manage "${target.title}".`;
    }

    switch (action) {
        case "clear_session":
            if (!self) deny('Chats clear only themselves (session_id "self").');
            // T-153: the Orchestrator is the only chat with the whole course of the project; it never clears itself.
            if (callerRole === "orchestrator") deny(ORCHESTRATOR_NO_CLEAR);
            // The rule applies to team chats. A chat without a role (no team chat) still clears itself freely.
            if (callerRole) {
                checkWorkState(caller);
                checkContext(id);
            }
            break;

        case "set_session_title": {
            if (!self) deny("Chats rename only themselves.");
            const wanted = roleForTitle(args.title);
            // T-155: "Dev 3" and "Dev 3 - <project>" are the same role title (titleKey); a chat that kept its role
            // under a former project's suffix compares with its role title (entryKey, F-155-4)
            if (callerRole && (!wanted || titleKey(wanted.title) !== entryKey(caller))) {
                deny(`This chat is "${caller.title}" and keeps its role title.`);
            }
            if (wanted) {
                // A chat without a role may take a free role title (team setup through the user's start message).
                // A chat that already has a role keeps it (see above). Duplicate titles are never allowed.
                const holder = holderOf(wanted.title, id);
                if (holder)
                    deny(
                        `The title "${wanted.title}" is already taken by another chat (${holder}).`,
                    );
            }
            break;
        }

        case "set_session_output_style": {
            const roleStyle = targetChat?.style;
            if (self) {
                if (callerRole && args.style !== chatOf(callerRole).style)
                    deny(`The role ${callerRole} uses the style "${chatOf(callerRole).style}".`);
                if (!callerRole && roles.chats.some((c) => c.style === args.style))
                    deny("A role style fits only a chat with a role title. Rename first.");
                break;
            }
            const why = mayManage();
            if (why) deny(why);
            if (args.style !== roleStyle)
                deny(
                    `"${target.title}" belongs to the role ${target.role} and gets only the style "${roleStyle}".`,
                );
            break;
        }

        case "set_session_model":
        case "set_session_effort":
        case "stop_session": {
            if (self) break; // the app refuses this for its own session anyway
            const why = mayManage();
            if (why) deny(why);
            if (action === "set_session_model") {
                const allowedModels = targetChat.models ?? [];
                if (
                    allowedModels.length &&
                    !allowedModels.some((m) =>
                        String(args.model).toLowerCase().includes(m.toLowerCase()),
                    )
                ) {
                    deny(
                        `Only these models are planned for the role ${target.role}: ${allowedModels.join(", ")}.`,
                    );
                }
            }
            break;
        }

        case "set_remote_control": {
            if (self) break;
            const why = mayManage();
            if (why) deny(why);
            break;
        }

        case "archive_session": {
            if (self) deny("A chat does not archive itself.");
            if (callerRole !== "implementer" || target?.role !== "dev")
                deny("Only the Implementer archives, and only dev chats.");
            const pool = readPool();
            const slot = pool?.slots?.find(
                (s) => s.title && titleKey(s.title) === entryKey(target),
            );
            if (POOL_BUSY.includes(String(slot?.status ?? "").toLowerCase()))
                deny(
                    `"${target.title}" is listed as busy in the dev pool. Finish the work and free the slot first.`,
                );
            break;
        }

        default:
            deny(`The tool ${action} is not meant for team chats.`);
    }
    process.exit(0);
}

// A team chat clears itself only when its work state is free and already names the next assignment,
// that assignment belongs to another task family than "Assignment:", and the family of "Assignment:" is
// listed as "Completed:". Without an "Assignment:" with a recognizable ID (first assignment) the last two
// conditions do not apply. Otherwise exit 2 with what is missing. When in doubt the hook blocks; a stuck
// chat goes through the user.
// English and German keys are read (work-state.mjs); the English value wins. Messages are English (T-61).
function checkWorkState(entry) {
    const file = workStatePath(entry);
    let text;
    try {
        text = fs.readFileSync(file, "utf8");
    } catch (e) {
        fail(`Clear blocked: no readable work state at ${file} (${e.message}).`);
    }
    const fields = readWorkState(text);
    // Only the own line of an assignment field carries its ID (a following block is no ID source).
    const firstLine = (name) => fields[name]?.value.split("\n")[0];
    const missing = [];
    if (normalizeStatus(fields.Status?.value) !== "free") missing.push('"Status: free"');
    const next = idPart(firstLine("New assignment"));
    const nextFamily = taskFamily(next);
    if (!nextFamily)
        missing.push(
            'a line "New assignment:" with an assignment ID (e.g. T-12, Review T-16 round 1, V-0.3.0)',
        );
    if (missing.length)
        fail(`Clear blocked: the work state ${file} is missing ${missing.join(" and ")}.`);

    const family = taskFamily(idPart(firstLine("Assignment")));
    if (!family) return; // no current assignment ("–", "none", empty, no line): like the first assignment
    if (family === nextFamily) {
        fail(
            `Clear blocked: "New assignment: ${next}" belongs to the same task family ${family} as "Assignment:". Enter it as the new "Assignment:" and keep working without clearing.`,
        );
    }
    // "Completed:" is a single-line field: only the rest of each "Completed:" line counts.
    const done = readFieldValues(text, "Completed").map(taskFamily);
    if (!done.includes(family)) {
        fail(
            `Clear blocked: the work state ${file} is missing "Completed: ${family}". Without the sender's completion notice the context of ${family} is kept.`,
        );
    }
}

// T-145: a chat with a small context (no compaction since its last clear) gains nothing from clearing and starts the
// new assignment at once. Only a check: the clear entry is written by session-start.mjs when the clear has happened
// (F-145-1), so a clear the app rejects or the user declines leaves the context large and the retry is allowed.
function checkContext(id) {
    const state = contextState(KB, id);
    if (!state.large) {
        fail(
            `Clear blocked: Context is small (compaction ${state.compactedAt ?? "none"}, last clear ${state.clearedAt ?? "never"}). Do not clear: enter the new assignment as "Assignment:", set "Status: working", delete "New assignment:", "New assignment (verbatim):" and "Completed:", and start at once without READY/START.`,
        );
    }
}

// Base titles of the external chats for messages, "…" marks a role with a pool: "Critic…, Advisor".
function externalTitles() {
    return roles.chats
        .filter((c) => c.external)
        .sort((a, b) => Number(!POOL_LIMITS[a.role]) - Number(!POOL_LIMITS[b.role]))
        .map((c) => (POOL_LIMITS[c.role] ? `${c.title}…` : c.title))
        .join(", ");
}

function readPool() {
    try {
        return JSON.parse(fs.readFileSync(path.join(KB, "implementer", "dev-pool.json"), "utf8"));
    } catch {
        return null;
    }
}

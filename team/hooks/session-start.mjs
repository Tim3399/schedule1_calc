// SessionStart hook (startup, resume, clear, compact, fork):
// registers the chat in the registry and tells it which role it has and where its work state is.
// After clear and compact this is the anchor that restores the role.

import {
    readInput,
    hostId,
    registerTitle,
    readRegistry,
    backupBrokenRegistry,
    holderOf,
    workStatePath,
    chatOf,
    kbLine,
    KB,
    KB_SOURCE,
    REGISTRY,
} from "./lib.mjs";
import { LANGUAGE_RULE } from "../sync-rules.mjs";

const input = readInput();
const id = hostId();
const source = input.source ?? "startup";

let entry = null;
const { reg, broken } = readRegistry();
if (broken) {
    // Do not overwrite, only back up. Message on stderr and in the context below.
    process.stderr.write(
        `Team hook: ${REGISTRY} is broken (${broken}) and stays unchanged.${id ? ` Chat ${id} was not registered.` : ""}\n`,
    );
    backupBrokenRegistry();
} else if (id) {
    const known = reg[id];
    entry = registerTitle(id, input.session_title ?? known?.title ?? null, {
        sessionId: input.session_id ?? null,
        cwd: input.cwd ?? null,
    });
}

const lines = [kbLine({ path: KB, source: KB_SOURCE })];
if (broken) {
    lines.push(
        `Attention: the team registry ${REGISTRY} is broken (${broken}) and was not changed. Managing other chats is blocked. Tell the user at the start of your next answer.`,
    );
} else if (!entry?.role) {
    lines.push(
        `Team: this chat has no team role (title: ${entry?.title ?? "unknown"}). Tools for managing other chats are blocked for it.`,
    );
} else {
    const chat = chatOf(entry.role);
    const state = workStatePath(entry);
    lines.push(
        `Team: this chat is "${entry.title}" (role ${entry.role}). Your work state: ${state}`,
    );
    const dup = holderOf(entry.title, id);
    if (dup)
        lines.push(
            `Attention: the title "${entry.title}" is also registered for ${dup}. Report this to the user.`,
        );

    const reread = {
        clear: "The context was cleared.",
        resume: "The session was resumed.",
        fork: "This is a fork of another session.",
    }[source];
    const must = [state];
    if (entry.role === "orchestrator")
        must.push(`${KB}/orchestrator/roadmap.md`, `${KB}/orchestrator/taskboard.md`);
    if (entry.role === "implementer") must.push(`${KB}/implementer/dev-pool.json`);
    if (source === "compact") {
        // After compaction details are missing: the work state is the memory (D-42/D-43).
        lines.push(
            `The context was compacted. Read your work state (${state}) first and continue with its next step.`,
        );
        if (must.length > 1)
            lines.push(
                `Then read: ${must.slice(1).join(", ")}. Do not rely on memories from the conversation.`,
            );
    } else if (reread)
        lines.push(
            `${reread} Read first: ${must.join(", ")}. Do not rely on memories from the conversation.`,
        );
    else
        lines.push(
            `Read now: ${must.join(", ")}, and continue with the next step if your work state has one.`,
        );

    lines.push(
        `Addressing: reach chats by session ID from ${KB}/team/registry.json (SendMessage to the local_… ID, send_message as fallback).`,
    );
    // The two rules broken most often right after a clear (R-8a X-2, X-6; D-66 point 3)
    lines.push(
        `Language: ${LANGUAGE_RULE} Send limit (observed in practice): the app blocks after 10 sends without user input.`,
    );

    if (
        input.model &&
        chat?.models?.length &&
        !chat.models.some((m) => input.model.toLowerCase().includes(m.toLowerCase()))
    ) {
        lines.push(
            `Attention: this chat runs on ${input.model}, the role requires ${chat.models.join(" or ")}. Tell the user at the start of your next answer.`,
        );
    }
}

process.stdout.write(
    JSON.stringify({
        hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: lines.join("\n") },
    }),
);

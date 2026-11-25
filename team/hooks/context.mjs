// Context size of a team chat for the clearing rule (T-145): a chat clears itself on a new assignment of
// another task family only when its context is large. The measure is a compaction since the chat's last clear,
// read from <KB>/team/compact-log.jsonl:
//
//   {"time":"<ISO>","sessionId":"local_…","title":"…"}                  compaction (pre-compact.mjs)
//   {"time":"<ISO>","sessionId":"local_…","title":"…","event":"clear"}  clear that happened (session-start.mjs)
//
// policy.mjs only checks contextState before clear_session. The clear entry is written by session-start.mjs at the
// SessionStart after the clear (F-145-1): a clear the app rejects or the user declines leaves no entry, so the chat
// stays large and its retry is allowed.
// Entries without "event" are compactions. Large = the session has a compaction entry newer than its newest
// clear entry (no clear entry: any compaction entry). Unreadable or missing log, broken lines, no session id:
// small (the chat keeps its context, which is the safe side; the clear path is only an optimization).
//
// CLI (for the chat, run with the Bash tool; the session id comes from CLAUDE_CODE_HOST_SESSION_ID):
//   node team/hooks/context.mjs
//   → "Context: large (compaction <time>, last clear <time|never>)" or "Context: small (…)", always exit 0.
//
// No imports with side effects: this module must not import hooks/lib.mjs (policy.mjs imports it).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveKbRoot } from "./kb-root.mjs";

export const COMPACT_LOG = "team/compact-log.jsonl";

const logFile = (kb) => path.join(kb, ...COMPACT_LOG.split("/"));

// The entries of sessionId with a parsable time, in file order. Broken lines and other sessions are skipped.
function sessionEntries(kb, sessionId) {
    let text;
    try {
        text = fs.readFileSync(logFile(kb), "utf8");
    } catch {
        return [];
    }
    const entries = [];
    for (const line of text.split(/\r?\n/)) {
        if (!line.trim()) continue;
        let entry;
        try {
            entry = JSON.parse(line);
        } catch {
            continue;
        }
        if (!entry || typeof entry !== "object" || entry.sessionId !== sessionId) continue;
        if (typeof entry.time !== "string" || Number.isNaN(Date.parse(entry.time))) continue;
        entries.push(entry);
    }
    return entries;
}

// The entry with the newest time, or null.
const newest = (entries) =>
    entries.reduce((a, b) => (a && Date.parse(a.time) >= Date.parse(b.time) ? a : b), null);

// { large: boolean, compactedAt: string|null, clearedAt: string|null }
// compactedAt / clearedAt: ISO time of the newest compaction / clear entry of sessionId, or null.
export function contextState(kb, sessionId) {
    if (!kb || typeof sessionId !== "string" || sessionId === "")
        return { large: false, compactedAt: null, clearedAt: null };
    const entries = sessionEntries(kb, sessionId);
    const compacted = newest(entries.filter((e) => e.event === undefined));
    const cleared = newest(entries.filter((e) => e.event === "clear"));
    const large =
        compacted !== null &&
        (cleared === null || Date.parse(compacted.time) > Date.parse(cleared.time));
    return { large, compactedAt: compacted?.time ?? null, clearedAt: cleared?.time ?? null };
}

// Appends the clear entry for sessionId. Never throws (a write error only goes to stderr).
export function recordClear(kb, sessionId, title) {
    const file = logFile(kb);
    try {
        const entry = {
            time: new Date().toISOString(),
            sessionId,
            title: title ?? null,
            event: "clear",
        };
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.appendFileSync(file, JSON.stringify(entry) + "\n");
    } catch (e) {
        process.stderr.write(
            `Team hook: ${file} not writable (${e?.message ?? e}), clear not logged.\n`,
        );
    }
}

// Did a clear happen before this SessionStart? known: the chat's registry entry before SessionStart updates it.
// After a desktop clear_session the app starts a new inner session: SessionStart then brings a session_id other than
// the stored one, while source is not reliably "clear" (observed 2026-11-15). Compaction and resume keep the context.
// Unregistered chat (no entry): false.
export function clearedBeforeStart(known, input) {
    if (!known || typeof known !== "object") return false;
    const source = input?.source ?? "startup";
    if (source === "clear") return true;
    if (source === "compact" || source === "resume") return false;
    const stored = known.sessionId;
    const current = input?.session_id;
    return !!stored && !!current && stored !== current;
}

// CLI: "Context: large|small (…)", always exit 0.
function cli() {
    const teamDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
    const id = process.env.CLAUDE_CODE_HOST_SESSION_ID || null;
    let reason = null;
    let state = { large: false, compactedAt: null, clearedAt: null };
    if (!id) reason = "no session id (CLAUDE_CODE_HOST_SESSION_ID is not set)";
    else {
        let kb = null;
        try {
            let config = {};
            try {
                config =
                    JSON.parse(fs.readFileSync(path.join(teamDir, "team.config.json"), "utf8")) ??
                    {};
            } catch {
                config = {};
            }
            kb = resolveKbRoot({ projectDir: path.dirname(teamDir), config }).path;
        } catch (e) {
            reason = `knowledge base root not usable: ${e?.message ?? e}`;
        }
        if (kb !== null) state = contextState(kb, id);
    }
    const detail =
        reason ??
        `compaction ${state.compactedAt ?? "none"}, last clear ${state.clearedAt ?? "never"}`;
    process.stdout.write(`Context: ${state.large ? "large" : "small"} (${detail})\n`);
}

let isMain = false;
try {
    isMain =
        !!process.argv[1] &&
        path.resolve(process.argv[1]).toLowerCase() ===
            fileURLToPath(import.meta.url).toLowerCase();
} catch {
    isMain = false;
}
if (isMain) {
    try {
        cli();
    } catch (e) {
        process.stdout.write(`Context: small (unexpected error: ${e?.message ?? e})\n`);
    }
    process.exit(0);
}

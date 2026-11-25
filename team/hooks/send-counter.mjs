// Send counter hook (T-38, counting rule table of R-9, D-150): counts the cross-session sends of a chat since
// its last typed user input. It only counts: no deny, no warning (T-164, D-195). Storage: sends.mjs. Registered by sync.mjs for PreToolUse and PostToolUse of SEND_TOOLS and for
// UserPromptSubmit.
//
//   PreToolUse of a send tool   +1 ("pre:<tool>"), never denied
//   PostToolUse(Failure)        "success":false and "N times": counter = N ("resync"); other failures unchanged
//                               (D-150: counted, not subtracted)
//   UserPromptSubmit            typed prompt: 0 ("prompt"); anything else unchanged. Fail safe (T-38-F1): typed
//                               only if, after leading whitespace, it is non-empty, does not start with "<" (app
//                               tags: <task-notification>, <side-sessions-event>, <system-reminder>, …), does not
//                               start with a plain-text app marker (APP_MARKERS) and contains no <cross-session-message
//   Clear / SessionStart        unchanged (the app's reset on clear is unverified, R-9 row "Clear")
//
// After UserPromptSubmit and the send tools it refreshes <KB>/team/status.json (T-149, status-file.mjs); a write
// error there is silent and changes nothing above.
//
// One logical send counts once (T-38-F2, F-38-3): the desktop app forwards SendMessage through
// mcp__ccd_session_mgmt__send_message, and PreToolUse fires for both. The hook inputs carry nothing verified that
// links the inner call to the outer one, so the order is used (Pre outer → Pre inner → Post inner → Post outer):
//   - PreToolUse SendMessage (counted +1) stores a pending mark { id: tool_use_id, at } in the chat's file.
//   - PreToolUse send_message with a mark younger than FORWARD_MS consumes the oldest mark: not counted and never
//     denied (event "pre:forward"); the outer call was already counted. Without a fresh mark it is a direct
//     send: +1.
//   - PostToolUse SendMessage removes its own mark (same tool_use_id) if the inner call did not consume it.
//   - Marks older than FORWARD_MS are dropped (Post never came, or SendMessage went to an in-process agent).
//
// Never breaks a send by a bug: without a chat id the hook does nothing, and every internal error (also one
// while lib.mjs loads, which stops with exit 2) ends with exit 0 and a note on stderr.

import fs from "node:fs";
import path from "node:path";
import { SEND_TOOLS, readPending, readSends, sendsFile, writeSends } from "./sends.mjs";

// Constants are declared here because main() runs at the top level.
// Plain-text starts of prompts the app injects (peer message, continuation summary, notes like "[Request …",
// usage limit); tagged prompts are caught by the "<" rule of typedPrompt.
const APP_MARKERS = [
    "Another Claude session sent a message",
    "This session is being continued",
    "[",
    "I hit my usage limit",
];
// Forwarding of SendMessage (T-38-F2): the outer and the inner tool and how long a pending mark is valid
const OUTER = "SendMessage";
const INNER = "mcp__ccd_session_mgmt__send_message";
const FORWARD_MS = 30000;
// Lock of withLock (below)
const LOCK_BUSY = new Set(["EEXIST", "EPERM", "EACCES", "EBUSY"]);
const STALE_MS = 5000;
const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

// lib.mjs and its handlers end with exit 2 on errors; this hook must not block, so every exit becomes 0.
process.on("exit", () => {
    process.exitCode = 0;
});

let input;
try {
    input = JSON.parse(fs.readFileSync(0, "utf8") || "{}");
} catch (e) {
    note(`input not readable (${e.message})`);
    process.exit(0);
}

try {
    const { hostId, KB } = await import("./lib.mjs");
    const id = hostId();
    if (id) {
        main(input ?? {}, KB, id);
        // T-149: refresh <KB>/team/status.json after a counter may have changed; silent, never changes the result
        if (
            input?.hook_event_name === "UserPromptSubmit" ||
            SEND_TOOLS.includes(input?.tool_name ?? "")
        ) {
            const { refreshStatus } = await import("./status-file.mjs");
            refreshStatus(KB);
        }
    }
} catch (e) {
    note(e?.stack ?? e);
}
process.exit(0);

function note(message) {
    process.stderr.write(`Team hook send-counter.mjs: ${message} (send not blocked)\n`);
}

function main(input, kb, id) {
    const event = input.hook_event_name ?? "";
    const tool = input.tool_name ?? "";
    if (event === "UserPromptSubmit") {
        if (typedPrompt(input.prompt)) withLock(kb, id, () => writeSends(kb, id, 0, "prompt"));
        return;
    }
    if (!SEND_TOOLS.includes(tool)) return;
    if (event === "PreToolUse") return pre(kb, id, tool, input.tool_use_id ?? null);
    if (event === "PostToolUse" || event === "PostToolUseFailure") return post(kb, id, input);
}

// Pending SendMessage marks that are still within FORWARD_MS
function freshPending(kb, id) {
    const now = Date.now();
    return readPending(kb, id).filter((p) => {
        const age = now - Date.parse(p.at);
        return age >= 0 && age <= FORWARD_MS;
    });
}

// Fail safe: a prompt counts as typed only if, after leading whitespace, it is non-empty, does not start with "<"
// (any tag), does not start with an APP_MARKERS entry and contains no <cross-session-message. A wrong reset would
// hide real sends from the count; a missed one only keeps the count higher.
// Scheduled-task prompts are plain text and count as typed: the hook input has no origin mark (T-38-F1, live check).
function typedPrompt(prompt) {
    const p = String(prompt ?? "").trimStart();
    if (p === "" || p.startsWith("<")) return false;
    if (APP_MARKERS.some((m) => p.startsWith(m))) return false;
    return !p.includes("<cross-session-message");
}

function pre(kb, id, tool, useId) {
    withLock(kb, id, () => {
        const n = readSends(kb, id);
        const pending = freshPending(kb, id);
        if (tool === INNER && pending.length) {
            writeSends(kb, id, n, "pre:forward", pending.slice(1));
            return;
        }
        const mark = tool === OUTER ? [{ id: useId, at: new Date().toISOString() }] : [];
        writeSends(kb, id, n + 1, `pre:${tool}`, [...pending, ...mark]);
    });
}

function post(kb, id, input) {
    withLock(kb, id, () => {
        const before = readSends(kb, id);
        const all = readPending(kb, id);
        let pending = freshPending(kb, id);
        // the outer SendMessage is done: its own mark goes, if the forward did not consume it
        const useId = input.tool_use_id ?? null;
        if (input.tool_name === OUTER && useId !== null)
            pending = pending.filter((p) => p.id !== useId);
        const resync = appCount(input);
        if (resync !== null) writeSends(kb, id, resync, "resync", pending);
        else if (pending.length !== all.length) writeSends(kb, id, before, "post:mark", pending);
    });
}

// The app's own count from a refusal ("success":false and "… N times …"), else null.
function appCount(input) {
    const parts = [input.tool_response, input.error].filter((v) => v !== undefined);
    const text = parts.map((v) => (typeof v === "string" ? v : JSON.stringify(v))).join("\n");
    const failed =
        /"success"\s*:\s*false/.test(text) ||
        /\bsuccess:\s*false\b/.test(text) ||
        parts.some((v) => parsed(v)?.success === false);
    const m = text.match(/(\d+) times/);
    return failed && m ? Number(m[1]) : null;
}

function parsed(v) {
    if (v && typeof v === "object") return v;
    try {
        return JSON.parse(v);
    } catch {
        return null;
    }
}

// Parallel tool calls of one chat can run their hooks at the same time; the read-modify-write of the chat's
// file runs under <file>.lock (wx, short retry, stale after 5 s, pattern of withRegistryLock in lib.mjs).
// If the lock cannot be taken in time, the update runs without it (a note on stderr): the send goes on.
function withLock(kb, id, fn) {
    const lock = `${sendsFile(kb, id)}.lock`;
    fs.mkdirSync(path.dirname(lock), { recursive: true });
    const content = JSON.stringify({ pid: process.pid, at: new Date().toISOString() });
    const until = Date.now() + STALE_MS + 1000;
    let held = false;
    while (!held) {
        try {
            fs.writeFileSync(lock, content, { flag: "wx" });
            held = true;
        } catch (e) {
            if (!LOCK_BUSY.has(e.code)) throw e;
            try {
                if (Date.now() - fs.statSync(lock).mtimeMs > STALE_MS)
                    fs.rmSync(lock, { force: true });
            } catch {
                // gone meanwhile
            }
            if (Date.now() >= until) {
                note(`${lock} held for more than ${STALE_MS / 1000} s, counting without the lock`);
                break;
            }
            sleepSync(10 + Math.floor(Math.random() * 20));
        }
    }
    try {
        return fn();
    } finally {
        if (held) {
            try {
                if (fs.readFileSync(lock, "utf8") === content) fs.rmSync(lock);
            } catch {
                // already gone
            }
        }
    }
}

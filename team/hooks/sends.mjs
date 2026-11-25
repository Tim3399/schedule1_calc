// Send counter per chat (T-38, counting rule table of R-9, D-150): cross-session sends since the last typed
// user input. One file per chat in <KB>/team/sends/<chat id>.json, written only by hooks (send-counter.mjs).
// Not in registry.json, which other hooks rewrite. Pure helpers with an explicit KB path, so the hooks and
// the CLI (agent-team status) share them.
//
// File format: { "sends": <integer ≥ 0>, "updated": "<ISO time>", "event": "<last event that changed it>",
//                "pending": [{ "id": "<tool_use_id or null>", "at": "<ISO time>" }] (optional, T-38-F2) }
// Chat id: CLAUDE_CODE_HOST_SESSION_ID (local_…), the same key as in registry.json.

import fs from "node:fs";
import path from "node:path";

export const SEND_TOOLS = [
    "SendMessage",
    "mcp__ccd_session_mgmt__send_message",
    "mcp__ccd_session__start_session",
];

export const sendsDir = (kb) => path.join(kb, "team", "sends");

// Ids are local_<uuid>; anything outside [A-Za-z0-9_-] is replaced so a strange id never leaves the folder.
export const sendsFile = (kb, id) =>
    path.join(sendsDir(kb), `${String(id).replace(/[^A-Za-z0-9_-]/g, "_")}.json`);

// Counter of one chat; 0 for a missing or broken file.
export function readSends(kb, id) {
    try {
        const v = JSON.parse(fs.readFileSync(sendsFile(kb, id), "utf8"));
        return Number.isInteger(v?.sends) && v.sends >= 0 ? v.sends : 0;
    } catch {
        return 0;
    }
}

const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

// Pending SendMessage marks of one chat (T-38-F2, send-counter.mjs): [{ id, at }]; [] for a missing or broken file.
export function readPending(kb, id) {
    try {
        const v = JSON.parse(fs.readFileSync(sendsFile(kb, id), "utf8"));
        return Array.isArray(v?.pending) ? v.pending.filter((p) => typeof p?.at === "string") : [];
    } catch {
        return [];
    }
}

// Atomic write: temp file per process, then rename (retry on Windows when a reader holds the file).
// pending (optional): the marks to keep; left out or empty, the file has no pending field.
export function writeSends(kb, id, sends, event, pending = []) {
    const file = sendsFile(kb, id);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    const value = { sends, updated: new Date().toISOString(), event };
    if (pending.length) value.pending = pending;
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n");
    for (let attempt = 0; ; attempt++) {
        try {
            fs.renameSync(tmp, file);
            return;
        } catch (e) {
            if (attempt >= 20 || !["EPERM", "EBUSY", "EACCES"].includes(e.code)) {
                fs.rmSync(tmp, { force: true });
                throw e;
            }
            sleepSync(25);
        }
    }
}

// All counters: { <chat id>: <sends> }, from the file names (sanitized ids are the registry ids for local_…).
export function listSends(kb) {
    let names = [];
    try {
        names = fs.readdirSync(sendsDir(kb)).filter((n) => n.endsWith(".json"));
    } catch {
        return {};
    }
    return Object.fromEntries(
        names.map((n) => {
            const id = n.slice(0, -".json".length);
            return [id, readSends(kb, id)];
        }),
    );
}

// Display form for the session start hint and agent-team status.
export const sendsLabel = (n) => `sends ${n}`;

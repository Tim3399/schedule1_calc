// Team status file (T-149): <KB>/team/status.json, a machine-readable snapshot derived from the Markdown KB
// (roadmap, taskboard, work states, dev pool) plus registry.json, team/sends/ and the Claude Code session files
// (sessionStatus, idleSince; T-108, read via idle.mjs). Markdown stays the source of truth; nobody writes this file by hand. Writer: buildStatus/writeStatus (D-149-1), called by hooks and by
// `agent-team status --write`. Reader: the team-panel mod (D-149-2), which also re-reads team/sends/ itself
// for a live send budget.
//
// Shape (schema 1):
// {
//   "schema": 1,
//   "generated": "<ISO time>",
//   "version": {                                              // current roadmap version, null if none
//     "name": "agent-team v0.5.0", "done": <int>, "total": <int>,
//     "tasks": [{ "id": "T-149", "title": "…", "status": "in progress",
//                 "assignedTo": "Implementer" | null, "waitingFor": "User (…)" | null }]
//   },
//   "chats": [{                                               // one per registry entry, plus unknown send files
//     "id": "local_…", "sessionId": "<registry sessionId>" | null, "title": "Dev 1", "role": "dev",
//     "slot": 1 | null, "sends": <int>,                        // T-38 counter only, no limit (T-164)
//     "status": "free|working|waiting|blocked" | null,         // from the chat's work state
//     "assignment": "<work state Assignment:>" | null,
//     "waitingFor": "<work state Waiting for:>" | null,
//     "sessionStatus": "busy|idle|unloaded|unknown",          // T-108: chatStates of idle.mjs at write time
//     "idleSince": "<ISO time>" | null                          // only for "idle" (statusUpdatedAt)
//   }],
//   "devPool": [{ "title": "Dev 1", "status": "free|busy|broken", "assignment": "D-…" | null }] // [] if no pool file
// }
//
// Rules (D-149-1):
// - Current version: the first version in roadmap.md (file order) whose Status starts with "in progress"
//   ("in Arbeit"); if there is none, the first "planned" ("geplant") one; otherwise null.
// - version.tasks: the checkbox items "  - [x] <ID> <title>" of that version, in roadmap order. done/total count
//   the checked items / all items. A task that is on taskboard.md takes its title, Status, Assigned to and
//   Waiting for from there; otherwise its status is "done" (checked) or "todo" (unchecked) and the rest null.
// - Field values "–", "-" or empty are null. English and German field names are read (keywords of the portal).
// - Work state of a chat: <role>/ (slot 1 or none), <role>/<role>-<k>/ (slot k ≥ 2), devs always dev/dev-<n>/;
//   work-state.md first, then arbeitsstand.md (work-state.mjs).
// - chats are sorted by title. Missing or broken inputs give null, [] or 0; buildStatus never throws.
// - sessionStatus and idleSince (T-108, fields added in schema 1) are a snapshot of the session files
//   (sessionsDir() of idle.mjs, only <digits>.json, read-only) at the last write; `agent-team status` reads them
//   live. No session file or a dead pid → "unloaded"; unreadable → "unknown" (rules of idle.mjs).
//
// This module is self-contained (node: built-ins and sibling hook modules only), so a project's team/hooks/ and
// the package CLI both reach it. The portal parser in lib/ is not reachable from a project's hooks.

import fs from "node:fs";
import path from "node:path";
import { chatStates, pidAlive, scanSessions, sessionsDir } from "./idle.mjs";
import { listSends } from "./sends.mjs";
import {
    normalizeStatus,
    readWorkState,
    WORK_STATE_FIELDS,
    WORK_STATE_FILES,
} from "./work-state.mjs";

export const STATUS_SCHEMA = 1;
export const statusFile = (kb) => path.join(kb, "team", "status.json");

const VERSION_HEADER = /^## ((?:\S+ )?v\d+\.\d+\.\d+)(?: [–-] .*)?$/;
const ITEM = /^\s+- \[([ xX])\]\s+((?:T|R|A)-\d+[a-z]?)\b\s*(.*)$/;
const TASK_HEADER = /^### ((?:T|R|A)-\d+[a-z]?): (.+)$/;
const FIELD = /^- ([^:]+):\s?(.*)$/;
const TASK_FIELD_NAMES = {
    status: ["Status"],
    assignedTo: ["Assigned to", "Zugewiesen an"],
    waitingFor: ["Waiting for", ...WORK_STATE_FIELDS["Waiting for"]], // same German key as in work states
};

function readText(file) {
    try {
        return fs.readFileSync(file, "utf8").replace(/\r\n?/g, "\n");
    } catch {
        return null;
    }
}

function readJson(file) {
    const text = readText(file);
    if (text === null) return null;
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

const isObject = (v) => !!v && typeof v === "object" && !Array.isArray(v);

// "–", "-", "" and non-strings → null; otherwise the trimmed value
function value(v) {
    if (typeof v !== "string") return null;
    const t = v.trim();
    return t === "" || t === "–" || t === "-" || t === "—" ? null : t;
}

// Lines outside fenced code blocks
function unfenced(text) {
    const out = [];
    let fenced = false;
    for (const line of text.split("\n")) {
        if (/^\s*```/.test(line)) fenced = !fenced;
        else if (!fenced) out.push(line);
    }
    return out;
}

// roadmap.md → [{ name, status, items: [{ id, title, done }] }]
export function parseRoadmapVersions(text) {
    const versions = [];
    let current = null;
    for (const line of unfenced(text ?? "")) {
        if (line.startsWith("## ")) {
            const m = VERSION_HEADER.exec(line.trimEnd());
            current = m ? { name: m[1], status: null, items: [] } : null;
            if (current) versions.push(current);
            continue;
        }
        if (!current) continue;
        const field = FIELD.exec(line);
        if (field && field[1].trim() === "Status" && current.status === null) {
            current.status = value(field[2]);
            continue;
        }
        const item = ITEM.exec(line);
        if (item) current.items.push({ id: item[2], title: item[3].trim(), done: item[1] !== " " });
    }
    return versions;
}

// taskboard.md → { <id>: { title, status, assignedTo, waitingFor } }; the first task of an ID counts
export function parseTaskboard(text) {
    const tasks = {};
    let current = null;
    for (const line of unfenced(text ?? "")) {
        if (line.startsWith("## ")) {
            current = null;
            continue;
        }
        if (line.startsWith("### ")) {
            const m = TASK_HEADER.exec(line.trimEnd());
            current = m && !(m[1] in tasks) ? { title: m[2].trim(), fields: {} } : null;
            if (current) tasks[m[1]] = current;
            continue;
        }
        const field = current && FIELD.exec(line);
        if (field && !(field[1].trim() in current.fields))
            current.fields[field[1].trim()] = field[2];
    }
    const pick = (fields, names) => {
        for (const n of names) if (n in fields) return value(fields[n]);
        return null;
    };
    return Object.fromEntries(
        Object.entries(tasks).map(([id, t]) => [
            id,
            {
                title: t.title,
                status: pick(t.fields, TASK_FIELD_NAMES.status),
                assignedTo: pick(t.fields, TASK_FIELD_NAMES.assignedTo),
                waitingFor: pick(t.fields, TASK_FIELD_NAMES.waitingFor),
            },
        ]),
    );
}

const startsWithWord = (status, words) =>
    !!status && words.some((w) => status.toLowerCase().startsWith(w));

// The current version (rule in the header), or null
export function currentVersion(versions, board) {
    const v =
        versions.find((x) => startsWithWord(x.status, ["in progress", "in arbeit"])) ??
        versions.find((x) => startsWithWord(x.status, ["planned", "geplant"]));
    if (!v) return null;
    return {
        name: v.name,
        done: v.items.filter((i) => i.done).length,
        total: v.items.length,
        tasks: v.items.map((i) => {
            const t = board[i.id];
            return {
                id: i.id,
                title: t?.title ?? i.title,
                status: t?.status ?? (i.done ? "done" : "todo"),
                assignedTo: t?.assignedTo ?? null,
                waitingFor: t?.waitingFor ?? null,
            };
        }),
    };
}

// Work state folder of a registry entry relative to the KB (rule in the header), or null without a role
function workStateDir(role, slot) {
    if (typeof role !== "string" || !/^[a-z][a-z0-9-]*$/.test(role)) return null;
    const n = Number.isInteger(slot) && slot > 0 ? slot : null;
    if (role === "dev") return n ? `dev/dev-${n}` : null;
    return !n || n === 1 ? role : `${role}/${role}-${n}`;
}

// { status, assignment, waitingFor } of the chat's work state; nulls when there is none
function workStateOf(kb, role, slot) {
    const none = { status: null, assignment: null, waitingFor: null };
    const dir = workStateDir(role, slot);
    if (!dir) return none;
    for (const name of WORK_STATE_FILES) {
        const text = readText(path.join(kb, ...dir.split("/"), name));
        if (text === null) continue;
        const f = readWorkState(text);
        return {
            status: normalizeStatus(f.Status?.value),
            assignment: value(f.Assignment?.value),
            waitingFor: value(f["Waiting for"]?.value),
        };
    }
    return none;
}

// { <id>: { state, since } } of chatStates for chat ids and a scanSessions map. A broken session file that is
// being written ("?<file>" key) makes every chat without its own file "unknown", as buildFacts of idle.mjs does.
export function sessionStates(ids, sessions, alive = pidAlive) {
    const files = isObject(sessions) ? sessions : {};
    const unassigned = Object.keys(files).some((k) => k.startsWith("?"));
    const chats = ids.map((id) => {
        const session = id in files ? files[id] : unassigned ? "unknown" : null;
        return { id, session, pidAlive: isObject(session) ? alive(session.pid) : false };
    });
    return chatStates({ chats });
}

function sessionFields(states, id) {
    const s = states[id] ?? { state: "unknown", since: null };
    return {
        sessionStatus: s.state,
        idleSince: s.state === "idle" ? new Date(s.since).toISOString() : null,
    };
}

function chatsOf(kb, live) {
    const reg = readJson(path.join(kb, "team", "registry.json"));
    const entries = isObject(reg) ? reg : {};
    const sends = listSends(kb);
    const chats = Object.entries(entries).map(([id, e]) => {
        const entry = isObject(e) ? e : {};
        const role = typeof entry.role === "string" ? entry.role : null;
        const slot = Number.isInteger(entry.slot) ? entry.slot : null;
        const n = sends[id] ?? 0;
        return {
            id,
            sessionId: typeof entry.sessionId === "string" ? entry.sessionId : null,
            title: typeof entry.title === "string" ? entry.title : id,
            role,
            slot,
            sends: n,
            ...workStateOf(kb, role, slot),
        };
    });
    for (const [id, n] of Object.entries(sends))
        if (!(id in entries))
            chats.push({
                id,
                sessionId: null,
                title: id,
                role: null,
                slot: null,
                sends: n,
                status: null,
                assignment: null,
                waitingFor: null,
            });
    const states = sessionStates(
        chats.map((c) => c.id),
        live.sessions,
        live.alive,
    );
    return chats
        .map((c) => ({ ...c, ...sessionFields(states, c.id) }))
        .sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
}

function devPoolOf(kb) {
    const pool = readJson(path.join(kb, "implementer", "dev-pool.json"));
    const slots = Array.isArray(pool?.slots) ? pool.slots : [];
    return slots.filter(isObject).map((s) => ({
        title: typeof s.title === "string" ? s.title : null,
        status: typeof s.status === "string" ? s.status : null,
        assignment: value(s.assignment),
    }));
}

// The schema-1 object (shape and rules in the header). opts.now: Date or ISO string for "generated".
// opts.sessions (scanSessions map), else opts.dir (sessions folder, default sessionsDir()); opts.alive: pid check.
export function buildStatus(kb, { now = new Date(), sessions, dir, alive = pidAlive } = {}) {
    const generated = new Date(now).toISOString();
    let version = null;
    let chats = [];
    let devPool = [];
    try {
        const versions = parseRoadmapVersions(
            readText(path.join(kb, "orchestrator", "roadmap.md")),
        );
        const board = parseTaskboard(readText(path.join(kb, "orchestrator", "taskboard.md")));
        version = currentVersion(versions, board);
    } catch {
        version = null;
    }
    try {
        const files = sessions ?? scanSessions(dir ?? sessionsDir()).sessions;
        chats = chatsOf(kb, { sessions: files, alive });
    } catch {
        chats = [];
    }
    try {
        devPool = devPoolOf(kb);
    } catch {
        devPool = [];
    }
    return {
        schema: STATUS_SCHEMA,
        generated,
        version,
        chats,
        devPool,
    };
}

const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const withoutGenerated = (s) => JSON.stringify({ ...s, generated: null });

// Writes statusFile(kb) atomically (temp file + rename), only if the content apart from "generated" changed.
// Returns { written: boolean, file, status }. Throws on write errors (refreshStatus is the silent form).
export function writeStatus(kb, opts = {}) {
    const file = statusFile(kb);
    const status = buildStatus(kb, opts);
    const old = readJson(file);
    if (isObject(old) && withoutGenerated(old) === withoutGenerated(status))
        return { written: false, file, status };
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(status, null, 2) + "\n");
    for (let attempt = 0; ; attempt++) {
        try {
            fs.renameSync(tmp, file);
            return { written: true, file, status };
        } catch (e) {
            if (attempt >= 20 || !["EPERM", "EBUSY", "EACCES"].includes(e.code)) {
                fs.rmSync(tmp, { force: true });
                throw e;
            }
            sleepSync(25);
        }
    }
}

// For hooks: writeStatus that never throws and prints nothing; a failure leaves the hook's result unchanged.
export function refreshStatus(kb) {
    try {
        if (kb) writeStatus(kb);
    } catch {
        // silent by design (D-149-1): the status file is a convenience, the hook result must not change
    }
}

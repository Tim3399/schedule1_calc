// Idle detector (T-108): decides from deterministic data whether the team is stalled, for one supervising chat
// (owner). Rule: <KB>/implementer/T-108-plan.md revision 2, §3, plus F-108-6 (wait chains, D-173). Pure
// functions plus small read-only readers; the watcher (idle-watch.mjs) gathers the facts and acts.
//
// Contract (scaffold; D-108-1 implements it, the shapes stay):
//
// facts = {
//   now: <ms>,
//   project: "<project name>" | null,               // T-155: titles "<role title> - <project>" (titleKey)
//   chats: [{                                     // one per registered role chat (registry key = hostSessionId)
//     id: "local_…", title: "Dev 2", role: "dev", slot: 2 | null,
//     session: { pid, status: "idle"|"busy", statusUpdatedAt: <ms> } | null | "unknown",   // null = no file
//     pidAlive: <bool>,                           // false for a stale file
//     workState: { status: "free"|"working"|"waiting"|"blocked"|null,
//                  waitingFor: [{ target: "<title or User or free text>", text: "<entry>" }] },
//     sends: <int>,                               // T-38 counter
//     busySlot: <bool>,                           // dev with a busy pool slot
//   }],
// }
//
// chatStates(facts) → { <id>: { state: "busy"|"idle"|"unloaded"|"unknown", since: <ms>|null } }
//   busy: file + pid alive + status busy; idle: file + pid alive + status idle (since = statusUpdatedAt);
//   unloaded: no file or pid dead (D-172, idle for R1, never a target); unknown: unreadable (not idle).
//
// detectIdle(facts, { owner: "<id>", minutes }) → {
//   idle: <bool>,                                 // R1–R5 hold for the owner's scope
//   stalled: [{ id, title, since, state, chain: ["<title>", …] }],   // owner's stalls, never the owner itself
//   handledByOther: [{ id, title, by: "<owner title>" }],             // F-108-6 (b), not in the key
//   waitsForYou: [{ id, title }],                 // F-108-6 (a): chain ends at the owner waiting only for User
//   unloaded: [{ id, title }],
//   episode: "<key>" | null,                      // episodeKey(stalled), null when not idle
// }
// Scope (§3.3): owner role implementer → itself + busy-slot devs; owner role orchestrator → all chats,
// busy-slot devs handled by the Implementer unless it is unloaded.
// Wait chains (F-108-6): a waiting chat is stalled only if the end of its chain is a dead (idle ≥ N or unloaded)
// chat; a chain ending at a chat that waits only for User or for targets outside the registry is no stall;
// cycles end the walk; dead targets owned by another live watcher → handledByOther.
//
// episodeKey(stalled) → sorted "<id>@<since or unloaded>|<chain>", joined by ";" (the owner is never part of it).
// The send counter plays no part (T-164, D-195): a chat with many sends is treated like any other.
// idleConfig(config) → { enabled: false (opt-in, D-186), minutes: 15, pollSeconds: 30, watchSeconds: 3300 } after validation (§7).
// sessionsDir(env) → <CLAUDE_CONFIG_DIR or ~/.claude>/sessions.  readSessions(dir) → { <hostSessionId>: session|"unknown" }
// (scanSessions(dir) → { sessions, warnings }).
// pidAlive(pid) → process.kill(pid, 0) succeeds (EPERM counts as alive).
//
// Implementation rules (D-108-1):
// - A dead chat is `unloaded`, or `idle` with now − since ≥ N minutes. `busy` and `unknown` are never dead.
// - Chain walk from a chat X (path = chats visited so far):
//     X not dead → "alive"; X in path → "dead" (a cycle of dead chats is a deadlock, the walk ends there);
//     X waiting with live targets (registered chats) → the walk goes on into every target, and the result is
//     "alive" if any branch is alive, else "dead" if any branch is dead, else "user";
//     X waiting without live targets (only User, outside the registry or nothing) → "user";
//     any other dead X (working, free, blocked, no work state) → "dead", X is a dead end.
// - Stalled candidates: chats in scope except the owner that are dead and either `working` (dead end = the chat
//   itself, chain []) or `waiting` with a chain result "dead" (chain = titles up to the first dead end).
//   A waiting chat whose chain result is "user" and whose chain passes the owner goes to waitsForYou.
// - Implementer owner that is dead and `waiting` (F-108-7): the walk from the owner itself; when it is "dead",
//   every dead end in its scope (except the owner) is stalled whatever its status (blocked, free, working, no
//   work state), chain []. So a blocked dev or one with a lost report wakes the Implementer.
// - Orchestrator with a live Implementer (session not unloaded) (F-108-7): it delegates only what the
//   Implementer's own watcher reports, that is the stalled chats of detectIdle(facts, { owner: <Implementer> })
//   when that result is idle. A candidate that is reported there, or whose dead ends are all reported there, goes
//   to handledByOther instead of stalled. Everything else is the Orchestrator's own.
// - idle = R5 (one chat in scope is not unloaded) and R1 (every chat in scope is dead) and stalled is not empty.
// - Session files: only "<digits>.json" are read; "<pid>.<hash>.key" files (peer token) are never opened.
//   The folder holds the files of every session on the machine (other projects, terminal sessions), so:
//   valid JSON without a hostSessionId (or not an object) → ignored, not ours. Broken JSON (or unreadable)
//   with an mtime younger than BROKEN_GRACE_MS (a file being written) → kept under the key "?<file name>" as
//   "unknown", and buildFacts then treats every chat without a file as "unknown" (no wake on half-written
//   data); older broken files → ignored plus one line in warnings. A file with a hostSessionId but unknown
//   fields → "unknown" for that chat. Several files of one hostSessionId: the newest updatedAt wins.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { titleKey } from "./pools.mjs";
import { readSends } from "./sends.mjs";
import { normalizeStatus, readWorkState, WORK_STATE_FILES } from "./work-state.mjs";

export const IDLE_DEFAULTS = Object.freeze({
    enabled: false, // opt-in (T-159, D-186): "idle": { "enabled": true } turns the monitor on
    minutes: 15,
    pollSeconds: 30,
    watchSeconds: 3300,
    maxRenewals: 6, // renewal wakes in a row (F-108-8): about 6 h with the default watchSeconds
});

// Validation ranges of idleConfig (§7). watchSeconds max 3540: the hook timeout is watchSeconds + 60, and
// timeouts above 3600 s are untested (S-108).
export const IDLE_LIMITS = Object.freeze({
    minutes: [1, 1440],
    pollSeconds: [5, 300],
    watchSeconds: [60, 3540],
    maxRenewals: [0, 48], // 0 = no renewal
});

const isObject = (v) => !!v && typeof v === "object" && !Array.isArray(v);

// team.config.json (whole object) → validated idle settings plus warnings (one line per invalid value)
export function idleConfig(config) {
    const raw = isObject(config) ? config.idle : undefined;
    const out = { ...IDLE_DEFAULTS, warnings: [] };
    if (raw === undefined) return out;
    if (!isObject(raw)) {
        out.warnings.push(`idle must be an object (found ${JSON.stringify(raw)}), defaults used`);
        return out;
    }
    if ("enabled" in raw) {
        if (typeof raw.enabled === "boolean") out.enabled = raw.enabled;
        else
            out.warnings.push(
                `idle.enabled must be true or false (found ${JSON.stringify(raw.enabled)})`,
            );
    }
    for (const [key, [min, max]] of Object.entries(IDLE_LIMITS)) {
        if (!(key in raw)) continue;
        const v = raw[key];
        if (Number.isInteger(v) && v >= min && v <= max) out[key] = v;
        else
            out.warnings.push(
                `idle.${key} must be an integer from ${min} to ${max} (found ${JSON.stringify(v)}), default ${IDLE_DEFAULTS[key]} used`,
            );
    }
    return out;
}

// <CLAUDE_CONFIG_DIR or ~/.claude>/sessions
export function sessionsDir(env = process.env) {
    const base = env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
    return path.join(base, "sessions");
}

export function pidAlive(pid) {
    if (!Number.isInteger(pid) || pid <= 0) return false;
    try {
        process.kill(pid, 0);
        return true;
    } catch (e) {
        return e?.code === "EPERM";
    }
}

const SESSION_FILE = /^\d+\.json$/;
const STATUSES = new Set(["idle", "busy"]);

// A broken session file younger than this counts as being written (two polls of the default 30 s)
export const BROKEN_GRACE_MS = 60_000;

// One session file text → { broken: true } | { hostId: null } (not ours) | { hostId, updatedAt, value }
// (value: session object or "unknown")
function parseSession(text) {
    let j;
    try {
        j = JSON.parse(text);
    } catch {
        return { broken: true };
    }
    if (!isObject(j) || typeof j.hostSessionId !== "string" || !j.hostSessionId)
        return { hostId: null };
    const ok =
        Number.isInteger(j.pid) && STATUSES.has(j.status) && Number.isFinite(j.statusUpdatedAt);
    return {
        hostId: j.hostSessionId,
        updatedAt: Number.isFinite(j.updatedAt) ? j.updatedAt : 0,
        value: ok
            ? { pid: j.pid, status: j.status, statusUpdatedAt: j.statusUpdatedAt }
            : "unknown",
    };
}

// → { sessions: { <hostSessionId>: { pid, status, statusUpdatedAt } | "unknown", "?<file>": "unknown" (broken,
// being written) }, warnings: ["<line>"] }. Read-only; a missing folder gives empty values. now: ms for the
// mtime age of broken files.
export function scanSessions(dir, { now = Date.now() } = {}) {
    const sessions = {};
    const warnings = [];
    let names;
    try {
        names = fs.readdirSync(dir).filter((n) => SESSION_FILE.test(n));
    } catch {
        return { sessions, warnings };
    }
    const newest = {};
    for (const name of names.sort()) {
        const file = path.join(dir, name);
        let s;
        try {
            s = parseSession(fs.readFileSync(file, "utf8"));
        } catch {
            s = { broken: true };
        }
        if (s.broken) {
            let age = Number.POSITIVE_INFINITY;
            try {
                age = now - fs.statSync(file).mtimeMs;
            } catch {
                // gone or unreadable: treated as old
            }
            if (age < BROKEN_GRACE_MS) sessions[`?${name}`] = "unknown";
            else
                warnings.push(
                    `session file ${name} is broken and older than ${BROKEN_GRACE_MS / 1000} s, ignored`,
                );
            continue;
        }
        if (!s.hostId) continue; // not ours
        if (s.hostId in sessions && newest[s.hostId] >= s.updatedAt) continue;
        sessions[s.hostId] = s.value;
        newest[s.hostId] = s.updatedAt;
    }
    return { sessions, warnings };
}

// The sessions map of scanSessions
export const readSessions = (dir, opts) => scanSessions(dir, opts).sessions;

// --- facts from a KB plus a sessions folder ---

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

const EMPTY = new Set(["", "–", "-", "—"]);

// "Orchestrator (acceptance, T-149); User (merge; T-55)" → [{ target, text }]. Splits at ";" outside brackets.
export function parseWaitingFor(value) {
    if (typeof value !== "string" || EMPTY.has(value.trim())) return [];
    const parts = [];
    let depth = 0;
    let cur = "";
    for (const c of value) {
        if (c === "(" || c === "[") depth++;
        else if (c === ")" || c === "]") depth = Math.max(0, depth - 1);
        if (c === ";" && depth === 0) {
            parts.push(cur);
            cur = "";
        } else cur += c;
    }
    parts.push(cur);
    return parts
        .map((p) => p.trim())
        .filter((p) => !EMPTY.has(p))
        .map((text) => ({ target: text.split("(")[0].trim(), text }));
}

// Work state folder relative to the KB, the rule of status-file.mjs: devs dev/dev-<n>, others <role> or
// <role>/<role>-<k> for k ≥ 2
function workStateDir(role, slot) {
    if (typeof role !== "string" || !/^[a-z][a-z0-9-]*$/.test(role)) return null;
    const n = Number.isInteger(slot) && slot > 0 ? slot : null;
    if (role === "dev") return n ? `dev/dev-${n}` : null;
    return !n || n === 1 ? role : `${role}/${role}-${n}`;
}

function workStateOf(kb, role, slot) {
    const dir = workStateDir(role, slot);
    if (dir)
        for (const name of WORK_STATE_FILES) {
            const text = readText(path.join(kb, ...dir.split("/"), name));
            if (text === null) continue;
            const f = readWorkState(text);
            return {
                status: normalizeStatus(f.Status?.value),
                waitingFor: parseWaitingFor(f["Waiting for"]?.value),
            };
        }
    return { status: null, waitingFor: [] };
}

// Busy pool slots as title keys (T-155: the slot "Dev 2" matches the chat "Dev 2 - <project>")
function busyTitles(kb, project) {
    const pool = readJson(path.join(kb, "implementer", "dev-pool.json"));
    const slots = Array.isArray(pool?.slots) ? pool.slots : [];
    return new Set(
        slots
            .filter((s) => isObject(s) && s.status === "busy" && typeof s.title === "string")
            .map((s) => titleKey(s.title, project)),
    );
}

// The facts of the contract for every registry entry with a role. Read-only; missing inputs give empty values.
// opts: sessions (readSessions result, default: scanSessions of opts.dir or sessionsDir()), now (ms), alive (pid
// check), project (T-155: project name for titles with a suffix). Adds `warnings` (scanSessions warnings, [] with
// opts.sessions) to the contract facts.
export function buildFacts(
    kb,
    { sessions, dir, now = Date.now(), alive = pidAlive, project = null } = {},
) {
    const scan = sessions
        ? { sessions, warnings: [] }
        : scanSessions(dir ?? sessionsDir(), { now });
    const files = scan.sessions;
    const unassigned = Object.keys(files).some((k) => k.startsWith("?"));
    const reg = readJson(path.join(kb, "team", "registry.json"));
    const busy = busyTitles(kb, project);
    const chats = [];
    for (const [id, e] of Object.entries(isObject(reg) ? reg : {})) {
        if (!isObject(e) || typeof e.role !== "string" || !e.role) continue;
        const title = typeof e.title === "string" ? e.title : id;
        const slot = Number.isInteger(e.slot) ? e.slot : null;
        const session = id in files ? files[id] : unassigned ? "unknown" : null;
        chats.push({
            id,
            title,
            role: e.role,
            slot,
            session,
            pidAlive: isObject(session) ? alive(session.pid) : false,
            workState: workStateOf(kb, e.role, slot),
            sends: readSends(kb, id),
            busySlot: e.role === "dev" && busy.has(titleKey(title, project)),
        });
    }
    chats.sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
    return { now, project, chats, warnings: scan.warnings };
}

// --- the pure rule ---

export function chatStates(facts) {
    const out = {};
    for (const c of facts?.chats ?? []) {
        const s = c.session;
        if (s === null || s === undefined) out[c.id] = { state: "unloaded", since: null };
        else if (!isObject(s)) out[c.id] = { state: "unknown", since: null };
        else if (!c.pidAlive) out[c.id] = { state: "unloaded", since: null };
        else if (s.status === "busy") out[c.id] = { state: "busy", since: null };
        else if (s.status === "idle" && Number.isFinite(s.statusUpdatedAt))
            out[c.id] = { state: "idle", since: s.statusUpdatedAt };
        else out[c.id] = { state: "unknown", since: null };
    }
    return out;
}

export function episodeKey(stalled) {
    return (stalled ?? [])
        .map((s) => `${s.id}@${s.since ?? "unloaded"}|${(s.chain ?? []).join(",")}`)
        .sort()
        .join(";");
}

const roleIs = (c, role) => String(c?.role ?? "").toLowerCase() === role;

export function detectIdle(facts, { owner, minutes = IDLE_DEFAULTS.minutes } = {}) {
    const chats = facts?.chats ?? [];
    const now = facts?.now ?? Date.now();
    const states = chatStates(facts);
    const byId = new Map(chats.map((c) => [c.id, c]));
    // T-155: "Dev 2" and "Dev 2 - <project>" name the same chat, in the registry and in `Waiting for:`
    const key = (title) => titleKey(title, facts?.project ?? null);
    const byTitle = new Map(chats.map((c) => [key(c.title), c]));
    const me = byId.get(owner);
    const result = {
        idle: false,
        stalled: [],
        handledByOther: [],
        waitsForYou: [],
        unloaded: [],
        episode: null,
    };
    if (!me || !(roleIs(me, "orchestrator") || roleIs(me, "implementer"))) return result;

    const limit = minutes * 60_000;
    const dead = (c) => {
        const s = states[c.id];
        return s.state === "unloaded" || (s.state === "idle" && now - s.since >= limit);
    };
    const liveTargets = (c) =>
        (c.workState?.waitingFor ?? []).map((w) => byTitle.get(key(w.target))).filter(Boolean);

    // → { kind: "alive"|"dead"|"user", chain: [titles to the first dead end], ends: [dead-end chats], viaOwner }
    const walk = (c, pathIds) => {
        if (!dead(c)) return { kind: "alive", chain: [], ends: [], viaOwner: false };
        if (pathIds.includes(c.id)) return { kind: "dead", chain: [], ends: [c], viaOwner: false };
        const status = c.workState?.status;
        if (status !== "waiting") return { kind: "dead", chain: [], ends: [c], viaOwner: false };
        const targets = liveTargets(c);
        if (!targets.length) return { kind: "user", chain: [], ends: [], viaOwner: false };
        const next = [...pathIds, c.id];
        const branches = targets.map((t) => {
            const r = walk(t, next);
            return { ...r, chain: [t.title, ...r.chain], viaOwner: r.viaOwner || t.id === owner };
        });
        if (branches.some((b) => b.kind === "alive"))
            return { kind: "alive", chain: [], ends: [], viaOwner: false };
        const deadOnes = branches.filter((b) => b.kind === "dead");
        if (deadOnes.length)
            return {
                kind: "dead",
                chain: deadOnes[0].chain,
                ends: deadOnes.flatMap((b) => b.ends),
                viaOwner: false,
            };
        return { kind: "user", chain: [], ends: [], viaOwner: branches.some((b) => b.viaOwner) };
    };

    const implementer = chats.find((c) => roleIs(c, "implementer"));
    const implementerLive = !!implementer && states[implementer.id].state !== "unloaded";
    const isImplementer = roleIs(me, "implementer");
    const scope = isImplementer ? chats.filter((c) => c.id === owner || c.busySlot) : chats;
    const delegate = !isImplementer && implementerLive && implementer.id !== owner;
    // F-108-7: the Orchestrator delegates only what the Implementer's own watcher reports
    const other = delegate ? detectIdle(facts, { owner: implementer.id, minutes }) : null;
    const reported = new Set(other?.idle ? other.stalled.map((c) => c.id) : []);

    for (const c of scope)
        if (states[c.id].state === "unloaded") result.unloaded.push({ id: c.id, title: c.title });

    for (const c of scope) {
        if (c.id === owner || !dead(c)) continue;
        const status = c.workState?.status;
        let r;
        if (status === "working") r = { kind: "dead", chain: [], ends: [c] };
        else if (status === "waiting") r = walk(c, []);
        else continue;
        if (r.kind === "user") {
            if (r.viaOwner) result.waitsForYou.push({ id: c.id, title: c.title });
            continue;
        }
        if (r.kind !== "dead") continue;
        if (reported.has(c.id) || (r.ends.length && r.ends.every((e) => reported.has(e.id)))) {
            if (!result.handledByOther.some((h) => h.id === c.id))
                result.handledByOther.push({ id: c.id, title: c.title, by: implementer.title });
            continue;
        }
        const s = states[c.id];
        result.stalled.push({
            id: c.id,
            title: c.title,
            since: s.since,
            state: s.state,
            chain: r.chain,
        });
    }

    // F-108-7: the Implementer waits and its chains end dead in its own scope → those dead ends are stalled
    // whatever their status (blocked, free, no work state, a lost report)
    if (isImplementer && me.workState?.status === "waiting" && dead(me)) {
        const r = walk(me, []);
        if (r.kind === "dead")
            for (const e of r.ends) {
                if (e.id === owner || !scope.includes(e)) continue;
                if (result.stalled.some((s) => s.id === e.id)) continue;
                const s = states[e.id];
                result.stalled.push({
                    id: e.id,
                    title: e.title,
                    since: s.since,
                    state: s.state,
                    chain: [],
                });
            }
    }

    const r5 = scope.some((c) => states[c.id].state !== "unloaded");
    const r1 = scope.every(dead);
    result.idle = r5 && r1 && result.stalled.length > 0;
    result.episode = result.idle ? episodeKey(result.stalled) : null;
    return result;
}

// Idle watcher (T-108): hook entry for SessionStart and Stop, registered with async + asyncRewake (sync.mjs).
// Runs only in the supervising chats (Orchestrator, Implementer) and wakes only its own chat: exit 2 with a notice
// on stderr whose first line starts with "IDLE-CHECK:". Rule: idle.mjs (detectIdle); plan T-108 §4/§5, spike S-108.
//
// Order (N-6): CLAUDE_CODE_HOST_SESSION_ID → registry entry → role not orchestrator/implementer → exit 0; then the
// idle config (enabled false → exit 0); then the lock. Nothing else is read before (the KB path itself comes from
// team/team.config.json, as in every hook).
// Lock <KB>/team/idle/<hostId>.lock: created with flag "wx" ({ pid, startedAt }); an empty or unparsable lock
// younger than LOCK_GRACE_MS is held (its writer is between create and write), older is stale; a lock whose pid
// is dead is stale and taken over (the harness kills the hook at its timeout without a signal, S-108 c).
// Each poll (pollSeconds): parent process gone (parentGone) or the own session file gone (once seen) → exit 0 (S-108 d/f);
// else detectIdle. A new episode → episode file <hostId>.json, notice, exit 2. Lifetime watchSeconds → exit 0, or
// the renewal (S-108 consequence 3, F-108-8): exit 2 with the renewal notice whenever a chat in scope other than the
// own one is busy or idle < N, at most maxRenewals times in a row.
// Renewal count (episode file: renewals, renewalPending): a renewal sets renewalPending; the next watcher that takes
// the lock clears it and keeps the count (the renewal turn started it). A watcher that starts without
// renewalPending (any other own turn, a session start) and a real wake reset the count to 0. At the cap the watcher
// ends with exit 0 (logged); the next own turn of the chat starts a new count.
// Errors never wake: they go to <hostId>.log (last LOG_LINES lines) and the watcher exits 0.
// It does not import lib.mjs: that module ends errors with exit 2, which here would wake the chat.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveKbRoot } from "./kb-root.mjs";
import { buildFacts, chatStates, detectIdle, idleConfig, pidAlive } from "./idle.mjs";
import { projectName } from "./pools.mjs";

export const LOCK_GRACE_MS = 5000;
export const LOG_LINES = 50;
export const SUPERVISING = ["orchestrator", "implementer"];

// The renewal notice: count n of the cap; the last allowed renewal says that the watcher stops after it
export function renewalNotice(n, cap) {
    const text = `IDLE-CHECK: renewal ${n}/${cap}, nothing to report, end your turn.`;
    return n >= cap
        ? `${text} This was the last renewal: after the next watch period the watcher stops until your next own turn.`
        : text;
}

const TEAM_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const isObject = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readJson(file) {
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
        return null;
    }
}

const hhmm = (ms) => {
    const d = new Date(ms);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const names = (list) => (list.length ? list.map((c) => c.title).join(", ") : "–");

// The notice of plan §4. result: detectIdle result; facts: the facts it ran on; minutes: N
export function noticeText(result, facts, { minutes }) {
    const byId = new Map((facts?.chats ?? []).map((c) => [c.id, c]));
    const stalled = result.stalled.map((s) => {
        const c = byId.get(s.id);
        const when = s.state === "unloaded" ? "unloaded" : `idle since ${hhmm(s.since)}`;
        const what =
            c?.workState?.status === "waiting"
                ? `waiting for ${s.chain.join(" → ") || "–"}`
                : (c?.workState?.status ?? "working");
        return `${s.title} (${when}, ${what})`;
    });
    const lines = [
        "IDLE-CHECK: team notice, not an error. No user input.",
        `Stalled ≥ ${minutes} min (yours): ${stalled.length ? stalled.join("; ") : "–"}`,
        `Handled by the Implementer: ${names(result.handledByOther)}`,
    ];
    if (result.waitsForYou.length)
        lines.push(`Waiting for you (you wait for the user): ${names(result.waitsForYou)}`);
    lines.push(
        `Unloaded: ${names(result.unloaded)}`,
        "Do: check the named chats per your role (section 'Idle check'), restart what you can, tell the user in plain words.",
    );
    return lines.join("\n");
}

// Scope of the owner (idle.mjs §3.3): Implementer → itself + busy-slot devs; Orchestrator → all chats
export function scopeOf(facts, owner) {
    const chats = facts?.chats ?? [];
    const me = chats.find((c) => c.id === owner);
    if (String(me?.role).toLowerCase() === "implementer")
        return chats.filter((c) => c.id === owner || c.busySlot);
    return chats;
}

// A chat in scope other than the owner is busy or idle < N
export function somethingRuns(facts, owner, minutes) {
    const states = chatStates(facts);
    const now = facts?.now ?? Date.now();
    return scopeOf(facts, owner).some((c) => {
        if (c.id === owner) return false;
        const s = states[c.id];
        return s.state === "busy" || (s.state === "idle" && now - s.since < minutes * 60_000);
    });
}

// The parent counts as gone when the parent id changed since the start (POSIX re-parents an orphan, e.g. to 1)
// or the start parent is dead (Windows keeps the dead id)
export function parentGone(startPpid, nowPpid, alive = pidAlive) {
    return nowPpid !== startPpid || !alive(startPpid);
}

// ---------- the hook ----------

async function main() {
    const id = process.env.CLAUDE_CODE_HOST_SESSION_ID || null;
    if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) return 0;
    const projectDir = process.env.CLAUDE_PROJECT_DIR || path.dirname(TEAM_DIR);
    const config = readJson(path.join(projectDir, "team", "team.config.json"));
    if (!isObject(config)) return 0;
    let kb;
    try {
        kb = resolveKbRoot({ projectDir, config }).path;
    } catch {
        return 0;
    }
    const reg = readJson(path.join(kb, "team", "registry.json"));
    const entry = isObject(reg) ? reg[id] : null;
    if (!isObject(entry) || !SUPERVISING.includes(String(entry.role).toLowerCase())) return 0;

    const cfg = idleConfig(config);
    const project = projectName(config, projectDir); // T-155: titles "<role title> - <project>"
    if (!cfg.enabled) return 0;

    const dir = path.join(kb, "team", "idle");
    const lockFile = path.join(dir, `${id}.lock`);
    const episodeFile = path.join(dir, `${id}.json`);
    const logFile = path.join(dir, `${id}.log`);
    const log = (line) => {
        try {
            fs.mkdirSync(dir, { recursive: true });
            let lines = [];
            try {
                lines = fs.readFileSync(logFile, "utf8").split("\n").filter(Boolean);
            } catch {
                // first line
            }
            lines.push(`${new Date().toISOString()} pid=${process.pid} ${line}`);
            fs.writeFileSync(logFile, lines.slice(-LOG_LINES).join("\n") + "\n");
        } catch {
            // the log is best effort
        }
    };

    try {
        fs.mkdirSync(dir, { recursive: true });
    } catch (e) {
        log(`cannot create ${dir}: ${e.message}`);
        return 0;
    }
    if (!takeLock(lockFile)) return 0;
    const release = () => {
        try {
            if (readJson(lockFile)?.pid === process.pid) fs.unlinkSync(lockFile);
        } catch {
            // already gone
        }
    };
    for (const w of cfg.warnings) log(`config: ${w}`);
    const startPpid = process.ppid; // an orphan gets a new parent on POSIX (F-v050-1)
    log(`start ppid=${startPpid} watchSeconds=${cfg.watchSeconds}`);

    const started = Date.now();
    const readEpisode = () => {
        const e = readJson(episodeFile);
        return isObject(e) ? e : {};
    };
    const writeEpisode = (fields) => {
        const { renewedFor, ...ep } = { ...readEpisode(), ...fields }; // renewedFor: the rule before F-108-8
        fs.writeFileSync(episodeFile, `${JSON.stringify(ep, null, 2)}\n`);
    };
    // renewal count: kept only when the renewal turn started this watcher
    try {
        const ep = readEpisode();
        if (ep.renewalPending === true) writeEpisode({ renewalPending: false });
        else if (ep.renewals) {
            writeEpisode({ renewals: 0 });
            log(`renewal count reset (was ${ep.renewals}): started by an own turn`);
        }
    } catch (e) {
        log(`episode file: ${e.message}`);
    }
    let sawOwnSession = false;
    const warned = new Set();
    let last = null; // facts of the last good poll
    try {
        for (;;) {
            if (parentGone(startPpid, process.ppid)) {
                log("exit: parent process gone");
                return 0;
            }
            try {
                const facts = buildFacts(kb, { project });
                for (const w of facts.warnings ?? []) {
                    if (warned.has(w)) continue;
                    warned.add(w);
                    log(`sessions: ${w}`);
                }
                const own = facts.chats.find((c) => c.id === id);
                if (own?.session) sawOwnSession = true;
                else if (sawOwnSession && own?.session === null) {
                    log("exit: own session file gone");
                    return 0;
                }
                last = facts;
                const result = detectIdle(facts, { owner: id, minutes: cfg.minutes });
                if (result.idle && result.episode !== readEpisode().episode) {
                    writeEpisode({
                        episode: result.episode,
                        wokeAt: new Date().toISOString(),
                        stalled: result.stalled,
                        renewals: 0,
                        renewalPending: false,
                    });
                    log(`wake: ${result.episode}`);
                    process.stderr.write(
                        `${noticeText(result, facts, { minutes: cfg.minutes })}\n`,
                    );
                    return 2;
                }
            } catch (e) {
                log(`poll error: ${e?.stack ?? e}`);
            }
            const left = cfg.watchSeconds * 1000 - (Date.now() - started);
            if (left <= 0) break;
            await sleep(Math.min(cfg.pollSeconds * 1000, left));
        }
        // lifetime reached: renewal while something runs, at most maxRenewals in a row; else a quiet end
        if (last && somethingRuns(last, id, cfg.minutes)) {
            const done = readEpisode().renewals;
            const count = Number.isInteger(done) && done > 0 ? done : 0;
            if (count >= cfg.maxRenewals) {
                log(
                    `exit: renewal cap reached (${count}/${cfg.maxRenewals}), watching again after the next own turn`,
                );
                return 0;
            }
            const n = count + 1;
            writeEpisode({
                renewals: n,
                renewalPending: true,
                renewedAt: new Date().toISOString(),
            });
            log(`renewal ${n}/${cfg.maxRenewals}`);
            process.stderr.write(`${renewalNotice(n, cfg.maxRenewals)}\n`);
            return 2;
        }
        log("exit: lifetime reached");
        return 0;
    } catch (e) {
        log(`error: ${e?.stack ?? e}`);
        return 0;
    } finally {
        release();
    }
}

// true when this process holds the lock afterwards
export function takeLock(lockFile, { now = Date.now, alive = pidAlive } = {}) {
    const content = JSON.stringify({ pid: process.pid, startedAt: new Date(now()).toISOString() });
    const create = () => {
        try {
            fs.writeFileSync(lockFile, content, { flag: "wx" });
            return true;
        } catch {
            return false;
        }
    };
    if (create()) return true;
    let text;
    let mtime;
    try {
        text = fs.readFileSync(lockFile, "utf8");
        mtime = fs.statSync(lockFile).mtimeMs;
    } catch {
        return create(); // removed in between
    }
    let held;
    let lock = null;
    try {
        lock = JSON.parse(text);
    } catch {
        // empty or half written
    }
    if (isObject(lock) && Number.isInteger(lock.pid))
        held = lock.pid !== process.pid && alive(lock.pid);
    else held = now() - mtime < LOCK_GRACE_MS;
    if (held) return false;
    // stale: take over, unless another watcher replaced it meanwhile
    try {
        if (fs.readFileSync(lockFile, "utf8") !== text) return false;
        fs.unlinkSync(lockFile);
    } catch {
        // gone already: try to create it
    }
    return create();
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
    process.on("uncaughtException", () => process.exit(0));
    process.on("unhandledRejection", () => process.exit(0));
    main().then(
        (code) => process.exit(code),
        () => process.exit(0),
    );
}

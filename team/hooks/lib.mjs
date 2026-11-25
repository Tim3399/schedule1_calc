// Shared helpers for the team hooks: configuration, roles, registry of the chats.
//
// The registry maps every app session ID (CLAUDE_CODE_HOST_SESSION_ID, e.g. "local_…") to its title
// and role. The SessionStart hook writes it, and so does a rename.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { taskFamily } from "./ids-shared.mjs";
import { workStateFile } from "./work-state.mjs";
import { deny, fail, userConfigRoots } from "./user-config.mjs";
import { resolveKbRoot, kbLine } from "./kb-root.mjs";
import {
    POOL_LIMITS,
    TITLE_SEPARATOR,
    foreignBase,
    fullTitle,
    matchTitle,
    poolOfChat,
    projectName,
    titleKey as poolsTitleKey,
    workStateDir,
} from "./pools.mjs";

const TEAM_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// fail and deny live in user-config.mjs (no side effects on import), so that policy.mjs can use them before lib.mjs.
export { fail, deny, userConfigRoots };
// The KB resolver has no side effects on import; kb-root.mjs documents the order of sources (T-82).
export { resolveKbRoot, kbLine };

// Errors outside a try (top level of the hooks, promises) also end with exit 2 instead of exit 1.
// Placed before reading the configuration, so it applies while this module loads.
process.on("uncaughtException", (e) => fail(`Unexpected error: ${e?.stack ?? e}`));
process.on("unhandledRejection", (e) => fail(`Unexpected error: ${e?.stack ?? e}`));

// How to repair each file (R-8a): roles.json is generated, team.config.json is written by hand
// (sync itself stops with exit 2 on an invalid config).
const REPAIR = {
    "roles.json": "Regenerate it with node team/sync.mjs.",
    "team.config.json":
        "Repair it by hand (fields: see the package README on team.config.json), then run node team/sync.mjs.",
};

function readTeamJson(name, valid) {
    const file = path.join(TEAM_DIR, name);
    let value;
    try {
        value = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (e) {
        fail(`${file} is not readable or not valid JSON (${e.message}). ${REPAIR[name]}`);
    }
    if (!valid(value)) fail(`${file} does not have the expected format. ${REPAIR[name]}`);
    return value;
}

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// kbRoot is optional (placeholder mode, T-82). If the field is present it must be a non-empty string:
// "" and non-strings stay an error (fail closed), so a typo never switches silently to the default path.
export const config = readTeamJson(
    "team.config.json",
    (v) =>
        isObject(v) &&
        (!("kbRoot" in v) || (typeof v.kbRoot === "string" && v.kbRoot.trim() !== "")),
);
export const roles = readTeamJson("roles.json", (v) => isObject(v) && Array.isArray(v.chats));
let resolvedKb;
try {
    // TEAM_KB_OVERRIDE only for tests and team/hooks/selftest.mjs
    resolvedKb = resolveKbRoot({ projectDir: path.dirname(TEAM_DIR), config });
} catch (e) {
    fail(`Knowledge base root not usable: ${e.message} See team/team.config.json.`);
}
export const KB_SOURCE = resolvedKb.source;
export const KB = resolvedKb.path;
export const REGISTRY = path.join(KB, "team", "registry.json");
// Project name for chat titles "<role title> - <project>" (T-155): config.project.name, default the folder name
// of the main checkout
export const PROJECT = projectName(config, path.dirname(TEAM_DIR));
// Comparison key of a title in this project ("Orchestrator" and "Orchestrator - <project>" are equal)
export const titleKey = (title) => poolsTitleKey(title, PROJECT);
// Title a role chat of this project carries: "<role title> - <project>"
export const projectTitle = (base) => fullTitle(base, PROJECT);

// strict: unreadable or empty input and anything but a JSON object blocks (fail).
// Without strict it becomes {} (for hooks that decide nothing).
export function readInput({ strict = false } = {}) {
    let input;
    try {
        input = JSON.parse(fs.readFileSync(0, "utf8") || (strict ? "" : "{}"));
    } catch (e) {
        if (strict)
            fail(`The hook input on stdin is not readable or not valid JSON (${e.message}).`);
        return {};
    }
    if (strict && !isObject(input)) fail("The hook input on stdin is not a JSON object.");
    return input;
}

// Detection of team styles at user level lives in user-styles.mjs (no side effects on import).
export { userLevelTeamStyles, userLevelTeamStylesWarning } from "./user-styles.mjs";

export const hostId = () => process.env.CLAUDE_CODE_HOST_SESSION_ID || null;

// title -> { role, title, slot, chat } or null, only titles inside the pool (pools.mjs): "Dev {n}" matches
// Dev 1 … Dev <pool>; "Critic" is slot 1, "Critic <k>" slot k up to the pool, "Critic 1" never.
// T-155: "Dev 3 - <project>" matches too, another project's suffix gives null; the returned title is the base.
export function roleForTitle(title) {
    const m = matchTitle(roles, title, { inPoolOnly: true, project: PROJECT });
    return m && { role: m.role, title: m.title, slot: m.slot, chat: m.chat };
}

// Registered chat with a role whose title suffix names another project (project.name changed or folder renamed):
// { base, old } for the hint, else null.
export function foreignProject(entry) {
    if (!entry?.role || matchTitle(roles, entry.title, { project: PROJECT })) return null;
    const base = foreignBase(entry.title);
    if (!base) return null;
    return {
        base,
        old: entry.title
            .trim()
            .slice(base.length + TITLE_SEPARATOR.length)
            .trim(),
    };
}

// Registered chat whose title lies above its pool (shrunk pool, What 10): { key, pool } of the pool
// setting, else null. Such a chat has its role only through the keep rule of registerTitle.
export function abovePool(entry) {
    if (!entry?.role) return null;
    const m = matchTitle(roles, entry.title, { project: PROJECT });
    if (!m || m.inPool || m.role !== entry.role) return null;
    return { key: POOL_LIMITS[m.role]?.key ?? null, pool: poolOfChat(m.chat, roles) };
}

export const chatOf = (roleName) => roles.chats.find((c) => c.role === roleName) ?? null;

// { reg, missing, broken }: a missing registry is normal at the first start (empty).
// broken holds the reason when it exists but is not readable or not a JSON object.
export function readRegistry() {
    let text;
    try {
        text = fs.readFileSync(REGISTRY, "utf8");
    } catch (e) {
        if (e.code === "ENOENT") return { reg: {}, missing: true, broken: null };
        return { reg: {}, missing: false, broken: e.message };
    }
    try {
        const reg = JSON.parse(text);
        if (!isObject(reg)) throw new Error("not a JSON object");
        return { reg, missing: false, broken: null };
    } catch (e) {
        return { reg: {}, missing: false, broken: e.message };
    }
}

export const loadRegistry = () => readRegistry().reg;

// Only call inside withRegistryLock (registerTitle does).
export function saveRegistry(reg) {
    fs.mkdirSync(path.dirname(REGISTRY), { recursive: true });
    const tmp = `${REGISTRY}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(reg, null, 2) + "\n");
    // Windows: a concurrent reader can make the replace fail briefly with EPERM/EBUSY/EACCES.
    for (let attempt = 0; ; attempt++) {
        try {
            fs.renameSync(tmp, REGISTRY);
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

// Every registry read-modify-write runs under this lock (T-74): parallel joins lost entries before.
export const REGISTRY_LOCK = `${REGISTRY}.lock`;
const LOCK_BUSY = new Set(["EEXIST", "EPERM", "EACCES", "EBUSY"]);
const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function pidAlive(pid) {
    try {
        process.kill(pid, 0);
        return true;
    } catch (e) {
        return e.code !== "ESRCH";
    }
}

// true if the lock file at this moment belongs to a dead holder, or is unreadable and older than timeoutMs
function lockIsStale(timeoutMs) {
    let text;
    try {
        text = fs.readFileSync(REGISTRY_LOCK, "utf8");
    } catch (e) {
        return false; // gone (ENOENT) or not readable right now: retry
    }
    try {
        const { pid } = JSON.parse(text);
        if (Number.isInteger(pid) && pid > 0) return !pidAlive(pid);
    } catch {
        // unreadable content, judged by age below
    }
    try {
        return Date.now() - fs.statSync(REGISTRY_LOCK).mtimeMs > timeoutMs;
    } catch {
        return false;
    }
}

// Removes a stale lock. A second guard file makes sure only one process takes over and that it never
// removes a fresh lock another process created right after the stale one was removed.
function takeOverStaleLock(timeoutMs) {
    const guard = `${REGISTRY_LOCK}.takeover`;
    try {
        fs.writeFileSync(guard, String(process.pid), { flag: "wx" });
    } catch (e) {
        // A guard is held only for a moment; an old one is left over from a crashed process.
        try {
            if (Date.now() - fs.statSync(guard).mtimeMs > timeoutMs)
                fs.rmSync(guard, { force: true });
        } catch {
            // gone meanwhile
        }
        return;
    }
    try {
        if (lockIsStale(timeoutMs)) fs.rmSync(REGISTRY_LOCK, { force: true });
    } finally {
        fs.rmSync(guard, { force: true });
    }
}

// Runs fn() while holding REGISTRY_LOCK and returns its result. Fail closed: if the lock is still held
// by a live process after timeoutMs, the hook stops with exit 2 and nothing is written.
export function withRegistryLock(fn, { timeoutMs = 5000 } = {}) {
    fs.mkdirSync(path.dirname(REGISTRY), { recursive: true });
    const content = JSON.stringify({ pid: process.pid, at: new Date().toISOString() });
    const until = Date.now() + timeoutMs;
    let lastCode;
    for (;;) {
        try {
            fs.writeFileSync(REGISTRY_LOCK, content, { flag: "wx" });
            break;
        } catch (e) {
            // Windows: wx on a lock another process is deleting fails with EPERM/EACCES/EBUSY, not EEXIST.
            if (!LOCK_BUSY.has(e.code)) throw e;
            lastCode = e.code;
        }
        if (lockIsStale(timeoutMs)) {
            takeOverStaleLock(timeoutMs);
            continue;
        }
        if (Date.now() >= until) {
            // F-v031-4: without a lock file no other process holds it; name the real error instead.
            if (!fs.existsSync(REGISTRY_LOCK))
                fail(
                    `The team registry is locked: ${REGISTRY_LOCK} could not be created for more than ${Math.round(timeoutMs / 1000)} s (last error: ${lastCode}). ${REGISTRY} stays unchanged. Check the access rights on ${path.dirname(REGISTRY_LOCK)}.`,
                );
            fail(
                `The team registry is locked: ${REGISTRY_LOCK} has been held by another process for more than ${Math.round(timeoutMs / 1000)} s. ${REGISTRY} stays unchanged. If no team hook is running any more, delete the lock file.`,
            );
        }
        sleepSync(20 + Math.floor(Math.random() * 30));
    }
    // Also release if fn ends the process with process.exit.
    const release = () => {
        try {
            if (fs.readFileSync(REGISTRY_LOCK, "utf8") === content) fs.rmSync(REGISTRY_LOCK);
        } catch {
            // already gone
        }
    };
    process.once("exit", release);
    try {
        return fn();
    } finally {
        process.removeListener("exit", release);
        release();
    }
}

// Backs up a broken registry as registry.json.broken-<ISO time> (colons replaced by "-").
// The registry itself stays byte-identical. If a backup with exactly this content exists, no new one is made.
// Returns the path of the backup, or null if the backup failed (message on stderr).
export function backupBrokenRegistry() {
    try {
        const bytes = fs.readFileSync(REGISTRY);
        const dir = path.dirname(REGISTRY);
        const prefix = `${path.basename(REGISTRY)}.broken-`;
        for (const name of fs.readdirSync(dir)) {
            if (name.startsWith(prefix) && bytes.equals(fs.readFileSync(path.join(dir, name))))
                return path.join(dir, name);
        }
        const file = path.join(dir, prefix + new Date().toISOString().replace(/:/g, "-"));
        fs.copyFileSync(REGISTRY, file, fs.constants.COPYFILE_EXCL);
        process.stderr.write(`Team hook: broken registry backed up as ${file}.\n`);
        return file;
    } catch (e) {
        process.stderr.write(
            `Team hook: broken registry ${REGISTRY} could not be backed up (${e.message}).\n`,
        );
        return null;
    }
}

// Never overwrite a broken registry with an empty one: back it up, message on stderr, return null.
// Read and write happen together under the registry lock.
export function registerTitle(id, title, extra = {}) {
    return withRegistryLock(() => registerTitleLocked(id, title, extra));
}

function registerTitleLocked(id, title, extra) {
    const { reg, broken } = readRegistry();
    if (broken) {
        process.stderr.write(
            `Team hook: ${REGISTRY} is broken (${broken}) and stays unchanged. Chat ${id} was not registered.\n`,
        );
        backupBrokenRegistry();
        return null;
    }
    // Keep rule (N-6, N-9, N-10): a title inside the pool gets its role. A title above the pool keeps the
    // role only if this chat already had it (shrunk pool); a new chat or one renamed to it gets none.
    const m = matchTitle(roles, title, { project: PROJECT });
    let r = m && (m.inPool || reg[id]?.role === m.role) ? m : null;
    // F-155-2: after a change of project.name the suffix names the old project; the chat keeps the role it had
    // while the base still matches it (the session-start hint asks to rename the chat).
    if (!m && reg[id]?.role) {
        const k = matchTitle(roles, title, { project: PROJECT, keepForeign: true });
        if (k && k.role === reg[id].role) r = k;
    }
    reg[id] = {
        ...(reg[id] ?? {}),
        ...extra,
        title: title ?? reg[id]?.title ?? null,
        role: r?.role ?? null,
        slot: r?.slot ?? null,
        updatedAt: new Date().toISOString(),
    };
    saveRegistry(reg);
    return reg[id];
}

// Comparison key of a registered chat: a chat that kept its role under a former project's suffix (F-155-2) counts
// with its role title, so a new claim never gets that role a second time.
export function entryKey(entry) {
    if (entry?.role) {
        const k = matchTitle(roles, entry.title, { project: PROJECT, keepForeign: true });
        if (k && k.role === entry.role) return k.title.toLowerCase();
    }
    return titleKey(entry?.title);
}

// Who holds a role title right now (except id)? "Orchestrator" and "Orchestrator - <project>" are the same title.
export function holderOf(title, exceptId) {
    const reg = loadRegistry();
    return (
        Object.entries(reg).find(
            ([id, e]) => id !== exceptId && e.title && entryKey(e) === titleKey(title),
        )?.[0] ?? null
    );
}

// Path of a role's work state: work-state.md if it exists, else arbeitsstand.md if that exists,
// else work-state.md (new files are English, T-61). Forward slashes. Folder per slot from pools.mjs
// (critic slot 1 critic/, slot k critic/critic-<k>/, dev dev/dev-<n>/); without a slot the role folder.
export function workStatePath(entry) {
    if (!entry?.role) return null;
    const chat = chatOf(entry.role);
    const dir = chat && entry.slot ? workStateDir(chat, entry.slot) : entry.role;
    return workStateFile(path.join(KB, dir), (file) => fs.existsSync(file));
}

// Task family of an assignment ID: the shared ID grammar lives in ids-shared.mjs (T-61).
export { taskFamily };

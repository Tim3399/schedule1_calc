// Stop guard (T-108, R-14b point 5): keeps the Implementer from ending its turn while its own background tasks
// still run. Blocks once ({"decision":"block","reason":…}) when the chat's registry role is implementer, the idle
// monitor is on (idleConfig(config).enabled, opt-in since D-186), its work state says working, the Stop input
// lists background_tasks and stop_hook_active is false; otherwise, and on any error, the stop is allowed. Every
// other role passes at once (T-156, F-108-9: no forced extra round). sync registers it for all chats; it decides
// at run time.
// It does not import lib.mjs: that module ends errors with exit 2, which would block the stop.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { idleConfig } from "./idle.mjs";
import { resolveKbRoot } from "./kb-root.mjs";
import { normalizeStatus, readWorkState, WORK_STATE_FILES } from "./work-state.mjs";

const TEAM_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const isObject = (v) => !!v && typeof v === "object" && !Array.isArray(v);

function readJson(file) {
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
        return null;
    }
}

// Work state folder of a registry entry: devs dev/dev-<n>, others <role> or <role>/<role>-<k> for k ≥ 2
function workStateDir(role, slot) {
    if (typeof role !== "string" || !/^[a-z][a-z0-9-]*$/.test(role)) return null;
    const n = Number.isInteger(slot) && slot > 0 ? slot : null;
    if (role === "dev") return n ? `dev/dev-${n}` : null;
    return !n || n === 1 ? role : `${role}/${role}-${n}`;
}

function workStatus(kb, entry) {
    const dir = workStateDir(entry.role, entry.slot);
    if (!dir) return null;
    for (const name of WORK_STATE_FILES) {
        let text;
        try {
            text = fs.readFileSync(path.join(kb, ...dir.split("/"), name), "utf8");
        } catch {
            continue;
        }
        return normalizeStatus(readWorkState(text.replace(/\r\n?/g, "\n")).Status?.value);
    }
    return null;
}

export const REASON = (tasks) =>
    `Your work state says working and background tasks still run (${tasks}). Do not end the turn yet: wait for their result (read the task output), then finish the step. This block happens once.`;

function decide(input) {
    if (!isObject(input) || input.stop_hook_active === true) return null;
    const tasks = Array.isArray(input.background_tasks) ? input.background_tasks : [];
    if (!tasks.length) return null;
    const id = process.env.CLAUDE_CODE_HOST_SESSION_ID || null;
    if (!id) return null;
    const projectDir = process.env.CLAUDE_PROJECT_DIR || path.dirname(TEAM_DIR);
    const config = readJson(path.join(projectDir, "team", "team.config.json"));
    if (!isObject(config)) return null;
    if (!idleConfig(config).enabled) return null;
    const kb = resolveKbRoot({ projectDir, config }).path;
    const reg = readJson(path.join(kb, "team", "registry.json"));
    const entry = isObject(reg) ? reg[id] : null;
    if (!isObject(entry) || entry.role !== "implementer") return null;
    if (workStatus(kb, entry) !== "working") return null;
    const list = tasks
        .map((t) => (isObject(t) ? String(t.description ?? t.id ?? "task") : String(t)))
        .join("; ");
    return { decision: "block", reason: REASON(list) };
}

try {
    const out = decide(JSON.parse(fs.readFileSync(0, "utf8") || "{}"));
    if (out) process.stdout.write(JSON.stringify(out));
} catch {
    // any error: allow the stop
}
process.exit(0);

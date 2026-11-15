// PreCompact hook: appends one line per compaction to <KB>/team/compact-log.jsonl
// ({"time":"<ISO>","sessionId":"…","title":"…"}). It never blocks and always exits with 0,
// also on empty stdin, a broken configuration or registry, and write errors (message on stderr only).
//
// Deliberately without lib.mjs: its fail() exits with 2, which would disturb the compaction here.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveKbRoot } from "./kb-root.mjs";

const warn = (message) => process.stderr.write(`Team hook (PreCompact): ${message}\n`);
process.on("uncaughtException", (e) => {
    warn(`Unexpected error: ${e?.message ?? e}`);
    process.exit(0);
});
process.on("unhandledRejection", (e) => {
    warn(`Unexpected error: ${e?.message ?? e}`);
    process.exit(0);
});

const TEAM_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function tryJson(read) {
    try {
        return JSON.parse(read());
    } catch {
        return null;
    }
}

try {
    const input = tryJson(() => fs.readFileSync(0, "utf8")) ?? {};
    const config = tryJson(() => fs.readFileSync(path.join(TEAM_DIR, "team.config.json"), "utf8"));
    let kb = null;
    try {
        // TEAM_KB_OVERRIDE only for tests and team/hooks/selftest.mjs; placeholder mode resolves at runtime (T-82)
        kb = resolveKbRoot({ projectDir: path.dirname(TEAM_DIR), config: config ?? {} }).path;
    } catch (e) {
        warn(`Knowledge base root not usable (${e.message}), compaction not logged.`);
    }
    if (kb !== null) {
        const host = process.env.CLAUDE_CODE_HOST_SESSION_ID || null;
        const reg = tryJson(() => fs.readFileSync(path.join(kb, "team", "registry.json"), "utf8"));
        const title =
            (host && reg && typeof reg === "object" ? reg[host]?.title : null) ??
            input.session_title ??
            null;
        const entry = {
            time: new Date().toISOString(),
            sessionId: host ?? input.session_id ?? null,
            title,
        };
        const file = path.join(kb, "team", "compact-log.jsonl");
        try {
            fs.mkdirSync(path.dirname(file), { recursive: true });
            fs.appendFileSync(file, JSON.stringify(entry) + "\n");
        } catch (e) {
            warn(`${file} not writable (${e.message}), compaction not logged.`);
        }
    }
} catch (e) {
    warn(`Unexpected error: ${e?.message ?? e}`);
}
process.exit(0);

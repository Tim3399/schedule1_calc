// SubagentStart hook: gives every subagent the same KB line as the SessionStart hook.
// It cannot block the start and writes nothing, so it always exits with 0.
// Deliberately without lib.mjs (whose fail() exits with 2): only the resolver and team.config.json.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveKbRoot, kbLine } from "./kb-root.mjs";

const TEAM_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

let context;
try {
    const config = JSON.parse(fs.readFileSync(path.join(TEAM_DIR, "team.config.json"), "utf8"));
    context = kbLine(resolveKbRoot({ projectDir: path.dirname(TEAM_DIR), config }));
} catch (e) {
    context = `Team: the knowledge base root cannot be determined (${e.message}). Use the absolute path from your assignment.`;
}
process.stdout.write(
    JSON.stringify({
        hookSpecificOutput: { hookEventName: "SubagentStart", additionalContext: context },
    }),
);
process.exit(0);

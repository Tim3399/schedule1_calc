// Where is the knowledge base? Tracked files may only name the KB placeholder (KB_PLACEHOLDER below); the path is resolved at runtime.
// No side effects on import and no reading of roles.json, so sync.mjs can import it too.
// Starts no git process (hooks run before every tool call).
//
// Order (the first source that is set wins):
//   1. env TEAM_KB_OVERRIDE (tests, team/hooks/selftest.mjs)                  source "override"
//   2. kbRoot in team/team.config.json (config mode)                          source "config"
//   3. env <PROJECT>_KB_ROOT, e.g. AI_INFRA_KB_ROOT                           source "env"
//   4. kbRoot in <main checkout>/team/team.config.local.json (not tracked)    source "local"
//   5. <home>/git/<project>-kb                                                source "default"

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// split, so that render/sync do not replace it when the template is copied
export const KB_PLACEHOLDER = "<KB_" + "ROOT>";

// forward slashes on Windows (C:/…/git/demo-kb), as everywhere else in the team files
const slashes = (p) => (process.platform === "win32" ? p.replace(/\\/g, "/") : p);

export function envName(projectName) {
    if (typeof projectName !== "string" || projectName.trim() === "")
        throw new Error(
            "project.name is missing or empty in team/team.config.json, so the name of the KB environment variable is unknown.",
        );
    return projectName.toUpperCase().replace(/[^A-Z0-9]+/g, "_") + "_KB_ROOT";
}

const readText = (file) => {
    try {
        return fs.readFileSync(file, "utf8");
    } catch {
        return null;
    }
};

// The main checkout of dir. In a linked worktree <dir>/.git is a file ("gitdir: <main>/.git/worktrees/<name>");
// its commondir file points at <main>/.git. Reads files only, no git process. Anything else: dir itself.
export function mainCheckoutDir(dir) {
    const dotGit = path.join(dir, ".git");
    let stat;
    try {
        stat = fs.statSync(dotGit);
    } catch {
        return dir;
    }
    if (!stat.isFile()) return dir;
    const gitdirLine = readText(dotGit)?.match(/^gitdir:\s*(.+?)\s*$/m);
    if (!gitdirLine) return dir;
    const gitDir = path.resolve(dir, gitdirLine[1]);
    const commondir = readText(path.join(gitDir, "commondir"))?.trim();
    if (!commondir) return dir; // submodule or similar: no commondir
    const common = path.resolve(gitDir, commondir);
    if (path.basename(common) !== ".git") return dir; // bare main repo: no checkout to name
    return path.dirname(common);
}

// -> { path, source }. Throws on an unusable value (the hooks turn that into fail closed or a hint).
// Absolute in either notation, whatever platform runs: "D:/x" and "C:\x" also count on Linux (a tracked kbRoot is shared across platforms)
export const isAbsoluteAnywhere = (p) => path.win32.isAbsolute(p) || path.posix.isAbsolute(p);

export function resolveKbRoot({
    env = process.env,
    projectDir,
    home = os.homedir(),
    config = {},
} = {}) {
    const found = (value, source, where) => {
        if (typeof value !== "string" || value.trim() === "" || !isAbsoluteAnywhere(value))
            throw new Error(
                `${where}: ${JSON.stringify(value)} is not an absolute path to the knowledge base.`,
            );
        return { path: slashes(value), source };
    };

    if (env.TEAM_KB_OVERRIDE)
        return found(env.TEAM_KB_OVERRIDE, "override", "environment variable TEAM_KB_OVERRIDE");
    if (config && "kbRoot" in config)
        return found(config.kbRoot, "config", "kbRoot in team/team.config.json");

    const name = envName(config?.project?.name);
    if (env[name]) return found(env[name], "env", `environment variable ${name}`);

    if (projectDir) {
        const localFile = path.join(mainCheckoutDir(projectDir), "team", "team.config.local.json");
        const text = readText(localFile);
        if (text !== null) {
            let local;
            try {
                local = JSON.parse(text);
            } catch (e) {
                throw new Error(`${localFile} is not valid JSON (${e.message}).`);
            }
            return found(local?.kbRoot, "local", `kbRoot in ${localFile}`);
        }
    }

    return {
        path: slashes(path.join(home, "git", `${config.project.name}-kb`)),
        source: "default",
    };
}

// The one KB line for SessionStart and SubagentStart. Takes the result of resolveKbRoot, or (path, source).
export function kbLine(kb, source) {
    const p = typeof kb === "string" ? kb : kb.path;
    const s = typeof kb === "string" ? source : kb.source;
    return `Knowledge base root: ${p} (${s})`;
}

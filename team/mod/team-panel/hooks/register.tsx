// Team panel (T-149): a read-only pane with the team's progress and every chat's send count.
// Reads <KB>/team/status.json (schema 1, written by the hooks) and <KB>/team/sends/*.json; writes nothing
// but its own $.state snapshot. Mod API of Claude Code 2.1.325 (early access, may change between builds).
//
// KB path: same order as team/hooks/kb-root.mjs, read with $ from the session's project folder:
// env TEAM_KB_OVERRIDE, kbRoot in team/team.config.json, kbRoot in <main checkout>/team/team.config.local.json,
// <home>/git/<project>-kb. The env <PROJECT>_KB_ROOT source is left out (no dynamic env names in the mod API).

import { atom, read, update } from "claude-code";
import type { EngineInterface, Register } from "claude-code";

import type { TeamSnapshot } from "../types";
import { buildView, gitdirOf, mainCheckoutOf, resolveKb, teamProject } from "./view.mjs";

const PANE = "team";
const POLL_MS = 3000;
const ABSOLUTE = /^([A-Za-z]:[\\/]|[\\/])/;

const EMPTY: TeamSnapshot = {
    kb: null,
    kbSource: null,
    sessionId: null,
    status: null,
    sends: {},
    error: null,
};
// Change the tag when TeamSnapshot changes: it declines what an earlier version stored.
const snapshot = atom({ plugin: "team-panel", key: "snapshot" } as const, EMPTY, {
    shape: "snapshot-1",
});

// Module variables start over on every reload (timers are dropped then too); the snapshot in $.state stays.
let statusMtime = -1;
let sendMtimes: Record<string, number> = {};
let timer: { cancel: () => void } | null = null;

async function readJson($: EngineInterface, file: string): Promise<any> {
    try {
        return JSON.parse(await $.fs.read(file));
    } catch {
        return null;
    }
}

async function findKb($: EngineInterface) {
    const root = (await $.session.root()).replace(/\\/g, "/");
    const config = await readJson($, `${root}/team/team.config.json`);
    let main = root;
    try {
        const gitdir = gitdirOf(await $.fs.read(`${root}/.git`));
        if (gitdir) {
            const base = ABSOLUTE.test(gitdir) ? gitdir : `${root}/${gitdir}`;
            const commondir = await $.fs.read(`${base}/commondir`).catch(() => null);
            main = mainCheckoutOf(root, gitdir, commondir);
        }
    } catch {
        // .git is a folder (main checkout) or missing: the project folder itself
    }
    const local = await readJson($, `${main}/team/team.config.local.json`);
    const home = (await $.env.get("USERPROFILE")) ?? (await $.env.get("HOME"));
    const override = await $.env.get("TEAM_KB_OVERRIDE");
    return resolveKb({ override, config, local, home });
}

async function poll($: EngineInterface) {
    const before = await read($, snapshot);
    const next: TeamSnapshot = { ...before, error: null };
    try {
        next.sessionId = await $.session.id(); // a clear can change it
        const kb = await findKb($);
        next.kb = kb?.path ?? null;
        next.kbSource = kb?.source ?? null;
        if (!next.kb) throw new Error("knowledge base path not found");
        if (next.kb !== before.kb) {
            statusMtime = -1;
            sendMtimes = {};
            next.status = null;
            next.sends = {};
        }

        const statusPath = `${next.kb}/team/status.json`;
        const stat = await $.fs.stat(statusPath).catch(() => null);
        if (!stat) next.status = null;
        else if (stat.mtimeMs !== statusMtime) {
            const parsed = await readJson($, statusPath);
            if (parsed?.schema === 1) {
                next.status = parsed;
                statusMtime = stat.mtimeMs;
            } else next.error = "status.json unreadable or not schema 1";
        }

        const dir = `${next.kb}/team/sends`;
        const entries = await $.fs.list(dir).catch(() => []);
        const sends: Record<string, number> = {};
        const mtimes: Record<string, number> = {};
        for (const entry of entries) {
            if (entry.kind !== "file" || !entry.name.endsWith(".json")) continue;
            const id = entry.name.slice(0, -".json".length);
            mtimes[id] = entry.mtimeMs;
            if (sendMtimes[id] === entry.mtimeMs && id in next.sends) {
                sends[id] = next.sends[id];
                continue;
            }
            const value = await readJson($, `${dir}/${entry.name}`);
            sends[id] = Number.isInteger(value?.sends) && value.sends >= 0 ? value.sends : 0;
        }
        sendMtimes = mtimes;
        next.sends = sends;
    } catch (e) {
        next.error = e instanceof Error ? e.message : String(e);
    }
    if (JSON.stringify(next) !== JSON.stringify(before)) await update($, snapshot, () => next);
}

function startPolling($: EngineInterface) {
    timer?.cancel();
    timer = $.clock.every(POLL_MS, () => void poll($));
    void poll($);
}

// Team project or not (F-149-2): the facts gathered with $, the decision in view.mjs (teamProject).
async function detectTeam($: EngineInterface) {
    const kb = (await findKb($).catch(() => null))?.path ?? null;
    const exists = (file: string) => $.fs.exists(file).catch(() => false);
    return teamProject({
        kb,
        statusExists: kb ? await exists(`${kb}/team/status.json`) : false,
        registryExists: kb ? await exists(`${kb}/team/registry.json`) : false,
    });
}

export const register: Register = (on) => {
    on("session.start", async ($, e, next) => {
        await $.command.register({
            name: "team",
            description: "Show the agent team's progress and send counts in a pane",
        });
        // Outside a team project: no pane, no timer, no error text (a user-scope install loads everywhere)
        const team = await detectTeam($).catch(() => ({ active: false }));
        if (team.active) {
            void $.ui.open({ id: PANE, title: "Team" });
            startPolling($);
        }
        return next(e);
    });

    on("command.run", { command: "team" }, async ($) => {
        const team = await detectTeam($);
        if (!team.active) return { text: `Team panel: nothing to show, ${team.reason}.` };
        await $.ui.open({ id: PANE, title: "Team" });
        if (timer) void poll($);
        else startPolling($);
        return { text: "Team pane opened." };
    });

    on("ui.render", { component: "Pane", requestId: PANE }, async ($, e) => {
        const { Box, Text } = $.ui.resolve(e);
        const snap = await read($, snapshot);
        const view = buildView(snap.status as any, snap.sends, snap.sessionId);
        // props spread, so a normal row has no color prop at all
        const tint = (level: string) =>
            level === "blocked" ? { color: "error" } : level === "warn" ? { color: "warning" } : {};
        const isWidget = e.props.placement === "widget"; // the desktop app's small form: budget only
        const b = view.budget;

        return (
            <Box flexDirection="column">
                {view.title && (
                    <Text dimColor>
                        {view.title} ({view.role})
                    </Text>
                )}
                {b ? <Text weight="bold">Sends {b.n}</Text> : <Text dimColor>Team overview</Text>}
                {!isWidget &&
                    view.sections.map((s) => (
                        <Box flexDirection="column">
                            <Text weight="semibold">{s.title}</Text>
                            {s.rows.map((r) => (
                                <Text dimColor={r.level === "dim"} {...tint(r.level)}>
                                    {r.text}
                                </Text>
                            ))}
                        </Box>
                    ))}
                {snap.error && <Text dimColor>{snap.error}</Text>}
            </Box>
        );
    });
};

// Type contract of the team-panel mod (T-149). The snapshot is what the poller read last.

export type TeamSnapshot = {
    kb: string | null; // resolved knowledge base root, null if none
    kbSource: string | null;
    sessionId: string | null; // $.session.id(), re-read on every poll
    status: unknown; // parsed status.json (schema 1) or null
    sends: Record<string, number>; // live counts from team/sends/*.json
    error: string | null; // last read problem, shown dim in the pane
};

declare module "claude-code" {
    interface PluginState {
        "team-panel": { snapshot: Shaped<TeamSnapshot> };
    }
}

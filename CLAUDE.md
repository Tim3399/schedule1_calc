@AGENTS.md

## Claude Code only

- The shared team rules are in `AGENTS.md` and imported above. Changes to the rules belong there, not here.
- Every role is its own chat, and the title determines the role (see `AGENTS.md`). A chat without a role title is not an Orchestrator. The subagents live in `.claude/agents/`.
- `.claude/agents/`, `.claude/output-styles/` and the team entries in `.claude/settings.json` are **generated**. To change a role, change `team/roles/<role>.md` and then run `node team/sync.mjs`.

Project-specific notes for Claude Code are in the following block. `agent-team update` leaves it unchanged.

<!-- agent-team:project -->
<!-- /agent-team:project -->

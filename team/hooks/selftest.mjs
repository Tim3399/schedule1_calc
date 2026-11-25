#!/usr/bin/env node
// Self-test of the team hooks against a throw-away knowledge base: node team/hooks/selftest.mjs
// Plays through the rights matrix from AGENTS.md without touching the real registry.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chatOf, userLevelTeamStylesWarning } from "./lib.mjs";
import { workStateDir } from "./pools.mjs";
import { SEND_TOOLS } from "./sends.mjs";
import { COMPACT_LOG } from "./context.mjs";
import { idleConfig } from "./idle.mjs";

const HOOKS = path.dirname(fileURLToPath(import.meta.url));
const kb = fs.mkdtempSync(path.join(os.tmpdir(), "team-kb-"));
// Own home for the hook child processes: the user's global configuration is never touched.
const home = fs.mkdtempSync(path.join(os.tmpdir(), "team-home-"));
const appdata = path.join(home, "AppData", "Roaming");
let failed = 0;

// Hooks that run: this folder, for the pool cases a copy with its own roles.json (see below).
let hooksDir = HOOKS;

// block: exit 2 (hook blocks with a message on stderr) is an expected result and comes back as { blocked }
function run(script, host, input, { block = false } = {}) {
    const r = spawnSync(process.execPath, [path.join(hooksDir, script)], {
        input: JSON.stringify(input),
        encoding: "utf8",
        env: {
            ...process.env,
            TEAM_KB_OVERRIDE: kb,
            CLAUDE_CODE_HOST_SESSION_ID: host,
            HOME: home,
            USERPROFILE: home,
            APPDATA: appdata,
        },
    });
    if (block && r.status === 2) return { blocked: r.stderr.trim() };
    if (r.status !== 0) throw new Error(`${script} exited with ${r.status}: ${r.stderr}`);
    return r.stdout ? JSON.parse(r.stdout) : null;
}

const start = (host, title, model = "claude-opus-5-5", source = "startup") =>
    run("session-start.mjs", host, {
        source,
        session_title: title,
        model,
        session_id: `cli-${host}`,
    });

function tool(host, name, input) {
    const out = run("policy.mjs", host, { tool_name: name, tool_input: input }, { block: true });
    if (out?.blocked !== undefined) return `block (Exit 2): ${out.blocked}`;
    return out?.hookSpecificOutput?.permissionDecision === "deny"
        ? `deny: ${out.hookSpecificOutput.permissionDecisionReason}`
        : "allow";
}
const mgmt = (host, action, input) => tool(host, `mcp__ccd_session_mgmt__${action}`, input);

// wanted: 'allow', 'deny' (deny JSON, exit 0) or 'block' (exit 2)
function expect(name, actual, wanted) {
    const ok = wanted === "allow" ? actual === "allow" : actual.startsWith(wanted);
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"} ${name}  →  ${actual}`);
}

// create chats
start("local_orch", "Orchestrator");
start("local_impl", "Implementer");
start("local_crit", "Critic");
start("local_res", "Researcher", "claude-sonnet-5-5");
start("local_new", "New chat");
start("local_new2", "Another chat");
start("local_misc", "Agent prompts for the orchestrator system");

// start hints
const hint = start("local_orch", "Orchestrator", "claude-haiku-5-5", "compact").hookSpecificOutput
    .additionalContext;
expect(
    "Startup: role recognized",
    hint.includes("role orchestrator") ? "allow" : "deny: " + hint,
    "allow",
);
expect(
    "Startup: after compact read the work state",
    hint.includes(
        `The context was compacted. Read your work state (${kb.replace(/\\/g, "/")}/orchestrator/work-state.md)`,
    )
        ? "allow"
        : "deny: " + hint,
    "allow",
);
expect("Startup: model warning on Haiku", hint.includes("Attention") ? "allow" : "deny", "allow");
expect(
    "Startup: language rule and plain send count",
    hint.includes("Language: Talk to the user in the user's language") &&
        !hint.includes("Send limit") &&
        /^Sends since user input: \d+ \(counted by the send-counter hook\)\.$/m.test(hint)
        ? "allow"
        : "deny: " + hint,
    "allow",
);
const noRole = start("local_misc", "Agent prompts for the orchestrator system").hookSpecificOutput
    .additionalContext;
expect(
    "Startup: chat without a role recognized",
    noRole.includes("no team role") ? "allow" : "deny",
    "allow",
);

// team setup: a new chat names itself
expect(
    "new chat calls itself Dev 3",
    mgmt("local_new", "set_session_title", { session_id: "self", title: "Dev 3" }),
    "allow",
);
run("registry-title.mjs", "local_new", {
    tool_input: { session_id: "self", title: "Dev 3" },
    tool_response: "renamed",
});
expect(
    "second chat also wants to be Dev 3",
    mgmt("local_new2", "set_session_title", { session_id: "self", title: "Dev 3" }),
    "deny",
);
expect(
    "new chat wants to be Critic (already taken)",
    mgmt("local_new2", "set_session_title", { session_id: "self", title: "Critic" }),
    "deny",
);
expect(
    "new chat wants to be Orchestrator (already taken)",
    mgmt("local_new2", "set_session_title", { session_id: "self", title: "Orchestrator" }),
    "deny",
);
expect(
    "new chat takes the free title Advisor",
    mgmt("local_new2", "set_session_title", { session_id: "self", title: "Advisor" }),
    "allow",
);
expect(
    "Researcher wants to become Advisor (already has a role)",
    mgmt("local_res", "set_session_title", { session_id: "self", title: "Advisor" }),
    "deny",
);
expect(
    "Dev 9 lies outside the pool",
    mgmt("local_new2", "set_session_title", { session_id: "self", title: "Dev 9" }),
    "allow",
);
expect(
    "Dev 3 renames itself",
    mgmt("local_new", "set_session_title", { session_id: "self", title: "Anything" }),
    "deny",
);
expect(
    "Dev 3 sets its own style Dev",
    mgmt("local_new", "set_session_output_style", { session_id: "self", style: "Dev" }),
    "allow",
);
expect(
    "Dev 3 sets its own style Orchestrator",
    mgmt("local_new", "set_session_output_style", { session_id: "self", style: "Orchestrator" }),
    "deny",
);
expect(
    "chat without a role takes a role style",
    mgmt("local_misc", "set_session_output_style", { session_id: "self", style: "Critic" }),
    "deny",
);

// Orchestrator
expect(
    "Orch sets the model of Dev 3 (Sonnet)",
    mgmt("local_orch", "set_session_model", {
        session_id: "local_new",
        model: "claude-sonnet-5-5",
    }),
    "allow",
);
expect(
    "Orch sets the model of Dev 3 (Haiku)",
    mgmt("local_orch", "set_session_model", { session_id: "local_new", model: "claude-haiku-5-5" }),
    "deny",
);
expect(
    "Orch sets the style of Researcher",
    mgmt("local_orch", "set_session_output_style", {
        session_id: "local_res",
        style: "Researcher",
    }),
    "allow",
);
expect(
    "Orch sets a wrong style on Researcher",
    mgmt("local_orch", "set_session_output_style", { session_id: "local_res", style: "Dev" }),
    "deny",
);
expect(
    "Orch sets Critic to Fable",
    mgmt("local_orch", "set_session_model", {
        session_id: "local_crit",
        model: "claude-fable-5-2",
    }),
    "allow",
);
expect(
    "Orch sets Critic to the outdated Fable model",
    mgmt("local_orch", "set_session_model", {
        session_id: "local_crit",
        model: "claude-fable-5-" + "1",
    }),
    "deny",
);
expect(
    "Orch sets Critic to Opus (fallback model)",
    mgmt("local_orch", "set_session_model", { session_id: "local_crit", model: "claude-opus-5-5" }),
    "allow",
);
expect(
    "Orch sets Critic to another model",
    mgmt("local_orch", "set_session_model", {
        session_id: "local_crit",
        model: "claude-sonnet-5-5",
    }),
    "deny",
);
expect(
    "Orch sets Critic to the planned effort",
    mgmt("local_orch", "set_session_effort", { session_id: "local_crit", effort: "high" }),
    "allow",
);
expect(
    "Orch changes the effort of Critic",
    mgmt("local_orch", "set_session_effort", { session_id: "local_crit", effort: "low" }),
    "deny",
);
expect(
    "Impl sets the model of Critic",
    mgmt("local_impl", "set_session_model", { session_id: "local_crit", model: "claude-opus-5-5" }),
    "deny",
);
expect(
    "Orch stops Critic (external)",
    mgmt("local_orch", "stop_session", { session_id: "local_crit" }),
    "deny",
);
expect(
    "Orch stops Implementer",
    mgmt("local_orch", "stop_session", { session_id: "local_impl" }),
    "allow",
);
expect(
    "Orch archives Dev",
    mgmt("local_orch", "archive_session", { session_id: "local_new" }),
    "deny",
);
expect(
    "Orch deletes a chat",
    mgmt("local_orch", "delete_session", { session_ids: ["local_new"] }),
    "deny",
);
expect(
    "Orch changes the permission mode",
    mgmt("local_orch", "set_session_permission_mode", {
        session_id: "local_new",
        mode: "bypassPermissions",
    }),
    "deny",
);
expect("Orch reads sessions", mgmt("local_orch", "list_sessions", {}), "allow");
// Remote Control (T-138): on for the own chat and managed chats, never off
for (const [name, host, input, wanted] of [
    [
        "Dev 3 turns its Remote Control on",
        "local_new",
        { session_id: "self", enabled: true },
        "allow",
    ],
    [
        "Dev 3 turns its Remote Control off",
        "local_new",
        { session_id: "self", enabled: false },
        "deny",
    ],
    [
        "Orch turns Remote Control of Impl on",
        "local_orch",
        { session_id: "local_impl", enabled: true },
        "allow",
    ],
    [
        "Orch turns Remote Control of Impl off",
        "local_orch",
        { session_id: "local_impl", enabled: false },
        "deny",
    ],
    [
        "Impl turns Remote Control of Dev 3 on",
        "local_impl",
        { session_id: "local_new", enabled: true },
        "allow",
    ],
    [
        "Dev 3 turns Remote Control of Impl on",
        "local_new",
        { session_id: "local_impl", enabled: true },
        "deny",
    ],
    [
        "Orch turns Remote Control of Critic on",
        "local_orch",
        { session_id: "local_crit", enabled: true },
        "deny",
    ],
])
    expect(name, mgmt(host, "set_remote_control", input), wanted);

// Implementer and pool
expect(
    "Impl sets the model of Dev 3 (Opus)",
    mgmt("local_impl", "set_session_model", { session_id: "local_new", model: "claude-opus-5-5" }),
    "allow",
);
expect(
    "Impl sets the model of Researcher",
    mgmt("local_impl", "set_session_model", {
        session_id: "local_res",
        model: "claude-sonnet-5-5",
    }),
    "deny",
);
fs.mkdirSync(path.join(kb, "implementer"), { recursive: true });
const pool = (status) =>
    fs.writeFileSync(
        path.join(kb, "implementer", "dev-pool.json"),
        JSON.stringify({ slots: [{ title: "Dev 3", status }] }),
    );
// English pool values and the German values of pools from before 0.4.0 (F-69-5)
for (const [status, wanted] of [
    ["busy", "deny"],
    ["belegt", "deny"],
    ["free", "allow"],
    ["frei", "allow"],
    ["broken", "allow"],
    ["defekt", "allow"],
]) {
    pool(status);
    expect(
        `Impl archives Dev 3 (pool status ${status})`,
        mgmt("local_impl", "archive_session", { session_id: "local_new" }),
        wanted,
    );
}
expect(
    "Impl archives Researcher",
    mgmt("local_impl", "archive_session", { session_id: "local_res" }),
    "deny",
);

// other roles and chats without a role
expect(
    "Researcher sets the model of Dev 3",
    mgmt("local_res", "set_session_model", { session_id: "local_new", model: "claude-sonnet-5-5" }),
    "deny",
);
expect(
    "chat without a role stops Implementer",
    mgmt("local_misc", "stop_session", { session_id: "local_impl" }),
    "deny",
);

// Clearing: team chats only with a free work state and "New assignment:", otherwise exit 2
start("local_simp", "Simplifier");
start("local_adv", "Advisor");
const workState = (rel, text) => {
    fs.mkdirSync(path.join(kb, path.dirname(rel)), { recursive: true });
    fs.writeFileSync(path.join(kb, rel), text);
};
const FREE = "Status: free\nNew assignment: T-99 from Orchestrator – Brief: x\n";
// German work states from before 0.4.0 are still read (file format, T-61/T-69)
const FREE_DE = "Status: frei\nNeuer Auftrag: T-99 von Orchestrator – Brief: x\n";
const clearSelf = (host) => mgmt(host, "clear_session", { session_id: "self" });
const BLOCK =
    "Status: free\nNew assignment: T-99 from Orchestrator – Brief: –\nNew assignment (verbatim):\n  Research T-99: Does X hold?\n  Status: working\n  Reply to: Orchestrator\nNext step: begin T-99\n";
const BLOCK_DE =
    "Status: frei\nNeuer Auftrag: T-99 von Orchestrator – Brief: –\nNeuer Auftrag (wörtlich):\n  Research T-99: Gilt X?\n  Status: arbeitet\n  Antwort an: Orchestrator\nNächster Schritt: T-99 beginnen\n";
workState("dev/dev-3/arbeitsstand.md", FREE);
workState("implementer/arbeitsstand.md", FREE_DE);
workState("critic/arbeitsstand.md", FREE);
workState("orchestrator/arbeitsstand.md", FREE.replace(/\n/g, "\r\n"));
// Context size (T-145): a team chat clears only after a compaction since its last clear (compact-log.jsonl).
const compacted = (host, time = new Date().toISOString()) => {
    fs.mkdirSync(path.join(kb, "team"), { recursive: true });
    fs.appendFileSync(
        path.join(kb, COMPACT_LOG),
        JSON.stringify({ time, sessionId: host, title: null }) + "\n",
    );
};
const small = (r) => (r.includes("Context is small") ? r : `unexpected: ${r}`);
expect("Dev 3 clears (no compaction entry, context small)", small(clearSelf("local_new")), "block");
compacted("local_new");
expect(
    "Dev 3 clears (compaction since its last clear, context large)",
    clearSelf("local_new"),
    "allow",
);
// The allowed clear writes nothing (F-145-1): a clear the app rejects leaves the context large for the retry.
expect(
    "Dev 3 clears again (retry after a rejected clear is allowed)",
    clearSelf("local_new"),
    "allow",
);
// The clear happens: SessionStart brings a new session id and session-start.mjs logs the clear.
run("session-start.mjs", "local_new", {
    source: "startup",
    session_title: "Dev 3",
    session_id: "cli-local_new-after-clear",
});
expect(
    "Dev 3 clears again (no compaction since the logged clear)",
    small(clearSelf("local_new")),
    "block",
);
// The work state cases below run with a large context: a compaction entry newer than every clear.
const TEAM_HOSTS = [
    "local_new",
    "local_impl",
    "local_crit",
    "local_orch",
    "local_res",
    "local_boot",
];
for (const host of [...TEAM_HOSTS, "local_crit2"]) compacted(host, "2999-01-01T00:00:00.000Z");
expect("Dev 3 clears (free, new assignment)", clearSelf("local_new"), "allow");
expect("Impl clears (German work state: frei, Neuer Auftrag)", clearSelf("local_impl"), "allow");
expect("Critic clears (free, new assignment)", clearSelf("local_crit"), "allow");
// T-153: the Orchestrator never clears itself, even with a free work state, a new assignment and a large context
expect(
    "Orch clears itself (never, T-153)",
    clearSelf("local_orch"),
    "deny: The Orchestrator never clears itself (T-153)",
);
expect(
    "Orch clears with its own ID (never, T-153)",
    mgmt("local_orch", "clear_session", { session_id: "local_orch" }),
    "deny: The Orchestrator never clears itself (T-153)",
);
workState("dev/dev-3/arbeitsstand.md", "Status: free, no assignment\n");
expect("Dev 3 clears (free, without a new assignment)", clearSelf("local_new"), "block");
workState(
    "dev/dev-3/arbeitsstand.md",
    "Status: working\nNew assignment: T-99 from Orchestrator – Brief: x\n",
);
expect("Dev 3 clears (working, with a new assignment)", clearSelf("local_new"), "block");
expect("Researcher clears (no work state)", clearSelf("local_res"), "block");
expect("chat without a role clears itself", clearSelf("local_misc"), "allow");
workState("dev/dev-3/arbeitsstand.md", BLOCK);
expect("Dev 3 clears (New assignment with a verbatim block)", clearSelf("local_new"), "allow");
workState("dev/dev-3/arbeitsstand.md", BLOCK_DE);
expect("Dev 3 clears (German verbatim block)", clearSelf("local_new"), "allow");
workState("dev/dev-3/arbeitsstand.md", "Status: working\nNext step: begin T-99\n");
expect("Dev 3 clears (after START, both fields removed)", clearSelf("local_new"), "block");
workState(
    "dev/dev-3/arbeitsstand.md",
    "Status: free\nNew assignment (verbatim):\n  Assignment T-99\n",
);
expect("Dev 3 clears (verbatim block only, without an ID line)", clearSelf("local_new"), "block");
// Task families (T-39): the same family goes on without clearing, another family only with "Completed:"
const NEXT = (id) =>
    `Status: free\nAssignment: T-16-F1 from Orchestrator – Brief: x\nNew assignment: ${id} from Orchestrator – Brief: x\n`;
workState("dev/dev-3/arbeitsstand.md", NEXT("T-16-r2"));
expect(
    "Dev 3 clears (same family T-16-F1 → T-16-r2)",
    clearSelf("local_new"),
    'block (Exit 2): Team hook: Clear blocked: "New assignment: T-16-r2" belongs to the same task family T-16',
);
workState("dev/dev-3/arbeitsstand.md", NEXT("T-20"));
expect(
    "Dev 3 clears (other family without Completed:)",
    clearSelf("local_new"),
    "block (Exit 2): Team hook: Clear blocked: the work state",
);
workState("dev/dev-3/arbeitsstand.md", NEXT("T-20") + "Completed: T-12\n");
expect("Dev 3 clears (other family, Completed: wrong family)", clearSelf("local_new"), "block");
workState("dev/dev-3/arbeitsstand.md", NEXT("T-20") + "Completed: T-16\n");
expect("Dev 3 clears (other family with Completed: T-16)", clearSelf("local_new"), "allow");
workState(
    "dev/dev-3/arbeitsstand.md",
    "Status: free\nNew assignment: T-20 from Implementer – Brief: x\n",
);
expect("Dev 3 clears (no Assignment:, first assignment)", clearSelf("local_new"), "allow");
workState(
    "dev/dev-3/arbeitsstand.md",
    "Status: free\nAssignment: D-V021-7 from Implementer – Brief: x\nNew assignment: V-0.2.1-F1 from Implementer – Brief: x\nCompleted: V-0.2.1\n",
);
expect("Dev 3 clears (D-V021-7 → V-0.2.1-F1, same family)", clearSelf("local_new"), "block");
workState(
    "dev/dev-3/arbeitsstand.md",
    "Status: free\nNew assignment: D-T-12-3 from Implementer – Brief: x\n",
);
expect("Dev 3 clears (first assignment D-T-12-3)", clearSelf("local_new"), "allow");
workState(
    "dev/dev-3/arbeitsstand.md",
    "Status: free\nAssignment: D-T-12-3 from Implementer – Brief: x\nNew assignment: D-T-12-4 from Implementer – Brief: x\nCompleted: T-12\n",
);
expect("Dev 3 clears (D-T-12-3 → D-T-12-4, same family)", clearSelf("local_new"), "block");
// "Assignment:" without a recognizable ID counts as no assignment (like the first assignment)
for (const [name, line] of [
    ["Assignment: none", "Assignment: none\n"],
    ["Assignment: no assignment", "Assignment: no assignment\n"],
    ["without an Assignment: line", ""],
]) {
    workState(
        "dev/dev-3/arbeitsstand.md",
        `Status: free\n${line}New assignment: D-T-12-3 from Implementer – Brief: x\n`,
    );
    expect(`Dev 3 clears (${name}, free)`, clearSelf("local_new"), "allow");
    workState(
        "dev/dev-3/arbeitsstand.md",
        `Status: working\n${line}New assignment: D-T-12-3 from Implementer – Brief: x\n`,
    );
    expect(`Dev 3 clears (${name}, working)`, clearSelf("local_new"), "block");
}
workState(
    "dev/dev-3/arbeitsstand.md",
    "Status: free\nAssignment: – (last D-T-12-3)\nNew assignment: D-T-12-4 from Implementer – Brief: x\n",
);
expect(
    "Dev 3 clears (Assignment: – (last D-T-12-3) → D-T-12-4, same family)",
    clearSelf("local_new"),
    "block",
);
// usual assignment IDs (T-18)
workState(
    "critic/arbeitsstand.md",
    "Status: free\nAssignment: T-12-r1 from Orchestrator – Brief: x\nCompleted: T-12\nNew assignment: Review T-16 round 1 from Orchestrator – Brief: x\n",
);
expect(
    "Critic clears (New assignment: Review T-16 round 1, Completed: T-12)",
    clearSelf("local_crit"),
    "allow",
);
workState(
    "critic/arbeitsstand.md",
    "Status: free\nNew assignment: Review Plan agent-team v0.3.0 from Orchestrator – Brief: x\n",
);
expect(
    "Critic clears (New assignment: Review Plan agent-team v0.3.0, without Assignment:)",
    clearSelf("local_crit"),
    "allow",
);
workState(
    "critic/arbeitsstand.md",
    "Status: free\nAssignment: Review Plan agent-team v0.3.0 from Orchestrator\nNew assignment: V-0.3.0-1 from Orchestrator – Brief: x\nCompleted: V-0.3.0\n",
);
expect(
    "Critic clears (Review Plan v0.3.0 → V-0.3.0-1, same family)",
    clearSelf("local_crit"),
    "block",
);

// English work state (T-61): English keys, German keys, English wins over German, work-state.md before arbeitsstand.md
const EN = (assignment, next, done) =>
    [
        "# Work state Dev 3",
        "Status: free",
        assignment && `Assignment: ${assignment} from Implementer – Brief: x`,
        `New assignment: ${next} from Implementer – Brief: x`,
        done && `Completed: ${done}`,
    ]
        .filter(Boolean)
        .join("\n") + "\n";
workState("dev/dev-3/work-state.md", EN("T-16", "T-20", "T-16"));
expect("Dev 3 clears (English, other family, Completed: T-16)", clearSelf("local_new"), "allow");
workState("dev/dev-3/work-state.md", EN("T-16", "T-16-F1", "T-16"));
expect(
    "Dev 3 clears (English, same family T-16 → T-16-F1)",
    clearSelf("local_new"),
    'block (Exit 2): Team hook: Clear blocked: "New assignment: T-16-F1" belongs to the same task family T-16',
);
workState(
    "dev/dev-3/work-state.md",
    "Status: free\nAuftrag: T-16 von Implementer\nAssignment: T-20 from Implementer\nNew assignment: T-16-F1 from Implementer\nCompleted: T-20\n",
);
expect("Dev 3 clears (Assignment: T-20 wins over Auftrag: T-16)", clearSelf("local_new"), "allow");
// "Completed:" is a single-line field: a following free-text line with the ID does not count (F-61-2)
workState(
    "dev/dev-3/work-state.md",
    "Status: free\nAssignment: T-16 from Implementer\nCompleted: –\nT-16 is done\nNew assignment: T-20 from Orchestrator\n",
);
expect(
    "Dev 3 clears (Completed: – followed by the free-text line T-16 is done)",
    clearSelf("local_new"),
    "block (Exit 2): Team hook: Clear blocked: the work state",
);
workState(
    "dev/dev-3/work-state.md",
    "Status: frei\nAuftrag: T-16 von Implementer\nAbgeschlossen: –\nT-16 erledigt\nNeuer Auftrag: T-20 von Orchestrator\n",
);
expect(
    "Dev 3 clears (German: Abgeschlossen: – followed by a free-text line with T-16)",
    clearSelf("local_new"),
    "block (Exit 2): Team hook: Clear blocked: the work state",
);
workState("dev/dev-3/work-state.md", "Status: working\nNew assignment: T-20 from Implementer\n");
workState("dev/dev-3/arbeitsstand.md", FREE);
expect(
    "Dev 3 clears (work-state.md working, arbeitsstand.md free: work-state.md counts)",
    clearSelf("local_new"),
    "block (Exit 2): Team hook: Clear blocked: the work state",
);
fs.rmSync(path.join(kb, "dev", "dev-3", "work-state.md"));

// bootstrap claim writes an English work state that the clear check accepts (T-61)
const claim = spawnSync(process.execPath, [path.join(HOOKS, "..", "bootstrap.mjs"), "claim"], {
    encoding: "utf8",
    env: {
        ...process.env,
        TEAM_KB_OVERRIDE: kb,
        CLAUDE_CODE_HOST_SESSION_ID: "local_boot",
        CLAUDE_PROJECT_DIR: path.resolve(HOOKS, "..", ".."),
        TEAM_CLAIM_NO_WORKTREE: "1",
    },
});
const claimed = claim.stdout.match(/this chat becomes "([^"]+)"/)?.[1];
if (claimed) start("local_boot", claimed);
const bootEntry = JSON.parse(
    fs.readFileSync(path.join(kb, "team", "registry.json"), "utf8"),
).local_boot;
// Same slot folder rule as lib.mjs workStatePath (critic slot k >= 2 is critic/critic-<k>/, T-162).
const bootChat = bootEntry?.role ? chatOf(bootEntry.role) : null;
const bootState = bootChat
    ? path.join(kb, workStateDir(bootChat, bootEntry.slot), "work-state.md")
    : null;
const bootText = bootState && fs.existsSync(bootState) ? fs.readFileSync(bootState, "utf8") : "";
expect(
    "bootstrap claim writes an English work state",
    claim.status === 0 &&
        bootText === `# Work state ${claimed}\n\nStatus: free\nAssignment: –\n` &&
        claim.stdout.includes("work-state.md")
        ? "allow"
        : `deny: status ${claim.status}, ${claimed}, ${JSON.stringify(bootText)} ${claim.stderr}`,
    "allow",
);
// The dev pool that claim creates is written with English values and keys (F-69-5, N-8). The pool written
// before (status tests above) is replaced first, so claim creates a new one.
fs.rmSync(path.join(kb, "implementer", "dev-pool.json"), { force: true });
spawnSync(process.execPath, [path.join(HOOKS, "..", "bootstrap.mjs"), "plan"], {
    encoding: "utf8",
    env: { ...process.env, TEAM_KB_OVERRIDE: kb },
});
const newPool = JSON.parse(
    fs.readFileSync(path.join(kb, "implementer", "dev-pool.json"), "utf8"),
).slots;
expect(
    "bootstrap writes the dev pool with status free",
    newPool.length > 0 &&
        newPool.every(
            (s) => s.status === "free" && "assignment" in s && "since" in s && !("auftrag" in s),
        )
        ? "allow"
        : `deny: ${JSON.stringify(newPool)}`,
    "allow",
);
if (bootState) {
    expect("bootstrap work state without New assignment", clearSelf("local_boot"), "block");
    fs.appendFileSync(bootState, "New assignment: T-20 from Orchestrator – Brief: x\n");
    expect(
        "bootstrap work state + New assignment (first assignment)",
        clearSelf("local_boot"),
        "allow",
    );
    fs.writeFileSync(
        bootState,
        bootText.replace("Assignment: –", "Assignment: T-16 from Orchestrator") +
            "New assignment: T-20 from Orchestrator – Brief: x\nCompleted: T-16\n",
    );
    expect(
        "bootstrap work state + Assignment T-16, Completed T-16, New assignment T-20",
        clearSelf("local_boot"),
        "allow",
    );
}

// PreCompact: logs and always exits with 0. The log already holds the entries of the clear cases above (T-145),
// so only the lines this run appends count.
const compactLog = path.join(kb, "team", "compact-log.jsonl");
const logLines = () =>
    fs.existsSync(compactLog)
        ? fs
              .readFileSync(compactLog, "utf8")
              .trim()
              .split("\n")
              .filter(Boolean)
              .map((l) => JSON.parse(l))
        : [];
const loggedBefore = logLines().length;
run("pre-compact.mjs", "local_orch", { session_id: "cli-local_orch", trigger: "auto" });
const logged = logLines().slice(loggedBefore);
expect(
    "PreCompact: entry in compact-log.jsonl",
    logged.length === 1 &&
        logged[0].sessionId === "local_orch" &&
        logged[0].title === "Orchestrator" &&
        logged[0].time
        ? "allow"
        : `deny: ${JSON.stringify(logged)}`,
    "allow",
);

// KB line: SessionStart and SubagentStart name the resolved path (here the override), in config and placeholder mode
const kbFwd = kb.replace(/\\/g, "/");
const kbLineWanted = `Knowledge base root: ${kbFwd} (override)`;
expect(
    "SessionStart: KB line",
    start("local_orch", "Orchestrator").hookSpecificOutput.additionalContext.includes(kbLineWanted)
        ? "allow"
        : "deny",
    "allow",
);
expect(
    "SubagentStart: KB line",
    run("subagent-start.mjs", "local_orch", {}).hookSpecificOutput.additionalContext ===
        kbLineWanted
        ? "allow"
        : "deny",
    "allow",
);

const members = {
    Orch: "local_orch",
    Impl: "local_impl",
    "Dev 3": "local_new",
    Researcher: "local_res",
    Simplifier: "local_simp",
    Critic: "local_crit",
    Advisor: "local_adv",
};
for (const [name, host] of Object.entries(members)) {
    const other = host === "local_impl" ? "local_orch" : "local_impl";
    expect(
        `${name} clears another chat`,
        mgmt(host, "clear_session", { session_id: other }),
        "deny",
    );
}

// routines
const routine = (host, action, input) => tool(host, `mcp__scheduled-tasks__${action}`, input);
expect(
    "Orch starts a routine",
    routine("local_orch", "run_scheduled_task", { taskId: "anything" }),
    "deny",
);
expect(
    "chat without a role creates a routine",
    routine("local_misc", "create_scheduled_task", { taskId: "x", prompt: "x", description: "x" }),
    "allow",
);

// other tools
expect("Orch calls ListAgents", tool("local_orch", "ListAgents", {}), "allow");
expect(
    "Dev calls SendMessage",
    tool("local_new", "SendMessage", { to: "Implementer", message: "x" }),
    "allow",
);

// subagents
expect("Orch starts Explore", tool("local_orch", "Agent", { subagent_type: "Explore" }), "allow");
expect("Orch starts dev", tool("local_orch", "Agent", { subagent_type: "dev" }), "deny");
expect("Orch starts general-purpose (without a type)", tool("local_orch", "Agent", {}), "deny");
expect(
    "Researcher starts web-fetch",
    tool("local_res", "Agent", { subagent_type: "web-fetch" }),
    "allow",
);
expect("Dev starts web-fetch", tool("local_new", "Agent", { subagent_type: "web-fetch" }), "deny");
expect("Impl starts dev", tool("local_impl", "Agent", { subagent_type: "dev" }), "allow");
expect(
    "Critic starts general-purpose",
    tool("local_crit", "Agent", { subagent_type: "general-purpose" }),
    "allow",
);
expect(
    "chat without a role starts anything",
    tool("local_misc", "Agent", { subagent_type: "general-purpose" }),
    "allow",
);

// Registry lock (T-74): a held lock blocks with exit 2 after the timeout, a dead lock is taken over
const registry = path.join(kb, "team", "registry.json");
const lock = `${registry}.lock`;
const rename = (host, title) =>
    run(
        "registry-title.mjs",
        host,
        { tool_input: { session_id: "self", title }, tool_response: "renamed" },
        { block: true },
    );
const regBefore = fs.readFileSync(registry, "utf8");
fs.writeFileSync(lock, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
const held = rename("local_lock", "Dev 5");
expect(
    "registry lock held: registry-title blocks, registry unchanged",
    held?.blocked?.includes(lock) && fs.readFileSync(registry, "utf8") === regBefore
        ? `block (Exit 2): ${held.blocked}`
        : `allow: ${JSON.stringify(held)}`,
    "block",
);
const dead = spawnSync(process.execPath, ["-e", "process.stdout.write(String(process.pid))"], {
    encoding: "utf8",
});
fs.writeFileSync(lock, JSON.stringify({ pid: Number(dead.stdout), at: new Date().toISOString() }));
rename("local_lock", "Dev 5");
expect(
    "registry lock with a dead holder: taken over, entry written",
    JSON.parse(fs.readFileSync(registry, "utf8")).local_lock?.title === "Dev 5" &&
        !fs.existsSync(lock)
        ? "allow"
        : "deny",
    "allow",
);

// Broken registry: managing other chats blocked, rename and clear blocked, style allowed,
// the registry stays unchanged and is backed up
fs.writeFileSync(registry, "{ broken");
expect(
    "broken registry: Orch sets the model of Dev 3",
    mgmt("local_orch", "set_session_model", {
        session_id: "local_new",
        model: "claude-sonnet-5-5",
    }),
    "deny",
);
expect(
    "broken registry: Orch stops Implementer",
    mgmt("local_orch", "stop_session", { session_id: "local_impl" }),
    "deny",
);
expect(
    "broken registry: chat calls itself Dev 4 (taken titles cannot be checked)",
    mgmt("local_fresh", "set_session_title", { session_id: "self", title: "Dev 4" }),
    "block",
);
expect(
    "broken registry: chat calls itself Orchestrator (already taken)",
    mgmt("local_fresh", "set_session_title", { session_id: "self", title: "Orchestrator" }),
    "block",
);
run("registry-title.mjs", "local_fresh", {
    tool_input: { session_id: "self", title: "Dev 4" },
    tool_response: "renamed",
});
expect(
    "broken registry: registry-title leaves it unchanged",
    fs.readFileSync(registry, "utf8") === "{ broken" ? "allow" : "deny",
    "allow",
);
const backups = () =>
    fs.readdirSync(path.dirname(registry)).filter((n) => n.startsWith("registry.json.broken-"));
expect(
    "broken registry: backup registry.json.broken-* created",
    backups().length === 1 && !backups()[0].includes(":") ? "allow" : `deny: ${backups()}`,
    "allow",
);
expect(
    "broken registry: chat sets the style Dev",
    mgmt("local_fresh", "set_session_output_style", { session_id: "self", style: "Dev" }),
    "allow",
);
expect(
    "broken registry: chat clears itself",
    mgmt("local_fresh", "clear_session", { session_id: "self" }),
    "block",
);
expect(
    "broken registry: Dev 3 clears (free, new assignment)",
    (workState("dev/dev-3/arbeitsstand.md", FREE), clearSelf("local_new")),
    "block",
);
start("local_fresh", "Dev 4");
expect(
    "broken registry: start hook leaves it unchanged",
    fs.readFileSync(registry, "utf8") === "{ broken" ? "allow" : "deny",
    "allow",
);

// The user's global configuration is off limits (Write/Edit/shell), also without a role
const styleInRepo = path.join(HOOKS, "..", "..", ".claude", "output-styles", "X.md");
expect(
    "Write to ~/.claude/output-styles blocked",
    tool("local_orch", "Write", { file_path: "~/.claude/output-styles/X.md", content: "x" }),
    "deny",
);
expect(
    "Write into the repo's .claude/output-styles allowed",
    tool("local_orch", "Write", { file_path: styleInRepo, content: "x" }),
    "allow",
);
expect(
    "Bash echo > ~/.claude/settings.json blocked",
    tool("local_orch", "Bash", { command: "echo x > ~/.claude/settings.json" }),
    "deny",
);
expect(
    "Bash cat ~/.claude/settings.json allowed",
    tool("local_orch", "Bash", { command: "cat ~/.claude/settings.json" }),
    "allow",
);
expect(
    "PowerShell Set-Content to APPDATA blocked",
    tool("local_orch", "PowerShell", { command: "Set-Content $env:APPDATA\\x.txt y" }),
    "deny",
);
expect(
    "Edit below APPDATA blocked",
    tool("local_orch", "Edit", {
        file_path: path.join(appdata, "Claude", "x.json"),
        old_string: "a",
        new_string: "b",
    }),
    "deny",
);
expect(
    "chat without a role: Write to ~/.claude blocked",
    tool("local_misc", "Write", { file_path: "~/.claude/output-styles/X.md", content: "x" }),
    "deny",
);

// Critic pool 2 (T-107): a copy of the hooks with a roles.json whose critic entry has pool 2. The project's
// own roles.json stays unchanged.
const poolTeam = fs.mkdtempSync(path.join(os.tmpdir(), "team-pool-"));
fs.cpSync(HOOKS, path.join(poolTeam, "hooks"), { recursive: true });
for (const name of ["sync-rules.mjs", "team.config.json"])
    fs.copyFileSync(path.join(HOOKS, "..", name), path.join(poolTeam, name));
const poolRoles = JSON.parse(fs.readFileSync(path.join(HOOKS, "..", "roles.json"), "utf8"));
const criticChat = poolRoles.chats.find((c) => c.role === "critic");
criticChat.pool = 2;
fs.writeFileSync(path.join(poolTeam, "roles.json"), JSON.stringify(poolRoles, null, 2));
hooksDir = path.join(poolTeam, "hooks");
// The broken-registry cases above leave "{ broken": start again with an empty registry.
fs.writeFileSync(registry, "{}\n");
start("local_orch", "Orchestrator");
start("local_adv", "Advisor");

const crit2Hint = start("local_crit2", "Critic 2", criticChat.model).hookSpecificOutput
    .additionalContext;
expect(
    "Startup: Critic 2 has role critic and its own work state",
    crit2Hint.includes("role critic") &&
        crit2Hint.includes(`${kb.replace(/\\/g, "/")}/critic/critic-2/work-state.md`)
        ? "allow"
        : "deny: " + crit2Hint,
    "allow",
);
expect(
    "Orch sets Critic 2 to the planned model",
    mgmt("local_orch", "set_session_model", { session_id: "local_crit2", model: criticChat.model }),
    "allow",
);
expect(
    "Orch sets Critic 2 to another model",
    mgmt("local_orch", "set_session_model", {
        session_id: "local_crit2",
        model: "claude-sonnet-5-5",
    }),
    "deny",
);
expect(
    "Orch sets Critic 2 to the planned effort",
    mgmt("local_orch", "set_session_effort", {
        session_id: "local_crit2",
        effort: criticChat.effort,
    }),
    "allow",
);
expect(
    "Orch stops Critic 2 (external)",
    mgmt("local_orch", "stop_session", { session_id: "local_crit2" }),
    "deny: " + '"Critic 2" is external. Only the user changes external chats (Critic…, Advisor).',
);
workState("critic/critic-2/work-state.md", EN("T-12", "Review T-16 round 1"));
expect(
    "Critic 2 clears without completion note (Assignment: T-12)",
    clearSelf("local_crit2"),
    "block",
);
workState("critic/critic-2/work-state.md", EN("T-12", "Review T-16 round 1", "T-12"));
expect("Critic 2 clears with completion note (Completed: T-12)", clearSelf("local_crit2"), "allow");
hooksDir = HOOKS;
fs.rmSync(poolTeam, { recursive: true, force: true });

// Send counter (T-38): sync registers send-counter.mjs for PreToolUse and PostToolUse of the send tools and for
// UserPromptSubmit in the project's .claude/settings.json.
const sendGroups = (() => {
    try {
        const { hooks } = JSON.parse(
            fs.readFileSync(path.join(HOOKS, "..", "..", ".claude", "settings.json"), "utf8"),
        );
        const has = (event, matcher) =>
            (hooks?.[event] ?? []).some(
                (g) =>
                    g.matcher === matcher &&
                    g.hooks?.some((h) => h.command?.includes("team/hooks/send-counter.mjs")),
            );
        const sends = `^(${SEND_TOOLS.join("|")})$`;
        const missing = [
            ["PreToolUse", sends],
            ["PostToolUse", sends],
            ["UserPromptSubmit", undefined],
        ].filter(([event, matcher]) => !has(event, matcher));
        return missing.length ? `deny: missing ${missing.map(([e]) => e).join(", ")}` : "allow";
    } catch (e) {
        return `deny: ${e.message}`;
    }
})();
expect("settings.json registers send-counter.mjs (3 groups)", sendGroups, "allow");

// Idle monitor (T-108): sync registers idle-watch.mjs on SessionStart and Stop (async, asyncRewake, timeout
// watchSeconds + 60 from team.config.json "idle") and stop-guard.mjs on Stop (sync). A wrong timeout is drift
// after a config change: run node team/sync.mjs.
const idleHooks = (() => {
    try {
        const { hooks } = JSON.parse(
            fs.readFileSync(path.join(HOOKS, "..", "..", ".claude", "settings.json"), "utf8"),
        );
        const cfg = JSON.parse(fs.readFileSync(path.join(HOOKS, "..", "team.config.json"), "utf8"));
        const timeout = idleConfig(cfg).watchSeconds + 60;
        const entries = (event, script) =>
            (hooks?.[event] ?? []).flatMap((g) =>
                (g.hooks ?? []).filter((h) => h.command?.includes(`team/hooks/${script}`)),
            );
        const problems = [];
        for (const event of ["SessionStart", "Stop"]) {
            const found = entries(event, "idle-watch.mjs");
            if (found.length !== 1)
                problems.push(`${event}: ${found.length} idle-watch.mjs entries`);
            else if (!(found[0].async === true && found[0].asyncRewake === true))
                problems.push(`${event}: idle-watch.mjs not async + asyncRewake`);
            else if (found[0].timeout !== timeout)
                problems.push(
                    `${event}: idle-watch.mjs timeout ${found[0].timeout}, config wants ${timeout} (run node team/sync.mjs)`,
                );
        }
        const guard = entries("Stop", "stop-guard.mjs");
        if (guard.length !== 1 || guard[0].async)
            problems.push("Stop: stop-guard.mjs not one sync entry");
        return problems.length ? `deny: ${problems.join("; ")}` : "allow";
    } catch (e) {
        return `deny: ${e.message}`;
    }
})();
expect("settings.json registers idle-watch.mjs and stop-guard.mjs (T-108)", idleHooks, "allow");

// stop-guard.mjs: blocks once while the Implementer's work state says working and background tasks run, only with
// the idle monitor on in this project's team.config.json (T-156, D-186); with it off the guard always allows
const guardOn = (() => {
    try {
        return idleConfig(
            JSON.parse(fs.readFileSync(path.join(HOOKS, "..", "team.config.json"), "utf8")),
        ).enabled;
    } catch {
        return false;
    }
})();
const guard = (host, input) => {
    const out = run("stop-guard.mjs", host, input);
    return out?.decision === "block" ? `block: ${out.reason}` : "allow";
};
const TASKS = [{ id: "b1", type: "shell", status: "running", description: "sleep 90" }];
start("local_impl", "Implementer"); // the registry cases above replaced the registry
workState("implementer/work-state.md", "# Work state Implementer\nStatus: working\n");
expect(
    guardOn
        ? "stop-guard: working + background task → block"
        : "stop-guard: idle monitor off, working + background task → allow",
    guard("local_impl", { stop_hook_active: false, background_tasks: TASKS }),
    guardOn ? "block" : "allow",
);
expect(
    "stop-guard: stop_hook_active → allow",
    guard("local_impl", { stop_hook_active: true, background_tasks: TASKS }),
    "allow",
);
expect(
    "stop-guard: no background tasks → allow",
    guard("local_impl", { stop_hook_active: false, background_tasks: [] }),
    "allow",
);
workState("implementer/work-state.md", "# Work state Implementer\nStatus: free\n");
expect(
    "stop-guard: not working → allow",
    guard("local_impl", { stop_hook_active: false, background_tasks: TASKS }),
    "allow",
);

// idle-watch.mjs: a chat that is not Orchestrator or Implementer exits 0 at once and writes nothing
const idleRun = spawnSync(process.execPath, [path.join(hooksDir, "idle-watch.mjs")], {
    input: "{}",
    encoding: "utf8",
    timeout: 20000,
    env: {
        ...process.env,
        TEAM_KB_OVERRIDE: kb,
        CLAUDE_CODE_HOST_SESSION_ID: "local_res",
        HOME: home,
        USERPROFILE: home,
    },
});
expect(
    "idle-watch: Researcher exits 0 without a lock",
    idleRun.status === 0 && !fs.existsSync(path.join(kb, "team", "idle"))
        ? "allow"
        : `deny: exit ${idleRun.status}`,
    "allow",
);

// team styles in the user home are only reported; the exit code stays the same
const userStyleWarning = userLevelTeamStylesWarning();
if (userStyleWarning) process.stderr.write(userStyleWarning);

fs.rmSync(kb, { recursive: true, force: true });
fs.rmSync(home, { recursive: true, force: true });
console.log(failed ? `\n${failed} test(s) failed.` : "\nAll tests passed.");
process.exit(failed ? 1 : 0);

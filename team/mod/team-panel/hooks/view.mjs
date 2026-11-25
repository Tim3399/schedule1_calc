// Team panel view model (T-149, D-149-2). Pure code: no `$`, no Node, no file access, so the mod
// (register.tsx) and the package tests (node --test) share it.
//
// Input:
//   status     parsed <KB>/team/status.json, schema 1 (contract: header of team/hooks/status-file.mjs), or null
//   sends      live counts { "<local_… id>": <int> } read from <KB>/team/sends/*.json; they win over status.chats[].sends
//   sessionId  $.session.id() of the session the panel runs in (registry field `sessionId`, not the local_… id)
//
// Output of buildView:
//   {
//     kind: "role" | "team",                 // "team": the session is not in status.chats
//     role: "<role>" | null, title: "<chat title>" | null,
//     budget: { n } | null,                  // own send count; null in the team view
//     sections: [{ title: "<heading>", rows: [{ text: "<line>", level: "normal" | "warn" | "blocked" | "dim" }] }]
//   }
//   Send counts are plain counts with no limit (T-164, D-195); "warn"/"blocked" mark waits and broken slots only.
//
// Activation (F-149-2): teamProject({ kb, statusExists, registryExists }) -> { active, reason }.
//   active only if the knowledge base resolved (kb is a path) and <kb>/team/status.json or
//   <kb>/team/registry.json exists. Otherwise the mod opens no pane and polls nothing; reason says why
//   (shown only as the answer of /team). The check runs at session start and on /team, not in between.

const DONE = /^(done|completed|merged|accepted)\b/i;

export function budgetOf(n) {
    return { n };
}

// Live count first, then the snapshot, then 0.
const sendsOf = (chat, sends) => {
    const live = sends?.[chat.id];
    if (Number.isInteger(live) && live >= 0) return live;
    return Number.isInteger(chat.sends) && chat.sends >= 0 ? chat.sends : 0;
};

const row = (text, level = "normal") => ({ text, level });
const dash = (v) => (v == null || v === "" ? "–" : String(v)); // null or not set;

function versionSection(status) {
    const v = status?.version;
    if (!v) return { title: "Version", rows: [row("no current version", "dim")] };
    return { title: "Version", rows: [row(`${v.name}: ${v.done} of ${v.total} done`)] };
}

function openTasksSection(status) {
    const open = (status?.version?.tasks ?? []).filter((t) => !DONE.test(t.status ?? ""));
    return {
        title: "Open tasks",
        rows: open.length
            ? open.map((t) =>
                  row(
                      `${t.id} ${dash(t.status)} – ${dash(t.assignedTo)}${t.waitingFor ? ` (waiting for ${t.waitingFor})` : ""}: ${dash(t.title)}`,
                      t.waitingFor ? "warn" : "normal",
                  ),
              )
            : [row("none", "dim")],
    };
}

// Every chat with its count, plus live send files that no chat of the snapshot names.
function sendsSection(status, sends) {
    const chats = status?.chats ?? [];
    const known = new Set(chats.map((c) => c.id));
    const all = [
        ...chats.map((c) => ({ label: c.title ?? c.id, n: sendsOf(c, sends) })),
        ...Object.entries(sends ?? {})
            .filter(([id]) => !known.has(id))
            .map(([id, n]) => ({ label: id, n })),
    ];
    return {
        title: "Sends of all chats",
        rows: all.length
            ? all.map(({ label, n }) => row(`${label}: ${n}`))
            : [row("no chats", "dim")],
    };
}

function assignmentSection(title, chat) {
    const rows = [row(`${dash(chat.assignment)} (${dash(chat.status)})`)];
    if (chat.waitingFor && chat.waitingFor !== "–")
        rows.push(row(`waiting for ${chat.waitingFor}`, "warn"));
    return { title, rows };
}

function devSlotsSection(status) {
    const pool = status?.devPool ?? [];
    const rows = pool.length
        ? pool.map((d) =>
              row(
                  `${d.title}: ${dash(d.status)}${d.assignment ? ` – ${d.assignment}` : ""}`,
                  d.status === "broken" ? "blocked" : d.status === "busy" ? "normal" : "dim",
              ),
          )
        : (status?.chats ?? [])
              .filter((c) => c.role === "dev")
              .map((c) => row(`${c.title}: ${dash(c.status)} – ${dash(c.assignment)}`));
    return { title: "Dev slots", rows: rows.length ? rows : [row("no dev slots", "dim")] };
}

function teamChatsSection(status, sends) {
    const chats = status?.chats ?? [];
    return {
        title: "Chats",
        rows: chats.length
            ? chats.map((c) =>
                  row(
                      `${c.title ?? c.id}: ${dash(c.status)} – ${dash(c.assignment)} – sends ${sendsOf(c, sends)}`,
                  ),
              )
            : [row("no chats", "dim")],
    };
}

const ROLE_SECTIONS = {
    orchestrator: (s, chat, sends) => [
        versionSection(s),
        openTasksSection(s),
        sendsSection(s, sends),
    ],
    implementer: (s, chat) => [assignmentSection("Assignment", chat), devSlotsSection(s)],
    dev: (s, chat) => [assignmentSection("Part", chat)],
    critic: (s, chat) => [assignmentSection("Review queue", chat)],
};
const assignmentOnly = (s, chat) => [assignmentSection("Assignment", chat)];

export function buildView(status, sends, sessionId) {
    const chat =
        sessionId && (status?.chats ?? []).find((c) => c.sessionId && c.sessionId === sessionId);
    if (!chat) {
        return {
            kind: "team",
            role: null,
            title: null,
            budget: null,
            sections: [
                versionSection(status),
                teamChatsSection(status, sends),
                ...(status
                    ? []
                    : [{ title: "Status", rows: [row("status.json not found yet", "dim")] }]),
            ],
        };
    }
    const n = sendsOf(chat, sends);
    const sections = (ROLE_SECTIONS[chat.role] ?? assignmentOnly)(status, chat, sends);
    return {
        kind: "role",
        role: chat.role ?? null,
        title: chat.title ?? null,
        budget: budgetOf(n),
        sections,
    };
}

export function teamProject({ kb, statusExists, registryExists }) {
    if (typeof kb !== "string" || kb === "")
        return {
            active: false,
            reason: "this project has no team configuration (team/team.config.json), so no knowledge base is known",
        };
    if (statusExists || registryExists) return { active: true, reason: null };
    return {
        active: false,
        reason: `the knowledge base ${kb} has no team/status.json or team/registry.json yet`,
    };
}

// Plain text of a view model (tests, report, terminal fallback).
export function renderText(view) {
    const lines = [view.kind === "team" ? "Team overview" : `${view.title} (${view.role})`];
    if (view.budget) {
        const b = view.budget;
        lines.push(`Sends: ${b.n}`);
    }
    for (const s of view.sections) {
        lines.push(`## ${s.title}`);
        for (const r of s.rows) lines.push(`- ${r.text}`);
    }
    return lines.join("\n");
}

// ---- KB path, same order as team/hooks/kb-root.mjs, from values the mod read with $ ----
// Source 3 (env <PROJECT>_KB_ROOT) is left out: the mod API reads environment variables only by literal name.

const isAbsolute = (p) => typeof p === "string" && /^([A-Za-z]:[\\/]|[\\/])/.test(p);
const slashes = (p) => p.replace(/\\/g, "/");

// -> { path, source } or null
export function resolveKb({ override, config, local, home }) {
    for (const [value, source] of [
        [override, "override"],
        [config?.kbRoot, "config"],
        [local?.kbRoot, "local"],
    ])
        if (isAbsolute(value)) return { path: slashes(value), source };
    const name = config?.project?.name;
    if (isAbsolute(home) && typeof name === "string" && name.trim())
        return { path: `${slashes(home).replace(/\/$/, "")}/git/${name}-kb`, source: "default" };
    return null;
}

// Main checkout of dir from the text of <dir>/.git ("gitdir: <main>/.git/worktrees/<name>") and of the
// worktree's commondir file. Anything else: dir itself (as mainCheckoutDir in kb-root.mjs).
export function gitdirOf(dotGitText) {
    return /^gitdir:\s*(.+?)\s*$/m.exec(dotGitText ?? "")?.[1] ?? null;
}

export function mainCheckoutOf(dir, gitdir, commondirText) {
    if (!gitdir || !commondirText?.trim()) return slashes(dir);
    const abs = (base, p) => (isAbsolute(p) ? slashes(p) : `${slashes(base)}/${slashes(p)}`);
    const common = normalize(abs(abs(dir, gitdir), commondirText.trim()));
    if (!common.endsWith("/.git")) return slashes(dir);
    return common.slice(0, -"/.git".length);
}

function normalize(p) {
    const out = [];
    for (const part of p.split("/")) {
        if (part === "..") {
            if (out.length > 1) out.pop();
        } else if (part !== "." && (part !== "" || out.length === 0)) out.push(part);
    }
    return out.join("/").replace(/\/+$/, "");
}

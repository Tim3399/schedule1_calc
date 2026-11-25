// Chat pools (T-107): how many chats of one role exist, their titles, slots and work-state folders.
// The one implementation for bootstrap, hooks, sync and portal. No imports with side effects: this module
// must not import hooks/lib.mjs.
//
// Title rules of a chat entry in team/roles.json:
// - "numbered": the title has "{n}" (Dev {n}). Slots 1..pool are "Dev 1" … "Dev <pool>".
// - "firstPlain": slot 1 is the plain title (Critic), slots 2..pool are "Critic 2" … "Critic <pool>".
//   "Critic 1" is never a valid title, so growing a pool never renames an existing chat.
//
// Work-state folder (relative to the KB, forward slashes):
// - numbered: <role>/<role>-<n>   (dev/dev-3)
// - firstPlain: slot 1 <role>, slot k >= 2 <role>/<role>-<k>   (critic, critic/critic-2)

import path from "node:path";
import { mainCheckoutDir } from "./kb-root.mjs";

// Pool settings in team.config.json, by role. Roles without an entry always have pool 1.
// T-117 adds implementer here.
export const POOL_LIMITS = {
    dev: { key: "devPool", min: 1, max: 6, default: 6 },
    critic: { key: "criticPool", min: 1, max: 3, default: 1 },
};

export const NUMBERED = "numbered";
export const FIRST_PLAIN = "firstPlain";

export const ruleOfTitle = (title) => (String(title).includes("{n}") ? NUMBERED : FIRST_PLAIN);

// Errors for invalid pool values, each names the key and the range. A missing key is fine (default).
export function poolErrors(config) {
    const errors = [];
    for (const { key, min, max } of Object.values(POOL_LIMITS)) {
        if (!(key in (config ?? {}))) continue;
        const v = config[key];
        if (!Number.isInteger(v) || v < min || v > max)
            errors.push(
                `${key} must be an integer from ${min} to ${max} (found ${JSON.stringify(v)})`,
            );
    }
    return errors;
}

// Pool size of a role from team.config.json (default when missing). Call poolErrors first.
export function poolFromConfig(config, role) {
    const limit = POOL_LIMITS[role];
    if (!limit) return 1;
    return config?.[limit.key] ?? limit.default;
}

// Pool size of a chat entry of roles.json. Compatibility (What 11): an old roles.json has no per-chat
// pool; then dev falls back to the top-level devPool and every other role to 1.
export function poolOfChat(chat, roles) {
    if (Number.isInteger(chat?.pool) && chat.pool >= 1) return chat.pool;
    if (chat?.role === "dev" && Number.isInteger(roles?.devPool)) return roles.devPool;
    return 1;
}

// Title of a slot: numbered "Dev 3", firstPlain slot 1 "Critic", slot k "Critic k".
export function titleOfSlot(chat, slot) {
    if (ruleOfTitle(chat.title) === NUMBERED) return chat.title.replace("{n}", slot);
    return slot === 1 ? chat.title : `${chat.title} ${slot}`;
}

// All titles of a chat entry: [{ title, slot }] for slot 1..pool.
export function titlesOfChat(chat, roles) {
    return Array.from({ length: poolOfChat(chat, roles) }, (_, i) => ({
        title: titleOfSlot(chat, i + 1),
        slot: i + 1,
    }));
}

// Display list for docs: "Critic", "Critic, Critic 2", "Dev 1 … Dev 6" (numbered with pool > 2).
export function titleList(chat, roles) {
    const t = titlesOfChat(chat, roles).map((x) => x.title);
    if (ruleOfTitle(chat.title) === NUMBERED && t.length > 2) return `${t[0]} … ${t.at(-1)}`;
    return t.join(", ");
}

// ---------- Chat titles with the project name (T-155, D-176) ----------
// A role chat is titled "<role title> - <project>" ("Dev 3 - ai-infra"); the plain "<role title>" stays valid.
// This is the one title parser: every title match goes through splitTitle/titleKey, no second regex.

export const TITLE_SEPARATOR = " - ";

// "Dev 3 - ai-infra" → { base: "Dev 3", project: "ai-infra" }; "Dev 3" → { base: "Dev 3", project: null }.
// Split at the last separator.
export function splitTitle(title) {
    const t = String(title ?? "").trim();
    const at = t.lastIndexOf(TITLE_SEPARATOR);
    if (at <= 0) return { base: t, project: null };
    const project = t.slice(at + TITLE_SEPARATOR.length).trim();
    return project ? { base: t.slice(0, at).trim(), project } : { base: t, project: null };
}

// "<base> - <project>", the plain base when the project is empty
export const fullTitle = (base, project) =>
    project ? `${base}${TITLE_SEPARATOR}${project}` : String(base);

const sameName = (a, b) => String(a).toLowerCase() === String(b ?? "").toLowerCase();

// The role part of a title for this project: the base when the suffix is missing or names this project,
// else null (another project's chat).
// F-155-1: a title ending in " - <project>" (whole suffix, case-insensitive) is cut there, so a project name
// that itself contains " - " ("my - app") works; only otherwise the last separator decides.
export function titleBase(title, project) {
    const t = String(title ?? "").trim();
    if (project) {
        const suffix = TITLE_SEPARATOR + String(project).trim();
        if (t.length > suffix.length && sameName(t.slice(-suffix.length), suffix))
            return t.slice(0, -suffix.length).trim() || null;
    }
    const s = splitTitle(t);
    if (s.project === null || (project && sameName(s.project, project))) return s.base;
    return null;
}

// F-155-2: role part of a title whose suffix names another (e.g. the former) project: the text before the first
// separator (role titles contain none); null without a suffix.
export function foreignBase(title) {
    const t = String(title ?? "").trim();
    const at = t.indexOf(TITLE_SEPARATOR);
    return at > 0 ? t.slice(0, at).trim() : null;
}

// Comparison key: "Orchestrator" and "Orchestrator - <project>" give the same key; a title with another
// project's suffix keeps its whole text (it never equals a role title of this project).
export function titleKey(title, project) {
    const base = titleBase(title, project);
    return (base ?? String(title ?? "").trim()).toLowerCase();
}

// Project name for titles: config.project.name of team/team.config.json, default the folder name of the main
// checkout (also from a worktree).
export function projectName(config, projectDir) {
    const name = config?.project?.name;
    if (typeof name === "string" && name.trim()) return name.trim();
    return projectDir ? path.basename(mainCheckoutDir(projectDir)) : null;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Slot that a title matches by the title rule alone, ignoring the pool size; null if it matches no rule.
// numbered: "Dev 7" → 7. firstPlain: "Critic" → 1, "Critic 5" → 5, "Critic 1" → null (never valid).
// "<Title> <k>" only for roles with a pool setting (POOL_LIMITS): "Orchestrator 2" matches nothing.
export function slotByRule(chat, title) {
    const t = String(title ?? "").trim();
    if (ruleOfTitle(chat.title) === NUMBERED) {
        const re = new RegExp(`^${escapeRe(chat.title).replace("\\{n\\}", "(\\d+)")}$`, "i");
        const m = t.match(re);
        const slot = m ? Number(m[1]) : 0;
        return slot >= 1 ? slot : null;
    }
    if (t.toLowerCase() === chat.title.toLowerCase()) return 1;
    if (!POOL_LIMITS[chat.role]) return null;
    const m = t.match(new RegExp(`^${escapeRe(chat.title)} (\\d+)$`, "i"));
    const slot = m ? Number(m[1]) : 0;
    return slot >= 2 ? slot : null;
}

// title -> { role, title, slot, chat, inPool } or null. inPool is false when the title matches a title
// rule but its slot is above the pool (shrunk pool, What 10: such a registered chat keeps its role with
// a warning). With { inPoolOnly: true } only titles inside the pool match (new claims, renames).
// Keep rule for callers (N-6, N-10): inPool → role; !inPool → role only if the registry entry of that
// chat already had this role, otherwise no role.
// T-155: matches the base of the title (splitTitle); a suffix must name this project (opts.project), another
// project's suffix (or any suffix without opts.project) gives null. The returned title is the base ("Dev 3").
// opts.keepForeign (F-155-2): a suffix naming another project is ignored (registered chats after a change of
// project.name keep their role); never for new claims or renames.
export function matchTitle(
    roles,
    title,
    { inPoolOnly = false, project = null, keepForeign = false } = {},
) {
    if (!title) return null;
    const base = titleBase(title, project) ?? (keepForeign ? foreignBase(title) : null);
    if (!base) return null;
    for (const chat of roles?.chats ?? []) {
        const slot = slotByRule(chat, base);
        if (!slot) continue;
        const inPool = slot <= poolOfChat(chat, roles);
        if (inPoolOnly && !inPool) return null;
        return { role: chat.role, title: titleOfSlot(chat, slot), slot, chat, inPool };
    }
    return null;
}

// Work-state folder of a slot relative to the KB (forward slashes), see the header.
export function workStateDir(chat, slot) {
    if (ruleOfTitle(chat.title) === NUMBERED) return `${chat.role}/${chat.role}-${slot}`;
    return !slot || slot === 1 ? chat.role : `${chat.role}/${chat.role}-${slot}`;
}

// Suffix for per-slot names (worktrees): numbered always "<role>-<n>", firstPlain slot 1 just "<role>".
export const slotName = (chat, slot) =>
    ruleOfTitle(chat.title) === NUMBERED || (slot && slot > 1) ? `${chat.role}-${slot}` : chat.role;

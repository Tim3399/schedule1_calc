// Shared ID grammar for the team hooks and the portal (plan Portal 0.5.0 §3.3, T-61).
// This module is the only definition of FAMILY_RE. hooks/lib.mjs re-exports taskFamily from here,
// lib/portal/ids.mjs builds its search pattern from ID_FORMS.
//
// No imports with side effects: this module must not import hooks/lib.mjs (that one reads the team
// config on load). The portal imports this file directly from the package template.

// Task family of an assignment ID, or null. The first ID in the text counts, also behind prefix text
// ("Review T-16 round 1" → T-16, "Review plan agent-team v0.3.0" → V-0.3.0).
//   T-<n>… and D-<n>…    → T-<n>   (T-16-F1, T-16-r2, D-16-1, D-16F-1)
//   R-<n>… / A-<n>…      → R-<n> / A-<n>
//   V-<x.y.z>…, v<x.y.z> → V-<x.y.z>   (V-0.2.1-F1, V-0.4.0-p1)
//   D-V<xyz>…            → V-<x.y.z>   (D-V021-7, D-V030R5-1 → V-0.3.0)
//   D-<valid ID>…        → its family (D-T-16-1, D-T-127-fix → T-127; D-R-7-1 → R-7)
export const FAMILY_RE =
    /(?<![\w.-])(?:D-)?(?:D-V(\d)(\d)(\d+)|[Vv]-?(\d+\.\d+\.\d+)|([TDRA])-(\d+))/;

// Kinds returned by classifyId (plan §3.3):
//   "T"   T-16            "T-F" T-16-F1        "T-r" T-16-r2
//   "D"   D-12, D-16-1, D-16F-1 (decision or dev part; the portal tells them apart, see ids.mjs)
//   "D-T" D-T-127-fix     "D-V" D-V030R5-1     "V"   V-0.4.0, V-0.4.0-p1, v0.3.0
//   "R"   R-7, R-10c        "A"   A-1  "F"   F-v040-10, F-3
export const ID_KINDS = ["T", "T-F", "T-r", "D", "D-T", "D-V", "V", "R", "A", "F"];

// Search forms for findIds, longest form first: [portalKind, regexSource]. The portal kinds
// (fix, review, devfix, devtask, finding, task, decision, research) stay as they are today, new forms
// get new kinds: devtaskref (D-T-127-fix), devversion (D-V030R5-1), version (V-0.4.0-p1) and advice (A-1).
// version needs a capital "V-", so "v0.3.0" in prose stays plain text as before.
const SUFFIX = "(?:-[A-Za-z0-9]+)*";
export const ID_FORMS = [
    ["devtaskref", `D-T-\\d+[A-Za-z0-9]*${SUFFIX}`],
    ["devversion", `D-V\\d{3,}[A-Za-z0-9]*${SUFFIX}`],
    ["version", `V-\\d+\\.\\d+\\.\\d+${SUFFIX}`],
    ["fix", "T-\\d+-F\\d+"],
    ["review", "T-\\d+-r\\d+"],
    ["devfix", "D-\\d+F-\\d+"],
    ["devtask", "D-\\d+-\\d+"],
    ["finding", "F-[A-Za-z0-9]+-\\d+"],
    ["task", "T-\\d+"],
    ["decision", "D-\\d+"],
    ["research", "R-\\d+[a-z]?"],
    ["advice", "A-\\d+"],
];

// Full-text patterns for classifyId: [kind, regex, linked(match) → ID or null], first match wins.
const TAIL = "(?:[A-Za-z0-9]*(?:-[A-Za-z0-9]+)*)";
const KIND_PATTERNS = [
    ["T", /^T-\d+$/, () => null],
    ["T-F", /^(T-\d+)-F\d+$/, (m) => m[1]],
    ["T-r", /^(T-\d+)-r\d+$/, (m) => m[1]],
    ["D-T", new RegExp(`^D-(T-\\d+)${TAIL}$`), (m) => m[1]],
    ["D-V", new RegExp(`^D-V(\\d)(\\d)(\\d+)${TAIL}$`), (m) => `V-${m[1]}.${m[2]}.${m[3]}`],
    ["D-V", /^D-[Vv]-?(\d+\.\d+\.\d+)(?:-[A-Za-z0-9]+)*$/, (m) => `V-${m[1]}`],
    // D-R-7-1: dev part of research R-7
    ["D", /^D-(R-\d+)(?:-[A-Za-z0-9]+)*$/, (m) => m[1]],
    // D-16-1 and D-16F-1 belong to T-16; the decision D-12 refers to nothing
    ["D", /^D-(\d+)(F?-\d+)?$/, (m) => (m[2] ? `T-${m[1]}` : null)],
    ["V", /^[Vv]-?(\d+\.\d+\.\d+)((?:-[A-Za-z0-9]+)*)$/, (m) => (m[2] ? `V-${m[1]}` : null)],
    ["R", /^R-(\d+)[a-z]?$/, (m) => (m[0] === `R-${m[1]}` ? null : `R-${m[1]}`)],
    ["A", /^A-\d+$/, () => null],
    ["F", /^F-(?:[A-Za-z0-9]+-)?\d+$/, () => null],
];

// "<id>" → { id, kind, family, linked } or null when the text is no single ID.
//   kind:   one of ID_KINDS
//   family: taskFamily(id) (null for F-…)
//   linked: the ID this one refers to, or null ("D-T-127-fix" → "T-127", "T-16-F1" → "T-16")
export function classifyId(id) {
    if (typeof id !== "string") return null;
    const text = id.trim();
    for (const [kind, re, linked] of KIND_PATTERNS) {
        const m = text.match(re);
        if (m)
            return {
                id: text,
                kind,
                family: kind === "F" ? null : taskFamily(text),
                linked: linked(m),
            };
    }
    return null;
}

export function taskFamily(id) {
    if (typeof id !== "string") return null;
    const m = id.match(FAMILY_RE);
    if (!m) return null;
    if (m[1] !== undefined) return `V-${m[1]}.${m[2]}.${m[3]}`;
    if (m[4] !== undefined) return `V-${m[4]}`;
    return `${m[5] === "D" ? "T" : m[5]}-${m[6]}`;
}

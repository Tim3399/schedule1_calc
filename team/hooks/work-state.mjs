// Work state format (T-61, D-61): file names, field keywords and status words, English and German.
// Used by the hooks (clear check, session start, bootstrap) and by the portal (lib/portal/parse/documents.mjs).
//
// Bilingual rule: English is written, English and German are read. If a work state has the English and
// the German key of the same field ("Assignment:" and "Auftrag:"), the English value wins, no matter which
// line comes first. Keys are matched at the start of a line only, so indented lines in a verbatim block
// ("  Status: working") are never fields.
//
// No imports with side effects: this module must not import hooks/lib.mjs.

// File names in one role folder. The first existing one wins: work-state.md before arbeitsstand.md.
export const WORK_STATE_FILES = ["work-state.md", "arbeitsstand.md"];

// Heading of a work state: "# Work state <title>" (German: "# Arbeitsstand <title>").
export const WORK_STATE_HEADINGS = ["Work state", "Arbeitsstand"];

// English field name → German field names that are still read.
// If a file has both forms for one field, the English value wins (documented rule, T-61 When 1).
export const WORK_STATE_FIELDS = {
    Updated: ["Aktualisiert"],
    Status: [],
    Assignment: ["Auftrag"],
    Completed: ["Abgeschlossen"],
    "New assignment": ["Neuer Auftrag"],
    "New assignment (verbatim)": ["Neuer Auftrag (wörtlich)"],
    State: ["Stand"],
    "Next step": ["Nächster Schritt"],
    "Waiting for": ["Wartet auf"],
    "Open questions": ["Offene Fragen"],
    "Worktree/Branch": [],
    "Sends since user input": [],
};

// Single-line fields: the value is only the rest of the own line. A following free-text line never
// belongs to them ("Completed: –" and then "T-16 is done" does not complete T-16). Repeated
// "Completed:" lines all count (readFieldValues).
export const SINGLE_LINE_FIELDS = [
    "Updated",
    "Status",
    "Assignment",
    "Completed",
    "New assignment",
    "Waiting for",
];

// Status words: English → German (still read).
export const WORK_STATE_STATUS = {
    free: "frei",
    working: "arbeitet",
    waiting: "wartet",
    blocked: "blockiert",
};

// Separator between the ID part and the sender in "Assignment:" / "New assignment:" lines:
// "T-20 from Orchestrator – Brief: …" (German: "T-20 von Orchestrator – Brief: …").
export const SENDER_WORDS = ["from", "von"];

// Protocol words in messages (English → German still read).
export const PROTOCOL = {
    ready: ["READY", "BEREIT"],
    start: ["START"],
    blocked: ["BLOCKED"],
    completed: ["completed", "abgeschlossen"], // "<family> completed"
    verbatim: ["Assignment (verbatim):", "Auftrag (wörtlich):"],
    replyTo: ["Reply to:", "Antwort an:"],
};

// Path of the work state in a role folder: the first existing name from WORK_STATE_FILES,
// else the English name (for new files). dir uses forward slashes, the result too.
export function workStateFile(dir, exists) {
    const base = String(dir).replace(/\\/g, "/").replace(/\/+$/, "");
    for (const name of WORK_STATE_FILES) {
        const file = `${base}/${name}`;
        if (exists(file)) return file;
    }
    return `${base}/${WORK_STATE_FILES[0]}`;
}

// Lower-case key → { name (English), german }
const KEYS = new Map();
for (const [name, germanNames] of Object.entries(WORK_STATE_FIELDS)) {
    KEYS.set(name.toLowerCase(), { name, german: false });
    for (const g of germanNames) KEYS.set(g.toLowerCase(), { name, german: true });
}
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const KEY_RE = new RegExp(
    `^(${[...KEYS.keys()]
        .sort((a, b) => b.length - a.length)
        .map(escapeRe)
        .join("|")}):(.*)$`,
    "iu",
);
// A line that looks like another field ("Notes: …") or a heading ends a multi-line field.
// The ":" must end the line or be followed by whitespace, so "Siehe C:/kb/x" stays a follow-up line.
const OTHER_FIELD_RE = /^(?:#|\p{L}[\p{L}\p{N} ()/._-]*:(?:\s|$))/u;

// Field line rule of the pre-T-61 portal parser (splitField): the line starts with a capital letter,
// and the name ends at the first ":" outside brackets that ends the line or is followed by whitespace.
// So a name with quotes or commas ("Offen, erst nach Ansage „gemergt“: …") is a field line too,
// while "C:/path" is not.
function isCapitalFieldLine(line) {
    if (!/^\p{Lu}/u.test(line)) return false;
    let depth = 0;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === "(" || c === "[" || c === "{") depth++;
        else if (c === ")" || c === "]" || c === "}") depth = Math.max(0, depth - 1);
        else if (c === ":" && depth === 0 && (i === line.length - 1 || /\s/.test(line[i + 1])))
            return true;
    }
    return false;
}

const endsField = (line) => OTHER_FIELD_RE.test(line) || isCapitalFieldLine(line);

// Every field line in text order: [{ name, german, value, line }]. Multi-line values are complete.
function scanFields(text) {
    const lines = String(text ?? "")
        .replace(/\r\n?/g, "\n")
        .split("\n");
    const fields = [];
    let open = null; // parts of the multi-line field that is being collected
    lines.forEach((raw, i) => {
        const m = raw.match(KEY_RE);
        if (m) {
            const { name, german } = KEYS.get(m[1].toLowerCase());
            const field = { name, german, parts: [m[2].trim()], line: i + 1 };
            fields.push(field);
            open = SINGLE_LINE_FIELDS.includes(name) ? null : field;
        } else if (endsField(raw)) open = null;
        else if (open) open.parts.push(raw.trimEnd());
    });
    return fields.map(({ name, german, parts, line }) => {
        while (parts.length && parts[0] === "") parts.shift();
        while (parts.length && parts.at(-1).trim() === "") parts.pop();
        return { name, german, value: parts.join("\n"), line };
    });
}

// Fields of a work state text, keyed by the English name:
//   { [englishName]: { value, line, german } }
//   value:  string (multi-line fields joined with "\n", single-line fields one line)
//   line:   1-based line number of the field line
//   german: true when the value came from the German key
// Rule: the first occurrence of a key counts. If the English and the German key of one field both
// occur, the English one wins, wherever it stands. Unknown field lines end a multi-line field.
export function readWorkState(text) {
    const english = {};
    const german = {};
    for (const f of scanFields(text)) {
        const target = f.german ? german : english;
        target[f.name] ??= { value: f.value, line: f.line, german: f.german };
    }
    return { ...german, ...english };
}

// Values of every occurrence of one field (English name), in text order. Only the winning language
// counts: the English key if it occurs at all, else the German one. For fields that may be repeated,
// such as several "Completed:" lines.
export function readFieldValues(text, name) {
    const all = scanFields(text).filter((f) => f.name === name);
    const english = all.filter((f) => !f.german);
    return (english.length ? english : all).map((f) => f.value);
}

// "free" / "frei" / "Free (…)" → "free"; unknown → null
export function normalizeStatus(value) {
    const word = String(value ?? "")
        .trim()
        .match(/^\p{L}+/u)?.[0]
        ?.toLowerCase();
    if (!word) return null;
    if (Object.hasOwn(WORK_STATE_STATUS, word)) return word;
    return Object.keys(WORK_STATE_STATUS).find((k) => WORK_STATE_STATUS[k] === word) ?? null;
}

// ID part of an assignment line: everything before " from <sender>" / " von <sender>" / " – Brief:"
export function idPart(value) {
    if (typeof value !== "string") return "";
    return value
        .trim()
        .split(/\s+(?:from|von|–|—)\s+/)[0]
        .trim();
}

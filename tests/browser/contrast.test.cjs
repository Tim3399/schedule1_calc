"use strict";

// Checks the two contrast tables of webapp/design/DESIGN.md section 8 ("Text pairs (target
// 4.5:1)" and "Non-text pairs (target 3:1)") against the real CSS in both themes:
//   Dusk  = :root of tokens.css
//   Night = :root overridden by :root[data-theme="dark"] (theme-resolution.test.cjs checks that
//           the prefers-color-scheme block repeats these values)
// Colours that a component composes in styles.css (chip hover/pressed, `Delete` pressed, the
// scene drawing opacity) are read from styles.css.
//
// The pairs come from the DESIGN.md rows; this file only maps the names in the first column to
// colours (FOREGROUNDS, BACKGROUNDS). A row whose name is not mapped fails. A first cell
// "fg / a, / b" or "fg / x over a, b[ layer]" checks one pair per background; the Dusk and
// Night cells then list one value per background, separated by commas.
//
// Method (DESIGN.md section 8): WCAG 2.x relative luminance, alpha colours composited in floating
// point on the named background (no 8-bit rounding), ratios truncated to two decimals. Every pair
// must reach the target of its table, and the printed value must equal the truncated computed
// value. The "Result:" sentence must state the number of checked pairs.
//
// TOKENS_CSS_PATH, STYLES_CSS_PATH and DESIGN_MD_PATH replace the file paths; they exist only for
// the self-check of this test.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const tokensPath = process.env.TOKENS_CSS_PATH || path.join(root, "webapp/static/css/tokens.css");
const stylesPath = process.env.STYLES_CSS_PATH || path.join(root, "webapp/static/css/styles.css");
const designPath = process.env.DESIGN_MD_PATH || path.join(root, "webapp/design/DESIGN.md");
const tokensSource = fs.readFileSync(tokensPath, "utf8");
const stylesSource = fs.readFileSync(stylesPath, "utf8");
const designSource = fs.readFileSync(designPath, "utf8").replace(/\r\n/g, "\n");

const TABLES = [
  { heading: "**Text pairs (target 4.5:1)**", target: 4.5 },
  { heading: "**Non-text pairs (target 3:1)**", target: 3 },
];

// Foreground names of the first column -> token. "either" is a boundary that passes when one of
// its edges reaches the target; the cell names the edge, e.g. "8.95 (border)".
const FOREGROUNDS = {
  "text primary": "--text-primary",
  "text secondary": "--text-secondary",
  "text tertiary": "--text-tertiary",
  link: "--text-link",
  "primary ink": "--action-primary-ink",
  "selected ink": "--selected-ink",
  "money ink": "--money-ink",
  "brand cream": "--brand-cream",
  "header switch ink": "--header-switch-ink",
  "header switch selected ink": "--header-switch-selected-ink",
  success: "--status-success",
  warning: "--status-warning",
  error: "--status-error",
  "control border": "--border-control",
  "control border hover": "--border-control-hover",
  "focus ring": "--focus-ring",
  "focus ring header": "--focus-ring-header",
  "primary fill": "--action-primary",
  "selected surface": "--selected-surface",
  "money boundary": { either: { border: "--money-border", fill: "--money-surface" } },
};

// Background names -> colour spec: a token, { over: alphaToken, base: spec },
// { scene: layerToken } (the drawing opacity of styles.css over the sky bottom),
// { styles: [selector, property] } for a colour that styles.css composes, or
// { tint: [selector, property], base: spec } for a translucent tint of styles.css over a base.
const SWITCH = "--header-switch-surface";
const SWITCH_LAYERS = {
  "sky bottom": "--scene-sky-bottom",
  "sky top": "--scene-sky-top",
  far: { scene: "--scene-far" },
  mid: { scene: "--scene-mid" },
  near: { scene: "--scene-near" },
};
const SWITCH_TINTS = {
  6: '.theme-switch .theme-switch__option:hover:not(:disabled, [aria-checked="true"])',
  10: '.theme-switch .theme-switch__option:active:not(:disabled, [aria-checked="true"])',
};
// "mix(header switch selected n %, switch surface) over <layer>": the hover (n = 6) and pressed
// (n = 10) tint of an unselected theme switch segment over the switch surface over a scene layer.
const SWITCH_TINT_BACKGROUNDS = Object.fromEntries(
  Object.entries(SWITCH_TINTS).flatMap(([percent, selector]) =>
    Object.entries(SWITCH_LAYERS).map(([layer, base]) => [
      `mix(header switch selected ${percent} %, switch surface) over ${layer}`,
      { tint: [selector, "background"], base: { over: SWITCH, base } },
    ]),
  ),
);
const BACKGROUNDS = {
  ...SWITCH_TINT_BACKGROUNDS,
  screen: "--surface-screen",
  panel: "--surface-panel",
  raised: "--surface-raised",
  sunken: "--surface-sunken",
  field: "--surface-field",
  canvas: "--surface-canvas",
  "primary fill": "--action-primary",
  "primary hover": "--action-primary-hover",
  "primary pressed": "--action-primary-pressed",
  "selected surface": "--selected-surface",
  "money surface": "--money-surface",
  "brand outline": "--brand-outline",
  "header switch selected": "--header-switch-selected",
  "panel (border resp. fill, either)": "--surface-panel",
  "mix(guilloche, money surface)": { over: "--money-guilloche", base: "--money-surface" },
  "switch surface over sky bottom": { over: SWITCH, base: "--scene-sky-bottom" },
  "switch surface over sky top": { over: SWITCH, base: "--scene-sky-top" },
  "switch surface over far": { over: SWITCH, base: { scene: "--scene-far" } },
  "switch surface over mid": { over: SWITCH, base: { scene: "--scene-mid" } },
  "switch surface over near": { over: SWITCH, base: { scene: "--scene-near" } },
  "success soft over panel": { over: "--status-success-soft", base: "--surface-panel" },
  "warning soft over panel": { over: "--status-warning-soft", base: "--surface-panel" },
  "error soft over panel": { over: "--status-error-soft", base: "--surface-panel" },
  "warning soft over screen": { over: "--status-warning-soft", base: "--surface-screen" },
  "error soft over screen": { over: "--status-error-soft", base: "--surface-screen" },
  "mix(error 6 %, sunken)": {
    styles: [".recipe-step__remove:active:not(:disabled)", "background"],
  },
  "mix(success 12 %, panel)": {
    styles: [".effect-selection-chip:hover:not(:disabled)", "background"],
  },
  "mix(success 14 %, panel)": {
    styles: [".effect-selection-chip:active:not(:disabled)", "background"],
  },
  "mix(error 12 %, panel)": {
    styles: [
      '.effect-selection-chip[data-preference="excluded"]:hover:not(:disabled)',
      "background",
    ],
  },
  "mix(error 14 %, panel)": {
    styles: [
      '.effect-selection-chip[data-preference="excluded"]:active:not(:disabled)',
      "background",
    ],
  },
};

const SCENE_OPACITY = [".app-header__scene svg", "opacity"];

// Splits a selector list at top-level commas (not inside parentheses or brackets).
function splitSelectors(prelude) {
  const entries = [];
  let depth = 0;
  let current = "";
  for (const char of prelude) {
    if (char === "(" || char === "[") depth += 1;
    if (char === ")" || char === "]") depth -= 1;
    if (char === "," && depth === 0) {
      entries.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  entries.push(current.trim());
  return entries;
}

// Returns [{ context: ["@media ..."], selector, decls: Map<name, value> }]; a selector list
// yields one entry per list item.
function parseCss(source) {
  const text = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = [];

  function walk(start, end, context) {
    let position = start;
    while (position < end) {
      const open = text.indexOf("{", position);
      const semi = text.indexOf(";", position);
      if (open === -1 || open >= end) break;
      if (semi !== -1 && semi < open) {
        position = semi + 1;
        continue;
      }
      let depth = 1;
      let close = open + 1;
      while (close < end && depth > 0) {
        if (text[close] === "{") depth += 1;
        if (text[close] === "}") depth -= 1;
        close += 1;
      }
      const prelude = text.slice(position, open).replace(/\s+/g, " ").trim();
      const body = text.slice(open + 1, close - 1);
      if (prelude.startsWith("@") && /\{/.test(body)) {
        walk(open + 1, close - 1, context.concat(prelude));
      } else if (!prelude.startsWith("@")) {
        const decls = new Map();
        for (const part of body.split(";")) {
          const colon = part.indexOf(":");
          if (colon === -1) continue;
          decls.set(
            part.slice(0, colon).trim(),
            part
              .slice(colon + 1)
              .replace(/\s+/g, " ")
              .trim(),
          );
        }
        for (const selector of splitSelectors(prelude)) {
          rules.push({ context, selector, decls });
        }
      }
      position = close;
    }
  }

  walk(0, text.length, []);
  return rules;
}

// Declarations of every rule with exactly this selector outside @media, in source order.
function block(rules, selector) {
  const merged = new Map();
  let found = false;
  for (const rule of rules) {
    if (rule.selector !== selector) continue;
    if (rule.context.some((entry) => entry.startsWith("@media"))) continue;
    found = true;
    for (const [name, value] of rule.decls) merged.set(name, value);
  }
  return found ? merged : null;
}

function declaration(rules, selector, property, file) {
  const decls = block(rules, selector);
  assert.ok(decls, `${file}: no rule "${selector}" outside @media`);
  assert.ok(decls.has(property), `${file}: "${selector}" sets no ${property}`);
  return decls.get(property);
}

const tokenRules = parseCss(tokensSource);
const styleRules = parseCss(stylesSource);

function themes() {
  const dusk = block(tokenRules, ":root");
  const dark = block(tokenRules, ':root[data-theme="dark"]');
  assert.ok(dusk && dark, 'tokens.css needs :root and :root[data-theme="dark"] outside @media');
  return { Dusk: dusk, Night: new Map([...dusk, ...dark]) };
}

// Colours are [r, g, b, a] with r, g, b in 0..255 and a in 0..1, all floating point.
function parseColour(value, theme) {
  const text = value.trim();
  if (text === "transparent") return [0, 0, 0, 0];
  let match = /^var\((--[a-z0-9-]+)\)$/.exec(text);
  if (match) {
    assert.ok(theme.has(match[1]), `token ${match[1]} is not defined`);
    return parseColour(theme.get(match[1]), theme);
  }
  match = /^#([0-9a-f]{6})$/i.exec(text);
  if (match) return [0, 2, 4].map((i) => parseInt(match[1].slice(i, i + 2), 16)).concat(1);
  match = /^rgb\((\d+) (\d+) (\d+) \/ (\d+(?:\.\d+)?)%\)$/.exec(text);
  if (match) return [Number(match[1]), Number(match[2]), Number(match[3]), match[4] / 100];
  match = /^color-mix\(in srgb, (.+) (\d+(?:\.\d+)?)%, (.+)\)$/.exec(text);
  if (match) {
    // CSS Color 5: premultiplied interpolation; the second colour takes the remaining share.
    const share = match[2] / 100;
    const first = parseColour(match[1], theme);
    const second = parseColour(match[3], theme);
    const alpha = first[3] * share + second[3] * (1 - share);
    const rgb = [0, 1, 2].map((i) =>
      alpha === 0 ? 0 : (first[i] * first[3] * share + second[i] * second[3] * (1 - share)) / alpha,
    );
    return rgb.concat(alpha);
  }
  throw new Error(`unsupported colour value: ${text}`);
}

// Source-over compositing of fg on an opaque bg.
function over(fg, bg) {
  return [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3])).concat(1);
}

function luminance(colour) {
  const [r, g, b] = colour.slice(0, 3).map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(fg, bg) {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const truncate = (value) => (Math.floor(value * 100) / 100).toFixed(2);

function background(spec, theme) {
  if (typeof spec === "string") return over(parseColour(`var(${spec})`, theme), [0, 0, 0, 1]);
  if (spec.tint) return tintBackground(spec, theme);
  if (spec.over) return over(parseColour(`var(${spec.over})`, theme), background(spec.base, theme));
  if (spec.scene) {
    const opacity = Number(declaration(styleRules, ...SCENE_OPACITY, "styles.css"));
    const layer = parseColour(`var(${spec.scene})`, theme);
    return over(
      layer.slice(0, 3).concat(layer[3] * opacity),
      background("--scene-sky-bottom", theme),
    );
  }
  const value = declaration(styleRules, ...spec.styles, "styles.css");
  return over(parseColour(value, theme), [0, 0, 0, 1]);
}

function tintBackground(spec, theme) {
  const value = declaration(styleRules, ...spec.tint, "styles.css");
  return over(parseColour(value, theme), background(spec.base, theme));
}

function opaque(colour, name) {
  assert.equal(colour[3], 1, `${name} must be opaque`);
  return colour;
}

function tableRows(markdown) {
  return markdown
    .split("\n")
    .filter((line) => line.startsWith("|"))
    .map((line) =>
      line
        .slice(1, line.endsWith("|") ? -1 : undefined)
        .split("|")
        .map((cell) => cell.trim()),
    );
}

function contrastSection() {
  const start = designSource.indexOf("## 8. Contrast");
  const end = designSource.indexOf("\n## 9.", start);
  assert.ok(start !== -1 && end !== -1, "DESIGN.md section 8 not found");
  return designSource.slice(start, end);
}

// The first table after the heading line: [{ fg, bgs, cells: { Dusk, Night }, line }].
function readTable(sectionText, heading) {
  const at = sectionText.indexOf(`\n${heading}\n`);
  assert.ok(at !== -1, `DESIGN.md section 8 has no "${heading}"`);
  const lines = sectionText.slice(at + heading.length + 2).split("\n");
  const first = lines.findIndex((line) => line.startsWith("|"));
  assert.ok(first !== -1, `no table after "${heading}"`);
  const tableLines = [];
  for (const line of lines.slice(first)) {
    if (!line.startsWith("|")) break;
    tableLines.push(line);
  }
  const [header, separator, ...body] = tableRows(tableLines.join("\n"));
  assert.ok(
    separator.every((cell) => /^-+$/.test(cell)),
    `"${heading}": malformed table`,
  );
  const columns = Object.fromEntries(header.map((name, index) => [name, index]));
  for (const name of ["Foreground / background", "Dusk", "Night"]) {
    assert.ok(name in columns, `"${heading}": column "${name}" missing`);
  }
  assert.ok(body.length > 0, `"${heading}": table is empty`);
  return body.map((cells) => {
    const label = cells[columns["Foreground / background"]];
    const split = label.indexOf(" / ");
    assert.ok(split !== -1, `"${label}": no " / " between foreground and background`);
    const fg = label.slice(0, split);
    const rest = label.slice(split + 3);
    let bgs = [rest];
    if (/,\s*\//.test(rest)) {
      bgs = rest.split(/,\s*\/\s*/);
    } else {
      const listed = /^(.* over )(.+, .+?)(?: layer)?$/.exec(rest);
      if (listed) bgs = listed[2].split(/,\s*/).map((name) => listed[1] + name);
    }
    return {
      label,
      fg,
      bgs,
      cells: { Dusk: cells[columns.Dusk], Night: cells[columns.Night] },
      where: cells[columns.Where] ?? "",
    };
  });
}

function readAll() {
  const sectionText = contrastSection();
  return TABLES.map((table) => ({ ...table, rows: readTable(sectionText, table.heading) }));
}

// One entry per printed value: { table, label, theme, fg, bg, printed, edge }.
function pairs() {
  const result = [];
  for (const table of readAll()) {
    for (const row of table.rows) {
      for (const theme of ["Dusk", "Night"]) {
        const values = row.cells[theme].split(/,\s*/);
        assert.equal(
          values.length,
          row.bgs.length,
          `"${row.label}" ${theme}: ${values.length} values for ${row.bgs.length} backgrounds`,
        );
        values.forEach((cell, index) => {
          const match = /^(\d+\.\d{2})(?: \((\w+)\))?$/.exec(cell);
          assert.ok(match, `"${row.label}" ${theme}: "${cell}" is not a value with two decimals`);
          result.push({
            table,
            label: row.label,
            theme,
            fg: row.fg,
            bg: row.bgs[index],
            printed: match[1],
            edge: match[2] || null,
          });
        });
      }
    }
  }
  return result;
}

function compute(pair, theme) {
  assert.ok(pair.fg in FOREGROUNDS, `"${pair.label}": foreground "${pair.fg}" is not mapped`);
  assert.ok(pair.bg in BACKGROUNDS, `"${pair.label}": background "${pair.bg}" is not mapped`);
  const bg = opaque(background(BACKGROUNDS[pair.bg], theme), pair.bg);
  const fgSpec = FOREGROUNDS[pair.fg];
  if (typeof fgSpec === "string") {
    return ratio(opaque(parseColour(`var(${fgSpec})`, theme), pair.fg), bg);
  }
  assert.ok(pair.edge, `"${pair.label}" ${pair.theme}: name the edge, e.g. "8.95 (border)"`);
  assert.ok(pair.edge in fgSpec.either, `"${pair.label}": unknown edge "${pair.edge}"`);
  return ratio(opaque(parseColour(`var(${fgSpec.either[pair.edge]})`, theme), pair.edge), bg);
}

test("DESIGN.md section 8 contrast tables are readable", () => {
  for (const table of readAll()) assert.ok(table.rows.length > 0, table.heading);
});

test("every contrast row is mapped to colours", () => {
  const unmapped = new Set();
  for (const table of readAll()) {
    for (const row of table.rows) {
      if (!(row.fg in FOREGROUNDS)) unmapped.add(`foreground "${row.fg}" (${row.label})`);
      for (const bg of row.bgs) {
        if (!(bg in BACKGROUNDS)) unmapped.add(`background "${bg}" (${row.label})`);
      }
    }
  }
  assert.deepEqual([...unmapped], [], "unmapped names in DESIGN.md section 8");
});

test("mix labels match the color-mix() of styles.css", () => {
  const tokenOf = (name) => {
    const spec = BACKGROUNDS[name] ?? FOREGROUNDS[name];
    assert.equal(typeof spec, "string", `"${name}" must map to a token`);
    return spec;
  };
  for (const [name, spec] of Object.entries(BACKGROUNDS)) {
    if (spec.tint) {
      const tint = /^mix\((.+) (\d+) %, switch surface\) over .+$/.exec(name);
      assert.ok(tint, `"${name}": expected "mix(<colour> <n> %, switch surface) over <layer>"`);
      assert.equal(
        declaration(styleRules, ...spec.tint, "styles.css"),
        `color-mix(in srgb, var(${tokenOf(tint[1])}) ${tint[2]}%, transparent)`,
        `"${name}" does not match ${spec.tint.join(" ")}`,
      );
      continue;
    }
    if (!spec.styles) continue;
    const label = /^mix\((.+) (\d+) %, (.+)\)$/.exec(name);
    assert.ok(label, `"${name}": expected "mix(<colour> <n> %, <background>)"`);
    const value = declaration(styleRules, ...spec.styles, "styles.css");
    assert.equal(
      value,
      `color-mix(in srgb, var(${tokenOf(label[1])}) ${label[2]}%, var(${tokenOf(label[3])}))`,
      `"${name}" does not match ${spec.styles.join(" ")}`,
    );
  }
});

test('placeholders use the colour the table row "text tertiary / field" names', () => {
  const row = readAll()[0].rows.find((entry) => entry.label === "text tertiary / field");
  assert.ok(row, 'section 8 has no row "text tertiary / field"');
  assert.match(row.where, /placeholders/, 'the row "text tertiary / field" must name placeholders');
  for (const selector of ["input::placeholder", "textarea::placeholder"]) {
    assert.equal(
      declaration(styleRules, selector, "color", "styles.css"),
      `var(${FOREGROUNDS["text tertiary"]})`,
      `${selector} must use the colour of "text tertiary / field"`,
    );
    assert.equal(
      declaration(styleRules, selector, "opacity", "styles.css"),
      "1",
      `${selector} needs opacity 1 (Firefox dims placeholders)`,
    );
  }
});

test("every contrast pair reaches its target in both themes", (t) => {
  const all = themes();
  const below = [];
  for (const pair of pairs()) {
    const value = compute(pair, all[pair.theme]);
    if (value < pair.table.target) {
      below.push(
        `${pair.theme} ${pair.fg} / ${pair.bg}: ${value.toFixed(4)} < ${pair.table.target}`,
      );
    }
  }
  const count = pairs().length;
  t.diagnostic(`checked contrast pairs: ${count} (both themes), below target: ${below.length}`);
  assert.deepEqual(below, [], "pairs below target");
});

test("every printed contrast value equals the computed value truncated to two decimals", () => {
  const all = themes();
  const drift = [];
  for (const pair of pairs()) {
    const computed = truncate(compute(pair, all[pair.theme]));
    if (computed !== pair.printed) {
      drift.push(`${pair.theme} ${pair.fg} / ${pair.bg}: table ${pair.printed}, CSS ${computed}`);
    }
  }
  assert.deepEqual(drift, [], "DESIGN.md section 8 differs from the CSS");
});

test('the section 8 "Result:" sentence states the checked pair count', () => {
  const match = /^Result: \*\*(\d+) pairs\*\*.*\*\*0 below target\*\*/m.exec(contrastSection());
  assert.ok(match, 'section 8 needs "Result: **<n> pairs** … **0 below target**"');
  assert.equal(Number(match[1]), pairs().length);
});

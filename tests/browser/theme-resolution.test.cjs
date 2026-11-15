"use strict";

// Checks the theme resolution of DESIGN.md section 7 in webapp/static/css/tokens.css:
//   :root                                    light values, color-scheme: light
//   :root[data-theme="light"]                light values, color-scheme: light
//   @media (prefers-color-scheme: dark)
//     :root:not([data-theme="light"])        dark values, color-scheme: dark
//   :root[data-theme="dark"]                 dark values, color-scheme: dark
// and that the head script of index.html and theme.js keep the storage contract.
//
// TOKENS_CSS_PATH replaces the tokens.css path; it exists only for the self-check of this test.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const tokensPath = process.env.TOKENS_CSS_PATH || path.join(root, "webapp/static/css/tokens.css");
const tokensSource = fs.readFileSync(tokensPath, "utf8");
const indexSource = fs.readFileSync(path.join(root, "webapp/templates/index.html"), "utf8");
const themeSource = fs.readFileSync(path.join(root, "webapp/static/js/theme.js"), "utf8");

const DARK_MEDIA = /^@media \(prefers-color-scheme: dark\)$/;
const SELECTORS = {
  light: ":root",
  lightExplicit: ':root[data-theme="light"]',
  darkSystem: ':root:not([data-theme="light"])',
  darkExplicit: ':root[data-theme="dark"]',
};

function normalize(value) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

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
          decls.set(part.slice(0, colon).trim(), part.slice(colon + 1).trim());
        }
        rules.push({ context, selector: prelude, decls, index: rules.length });
      }
      position = close;
    }
  }

  walk(0, text.length, []);
  return rules;
}

const rules = parseCss(tokensSource);

// Rules for one selector; `media` null means outside every @media.
function select(selector, media) {
  return rules.filter((rule) => {
    if (rule.selector !== selector) return false;
    const queries = rule.context.filter((entry) => entry.startsWith("@media"));
    return media ? queries.some((entry) => media.test(entry)) : queries.length === 0;
  });
}

function requireBlock(label, selector, media) {
  const found = select(selector, media);
  assert.ok(
    found.length > 0,
    `tokens.css has no rule for ${media ? "@media (prefers-color-scheme: dark) " : ""}${selector} (${label})`,
  );
  const merged = new Map();
  for (const rule of found) for (const [name, value] of rule.decls) merged.set(name, value);
  return merged;
}

function themeValues(declarations) {
  return new Map(
    [...declarations].filter(([name]) => name.startsWith("--") || name === "color-scheme"),
  );
}

function assertSameValues(labelA, a, labelB, b) {
  const names = new Set([...a.keys(), ...b.keys()]);
  for (const name of [...names].sort()) {
    assert.ok(a.has(name), `${name} is defined in ${labelB} but missing in ${labelA}`);
    assert.ok(b.has(name), `${name} is defined in ${labelA} but missing in ${labelB}`);
    assert.equal(
      normalize(a.get(name)),
      normalize(b.get(name)),
      `${name} differs: ${labelA} "${a.get(name)}" vs ${labelB} "${b.get(name)}"`,
    );
  }
}

test("light values sit on :root and :root[data-theme=light] with color-scheme light", () => {
  for (const selector of [SELECTORS.light, SELECTORS.lightExplicit]) {
    const declarations = requireBlock("light", selector, null);
    assert.equal(
      declarations.get("color-scheme"),
      "light",
      `${selector}: color-scheme must be light, found ${declarations.get("color-scheme")}`,
    );
    assert.ok(declarations.has("--surface-canvas"), `${selector} does not define --surface-canvas`);
  }
});

test("dark values sit in the dark media block and on :root[data-theme=dark] with color-scheme dark", () => {
  const system = requireBlock("dark system", SELECTORS.darkSystem, DARK_MEDIA);
  const explicit = requireBlock("dark explicit", SELECTORS.darkExplicit, null);
  for (const [label, declarations] of [
    [`@media (prefers-color-scheme: dark) ${SELECTORS.darkSystem}`, system],
    [SELECTORS.darkExplicit, explicit],
  ]) {
    assert.equal(
      declarations.get("color-scheme"),
      "dark",
      `${label}: color-scheme must be dark, found ${declarations.get("color-scheme")}`,
    );
    assert.ok(declarations.has("--surface-canvas"), `${label} does not define --surface-canvas`);
  }
});

test("the dark media block and :root[data-theme=dark] define the same tokens and values", () => {
  assertSameValues(
    "@media dark :root:not([data-theme=light])",
    themeValues(requireBlock("dark system", SELECTORS.darkSystem, DARK_MEDIA)),
    ':root[data-theme="dark"]',
    themeValues(requireBlock("dark explicit", SELECTORS.darkExplicit, null)),
  );
});

test(":root and :root[data-theme=light] give the same light tokens and values", () => {
  const lightRoot = themeValues(requireBlock("light", SELECTORS.light, null));
  const lightExplicit = themeValues(requireBlock("light explicit", SELECTORS.lightExplicit, null));
  // theme-independent tokens live on :root only; compare the theme tokens that light repeats
  const themeOnly = new Map([...lightExplicit]);
  for (const name of lightExplicit.keys()) {
    assert.ok(lightRoot.has(name), `${name} is on :root[data-theme="light"] but missing on :root`);
  }
  assertSameValues(
    ":root (theme tokens)",
    new Map([...lightRoot].filter(([name]) => themeOnly.has(name))),
    ':root[data-theme="light"]',
    themeOnly,
  );
  assert.ok(
    [...lightRoot.keys()].filter((name) => lightExplicit.has(name) && name !== "color-scheme")
      .length >= 27,
    ':root[data-theme="light"] repeats fewer than the 27 theme tokens of DESIGN.md 9.2',
  );
});

test("source order lets an explicit choice win over the system media block", () => {
  const order = (selector, media) =>
    Math.max(...select(selector, media).map((rule) => rule.index), -1);
  const root = order(SELECTORS.light, null);
  const system = order(SELECTORS.darkSystem, DARK_MEDIA);
  const lightExplicit = order(SELECTORS.lightExplicit, null);
  const darkExplicit = order(SELECTORS.darkExplicit, null);
  assert.ok(root !== -1 && system !== -1, "tokens.css lacks :root or the dark media block");
  assert.ok(
    root < system,
    `the dark media block (rule ${system}) must come after :root (rule ${root}) so that it can override the light values`,
  );
  assert.ok(
    lightExplicit !== -1 && darkExplicit !== -1,
    "tokens.css lacks :root[data-theme=light] or :root[data-theme=dark]",
  );
});

test("head script and theme.js keep storage key schedule1-theme and values system, light, dark", () => {
  const headScript = /<head>[\s\S]*?<script>([\s\S]*?)<\/script>[\s\S]*?<\/head>/.exec(indexSource);
  assert.ok(headScript, "index.html has no inline script in <head>");
  assert.match(
    headScript[1],
    /localStorage\.getItem\("schedule1-theme"\)/,
    "head script storage key changed",
  );
  assert.match(headScript[1], /"light"/, "head script no longer handles the value light");
  assert.match(headScript[1], /"dark"/, "head script no longer handles the value dark");
  assert.match(
    indexSource,
    /<html[^>]*data-theme="system"/,
    'index.html <html> lost data-theme="system"',
  );
  assert.match(themeSource, /STORAGE_KEY = "schedule1-theme"/, "theme.js storage key changed");
  for (const value of ["system", "light", "dark"]) {
    assert.match(
      themeSource,
      new RegExp(`"${value}"`),
      `theme.js no longer uses the value ${value}`,
    );
    assert.match(
      indexSource,
      new RegExp(`data-theme-value="${value}"`),
      `index.html theme switch lost the option ${value}`,
    );
  }
});

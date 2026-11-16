"use strict";

// Guards the increased-contrast variant of tokens.css (T-7, D-7-2; DESIGN.md section 2):
// `@media (prefers-contrast: more)` reuses existing values for both themes, and the block sits
// after every theme block so that it wins at equal specificity (review T-3 r1 F-3-2).
//
// TOKENS_CSS_PATH replaces the file path; it exists only to show that the checks fail on a
// mutated copy.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const tokensPath = process.env.TOKENS_CSS_PATH || path.join(root, "webapp/static/css/tokens.css");
const source = fs.readFileSync(tokensPath, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

const MORE = "@media (prefers-contrast: more)";
const DARK_SYSTEM = "@media (prefers-color-scheme: dark)";
const DARK_SYSTEM_SELECTOR = ':root:not([data-theme="light"])';

function normalize(value) {
  return value.replace(/\s+/g, " ").trim();
}

function parseDeclarations(body) {
  const decls = new Map();
  for (const part of body.split(";")) {
    const colon = part.indexOf(":");
    if (colon === -1) continue;
    decls.set(part.slice(0, colon).trim(), normalize(part.slice(colon + 1)));
  }
  return decls;
}

// Style rules in source order as [{ index, context, selector, decls }].
function parseRules(text) {
  const rules = [];
  function walk(start, end, context) {
    let position = start;
    while (position < end) {
      const open = text.indexOf("{", position);
      if (open === -1 || open >= end) break;
      let depth = 1;
      let close = open + 1;
      while (close < end && depth > 0) {
        if (text[close] === "{") depth += 1;
        if (text[close] === "}") depth -= 1;
        close += 1;
      }
      const prelude = normalize(text.slice(position, open));
      if (prelude.startsWith("@")) {
        walk(open + 1, close - 1, context.concat(prelude));
      } else {
        rules.push({
          index: rules.length,
          context,
          selector: prelude,
          decls: parseDeclarations(text.slice(open + 1, close - 1)),
        });
      }
      position = close;
    }
  }
  walk(0, text.length, []);
  return rules;
}

const rules = parseRules(source);
const themeBlocks = [
  { name: "light (:root)", selector: ":root", media: null },
  { name: "light (explicit)", selector: ':root[data-theme="light"]', media: null },
  { name: "dark (system)", selector: DARK_SYSTEM_SELECTOR, media: DARK_SYSTEM },
  { name: "dark (explicit)", selector: ':root[data-theme="dark"]', media: null },
].map((block) => ({
  ...block,
  rule: rules.find(
    (rule) =>
      rule.selector === block.selector &&
      !rule.context.includes(MORE) &&
      (block.media === null || rule.context.includes(block.media)),
  ),
}));
const contrastRules = rules.filter((rule) => rule.context.includes(MORE));

test("tokens.css has all theme blocks and an increased-contrast block", () => {
  for (const block of themeBlocks) assert.ok(block.rule, `theme block ${block.name} not found`);
  assert.ok(contrastRules.length > 0, `tokens.css has no ${MORE} block`);
});

test("the increased-contrast block reuses existing values and widens the focus ring", () => {
  const block = contrastRules.find((rule) => rule.selector === ":root:root");
  assert.ok(block, `the ${MORE} block has no :root:root rule (specificity of the theme blocks)`);
  assert.equal(block.decls.get("--text-tertiary"), "var(--text-secondary)");
  assert.equal(block.decls.get("--border-control"), "var(--border-control-hover)");
  assert.equal(block.decls.get("--focus-ring-width"), "3px");
});

test("both themes define the tokens the increased-contrast block refers to", () => {
  // :root:root has the specificity of the theme blocks, so it applies to light (:root and
  // explicit) and dark (system and explicit) and resolves the var() per theme.
  for (const block of themeBlocks.slice(1)) {
    for (const name of [
      "--text-secondary",
      "--border-control-hover",
      "--border-control",
      "--text-tertiary",
    ]) {
      assert.ok(block.rule.decls.has(name), `${block.name} does not define ${name}`);
    }
  }
});

test("the increased-contrast block comes after all theme blocks in source order", () => {
  const firstContrast = Math.min(...contrastRules.map((rule) => rule.index));
  const lastTheme = Math.max(...themeBlocks.map((block) => block.rule.index));
  assert.ok(firstContrast > lastTheme, "the prefers-contrast block is placed before a theme block");
  const lastContrast = Math.max(...contrastRules.map((rule) => rule.index));
  for (const rule of rules.filter((entry) => entry.index > lastContrast)) {
    for (const name of ["--text-tertiary", "--border-control", "--focus-ring-width"]) {
      assert.ok(!rule.decls.has(name), `${rule.selector} redefines ${name} after the block`);
    }
  }
});

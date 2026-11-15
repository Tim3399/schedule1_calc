"use strict";

// Checks webapp/static/css/tokens.css against the token plan in webapp/design/DESIGN.md
// section 9 (9.1 theme-independent, 9.2 light/dark, 9.3 removed or renamed names).
//
// DESIGN.md table columns used: 9.1 `Token` | `Value`; 9.2 `Token` | `Light` | `Dark`;
// 9.3 `Old token` | `New token`. Cells may be wrapped in backticks. Two 9.1 shorthand forms are
// expanded: a range ("`--space-1` … `--space-8`" with a comma list) and a triplet
// ("`--type-body-size` / `-line` / `-weight`" with "a / b / c").
//
// TOKENS_CSS_PATH replaces the tokens.css path; it exists only for the self-check of this test.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const designSource = fs.readFileSync(path.join(root, "webapp/design/DESIGN.md"), "utf8");
const tokensPath = process.env.TOKENS_CSS_PATH || path.join(root, "webapp/static/css/tokens.css");
const tokensSource = fs.readFileSync(tokensPath, "utf8");

function listFiles(dir, extension) {
  return fs
    .readdirSync(path.join(root, dir))
    .filter((name) => name.endsWith(extension))
    .sort()
    .map((name) => path.join(root, dir, name));
}

function normalize(value) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

// Returns [{ context: ["@media ..."], selector, decls: Map<name, value> }] for every rule.
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
      } else if (prelude.startsWith("@")) {
        // at-rule with declarations only (e.g. @font-face): not relevant here
      } else {
        const decls = new Map();
        for (const part of body.split(";")) {
          const colon = part.indexOf(":");
          if (colon === -1) continue;
          decls.set(part.slice(0, colon).trim(), part.slice(colon + 1).trim());
        }
        rules.push({ context, selector: prelude, decls });
      }
      position = close;
    }
  }

  walk(0, text.length, []);
  return rules;
}

// Declarations of every rule with exactly this selector and an at-rule context that matches.
function block(rules, selector, contextPattern = null) {
  const merged = new Map();
  let found = false;
  for (const rule of rules) {
    if (rule.selector !== selector) continue;
    const media = rule.context.filter((entry) => entry.startsWith("@media"));
    const matches = contextPattern
      ? media.some((entry) => contextPattern.test(entry))
      : media.length === 0;
    if (!matches) continue;
    found = true;
    for (const [name, value] of rule.decls) merged.set(name, value);
  }
  return found ? merged : null;
}

function section(startHeading, endHeading) {
  const text = designSource.replace(/\r\n/g, "\n");
  const start = text.indexOf(startHeading);
  const end = text.indexOf(endHeading, start + 1);
  assert.ok(
    start !== -1 && end !== -1,
    `DESIGN.md sections "${startHeading}" .. "${endHeading}" not found`,
  );
  return text.slice(start, end);
}

function tableRows(markdown) {
  return markdown
    .split("\n")
    .filter((line) => line.startsWith("|"))
    .map((line) =>
      line
        .replace(/^\|/, "")
        .replace(/\|\s*$/, "")
        .split("|")
        .map((cell) => cell.trim()),
    );
}

function unwrap(cell) {
  const match = /^`(.*)`$/s.exec(cell);
  return match ? match[1] : cell;
}

const findings = [];

// 9.1: returns Map<token, expected value>
function themeIndependentTokens() {
  const expected = new Map();
  for (const [tokenCell, valueCell] of tableRows(section("### 9.1", "### 9.2"))) {
    const names = [...tokenCell.matchAll(/`(-[^`]+)`/g)].map((match) => match[1]);
    if (names.length === 0 || !names[0].startsWith("--")) continue;
    let value = unwrap(valueCell);
    const note = /^(\S+) \((.+)\)$/.exec(value);
    if (note) {
      findings.push(`${names[0]}: cell "${valueCell}" has a note; only "${note[1]}" is asserted`);
      value = note[1];
    }
    if (tokenCell.includes("…")) {
      const parts = /^`--([a-z-]+)-(\d+)` … `--[a-z-]+-(\d+)`$/.exec(tokenCell);
      assert.ok(parts, `9.1 range cell not understood: ${tokenCell}`);
      const values = value.split(", ");
      const first = Number(parts[2]);
      assert.equal(
        values.length,
        Number(parts[3]) - first + 1,
        `9.1 range value count: ${tokenCell}`,
      );
      values.forEach((entry, index) => expected.set(`--${parts[1]}-${first + index}`, entry));
    } else if (names.length > 1) {
      const values = value.split(" / ");
      assert.equal(values.length, names.length, `9.1 triplet value count: ${tokenCell}`);
      const base = names[0].replace(/-[^-]+$/, "");
      names.forEach((name, index) => {
        expected.set(index === 0 ? name : `${base}${name}`, values[index]);
      });
    } else {
      expected.set(names[0], value);
    }
  }
  return expected;
}

// 9.2: returns Map<token, { light, dark }>
function themeTokens() {
  const expected = new Map();
  for (const [tokenCell, lightCell, darkCell] of tableRows(section("### 9.2", "### 9.3"))) {
    const match = /^`(--[a-z0-9-]+)`$/.exec(tokenCell);
    if (!match) continue;
    expected.set(match[1], { light: unwrap(lightCell), dark: unwrap(darkCell) });
  }
  return expected;
}

// 9.3: old names that must be gone (removed, or renamed to a different name)
function retiredNames() {
  const retired = [];
  for (const [oldCell, newCell] of tableRows(section("### 9.3", "## 10."))) {
    const oldName = /^`(--[a-z0-9-]+)`$/.exec(oldCell);
    if (!oldName) continue;
    const newName = /^`(--[a-z0-9-]+)`$/.exec(newCell);
    if (newName && newName[1] === oldName[1]) continue;
    retired.push({ name: oldName[1], replacement: newName ? newName[1] : "removed" });
  }
  return retired;
}

const rules = parseCss(tokensSource);
const lightRoot = block(rules, ":root");
const darkRoot = block(rules, ':root[data-theme="dark"]');

function assertValue(blockName, declarations, token, expectedValue) {
  assert.ok(declarations, `${blockName} block is missing in tokens.css`);
  const actual = declarations.get(token);
  assert.ok(
    actual !== undefined,
    `${token} is not defined in ${blockName}; expected "${expectedValue}"`,
  );
  assert.equal(
    normalize(actual),
    normalize(expectedValue),
    `${token} in ${blockName}: expected "${expectedValue}", found "${actual}"`,
  );
}

test("DESIGN.md token tables are readable", (t) => {
  assert.ok(themeIndependentTokens().size >= 56, "9.1 yields fewer tokens than expected");
  assert.ok(themeTokens().size >= 27, "9.2 yields fewer tokens than expected");
  assert.ok(retiredNames().length >= 15, "9.3 yields fewer retired names than expected");
  for (const finding of findings) t.diagnostic(`finding: ${finding}`);
});

test("every 9.1 theme-independent token is defined in :root with the stated value", () => {
  for (const [token, value] of themeIndependentTokens()) {
    assertValue(":root", lightRoot, token, value);
  }
});

test("every 9.2 theme token has the stated light value in :root", () => {
  for (const [token, { light }] of themeTokens()) {
    assertValue(":root (light)", lightRoot, token, light);
  }
});

test('every 9.2 theme token has the stated dark value in :root[data-theme="dark"]', () => {
  for (const [token, { dark }] of themeTokens()) {
    assertValue(':root[data-theme="dark"]', darkRoot, token, dark);
  }
});

test("old names marked removed or renamed in 9.3 are not defined in tokens.css", () => {
  const defined = new Set(rules.flatMap((rule) => [...rule.decls.keys()]));
  for (const { name, replacement } of retiredNames()) {
    assert.ok(!defined.has(name), `${name} is still defined in tokens.css (9.3: ${replacement})`);
  }
});

test("old names marked removed or renamed in 9.3 are not used through var()", () => {
  const files = [
    ...listFiles("webapp/static/css", ".css"),
    ...listFiles("webapp/templates", ".html"),
    ...listFiles("webapp/static/js", ".js"),
  ];
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    for (const { name, replacement } of retiredNames()) {
      const usage = new RegExp(`var\\(\\s*${name}\\s*[,)]`);
      assert.ok(
        !usage.test(source),
        `${path.relative(root, file)} uses var(${name}) (9.3: ${replacement})`,
      );
    }
  }
});

test("styles.css and index.html contain no colour literals", () => {
  const literal = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;
  for (const file of [
    path.join(root, "webapp/static/css/styles.css"),
    path.join(root, "webapp/templates/index.html"),
  ]) {
    const lines = fs.readFileSync(file, "utf8").split("\n");
    lines.forEach((line, index) => {
      assert.ok(
        !literal.test(line),
        `${path.relative(root, file)}:${index + 1} contains a colour literal: ${line.trim()}`,
      );
    });
  }
});

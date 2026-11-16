"use strict";

// Checks the Studio stylesheet (T-14, plan section 5) by parsing webapp/static/css/styles.css:
// the action colour has one user, Barlow is self-hosted and set only on the wordmark and the stat
// figures, motion is off under reduced motion, the
// Want/Neutral/Avoid width reservation matches the labels in script.js (F-5-6), background tokens
// are not blue, width media queries use only the 480/900 breakpoints, and no field hover rule
// outranks the invalid border (F-4-6).
//
// STYLES_CSS_PATH, SCRIPT_JS_PATH and TOKENS_CSS_PATH replace the file paths; they exist only to
// show that the checks fail on a mutated copy.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const stylesPath = process.env.STYLES_CSS_PATH || path.join(root, "webapp/static/css/styles.css");
const scriptPath = process.env.SCRIPT_JS_PATH || path.join(root, "webapp/static/js/script.js");
const tokensPath = process.env.TOKENS_CSS_PATH || path.join(root, "webapp/static/css/tokens.css");
const stylesSource = fs.readFileSync(stylesPath, "utf8");
const scriptSource = fs.readFileSync(scriptPath, "utf8");
const tokensSource = fs.readFileSync(tokensPath, "utf8");

const REDUCED_MOTION = "@media (prefers-reduced-motion: reduce)";

function normalize(value) {
  return value.replace(/\s+/g, " ").trim();
}

// Splits at top-level occurrences of `separator` (not inside parentheses, brackets or strings).
function splitTopLevel(text, separator) {
  const entries = [];
  let depth = 0;
  let quote = null;
  let current = "";
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (char === "\\") {
        current += char + text[index + 1];
        index += 1;
        continue;
      }
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === "(" || char === "[") {
      depth += 1;
    } else if (char === ")" || char === "]") {
      depth -= 1;
    } else if (char === separator && depth === 0) {
      entries.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) entries.push(current.trim());
  return entries;
}

function parseDeclarations(body) {
  const decls = [];
  for (const part of splitTopLevel(body, ";")) {
    const colon = part.indexOf(":");
    if (colon === -1) continue;
    decls.push({ name: part.slice(0, colon).trim(), value: normalize(part.slice(colon + 1)) });
  }
  return decls;
}

// Returns { rules: [{ context, selector, decls }], atRules: [{ context, name, decls }] }; a selector
// list yields one rule per list item. `context` lists the enclosing at-rule preludes.
function parseCss(source) {
  const text = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = [];
  const atRules = [];

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
      const prelude = normalize(text.slice(position, open));
      const body = text.slice(open + 1, close - 1);
      if (prelude.startsWith("@") && /\{/.test(body)) {
        walk(open + 1, close - 1, context.concat(prelude));
      } else if (prelude.startsWith("@")) {
        atRules.push({ context, name: prelude, decls: parseDeclarations(body) });
      } else {
        const decls = parseDeclarations(body);
        for (const selector of splitTopLevel(prelude, ",")) {
          rules.push({ context, selector: normalize(selector), decls });
        }
      }
      position = close;
    }
  }

  walk(0, text.length, []);
  return { rules, atRules };
}

const styles = parseCss(stylesSource);

function inReducedMotion(rule) {
  return rule.context.includes(REDUCED_MOTION);
}

// The subject compound of a selector: the part after the last top-level combinator.
function subjectCompound(selector) {
  const compounds = splitTopLevel(selector.replace(/\s*([>+~])\s*/g, " $1 "), " ").filter(
    (part) => !/^[>+~]$/.test(part),
  );
  return compounds[compounds.length - 1];
}

test("the action colour is used only by .btn--primary rules", (t) => {
  const users = styles.rules.filter((rule) =>
    rule.decls.some((decl) => /var\(\s*--action-primary/.test(decl.value)),
  );
  assert.ok(
    users.length >= 4,
    "expected the primary button and its states to use the action colour",
  );
  for (const rule of users) {
    t.diagnostic(`action colour: ${rule.selector}`);
    assert.match(
      subjectCompound(rule.selector),
      /\.btn--primary(?![\w-])/,
      `${rule.selector} uses --action-primary* but is not a .btn--primary rule`,
    );
  }
  for (const state of [":hover", ":active", ":disabled"]) {
    assert.ok(
      users.some((rule) => rule.selector.includes(state)),
      `no .btn--primary ${state} rule uses the action colour`,
    );
  }
});

test("Barlow 700 and 800 are self-hosted woff2 files, and styles.css loads nothing remote", () => {
  const faces = styles.atRules.filter((rule) => rule.name === "@font-face");
  const weights = [];
  for (const face of faces) {
    const decls = new Map(face.decls.map((decl) => [decl.name, decl.value]));
    assert.equal(decls.get("font-family"), '"Barlow"');
    assert.equal(decls.get("font-display"), "swap");
    const match = /^url\("\.\.\/fonts\/([a-z0-9-]+\.woff2)"\) format\("woff2"\)$/.exec(
      decls.get("src") || "",
    );
    assert.ok(match, `@font-face src is not a relative ../fonts/*.woff2 url: ${decls.get("src")}`);
    assert.ok(
      fs.existsSync(path.join(root, "webapp/static/fonts", match[1])),
      `${match[1]} is missing in webapp/static/fonts`,
    );
    weights.push(decls.get("font-weight"));
  }
  assert.deepEqual(weights.sort(), ["700", "800"]);
  assert.doesNotMatch(stylesSource, /https?:/i, "styles.css references a remote URL");
  assert.doesNotMatch(stylesSource, /@import/, "styles.css imports another stylesheet");
});

// T-14 brief item 7: Barlow for the wordmark and figures, the system UI font for text.
test("--font-display is used only by the wordmark and the stat figures", (t) => {
  const users = styles.rules.filter((rule) =>
    rule.decls.some((decl) => /var\(\s*--font-display\b/.test(decl.value)),
  );
  for (const rule of users) t.diagnostic(`font-display: ${rule.selector}`);
  assert.deepEqual(users.map((rule) => rule.selector).sort(), [".stat dd", ".wordmark"]);
  for (const selector of [".btn--primary", ".stat--primary dt"]) {
    for (const rule of styles.rules.filter((candidate) => candidate.selector === selector)) {
      const family = rule.decls.find((decl) => decl.name === "font-family");
      assert.ok(
        !family || family.value === "var(--font-ui)",
        `${selector} sets font-family ${family?.value}; its label is text`,
      );
    }
  }
});

test("every animation is switched off under prefers-reduced-motion: reduce", (t) => {
  const animated = styles.rules.filter(
    (rule) =>
      !inReducedMotion(rule) &&
      !rule.context.some((entry) => entry.startsWith("@keyframes")) &&
      rule.decls.some(
        (decl) => /^animation(-name)?$/.test(decl.name) && !/^none\b/.test(decl.value),
      ),
  );
  assert.ok(animated.length >= 3, "expected the progress sweep, the reveal and the spinner");
  const reduced = styles.rules.filter(inReducedMotion);
  for (const rule of animated) {
    t.diagnostic(`animation: ${rule.selector}`);
    const neutralised = reduced.some(
      (candidate) =>
        candidate.selector === rule.selector &&
        candidate.decls.some(
          (decl) => /^animation(-name)?$/.test(decl.name) && /^none\b/.test(decl.value),
        ),
    );
    assert.ok(neutralised, `${rule.selector} keeps its animation under reduced motion`);
  }

  // Transitions (and any animation left) are cut to an instant by the universal rule.
  for (const selector of ["*", "*::before", "*::after"]) {
    const universal = reduced.find((rule) => rule.selector === selector);
    assert.ok(universal, `reduced motion has no ${selector} rule`);
    const decls = new Map(universal.decls.map((decl) => [decl.name, decl.value]));
    assert.equal(decls.get("transition-duration"), "0.01ms !important");
    assert.equal(decls.get("animation-duration"), "0.01ms !important");
  }
  const transitions = styles.rules.filter(
    (rule) => !inReducedMotion(rule) && rule.decls.some((decl) => /^transition/.test(decl.name)),
  );
  t.diagnostic(`transitions covered by the universal rule: ${transitions.length}`);
});

test("the Want/Neutral/Avoid width reservation matches the labels in script.js (F-5-6)", () => {
  // Pairs of a preference value and its visible label (labels start upper case, which keeps out
  // value lists such as ["wanted", "excluded"]).
  const labels = [
    ...scriptSource.matchAll(/\[\s*"(wanted|neutral|excluded)"\s*,\s*"([A-Z][^"]*)"\s*\]/g),
  ];
  const scriptLabels = labels.map((match) => [match[1], match[2]]);
  assert.deepEqual(
    scriptLabels.map(([value]) => value),
    ["wanted", "neutral", "excluded"],
    "script.js no longer lists the three effect preference labels",
  );

  function cssStrings(value) {
    const visible = splitTopLevel(value, "/")[0];
    return [...visible.matchAll(/"((?:[^"\\]|\\.)*)"/g)]
      .map((match) =>
        match[1].replace(/\\([0-9a-fA-F]{1,6}) ?/g, (_, hex) =>
          String.fromCodePoint(Number.parseInt(hex, 16)),
        ),
      )
      .join("");
  }

  function content(selector) {
    const rule = styles.rules.find((candidate) => candidate.selector === selector);
    if (!rule) return null;
    const decl = rule.decls.find((candidate) => candidate.name === "content");
    return decl ? cssStrings(decl.value) : null;
  }

  for (const [value, label] of scriptLabels) {
    const glyph =
      content(`.effect-preference__option input[value="${value}"]:checked + span::before`) ?? "";
    const reserved = content(`.effect-preference__option:has(input[value="${value}"])::after`);
    assert.equal(
      reserved,
      glyph + label,
      `::after reserve for "${value}" does not match the label "${label}" in script.js`,
    );
  }
  assert.deepEqual(scriptLabels, [
    ["wanted", "Want"],
    ["neutral", "Neutral"],
    ["excluded", "Avoid"],
  ]);
});

function hexToRgb(value) {
  let hex = value.slice(1);
  if (hex.length === 3 || hex.length === 4) hex = [...hex].map((char) => char + char).join("");
  return [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
}

function parseColor(value) {
  if (/^#[0-9a-f]{3,8}$/i.test(value)) return hexToRgb(value);
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(value);
  if (rgb) return rgb.slice(1, 4).map(Number);
  return null;
}

function hsl([red, green, blue]) {
  const [r, g, b] = [red, green, blue].map((channel) => channel / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const delta = max - min;
  if (delta === 0) return { hue: 0, saturation: 0, lightness };
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue;
  if (max === r) hue = ((g - b) / delta) % 6;
  else if (max === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;
  hue = (hue * 60 + 360) % 360;
  return { hue, saturation, lightness };
}

test("background tokens are not blue in either theme (plan section 5, F-14-6)", (t) => {
  const tokens = parseCss(tokensSource).rules;
  function themeDecls(selector, contextPattern) {
    const merged = new Map();
    for (const rule of tokens) {
      if (rule.selector !== selector) continue;
      const media = rule.context.filter((entry) => entry.startsWith("@media"));
      if (contextPattern ? !media.some((entry) => contextPattern.test(entry)) : media.length) {
        continue;
      }
      for (const decl of rule.decls) merged.set(decl.name, decl.value);
    }
    return merged;
  }
  const base = themeDecls(":root");
  const themes = {
    "Dusk (:root)": base,
    'Dusk ([data-theme="light"])': new Map([...base, ...themeDecls(':root[data-theme="light"]')]),
    "Night (system dark)": new Map([
      ...base,
      ...themeDecls(':root:not([data-theme="light"])', /prefers-color-scheme: dark/),
    ]),
    'Night ([data-theme="dark"])': new Map([...base, ...themeDecls(':root[data-theme="dark"]')]),
  };
  const background =
    /^--(surface-[\w-]+|screen-rim|selected-surface|action-primary[\w-]*|money-surface)$/;
  for (const [theme, decls] of Object.entries(themes)) {
    const checked = [...decls].filter(([name]) => background.test(name));
    assert.ok(checked.length >= 12, `${theme}: too few background tokens found`);
    for (const [name, value] of checked) {
      const rgb = parseColor(value);
      assert.ok(rgb, `${theme}: ${name} is not a literal colour (${value})`);
      const { hue, saturation } = hsl(rgb);
      assert.ok(
        !(hue >= 190 && hue <= 250 && saturation > 0.2),
        `${theme}: ${name} ${value} is blue (hue ${hue.toFixed(1)}°, saturation ${(saturation * 100).toFixed(1)} %)`,
      );
    }
    t.diagnostic(`${theme}: ${checked.length} background tokens checked`);
  }
});

test("width media queries use only the 480px and 900px breakpoints", () => {
  const preludes = new Set();
  for (const entry of [...styles.rules, ...styles.atRules]) {
    for (const context of entry.context) {
      if (context.startsWith("@media") && /width/.test(context)) preludes.add(context);
    }
  }
  assert.ok(preludes.size > 0, "no width media query found");
  for (const prelude of preludes) {
    const sizes = [...prelude.matchAll(/(\d+(?:\.\d+)?)px/g)].map((match) => match[1]);
    assert.ok(sizes.length > 0, `${prelude} has no px breakpoint`);
    for (const size of sizes) {
      assert.ok(["480", "900"].includes(size), `${prelude} uses the breakpoint ${size}px`);
    }
  }
});

test("styles.css no longer uses the retired tokens --profit-* and --selected-border", () => {
  assert.doesNotMatch(stylesSource, /var\(\s*--profit-/);
  assert.doesNotMatch(stylesSource, /var\(\s*--selected-border\b/);
});

test("the mix, the shelf and the mixing order are even grids without separators (T-17)", () => {
  const rule = (selector) => {
    const found = styles.rules.find(
      (entry) => entry.selector === selector && entry.context.length === 1,
    );
    assert.ok(found, `${selector} not found`);
    return found;
  };
  const decl = (selector, name) => rule(selector).decls.find((entry) => entry.name === name)?.value;
  // Equal columns: every track is the same 1fr share of one minimum, capped at the list width.
  const columns = "repeat(auto-fill, minmax(min(100%, 124px), 1fr))";
  for (const selector of [".mix", ".ingredient-shelf"]) {
    assert.equal(decl(selector, "display"), "grid", `${selector} is not a grid`);
    assert.equal(decl(selector, "grid-template-columns"), columns, selector);
  }
  assert.equal(decl(".mix .mix__item", "min-width"), "0", "a long name would widen its column");
  // No "+" between tiles: the tile pseudo-element draws nothing and no sibling rule adds one.
  assert.equal(decl(".mix .mix__item::before", "content"), "none");
  assert.ok(
    !styles.rules.some((entry) => /\.mix__item\s*\+/.test(entry.selector)),
    "a sibling rule between mix tiles is back",
  );
  // Tiles share surface, radius and type roles; only primary buttons use the action colour.
  for (const selector of [".mix .mix__item", ".recipe-ingredient-tile", ".recipe-step"]) {
    assert.equal(decl(selector, "background"), "var(--surface-raised)", selector);
    const body = rule(selector)
      .decls.map((entry) => entry.value)
      .join(";");
    assert.doesNotMatch(body, /--action-primary/, selector);
  }
  assert.equal(decl(".mix .mix__item", "border-radius"), "var(--radius-control)");
  for (const selector of [".mix__name", ".recipe-ingredient-tile__name", ".recipe-step__name"]) {
    assert.equal(decl(selector, "font-weight"), "var(--weight-bold)", selector);
  }
  for (const selector of [".mix__step", ".recipe-step__number"]) {
    assert.equal(decl(selector, "font-size"), "var(--type-caption-size)", selector);
  }
});

// Selector specificity as [ids, classes/attributes/pseudo-classes, types]; :not/:is/:has take their
// most specific argument, :where counts zero, pseudo-elements count as types.
function specificity(selector) {
  const total = [0, 0, 0];
  const add = (value) => value.forEach((count, index) => (total[index] += count));
  let rest = selector.replace(
    /:(not|is|has|where)\(((?:[^()]|\([^()]*\))*)\)/g,
    (match, name, args) => {
      if (name !== "where") {
        const best = splitTopLevel(args, ",")
          .map(specificity)
          .sort((a, b) => compareSpecificity(b, a))[0];
        add(best);
      }
      return " ";
    },
  );
  rest = rest.replace(/::[\w-]+/g, () => {
    total[2] += 1;
    return " ";
  });
  total[0] += (rest.match(/#[\w-]+/g) || []).length;
  total[1] += (rest.match(/\.[\w-]+|\[[^\]]*\]|:[\w-]+/g) || []).length;
  rest = rest.replace(/#[\w-]+|\.[\w-]+|\[[^\]]*\]|:[\w-]+/g, " ");
  total[2] += (rest.match(/(^|[\s>+~])[a-zA-Z][\w-]*/g) || []).length;
  return total;
}

function compareSpecificity(a, b) {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

test("an invalid field keeps its error border while the pointer is over it (F-4-6)", () => {
  const setsBorder = (rule) =>
    rule.decls.some((decl) => /^border(-top)?(-color)?$/.test(decl.name));
  const fieldTag = (rule) => subjectCompound(rule.selector).match(/^(select|input)\b/)?.[1];
  const indexed = styles.rules.map((rule, index) => ({ ...rule, index }));
  const hoverRules = indexed.filter(
    (rule) => fieldTag(rule) && /:hover/.test(rule.selector) && setsBorder(rule),
  );
  assert.ok(hoverRules.length >= 3, "the field hover rules were not found");
  const invalidRules = indexed.filter(
    (rule) =>
      fieldTag(rule) &&
      /\[aria-invalid="true"\]/.test(
        subjectCompound(rule.selector).replace(/:not\([^)]*\)/g, ""),
      ) &&
      rule.decls.some((decl) => decl.name === "border-color" && /--status-error/.test(decl.value)),
  );
  assert.ok(invalidRules.length >= 2, "the invalid field rules were not found");
  for (const hover of hoverRules) {
    if (/:not\([^)]*\[aria-invalid="true"\]/.test(subjectCompound(hover.selector))) continue;
    const winner = invalidRules.find((invalid) => {
      if (fieldTag(invalid) !== fieldTag(hover)) return false;
      if (invalid.context.join("|") !== hover.context.join("|")) return false;
      const order = compareSpecificity(specificity(invalid.selector), specificity(hover.selector));
      return order > 0 || (order === 0 && invalid.index > hover.index);
    });
    assert.ok(
      winner,
      `${hover.selector} (specificity ${specificity(hover.selector)}) beats the invalid border; exclude [aria-invalid="true"] or raise the invalid rule`,
    );
  }
});

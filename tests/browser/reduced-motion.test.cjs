"use strict";

// Guards the reduced-motion rules of the real CSS and script (T-7, D-7-2; DESIGN.md section 9).
// Every animation and transition outside `@media (prefers-reduced-motion: reduce)` must be
// neutralised by that block: the universal rule cuts durations to 0.01 ms with !important, every
// rule that starts an animation (progress bar, result reveal, button spinner) has a matching
// `animation: none` rule inside the block, and the JS-driven count-up honours matchMedia.
//
// STYLES_CSS_PATH, TOKENS_CSS_PATH and SCRIPT_JS_PATH replace the file paths; they exist only to
// show that the checks fail on a mutated copy.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const stylesPath = process.env.STYLES_CSS_PATH || path.join(root, "webapp/static/css/styles.css");
const tokensPath = process.env.TOKENS_CSS_PATH || path.join(root, "webapp/static/css/tokens.css");
const scriptPath = process.env.SCRIPT_JS_PATH || path.join(root, "webapp/static/js/script.js");

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

// Returns the style rules as [{ context, selector, decls }]; `context` lists the enclosing at-rule
// preludes (a rule inside @keyframes has an "@keyframes name" entry).
function parseRules(source) {
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
      const prelude = normalize(text.slice(position, open));
      const body = text.slice(open + 1, close - 1);
      if (prelude.startsWith("@") && /\{/.test(body)) {
        walk(open + 1, close - 1, context.concat(prelude));
      } else if (!prelude.startsWith("@")) {
        const decls = parseDeclarations(body);
        for (const selector of splitTopLevel(prelude, ",")) {
          rules.push({ context, selector: normalize(selector), decls });
        }
      }
      position = close;
    }
  }

  walk(0, text.length, []);
  return rules;
}

const styleRules = [
  ...parseRules(fs.readFileSync(stylesPath, "utf8")),
  ...parseRules(fs.readFileSync(tokensPath, "utf8")),
];
const scriptSource = fs.readFileSync(scriptPath, "utf8");

const inReduced = (rule) => rule.context.includes(REDUCED_MOTION);
const inKeyframes = (rule) => rule.context.some((entry) => entry.startsWith("@keyframes"));
const isTransitionDecl = (decl) => /^transition(-[a-z-]+)?$/.test(decl.name);
const isNone = (value) => /^none\b/.test(value);

const outside = styleRules.filter((rule) => !inReduced(rule) && !inKeyframes(rule));
const reduced = styleRules.filter(inReduced);

// 0.01ms or smaller, as a number of milliseconds.
function milliseconds(value) {
  const match = /^([0-9.]+)(ms|s)\b/.exec(value);
  return match ? Number(match[1]) * (match[2] === "s" ? 1000 : 1) : Number.NaN;
}

test("the reduced-motion block exists and its universal rule cuts durations to an instant", () => {
  assert.ok(reduced.length > 0, `styles.css has no ${REDUCED_MOTION} block`);
  for (const selector of ["*", "*::before", "*::after"]) {
    const universal = reduced.find((rule) => rule.selector === selector);
    assert.ok(universal, `the reduced-motion block has no ${selector} rule`);
    const decls = new Map(universal.decls.map((decl) => [decl.name, decl.value]));
    for (const name of ["animation-duration", "transition-duration"]) {
      const value = decls.get(name);
      assert.ok(value, `${selector} sets no ${name} under reduced motion`);
      assert.match(value, /!important$/, `${selector} ${name} is not !important`);
      const duration = milliseconds(value);
      assert.ok(duration <= 0.01, `${selector} ${name} is ${value}, expected <= 0.01ms`);
    }
    assert.equal(
      decls.get("animation-iteration-count"),
      "1 !important",
      `${selector} lets an animation repeat under reduced motion`,
    );
  }
});

test("no rule outside the reduced-motion block overrides the instant durations", () => {
  // A later !important duration would win over the universal rule (equal importance, higher
  // specificity or later order), so a new transition must not set one.
  const escapes = outside.filter((rule) =>
    rule.decls.some(
      (decl) =>
        /^(animation|transition)(-duration)?$/.test(decl.name) && /!important/.test(decl.value),
    ),
  );
  assert.deepEqual(
    escapes.map((rule) => rule.selector),
    [],
    "these rules set an !important animation/transition outside the reduced-motion block",
  );
});

test("every transition user is covered by the instant duration (progress, reveal, spinner and controls)", (t) => {
  const transitions = outside.filter((rule) => rule.decls.some(isTransitionDecl));
  assert.ok(transitions.length >= 3, "expected the control and result transitions");
  for (const rule of transitions) t.diagnostic(`transition: ${rule.selector}`);
  // The universal rule (checked above) is the single mechanism for transitions; a transition that
  // names an unreferenced duration token still lands at 0.01ms.
  const universal = reduced.find((rule) => rule.selector === "*");
  assert.ok(universal, "no universal reduced-motion rule to neutralise the transitions");
});

test("every animation user has an `animation: none` rule inside the reduced-motion block", (t) => {
  const keyframes = new Set(
    styleRules
      .filter(inKeyframes)
      .flatMap((rule) => rule.context)
      .filter((entry) => entry.startsWith("@keyframes"))
      .map((entry) => entry.replace(/^@keyframes\s+/, "")),
  );
  for (const name of ["progress-sweep", "result-reveal", "spinner-rotate"]) {
    assert.ok(keyframes.has(name), `@keyframes ${name} is missing`);
  }
  const animated = outside.filter((rule) =>
    rule.decls.some((decl) => /^animation(-name)?$/.test(decl.name) && !isNone(decl.value)),
  );
  const names = new Set();
  for (const rule of animated) {
    t.diagnostic(`animation: ${rule.selector}`);
    for (const decl of rule.decls) {
      if (!/^animation(-name)?$/.test(decl.name)) continue;
      for (const keyframe of keyframes) {
        if (new RegExp(`(^|[\\s,])${keyframe}($|[\\s,])`).test(decl.value)) names.add(keyframe);
      }
    }
    const neutralised = reduced.some(
      (candidate) =>
        candidate.selector === rule.selector &&
        candidate.decls.some((decl) => /^animation(-name)?$/.test(decl.name) && isNone(decl.value)),
    );
    assert.ok(neutralised, `${rule.selector} keeps its animation under reduced motion`);
  }
  for (const name of ["progress-sweep", "result-reveal", "spinner-rotate"]) {
    assert.ok(names.has(name), `no rule uses @keyframes ${name}`);
  }
  for (const used of names) assert.ok(keyframes.has(used));
});

test("the JS count-up and reveal run only when matchMedia does not report reduced motion", () => {
  const guard =
    /function motionAllowed\(\)\s*\{[\s\S]*?window\.matchMedia\(\s*"\(prefers-reduced-motion: reduce\)"\s*\)\.matches[\s\S]*?\}\s*\n/;
  const match = guard.exec(scriptSource);
  assert.ok(match, "motionAllowed() does not read matchMedia('(prefers-reduced-motion: reduce)')");
  assert.match(
    match[0],
    /!\s*window\.matchMedia\(\s*"\(prefers-reduced-motion: reduce\)"\s*\)\.matches/,
    "motionAllowed() does not negate the reduced-motion match",
  );
  assert.match(scriptSource, /const animated = animate && motionAllowed\(\);/);
  // startReveal and startCountUp are called only from inside `if (animated)`.
  const calls = [...scriptSource.matchAll(/\b(startReveal|startCountUp)\(/g)].filter(
    (call) => !/function\s+$/.test(scriptSource.slice(Math.max(0, call.index - 10), call.index)),
  );
  assert.ok(calls.length >= 2, "expected calls to startReveal and startCountUp");
  for (const call of calls) {
    const before = scriptSource.slice(Math.max(0, call.index - 60), call.index);
    assert.match(
      before,
      /if \(animated\) \{\s*(startReveal\([^)]*\);\s*)?$/,
      `${call[1]} is unguarded`,
    );
  }
  // Any other requestAnimationFrame user is the pointer-driven drag auto-scroll, not decoration.
  const frames = [...scriptSource.matchAll(/requestAnimationFrame\(([a-zA-Z]+)\)/g)].map(
    (match) => match[1],
  );
  assert.deepEqual([...new Set(frames)].sort(), ["autoScroll", "frame"]);
});

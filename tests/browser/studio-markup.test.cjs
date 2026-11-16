"use strict";

// Checks the Studio markup of webapp/templates/index.html (T-14, plan section 3.1) by reading
// the template text. No browser or Jinja rendering is needed for these structural contracts.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const template = fs.readFileSync(path.join(root, "webapp/templates/index.html"), "utf8");

function normalizeText(html) {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function openTag(id) {
  const match = template.match(new RegExp(`<[a-z]+[^>]*\\bid="${id}"[^>]*>`));
  assert.ok(match, `element #${id} exists`);
  return match[0];
}

test("the wordmark h1 reads 'Best Mix for Schedule I'", () => {
  const match = template.match(/<h1 class="wordmark">([\s\S]*?)<\/h1>/);
  assert.ok(match, "h1.wordmark exists");
  assert.equal(normalizeText(match[1]), "Best Mix for Schedule I");
  assert.match(match[1], /<span class="wordmark__sub">for Schedule I<\/span>/);
  assert.equal((template.match(/<h1[\s>]/g) || []).length, 1, "exactly one h1");
});

test("the removed visible headings are gone, the document title stays", () => {
  assert.ok(!template.includes("Set up your mix"));
  assert.ok(!/<h1[^>]*>\s*Best Mix Calculator/.test(template));
  assert.ok(template.includes("<title>Best Mix Calculator</title>"));
});

test("the theme switch offers exactly Dusk and Night, no System option", () => {
  const group = template.match(/<div[^>]*id="theme-switch"[\s\S]*?<\/div>/);
  assert.ok(group, "#theme-switch exists");
  assert.match(group[0], /role="radiogroup"/);
  const buttons = [...group[0].matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map((match) => ({
    value: match[1].match(/data-theme-value="([^"]+)"/)[1],
    label: normalizeText(match[2]),
    checked: /aria-checked="true"/.test(match[1]),
    roving: /tabindex="-1"/.test(match[1]),
  }));
  assert.deepEqual(
    buttons.map(({ value, label }) => [value, label]),
    [
      ["light", "Dusk"],
      ["dark", "Night"],
    ],
  );
  assert.ok(!/system/i.test(group[0]), "no System option or value in the control");
  assert.deepEqual(
    buttons.map(({ checked }) => checked),
    [true, false],
  );
  assert.deepEqual(
    buttons.map(({ roving }) => roving),
    [false, true],
  );
});

test("the scene band is decorative and uses only scene tokens as fills", () => {
  const scene = template.match(
    /<div class="app-header__scene" aria-hidden="true">([\s\S]*?)<\/svg>/,
  );
  assert.ok(scene, "div.app-header__scene[aria-hidden] with an svg exists");
  assert.match(scene[1], /<svg viewBox="0 0 1200 300" preserveAspectRatio="none">/);
  const fills = [...scene[1].matchAll(/fill="([^"]*)"/g)].map((match) => match[1]);
  assert.ok(fills.length >= 3, "the scene has shapes");
  for (const fill of fills) {
    assert.match(fill, /^var\(--scene-(far|mid|near)\)$/, `fill ${fill}`);
  }
  for (const layer of ["far", "mid", "near"]) {
    assert.ok(fills.includes(`var(--scene-${layer})`), `uses --scene-${layer}`);
  }
  assert.ok(!/\bstyle=/.test(scene[1]), "no inline style in the scene");
});

test("main holds the screen wrapper around the tabs and all three panels", () => {
  const main = template.match(
    /<main class="app-main container" id="main">\s*<div class="app-screen">([\s\S]*)<\/div>\s*<\/main>/,
  );
  assert.ok(main, "main > div.app-screen exists");
  assert.ok(main[1].includes('class="calculator-tabs"'));
  for (const panel of ["search-panel", "recipe-panel", "effect-panel"]) {
    assert.ok(main[1].includes(`id="${panel}"`), `${panel} is inside the screen`);
  }
});

test("both result areas are result surfaces", () => {
  for (const id of ["result", "effect-result"]) {
    assert.match(openTag(id), /class="[^"]*\bresult-surface\b[^"]*"/, `#${id}`);
  }
});

test("the form action stays the last child of the search form", () => {
  const form = template.match(/<form\s[^>]*id="best-mix-form"[\s\S]*?<\/form>/);
  assert.ok(form, "#best-mix-form exists");
  const body = form[0].replace(/<\/form>$/, "").trimEnd();
  assert.match(body, /<div class="form-actions">[\s\S]*<\/div>$/);
  assert.equal((body.match(/<div class="form-actions">/g) || []).length, 1);
});

test("the server macros format money and render the mix as tiles", () => {
  assert.match(template, /{%-? macro money\(v\)/);
  assert.match(
    template,
    /<dd>{{ money\(combination\.sell_price - combination\.substance_cost\) }}<\/dd>/,
  );
  assert.match(template, /<dd>{{ money\(combination\.sell_price\) }}<\/dd>/);
  assert.match(template, /<dd>{{ money\(combination\.substance_cost\) }}<\/dd>/);
  assert.match(template, /<ol class="chips chips--ordered mix">/);
  assert.match(template, /<li class="mix__item">/);
  assert.match(template, /<span class="mix__step">{{ loop\.index }}<\/span>/);
  assert.match(template, /<span class="mix__name">/);
  assert.ok(!template.includes("mix__price"), "no price in the server mix");
});

test("the template has no external URL and no style element", () => {
  assert.ok(!/https?:\/\//.test(template), "no http(s) URL");
  assert.ok(!/<style[\s>]/.test(template), "no <style> element");
});

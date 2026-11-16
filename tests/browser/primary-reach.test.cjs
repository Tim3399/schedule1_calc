"use strict";

// Checks the placement rule for the primary buttons (T-17, D-17-1): "Get Best Mix" and "Find
// Recipe" sit in a .form-actions row that directly follows the form fields, and no rule pushes
// that row to the bottom of the stretched form column, where a long result would move it out of
// reach. Reads the template and styles.css as text; no browser is needed.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const template = fs.readFileSync(path.join(root, "webapp/templates/index.html"), "utf8");
const styles = fs.readFileSync(path.join(root, "webapp/static/css/styles.css"), "utf8");

function formActionsRules() {
  const rules = [];
  const pattern = /([^{}]+)\{([^{}]*)\}/g;
  let match;
  while ((match = pattern.exec(styles))) {
    const selector = match[1].replace(/\/\*[\s\S]*?\*\//g, "").trim();
    if (/(^|[\s,>])\.form-actions(?![\w-])/.test(selector)) {
      rules.push({ selector, body: match[2] });
    }
  }
  return rules;
}

test("no .form-actions rule moves the actions away from the fields", () => {
  const rules = formActionsRules();
  assert.ok(rules.length > 0, "expected a .form-actions rule");
  for (const rule of rules) {
    assert.doesNotMatch(rule.body, /margin-top\s*:\s*auto/, `${rule.selector} pushes the row down`);
    assert.doesNotMatch(rule.body, /margin-block-start\s*:\s*auto/, rule.selector);
    assert.doesNotMatch(rule.body, /position\s*:\s*(absolute|fixed)/, rule.selector);
    assert.doesNotMatch(rule.body, /\border\s*:\s*[1-9]/, `${rule.selector} reorders the row`);
  }
});

test("each primary button is in a .form-actions row that follows the form fields", () => {
  for (const label of ["Get Best Mix", "Find Recipe"]) {
    const index = template.indexOf(label);
    assert.ok(index > 0, `${label} exists`);
    const before = template.slice(0, index);
    const rowStart = before.lastIndexOf('<div class="form-actions">');
    assert.ok(rowStart > before.lastIndexOf("</fieldset>") - 1, `${label} row follows fieldset`);
    const row = template.slice(rowStart, template.indexOf("</div>", rowStart));
    assert.match(row, /class="btn--primary"/, `${label} is the primary button of its row`);
  }
});

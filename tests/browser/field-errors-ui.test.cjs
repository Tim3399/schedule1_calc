"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const scriptSource = fs.readFileSync(
  path.resolve(__dirname, "../../webapp/static/js/script.js"),
  "utf8",
);

// Minimal fake DOM: every id resolves to an element, listeners stack per type, and the
// constrained fields implement the native validity rules the real inputs carry.
function element(properties = {}) {
  return {
    attributes: {},
    children: [],
    className: "",
    dataset: {},
    disabled: false,
    hidden: false,
    listeners: {},
    style: {},
    textContent: "",
    value: "",
    ...properties,
    addEventListener(type, listener) {
      (this.listeners[type] ||= []).push(listener);
    },
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    focus() {
      this.owner.focused = this;
    },
    getAttribute(name) {
      return Object.hasOwn(this.attributes, name) ? this.attributes[name] : null;
    },
    querySelector() {
      return element({ owner: this.owner });
    },
    querySelectorAll() {
      return [];
    },
    removeAttribute(name) {
      delete this.attributes[name];
    },
    replaceChildren() {},
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
  };
}

function numberValidity(field) {
  const text = String(field.value).trim();
  const number = Number(text);
  const validity = {
    badInput: false,
    rangeOverflow: false,
    rangeUnderflow: false,
    stepMismatch: false,
    valueMissing: text === "",
  };
  if (text !== "") {
    validity.rangeUnderflow = number < Number(field.min);
    validity.rangeOverflow = field.max !== "" && number > Number(field.max);
    validity.stepMismatch = !Number.isInteger(number);
  }
  validity.valid = !Object.values(validity).some(Boolean);
  return validity;
}

function loadUi() {
  const domReady = [];
  const timers = [];
  const owner = { focused: null };
  const elements = {};
  const get = (id) => (elements[id] ||= element({ id, owner, tagName: "div" }));

  function defineField(id, tagName, extra = {}) {
    const field = get(id);
    Object.assign(field, { tagName, ...extra });
    Object.defineProperty(field, "validity", {
      get() {
        return this.tagName === "select"
          ? { valid: this.value !== "", valueMissing: this.value === "" }
          : numberValidity(this);
      },
    });
    get(`${id}-error`).hidden = true;
    return field;
  }

  const searchForm = get("best-mix-form");
  searchForm.dataset = { searchDataUrl: "/search-data", workerUrl: "/worker.js" };
  const effectForm = get("effect-form");
  const fields = {
    combination: defineField("combination-size", "input", { min: "1", max: "", value: "3" }),
    effectLevel: defineField("effect-level", "select", { value: "max" }),
    effectMax: defineField("effect-max-ingredients", "input", { min: "0", max: "16", value: "6" }),
    effectProduct: defineField("effect-product", "select", { value: "og_kush" }),
    level: defineField("level", "select", { value: "max" }),
    product: defineField("product-name", "select", { value: "og_kush" }),
  };

  const context = {
    AbortController,
    Error,
    Worker: function Worker() {},
    clearTimeout() {},
    document: {
      addEventListener(type, listener) {
        if (type === "DOMContentLoaded") domReady.push(listener);
      },
      createElement: (tagName) => element({ owner, tagName }),
      getElementById: get,
    },
    fetch: () => new Promise(() => {}),
    setTimeout(callback) {
      timers.push(callback);
      return timers.length;
    },
    window: element({ owner }),
  };
  vm.runInNewContext(scriptSource, context, { filename: "script.js" });
  domReady[0]();
  return { effectForm, fields, get, owner, searchForm, timers };
}

// Mirrors the browser: a failed submit fires `invalid` on each invalid control.
function submit(form, fields, timers) {
  for (const field of fields) {
    if (!field.validity.valid) {
      for (const listener of form.listeners.invalid || []) listener({ target: field });
    }
  }
  // The "first invalid already focused" guard resets after the event cycle.
  while (timers.length) timers.shift()();
}

function edit(form, field, value) {
  field.value = value;
  for (const type of ["input", "change"]) {
    for (const listener of form.listeners[type] || []) listener({ target: field });
  }
}

function assertError(ui, field, text) {
  const message = ui.get(`${field.id}-error`);
  assert.equal(field.getAttribute("aria-invalid"), "true", `${field.id} aria-invalid`);
  assert.ok(
    field.getAttribute("aria-describedby").split(" ").includes(message.id),
    `${field.id} aria-describedby`,
  );
  assert.equal(message.hidden, false);
  assert.equal(message.textContent, text);
}

function assertClear(ui, field) {
  const message = ui.get(`${field.id}-error`);
  assert.equal(field.getAttribute("aria-invalid"), null, `${field.id} aria-invalid cleared`);
  assert.equal(field.getAttribute("aria-describedby"), null);
  assert.equal(message.hidden, true);
  assert.equal(message.textContent, "");
}

test("search Max ingredients: rejected values show a linked message and clear when valid", () => {
  const ui = loadUi();
  const field = ui.fields.combination;
  const cases = [
    ["0", "Enter a whole number of at least 1."],
    ["", "Enter a number."],
    ["2.5", "Enter a whole number."],
  ];
  for (const [value, text] of cases) {
    field.value = value;
    submit(ui.searchForm, [field], ui.timers);
    assertError(ui, field, text);
    assert.equal(ui.owner.focused, field);
    edit(ui.searchForm, field, "3");
    assertClear(ui, field);
    ui.owner.focused = null;
  }
});

test("effect Max ingredients: range 0 to 16 is reported and clears", () => {
  const ui = loadUi();
  const field = ui.fields.effectMax;
  field.value = "17";
  submit(ui.effectForm, [field], ui.timers);
  assertError(ui, field, "Enter a whole number from 0 to 16.");
  edit(ui.effectForm, field, "16");
  assertClear(ui, field);
  for (const value of ["-1", "", "1.5"]) {
    field.value = value;
    submit(ui.effectForm, [field], ui.timers);
    assert.equal(field.getAttribute("aria-invalid"), "true", value);
    edit(ui.effectForm, field, "6");
  }
});

test("an invalid value stays marked while it is still invalid", () => {
  const ui = loadUi();
  const field = ui.fields.combination;
  field.value = "0";
  submit(ui.searchForm, [field], ui.timers);
  edit(ui.searchForm, field, "-4");
  assertError(ui, field, "Enter a whole number of at least 1.");
});

test("required selects use the same hook in both forms", () => {
  const ui = loadUi();
  for (const [form, selects] of [
    [ui.searchForm, [ui.fields.product, ui.fields.level]],
    [ui.effectForm, [ui.fields.effectProduct, ui.fields.effectLevel]],
  ]) {
    for (const field of selects) {
      const previous = field.value;
      field.value = "";
      submit(form, [field], ui.timers);
      assertError(ui, field, "Choose an option.");
      edit(form, field, previous);
      assertClear(ui, field);
    }
  }
});

test("the first invalid field gets focus and valid fields stay untouched", () => {
  const ui = loadUi();
  ui.fields.level.value = "";
  ui.fields.combination.value = "0";
  submit(ui.searchForm, [ui.fields.product, ui.fields.level, ui.fields.combination], ui.timers);
  assert.equal(ui.owner.focused, ui.fields.level);
  assert.equal(ui.fields.product.getAttribute("aria-invalid"), null);
  assert.equal(ui.get("product-name-error").hidden, true);
});

test("markup: every constrained field has a hidden message element", () => {
  const html = fs.readFileSync(
    path.resolve(__dirname, "../../webapp/templates/index.html"),
    "utf8",
  );
  for (const id of [
    "product-name",
    "level",
    "combination-size",
    "effect-product",
    "effect-level",
    "effect-max-ingredients",
  ]) {
    assert.match(html, new RegExp(`<p id="${id}-error" class="field__error" hidden></p>`));
  }
});

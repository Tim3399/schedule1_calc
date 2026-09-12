"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const themeSource = fs.readFileSync(
  path.resolve(__dirname, "../../webapp/static/js/theme.js"),
  "utf8",
);

function loadTheme({ storedValue = null, failOn = null } = {}) {
  const storageCalls = [];
  const documentElement = { dataset: {} };
  const document = {
    activeElement: null,
    documentElement,
    getElementById(id) {
      return id === "theme-switch" ? group : null;
    },
  };
  const options = ["system", "light", "dark"].map((value) => ({
    attributes: {
      "aria-checked": value === "system" ? "true" : "false",
    },
    dataset: { themeValue: value },
    listeners: {},
    tabIndex: value === "system" ? 0 : -1,
    addEventListener(type, listener) {
      this.listeners[type] = listener;
    },
    focus() {
      document.activeElement = this;
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
  }));
  const group = {
    querySelectorAll(selector) {
      assert.equal(selector, "[data-theme-value]");
      return options;
    },
  };
  const localStorage = {
    getItem(key) {
      storageCalls.push(["getItem", key]);
      if (failOn === "getItem") throw new Error("storage read denied");
      return storedValue;
    },
    removeItem(key) {
      storageCalls.push(["removeItem", key]);
      if (failOn === "removeItem") throw new Error("storage removal denied");
      storedValue = null;
    },
    setItem(key, value) {
      storageCalls.push(["setItem", key, value]);
      if (failOn === "setItem") throw new Error("storage write denied");
      storedValue = value;
    },
  };

  vm.runInNewContext(themeSource, { document, localStorage }, { filename: "theme.js" });

  return {
    document,
    documentElement,
    options,
    storageCalls,
    storedValue: () => storedValue,
  };
}

function selectedValues(ui) {
  return ui.options
    .filter((option) => option.attributes["aria-checked"] === "true")
    .map((option) => option.dataset.themeValue);
}

function keydown(option, key) {
  let prevented = false;
  option.listeners.keydown({
    key,
    preventDefault() {
      prevented = true;
    },
  });
  return prevented;
}

test("missing, invalid, and blocked storage reads resolve to system", () => {
  for (const setup of [{}, { storedValue: "sepia" }, { failOn: "getItem" }]) {
    const ui = loadTheme(setup);

    assert.equal(ui.documentElement.dataset.theme, "system");
    assert.deepEqual(selectedValues(ui), ["system"]);
    assert.deepEqual(
      ui.options.map((option) => option.tabIndex),
      [0, -1, -1],
    );
  }
});

test("stored explicit theme initializes the control without rewriting storage", () => {
  const ui = loadTheme({ storedValue: "dark" });

  assert.equal(ui.documentElement.dataset.theme, "dark");
  assert.deepEqual(selectedValues(ui), ["dark"]);
  assert.deepEqual(
    ui.options.map((option) => option.tabIndex),
    [-1, -1, 0],
  );
  assert.deepEqual(ui.storageCalls, [["getItem", "schedule1-theme"]]);
});

test("clicking an explicit theme applies and persists it", () => {
  const ui = loadTheme();

  ui.options[1].listeners.click();

  assert.equal(ui.documentElement.dataset.theme, "light");
  assert.equal(ui.storedValue(), "light");
  assert.deepEqual(selectedValues(ui), ["light"]);
  assert.deepEqual(
    ui.options.map((option) => option.tabIndex),
    [-1, 0, -1],
  );
});

test("choosing system removes an explicit stored theme", () => {
  const ui = loadTheme({ storedValue: "dark" });

  ui.options[0].listeners.click();

  assert.equal(ui.documentElement.dataset.theme, "system");
  assert.equal(ui.storedValue(), null);
  assert.deepEqual(ui.storageCalls.at(-1), ["removeItem", "schedule1-theme"]);
});

test("radio keys wrap, jump, focus, and keep ARIA and roving tabindex synchronized", () => {
  const ui = loadTheme();

  assert.equal(keydown(ui.options[0], "ArrowLeft"), true);
  assert.equal(ui.document.activeElement, ui.options[2]);
  assert.deepEqual(selectedValues(ui), ["dark"]);
  assert.deepEqual(
    ui.options.map((option) => option.tabIndex),
    [-1, -1, 0],
  );

  assert.equal(keydown(ui.options[2], "ArrowRight"), true);
  assert.equal(ui.document.activeElement, ui.options[0]);
  assert.deepEqual(selectedValues(ui), ["system"]);

  assert.equal(keydown(ui.options[0], "End"), true);
  assert.equal(ui.document.activeElement, ui.options[2]);
  assert.deepEqual(selectedValues(ui), ["dark"]);

  assert.equal(keydown(ui.options[2], "Home"), true);
  assert.equal(ui.document.activeElement, ui.options[0]);
  assert.deepEqual(selectedValues(ui), ["system"]);

  assert.equal(keydown(ui.options[0], "Enter"), false);
  assert.equal(ui.document.activeElement, ui.options[0]);
});

test("a denied storage write keeps the current page selection usable", () => {
  const ui = loadTheme({ failOn: "setItem" });

  assert.doesNotThrow(() => ui.options[2].listeners.click());
  assert.equal(ui.documentElement.dataset.theme, "dark");
  assert.deepEqual(selectedValues(ui), ["dark"]);
  assert.deepEqual(
    ui.options.map((option) => option.tabIndex),
    [-1, -1, 0],
  );
});

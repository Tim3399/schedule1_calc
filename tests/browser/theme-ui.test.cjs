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

function loadTheme({ storedValue = null, failOn = null, systemDark = false } = {}) {
  const storageCalls = [];
  const documentElement = { dataset: {} };
  const document = {
    activeElement: null,
    documentElement,
    getElementById(id) {
      return id === "theme-switch" ? group : null;
    },
  };
  // Markup order: Dusk (light), Night (dark). The markup ships Dusk checked; theme.js corrects it.
  const options = ["light", "dark"].map((value) => ({
    attributes: {
      "aria-checked": value === "light" ? "true" : "false",
    },
    dataset: { themeValue: value },
    listeners: {},
    tabIndex: value === "light" ? 0 : -1,
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
  const mediaListeners = [];
  const darkQuery = {
    matches: systemDark,
    addEventListener(type, listener) {
      assert.equal(type, "change");
      mediaListeners.push(listener);
    },
  };
  const window = {
    matchMedia(query) {
      assert.equal(query, "(prefers-color-scheme: dark)");
      return darkQuery;
    },
  };

  vm.runInNewContext(themeSource, { document, localStorage, window }, { filename: "theme.js" });

  return {
    changeSystem(dark) {
      darkQuery.matches = dark;
      for (const listener of mediaListeners) listener({ matches: dark });
    },
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

function tabIndexes(ui) {
  return ui.options.map((option) => option.tabIndex);
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

test("missing, invalid, and blocked storage follow the system appearance", () => {
  const setups = [{}, { storedValue: "sepia" }, { storedValue: "system" }, { failOn: "getItem" }];
  for (const systemDark of [false, true]) {
    for (const setup of setups) {
      const ui = loadTheme({ ...setup, systemDark });

      assert.equal(ui.documentElement.dataset.theme, "system");
      assert.deepEqual(selectedValues(ui), [systemDark ? "dark" : "light"]);
      assert.deepEqual(tabIndexes(ui), systemDark ? [-1, 0] : [0, -1]);
      assert.ok(
        ui.storageCalls.every(([call]) => call === "getItem"),
        "nothing is written or removed on load",
      );
    }
  }
});

test("with empty storage a system appearance change updates theme and selection", () => {
  const ui = loadTheme({ systemDark: false });

  ui.changeSystem(true);
  assert.equal(ui.documentElement.dataset.theme, "system");
  assert.deepEqual(selectedValues(ui), ["dark"]);
  assert.deepEqual(tabIndexes(ui), [-1, 0]);

  ui.changeSystem(false);
  assert.deepEqual(selectedValues(ui), ["light"]);
  assert.deepEqual(tabIndexes(ui), [0, -1]);
  assert.equal(ui.storedValue(), null);
});

test("a stored or chosen theme ignores later system appearance changes", () => {
  const stored = loadTheme({ storedValue: "light", systemDark: false });
  stored.changeSystem(true);
  assert.equal(stored.documentElement.dataset.theme, "light");
  assert.deepEqual(selectedValues(stored), ["light"]);

  const chosen = loadTheme({ systemDark: false });
  chosen.options[1].listeners.click();
  chosen.changeSystem(false);
  chosen.changeSystem(true);
  assert.equal(chosen.documentElement.dataset.theme, "dark");
  assert.deepEqual(selectedValues(chosen), ["dark"]);
});

test("stored explicit theme initializes the control without rewriting storage", () => {
  const ui = loadTheme({ storedValue: "dark" });

  assert.equal(ui.documentElement.dataset.theme, "dark");
  assert.deepEqual(selectedValues(ui), ["dark"]);
  assert.deepEqual(tabIndexes(ui), [-1, 0]);
  assert.deepEqual(ui.storageCalls, [["getItem", "schedule1-theme"]]);
});

test("a stored choice wins over the opposite system appearance", () => {
  const night = loadTheme({ storedValue: "dark", systemDark: false });
  assert.equal(night.documentElement.dataset.theme, "dark");
  assert.deepEqual(selectedValues(night), ["dark"]);

  const dusk = loadTheme({ storedValue: "light", systemDark: true });
  assert.equal(dusk.documentElement.dataset.theme, "light");
  assert.deepEqual(selectedValues(dusk), ["light"]);
});

test("clicking an option stores the explicit choice, also when it matches the system", () => {
  const same = loadTheme({ systemDark: true });
  same.options[1].listeners.click();
  assert.equal(same.documentElement.dataset.theme, "dark");
  assert.equal(same.storedValue(), "dark");

  const other = loadTheme({ systemDark: false });
  other.options[1].listeners.click();
  assert.equal(other.documentElement.dataset.theme, "dark");
  assert.equal(other.storedValue(), "dark");
  assert.deepEqual(selectedValues(other), ["dark"]);
  assert.deepEqual(tabIndexes(other), [-1, 0]);

  other.options[0].listeners.click();
  assert.equal(other.documentElement.dataset.theme, "light");
  assert.equal(other.storedValue(), "light");
});

test("radio keys wrap, jump, focus, and keep ARIA and roving tabindex synchronized", () => {
  const ui = loadTheme();

  assert.equal(keydown(ui.options[0], "ArrowLeft"), true);
  assert.equal(ui.document.activeElement, ui.options[1]);
  assert.deepEqual(selectedValues(ui), ["dark"]);
  assert.equal(ui.storedValue(), "dark");
  assert.deepEqual(tabIndexes(ui), [-1, 0]);

  assert.equal(keydown(ui.options[1], "ArrowRight"), true);
  assert.equal(ui.document.activeElement, ui.options[0]);
  assert.deepEqual(selectedValues(ui), ["light"]);

  assert.equal(keydown(ui.options[0], "End"), true);
  assert.equal(ui.document.activeElement, ui.options[1]);
  assert.deepEqual(selectedValues(ui), ["dark"]);

  assert.equal(keydown(ui.options[1], "Home"), true);
  assert.equal(ui.document.activeElement, ui.options[0]);
  assert.deepEqual(selectedValues(ui), ["light"]);

  assert.equal(keydown(ui.options[0], "Enter"), false);
  assert.equal(ui.document.activeElement, ui.options[0]);
});

test("a denied storage write keeps the current page selection usable", () => {
  const ui = loadTheme({ failOn: "setItem" });

  assert.doesNotThrow(() => ui.options[1].listeners.click());
  assert.equal(ui.documentElement.dataset.theme, "dark");
  assert.deepEqual(selectedValues(ui), ["dark"]);
  assert.deepEqual(tabIndexes(ui), [-1, 0]);
});

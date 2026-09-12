"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const engine = require(path.resolve(__dirname, "../../webapp/static/js/search-engine.js"));
const scriptSource = fs.readFileSync(
  path.resolve(__dirname, "../../webapp/static/js/script.js"),
  "utf8",
);

function catalog() {
  const substances = [
    {
      name: "motor_oil",
      display_name: "Motor Oil",
      price_cents: 100,
      level: 1,
      resulting_effect: "bright_eyed",
      replacements: [["calm", "focused"]],
    },
    {
      name: "cuke",
      display_name: "Cuke",
      price_cents: 200,
      level: 1,
      resulting_effect: "calm",
      replacements: [["bright_eyed", "focused"]],
    },
    ...Array.from({ length: 14 }, (_, index) => ({
      name: `ingredient_${index + 3}`,
      display_name: `Ingredient ${index + 3}`,
      price_cents: 300 + index * 25,
      level: 1,
      resulting_effect: "calm",
      replacements: [],
    })),
  ];
  return {
    schema_version: 1,
    product_version: "test",
    model_hash: "test-hash",
    effect_scale: 100,
    money_scale: 100,
    levels: { max: 1 },
    effects: [
      { name: "calm", display_name: "Calm", modifier: 0.1, modifier_units: 10 },
      { name: "bright_eyed", display_name: "Bright Eyed", modifier: 0.2, modifier_units: 20 },
      { name: "focused", display_name: "Focused", modifier: 0.3, modifier_units: 30 },
    ],
    products: [
      {
        name: "og_kush",
        display_name: "OG Kush",
        base_price_cents: 1000,
        effects: ["calm"],
      },
      {
        name: "sour_diesel",
        display_name: "Sour Diesel",
        base_price_cents: 1200,
        effects: ["bright_eyed"],
      },
    ],
    substances,
  };
}

function loadUi({ fetchOutcomes = [catalog()], evaluateRecipe = engine.evaluateRecipe } = {}) {
  const domReady = [];
  const documentListeners = {};
  const fetchCalls = [];
  const workers = [];
  const evaluations = [];
  const timers = new Map();
  let activeElement = null;
  let nextTimer = 1;

  function element(properties = {}) {
    const node = {
      attributes: {},
      children: [],
      className: "",
      dataset: {},
      listeners: {},
      style: {},
      textContent: "",
      value: "",
      ...properties,
      classList: {
        add(...names) {
          const classes = new Set(node.className.split(/\s+/).filter(Boolean));
          for (const name of names) classes.add(name);
          node.className = [...classes].join(" ");
        },
        contains(name) {
          return node.className.split(/\s+/).includes(name);
        },
        remove(...names) {
          const removed = new Set(names);
          node.className = node.className
            .split(/\s+/)
            .filter((name) => name && !removed.has(name))
            .join(" ");
        },
      },
      addEventListener(type, listener) {
        this.listeners[type] = listener;
      },
      appendChild(child) {
        this.children.push(child);
        child.parentNode = this;
        if (this.tagName === "select" && this.children.length === 1 && !this.value) {
          this.value = child.value;
        }
        return child;
      },
      focus() {
        activeElement = this;
        this.listeners.focus?.({ currentTarget: this, target: this });
      },
      cloneNode(deep = false) {
        const clone = element({
          attributes: { ...this.attributes },
          className: this.className,
          dataset: { ...this.dataset },
          tagName: this.tagName,
          textContent: this.textContent,
        });
        if (deep) for (const child of this.children) clone.appendChild(child.cloneNode(true));
        return clone;
      },
      getBoundingClientRect() {
        if (this.tagName === "li") {
          const top = 100 + Number(this.dataset.index) * 50;
          return { bottom: top + 40, height: 40, left: 10, right: 490, top, width: 480 };
        }
        return this.rect || { bottom: 44, height: 44, left: 0, right: 160, top: 0, width: 160 };
      },
      hasPointerCapture(pointerId) {
        return this.capturedPointer === pointerId;
      },
      releasePointerCapture() {
        this.capturedPointer = null;
      },
      remove() {
        if (!this.parentNode) return;
        this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
        this.parentNode = null;
      },
      removeEventListener(type, listener) {
        if (this.listeners[type] === listener) delete this.listeners[type];
      },
      replaceChildren(...children) {
        this.children = [];
        for (const child of children) this.appendChild(child);
      },
      setAttribute(name, value) {
        this.attributes[name] = String(value);
      },
      setPointerCapture(pointerId) {
        this.capturedPointer = pointerId;
      },
    };
    return node;
  }

  const submitButton = element({ disabled: true, tagName: "button" });
  const exactMode = element({ checked: true, value: "exact" });
  const form = element({
    dataset: { searchDataUrl: "/search-data", workerUrl: "/static/js/search-worker.js" },
    tagName: "form",
    querySelector(selector) {
      return selector === 'button[type="submit"]' ? submitButton : exactMode;
    },
  });
  const elements = {
    "best-mix-form": form,
    "cancel-search": element({ hidden: true, tagName: "button" }),
    "clear-recipe": element({ disabled: true, tagName: "button" }),
    "combination-size": element({ value: "2" }),
    "ingredient-shelf": element({ tagName: "div" }),
    level: element({ value: "max" }),
    "product-name": element({ value: "og_kush" }),
    "recipe-count": element({ textContent: "(0 ingredients)" }),
    "recipe-announcement": element({ tagName: "p" }),
    "recipe-drop-area": element({
      rect: { bottom: 700, height: 700, left: 0, right: 500, top: 0, width: 500 },
      tagName: "div",
    }),
    "recipe-empty": element({ hidden: false }),
    "recipe-form": element({ tagName: "form" }),
    "recipe-panel": element({ hidden: true, tagName: "section" }),
    "recipe-product": element({ disabled: true, tagName: "select", value: "og_kush" }),
    "recipe-result": element(),
    "recipe-steps": element({ tagName: "ol" }),
    "recipe-tab": element({
      attributes: { "aria-selected": "false" },
      tabIndex: -1,
      tagName: "button",
    }),
    result: element(),
    "restore-recipe": element({ hidden: true, tagName: "button", textContent: "Undo clear" }),
    "retry-recipe": element({ hidden: true, tagName: "button" }),
    "search-mode": element(),
    "search-mode-exact": exactMode,
    "search-mode-fast": element({ checked: false, value: "fast" }),
    "search-panel": element({ hidden: false, tagName: "section" }),
    "search-tab": element({
      attributes: { "aria-selected": "true" },
      tabIndex: 0,
      tagName: "button",
    }),
  };

  class FakeWorker {
    constructor(url) {
      this.listeners = {};
      this.sent = [];
      this.terminateCalls = 0;
      this.url = url;
      workers.push(this);
    }

    addEventListener(type, listener) {
      this.listeners[type] = listener;
    }

    emit(data) {
      this.listeners.message({ data });
    }

    postMessage(message) {
      this.sent.push(message);
    }

    terminate() {
      this.terminateCalls += 1;
    }
  }

  let fetchIndex = 0;
  const window = element({
    cancelAnimationFrame() {},
    innerHeight: 1000,
    requestAnimationFrame() {
      return 1;
    },
    scrollBy() {},
    Schedule1Search: {
      ...engine,
      evaluateRecipe(loadedCatalog, request) {
        evaluations.push({
          product_name: request.product_name,
          substances: [...request.substances],
        });
        return evaluateRecipe(loadedCatalog, request);
      },
    },
  });
  const context = {
    AbortController,
    Error,
    Worker: FakeWorker,
    document: {
      body: element({ tagName: "body" }),
      addEventListener(type, listener) {
        if (type === "DOMContentLoaded") domReady.push(listener);
        else documentListeners[type] = listener;
      },
      createElement: (tagName) => element({ tagName }),
      getElementById: (id) => elements[id],
      listeners: documentListeners,
    },
    fetch: async (url, options) => {
      fetchCalls.push({ options, url });
      const outcome = fetchOutcomes[Math.min(fetchIndex, fetchOutcomes.length - 1)];
      fetchIndex += 1;
      if (outcome instanceof Error) throw outcome;
      if (outcome?.response) return outcome.response;
      return { json: async () => outcome, ok: true, status: 200 };
    },
    setTimeout(callback, delay) {
      const timer = nextTimer;
      nextTimer += 1;
      timers.set(timer, { callback, delay });
      return timer;
    },
    clearTimeout(timer) {
      timers.delete(timer);
    },
    window,
  };
  vm.runInNewContext(scriptSource, context, { filename: "script.js" });
  assert.equal(domReady.length, 1);
  domReady[0]();

  return {
    activeElement: () => activeElement,
    document: context.document,
    elements,
    evaluations,
    fetchCalls,
    runTimers(delay) {
      for (const [timer, entry] of timers) {
        if (entry.delay !== delay) continue;
        timers.delete(timer);
        entry.callback();
      }
    },
    window,
    workers,
  };
}

function event(properties = {}) {
  return { preventDefault() {}, ...properties };
}

function textOf(node) {
  return [node.textContent, ...node.children.map(textOf)].filter(Boolean).join("\n");
}

async function openRecipe(ui) {
  await ui.elements["recipe-tab"].listeners.click();
}

function addIngredient(ui, name) {
  const tile = ui.elements["ingredient-shelf"].children.find(
    (candidate) => candidate.dataset.ingredient === name,
  );
  tile.listeners.click();
}

function pointer(properties) {
  return event({ button: 0, isPrimary: true, pointerId: 1, pointerType: "mouse", ...properties });
}

function beginShelfDrag(ui, ingredient, properties = {}) {
  const tile = ui.elements["ingredient-shelf"].children.find(
    (candidate) => candidate.dataset.ingredient === ingredient,
  );
  tile.listeners.pointerdown(
    pointer({ clientX: 20, clientY: 20, currentTarget: tile, target: tile, ...properties }),
  );
  return tile;
}

function movePointer(ui, properties) {
  ui.window.listeners.pointermove(pointer(properties));
}

function releasePointer(ui, properties) {
  ui.window.listeners.pointerup(pointer(properties));
}

function tags(node) {
  return [node.tagName, ...node.children.flatMap(tags)];
}

test("renders the catalog shelf and repeated clicks append readable duplicate steps", async () => {
  const ui = loadUi();
  await openRecipe(ui);
  const shelf = ui.elements["ingredient-shelf"];
  assert.equal(shelf.children.length, 16);
  assert.equal(shelf.children[0].attributes["aria-label"], "Add Motor Oil, 1.00$");
  assert.deepEqual(
    [...tags(shelf), ...tags(ui.elements["recipe-steps"])].filter((tag) => tag === "select"),
    [],
  );

  const cuke = shelf.children[1];
  cuke.focus();
  cuke.listeners.click();
  cuke.listeners.click();
  assert.equal(ui.activeElement(), cuke, "repeated shelf clicks retain focus");
  assert.deepEqual(ui.evaluations.at(-1).substances, ["cuke", "cuke"]);
  const firstRowText = textOf(ui.elements["recipe-steps"].children[0]);
  assert.match(firstRowText, /Cuke/);
  assert.doesNotMatch(firstRowText, /2.00\$/);
  assert.match(ui.elements["recipe-announcement"].textContent, /Added Cuke as step 2/);
});

test("clear and undo restore a 14-step sequence and its selected-row focus", async () => {
  const ui = loadUi();
  await openRecipe(ui);
  const recipe = Array.from({ length: 14 }, (_, index) => (index % 3 === 0 ? "cuke" : "motor_oil"));
  for (const name of recipe) addIngredient(ui, name);
  ui.elements["recipe-steps"].children[5].focus();

  assert.equal(ui.elements["recipe-steps"].children.length, 14);
  assert.equal(ui.elements["recipe-count"].textContent, "(14 ingredients)");
  assert.deepEqual(ui.evaluations.at(-1), { product_name: "og_kush", substances: recipe });
  assert.match(textOf(ui.elements["recipe-result"]), /Ingredients\nCuke\nMotor Oil\nMotor Oil/);
  assert.equal(ui.fetchCalls.length, 1);
  assert.equal(ui.fetchCalls[0].url, "/search-data");
  assert.equal(ui.fetchCalls[0].options.method, "GET");
  assert.equal(
    ui.fetchCalls.some(({ options }) => options.method !== "GET"),
    false,
    "recipe evaluation must never call a server calculation endpoint",
  );

  ui.elements["clear-recipe"].listeners.click();
  assert.equal(ui.elements["restore-recipe"].hidden, false);
  assert.equal(ui.elements["restore-recipe"].textContent, "Undo clear");
  assert.equal(ui.elements["recipe-steps"].children.length, 0);
  assert.deepEqual(ui.evaluations.at(-1).substances, []);

  ui.elements["restore-recipe"].listeners.click();
  assert.equal(ui.elements["restore-recipe"].hidden, true);
  assert.equal(ui.elements["recipe-steps"].children.length, 14);
  assert.deepEqual(ui.evaluations.at(-1), { product_name: "og_kush", substances: recipe });
  assert.deepEqual(ui.evaluations.at(-1).substances, recipe);
  assert.equal(ui.activeElement(), ui.elements["recipe-steps"].children[5]);
});

test("rows expose only Delete and support focused Alt+Arrow keyboard reordering", async () => {
  const ui = loadUi();
  await openRecipe(ui);
  for (const name of ["motor_oil", "cuke", "ingredient_3"]) addIngredient(ui, name);

  let rows = ui.elements["recipe-steps"].children;
  assert.equal(rows[0].children.length, 2);
  assert.equal(rows[0].children[1].className, "recipe-step__remove");
  assert.equal(rows[0].attributes["aria-label"], "Step 1: Motor Oil");
  assert.equal(rows[0].attributes["aria-describedby"], "recipe-order-hint");
  rows[0].listeners.keydown(event({ altKey: true, key: "ArrowDown" }));
  assert.deepEqual(ui.evaluations.at(-1).substances, ["cuke", "motor_oil", "ingredient_3"]);
  assert.equal(ui.activeElement(), ui.elements["recipe-steps"].children[1]);

  rows = ui.elements["recipe-steps"].children;
  rows[1].listeners.keydown(event({ altKey: true, key: "ArrowUp" }));
  assert.deepEqual(ui.evaluations.at(-1).substances, ["motor_oil", "cuke", "ingredient_3"]);
  const evaluationCount = ui.evaluations.length;
  ui.elements["recipe-steps"].children[0].listeners.keydown(
    event({ altKey: true, key: "ArrowUp" }),
  );
  assert.equal(ui.evaluations.length, evaluationCount, "edge reorder is a no-op");

  ui.elements["recipe-steps"].children[2].children[1].listeners.click();
  assert.deepEqual(ui.evaluations.at(-1).substances, ["motor_oil", "cuke"]);
  assert.match(textOf(ui.elements["recipe-result"]), /Ingredients\nMotor Oil/);

  ui.elements["clear-recipe"].listeners.click();
  assert.equal(ui.elements["restore-recipe"].hidden, false);
  ui.elements["recipe-product"].value = "sour_diesel";
  ui.elements["recipe-product"].listeners.change();
  assert.equal(ui.elements["restore-recipe"].hidden, true, "base change invalidates clear undo");
});

test("non-drag mutations cancel active gestures before changing the recipe", async () => {
  const ui = loadUi();
  await openRecipe(ui);

  beginShelfDrag(ui, "cuke");
  movePointer(ui, { clientX: 200, clientY: 300 });
  let staleRelease = ui.window.listeners.pointerup;
  const motorOilTile = ui.elements["ingredient-shelf"].children[0];
  motorOilTile.listeners.click({ detail: 0 });
  staleRelease(pointer({ clientX: 200, clientY: 300 }));
  assert.deepEqual(ui.evaluations.at(-1).substances, ["motor_oil"]);

  ui.elements["ingredient-shelf"].children[1].listeners.click({ detail: 0 });
  let row = ui.elements["recipe-steps"].children[0];
  row.listeners.pointerdown(
    pointer({ clientX: 20, clientY: 110, currentTarget: row, target: row }),
  );
  movePointer(ui, { clientX: 200, clientY: 230 });
  staleRelease = ui.window.listeners.pointerup;
  row.children[1].listeners.click();
  staleRelease(pointer({ clientX: 200, clientY: 230 }));
  assert.deepEqual(ui.evaluations.at(-1).substances, ["cuke"]);

  addIngredient(ui, "motor_oil");
  row = ui.elements["recipe-steps"].children[0];
  row.listeners.pointerdown(
    pointer({ clientX: 20, clientY: 110, currentTarget: row, target: row }),
  );
  movePointer(ui, { clientX: 200, clientY: 230 });
  staleRelease = ui.window.listeners.pointerup;
  row.listeners.keydown(event({ altKey: true, key: "ArrowDown" }));
  staleRelease(pointer({ clientX: 200, clientY: 230 }));
  assert.deepEqual(ui.evaluations.at(-1).substances, ["motor_oil", "cuke"]);

  ui.elements["clear-recipe"].listeners.click();
  beginShelfDrag(ui, "ingredient_3");
  movePointer(ui, { clientX: 200, clientY: 300 });
  staleRelease = ui.window.listeners.pointerup;
  ui.elements["restore-recipe"].listeners.click();
  staleRelease(pointer({ clientX: 200, clientY: 300 }));
  assert.deepEqual(ui.evaluations.at(-1).substances, ["motor_oil", "cuke"]);
  assert.equal(ui.document.body.children.length, 0);
});

test("deleting the sole row moves focus to the first shelf tile", async () => {
  const ui = loadUi();
  await openRecipe(ui);
  addIngredient(ui, "cuke");
  ui.elements["recipe-steps"].children[0].children[1].listeners.click();
  assert.deepEqual(ui.evaluations.at(-1).substances, []);
  assert.equal(ui.activeElement(), ui.elements["ingredient-shelf"].children[0]);
});

test("pointer dragging inserts at every boundary and commits exactly once", async () => {
  const ui = loadUi();
  await openRecipe(ui);

  let evaluationCount = ui.evaluations.length;
  let tile = beginShelfDrag(ui, "cuke");
  movePointer(ui, { clientX: 200, clientY: 300 });
  assert.equal(ui.evaluations.length, evaluationCount, "hover must not recalculate");
  releasePointer(ui, { clientX: 200, clientY: 300 });
  assert.deepEqual(ui.evaluations.at(-1).substances, ["cuke"]);
  assert.equal(ui.evaluations.length, evaluationCount + 1);
  tile.listeners.click();
  assert.deepEqual(ui.evaluations.at(-1).substances, ["cuke"], "post-drag click is suppressed");
  tile.listeners.click();
  assert.deepEqual(ui.evaluations.at(-1).substances, ["cuke", "cuke"]);

  beginShelfDrag(ui, "motor_oil");
  movePointer(ui, { clientX: 200, clientY: 50 });
  releasePointer(ui, { clientX: 200, clientY: 50 });
  assert.deepEqual(ui.evaluations.at(-1).substances, ["motor_oil", "cuke", "cuke"]);
  beginShelfDrag(ui, "ingredient_3");
  movePointer(ui, { clientX: 200, clientY: 180 });
  releasePointer(ui, { clientX: 200, clientY: 180 });
  assert.deepEqual(ui.evaluations.at(-1).substances, ["motor_oil", "cuke", "ingredient_3", "cuke"]);
  beginShelfDrag(ui, "ingredient_4");
  movePointer(ui, { clientX: 200, clientY: 650 });
  releasePointer(ui, { clientX: 200, clientY: 650 });
  assert.deepEqual(ui.evaluations.at(-1).substances.at(-1), "ingredient_4");
});

test("row dragging moves both directions while cancellation and wrong pointers preserve input", async () => {
  const ui = loadUi();
  await openRecipe(ui);
  for (const name of ["motor_oil", "cuke", "ingredient_3"]) addIngredient(ui, name);

  let row = ui.elements["recipe-steps"].children[0];
  const beforeAdjacentDrop = ui.evaluations.length;
  row.listeners.pointerdown(
    pointer({ clientX: 20, clientY: 110, currentTarget: row, target: row }),
  );
  movePointer(ui, { clientX: 200, clientY: 130 });
  releasePointer(ui, { clientX: 200, clientY: 130 });
  assert.equal(ui.evaluations.length, beforeAdjacentDrop, "adjacent insertion slot is a no-op");

  row.listeners.pointerdown(
    pointer({ clientX: 20, clientY: 110, currentTarget: row, target: row }),
  );
  movePointer(ui, { clientX: 200, clientY: 230 });
  releasePointer(ui, { clientX: 200, clientY: 230 });
  assert.deepEqual(ui.evaluations.at(-1).substances, ["cuke", "ingredient_3", "motor_oil"]);

  row = ui.elements["recipe-steps"].children[2];
  row.listeners.pointerdown(
    pointer({ clientX: 20, clientY: 210, currentTarget: row, target: row }),
  );
  movePointer(ui, { clientX: 200, clientY: 50 });
  releasePointer(ui, { clientX: 200, clientY: 50 });
  assert.deepEqual(ui.evaluations.at(-1).substances, ["motor_oil", "cuke", "ingredient_3"]);

  const unchanged = [...ui.evaluations.at(-1).substances];
  const countBeforeCancel = ui.evaluations.length;
  beginShelfDrag(ui, "cuke");
  movePointer(ui, { clientX: 200, clientY: 300 });
  releasePointer(ui, { clientX: 200, clientY: 300, pointerId: 99 });
  assert.equal(ui.elements["recipe-drop-area"].classList.contains("recipe-drop-at-end"), true);
  ui.document.listeners.keydown(event({ key: "Escape" }));
  assert.deepEqual(ui.evaluations.at(-1).substances, unchanged);
  assert.equal(ui.evaluations.length, countBeforeCancel);
  assert.equal(ui.elements["recipe-drop-area"].classList.contains("recipe-drop-at-end"), false);

  beginShelfDrag(ui, "cuke");
  movePointer(ui, { clientX: 200, clientY: 300 });
  releasePointer(ui, { clientX: 700, clientY: 300 });
  assert.deepEqual(
    ui.evaluations.at(-1).substances,
    unchanged,
    "release outside must not commit a stale inside target",
  );

  beginShelfDrag(ui, "cuke");
  movePointer(ui, { clientX: 200, clientY: 300 });
  const secondTile = ui.elements["ingredient-shelf"].children[0];
  secondTile.listeners.pointerdown(
    pointer({
      clientX: 30,
      clientY: 30,
      currentTarget: secondTile,
      button: 2,
      pointerId: 2,
      target: secondTile,
    }),
  );
  assert.deepEqual(ui.evaluations.at(-1).substances, unchanged, "competing pointers cancel drag");
  assert.equal(ui.document.body.children.length, 0);

  beginShelfDrag(ui, "cuke");
  movePointer(ui, { clientX: 200, clientY: 300 });
  ui.window.listeners.blur();
  assert.equal(ui.document.body.children.length, 0, "blur cleans the ghost");
  assert.equal(ui.elements["recipe-drop-area"].classList.contains("recipe-drop-at-end"), false);
});

test("touch scrolling cancels before the hold delay and armed touch drag commits once", async () => {
  const ui = loadUi();
  await openRecipe(ui);
  const tile = ui.elements["ingredient-shelf"].children[1];
  const startTouch = { clientX: 20, clientY: 20, identifier: 7 };
  tile.listeners.touchstart({ target: tile, touches: [startTouch] });
  let prevented = false;
  tile.listeners.touchmove({
    preventDefault() {
      prevented = true;
    },
    touches: [{ clientX: 20, clientY: 40, identifier: 7 }],
  });
  ui.runTimers(250);
  assert.equal(prevented, false, "movement before activation leaves native scrolling alone");
  assert.equal(ui.document.body.children.length, 0);
  assert.deepEqual(ui.evaluations.at(-1).substances, []);

  tile.listeners.touchstart({ target: tile, touches: [startTouch] });
  ui.runTimers(250);
  assert.equal(ui.document.body.children[0].style.left, "0px");
  assert.equal(ui.document.body.children[0].style.top, "0px");
  tile.listeners.touchmove({
    preventDefault() {
      prevented = true;
    },
    touches: [{ clientX: 200, clientY: 300, identifier: 7 }],
  });
  assert.equal(prevented, true);
  const evaluationsBeforeDrop = ui.evaluations.length;
  let endPrevented = false;
  tile.listeners.touchend({
    changedTouches: [{ clientX: 200, clientY: 300, identifier: 7 }],
    preventDefault() {
      endPrevented = true;
    },
  });
  assert.equal(endPrevented, true);
  assert.equal(ui.evaluations.length, evaluationsBeforeDrop + 1);
  assert.deepEqual(ui.evaluations.at(-1).substances, ["cuke"]);
  tile.listeners.click({ detail: 1 });
  assert.deepEqual(ui.evaluations.at(-1).substances, ["cuke"], "delayed touch click is suppressed");
  tile.listeners.click({ detail: 0 });
  assert.deepEqual(
    ui.evaluations.at(-1).substances,
    ["cuke", "cuke"],
    "keyboard activation bypasses touch click suppression",
  );

  const motorOilTile = ui.elements["ingredient-shelf"].children[0];
  const secondDragTouch = { clientX: 20, clientY: 20, identifier: 8 };
  motorOilTile.listeners.touchstart({ target: motorOilTile, touches: [secondDragTouch] });
  ui.runTimers(250);
  motorOilTile.listeners.touchmove({
    preventDefault() {},
    touches: [{ clientX: 200, clientY: 650, identifier: 8 }],
  });
  motorOilTile.listeners.touchend({
    changedTouches: [{ clientX: 200, clientY: 650, identifier: 8 }],
    preventDefault() {},
  });
  assert.deepEqual(ui.evaluations.at(-1).substances, ["cuke", "cuke", "motor_oil"]);

  const freshTouch = { clientX: 20, clientY: 20, identifier: 9 };
  motorOilTile.listeners.touchstart({ target: motorOilTile, touches: [freshTouch] });
  motorOilTile.listeners.touchend({ changedTouches: [freshTouch] });
  motorOilTile.listeners.click({ detail: 1 });
  assert.deepEqual(
    ui.evaluations.at(-1).substances,
    ["cuke", "cuke", "motor_oil", "motor_oil"],
    "a fresh deliberate tap is not swallowed when no compatibility click followed the drag",
  );
  ui.runTimers(750);
  assert.deepEqual(ui.evaluations.at(-1).substances, ["cuke", "cuke", "motor_oil", "motor_oil"]);
});

test("tabs support ARIA keyboard navigation and retain the manual recipe", async () => {
  const ui = loadUi();
  await openRecipe(ui);
  addIngredient(ui, "cuke");
  addIngredient(ui, "motor_oil");

  let prevented = false;
  ui.elements["recipe-tab"].listeners.keydown(
    event({
      key: "Home",
      preventDefault() {
        prevented = true;
      },
    }),
  );
  assert.equal(prevented, true);
  assert.equal(ui.elements["search-tab"].attributes["aria-selected"], "true");
  assert.equal(ui.elements["recipe-tab"].attributes["aria-selected"], "false");
  assert.equal(ui.elements["search-tab"].tabIndex, 0);
  assert.equal(ui.elements["recipe-tab"].tabIndex, -1);
  assert.equal(ui.elements["search-panel"].hidden, false);
  assert.equal(ui.elements["recipe-panel"].hidden, true);
  assert.equal(ui.activeElement(), ui.elements["search-tab"]);

  ui.elements["search-tab"].listeners.keydown(event({ key: "ArrowRight" }));
  assert.equal(ui.elements["recipe-tab"].attributes["aria-selected"], "true");
  assert.equal(ui.elements["recipe-panel"].hidden, false);
  assert.equal(ui.activeElement(), ui.elements["recipe-tab"]);
  assert.deepEqual(ui.evaluations.at(-1).substances, ["cuke", "motor_oil"]);
  assert.equal(ui.elements["recipe-steps"].children.length, 2);
});

test("switching to manual cancels search and ignores a stale winner", async () => {
  const ui = loadUi();
  await ui.elements["best-mix-form"].listeners.submit(event());
  assert.equal(ui.workers.length, 1);
  const worker = ui.workers[0];
  const requestId = worker.sent[0].request_id;

  await openRecipe(ui);
  assert.equal(worker.terminateCalls, 1);
  assert.equal(ui.elements["best-mix-form"].attributes["aria-busy"], "false");
  assert.match(textOf(ui.elements.result), /Search cancelled when switching to Your Recipe/);
  assert.equal(ui.fetchCalls.length, 1, "the loaded catalog should be reused by both modes");

  worker.emit({
    request_id: requestId,
    result: {
      best_modifier: {},
      best_profit: {},
      search: { mode: "exact", optimality_proven: true, status: "optimal" },
    },
    type: "result",
  });
  assert.doesNotMatch(textOf(ui.elements.result), /Best Modifier Combination/);
  assert.match(textOf(ui.elements.result), /Search cancelled when switching to Your Recipe/);
  assert.match(textOf(ui.elements["recipe-result"]), /Your Recipe Result/);
});

test("load failure exposes Retry and evaluation failure removes the stale result", async () => {
  let rejectEvaluation = false;
  const ui = loadUi({
    evaluateRecipe(loadedCatalog, request) {
      if (rejectEvaluation) throw new Error("motor_oil cannot be mixed into sour_diesel");
      return engine.evaluateRecipe(loadedCatalog, request);
    },
    fetchOutcomes: [
      {
        response: {
          json: async () => ({}),
          ok: false,
          status: 503,
        },
      },
      catalog(),
    ],
  });

  await openRecipe(ui);
  assert.equal(ui.elements["retry-recipe"].hidden, false);
  assert.match(textOf(ui.elements["recipe-result"]), /HTTP 503/);
  assert.equal(ui.elements["recipe-result"].children[0].attributes.role, "alert");
  assert.equal(ui.elements["recipe-product"].disabled, true);

  await ui.elements["retry-recipe"].listeners.click();
  assert.equal(ui.elements["retry-recipe"].hidden, true);
  assert.equal(ui.elements["recipe-product"].disabled, false);
  assert.equal(ui.fetchCalls.length, 2);
  assert.equal(
    ui.fetchCalls.every(({ options }) => options.method === "GET"),
    true,
  );
  assert.match(textOf(ui.elements["recipe-result"]), /Your Recipe Result/);

  rejectEvaluation = true;
  ui.elements["recipe-product"].value = "sour_diesel";
  ui.elements["recipe-product"].listeners.change();
  const failure = textOf(ui.elements["recipe-result"]);
  assert.match(failure, /Motor Oil cannot be mixed into Sour Diesel/);
  assert.doesNotMatch(failure, /Your Recipe Result|Sell Price|Profit/);
  assert.equal(ui.elements["recipe-result"].children[0].attributes.role, "alert");
});

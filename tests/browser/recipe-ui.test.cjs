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
    substances: [
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
    ],
  };
}

function loadUi({ fetchOutcomes = [catalog()], evaluateRecipe = engine.evaluateRecipe } = {}) {
  const domReady = [];
  const fetchCalls = [];
  const workers = [];
  const evaluations = [];
  let activeElement = null;
  let nextTimer = 1;

  function element(properties = {}) {
    const node = {
      attributes: {},
      children: [],
      listeners: {},
      textContent: "",
      value: "",
      ...properties,
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
      },
      replaceChildren(...children) {
        this.children = [];
        for (const child of children) this.appendChild(child);
      },
      setAttribute(name, value) {
        this.attributes[name] = String(value);
      },
    };
    return node;
  }

  const submitButton = element({ disabled: true, tagName: "button" });
  const form = element({
    dataset: { searchDataUrl: "/search-data", workerUrl: "/static/js/search-worker.js" },
    tagName: "form",
    querySelector() {
      return submitButton;
    },
  });
  const elements = {
    "add-ingredient": element({ disabled: true, tagName: "button" }),
    "best-mix-form": form,
    "cancel-search": element({ hidden: true, tagName: "button" }),
    "clear-recipe": element({ disabled: true, tagName: "button" }),
    "combination-size": element({ value: "2" }),
    level: element({ value: "max" }),
    "product-name": element({ value: "og_kush" }),
    "recipe-count": element({ textContent: "(0 ingredients)" }),
    "recipe-empty": element({ hidden: false }),
    "recipe-form": element({ tagName: "form" }),
    "recipe-ingredient": element({ disabled: true, tagName: "select" }),
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
    "retry-recipe": element({ hidden: true, tagName: "button" }),
    "search-mode": element({ value: "exact" }),
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
      addEventListener(type, listener) {
        if (type === "DOMContentLoaded") domReady.push(listener);
      },
      createElement: (tagName) => element({ tagName }),
      getElementById: (id) => elements[id],
    },
    fetch: async (url, options) => {
      fetchCalls.push({ options, url });
      const outcome = fetchOutcomes[Math.min(fetchIndex, fetchOutcomes.length - 1)];
      fetchIndex += 1;
      if (outcome instanceof Error) throw outcome;
      if (outcome?.response) return outcome.response;
      return { json: async () => outcome, ok: true, status: 200 };
    },
    setTimeout() {
      const timer = nextTimer;
      nextTimer += 1;
      return timer;
    },
    clearTimeout() {},
    window,
  };
  vm.runInNewContext(scriptSource, context, { filename: "script.js" });
  assert.equal(domReady.length, 1);
  domReady[0]();

  return {
    activeElement: () => activeElement,
    elements,
    evaluations,
    fetchCalls,
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
  ui.elements["recipe-ingredient"].value = name;
  ui.elements["recipe-form"].listeners.submit(event());
}

test("adds an ordered 14-step recipe with duplicates and computes it locally", async () => {
  const ui = loadUi();
  await openRecipe(ui);
  const recipe = Array.from({ length: 14 }, (_, index) => (index % 3 === 0 ? "cuke" : "motor_oil"));
  for (const name of recipe) addIngredient(ui, name);

  assert.equal(ui.elements["recipe-steps"].children.length, 14);
  assert.equal(ui.elements["recipe-count"].textContent, "(14 ingredients)");
  assert.deepEqual(ui.evaluations.at(-1), { product_name: "og_kush", substances: recipe });
  assert.match(textOf(ui.elements["recipe-result"]), /Ingredients: Cuke, Motor Oil, Motor Oil/);
  assert.equal(ui.fetchCalls.length, 1);
  assert.equal(ui.fetchCalls[0].url, "/search-data");
  assert.equal(ui.fetchCalls[0].options.method, "GET");
  assert.equal(
    ui.fetchCalls.some(({ options }) => options.method !== "GET"),
    false,
    "recipe evaluation must never call a server calculation endpoint",
  );
});

test("reorder, edit, remove, clear, and base changes immediately recalculate", async () => {
  const ui = loadUi();
  await openRecipe(ui);
  addIngredient(ui, "motor_oil");
  addIngredient(ui, "cuke");

  let rows = ui.elements["recipe-steps"].children;
  rows[0].children[1].children[1].listeners.click();
  assert.deepEqual(ui.evaluations.at(-1).substances, ["cuke", "motor_oil"]);

  rows = ui.elements["recipe-steps"].children;
  rows[0].children[0].value = "motor_oil";
  rows[0].children[0].listeners.change();
  assert.deepEqual(ui.evaluations.at(-1).substances, ["motor_oil", "motor_oil"]);

  rows[1].children[1].children[2].listeners.click();
  assert.deepEqual(ui.evaluations.at(-1).substances, ["motor_oil"]);
  assert.match(textOf(ui.elements["recipe-result"]), /Ingredients: Motor Oil/);
  assert.match(textOf(ui.elements["recipe-result"]), /Effects: Focused, Bright Eyed/);

  ui.elements["recipe-product"].value = "sour_diesel";
  ui.elements["recipe-product"].listeners.change();
  assert.deepEqual(ui.evaluations.at(-1), {
    product_name: "sour_diesel",
    substances: ["motor_oil"],
  });

  ui.elements["clear-recipe"].listeners.click();
  assert.deepEqual(ui.evaluations.at(-1), { product_name: "sour_diesel", substances: [] });
  assert.equal(ui.elements["recipe-count"].textContent, "(0 ingredients)");
  assert.equal(ui.elements["recipe-empty"].hidden, false);
  assert.equal(ui.elements["clear-recipe"].disabled, true);
  assert.match(textOf(ui.elements["recipe-result"]), /Ingredients: None/);
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
  assert.doesNotMatch(failure, /Your Recipe Result|Sell Price|Profit:/);
});

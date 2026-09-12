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

function element(properties = {}) {
  return {
    children: [],
    attributes: {},
    listeners: {},
    ...properties,
    addEventListener(type, listener) {
      this.listeners[type] = listener;
    },
    appendChild(child) {
      this.children.push(child);
    },
    replaceChildren(...children) {
      this.children = children;
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
  };
}

function successfulResult(mode = "exact") {
  const combination = {
    effects: ["energizing"],
    substances: ["cuke"],
    modifier: 0.22,
    sell_price: 42.7,
    substance_cost: 2,
  };
  return {
    search: {
      mode: mode,
      status: mode === "exact" ? "optimal" : "approximate",
      optimality_proven: mode === "exact",
    },
    best_modifier: combination,
    best_profit: combination,
    stats: {},
  };
}

function loadUi(catalog = {}, mode = "exact") {
  const domReady = [];
  const fetchCalls = [];
  const workers = [];
  let nextTimer = 1;
  const timers = [];
  const submitButton = element({ disabled: true });
  const cancelButton = element({ hidden: true });
  const result = element();
  const modeInputs = {
    exact: element({ checked: mode === "exact", value: "exact" }),
    fast: element({ checked: mode === "fast", value: "fast" }),
  };
  const form = element({
    dataset: { searchDataUrl: "/search-data", workerUrl: "/static/js/search-worker.js" },
    querySelector(selector) {
      return selector === 'button[type="submit"]'
        ? submitButton
        : Object.values(modeInputs).find((input) => input.checked);
    },
  });
  const elements = {
    "best-mix-form": form,
    result: result,
    "cancel-search": cancelButton,
    level: element({ value: "street_rat_i" }),
    "combination-size": element({ value: "2" }),
    "product-name": element({ value: "og_kush" }),
    "search-mode": element(),
    "search-mode-exact": modeInputs.exact,
    "search-mode-fast": modeInputs.fast,
    "search-mode-hint": element({
      textContent:
        "Exact proves the best mix or returns no result (up to 5 min). Fast gives a quick estimate without a guarantee.",
    }),
  };

  class FakeWorker {
    constructor(url) {
      this.url = url;
      this.listeners = {};
      this.sent = [];
      this.terminateCalls = 0;
      workers.push(this);
    }

    addEventListener(type, listener) {
      this.listeners[type] = listener;
    }

    postMessage(message) {
      this.sent.push(message);
    }

    terminate() {
      this.terminateCalls += 1;
    }

    emit(data) {
      this.listeners.message({ data: data });
    }
  }

  const context = {
    AbortController,
    Worker: FakeWorker,
    document: {
      addEventListener(type, listener) {
        if (type === "DOMContentLoaded") domReady.push(listener);
      },
      createElement: (tagName) => element({ tagName: tagName, textContent: "" }),
      getElementById: (id) => elements[id],
    },
    fetch: async (url, options) => {
      fetchCalls.push({ url: url, options: options });
      return { ok: true, json: async () => catalog };
    },
    setTimeout(callback, delay) {
      const timer = nextTimer;
      nextTimer += 1;
      timers.push({ callback: callback, delay: delay });
      return timer;
    },
    clearTimeout() {},
    window: element(),
  };
  vm.runInNewContext(scriptSource, context, { filename: "script.js" });
  assert.equal(domReady.length, 1);
  domReady[0]();

  return {
    cancelButton,
    fetchCalls,
    form,
    modeHint: elements["search-mode-hint"],
    modeInputs,
    result,
    submitButton,
    timers,
    workers,
  };
}

function descendants(node) {
  return node.children.flatMap((child) => [child, ...descendants(child)]);
}

function submitEvent() {
  return { preventDefault() {} };
}

function selectMode(ui, mode) {
  ui.modeInputs.exact.checked = mode === "exact";
  ui.modeInputs.fast.checked = mode === "fast";
}

function textOf(node) {
  return [node.textContent, ...node.children.map(textOf)].filter(Boolean).join("\n");
}

function resultText(ui) {
  return ui.result.children.map(textOf).join("\n");
}

test("cancel terminates work, ignores stale results, and allows a cached restart", async () => {
  const ui = loadUi();
  assert.equal(ui.submitButton.disabled, false);

  const first = ui.form.listeners.submit(submitEvent());
  const duplicate = ui.form.listeners.submit(submitEvent());
  await Promise.all([first, duplicate]);

  assert.equal(ui.fetchCalls.length, 1);
  assert.equal(ui.fetchCalls[0].url, "/search-data");
  assert.equal(ui.fetchCalls[0].options.method, "GET");
  assert.equal(ui.fetchCalls[0].options.cache, undefined);
  assert.equal(ui.workers.length, 1);
  assert.equal(ui.workers[0].url, "/static/js/search-worker.js");
  assert.equal(ui.submitButton.disabled, true);

  ui.cancelButton.listeners.click();
  assert.equal(ui.workers[0].terminateCalls, 1);
  assert.match(resultText(ui), /Search cancelled/);
  assert.equal(ui.submitButton.disabled, false);

  await ui.form.listeners.submit(submitEvent());
  assert.equal(ui.fetchCalls.length, 1, "successful catalog response should be cached");
  assert.equal(ui.workers.length, 2);

  const oldRequestId = ui.workers[0].sent[0].request_id;
  ui.workers[0].emit({
    type: "result",
    request_id: oldRequestId,
    result: successfulResult(),
  });
  assert.equal(ui.workers[1].terminateCalls, 0, "late result must not end the new run");
  assert.equal(ui.submitButton.disabled, true);

  const newRequestId = ui.workers[1].sent[0].request_id;
  ui.workers[1].emit({
    type: "result",
    request_id: newRequestId,
    result: successfulResult(),
  });
  assert.equal(ui.workers[1].terminateCalls, 1);
  assert.match(resultText(ui), /Best Profit Combination/);
  assert.equal(ui.submitButton.disabled, false);
  assert.equal(
    ui.fetchCalls.some((call) => call.options.method !== "GET"),
    false,
    "UI must not submit server-side calculation requests",
  );
});

test("a result carrying an error never renders otherwise valid winners", async () => {
  const ui = loadUi();
  await ui.form.listeners.submit(submitEvent());
  const worker = ui.workers[0];
  const result = successfulResult();
  result.error = "incomplete";

  worker.emit({ type: "result", request_id: worker.sent[0].request_id, result: result });

  assert.match(resultText(ui), /invalid or incomplete response/);
  assert.doesNotMatch(resultText(ui), /Best Profit Combination/);
  assert.equal(worker.terminateCalls, 1);
});

test("result IDs render with catalog display names and readable unknown fallbacks", async () => {
  const ui = loadUi({
    effects: [{ name: "energizing", display_name: "Energizing" }],
    substances: [{ name: "cuke", display_name: "Cuke" }],
  });
  await ui.form.listeners.submit(submitEvent());
  const worker = ui.workers[0];
  const result = successfulResult();
  result.best_profit = {
    ...result.best_profit,
    effects: ["bright_eyed"],
    substances: ["motor_oil", "constructor"],
  };

  worker.emit({ type: "result", request_id: worker.sent[0].request_id, result: result });

  assert.match(resultText(ui), /Effects\nEnergizing/);
  assert.match(resultText(ui), /Ingredients\nCuke/);
  assert.match(resultText(ui), /Effects\nBright Eyed/);
  assert.match(resultText(ui), /Ingredients\nMotor Oil\nConstructor/);
  assert.doesNotMatch(resultText(ui), /bright_eyed|motor_oil/);
});

test("profit leads and the modifier result stays in a labelled native comparison", async () => {
  const ui = loadUi();
  await ui.form.listeners.submit(submitEvent());
  const worker = ui.workers[0];
  const result = successfulResult();
  result.best_modifier = {
    effects: ["modifier_effect"],
    substances: ["modifier_ingredient"],
    modifier: 0.91,
    sell_price: 75,
    substance_cost: 14,
  };
  result.best_profit = {
    effects: ["profit_effect"],
    substances: ["profit_ingredient"],
    modifier: 0.42,
    sell_price: 90,
    substance_cost: 8,
  };

  worker.emit({ type: "result", request_id: worker.sent[0].request_id, result });

  assert.equal(ui.result.children.length, 2);
  const profitCard = ui.result.children[0];
  const comparison = ui.result.children[1];
  assert.equal(profitCard.tagName, "article");
  assert.match(textOf(profitCard), /^Best Profit Combination/);
  assert.equal(comparison.tagName, "details");
  assert.equal(comparison.className, "result-comparison");
  assert.equal(comparison.children[0].tagName, "summary");
  assert.equal(comparison.children[0].textContent, "Compare highest modifier");
  assert.match(textOf(comparison.children[1]), /^Best Modifier Combination/);
  assert.equal(textOf(profitCard).match(/Optimality proven/g)?.length, 1);
  assert.equal(textOf(comparison).match(/Optimality proven/g)?.length, 1);

  for (const card of [profitCard, comparison.children[1]]) {
    const labels = descendants(card)
      .filter((node) => node.tagName === "dt" || node.className === "chips-label")
      .map((node) => node.textContent);
    assert.deepEqual(labels, [
      "Profit",
      "Sell Price",
      "Ingredient Cost",
      "Modifier",
      "Ingredients",
      "Effects",
    ]);
  }

  const fastUi = loadUi({}, "fast");
  await fastUi.form.listeners.submit(submitEvent());
  const fastWorker = fastUi.workers[0];
  fastWorker.emit({
    type: "result",
    request_id: fastWorker.sent[0].request_id,
    result: successfulResult("fast"),
  });
  assert.equal(
    resultText(fastUi).match(/Approximate result — optimality not guaranteed/g)?.length,
    2,
  );
});

test("both search modes color effects from the catalog and keep invalid or missing colors neutral", async () => {
  const descendants = (node) => [node, ...node.children.flatMap(descendants)];
  for (const mode of ["exact", "fast"]) {
    const ui = loadUi(
      {
        effects: [
          { name: "energizing", color: "#9afe6d" },
          { name: "toxic", color: "#5f9a31; background: red" },
        ],
        substances: [{ name: "cuke", color: "#9afe6d" }],
      },
      mode,
    );
    await ui.form.listeners.submit(submitEvent());
    const worker = ui.workers[0];
    const result = successfulResult(mode);
    result.best_profit.effects = ["energizing", "toxic", "unknown_effect"];
    worker.emit({ type: "result", request_id: worker.sent[0].request_id, result });
    const chips = descendants(ui.result).filter((node) => node.tagName === "li");
    assert.equal(chips.filter((node) => node.className === "effect-chip").length, 2);
    for (const chip of chips) {
      assert.equal(
        chip.attributes.style,
        chip.textContent === "Energizing" ? "--effect-color: #9afe6d" : undefined,
      );
    }
    assert.match(resultText(ui), /Unknown Effect/);
  }
});

test("search mode uses one static explanation for both radio choices", () => {
  const ui = loadUi({}, "exact");

  assert.equal(ui.modeInputs.exact.checked, true);
  assert.equal(ui.modeInputs.fast.checked, false);
  assert.match(ui.modeHint.textContent, /Exact proves the best mix/);
  assert.match(ui.modeHint.textContent, /up to 5 min/);
  assert.match(ui.modeHint.textContent, /Fast gives a quick estimate without a guarantee/);
  const hint = ui.modeHint.textContent;
  selectMode(ui, "fast");
  assert.equal(ui.modeHint.textContent, hint, "the shared explanation does not swap by mode");
});

test("radio selection is captured at submit with the matching watchdog budget", async () => {
  const exactUi = loadUi();
  const exactSubmit = exactUi.form.listeners.submit(submitEvent());
  selectMode(exactUi, "fast");
  await exactSubmit;
  assert.equal(exactUi.timers[0].delay, 305_000);
  assert.equal(exactUi.workers[0].sent[0].request.search_mode, "exact");

  const fastUi = loadUi({}, "fast");
  await fastUi.form.listeners.submit(submitEvent());
  assert.equal(fastUi.timers[0].delay, 20_000);
  assert.equal(fastUi.workers[0].sent[0].request.search_mode, "fast");
});

test("worker errors use readable catalog names at the display boundary", async () => {
  const ui = loadUi({
    level_display_names: { street_rat_i: "Street Rat I" },
    substances: [{ name: "motor_oil", display_name: "Motor Oil" }],
  });
  await ui.form.listeners.submit(submitEvent());
  const worker = ui.workers[0];

  worker.emit({
    type: "error",
    request_id: worker.sent[0].request_id,
    error: "motor_oilspill differs from motor_oil at street_rat_i",
    search: { mode: "exact", status: "error", optimality_proven: false },
  });

  assert.match(resultText(ui), /Motor Oilspill differs from Motor Oil at Street Rat I/);
  assert.doesNotMatch(resultText(ui), /motor_oil|street_rat_i/);
  assert.equal(ui.result.children[0].attributes.role, "alert");
});

test("malformed catalog data cannot suppress a worker error", async () => {
  const ui = loadUi({ effects: {}, substances: [null] });
  await ui.form.listeners.submit(submitEvent());
  const worker = ui.workers[0];

  worker.emit({
    type: "error",
    request_id: worker.sent[0].request_id,
    error: "catalog.effects must be an array",
    search: { mode: "exact", status: "error", optimality_proven: false },
  });

  assert.match(resultText(ui), /catalog\.effects must be an array/);
  assert.match(resultText(ui), /No result was produced/);
  assert.equal(worker.terminateCalls, 1);
  assert.equal(ui.submitButton.disabled, false);
  assert.equal(ui.result.children[0].attributes.role, "alert");
});

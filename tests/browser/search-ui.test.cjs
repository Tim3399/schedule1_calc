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

function loadUi() {
  const domReady = [];
  const fetchCalls = [];
  const workers = [];
  let nextTimer = 1;
  const submitButton = element({ disabled: true });
  const cancelButton = element({ hidden: true });
  const result = element();
  const form = element({
    dataset: { searchDataUrl: "/search-data", workerUrl: "/static/js/search-worker.js" },
    querySelector() {
      return submitButton;
    },
  });
  const elements = {
    "best-mix-form": form,
    result: result,
    "cancel-search": cancelButton,
    level: element({ value: "street_rat_i" }),
    "combination-size": element({ value: "2" }),
    "product-name": element({ value: "og_kush" }),
    "search-mode": element({ value: "exact" }),
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
      return { ok: true, json: async () => ({ version: "test" }) };
    },
    setTimeout() {
      const timer = nextTimer;
      nextTimer += 1;
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
    result,
    submitButton,
    workers,
  };
}

function submitEvent() {
  return { preventDefault() {} };
}

function resultText(ui) {
  return ui.result.children.map((child) => child.textContent).join("\n");
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

"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const workerSource = fs.readFileSync(
  path.resolve(__dirname, "../../webapp/static/js/search-worker.js"),
  "utf8",
);

function loadWorker(
  search,
  SearchLimitExceeded = class extends Error {},
  searchEffects = undefined,
) {
  const messages = [];
  const listeners = {};
  const context = {
    addEventListener(type, listener) {
      listeners[type] = listener;
    },
    postMessage(message) {
      messages.push(message);
    },
  };
  context.importScripts = (script) => {
    assert.equal(script, "search-engine.js");
    context.Schedule1Search = { search, searchEffects, SearchLimitExceeded };
  };
  vm.runInNewContext(workerSource, context, { filename: "search-worker.js" });
  return { messages, dispatch: (data) => listeners.message({ data }) };
}

test("worker forwards progress and a successful result with the request id", () => {
  const result = {
    search: { mode: "fast", status: "approximate", optimality_proven: false },
    best_modifier: {},
    best_profit: {},
    stats: {},
  };
  const worker = loadWorker((catalog, request, options) => {
    assert.equal(catalog.version, "test");
    assert.equal(request.search_mode, "fast");
    options.onProgress({ depth: 2, work_units: 40 });
    return result;
  });

  worker.dispatch({
    type: "search",
    request_id: 7,
    request: { search_mode: "fast" },
    catalog: { version: "test" },
  });

  assert.equal(worker.messages.length, 2);
  assert.equal(worker.messages[0].type, "progress");
  assert.equal(worker.messages[0].request_id, 7);
  assert.equal(worker.messages[0].progress.work_units, 40);
  assert.equal(worker.messages[1].type, "result");
  assert.equal(worker.messages[1].request_id, 7);
  assert.equal(worker.messages[1].result, result);
});

test("worker reports typed limits as incomplete without winner fields", () => {
  class SearchLimitExceeded extends Error {}
  const worker = loadWorker(() => {
    throw new SearchLimitExceeded("limit reached");
  }, SearchLimitExceeded);

  worker.dispatch({ type: "search", request_id: 8, request: { search_mode: "exact" } });

  assert.equal(worker.messages.length, 1);
  const message = worker.messages[0];
  assert.equal(message.type, "error");
  assert.equal(message.request_id, 8);
  assert.equal(message.error, "limit reached");
  assert.equal(message.search.mode, "exact");
  assert.equal(message.search.status, "incomplete");
  assert.equal(message.search.optimality_proven, false);
  assert.equal("best_modifier" in message, false);
  assert.equal("best_profit" in message, false);
});

test("worker reports unexpected engine failures as errors without winner fields", () => {
  const worker = loadWorker(() => {
    throw new Error("broken engine");
  });

  worker.dispatch({ type: "search", request_id: 9, request: { search_mode: "fast" } });

  const message = worker.messages[0];
  assert.equal(message.type, "error");
  assert.equal(message.error, "broken engine");
  assert.equal(message.search.mode, "fast");
  assert.equal(message.search.status, "error");
  assert.equal("best_modifier" in message, false);
  assert.equal("best_profit" in message, false);
});

test("worker dispatches effect searches with the existing progress and result envelope", () => {
  const result = {
    search: { mode: "exact", status: "optimal", optimality_proven: true },
    recipe: { substances: [] },
    target_effects: ["a"],
    stats: {},
  };
  const worker = loadWorker(
    () => assert.fail("regular search must not be called"),
    class extends Error {},
    (catalog, request, options) => {
      assert.equal(catalog.version, "effects");
      assert.deepEqual(request.target_effects, ["a"]);
      options.onProgress({ phase: "effect frontier", depth: 1, work_units: 3 });
      return result;
    },
  );

  worker.dispatch({
    type: "search_effects",
    request_id: 10,
    request: { search_mode: "exact", target_effects: ["a"] },
    catalog: { version: "effects" },
  });

  assert.equal(worker.messages.length, 2);
  assert.equal(worker.messages[0].type, "progress");
  assert.equal(worker.messages[0].request_id, 10);
  assert.equal(worker.messages[1].type, "result");
  assert.equal(worker.messages[1].request_id, 10);
  assert.equal(worker.messages[1].result, result);
});

test("worker reports effect-search limits without a partial recipe", () => {
  class SearchLimitExceeded extends Error {}
  const worker = loadWorker(
    () => assert.fail("regular search must not be called"),
    SearchLimitExceeded,
    () => {
      throw new SearchLimitExceeded("effect limit reached");
    },
  );

  worker.dispatch({
    type: "search_effects",
    request_id: 11,
    request: { search_mode: "fast" },
  });

  assert.equal(worker.messages.length, 1);
  assert.equal(worker.messages[0].type, "error");
  assert.equal(worker.messages[0].search.status, "incomplete");
  assert.equal("recipe" in worker.messages[0], false);
});

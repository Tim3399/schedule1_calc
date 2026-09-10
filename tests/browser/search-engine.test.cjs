"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const engine = require(path.resolve(__dirname, "../../webapp/static/js/search-engine.js"));

function catalog(effects, products, substances) {
  return {
    schema_version: 1,
    product_version: "test",
    model_hash: "test-hash",
    effect_scale: 100,
    money_scale: 100,
    levels: { max: 1 },
    effects,
    products,
    substances,
  };
}

const tieCatalog = catalog(
  [{ name: "same", modifier: 0.5, modifier_units: 50 }],
  [{ name: "fixture", base_price_cents: 1000, effects: [] }],
  [
    {
      name: "expensive",
      price_cents: 200,
      level: 1,
      resulting_effect: "same",
      replacements: [],
    },
    {
      name: "cheap",
      price_cents: 100,
      level: 1,
      resulting_effect: "same",
      replacements: [],
    },
  ],
);
const request = {
  combination_size: 2,
  product_name: "fixture",
  level: "max",
  search_mode: "exact",
};
const exact = engine.search(tieCatalog, request);
assert.deepEqual(exact.best_modifier.substances, ["expensive", "expensive"]);
assert.deepEqual(exact.best_profit.substances, ["cheap"]);
assert.equal(exact.best_profit.sell_price, 15);
assert.equal(exact.search.optimality_proven, true);

const fast = engine.search(tieCatalog, { ...request, search_mode: "fast" }, { beam_width: 1 });
assert.deepEqual(fast.best_modifier.substances, ["expensive", "expensive"]);
assert.deepEqual(fast.best_profit.substances, ["cheap"]);
assert.equal(fast.search.optimality_proven, false);

const transitionCatalog = catalog(
  [
    { name: "a", modifier: 0.1, modifier_units: 10 },
    { name: "b", modifier: 0.2, modifier_units: 20 },
    { name: "c", modifier: 0.3, modifier_units: 30 },
    { name: "d", modifier: 0.4, modifier_units: 40 },
  ],
  [{ name: "fixture", base_price_cents: 1000, effects: ["a", "b"] }],
  [
    {
      name: "replace",
      price_cents: 100,
      level: 1,
      resulting_effect: "b",
      replacements: [
        ["a", "c"],
        ["b", "d"],
      ],
    },
  ],
);
const transitioned = engine.search(transitionCatalog, { ...request, combination_size: 1 });
assert.deepEqual(transitioned.best_modifier.effects, ["c", "d", "b"]);
assert.equal(transitioned.best_modifier.sell_price, 19);
assert.ok(engine.cpythonFloatSum([0.1, 0.2]) > 0.3);

const negativeModifier = structuredClone(tieCatalog);
negativeModifier.effects[0].modifier_units = -50;
assert.throws(() => engine.validateCatalog(negativeModifier, 1), TypeError);
const lossyModifier = structuredClone(tieCatalog);
lossyModifier.effects[0].modifier = 0.5000000000001;
assert.throws(() => engine.validateCatalog(lossyModifier, 1), TypeError);

assert.throws(
  () => engine.search(tieCatalog, request, { work_limit: 1 }),
  (error) => error instanceof engine.SearchLimitExceeded && error.reason === "work_limit",
);
for (const searchMode of ["exact", "fast"]) {
  let clock = 0;
  let completionProgress = false;
  assert.throws(
    () =>
      engine.search(
        tieCatalog,
        { ...request, combination_size: 1, search_mode: searchMode },
        {
          time_limit_seconds: 1,
          now: () => clock,
          onProgress: ({ phase }) => {
            if (phase === "complete") {
              completionProgress = true;
              clock = 1000;
            }
          },
        },
      ),
    (error) =>
      error instanceof engine.SearchLimitExceeded &&
      error.reason === "time_limit" &&
      error.best_modifier === undefined &&
      error.best_profit === undefined,
  );
  assert.equal(completionProgress, true);
}

console.log("search-engine synthetic checks passed");

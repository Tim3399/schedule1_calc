"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const engine = require(path.resolve(__dirname, "../../webapp/static/js/search-engine.js"));

function catalog({ priceCents = 100 } = {}) {
  return {
    schema_version: 1,
    product_version: "test",
    model_hash: "test-hash",
    effect_scale: 100,
    money_scale: 100,
    levels: { max: 1 },
    effects: [
      { name: "a", modifier: 0.1, modifier_units: 10 },
      { name: "b", modifier: 0.2, modifier_units: 20 },
      { name: "c", modifier: 0.3, modifier_units: 30 },
    ],
    products: [{ name: "fixture", base_price_cents: 1000, effects: ["a"] }],
    substances: [
      {
        name: "left",
        price_cents: priceCents,
        level: 1,
        resulting_effect: "b",
        replacements: [["a", "c"]],
      },
      {
        name: "right",
        price_cents: priceCents,
        level: 1,
        resulting_effect: "a",
        replacements: [["b", "c"]],
      },
    ],
  };
}

test("explicit recipes preserve transition and effect order", () => {
  const leftRight = engine.evaluateRecipe(catalog(), {
    product_name: "fixture",
    substances: ["left", "right"],
  });
  const rightLeft = engine.evaluateRecipe(catalog(), {
    product_name: "fixture",
    substances: ["right", "left"],
  });

  assert.deepEqual(leftRight.effects, ["c", "a"]);
  assert.deepEqual(rightLeft.effects, ["c", "b"]);
  assert.equal(leftRight.modifier, 0.4);
  assert.equal(rightLeft.modifier, 0.5);
  assert.deepEqual(leftRight.substances, ["left", "right"]);
});

test("explicit recipes accept empty, repeated, and more than 16 ingredients", () => {
  const base = engine.evaluateRecipe(catalog(), {
    product_name: "fixture",
    substances: [],
  });
  assert.deepEqual(base, {
    sell_price: 11,
    substance_cost: 0,
    modifier: 0.1,
    substances: [],
    effects: ["a"],
  });

  const repeated = engine.evaluateRecipe(catalog(), {
    product_name: "fixture",
    substances: ["left", "left"],
  });
  assert.deepEqual(repeated.substances, ["left", "left"]);
  assert.deepEqual(repeated.effects, ["c", "b"]);
  assert.equal(repeated.substance_cost, 2);

  const longRecipe = Array(17).fill("left");
  assert.deepEqual(
    engine.evaluateRecipe(catalog(), {
      product_name: "fixture",
      substances: longRecipe,
    }).substances,
    longRecipe,
  );
});

test("explicit recipe requests are fully validated", () => {
  for (const request of [
    null,
    {},
    { product_name: "missing", substances: [] },
    { product_name: "fixture", substances: "left" },
    { product_name: "fixture", substances: ["left", "missing"] },
    { product_name: "fixture", substances: ["left", ""] },
    { product_name: "fixture", substances: ["left", 1] },
  ]) {
    assert.throws(() => engine.evaluateRecipe(catalog(), request), TypeError);
  }
});

test("money bounds use the explicit recipe length", () => {
  const highPriceCatalog = catalog({ priceCents: 90071992547409 });
  assert.doesNotThrow(() =>
    engine.evaluateRecipe(highPriceCatalog, { product_name: "fixture", substances: [] }),
  );
  assert.doesNotThrow(() =>
    engine.evaluateRecipe(highPriceCatalog, {
      product_name: "fixture",
      substances: ["left"],
    }),
  );
  assert.throws(
    () =>
      engine.evaluateRecipe(highPriceCatalog, {
        product_name: "fixture",
        substances: ["left", "right"],
      }),
    RangeError,
  );
});

"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const engine = require(path.resolve(__dirname, "../../webapp/static/js/search-engine.js"));

function catalog(effects, productEffects, substances) {
  return {
    schema_version: 1,
    product_version: "test",
    model_hash: "recipe-ties",
    effect_scale: 100,
    money_scale: 100,
    levels: { max: 1 },
    effects,
    products: [{ name: "fixture", base_price_cents: 1000, effects: productEffects }],
    substances,
  };
}

function request(mode, size) {
  return {
    combination_size: size,
    product_name: "fixture",
    level: "max",
    search_mode: mode,
  };
}

function compareRecipes(left, right) {
  if (left.length !== right.length) return left.length - right.length;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function exhaustiveWinners(model, maxSize) {
  const effectByName = new Map(model.effects.map((effect) => [effect.name, effect]));
  const product = model.products[0];
  let bestModifier = null;
  let bestProfit = null;

  function transition(state, ingredient) {
    const active = new Map(state.map((effect) => [effect, true]));
    const replacements = [];
    for (const [original, replacement] of ingredient.replacements) {
      if (active.delete(original)) replacements.push(replacement);
    }
    for (const replacement of replacements) active.set(replacement, true);
    active.set(ingredient.resulting_effect, true);
    return [...active.keys()];
  }

  function consider(state, recipe, costUnits) {
    const effects = state.map((name) => effectByName.get(name));
    const modifier = engine.cpythonFloatSum(effects.map((effect) => effect.modifier));
    const sellUnits =
      product.base_price_cents *
      (100 + effects.reduce((sum, effect) => sum + effect.modifier_units, 0));
    const candidate = { state, recipe, costUnits, modifier, profitUnits: sellUnits - costUnits };
    if (
      bestModifier === null ||
      candidate.modifier > bestModifier.modifier ||
      (candidate.modifier === bestModifier.modifier &&
        (candidate.profitUnits > bestModifier.profitUnits ||
          (candidate.profitUnits === bestModifier.profitUnits &&
            compareRecipes(candidate.recipe, bestModifier.recipe) < 0)))
    ) {
      bestModifier = candidate;
    }
    if (
      bestProfit === null ||
      candidate.profitUnits > bestProfit.profitUnits ||
      (candidate.profitUnits === bestProfit.profitUnits &&
        compareRecipes(candidate.recipe, bestProfit.recipe) < 0)
    ) {
      bestProfit = candidate;
    }
  }

  function visit(state, recipe, costUnits) {
    if (recipe.length === maxSize) return;
    for (let index = 0; index < model.substances.length; index += 1) {
      const ingredient = model.substances[index];
      const nextRecipe = [...recipe, index];
      const nextCost = costUnits + ingredient.price_cents * 100;
      const nextState = transition(state, ingredient);
      consider(nextState, nextRecipe, nextCost);
      visit(nextState, nextRecipe, nextCost);
    }
  }

  visit(product.effects, [], 0);
  return {
    modifier: bestModifier.recipe.map((index) => model.substances[index].name),
    profit: bestProfit.recipe.map((index) => model.substances[index].name),
  };
}

const oracleCatalog = catalog(
  [
    { name: "a", modifier: 0.1, modifier_units: 10 },
    { name: "b", modifier: 0.2, modifier_units: 20 },
    { name: "c", modifier: 0.3, modifier_units: 30 },
  ],
  [],
  [
    {
      name: "expensive_a",
      price_cents: 200,
      level: 1,
      resulting_effect: "a",
      replacements: [],
    },
    {
      name: "cheap_a",
      price_cents: 100,
      level: 1,
      resulting_effect: "a",
      replacements: [],
    },
    {
      name: "equal_a_later",
      price_cents: 100,
      level: 1,
      resulting_effect: "a",
      replacements: [],
    },
    {
      name: "to_b",
      price_cents: 100,
      level: 1,
      resulting_effect: "b",
      replacements: [["a", "c"]],
    },
  ],
);
const oracle = exhaustiveWinners(oracleCatalog, 3);
assert.deepEqual(oracle.modifier, ["cheap_a", "to_b", "cheap_a"]);
assert.deepEqual(oracle.profit, ["cheap_a", "to_b"]);
for (const mode of ["exact", "fast"]) {
  const outcome = engine.search(oracleCatalog, request(mode, 3), {
    beam_width: 100,
    lookahead: 1,
  });
  assert.deepEqual(outcome.best_modifier.substances, oracle.modifier);
  assert.deepEqual(outcome.best_profit.substances, oracle.profit);
}

const allLoops = catalog(
  [{ name: "same", modifier: 0.5, modifier_units: 50 }],
  ["same"],
  [
    {
      name: "costly_loop",
      price_cents: 100,
      level: 1,
      resulting_effect: "same",
      replacements: [],
    },
    {
      name: "free_loop",
      price_cents: 0,
      level: 1,
      resulting_effect: "same",
      replacements: [],
    },
  ],
);
for (const mode of ["exact", "fast"]) {
  const outcome = engine.search(allLoops, request(mode, 16));
  assert.deepEqual(outcome.best_modifier.substances, ["free_loop"]);
  assert.deepEqual(outcome.best_profit.substances, ["free_loop"]);
  assert.deepEqual(outcome.best_modifier.effects, ["same"]);
  assert.equal(outcome.stats.work_units, 2);
}

const orderedStates = catalog(
  [
    { name: "a", modifier: 0.1, modifier_units: 10 },
    { name: "b", modifier: 0.2, modifier_units: 20 },
  ],
  [],
  [
    { name: "add_a", price_cents: 0, level: 1, resulting_effect: "a", replacements: [] },
    { name: "add_b", price_cents: 0, level: 1, resulting_effect: "b", replacements: [] },
  ],
);
for (const mode of ["exact", "fast"]) {
  const outcome = engine.search(orderedStates, request(mode, 2), { beam_width: 100 });
  assert.deepEqual(outcome.best_modifier.substances, ["add_a", "add_b"]);
  assert.deepEqual(outcome.best_modifier.effects, ["a", "b"]);
  if (mode === "fast") assert.equal(outcome.stats.unique_states_by_depth[2], 2);
}

console.log("recipe tie checks passed");

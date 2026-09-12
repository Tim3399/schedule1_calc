"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const engine = require(path.resolve(__dirname, "../../webapp/static/js/search-engine.js"));

function catalog(effects, productEffects, substances) {
  return {
    schema_version: 1,
    product_version: "test",
    model_hash: "effect-search",
    effect_scale: 100,
    money_scale: 100,
    levels: { max: 1 },
    effects,
    products: [{ name: "fixture", base_price_cents: 1000, effects: productEffects }],
    substances,
  };
}

function substance(name, price, resultingEffect, replacements = []) {
  return {
    name,
    price_cents: price,
    level: 1,
    resulting_effect: resultingEffect,
    replacements,
  };
}

function request(mode, size, targets = ["a", "b"], constraints = {}) {
  return {
    product_name: "fixture",
    level: "max",
    combination_size: size,
    search_mode: mode,
    target_effects: targets,
    ...constraints,
  };
}

function compareRecipes(left, right) {
  if (left.length !== right.length) return left.length - right.length;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function exhaustiveWinner(model, maxSize, targets, matchMode = "exact", excluded = []) {
  const targetSet = new Set(targets);
  const excludedSet = new Set(excluded);
  let winner = null;

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

  function matches(state) {
    if (state.some((effect) => excludedSet.has(effect))) return false;
    if (!targets.every((effect) => state.includes(effect))) return false;
    return matchMode === "contains" || state.length === targetSet.size;
  }

  function visit(state, recipe, cost) {
    if (matches(state)) {
      const candidate = { state, recipe, cost };
      if (
        winner === null ||
        recipe.length < winner.recipe.length ||
        (recipe.length === winner.recipe.length &&
          (cost < winner.cost ||
            (cost === winner.cost && compareRecipes(recipe, winner.recipe) < 0)))
      ) {
        winner = candidate;
      }
    }
    if (recipe.length === maxSize) return;
    for (let index = 0; index < model.substances.length; index += 1) {
      const ingredient = model.substances[index];
      visit(transition(state, ingredient), [...recipe, index], cost + ingredient.price_cents);
    }
  }

  visit(model.products[0].effects, [], 0);
  return winner;
}

const effects = [
  { name: "a", modifier: 0.1, modifier_units: 10 },
  { name: "b", modifier: 0.2, modifier_units: 20 },
  { name: "temporary", modifier: 0.3, modifier_units: 30 },
  { name: "extra", modifier: 0.4, modifier_units: 40 },
];

test("exact search matches an exhaustive oracle through temporary and ordered states", () => {
  const model = catalog(
    effects,
    [],
    [
      substance("temporary_first", 5, "temporary"),
      substance("convert_temporary", 5, "b", [["temporary", "a"]]),
      substance("cheap_a", 1, "a"),
      substance("cheap_b", 1, "b"),
      substance("add_extra", 0, "extra"),
    ],
  );
  const expected = exhaustiveWinner(model, 3, ["a", "b"]);
  assert.deepEqual(expected.recipe, [2, 3]);

  const outcome = engine.searchEffects(model, request("exact", 3));
  assert.deepEqual(outcome.recipe.substances, ["cheap_a", "cheap_b"]);
  assert.deepEqual(outcome.recipe.effects, ["a", "b"]);
  assert.equal(outcome.recipe.substance_cost, 0.02);
  assert.deepEqual(outcome.target_effects, ["a", "b"]);
  assert.equal(outcome.match_mode, "exact");
  assert.deepEqual(outcome.excluded_effects, []);
  assert.deepEqual(outcome.search, {
    mode: "exact",
    status: "optimal",
    optimality_proven: true,
  });
  assert.ok(outcome.stats.retained_states_by_depth[1] >= 4);
});

test("exact and contains constraints match an independent exhaustive oracle", () => {
  const model = catalog(
    effects,
    ["temporary"],
    [
      substance("add_extra", 0, "extra"),
      substance("replace_temporary", 4, "a", [["temporary", "b"]]),
      substance("cheap_a", 1, "a"),
      substance("cheap_b", 2, "b"),
      substance("remove_extra", 1, "a", [["extra", "a"]]),
    ],
  );
  for (const constraints of [
    { matchMode: "exact", excluded: ["extra"] },
    { matchMode: "contains", excluded: ["temporary"] },
  ]) {
    const expected = exhaustiveWinner(
      model,
      3,
      ["a", "b"],
      constraints.matchMode,
      constraints.excluded,
    );
    const outcome = engine.searchEffects(
      model,
      request("exact", 3, [" A ", "B"], {
        match_mode: constraints.matchMode,
        excluded_effects: constraints.excluded.map((effect) => effect.toUpperCase()),
      }),
    );
    assert.deepEqual(
      outcome.recipe.substances,
      expected.recipe.map((index) => model.substances[index].name),
    );
    assert.deepEqual(outcome.recipe.effects, expected.state);
    assert.equal(outcome.recipe.substance_cost, expected.cost / 100);
    assert.equal(outcome.match_mode, constraints.matchMode);
    assert.deepEqual(outcome.target_effects, ["a", "b"]);
    assert.deepEqual(outcome.excluded_effects, constraints.excluded);
    assert.equal(outcome.search.optimality_proven, true);
  }
});

test("contains allows extras while exact rejects them", () => {
  const model = catalog(effects, ["extra"], [substance("add_a", 1, "a")]);
  const contains = engine.searchEffects(
    model,
    request("exact", 1, ["a"], { match_mode: "contains" }),
  );
  assert.deepEqual(contains.recipe.effects, ["extra", "a"]);
  assert.deepEqual(contains.recipe.substances, ["add_a"]);

  const exact = engine.searchEffects(model, request("exact", 1, ["a"]));
  assert.equal(exact.recipe, null);
  assert.equal(exact.search.optimality_proven, true);
});

test("excluded effects constrain only the final state", () => {
  const model = catalog(
    effects,
    [],
    [
      substance("temporary_step", 1, "temporary"),
      substance("convert_temporary", 1, "b", [["temporary", "a"]]),
    ],
  );
  const outcome = engine.searchEffects(
    model,
    request("exact", 2, ["a", "b"], {
      match_mode: "contains",
      excluded_effects: ["temporary"],
    }),
  );
  assert.deepEqual(outcome.recipe.substances, ["temporary_step", "convert_temporary"]);
  assert.deepEqual(outcome.recipe.effects, ["a", "b"]);
});

test("contains supports exclusion-only searches and matching base products", () => {
  const cleanBase = catalog(effects, ["extra"], [substance("unused", 1, "a")]);
  const base = engine.searchEffects(
    cleanBase,
    request("exact", 0, [], { match_mode: "contains", excluded_effects: ["temporary"] }),
  );
  assert.deepEqual(base.recipe.substances, []);
  assert.deepEqual(base.recipe.effects, ["extra"]);

  const removable = catalog(
    effects,
    ["temporary", "extra"],
    [substance("remove_temporary", 1, "a", [["temporary", "a"]])],
  );
  const removed = engine.searchEffects(
    removable,
    request("exact", 1, [], { match_mode: "contains", excluded_effects: ["temporary"] }),
  );
  assert.deepEqual(removed.recipe.effects, ["extra", "a"]);
  assert.deepEqual(removed.excluded_effects, ["temporary"]);
});

test("contains exclusion-only search proves impossible results", () => {
  const model = catalog(effects, ["temporary"], [substance("add_a", 1, "a")]);
  const outcome = engine.searchEffects(
    model,
    request("exact", 2, [], { match_mode: "contains", excluded_effects: ["temporary"] }),
  );
  assert.equal(outcome.recipe, null);
  assert.deepEqual(outcome.search, {
    mode: "exact",
    status: "not_found",
    optimality_proven: true,
  });
});

test("fast ranking ignores allowed extras and penalizes forbidden effects", () => {
  const model = catalog(
    effects,
    [],
    [
      substance("allowed_extra", 0, "extra"),
      substance("forbidden", 0, "temporary"),
      substance("target_from_extra", 1, "b", [["extra", "a"]]),
      substance("target_from_forbidden", 0, "b", [["temporary", "a"]]),
    ],
  );
  const outcome = engine.searchEffects(
    model,
    request("fast", 2, ["a"], {
      match_mode: "contains",
      excluded_effects: ["temporary"],
    }),
    { beam_width: 1, lookahead: 0 },
  );
  assert.deepEqual(outcome.recipe.substances, ["allowed_extra", "target_from_extra"]);
  assert.deepEqual(outcome.recipe.effects, ["a", "b"]);
});

test("minimum depth wins before cost and lookup order breaks remaining ties", () => {
  const model = catalog(
    effects,
    ["temporary"],
    [
      substance("expensive_finish", 100, "b", [["temporary", "a"]]),
      substance("cheap_start", 0, "extra", [["temporary", "extra"]]),
      substance("cheap_finish", 0, "b", [["extra", "a"]]),
    ],
  );
  const expected = exhaustiveWinner(model, 2, ["a", "b"]);
  assert.deepEqual(expected.recipe, [0]);
  const outcome = engine.searchEffects(model, request("exact", 2));
  assert.deepEqual(outcome.recipe.substances, ["expensive_finish"]);
  assert.equal(outcome.recipe.substance_cost, 1);
});

test("matching base product returns an empty recipe in both modes", () => {
  const model = catalog(effects, ["b", "a"], [substance("unused", 1, "extra")]);
  for (const mode of ["exact", "fast"]) {
    const outcome = engine.searchEffects(model, request(mode, 0));
    assert.deepEqual(outcome.recipe.substances, []);
    assert.deepEqual(outcome.recipe.effects, ["b", "a"]);
    assert.equal(outcome.recipe.substance_cost, 0);
    assert.equal(outcome.search.status, mode === "exact" ? "optimal" : "approximate");
    assert.equal(outcome.search.optimality_proven, mode === "exact");
  }
});

test("ordered states remain distinct while exact target matching ignores their order", () => {
  const model = catalog(effects, [], [substance("add_a", 0, "a"), substance("add_b", 0, "b")]);
  const fast = engine.searchEffects(model, request("fast", 2), {
    beam_width: 100,
    lookahead: 0,
  });
  assert.deepEqual(fast.recipe.substances, ["add_a", "add_b"]);
  assert.deepEqual(fast.recipe.effects, ["a", "b"]);
  assert.equal(fast.stats.unique_states_by_depth[1], 2);
});

test("fast beam uses target lookahead and only returns a complete exact set", () => {
  const model = catalog(
    effects,
    [],
    [
      substance("temporary_first", 1, "temporary"),
      substance("convert_temporary", 1, "b", [["temporary", "a"]]),
      substance("partial_a", 0, "a"),
      substance("extra", 0, "extra"),
    ],
  );
  const found = engine.searchEffects(model, request("fast", 2), {
    beam_width: 1,
    lookahead: 1,
  });
  assert.deepEqual(new Set(found.recipe.effects), new Set(["a", "b"]));
  assert.equal(found.search.status, "approximate");
  assert.equal(found.search.optimality_proven, false);

  const impossible = engine.searchEffects(
    catalog(effects, [], [substance("partial_a", 0, "a"), substance("extra", 0, "extra")]),
    request("fast", 3),
    { beam_width: 1 },
  );
  assert.equal(impossible.recipe, null);
  assert.deepEqual(impossible.search, {
    mode: "fast",
    status: "not_found",
    optimality_proven: false,
  });
});

test("exact impossibility is proven even when no ingredients are available at the level", () => {
  const model = catalog(effects, [], [{ ...substance("locked", 1, "a"), level: 2 }]);
  const outcome = engine.searchEffects(model, request("exact", 3));
  assert.equal(outcome.recipe, null);
  assert.deepEqual(outcome.search, {
    mode: "exact",
    status: "not_found",
    optimality_proven: true,
  });
  assert.equal(outcome.stats.work_units, 0);
});

test("exact final layer streams beyond the frontier limit and proves not found", () => {
  const model = catalog(
    effects,
    [],
    [
      substance("add_a", 1, "a"),
      substance("add_b", 1, "b"),
      substance("add_temporary", 1, "temporary"),
      substance("add_extra", 1, "extra"),
    ],
  );
  const outcome = engine.searchEffects(model, request("exact", 1), { frontier_limit: 1 });
  assert.equal(outcome.recipe, null);
  assert.deepEqual(outcome.search, {
    mode: "exact",
    status: "not_found",
    optimality_proven: true,
  });
  assert.equal(outcome.stats.candidates_by_depth[1], 4);
  assert.equal(outcome.stats.retained_states_by_depth[1], 0);
});

test("exact final layer checks every winner tie without storing successor states", () => {
  const model = catalog(
    effects,
    ["temporary"],
    [
      substance("expensive", 20, "b", [["temporary", "a"]]),
      substance("cheapest_first", 5, "b", [["temporary", "a"]]),
      substance("cheapest_later", 5, "a", [["temporary", "b"]]),
      substance("unrelated", 0, "extra"),
    ],
  );
  const outcome = engine.searchEffects(model, request("exact", 1), { frontier_limit: 1 });
  assert.deepEqual(outcome.recipe.substances, ["cheapest_first"]);
  assert.deepEqual(outcome.recipe.effects, ["a", "b"]);
  assert.equal(outcome.recipe.substance_cost, 0.05);
  assert.equal(outcome.stats.candidates_by_depth[1], 4);
  assert.equal(outcome.stats.retained_states_by_depth[1], 0);
});

test("constraint validation rejects invalid modes, lists, duplicates, and overlaps", () => {
  const model = catalog(effects, [], [substance("add_a", 1, "a")]);
  for (const targets of [[], ["a", "A"], ["unknown"], ["a", ""]]) {
    assert.throws(() => engine.searchEffects(model, request("exact", 1, targets)), TypeError);
  }
  assert.throws(
    () =>
      engine.searchEffects(
        model,
        request("exact", 1, [], { match_mode: "contains", excluded_effects: [] }),
      ),
    TypeError,
  );
  for (const constraints of [
    { match_mode: "subset" },
    { excluded_effects: "extra" },
    { excluded_effects: ["extra", "EXTRA"] },
    { excluded_effects: ["unknown"] },
    { excluded_effects: [""] },
    { excluded_effects: ["A"] },
  ]) {
    assert.throws(
      () => engine.searchEffects(model, request("exact", 1, ["a"], constraints)),
      TypeError,
    );
  }
  assert.throws(() => engine.searchEffects(model, request("exact", -1)), TypeError);
  assert.throws(
    () => engine.searchEffects(model, request("exact", 17)),
    (error) => error instanceof engine.SearchLimitExceeded && error.reason === "max_size",
  );
});

test("all exact and fast limits throw without exposing a partial recipe", () => {
  const branching = catalog(
    effects,
    [],
    [substance("add_a", 1, "a"), substance("add_b", 1, "b"), substance("add_extra", 1, "extra")],
  );
  for (const [mode, options] of [
    ["exact", { work_limit: 1 }],
    ["exact", { frontier_limit: 1 }],
    ["fast", { work_limit: 1 }],
  ]) {
    assert.throws(
      () => engine.searchEffects(branching, request(mode, 3), options),
      (error) =>
        error instanceof engine.SearchLimitExceeded &&
        error.recipe === undefined &&
        error.result === undefined,
    );
  }

  assert.throws(
    () =>
      engine.searchEffects(
        branching,
        request("exact", 3, ["a"], {
          match_mode: "contains",
          excluded_effects: ["extra"],
        }),
        { work_limit: 1 },
      ),
    (error) => error instanceof engine.SearchLimitExceeded && error.recipe === undefined,
  );

  for (const mode of ["exact", "fast"]) {
    let clock = 0;
    assert.throws(
      () =>
        engine.searchEffects(branching, request(mode, 2), {
          now: () => clock,
          time_limit_seconds: 1,
          beam_width: 100,
          onProgress: ({ phase }) => {
            if (phase === "complete") clock = 1000;
          },
        }),
      (error) =>
        error instanceof engine.SearchLimitExceeded &&
        error.reason === "time_limit" &&
        error.recipe === undefined,
    );
  }
});

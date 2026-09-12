(function initializeSearchEngine(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.Schedule1Search = api;
})(globalThis, () => {
  const EXACT_DEFAULTS = Object.freeze({
    tail_depth: 1,
    cache_limit: 32768,
    work_limit: 200000000,
    frontier_limit: 300000,
    time_limit_seconds: 300,
  });
  const FAST_DEFAULTS = Object.freeze({
    beam_width: 1024,
    lookahead: 1,
    work_limit: 2000000,
    time_limit_seconds: 15,
  });

  class SearchLimitExceeded extends Error {
    constructor(reason, message) {
      super(message);
      this.name = "SearchLimitExceeded";
      this.reason = reason;
    }
  }

  function normalize(value) {
    return value.trim().toLowerCase().replaceAll(" ", "_");
  }

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function requireInteger(value, name, minimum = 0) {
    if (!Number.isSafeInteger(value) || value < minimum) {
      throw new TypeError(`${name} must be a safe integer of at least ${minimum}`);
    }
    return value;
  }

  function requirePositiveNumber(value, name) {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      throw new TypeError(`${name} must be a positive finite number`);
    }
    return value;
  }

  // CPython 3.12.14 reference: Python/bltinmodule.c, lines 2464-2497.
  // https://github.com/python/cpython/blob/v3.12.14/Python/bltinmodule.c#L2464-L2497
  function cpythonFloatSum(values) {
    let high = 0;
    let low = 0;
    for (const value of values) {
      const next = high + value;
      if (Math.abs(high) >= Math.abs(value)) {
        low += high - next + value;
      } else {
        low += value - next + high;
      }
      high = next;
    }
    return low !== 0 && Number.isFinite(low) ? high + low : high;
  }

  function validateCatalog(catalog, maxSize) {
    if (!isObject(catalog) || catalog.schema_version !== 1) {
      throw new TypeError("catalog.schema_version must be 1");
    }
    for (const field of ["product_version", "model_hash"]) {
      if (typeof catalog[field] !== "string" || catalog[field].length === 0) {
        throw new TypeError(`catalog.${field} must be a non-empty string`);
      }
    }
    if (catalog.effect_scale !== 100 || catalog.money_scale !== 100) {
      throw new TypeError("catalog scales must both be 100");
    }
    if (!isObject(catalog.levels)) {
      throw new TypeError("catalog.levels must be an object");
    }
    const levels = new Map();
    for (const [name, value] of Object.entries(catalog.levels)) {
      if (!name || levels.has(name)) {
        throw new TypeError("catalog level names must be unique and non-empty");
      }
      levels.set(name, requireInteger(value, `level ${name}`));
    }

    if (!Array.isArray(catalog.effects) || catalog.effects.length === 0) {
      throw new TypeError("catalog.effects must be a non-empty array");
    }
    const effectIndex = new Map();
    const effects = catalog.effects.map((effect, index) => {
      if (!isObject(effect) || typeof effect.name !== "string" || !effect.name) {
        throw new TypeError(`effect ${index} has an invalid name`);
      }
      if (effectIndex.has(effect.name)) {
        throw new TypeError(`duplicate effect: ${effect.name}`);
      }
      if (typeof effect.modifier !== "number" || !Number.isFinite(effect.modifier)) {
        throw new TypeError(`effect ${effect.name} has an invalid modifier`);
      }
      requireInteger(effect.modifier_units, `effect ${effect.name} modifier_units`);
      if (effect.modifier !== effect.modifier_units / catalog.effect_scale) {
        throw new TypeError(`effect ${effect.name} modifier units disagree with modifier`);
      }
      effectIndex.set(effect.name, index);
      return { name: effect.name, modifier: effect.modifier, units: effect.modifier_units };
    });

    if (!Array.isArray(catalog.products) || catalog.products.length === 0) {
      throw new TypeError("catalog.products must be a non-empty array");
    }
    const products = new Map();
    for (const product of catalog.products) {
      if (!isObject(product) || typeof product.name !== "string" || !product.name) {
        throw new TypeError("catalog contains a product with an invalid name");
      }
      if (products.has(product.name)) {
        throw new TypeError(`duplicate product: ${product.name}`);
      }
      requireInteger(product.base_price_cents, `${product.name}.base_price_cents`);
      if (!Array.isArray(product.effects)) {
        throw new TypeError(`${product.name}.effects must be an array`);
      }
      const seen = new Set();
      const initial = product.effects.map((name) => {
        if (!effectIndex.has(name) || seen.has(name)) {
          throw new TypeError(`${product.name} has an unknown or duplicate effect`);
        }
        seen.add(name);
        return effectIndex.get(name);
      });
      products.set(product.name, {
        name: product.name,
        baseCents: product.base_price_cents,
        effects: initial,
      });
    }

    if (!Array.isArray(catalog.substances) || catalog.substances.length === 0) {
      throw new TypeError("catalog.substances must be a non-empty array");
    }
    const substanceNames = new Set();
    const substances = catalog.substances.map((substance) => {
      if (!isObject(substance) || typeof substance.name !== "string" || !substance.name) {
        throw new TypeError("catalog contains a substance with an invalid name");
      }
      if (substanceNames.has(substance.name)) {
        throw new TypeError(`duplicate substance: ${substance.name}`);
      }
      substanceNames.add(substance.name);
      requireInteger(substance.price_cents, `${substance.name}.price_cents`);
      requireInteger(substance.level, `${substance.name}.level`);
      if (!effectIndex.has(substance.resulting_effect)) {
        throw new TypeError(`${substance.name} has an unknown resulting effect`);
      }
      if (!Array.isArray(substance.replacements)) {
        throw new TypeError(`${substance.name}.replacements must be an array`);
      }
      const originals = new Set();
      const replacements = substance.replacements.map((pair) => {
        if (
          !Array.isArray(pair) ||
          pair.length !== 2 ||
          !effectIndex.has(pair[0]) ||
          !effectIndex.has(pair[1]) ||
          originals.has(pair[0])
        ) {
          throw new TypeError(`${substance.name} has an invalid replacement`);
        }
        originals.add(pair[0]);
        return [effectIndex.get(pair[0]), effectIndex.get(pair[1])];
      });
      return {
        name: substance.name,
        priceCents: substance.price_cents,
        level: substance.level,
        result: effectIndex.get(substance.resulting_effect),
        replacements,
      };
    });

    const sumAbsUnits = effects.reduce((total, effect) => {
      const next = total + Math.abs(effect.units);
      if (!Number.isSafeInteger(next)) {
        throw new RangeError("catalog effect units exceed safe integer arithmetic");
      }
      return next;
    }, 0);
    const maxPrice = Math.max(...substances.map((substance) => substance.priceCents));
    if (!Number.isSafeInteger(maxPrice * maxSize * 100)) {
      throw new RangeError("catalog costs exceed safe integer arithmetic");
    }
    for (const product of products.values()) {
      if (!Number.isSafeInteger(product.baseCents * (100 + sumAbsUnits))) {
        throw new RangeError(`product ${product.name} price exceeds safe integer arithmetic`);
      }
    }
    return { effects, effectIndex, levels, products, substances };
  }

  function compareRecipes(left, right) {
    if (left.length !== right.length) return left.length - right.length;
    for (let index = 0; index < left.length; index += 1) {
      if (left[index] !== right[index]) return left[index] - right[index];
    }
    return 0;
  }

  function preferred(recipe, winner) {
    return winner === null || compareRecipes(recipe, winner) < 0;
  }

  function stateKey(state) {
    return state.join(",");
  }

  function makeRuntime(model, product, available, options) {
    const now = options.now === undefined ? () => performance.now() : options.now;
    if (typeof now !== "function") throw new TypeError("options.now must be a function");
    const onProgress = options.onProgress;
    if (onProgress !== undefined && typeof onProgress !== "function") {
      throw new TypeError("options.onProgress must be a function");
    }
    const started = now();
    if (typeof started !== "number" || !Number.isFinite(started)) {
      throw new TypeError("options.now must return finite milliseconds");
    }
    const deadline = started + options.time_limit_seconds * 1000;
    let lastProgress = Number.NEGATIVE_INFINITY;

    function checkTime(phase) {
      const current = now();
      if (typeof current !== "number" || !Number.isFinite(current)) {
        throw new TypeError("options.now must return finite milliseconds");
      }
      if (current >= deadline) {
        throw new SearchLimitExceeded(
          "time_limit",
          `Search exceeded its time limit during ${phase}.`,
        );
      }
      return current;
    }

    function progress(phase, depth, workUnits, force = false) {
      if (onProgress === undefined) return;
      const current = now();
      if (force || current - lastProgress >= 100) {
        lastProgress = current;
        onProgress({ phase, depth, work_units: workUnits });
      }
    }

    function transition(state, ingredientIndex) {
      const ingredient = available[ingredientIndex];
      const active = new Map(state.map((effect) => [effect, true]));
      const replacements = [];
      for (const [original, replacement] of ingredient.replacements) {
        if (active.delete(original)) replacements.push(replacement);
      }
      for (const replacement of replacements) active.set(replacement, true);
      active.set(ingredient.result, true);
      return [...active.keys()];
    }

    function evaluate(state) {
      let unitSum = 0;
      const modifiers = [];
      for (const effectIndex of state) {
        unitSum += model.effects[effectIndex].units;
        modifiers.push(model.effects[effectIndex].modifier);
      }
      const sellUnits = product.baseCents * (100 + unitSum);
      if (!Number.isSafeInteger(sellUnits))
        throw new RangeError("price exceeded safe integer range");
      return { modifier: cpythonFloatSum(modifiers), sellUnits };
    }

    function result(state, recipe, costUnits, evaluation) {
      return {
        sell_price: evaluation.sellUnits / 10000,
        substance_cost: costUnits / 10000,
        modifier: evaluation.modifier,
        substances: recipe.map((index) => available[index].name),
        effects: state.map((index) => model.effects[index].name),
      };
    }
    return { now, started, checkTime, progress, transition, evaluate, result };
  }

  function exactSearch(model, product, available, maxSize, options) {
    const runtime = makeRuntime(model, product, available, options);
    const stats = {
      mode: "exact",
      optimality_guaranteed: false,
      work_units: 0,
      candidates_by_depth: {},
      retained_states_by_depth: {},
      merged_prefix_candidates: 0,
      transition_cache_hits: 0,
      transition_cache_misses: 0,
      transition_cache_evictions: 0,
      evaluation_cache_hits: 0,
      evaluation_cache_misses: 0,
      evaluation_cache_evictions: 0,
    };
    const transitionCache = new Map();
    const evaluationCache = new Map();
    let bestModifier = null;
    let bestModifierValue = Number.NEGATIVE_INFINITY;
    let bestModifierProfitUnits = Number.NEGATIVE_INFINITY;
    let bestModifierRecipe = null;
    let bestProfit = null;
    let bestProfitUnits = Number.NEGATIVE_INFINITY;
    let bestProfitRecipe = null;

    function cachePut(cache, key, value, evictionField) {
      if (options.cache_limit === 0) return;
      if (cache.size >= options.cache_limit) {
        cache.delete(cache.keys().next().value);
        stats[evictionField] += 1;
      }
      cache.set(key, value);
    }

    function transition(state, ingredientIndex, useCache, depth) {
      runtime.checkTime("expansion");
      if (stats.work_units >= options.work_limit) {
        throw new SearchLimitExceeded("work_limit", "Exact search exceeded its work limit.");
      }
      stats.work_units += 1;
      if ((stats.work_units & 1023) === 0) {
        runtime.progress("expansion", depth, stats.work_units);
      }
      const key = `${stateKey(state)}|${ingredientIndex}`;
      if (useCache && transitionCache.has(key)) {
        stats.transition_cache_hits += 1;
        return transitionCache.get(key);
      }
      if (useCache) stats.transition_cache_misses += 1;
      const nextState = runtime.transition(state, ingredientIndex);
      if (useCache) cachePut(transitionCache, key, nextState, "transition_cache_evictions");
      return nextState;
    }

    function evaluate(state, useCache) {
      const key = stateKey(state);
      if (useCache && evaluationCache.has(key)) {
        stats.evaluation_cache_hits += 1;
        return evaluationCache.get(key);
      }
      if (useCache) stats.evaluation_cache_misses += 1;
      const evaluation = runtime.evaluate(state);
      if (useCache) cachePut(evaluationCache, key, evaluation, "evaluation_cache_evictions");
      return evaluation;
    }

    function consider(state, early, earlyCost, cheap, cheapCost, useCache) {
      const evaluation = evaluate(state, useCache);
      const modifierProfitUnits = evaluation.sellUnits - earlyCost;
      const profitUnits = evaluation.sellUnits - cheapCost;
      if (
        evaluation.modifier > bestModifierValue ||
        (evaluation.modifier === bestModifierValue &&
          (modifierProfitUnits > bestModifierProfitUnits ||
            (modifierProfitUnits === bestModifierProfitUnits &&
              preferred(early, bestModifierRecipe))))
      ) {
        bestModifierValue = evaluation.modifier;
        bestModifierProfitUnits = modifierProfitUnits;
        bestModifierRecipe = early;
        bestModifier = runtime.result(state, early, earlyCost, evaluation);
      }
      if (
        profitUnits > bestProfitUnits ||
        (profitUnits === bestProfitUnits && preferred(cheap, bestProfitRecipe))
      ) {
        bestProfitUnits = profitUnits;
        bestProfitRecipe = cheap;
        bestProfit = runtime.result(state, cheap, cheapCost, evaluation);
      }
    }

    let states = new Map([
      [
        stateKey(product.effects),
        {
          state: product.effects,
          early: [],
          earlyCost: 0,
          cheap: [],
          cheapCost: 0,
        },
      ],
    ]);
    const prefixDepth = maxSize - Math.min(options.tail_depth, maxSize);
    for (let depth = 1; depth <= prefixDepth; depth += 1) {
      const nextStates = new Map();
      stats.candidates_by_depth[depth] = 0;
      for (const representative of states.values()) {
        for (let ingredientIndex = 0; ingredientIndex < available.length; ingredientIndex += 1) {
          const ingredient = available[ingredientIndex];
          const nextState = transition(representative.state, ingredientIndex, true, depth);
          stats.candidates_by_depth[depth] += 1;
          const early = [...representative.early, ingredientIndex];
          const cheap = [...representative.cheap, ingredientIndex];
          const earlyCost = representative.earlyCost + ingredient.priceCents * 100;
          const cheapCost = representative.cheapCost + ingredient.priceCents * 100;
          consider(nextState, early, earlyCost, cheap, cheapCost, true);
          const key = stateKey(nextState);
          if (key === stateKey(representative.state) && ingredient.priceCents >= 0) continue;
          const old = nextStates.get(key);
          if (old === undefined) {
            if (nextStates.size >= options.frontier_limit) {
              throw new SearchLimitExceeded(
                "frontier_limit",
                "Exact search exceeded its frontier limit.",
              );
            }
            nextStates.set(key, { state: nextState, early, earlyCost, cheap, cheapCost });
          } else {
            stats.merged_prefix_candidates += 1;
            if (
              earlyCost < old.earlyCost ||
              (earlyCost === old.earlyCost && compareRecipes(early, old.early) < 0)
            ) {
              old.early = early;
              old.earlyCost = earlyCost;
            }
            if (
              cheapCost < old.cheapCost ||
              (cheapCost === old.cheapCost && compareRecipes(cheap, old.cheap) < 0)
            ) {
              old.cheap = cheap;
              old.cheapCost = cheapCost;
            }
          }
        }
      }
      states = nextStates;
      stats.retained_states_by_depth[depth] = states.size;
      runtime.progress("frontier", depth, stats.work_units, true);
    }

    function streamTail(representative, remaining) {
      const depth = representative.early.length + 1;
      const finalLayer = remaining === 1;
      stats.candidates_by_depth[depth] ??= 0;
      for (let ingredientIndex = 0; ingredientIndex < available.length; ingredientIndex += 1) {
        const ingredient = available[ingredientIndex];
        const nextState = transition(representative.state, ingredientIndex, !finalLayer, depth);
        stats.candidates_by_depth[depth] += 1;
        const next = {
          state: nextState,
          early: [...representative.early, ingredientIndex],
          earlyCost: representative.earlyCost + ingredient.priceCents * 100,
          cheap: [...representative.cheap, ingredientIndex],
          cheapCost: representative.cheapCost + ingredient.priceCents * 100,
        };
        consider(next.state, next.early, next.earlyCost, next.cheap, next.cheapCost, !finalLayer);
        if (
          !finalLayer &&
          (stateKey(next.state) !== stateKey(representative.state) || ingredient.priceCents < 0)
        ) {
          streamTail(next, remaining - 1);
        }
      }
    }

    for (const representative of states.values()) {
      streamTail(representative, maxSize - prefixDepth);
    }
    runtime.progress("complete", maxSize, stats.work_units, true);
    const completedAt = runtime.checkTime("completion");
    stats.frontier_depth = prefixDepth;
    stats.frontier_states = states.size;
    stats.transition_cache_entries = transitionCache.size;
    stats.evaluation_cache_entries = evaluationCache.size;
    stats.elapsed_seconds = (completedAt - runtime.started) / 1000;
    stats.optimality_guaranteed = true;
    return { bestModifier, bestProfit, stats };
  }

  function compareStates(left, right, model) {
    for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
      const leftName = model.effects[left[index]].name;
      const rightName = model.effects[right[index]].name;
      if (leftName !== rightName) return leftName < rightName ? -1 : 1;
    }
    return left.length - right.length;
  }

  function fastSearch(model, product, available, maxSize, options) {
    const runtime = makeRuntime(model, product, available, options);
    const stats = {
      mode: "approximate",
      optimality_guaranteed: false,
      work_units: 0,
      generated_candidates: 0,
      lookahead_candidates: 0,
      lookahead_transitions: 0,
      unique_states_by_depth: {},
      retained_states_by_depth: {},
      merged_candidates: 0,
      beam_pruned_states: 0,
    };
    let bestModifier = null;
    let bestModifierValue = Number.NEGATIVE_INFINITY;
    let bestModifierProfitUnits = Number.NEGATIVE_INFINITY;
    let bestModifierRecipe = null;
    let bestProfit = null;
    let bestProfitUnits = Number.NEGATIVE_INFINITY;
    let bestProfitRecipe = null;

    function transition(state, ingredientIndex, speculative, depth) {
      runtime.checkTime(speculative ? "lookahead" : "expansion");
      if (stats.work_units >= options.work_limit) {
        throw new SearchLimitExceeded("work_limit", "Fast search exceeded its work limit.");
      }
      stats.work_units += 1;
      if (speculative) stats.lookahead_transitions += 1;
      runtime.progress(speculative ? "lookahead" : "expansion", depth, stats.work_units);
      return runtime.transition(state, ingredientIndex);
    }

    function record(state, modifierRecipe, profitRecipe, modifierCost, profitCost) {
      const evaluation = runtime.evaluate(state);
      const modifierProfitUnits = evaluation.sellUnits - modifierCost;
      const profitUnits = evaluation.sellUnits - profitCost;
      if (
        evaluation.modifier > bestModifierValue ||
        (evaluation.modifier === bestModifierValue &&
          (modifierProfitUnits > bestModifierProfitUnits ||
            (modifierProfitUnits === bestModifierProfitUnits &&
              preferred(modifierRecipe, bestModifierRecipe))))
      ) {
        bestModifierValue = evaluation.modifier;
        bestModifierProfitUnits = modifierProfitUnits;
        bestModifierRecipe = modifierRecipe;
        bestModifier = runtime.result(state, modifierRecipe, modifierCost, evaluation);
      }
      if (
        profitUnits > bestProfitUnits ||
        (profitUnits === bestProfitUnits && preferred(profitRecipe, bestProfitRecipe))
      ) {
        bestProfitUnits = profitUnits;
        bestProfitRecipe = profitRecipe;
        bestProfit = runtime.result(state, profitRecipe, profitCost, evaluation);
      }
      return { modifier: evaluation.modifier, modifierProfitUnits, profitUnits };
    }

    let states = new Map([
      [
        stateKey(product.effects),
        {
          state: product.effects,
          early: [],
          cheap: [],
          cheapCost: 0,
        },
      ],
    ]);
    for (let depth = 1; depth <= maxSize; depth += 1) {
      runtime.checkTime(`depth ${depth}`);
      const nextStates = new Map();
      for (const representative of states.values()) {
        for (let ingredientIndex = 0; ingredientIndex < available.length; ingredientIndex += 1) {
          const ingredient = available[ingredientIndex];
          const nextState = transition(representative.state, ingredientIndex, false, depth);
          stats.generated_candidates += 1;
          const early = [...representative.early, ingredientIndex];
          const cheap = [...representative.cheap, ingredientIndex];
          const cheapCost = representative.cheapCost + ingredient.priceCents * 100;
          record(nextState, early, cheap, recipeCost(early, available), cheapCost);
          const key = stateKey(nextState);
          if (key === stateKey(representative.state) && ingredient.priceCents >= 0) continue;
          const old = nextStates.get(key);
          if (old === undefined) {
            nextStates.set(key, { state: nextState, early, cheap, cheapCost });
          } else {
            stats.merged_candidates += 1;
            if (
              cheapCost < old.cheapCost ||
              (cheapCost === old.cheapCost && compareRecipes(cheap, old.cheap) < 0)
            ) {
              old.cheap = cheap;
              old.cheapCost = cheapCost;
              old.early = cheap;
            }
          }
        }
      }
      stats.unique_states_by_depth[depth] = nextStates.size;
      if (nextStates.size > options.beam_width) {
        const horizon = Math.min(options.lookahead, maxSize - depth);
        const forecasts = new Map();
        for (const [key, representative] of nextStates) {
          const current = runtime.evaluate(representative.state);
          const forecast = {
            modifier: current.modifier,
            modifierRecipe: representative.early,
            modifierProfitUnits: current.sellUnits - recipeCost(representative.early, available),
            profitUnits: current.sellUnits - representative.cheapCost,
            profitRecipe: representative.cheap,
          };
          forecasts.set(key, forecast);
          let frontier = [representative];
          for (let step = 0; step < horizon; step += 1) {
            const following = [];
            for (const item of frontier) {
              for (
                let ingredientIndex = 0;
                ingredientIndex < available.length;
                ingredientIndex += 1
              ) {
                const ingredient = available[ingredientIndex];
                const completedState = transition(
                  item.state,
                  ingredientIndex,
                  true,
                  depth + step + 1,
                );
                stats.lookahead_candidates += 1;
                const completedEarly = [...item.early, ingredientIndex];
                const completedCheap = [...item.cheap, ingredientIndex];
                const completedCost = item.cheapCost + ingredient.priceCents * 100;
                const completed = record(
                  completedState,
                  completedEarly,
                  completedCheap,
                  recipeCost(completedEarly, available),
                  completedCost,
                );
                if (
                  completed.modifier > forecast.modifier ||
                  (completed.modifier === forecast.modifier &&
                    (completed.modifierProfitUnits > forecast.modifierProfitUnits ||
                      (completed.modifierProfitUnits === forecast.modifierProfitUnits &&
                        preferred(completedEarly, forecast.modifierRecipe))))
                ) {
                  forecast.modifier = completed.modifier;
                  forecast.modifierRecipe = completedEarly;
                  forecast.modifierProfitUnits = completed.modifierProfitUnits;
                }
                if (
                  completed.profitUnits > forecast.profitUnits ||
                  (completed.profitUnits === forecast.profitUnits &&
                    preferred(completedCheap, forecast.profitRecipe))
                ) {
                  forecast.profitUnits = completed.profitUnits;
                  forecast.profitRecipe = completedCheap;
                }
                if (
                  stateKey(completedState) !== stateKey(item.state) ||
                  ingredient.priceCents < 0
                ) {
                  following.push({
                    state: completedState,
                    early: completedEarly,
                    cheap: completedCheap,
                    cheapCost: completedCost,
                  });
                }
              }
            }
            frontier = following;
          }
        }
        const entries = [...nextStates.entries()];
        const profitRanked = entries.slice().sort((left, right) => {
          const leftForecast = forecasts.get(left[0]);
          const rightForecast = forecasts.get(right[0]);
          return (
            rightForecast.profitUnits - leftForecast.profitUnits ||
            compareRecipes(leftForecast.profitRecipe, rightForecast.profitRecipe) ||
            compareStates(left[1].state, right[1].state, model)
          );
        });
        const modifierRanked = entries.slice().sort((left, right) => {
          const leftForecast = forecasts.get(left[0]);
          const rightForecast = forecasts.get(right[0]);
          return (
            rightForecast.modifier - leftForecast.modifier ||
            rightForecast.modifierProfitUnits - leftForecast.modifierProfitUnits ||
            compareRecipes(leftForecast.modifierRecipe, rightForecast.modifierRecipe) ||
            compareStates(left[1].state, right[1].state, model)
          );
        });
        const selected = [];
        const selectedKeys = new Set();
        const profitSlots = Math.floor((options.beam_width + 1) / 2);
        for (const entry of profitRanked.slice(0, profitSlots)) {
          selected.push(entry);
          selectedKeys.add(entry[0]);
        }
        for (const entry of modifierRanked) {
          if (selected.length === options.beam_width) break;
          if (!selectedKeys.has(entry[0])) {
            selected.push(entry);
            selectedKeys.add(entry[0]);
          }
        }
        stats.beam_pruned_states += nextStates.size - selected.length;
        states = new Map(selected);
      } else {
        states = nextStates;
      }
      stats.retained_states_by_depth[depth] = states.size;
      runtime.progress("beam", depth, stats.work_units, true);
    }
    runtime.progress("complete", maxSize, stats.work_units, true);
    const completedAt = runtime.checkTime("completion");
    stats.pruned_states = stats.merged_candidates + stats.beam_pruned_states;
    stats.elapsed_seconds = (completedAt - runtime.started) / 1000;
    return { bestModifier, bestProfit, stats };
  }

  function recipeCost(recipe, available) {
    return recipe.reduce((total, index) => total + available[index].priceCents * 100, 0);
  }

  function matchesEffectConstraints(state, constraints) {
    let matchedTargets = 0;
    for (const effect of state) {
      if (constraints.excludedSet.has(effect)) return false;
      if (constraints.targetSet.has(effect)) matchedTargets += 1;
      else if (constraints.matchMode === "exact") return false;
    }
    return matchedTargets === constraints.targetSet.size;
  }

  function preferEffectRecipe(candidate, current) {
    return (
      current === null ||
      candidate.costUnits < current.costUnits ||
      (candidate.costUnits === current.costUnits &&
        compareRecipes(candidate.recipe, current.recipe) < 0)
    );
  }

  function effectDistance(state, constraints) {
    let matched = 0;
    let forbidden = 0;
    let extra = 0;
    for (const effect of state) {
      if (constraints.targetSet.has(effect)) matched += 1;
      else if (constraints.excludedSet.has(effect)) forbidden += 1;
      else if (constraints.matchMode === "exact") extra += 1;
    }
    return {
      mismatch: constraints.targetSet.size - matched + forbidden + extra,
      missing: constraints.targetSet.size - matched,
      forbidden,
      extra,
    };
  }

  function finishEffectSearch(runtime, stats, maxSize, recipe) {
    runtime.progress("complete", maxSize, stats.work_units, true);
    const completedAt = runtime.checkTime("completion");
    stats.elapsed_seconds = (completedAt - runtime.started) / 1000;
    return { recipe, stats };
  }

  function exactEffectSearch(model, product, available, maxSize, constraints, options) {
    const runtime = makeRuntime(model, product, available, options);
    const stats = {
      mode: "exact",
      optimality_guaranteed: false,
      work_units: 0,
      candidates_by_depth: {},
      retained_states_by_depth: {},
      merged_candidates: 0,
    };

    function transition(state, ingredientIndex, depth) {
      runtime.checkTime("effect expansion");
      if (stats.work_units >= options.work_limit) {
        throw new SearchLimitExceeded("work_limit", "Exact effect search exceeded its work limit.");
      }
      stats.work_units += 1;
      if ((stats.work_units & 1023) === 0) {
        runtime.progress("effect expansion", depth, stats.work_units);
      }
      return runtime.transition(state, ingredientIndex);
    }

    if (matchesEffectConstraints(product.effects, constraints)) {
      const evaluation = runtime.evaluate(product.effects);
      stats.optimality_guaranteed = true;
      return finishEffectSearch(
        runtime,
        stats,
        maxSize,
        runtime.result(product.effects, [], 0, evaluation),
      );
    }

    let states = new Map([
      [stateKey(product.effects), { state: product.effects, recipe: [], costUnits: 0 }],
    ]);
    for (let depth = 1; depth <= maxSize && states.size > 0; depth += 1) {
      const nextStates = new Map();
      let frontierOverflow = false;
      let winner = null;
      stats.candidates_by_depth[depth] = 0;
      for (const representative of states.values()) {
        for (let ingredientIndex = 0; ingredientIndex < available.length; ingredientIndex += 1) {
          const ingredient = available[ingredientIndex];
          const nextState = transition(representative.state, ingredientIndex, depth);
          stats.candidates_by_depth[depth] += 1;
          const candidate = {
            state: nextState,
            recipe: [...representative.recipe, ingredientIndex],
            costUnits: representative.costUnits + ingredient.priceCents * 100,
          };
          if (
            matchesEffectConstraints(nextState, constraints) &&
            preferEffectRecipe(candidate, winner)
          ) {
            winner = candidate;
          }
          if (depth === maxSize) continue;
          if (
            stateKey(nextState) === stateKey(representative.state) &&
            ingredient.priceCents >= 0
          ) {
            continue;
          }
          const key = stateKey(nextState);
          const old = nextStates.get(key);
          if (old !== undefined) {
            stats.merged_candidates += 1;
            if (preferEffectRecipe(candidate, old)) nextStates.set(key, candidate);
          } else if (nextStates.size < options.frontier_limit) {
            nextStates.set(key, candidate);
          } else {
            frontierOverflow = true;
          }
        }
      }
      stats.retained_states_by_depth[depth] = nextStates.size;
      runtime.progress("effect frontier", depth, stats.work_units, true);
      if (winner !== null) {
        const evaluation = runtime.evaluate(winner.state);
        stats.optimality_guaranteed = true;
        return finishEffectSearch(
          runtime,
          stats,
          maxSize,
          runtime.result(winner.state, winner.recipe, winner.costUnits, evaluation),
        );
      }
      if (frontierOverflow) {
        throw new SearchLimitExceeded(
          "frontier_limit",
          "Exact effect search exceeded its frontier limit.",
        );
      }
      states = nextStates;
    }
    stats.optimality_guaranteed = true;
    return finishEffectSearch(runtime, stats, maxSize, null);
  }

  function fastEffectSearch(model, product, available, maxSize, constraints, options) {
    const runtime = makeRuntime(model, product, available, options);
    const stats = {
      mode: "approximate",
      optimality_guaranteed: false,
      work_units: 0,
      generated_candidates: 0,
      lookahead_candidates: 0,
      lookahead_transitions: 0,
      unique_states_by_depth: {},
      retained_states_by_depth: {},
      merged_candidates: 0,
      beam_pruned_states: 0,
    };

    function transition(state, ingredientIndex, speculative, depth) {
      runtime.checkTime(speculative ? "effect lookahead" : "effect expansion");
      if (stats.work_units >= options.work_limit) {
        throw new SearchLimitExceeded("work_limit", "Fast effect search exceeded its work limit.");
      }
      stats.work_units += 1;
      if (speculative) stats.lookahead_transitions += 1;
      runtime.progress(
        speculative ? "effect lookahead" : "effect expansion",
        depth,
        stats.work_units,
      );
      return runtime.transition(state, ingredientIndex);
    }

    function completed(candidate) {
      const evaluation = runtime.evaluate(candidate.state);
      return finishEffectSearch(
        runtime,
        stats,
        maxSize,
        runtime.result(candidate.state, candidate.recipe, candidate.costUnits, evaluation),
      );
    }

    if (matchesEffectConstraints(product.effects, constraints)) {
      return completed({ state: product.effects, recipe: [], costUnits: 0 });
    }

    let states = new Map([
      [stateKey(product.effects), { state: product.effects, recipe: [], costUnits: 0 }],
    ]);
    for (let depth = 1; depth <= maxSize && states.size > 0; depth += 1) {
      const nextStates = new Map();
      let winner = null;
      for (const representative of states.values()) {
        for (let ingredientIndex = 0; ingredientIndex < available.length; ingredientIndex += 1) {
          const ingredient = available[ingredientIndex];
          const nextState = transition(representative.state, ingredientIndex, false, depth);
          stats.generated_candidates += 1;
          const candidate = {
            state: nextState,
            recipe: [...representative.recipe, ingredientIndex],
            costUnits: representative.costUnits + ingredient.priceCents * 100,
          };
          if (
            matchesEffectConstraints(nextState, constraints) &&
            preferEffectRecipe(candidate, winner)
          ) {
            winner = candidate;
          }
          if (
            stateKey(nextState) === stateKey(representative.state) &&
            ingredient.priceCents >= 0
          ) {
            continue;
          }
          const key = stateKey(nextState);
          const old = nextStates.get(key);
          if (old === undefined || preferEffectRecipe(candidate, old)) {
            if (old !== undefined) stats.merged_candidates += 1;
            nextStates.set(key, candidate);
          } else {
            stats.merged_candidates += 1;
          }
        }
      }
      stats.unique_states_by_depth[depth] = nextStates.size;
      if (winner !== null) return completed(winner);

      if (nextStates.size > options.beam_width) {
        const forecasts = new Map();
        let lookaheadWinner = null;
        for (const [key, representative] of nextStates) {
          let forecast = {
            ...effectDistance(representative.state, constraints),
            recipe: representative.recipe,
            costUnits: representative.costUnits,
          };
          if (options.lookahead === 1 && depth < maxSize) {
            for (
              let ingredientIndex = 0;
              ingredientIndex < available.length;
              ingredientIndex += 1
            ) {
              const ingredient = available[ingredientIndex];
              const forecastState = transition(
                representative.state,
                ingredientIndex,
                true,
                depth + 1,
              );
              stats.lookahead_candidates += 1;
              const candidate = {
                state: forecastState,
                recipe: [...representative.recipe, ingredientIndex],
                costUnits: representative.costUnits + ingredient.priceCents * 100,
              };
              if (
                matchesEffectConstraints(forecastState, constraints) &&
                preferEffectRecipe(candidate, lookaheadWinner)
              ) {
                lookaheadWinner = candidate;
              }
              const distance = effectDistance(forecastState, constraints);
              if (
                distance.mismatch < forecast.mismatch ||
                (distance.mismatch === forecast.mismatch && distance.missing < forecast.missing) ||
                (distance.mismatch === forecast.mismatch &&
                  distance.missing === forecast.missing &&
                  distance.forbidden < forecast.forbidden) ||
                (distance.mismatch === forecast.mismatch &&
                  distance.missing === forecast.missing &&
                  distance.forbidden === forecast.forbidden &&
                  distance.extra < forecast.extra) ||
                (distance.mismatch === forecast.mismatch &&
                  distance.missing === forecast.missing &&
                  distance.forbidden === forecast.forbidden &&
                  distance.extra === forecast.extra &&
                  preferEffectRecipe(candidate, forecast))
              ) {
                forecast = {
                  ...distance,
                  recipe: candidate.recipe,
                  costUnits: candidate.costUnits,
                };
              }
            }
          }
          forecasts.set(key, forecast);
        }
        if (lookaheadWinner !== null) return completed(lookaheadWinner);
        const ranked = [...nextStates.entries()].sort((left, right) => {
          const leftForecast = forecasts.get(left[0]);
          const rightForecast = forecasts.get(right[0]);
          return (
            leftForecast.mismatch - rightForecast.mismatch ||
            leftForecast.missing - rightForecast.missing ||
            leftForecast.forbidden - rightForecast.forbidden ||
            leftForecast.extra - rightForecast.extra ||
            leftForecast.costUnits - rightForecast.costUnits ||
            compareRecipes(leftForecast.recipe, rightForecast.recipe) ||
            compareStates(left[1].state, right[1].state, model)
          );
        });
        stats.beam_pruned_states += nextStates.size - options.beam_width;
        states = new Map(ranked.slice(0, options.beam_width));
      } else {
        states = nextStates;
      }
      stats.retained_states_by_depth[depth] = states.size;
      runtime.progress("effect beam", depth, stats.work_units, true);
    }
    return finishEffectSearch(runtime, stats, maxSize, null);
  }

  function evaluateRecipe(catalog, request) {
    if (!isObject(request)) throw new TypeError("request must be an object");
    if (typeof request.product_name !== "string" || !request.product_name.trim()) {
      throw new TypeError("product_name must be a non-empty string");
    }
    if (!Array.isArray(request.substances)) {
      throw new TypeError("substances must be an array");
    }

    const model = validateCatalog(catalog, request.substances.length);
    const product = model.products.get(normalize(request.product_name));
    if (product === undefined) throw new TypeError("unknown product_name");
    const substanceIndexes = new Map(
      model.substances.map((substance, index) => [substance.name, index]),
    );
    // Resolve the complete recipe before applying any transitions. Invalid input
    // therefore cannot produce a partially evaluated result.
    const recipe = request.substances.map((name, index) => {
      if (typeof name !== "string" || !name.trim()) {
        throw new TypeError(`substances[${index}] must be a non-empty string`);
      }
      const ingredientIndex = substanceIndexes.get(normalize(name));
      if (ingredientIndex === undefined) {
        throw new TypeError(`unknown substance: ${name}`);
      }
      return ingredientIndex;
    });

    const runtime = makeRuntime(model, product, model.substances, {
      now: () => 0,
      time_limit_seconds: 1,
    });
    let state = product.effects;
    for (const ingredientIndex of recipe) {
      state = runtime.transition(state, ingredientIndex);
    }
    const evaluation = runtime.evaluate(state);
    return runtime.result(state, recipe, recipeCost(recipe, model.substances), evaluation);
  }

  function search(catalog, request, suppliedOptions = {}) {
    if (!isObject(request)) throw new TypeError("request must be an object");
    const size = request.combination_size;
    if (!Number.isSafeInteger(size) || size < 1) {
      throw new TypeError("combination_size must be a positive safe integer");
    }
    if (size > 16) {
      throw new SearchLimitExceeded("max_size", "Search sizes larger than 16 are unsupported.");
    }
    if (typeof request.product_name !== "string" || !request.product_name.trim()) {
      throw new TypeError("product_name must be a non-empty string");
    }
    if (
      typeof request.search_mode !== "string" ||
      !["exact", "fast"].includes(request.search_mode)
    ) {
      throw new TypeError("search_mode must be exact or fast");
    }
    const model = validateCatalog(catalog, size);
    const product = model.products.get(normalize(request.product_name));
    if (product === undefined) throw new TypeError("unknown product_name");
    let level;
    if (typeof request.level === "string") {
      level = model.levels.get(normalize(request.level));
      if (level === undefined) throw new TypeError("unknown level");
    } else {
      level = requireInteger(request.level, "level");
    }
    const available = model.substances.filter((substance) => substance.level <= level);
    if (available.length === 0) throw new TypeError("no substances are available at this level");
    // Stream two final layers for deeper exact searches instead of retaining the
    // much larger penultimate frontier. Explicit test/tool options still win.
    const defaults =
      request.search_mode === "exact"
        ? { ...EXACT_DEFAULTS, tail_depth: size >= 7 ? 2 : 1 }
        : FAST_DEFAULTS;
    const options = { ...defaults, ...suppliedOptions };
    requireInteger(options.work_limit, "work_limit", 1);
    requirePositiveNumber(options.time_limit_seconds, "time_limit_seconds");
    if (request.search_mode === "exact") {
      if (![1, 2].includes(options.tail_depth)) throw new TypeError("tail_depth must be 1 or 2");
      requireInteger(options.cache_limit, "cache_limit");
      requireInteger(options.frontier_limit, "frontier_limit", 1);
    } else {
      requireInteger(options.beam_width, "beam_width", 1);
      if (![0, 1].includes(options.lookahead)) throw new TypeError("lookahead must be 0 or 1");
    }
    const outcome =
      request.search_mode === "exact"
        ? exactSearch(model, product, available, size, options)
        : fastSearch(model, product, available, size, options);
    return {
      search: {
        mode: request.search_mode,
        status: request.search_mode === "exact" ? "optimal" : "approximate",
        optimality_proven: request.search_mode === "exact" && outcome.stats.optimality_guaranteed,
      },
      best_modifier: outcome.bestModifier,
      best_profit: outcome.bestProfit,
      stats: outcome.stats,
    };
  }

  function searchEffects(catalog, request, suppliedOptions = {}) {
    if (!isObject(request)) throw new TypeError("request must be an object");
    const size = request.combination_size;
    if (!Number.isSafeInteger(size) || size < 0) {
      throw new TypeError("combination_size must be a non-negative safe integer");
    }
    if (size > 16) {
      throw new SearchLimitExceeded("max_size", "Search sizes larger than 16 are unsupported.");
    }
    if (typeof request.product_name !== "string" || !request.product_name.trim()) {
      throw new TypeError("product_name must be a non-empty string");
    }
    if (
      typeof request.search_mode !== "string" ||
      !["exact", "fast"].includes(request.search_mode)
    ) {
      throw new TypeError("search_mode must be exact or fast");
    }
    if (!Array.isArray(request.target_effects)) {
      throw new TypeError("target_effects must be an array");
    }
    const matchMode = request.match_mode === undefined ? "exact" : request.match_mode;
    if (!["exact", "contains"].includes(matchMode)) {
      throw new TypeError("match_mode must be exact or contains");
    }
    const excludedEffects = request.excluded_effects === undefined ? [] : request.excluded_effects;
    if (!Array.isArray(excludedEffects)) {
      throw new TypeError("excluded_effects must be an array");
    }
    if (
      request.target_effects.length === 0 &&
      (matchMode !== "contains" || excludedEffects.length === 0)
    ) {
      throw new TypeError(
        "target_effects may be empty only for contains mode with excluded effects",
      );
    }

    const model = validateCatalog(catalog, size);
    const product = model.products.get(normalize(request.product_name));
    if (product === undefined) throw new TypeError("unknown product_name");
    let level;
    if (typeof request.level === "string") {
      level = model.levels.get(normalize(request.level));
      if (level === undefined) throw new TypeError("unknown level");
    } else {
      level = requireInteger(request.level, "level");
    }
    const targetNames = [];
    const targetSet = new Set();
    for (let index = 0; index < request.target_effects.length; index += 1) {
      const name = request.target_effects[index];
      if (typeof name !== "string" || !name.trim()) {
        throw new TypeError(`target_effects[${index}] must be a non-empty string`);
      }
      const normalized = normalize(name);
      const effectIndex = model.effectIndex.get(normalized);
      if (effectIndex === undefined) throw new TypeError(`unknown target effect: ${name}`);
      if (targetSet.has(effectIndex)) throw new TypeError(`duplicate target effect: ${name}`);
      targetSet.add(effectIndex);
      targetNames.push(model.effects[effectIndex].name);
    }
    const excludedNames = [];
    const excludedSet = new Set();
    for (let index = 0; index < excludedEffects.length; index += 1) {
      const name = excludedEffects[index];
      if (typeof name !== "string" || !name.trim()) {
        throw new TypeError(`excluded_effects[${index}] must be a non-empty string`);
      }
      const normalized = normalize(name);
      const effectIndex = model.effectIndex.get(normalized);
      if (effectIndex === undefined) throw new TypeError(`unknown excluded effect: ${name}`);
      if (excludedSet.has(effectIndex)) throw new TypeError(`duplicate excluded effect: ${name}`);
      if (targetSet.has(effectIndex)) {
        throw new TypeError(`effect cannot be both targeted and excluded: ${name}`);
      }
      excludedSet.add(effectIndex);
      excludedNames.push(model.effects[effectIndex].name);
    }
    const constraints = { matchMode, targetSet, excludedSet };

    const available = model.substances.filter((substance) => substance.level <= level);
    const defaults = request.search_mode === "exact" ? EXACT_DEFAULTS : FAST_DEFAULTS;
    const options = { ...defaults, ...suppliedOptions };
    requireInteger(options.work_limit, "work_limit", 1);
    requirePositiveNumber(options.time_limit_seconds, "time_limit_seconds");
    if (request.search_mode === "exact") {
      requireInteger(options.frontier_limit, "frontier_limit", 1);
    } else {
      requireInteger(options.beam_width, "beam_width", 1);
      if (![0, 1].includes(options.lookahead)) throw new TypeError("lookahead must be 0 or 1");
    }
    const outcome =
      request.search_mode === "exact"
        ? exactEffectSearch(model, product, available, size, constraints, options)
        : fastEffectSearch(model, product, available, size, constraints, options);
    const found = outcome.recipe !== null;
    const exact = request.search_mode === "exact";
    return {
      search: {
        mode: request.search_mode,
        status: found ? (exact ? "optimal" : "approximate") : "not_found",
        optimality_proven: exact && outcome.stats.optimality_guaranteed,
      },
      recipe: outcome.recipe,
      match_mode: matchMode,
      target_effects: targetNames,
      excluded_effects: excludedNames,
      stats: outcome.stats,
    };
  }

  return {
    search,
    searchEffects,
    evaluateRecipe,
    SearchLimitExceeded,
    cpythonFloatSum,
    validateCatalog,
  };
});

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
    if (winner === null || recipe.length !== winner.length) {
      return winner === null || recipe.length > winner.length;
    }
    return compareRecipes(recipe, winner) < 0;
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
      const profitUnits = evaluation.sellUnits - cheapCost;
      if (
        evaluation.modifier > bestModifierValue ||
        (evaluation.modifier === bestModifierValue && preferred(early, bestModifierRecipe))
      ) {
        bestModifierValue = evaluation.modifier;
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
            if (compareRecipes(early, old.early) < 0) {
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
        if (!finalLayer) streamTail(next, remaining - 1);
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
      const profitUnits = evaluation.sellUnits - profitCost;
      if (
        evaluation.modifier > bestModifierValue ||
        (evaluation.modifier === bestModifierValue && preferred(modifierRecipe, bestModifierRecipe))
      ) {
        bestModifierValue = evaluation.modifier;
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
      return { modifier: evaluation.modifier, profitUnits };
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
          const old = nextStates.get(key);
          if (old === undefined) {
            nextStates.set(key, { state: nextState, early, cheap, cheapCost });
          } else {
            stats.merged_candidates += 1;
            if (compareRecipes(early, old.early) < 0) old.early = early;
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
      stats.unique_states_by_depth[depth] = nextStates.size;
      if (nextStates.size > options.beam_width) {
        const horizon = Math.min(options.lookahead, maxSize - depth);
        const forecasts = new Map();
        for (const [key, representative] of nextStates) {
          const current = runtime.evaluate(representative.state);
          const forecast = {
            modifier: current.modifier,
            modifierRecipe: representative.early,
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
                    preferred(completedEarly, forecast.modifierRecipe))
                ) {
                  forecast.modifier = completed.modifier;
                  forecast.modifierRecipe = completedEarly;
                }
                if (
                  completed.profitUnits > forecast.profitUnits ||
                  (completed.profitUnits === forecast.profitUnits &&
                    preferred(completedCheap, forecast.profitRecipe))
                ) {
                  forecast.profitUnits = completed.profitUnits;
                  forecast.profitRecipe = completedCheap;
                }
                following.push({
                  state: completedState,
                  early: completedEarly,
                  cheap: completedCheap,
                  cheapCost: completedCost,
                });
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
            rightForecast.profitRecipe.length - leftForecast.profitRecipe.length ||
            compareRecipes(leftForecast.profitRecipe, rightForecast.profitRecipe) ||
            compareStates(left[1].state, right[1].state, model)
          );
        });
        const modifierRanked = entries.slice().sort((left, right) => {
          const leftForecast = forecasts.get(left[0]);
          const rightForecast = forecasts.get(right[0]);
          return (
            rightForecast.modifier - leftForecast.modifier ||
            rightForecast.modifierRecipe.length - leftForecast.modifierRecipe.length ||
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

  return { search, SearchLimitExceeded, cpythonFloatSum, validateCatalog };
});

"""Bounded-memory exact combination search."""

import math
from collections import OrderedDict
from collections.abc import Callable
from decimal import Decimal
from time import perf_counter

from src.lookup import lookup
from src.util.models import CombinationResult


class SearchLimitExceeded(RuntimeError):
    """Raised when a complete exact result cannot be produced within configured limits."""


def _normalized(value: str) -> str:
    return value.strip().lower().replace(" ", "_")


def search(
    product_name: str,
    max_level: int | str,
    max_size: int,
    *,
    price_from_effects: Callable[[dict[str, float]], Decimal],
    tail_depth: int = 1,
    cache_limit: int = 32_768,
    work_limit: int = 20_000_000,
    frontier_limit: int = 300_000,
    time_limit_seconds: float = 90.0,
) -> tuple[CombinationResult, CombinationResult, dict]:
    """Return exact winners, or raise without returning partial search results."""
    if isinstance(max_size, bool) or not isinstance(max_size, int) or max_size < 1:
        raise ValueError("max_size must be a positive integer")
    if max_size > 16:
        raise SearchLimitExceeded("Exact searches larger than 16 ingredients are not supported.")
    if not isinstance(product_name, str) or not product_name.strip():
        raise ValueError("product_name must be a non-empty string")
    if not callable(price_from_effects):
        raise TypeError("price_from_effects must be callable")
    if isinstance(tail_depth, bool) or not isinstance(tail_depth, int) or tail_depth not in (1, 2):
        raise ValueError("tail_depth must be 1 or 2")
    for name, value, minimum in (
        ("cache_limit", cache_limit, 0),
        ("work_limit", work_limit, 1),
        ("frontier_limit", frontier_limit, 1),
    ):
        if isinstance(value, bool) or not isinstance(value, int) or value < minimum:
            raise ValueError(f"{name} must be an integer of at least {minimum}")
    if (
        isinstance(time_limit_seconds, bool)
        or not isinstance(time_limit_seconds, (int, float))
        or not math.isfinite(time_limit_seconds)
        or time_limit_seconds <= 0
    ):
        raise ValueError("time_limit_seconds must be a positive finite number")

    product_key = _normalized(product_name)
    product = next((item for item in lookup.products if item.name == product_key), None)
    if product is None:
        raise ValueError(f"Product '{product_key}' not found!")
    if isinstance(max_level, str):
        level_key = _normalized(max_level)
        level = lookup.level_name_to_int.get(level_key)
        if level is None:
            raise ValueError(f"Invalid level name: {level_key}")
    elif isinstance(max_level, bool) or not isinstance(max_level, int):
        raise TypeError("max_level must be an integer or valid level name")
    else:
        level = max_level
    if level < 0:
        raise ValueError("max_level must be non-negative")

    available = tuple(item for item in lookup.substances if item.level <= level)
    if not available:
        raise ValueError("No substances are available for the given level.")
    ingredients = tuple(
        (
            item.name,
            item.price,
            tuple(item.side_effect_replacements.items()),
            item.resulting_effect,
        )
        for item in available
    )
    effect_values = {effect.name: effect.modificator for effect in lookup.effects}
    started = perf_counter()
    transition_cache: OrderedDict[tuple[tuple[str, ...], int], tuple[str, ...]] = OrderedDict()
    evaluation_cache: OrderedDict[tuple[str, ...], tuple[float, Decimal]] = OrderedDict()
    stats = {
        "mode": "exact",
        "optimality_guaranteed": False,
        "available_substances": len(ingredients),
        "max_size": max_size,
        "tail_depth": min(tail_depth, max_size),
        "cache_limit": cache_limit,
        "work_limit": work_limit,
        "frontier_limit": frontier_limit,
        "time_limit_seconds": float(time_limit_seconds),
        "work_units": 0,
        "candidates_by_depth": {depth: 0 for depth in range(1, max_size + 1)},
        "retained_states_by_depth": {},
        "merged_prefix_candidates": 0,
        "transition_cache_hits": 0,
        "transition_cache_misses": 0,
        "transition_cache_evictions": 0,
        "evaluation_cache_hits": 0,
        "evaluation_cache_misses": 0,
        "evaluation_cache_evictions": 0,
        "uncached_final_transitions": 0,
        "uncached_final_evaluations": 0,
    }

    def check_time() -> None:
        if perf_counter() - started > time_limit_seconds:
            raise SearchLimitExceeded(
                f"Exact search exceeded its {time_limit_seconds:g}s time limit."
            )

    def transition(
        state: tuple[str, ...], ingredient_index: int, *, use_cache: bool
    ) -> tuple[str, ...]:
        if stats["work_units"] >= work_limit:
            raise SearchLimitExceeded(f"Exact search exceeded its {work_limit:,} work limit.")
        stats["work_units"] += 1
        if stats["work_units"] & 1023 == 0:
            check_time()
        key = state, ingredient_index
        if use_cache and key in transition_cache:
            stats["transition_cache_hits"] += 1
            return transition_cache[key]
        if use_cache:
            stats["transition_cache_misses"] += 1
        else:
            stats["uncached_final_transitions"] += 1

        _, _, replacements, resulting_effect = ingredients[ingredient_index]
        active = dict.fromkeys(state)
        replacement_effects = []
        for original, replacement in replacements:
            if original in active:
                active.pop(original)
                replacement_effects.append(replacement)
        for replacement in replacement_effects:
            active[replacement] = None
        active[resulting_effect] = None
        result = tuple(active)
        if use_cache and cache_limit:
            if len(transition_cache) >= cache_limit:
                transition_cache.popitem(last=False)
                stats["transition_cache_evictions"] += 1
            transition_cache[key] = result
        return result

    def evaluate(state: tuple[str, ...], *, use_cache: bool) -> tuple[float, Decimal]:
        if use_cache and state in evaluation_cache:
            stats["evaluation_cache_hits"] += 1
            return evaluation_cache[state]
        if use_cache:
            stats["evaluation_cache_misses"] += 1
        else:
            stats["uncached_final_evaluations"] += 1
        active_effects = {effect: effect_values.get(effect, 0.0) for effect in state}
        modifier = sum(active_effects.values())
        sell_price = price_from_effects(active_effects)
        if not isinstance(sell_price, Decimal):
            raise TypeError("price_from_effects must return Decimal")
        result = modifier, sell_price
        if use_cache and cache_limit:
            if len(evaluation_cache) >= cache_limit:
                evaluation_cache.popitem(last=False)
                stats["evaluation_cache_evictions"] += 1
            evaluation_cache[state] = result
        return result

    def preferred(recipe: tuple[int, ...], winner: tuple[int, ...] | None) -> bool:
        return winner is None or (len(recipe), recipe) < (len(winner), winner)

    best_modifier: CombinationResult | None = None
    best_modifier_value = float("-inf")
    best_modifier_profit = Decimal("-Infinity")
    best_modifier_recipe: tuple[int, ...] | None = None
    best_profit: CombinationResult | None = None
    best_profit_value = Decimal("-Infinity")
    best_profit_recipe: tuple[int, ...] | None = None

    def consider(
        state: tuple[str, ...],
        earliest_recipe: tuple[int, ...],
        earliest_cost: Decimal,
        cheapest_recipe: tuple[int, ...],
        cheapest_cost: Decimal,
        *,
        use_cache: bool,
    ) -> None:
        nonlocal best_modifier, best_modifier_value, best_modifier_profit, best_modifier_recipe
        nonlocal best_profit, best_profit_value, best_profit_recipe
        modifier, sell_price = evaluate(state, use_cache=use_cache)
        modifier_profit = sell_price - earliest_cost
        profit = sell_price - cheapest_cost
        if modifier > best_modifier_value or (
            modifier == best_modifier_value
            and (
                modifier_profit > best_modifier_profit
                or (
                    modifier_profit == best_modifier_profit
                    and preferred(earliest_recipe, best_modifier_recipe)
                )
            )
        ):
            best_modifier_value = modifier
            best_modifier_profit = modifier_profit
            best_modifier_recipe = earliest_recipe
            best_modifier = CombinationResult(
                sell_price,
                earliest_cost,
                modifier,
                [ingredients[index][0] for index in earliest_recipe],
                list(state),
            )
        if profit > best_profit_value or (
            profit == best_profit_value and preferred(cheapest_recipe, best_profit_recipe)
        ):
            best_profit_value = profit
            best_profit_recipe = cheapest_recipe
            best_profit = CombinationResult(
                sell_price,
                cheapest_cost,
                modifier,
                [ingredients[index][0] for index in cheapest_recipe],
                list(state),
            )

    # state -> (earliest recipe/cost, cheapest recipe/cost)
    states: dict[tuple[str, ...], tuple[tuple[int, ...], Decimal, tuple[int, ...], Decimal]] = {
        tuple(dict.fromkeys(product.effects or ())): ((), Decimal(0), (), Decimal(0))
    }
    prefix_depth = max_size - min(tail_depth, max_size)
    for depth in range(1, prefix_depth + 1):
        next_states: dict[
            tuple[str, ...], tuple[tuple[int, ...], Decimal, tuple[int, ...], Decimal]
        ] = {}
        for state, (earliest, earliest_cost, cheapest, cheapest_cost) in states.items():
            for ingredient_index, (_, price, _, _) in enumerate(ingredients):
                next_state = transition(state, ingredient_index, use_cache=True)
                stats["candidates_by_depth"][depth] += 1
                new_earliest = earliest + (ingredient_index,)
                new_earliest_cost = earliest_cost + price
                new_cheapest = cheapest + (ingredient_index,)
                new_cheapest_cost = cheapest_cost + price
                consider(
                    next_state,
                    new_earliest,
                    new_earliest_cost,
                    new_cheapest,
                    new_cheapest_cost,
                    use_cache=True,
                )
                existing = next_states.get(next_state)
                if next_state == state and price >= 0:
                    continue
                if existing is None:
                    if len(next_states) >= frontier_limit:
                        raise SearchLimitExceeded(
                            f"Exact prefix frontier exceeded {frontier_limit:,} states "
                            f"while building depth {depth}."
                        )
                    next_states[next_state] = (
                        new_earliest,
                        new_earliest_cost,
                        new_cheapest,
                        new_cheapest_cost,
                    )
                    continue
                stats["merged_prefix_candidates"] += 1
                old_earliest, old_earliest_cost, old_cheapest, old_cheapest_cost = existing
                if new_earliest_cost < old_earliest_cost or (
                    new_earliest_cost == old_earliest_cost and new_earliest < old_earliest
                ):
                    old_earliest, old_earliest_cost = new_earliest, new_earliest_cost
                if new_cheapest_cost < old_cheapest_cost or (
                    new_cheapest_cost == old_cheapest_cost and new_cheapest < old_cheapest
                ):
                    old_cheapest, old_cheapest_cost = new_cheapest, new_cheapest_cost
                next_states[next_state] = (
                    old_earliest,
                    old_earliest_cost,
                    old_cheapest,
                    old_cheapest_cost,
                )
        states = next_states
        stats["retained_states_by_depth"][depth] = len(states)

    remaining_depth = max_size - prefix_depth

    def stream_tail(
        state: tuple[str, ...],
        earliest: tuple[int, ...],
        earliest_cost: Decimal,
        cheapest: tuple[int, ...],
        cheapest_cost: Decimal,
        remaining: int,
    ) -> None:
        depth = len(earliest) + 1
        final_layer = remaining == 1
        for ingredient_index, (_, price, _, _) in enumerate(ingredients):
            next_state = transition(state, ingredient_index, use_cache=not final_layer)
            stats["candidates_by_depth"][depth] += 1
            new_earliest = earliest + (ingredient_index,)
            new_cheapest = cheapest + (ingredient_index,)
            new_earliest_cost = earliest_cost + price
            new_cheapest_cost = cheapest_cost + price
            consider(
                next_state,
                new_earliest,
                new_earliest_cost,
                new_cheapest,
                new_cheapest_cost,
                use_cache=not final_layer,
            )
            if not final_layer and (next_state != state or price < 0):
                stream_tail(
                    next_state,
                    new_earliest,
                    new_earliest_cost,
                    new_cheapest,
                    new_cheapest_cost,
                    remaining - 1,
                )

    for state, representatives in states.items():
        stream_tail(state, *representatives, remaining_depth)
    assert best_modifier is not None and best_profit is not None
    stats["frontier_depth"] = prefix_depth
    stats["frontier_states"] = len(states)
    stats["transition_cache_entries"] = len(transition_cache)
    stats["evaluation_cache_entries"] = len(evaluation_cache)
    elapsed = perf_counter() - started
    if elapsed > time_limit_seconds:
        raise SearchLimitExceeded(f"Exact search exceeded its {time_limit_seconds:g}s time limit.")
    stats["elapsed_seconds"] = elapsed
    stats["optimality_guaranteed"] = True
    return best_modifier, best_profit, stats

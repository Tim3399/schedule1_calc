"""Experimental bounded search with deterministic short lookahead.

This module is deliberately separate from the application.  Passing ``None`` as
``beam_width`` performs the merged-state exact traversal or raises at a resource
limit.  A finite beam uses one or more speculative layers to rank states for both
profit and modifier, without claiming optimality.
"""

from decimal import Decimal
from math import isfinite
from time import perf_counter

from src.lookup import lookup
from src.util.models import CombinationResult


class SearchLimitExceeded(RuntimeError):
    """Raised instead of returning a partial result after a search limit is reached."""


State = tuple[str, ...]
Recipe = tuple[int, ...]
Representative = tuple[Recipe, Recipe, Decimal]


def _normalized(value: str) -> str:
    return value.strip().lower().replace(" ", "_")


def search(
    product_name: str,
    max_level: int | str,
    max_size: int,
    *,
    beam_width: int | None = 256,
    lookahead: int = 1,
    expansion_limit: int = 2_000_000,
    time_limit_seconds: float = 15.0,
) -> tuple[CombinationResult, CombinationResult, dict]:
    """Find strong modifier and profit recipes within explicit resource limits.

    The finite beam is split between states with the best achievable profit and
    modifier during the requested lookahead.  Equivalent ordered effect states keep
    the same earliest and cheapest representatives as ``search_runtime``.
    """
    if not isinstance(product_name, str) or not product_name.strip():
        raise ValueError("product_name must be a non-empty string")
    if isinstance(max_size, bool) or not isinstance(max_size, int) or max_size < 1:
        raise ValueError("max_size must be a positive integer")
    if beam_width is not None and (
        isinstance(beam_width, bool) or not isinstance(beam_width, int) or beam_width < 1
    ):
        raise ValueError("beam_width must be a positive integer or None")
    if isinstance(lookahead, bool) or not isinstance(lookahead, int) or lookahead < 0:
        raise ValueError("lookahead must be a non-negative integer")
    if (
        isinstance(expansion_limit, bool)
        or not isinstance(expansion_limit, int)
        or expansion_limit < 1
    ):
        raise ValueError("expansion_limit must be a positive integer")
    if isinstance(time_limit_seconds, bool) or not isinstance(time_limit_seconds, (int, float)):
        raise TypeError("time_limit_seconds must be a positive number")
    if time_limit_seconds <= 0 or not isfinite(time_limit_seconds):
        raise ValueError("time_limit_seconds must be a positive number")

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

    effect_values = {effect.name: effect.modificator for effect in lookup.effects}
    initial_effects = tuple(dict.fromkeys(product.effects or ()))
    base_price = float(product.base_sell_price)
    started = perf_counter()
    deadline = started + float(time_limit_seconds)
    stats = {
        "mode": "exact" if beam_width is None else "lookahead_beam",
        "exact": False,
        "beam_width": beam_width,
        "lookahead": lookahead,
        "available_substances": len(available),
        "max_size": max_size,
        "expansion_limit": expansion_limit,
        "time_limit_seconds": float(time_limit_seconds),
        "generated_candidates": 0,
        "expanded_transitions": 0,
        "lookahead_candidates": 0,
        "lookahead_transitions": 0,
        "unique_states_by_depth": {},
        "retained_states_by_depth": {},
        "merged_candidates": 0,
        "beam_pruned_states": 0,
        "pruned_states": 0,
    }

    def check_time(context: str) -> None:
        if perf_counter() >= deadline:
            raise SearchLimitExceeded(
                f"Search exceeded the {time_limit_seconds:g}s time limit during {context}."
            )

    def transition(state: State, ingredient_index: int, *, speculative: bool) -> State:
        check_time("lookahead" if speculative else "expansion")
        if stats["expanded_transitions"] >= expansion_limit:
            raise SearchLimitExceeded(f"Search exceeded {expansion_limit:,} transition expansions.")
        stats["expanded_transitions"] += 1
        if speculative:
            stats["lookahead_transitions"] += 1

        ingredient = available[ingredient_index]
        active = dict.fromkeys(state)
        replacements = []
        for original, replacement in ingredient.side_effect_replacements.items():
            if original in active:
                active.pop(original)
                replacements.append(replacement)
        for replacement in replacements:
            active[replacement] = None
        active[ingredient.resulting_effect] = None
        return tuple(active)

    def evaluate(state: State) -> tuple[float, Decimal]:
        modifier = sum(effect_values.get(effect, 0.0) for effect in state)
        return modifier, Decimal(base_price * (1 + modifier))

    def recipe_cost(recipe: Recipe) -> Decimal:
        return sum((available[index].price for index in recipe), Decimal(0))

    def result(state: State, recipe: Recipe, cost: Decimal) -> CombinationResult:
        modifier, sell_price = evaluate(state)
        return CombinationResult(
            sell_price=sell_price,
            substance_cost=cost,
            modifier=modifier,
            substances=[available[index].name for index in recipe],
            effects=list(state),
        )

    def preferred(recipe: Recipe, current: Recipe | None) -> bool:
        return (
            current is None
            or len(recipe) > len(current)
            or (len(recipe) == len(current) and recipe < current)
        )

    best_modifier: CombinationResult | None = None
    best_modifier_value = float("-inf")
    best_modifier_recipe: Recipe | None = None
    best_profit: CombinationResult | None = None
    best_profit_value = Decimal("-Infinity")
    best_profit_recipe: Recipe | None = None

    def record(
        state: State,
        modifier_recipe: Recipe,
        profit_recipe: Recipe,
        modifier_cost: Decimal,
        profit_cost: Decimal,
    ) -> tuple[float, Decimal]:
        nonlocal best_modifier, best_modifier_value, best_modifier_recipe
        nonlocal best_profit, best_profit_value, best_profit_recipe

        modifier, sell_price = evaluate(state)
        profit = sell_price - profit_cost
        if modifier > best_modifier_value or (
            modifier == best_modifier_value and preferred(modifier_recipe, best_modifier_recipe)
        ):
            best_modifier_value = modifier
            best_modifier_recipe = modifier_recipe
            best_modifier = result(state, modifier_recipe, modifier_cost)
        if profit > best_profit_value or (
            profit == best_profit_value and preferred(profit_recipe, best_profit_recipe)
        ):
            best_profit_value = profit
            best_profit_recipe = profit_recipe
            best_profit = result(state, profit_recipe, profit_cost)
        return modifier, profit

    # state -> (earliest recipe, cheapest recipe, cheapest cost)
    states: dict[State, Representative] = {initial_effects: ((), (), Decimal(0))}
    for depth in range(1, max_size + 1):
        check_time(f"depth {depth}")
        next_states: dict[State, Representative] = {}
        for state, (earliest_recipe, cheapest_recipe, cheapest_cost) in states.items():
            for ingredient_index, ingredient in enumerate(available):
                next_state = transition(state, ingredient_index, speculative=False)
                stats["generated_candidates"] += 1
                modifier_recipe = earliest_recipe + (ingredient_index,)
                profit_recipe = cheapest_recipe + (ingredient_index,)
                profit_cost = cheapest_cost + ingredient.price
                record(
                    next_state,
                    modifier_recipe,
                    profit_recipe,
                    recipe_cost(modifier_recipe),
                    profit_cost,
                )

                existing = next_states.get(next_state)
                if existing is None:
                    next_states[next_state] = (modifier_recipe, profit_recipe, profit_cost)
                    continue
                stats["merged_candidates"] += 1
                old_earliest, old_cheapest, old_cost = existing
                old_earliest = min(old_earliest, modifier_recipe)
                if profit_cost < old_cost or (
                    profit_cost == old_cost and profit_recipe < old_cheapest
                ):
                    old_cheapest, old_cost = profit_recipe, profit_cost
                next_states[next_state] = (old_earliest, old_cheapest, old_cost)

        if beam_width is not None and len(next_states) > beam_width:
            stats["unique_states_by_depth"][depth] = len(next_states)
            horizon = min(lookahead, max_size - depth)
            forecasts: dict[State, tuple[float, Recipe, Decimal, Recipe]] = {}
            for state, (earliest_recipe, cheapest_recipe, cheapest_cost) in next_states.items():
                modifier, sell_price = evaluate(state)
                forecasts[state] = (
                    modifier,
                    earliest_recipe,
                    sell_price - cheapest_cost,
                    cheapest_recipe,
                )
                frontier = [(state, earliest_recipe, cheapest_recipe, cheapest_cost)]
                for _ in range(horizon):
                    following = []
                    for (
                        forecast_state,
                        forecast_earliest,
                        forecast_cheapest,
                        forecast_cost,
                    ) in frontier:
                        for ingredient_index, ingredient in enumerate(available):
                            completed_state = transition(
                                forecast_state, ingredient_index, speculative=True
                            )
                            stats["lookahead_candidates"] += 1
                            completed_earliest = forecast_earliest + (ingredient_index,)
                            completed_cheapest = forecast_cheapest + (ingredient_index,)
                            completed_cost = forecast_cost + ingredient.price
                            completed_modifier, completed_profit = record(
                                completed_state,
                                completed_earliest,
                                completed_cheapest,
                                recipe_cost(completed_earliest),
                                completed_cost,
                            )
                            best_mod, mod_recipe, best_prof, prof_recipe = forecasts[state]
                            if completed_modifier > best_mod or (
                                completed_modifier == best_mod
                                and preferred(completed_earliest, mod_recipe)
                            ):
                                best_mod, mod_recipe = completed_modifier, completed_earliest
                            if completed_profit > best_prof or (
                                completed_profit == best_prof
                                and preferred(completed_cheapest, prof_recipe)
                            ):
                                best_prof, prof_recipe = completed_profit, completed_cheapest
                            forecasts[state] = (best_mod, mod_recipe, best_prof, prof_recipe)
                            following.append(
                                (
                                    completed_state,
                                    completed_earliest,
                                    completed_cheapest,
                                    completed_cost,
                                )
                            )
                    frontier = following

            check_time("beam ranking")
            profit_ranked = sorted(
                next_states,
                key=lambda state: (
                    -forecasts[state][2],
                    -len(forecasts[state][3]),
                    forecasts[state][3],
                    state,
                ),
            )
            modifier_ranked = sorted(
                next_states,
                key=lambda state: (
                    -forecasts[state][0],
                    -len(forecasts[state][1]),
                    forecasts[state][1],
                    state,
                ),
            )
            selected: list[State] = []
            selected_set: set[State] = set()
            profit_slots = (beam_width + 1) // 2
            for ranked_state in profit_ranked[:profit_slots]:
                selected.append(ranked_state)
                selected_set.add(ranked_state)
            for ranked_state in modifier_ranked:
                if len(selected) == beam_width:
                    break
                if ranked_state not in selected_set:
                    selected.append(ranked_state)
                    selected_set.add(ranked_state)

            removed = len(next_states) - len(selected)
            next_states = {state: next_states[state] for state in selected}
            stats["beam_pruned_states"] += removed
        else:
            stats["unique_states_by_depth"][depth] = len(next_states)

        states = next_states
        stats["retained_states_by_depth"][depth] = len(states)

    check_time("completion")
    stats["pruned_states"] = stats["merged_candidates"] + stats["beam_pruned_states"]
    stats["exact"] = beam_width is None
    stats["elapsed_seconds"] = perf_counter() - started
    assert best_modifier is not None and best_profit is not None
    return best_modifier, best_profit, stats

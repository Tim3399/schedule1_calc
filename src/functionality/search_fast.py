"""Approximate bounded beam search with deterministic short lookahead."""

from collections.abc import Callable
from decimal import Decimal
from math import isfinite
from time import perf_counter

from src.lookup import lookup
from src.util.models import CombinationResult


class SearchLimitExceeded(RuntimeError):
    """Raised instead of returning partial results after a search limit is reached."""


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
    price_from_effects: Callable[[dict[str, float]], Decimal],
    beam_width: int = 1_024,
    lookahead: int = 1,
    work_limit: int = 2_000_000,
    time_limit_seconds: float = 15.0,
) -> tuple[CombinationResult, CombinationResult, dict]:
    """Find strong recipes within explicit limits, without claiming optimality."""
    if isinstance(max_size, bool) or not isinstance(max_size, int) or max_size < 1:
        raise ValueError("max_size must be a positive integer")
    if max_size > 16:
        raise SearchLimitExceeded(
            "Approximate searches larger than 16 ingredients are unsupported."
        )
    if not isinstance(product_name, str) or not product_name.strip():
        raise ValueError("product_name must be a non-empty string")
    if not callable(price_from_effects):
        raise TypeError("price_from_effects must be callable")
    if isinstance(beam_width, bool) or not isinstance(beam_width, int) or beam_width < 1:
        raise ValueError("beam_width must be a positive integer")
    if isinstance(lookahead, bool) or not isinstance(lookahead, int) or lookahead not in (0, 1):
        raise ValueError("lookahead must be 0 or 1")
    if isinstance(work_limit, bool) or not isinstance(work_limit, int) or work_limit < 1:
        raise ValueError("work_limit must be a positive integer")
    if isinstance(time_limit_seconds, bool) or not isinstance(time_limit_seconds, (int, float)):
        raise TypeError("time_limit_seconds must be a positive number")
    if time_limit_seconds <= 0 or not isfinite(time_limit_seconds):
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
    effect_values = {effect.name: effect.modificator for effect in lookup.effects}
    initial_effects = tuple(dict.fromkeys(product.effects or ()))
    started = perf_counter()
    deadline = started + float(time_limit_seconds)
    stats = {
        "mode": "approximate",
        "optimality_guaranteed": False,
        "beam_width": beam_width,
        "lookahead": lookahead,
        "available_substances": len(available),
        "max_size": max_size,
        "work_limit": work_limit,
        "time_limit_seconds": float(time_limit_seconds),
        "generated_candidates": 0,
        "work_units": 0,
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
        if stats["work_units"] >= work_limit:
            raise SearchLimitExceeded(f"Search exceeded {work_limit:,} transition work units.")
        stats["work_units"] += 1
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
        active_effects = {effect: effect_values.get(effect, 0.0) for effect in state}
        modifier = sum(active_effects.values())
        sell_price = price_from_effects(active_effects)
        if not isinstance(sell_price, Decimal):
            raise TypeError("price_from_effects must return Decimal")
        return modifier, sell_price

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
        return current is None or (len(recipe), recipe) < (len(current), current)

    best_modifier: CombinationResult | None = None
    best_modifier_value = float("-inf")
    best_modifier_profit = Decimal("-Infinity")
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
    ) -> tuple[float, Decimal, Decimal]:
        nonlocal best_modifier, best_modifier_value, best_modifier_profit, best_modifier_recipe
        nonlocal best_profit, best_profit_value, best_profit_recipe
        modifier, sell_price = evaluate(state)
        modifier_profit = sell_price - modifier_cost
        profit = sell_price - profit_cost
        if modifier > best_modifier_value or (
            modifier == best_modifier_value
            and (
                modifier_profit > best_modifier_profit
                or (
                    modifier_profit == best_modifier_profit
                    and preferred(modifier_recipe, best_modifier_recipe)
                )
            )
        ):
            best_modifier_value = modifier
            best_modifier_profit = modifier_profit
            best_modifier_recipe = modifier_recipe
            best_modifier = result(state, modifier_recipe, modifier_cost)
        if profit > best_profit_value or (
            profit == best_profit_value and preferred(profit_recipe, best_profit_recipe)
        ):
            best_profit_value = profit
            best_profit_recipe = profit_recipe
            best_profit = result(state, profit_recipe, profit_cost)
        return modifier, modifier_profit, profit

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
                if next_state == state and ingredient.price >= 0:
                    continue
                if existing is None:
                    next_states[next_state] = (modifier_recipe, profit_recipe, profit_cost)
                    continue
                stats["merged_candidates"] += 1
                old_earliest, old_cheapest, old_cost = existing
                if profit_cost < old_cost or (
                    profit_cost == old_cost and profit_recipe < old_cheapest
                ):
                    old_cheapest, old_cost = profit_recipe, profit_cost
                    old_earliest = old_cheapest
                next_states[next_state] = old_earliest, old_cheapest, old_cost

        stats["unique_states_by_depth"][depth] = len(next_states)
        if len(next_states) > beam_width:
            horizon = min(lookahead, max_size - depth)
            forecasts: dict[State, tuple[float, Decimal, Recipe, Decimal, Recipe]] = {}
            for state, (earliest_recipe, cheapest_recipe, cheapest_cost) in next_states.items():
                modifier, sell_price = evaluate(state)
                forecasts[state] = (
                    modifier,
                    sell_price - recipe_cost(earliest_recipe),
                    earliest_recipe,
                    sell_price - cheapest_cost,
                    cheapest_recipe,
                )
                frontier = [(state, earliest_recipe, cheapest_recipe, cheapest_cost)]
                for _ in range(horizon):
                    following = []
                    for forecast_state, forecast_early, forecast_cheap, forecast_cost in frontier:
                        for ingredient_index, ingredient in enumerate(available):
                            completed_state = transition(
                                forecast_state, ingredient_index, speculative=True
                            )
                            stats["lookahead_candidates"] += 1
                            completed_early = forecast_early + (ingredient_index,)
                            completed_cheap = forecast_cheap + (ingredient_index,)
                            completed_cost = forecast_cost + ingredient.price
                            completed_modifier, completed_modifier_profit, completed_profit = (
                                record(
                                    completed_state,
                                    completed_early,
                                    completed_cheap,
                                    recipe_cost(completed_early),
                                    completed_cost,
                                )
                            )
                            best_mod, best_mod_profit, mod_recipe, best_prof, prof_recipe = (
                                forecasts[state]
                            )
                            if completed_modifier > best_mod or (
                                completed_modifier == best_mod
                                and (
                                    completed_modifier_profit > best_mod_profit
                                    or (
                                        completed_modifier_profit == best_mod_profit
                                        and preferred(completed_early, mod_recipe)
                                    )
                                )
                            ):
                                best_mod = completed_modifier
                                best_mod_profit = completed_modifier_profit
                                mod_recipe = completed_early
                            if completed_profit > best_prof or (
                                completed_profit == best_prof
                                and preferred(completed_cheap, prof_recipe)
                            ):
                                best_prof, prof_recipe = completed_profit, completed_cheap
                            forecasts[state] = (
                                best_mod,
                                best_mod_profit,
                                mod_recipe,
                                best_prof,
                                prof_recipe,
                            )
                            if completed_state != forecast_state or ingredient.price < 0:
                                following.append(
                                    (
                                        completed_state,
                                        completed_early,
                                        completed_cheap,
                                        completed_cost,
                                    )
                                )
                    frontier = following

            check_time("beam ranking")
            profit_ranked = sorted(
                next_states,
                key=lambda state: (
                    -forecasts[state][3],
                    len(forecasts[state][4]),
                    forecasts[state][4],
                    state,
                ),
            )
            modifier_ranked = sorted(
                next_states,
                key=lambda state: (
                    -forecasts[state][0],
                    -forecasts[state][1],
                    len(forecasts[state][2]),
                    forecasts[state][2],
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
            stats["beam_pruned_states"] += len(next_states) - len(selected)
            next_states = {state: next_states[state] for state in selected}

        states = next_states
        stats["retained_states_by_depth"][depth] = len(states)

    check_time("completion")
    assert best_modifier is not None and best_profit is not None
    stats["pruned_states"] = stats["merged_candidates"] + stats["beam_pruned_states"]
    stats["elapsed_seconds"] = perf_counter() - started
    return best_modifier, best_profit, stats

"""Experimental state-space search for mix runtime comparisons.

This module intentionally does not integrate with the application. Exact mode merges
recipes with the same ordered effect tuple while retaining the representatives needed
to reproduce the exhaustive search's modifier and profit winners. Passing ``beam_width``
enables an approximate current-profit beam with no optimality guarantee.
"""

from decimal import Decimal

from src.lookup import lookup
from src.util.models import CombinationResult

SEARCH_EXPANSION_LIMIT = 2_000_000


class SearchRuntimeLimitExceeded(RuntimeError):
    """Raised before a search would exceed its per-call expansion limit."""


def _normalized(value: str) -> str:
    return value.strip().lower().replace(" ", "_")


def search(
    product_name: str,
    max_level: int | str,
    max_size: int,
    beam_width: int | None = None,
) -> tuple[CombinationResult, CombinationResult, dict]:
    """Find the best modifier and profit recipes through ``max_size`` ingredients.

    Exact mode merges equivalent ordered effect states at every depth. Beam mode keeps
    only the ``beam_width`` states with the highest current profit after recording all
    candidates generated at that depth. The returned stats describe work performed by
    this call; searches raise rather than returning partial results at the limit.
    """
    if not isinstance(product_name, str) or not product_name.strip():
        raise ValueError("product_name must be a non-empty string")
    if isinstance(max_size, bool) or not isinstance(max_size, int) or max_size < 1:
        raise ValueError("max_size must be a positive integer")
    if beam_width is not None and (
        isinstance(beam_width, bool) or not isinstance(beam_width, int) or beam_width < 1
    ):
        raise ValueError("beam_width must be a positive integer or None")

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
    transition_cache: dict[tuple[tuple[str, ...], int], tuple[str, ...]] = {}
    evaluation_cache: dict[tuple[str, ...], tuple[float, Decimal]] = {}

    stats = {
        "mode": "exact" if beam_width is None else "beam",
        "beam_width": beam_width,
        "available_substances": len(available),
        "max_size": max_size,
        "expansion_limit": SEARCH_EXPANSION_LIMIT,
        "generated_candidates": 0,
        "expanded_transitions": 0,
        "transition_cache_hits": 0,
        "retained_states_by_depth": {},
        "merged_candidates": 0,
        "beam_pruned_states": 0,
        "pruned_states": 0,
    }

    def transition(state: tuple[str, ...], ingredient_index: int) -> tuple[str, ...]:
        cache_key = (state, ingredient_index)
        cached = transition_cache.get(cache_key)
        if cached is not None:
            stats["transition_cache_hits"] += 1
            return cached
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
        result = tuple(active)
        transition_cache[cache_key] = result
        stats["expanded_transitions"] += 1
        return result

    def evaluate(state: tuple[str, ...]) -> tuple[float, Decimal]:
        cached = evaluation_cache.get(state)
        if cached is None:
            modifier = sum(effect_values.get(effect, 0.0) for effect in state)
            cached = (modifier, Decimal(base_price * (1 + modifier)))
            evaluation_cache[state] = cached
        return cached

    def result(state: tuple[str, ...], recipe: tuple[int, ...], cost: Decimal) -> CombinationResult:
        modifier, sell_price = evaluate(state)
        return CombinationResult(
            sell_price=sell_price,
            substance_cost=cost,
            modifier=modifier,
            substances=[available[index].name for index in recipe],
            effects=list(state),
        )

    def preferred(recipe: tuple[int, ...], current: tuple[int, ...] | None) -> bool:
        return (
            current is None
            or len(recipe) > len(current)
            or (len(recipe) == len(current) and recipe < current)
        )

    best_modifier: CombinationResult | None = None
    best_modifier_value = float("-inf")
    best_modifier_recipe: tuple[int, ...] | None = None
    best_profit: CombinationResult | None = None
    best_profit_value = Decimal("-Infinity")
    best_profit_recipe: tuple[int, ...] | None = None

    # state -> (earliest recipe, cheapest recipe, cheapest cost)
    states: dict[tuple[str, ...], tuple[tuple[int, ...], tuple[int, ...], Decimal]] = {
        initial_effects: ((), (), Decimal(0))
    }
    for depth in range(1, max_size + 1):
        next_states: dict[tuple[str, ...], tuple[tuple[int, ...], tuple[int, ...], Decimal]] = {}
        for state, (earliest_recipe, cheapest_recipe, cheapest_cost) in states.items():
            for ingredient_index, ingredient in enumerate(available):
                if stats["generated_candidates"] >= SEARCH_EXPANSION_LIMIT:
                    raise SearchRuntimeLimitExceeded(
                        f"Search exceeded {SEARCH_EXPANSION_LIMIT:,} candidate expansions "
                        f"at depth {depth}; reduce max_size or beam_width."
                    )
                next_state = transition(state, ingredient_index)
                stats["generated_candidates"] += 1

                modifier_recipe = earliest_recipe + (ingredient_index,)
                profit_recipe = cheapest_recipe + (ingredient_index,)
                profit_cost = cheapest_cost + ingredient.price
                modifier, sell_price = evaluate(next_state)
                profit = sell_price - profit_cost

                if modifier > best_modifier_value or (
                    modifier == best_modifier_value
                    and preferred(modifier_recipe, best_modifier_recipe)
                ):
                    best_modifier_value = modifier
                    best_modifier_recipe = modifier_recipe
                    best_modifier = result(
                        next_state,
                        modifier_recipe,
                        sum((available[index].price for index in modifier_recipe), Decimal(0)),
                    )
                if profit > best_profit_value or (
                    profit == best_profit_value and preferred(profit_recipe, best_profit_recipe)
                ):
                    best_profit_value = profit
                    best_profit_recipe = profit_recipe
                    best_profit = result(next_state, profit_recipe, profit_cost)

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
            ranked = sorted(
                next_states.items(),
                key=lambda item: (
                    -(evaluate(item[0])[1] - item[1][2]),
                    item[1][1],
                    item[0],
                ),
            )
            removed = len(next_states) - beam_width
            next_states = dict(ranked[:beam_width])
            stats["beam_pruned_states"] += removed
        states = next_states
        stats["retained_states_by_depth"][depth] = len(states)

    stats["pruned_states"] = stats["merged_candidates"] + stats["beam_pruned_states"]
    stats["transition_cache_entries"] = len(transition_cache)
    stats["evaluation_cache_entries"] = len(evaluation_cache)
    assert best_modifier is not None and best_profit is not None
    return best_modifier, best_profit, stats

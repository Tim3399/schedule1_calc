"""Low-memory exhaustive reference search for runtime experiments.

The search streams every ordered recipe through a depth-first traversal and retains
only the recursion stack and current winners. It deliberately applies no state merging,
dominance rule, cache, or heuristic.
"""

from decimal import Decimal

from src.lookup import lookup
from src.util.models import CombinationResult

REFERENCE_CANDIDATE_LIMIT = 20_000_000


class ReferenceSearchLimitExceeded(ValueError):
    """Raised before a full exhaustive traversal would exceed its candidate limit."""


def _normalized(value: str) -> str:
    return value.strip().lower().replace(" ", "_")


def _candidate_count(base: int, max_size: int) -> int:
    if base == 1:
        return max_size if max_size <= REFERENCE_CANDIDATE_LIMIT else REFERENCE_CANDIDATE_LIMIT + 1

    total = 0
    width = 1
    for _ in range(max_size):
        if width > REFERENCE_CANDIDATE_LIMIT // base:
            return REFERENCE_CANDIDATE_LIMIT + 1
        width *= base
        if total > REFERENCE_CANDIDATE_LIMIT - width:
            return REFERENCE_CANDIDATE_LIMIT + 1
        total += width
    return total


def search(
    product_name: str, max_level: int | str, max_size: int
) -> tuple[CombinationResult, CombinationResult, dict]:
    """Exhaustively search all ordered recipes from depth one through ``max_size``."""
    if not isinstance(product_name, str) or not product_name.strip():
        raise ValueError("product_name must be a non-empty string")
    if isinstance(max_size, bool) or not isinstance(max_size, int) or max_size < 1:
        raise ValueError("max_size must be a positive integer")

    product_key = _normalized(product_name)
    product_map = {product.name: product for product in lookup.products}
    product = product_map.get(product_key)
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

    available = tuple(substance for substance in lookup.substances if substance.level <= level)
    if not available:
        raise ValueError("No substances are available for the given level.")
    estimated_candidates = _candidate_count(len(available), max_size)
    if estimated_candidates > REFERENCE_CANDIDATE_LIMIT:
        raise ReferenceSearchLimitExceeded(
            f"Full search exceeds {REFERENCE_CANDIDATE_LIMIT:,} candidates for "
            f"{len(available)} substances through depth {max_size}."
        )

    effect_values = {effect.name: effect.modificator for effect in lookup.effects}
    ingredients = tuple(
        (
            substance.name,
            substance.price,
            tuple(substance.side_effect_replacements.items()),
            substance.resulting_effect,
        )
        for substance in available
    )
    base_price = float(product.base_sell_price)
    recipe: list[int] = []
    counts_by_depth = {depth: 0 for depth in range(1, max_size + 1)}

    best_modifier: CombinationResult | None = None
    best_modifier_value = float("-inf")
    best_modifier_recipe: tuple[int, ...] | None = None
    best_profit: CombinationResult | None = None
    best_profit_value = Decimal("-Infinity")
    best_profit_recipe: tuple[int, ...] | None = None

    def preferred(current: list[int], winner: tuple[int, ...] | None) -> bool:
        if winner is None or len(current) != len(winner):
            return winner is None or len(current) > len(winner)
        for index, value in enumerate(current):
            if value != winner[index]:
                return value < winner[index]
        return False

    def make_result(
        state: tuple[str, ...], modifier: float, sell_price: Decimal, cost: Decimal
    ) -> CombinationResult:
        return CombinationResult(
            sell_price=sell_price,
            substance_cost=cost,
            modifier=modifier,
            substances=[ingredients[index][0] for index in recipe],
            effects=list(state),
        )

    def visit(state: tuple[str, ...], cost: Decimal) -> None:
        nonlocal best_modifier, best_modifier_value, best_modifier_recipe
        nonlocal best_profit, best_profit_value, best_profit_recipe

        depth = len(recipe)
        if depth:
            counts_by_depth[depth] += 1
            modifier = sum(effect_values.get(effect, 0.0) for effect in state)
            sell_price = Decimal(base_price * (1 + modifier))
            profit = sell_price - cost
            if modifier > best_modifier_value or (
                modifier == best_modifier_value and preferred(recipe, best_modifier_recipe)
            ):
                best_modifier_value = modifier
                best_modifier_recipe = tuple(recipe)
                best_modifier = make_result(state, modifier, sell_price, cost)
            if profit > best_profit_value or (
                profit == best_profit_value and preferred(recipe, best_profit_recipe)
            ):
                best_profit_value = profit
                best_profit_recipe = tuple(recipe)
                best_profit = make_result(state, modifier, sell_price, cost)
        if depth == max_size:
            return

        for ingredient_index, (_, price, replacements, resulting_effect) in enumerate(ingredients):
            active = dict.fromkeys(state)
            replacement_effects = []
            for original, replacement in replacements:
                if original in active:
                    active.pop(original)
                    replacement_effects.append(replacement)
            for replacement in replacement_effects:
                active[replacement] = None
            active[resulting_effect] = None
            recipe.append(ingredient_index)
            visit(tuple(active), cost + price)
            recipe.pop()

    visit(tuple(dict.fromkeys(product.effects or ())), Decimal(0))
    assert best_modifier is not None and best_profit is not None
    return (
        best_modifier,
        best_profit,
        {
            "mode": "exact_streaming",
            "available_substances": len(ingredients),
            "max_size": max_size,
            "candidate_limit": REFERENCE_CANDIDATE_LIMIT,
            "estimated_candidates": estimated_candidates,
            "evaluated_candidates": sum(counts_by_depth.values()),
            "candidates_by_depth": counts_by_depth,
            "peak_recipe_depth": max_size,
        },
    )

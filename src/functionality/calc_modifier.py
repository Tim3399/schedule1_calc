import sys
import os
from decimal import Decimal
from typing import Dict, List, Union, Tuple
from itertools import product as itertool_product
import time
from functools import wraps
from math import isqrt


sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from functionality.logging.logging_config import setup_logging

logger = setup_logging()
logger.info("Starting the calculation process...")

from src.lookup.lookup import substances, effects, products, level_name_to_int
from src.util.models import CombinationResult
from src.datenbank.initialize_db import initialize_database
from src.datenbank.populate_db import populate_database, store_all_combinations_normalized
from src.datenbank.get_db_data import get_best_recipe_filtered


class CombinationSearchLimitExceeded(ValueError):
    """Raised when a requested combination search exceeds a safe computational limit."""

    def __init__(
        self,
        requested_size: int,
        allowed_size: int,
        estimated_count: int,
        limit: int,
        work_units: str = "combinations",
        limit_scope: str = "per-size",
    ):
        message = (
            f"Request would require too many {work_units}: requested size {requested_size} "
            f"(estimated {estimated_count:,}, max safe {limit_scope} limit {limit}). "
            f"Maximum safe size for this level is {allowed_size}."
        )
        super().__init__(message)
        self.requested_size = requested_size
        self.allowed_size = allowed_size
        self.estimated_count = estimated_count
        self.limit = limit


class MinimumSearchLimitExceeded(RuntimeError):
    """Raised when a minimum search ends before every requested size is checked."""

    def __init__(self, requested_size: int, searched_size: int, limit: int):
        message = (
            f"Minimum search is incomplete: requested through size {requested_size}, "
            f"but completely checked only through size {searched_size} before reaching "
            f"the search-work limit {limit:,}."
        )
        super().__init__(message)
        self.requested_size = requested_size
        self.searched_size = searched_size
        self.limit = limit


COMBINATION_SEARCH_LIMIT = 200_000


def _bounded_power_with_limit(base: int, exponent: int, limit: int) -> int:
    """Compute base**exponent, but stop once the result exceeds limit."""
    if exponent <= 0:
        return 1

    if base <= 1:
        return 1

    value = 1
    for _ in range(exponent):
        if value > limit // base:
            return limit + 1
        value *= base
    return value


def _safe_search_size(available_count: int, limit: int) -> int:
    """Return the largest recipe size allowed by the bounded search work."""
    if available_count <= 0:
        raise ValueError("No substances are available for the given level.")
    if limit <= 0:
        return 0
    if available_count == 1:
        return (isqrt(1 + 8 * limit) - 1) // 2

    safe_size = 0
    combinations_at_size = 1
    while combinations_at_size <= limit // available_count:
        combinations_at_size *= available_count
        safe_size += 1
    return safe_size


def _validate_search_size(requested_size: int, available_count: int, limit: int) -> int:
    """Reject a recipe size that would exceed bounded enumeration work."""
    safe_size = _safe_search_size(available_count, limit)
    if requested_size <= safe_size:
        return safe_size

    if available_count == 1:
        estimated_work = limit + 1
        work_units = "ingredient-processing budget units"
        limit_scope = "total ingredient-processing"
    else:
        estimated_work = _bounded_power_with_limit(available_count, requested_size, limit)
        work_units = "combinations"
        limit_scope = "per-size"
    raise CombinationSearchLimitExceeded(
        requested_size=requested_size,
        allowed_size=safe_size,
        estimated_count=estimated_work,
        limit=limit,
        work_units=work_units,
        limit_scope=limit_scope,
    )


def timing(func):
    """
    A decorator to measure the execution time of a function.
    """

    @wraps(func)
    def wrapper(*args, **kwargs):
        start_time = time.time()
        result = func(*args, **kwargs)
        end_time = time.time()
        elapsed_time = end_time - start_time
        logger.info(f"Function '{func.__name__}' executed in {elapsed_time:.4f} seconds.")
        return result

    return wrapper


def decimal_default(obj):
    """
    Custom JSON serializer for objects not serializable by default.
    Converts Decimal objects to float.
    """
    if isinstance(obj, Decimal):
        return float(obj)
    raise TypeError(f"Object of type {obj.__class__.__name__} is not JSON serializable")


def _calculate_modificator(
    substance_names: List[str], product_name: str = None
) -> Tuple[float, Dict[str, float]]:
    """
    Calculate the total price modifier and returns the modifier and the active effects.

    Args:
        substance_names (List[str]): List of substance names to calculate the modifier for.
        product_name (str, optional): Name of the product to include its effects.

    Returns:
        Tuple[float, Dict[str, float]]: The total price modifier and a dictionary of active effects with their modifiers.
    """
    effect_modificators = {effect.name: effect.modificator for effect in effects}
    substance_map = {substance.name: substance for substance in substances}
    product_map = {product.name: product for product in products}

    total_modificator: float = 0.0
    active_effects: Dict[str, float] = {}

    # Add product effects if a product is provided
    if product_name:
        product = product_map.get(product_name)
        if not product:
            logger.error(f"Product '{product_name}' not found!")
            raise ValueError(f"Product '{product_name}' not found!")
        for effect in product.effects:
            active_effects[effect] = effect_modificators.get(effect, 0.0)

    # Process substances
    for name in substance_names:
        replace_effects: List[str] = []

        substance = substance_map.get(name)
        if not substance:
            logger.error(f"Substance '{name}' not found!")
            raise ValueError(f"Substance '{name}' not found!")

        # Apply side effect replacements
        for effect, replacement in substance.side_effect_replacements.items():
            if effect in active_effects:
                active_effects.pop(effect)
                replace_effects.append(replacement)

        for effect in replace_effects:
            active_effects[effect] = effect_modificators.get(effect, 0.0)

        # Apply resulting effect
        resulting_effect = substance.resulting_effect
        active_effects[resulting_effect] = effect_modificators.get(resulting_effect, 0.0)

    total_modificator = sum(active_effects.values())
    return total_modificator, active_effects


def _calculate_price(
    product_name: str,
    total_effect_multiplier: float,
    active_effects: Dict[str, float] = None,
) -> Decimal:
    """Calculate an unrounded price using the most exact available effect values.

    ``active_effects`` is preferred because each float value can be converted to Decimal before
    addition. A caller that only has an already-summed float may retain that float's summation
    residue. Whole-dollar game rounding is intentionally outside this helper until its tie rule is
    verified.
    """
    product_map = {product.name: product for product in products}
    product = product_map.get(product_name)

    if not product:
        raise ValueError(f"Product '{product_name}' not found!")

    if active_effects is not None:
        effect_multiplier = sum(
            (Decimal(str(value)) for value in active_effects.values()),
            start=Decimal("0"),
        )
    else:
        effect_multiplier = Decimal(str(total_effect_multiplier))

    base_sell_price = Decimal(str(product.base_sell_price))
    return base_sell_price * (Decimal("1") + effect_multiplier)


@timing
def _find_best_combinations(
    combination_size: int,
    product_name: str,
    max_level: Union[int, str],
    collect_all_combinations: bool = False,
) -> Tuple[Dict[int, Dict[str, CombinationResult]], CombinationResult, CombinationResult]:
    """
    Find all combinations of substances and calculate their total effect multiplier, price, and profit.

    Args:
        substance_names (List[str]): List of all available substance names.
        combination_size (int): Number of substances to combine.
        product_name (str): The product for which the price is calculated.
        max_level (int or str): Maximum level of substances to include (as int or str).

    Returns:
        Dict[str, CombinationResult]: A dictionary with combination keys and their results.
        Tuple[CombinationResult, CombinationResult]: The combination with the best modifier and the combination with the highest profit.
    """
    # Convert max_level to int if it's a string
    if isinstance(max_level, str):
        max_level = level_name_to_int.get(max_level)
        if max_level is None:
            raise ValueError(f"Invalid level name: {max_level}")

    # Create a map of substances for quick lookup
    substance_map = {substance.name: substance for substance in substances}

    # Filter substances by max_level
    filtered_substances = [
        substance.name for substance in substances if substance.level <= max_level
    ]

    if combination_size <= 0:
        raise ValueError("Combination size must be a positive integer.")

    max_available_substances = len(filtered_substances)
    _validate_search_size(combination_size, max_available_substances, COMBINATION_SEARCH_LIMIT)

    # Create a map of products for quick lookup
    product_map = {product.name: product for product in products}
    product = product_map.get(product_name)
    if not product:
        raise ValueError(f"Product '{product_name}' not found!")

    all_combinations_by_size = {}
    best_modifier_entry = None
    best_profit_entry = None
    highest_modifier = float("-inf")
    highest_profit = Decimal("-inf")

    for size in range(combination_size, 0, -1):
        logger.info(f"Calculating combinations of size {size}...")
        combinations_data = {} if collect_all_combinations else None

        # Test all combinations of the given size
        for combination in itertool_product(filtered_substances, repeat=size):
            # Calculate the modifier for the current combination
            current_multiplier, active_effects = _calculate_modificator(
                list(combination), product_name
            )

            sell_price = _calculate_price(product_name, current_multiplier, active_effects)

            # Calculate the manufacturing cost
            substance_cost = sum(substance_map[substance].price for substance in combination)

            # Calculate the profit
            profit = sell_price - substance_cost

            # Create a unique key for the combination
            combination_key = "_".join(combination)

            combination_result = CombinationResult(
                sell_price=sell_price,
                substance_cost=substance_cost,
                modifier=current_multiplier,
                substances=list(combination),
                effects=list(active_effects.keys()),
            )
            if collect_all_combinations:
                combinations_data[combination_key] = combination_result

            # Update the best modifier entry
            if current_multiplier > highest_modifier:
                highest_modifier = current_multiplier
                best_modifier_entry = combination_result

            # Update the best profit entry
            if profit > highest_profit:
                highest_profit = profit
                best_profit_entry = combination_result

            logger.debug(
                f"Combination: {combination}, Modifier: {current_multiplier:.2f}, "
                f"Sell Price: {sell_price:.2f}, Cost: {substance_cost:.2f}, Profit: {profit:.2f}"
            )

        if collect_all_combinations:
            all_combinations_by_size[size] = combinations_data
    return all_combinations_by_size, best_modifier_entry, best_profit_entry


@timing
def get_best_mix(
    combination_size: int,
    product_name: str,
    max_level: Union[int, str],
    collect_all_combinations: bool = False,
) -> Tuple[CombinationResult, CombinationResult, Dict[str, CombinationResult]]:
    """
    Get the best mix of substances for a given product and level.

    Args:
        combination_size (int): Number of substances to combine.
        product_name (str): The product for which the price is calculated.
        max_level (int or str): Maximum level of substances to include (as int or str).

    Returns:
        Tuple[CombinationResult, CombinationResult]: The combination with the best modifier and the combination with the highest profit.
    """

    product_name = product_name.lower().replace(" ", "_")

    if isinstance(max_level, str):
        max_level = max_level.lower().replace(" ", "_")

    return _find_best_combinations(
        combination_size,
        product_name,
        max_level,
        collect_all_combinations=collect_all_combinations,
    )


@timing
def find_min_substances_for_effect(
    product_name: str,
    desired_effects: Union[str, List[str]],
    not_desired_effects: Union[str, List[str]],
    max_level: Union[int, str],
    max_search_size: int = 6,
    max_results: int = 10,
    combination_search_limit: int = 200_000,
) -> Tuple[int, List[CombinationResult]]:
    """
    Find the minimum number of substances (combined with the given product)
    required to activate all `desired_effects`, including zero when the base product matches.

    Returns:
        Tuple[int, List[CombinationResult]]: (found_size, list_of_CombinationResult).
        If nothing is found after every requested size is checked, returns (0, []).

    Raises:
        MinimumSearchLimitExceeded: If the search budget prevents checking every requested size
            and no exact minimum was found in the completely searched sizes.
    """
    product_name = product_name.lower().replace(" ", "_")

    # support list or comma-separated string for (not)desired effects
    if isinstance(desired_effects, str):
        desired_list = [
            e.strip().lower().replace(" ", "_") for e in desired_effects.split(",") if e.strip()
        ]
    else:
        desired_list = [e.strip().lower().replace(" ", "_") for e in desired_effects]

    if not_desired_effects is None:
        not_desired_list: List[str] = []
    elif isinstance(not_desired_effects, str):
        not_desired_list = [
            e.strip().lower().replace(" ", "_") for e in not_desired_effects.split(",") if e.strip()
        ]
    else:
        not_desired_list = [e.strip().lower().replace(" ", "_") for e in not_desired_effects]

    if not desired_list:
        raise ValueError("No desired effects provided.")

    # Handle max_level same way as in _find_best_combinations
    if isinstance(max_level, str):
        max_level = level_name_to_int.get(max_level)
        if max_level is None:
            raise ValueError(f"Invalid level name: {max_level}")

    # Build quick lookup maps for substances and filter by level
    substance_map = {substance.name: substance for substance in substances}
    filtered_substances = [s.name for s in substances if s.level <= max_level]

    # Validate product
    product_map = {product.name: product for product in products}
    product = product_map.get(product_name)
    if not product:
        raise ValueError(f"Product '{product_name}' not found!")

    desired_set = set(desired_list)
    not_desired_set = set(not_desired_list)

    if max_search_size >= 0:
        base_multiplier, base_effects = _calculate_modificator([], product_name)
        base_effects_normalized = {
            effect.lower().replace(" ", "_") for effect in base_effects.keys()
        }
        if desired_set.issubset(base_effects_normalized) and not not_desired_set.intersection(
            base_effects_normalized
        ):
            base_result = CombinationResult(
                sell_price=_calculate_price(product_name, base_multiplier, base_effects),
                substance_cost=Decimal("0"),
                modifier=base_multiplier,
                substances=[],
                effects=list(base_effects.keys()),
            )
            logger.info("The base product already has all requested effects.")
            return 0, [base_result]

        if max_search_size == 0:
            logger.info(
                f"No results found for '{', '.join(desired_list)}' with Product '{product_name}'."
            )
            return 0, []

    if not filtered_substances:
        raise ValueError("Keine Substanzen für das gegebene Level verfügbar.")

    safe_search_size = _safe_search_size(len(filtered_substances), combination_search_limit)
    if max_search_size > safe_search_size:
        logger.warning(
            f"Search is limited to size={safe_search_size} by the "
            f"{combination_search_limit:,} search-work budget."
        )

    # Search for the smallest combination size that yields the desired effects
    for size in range(1, min(max_search_size, safe_search_size) + 1):
        found_results: List[CombinationResult] = []
        # iterate over all ordered combinations with repetition
        for comb in itertool_product(filtered_substances, repeat=size):
            current_multiplier, active_effects = _calculate_modificator(list(comb), product_name)
            # normalize active effect names for comparison
            active_keys_normalized = {e.lower().replace(" ", "_") for e in active_effects.keys()}

            # check that all desired effects are present
            desired_ok = desired_set.issubset(active_keys_normalized)
            # check that no not-desired effect is present
            not_desired_ok = not not_desired_set.intersection(active_keys_normalized)

            if desired_ok and not_desired_ok:
                sell_price = _calculate_price(product_name, current_multiplier, active_effects)
                substance_cost = sum(substance_map[s].price for s in comb)
                comb_result = CombinationResult(
                    sell_price=sell_price,
                    substance_cost=substance_cost,
                    modifier=current_multiplier,
                    substances=list(comb),
                    effects=list(active_effects.keys()),
                )
                found_results.append(comb_result)
                if len(found_results) >= max_results:
                    break

        if found_results:
            logger.info(f"Found {len(found_results)} combinations with minimal size {size}.")
            return size, found_results

    # nothing found
    if max_search_size > safe_search_size:
        raise MinimumSearchLimitExceeded(
            requested_size=max_search_size,
            searched_size=safe_search_size,
            limit=combination_search_limit,
        )

    logger.info(f"No results found for '{', '.join(desired_list)}' with Product '{product_name}'.")
    return 0, []


def print_result(combination: CombinationResult, message: str = None) -> None:
    """
    Print the result of a combination.

    Args:
        result (CombinationResult): The result to print.
        message (str, optional): Optional message to print before the result.
    """
    if message:
        print("=" * len(message))
        print(message)
        print("=" * len(message))
    print(f"Effects: {', '.join(combination.effects)}")
    print(f"Substances: {', '.join(combination.substances)}")
    print(f"Modifier: {combination.modifier:.2f}")
    print(f"Sell Price: {combination.sell_price:.2f}$")
    print(f"Substance Cost: {combination.substance_cost:.2f}$")
    print(f"Profit: {combination.sell_price - combination.substance_cost:.2f}$")
    print("-" * 40)


def generate_db_entrys(
    combination_size: int,
    product_name: str,
    max_level: Union[int, str],
    db_path: str = "combinations.db",
) -> None:
    """Calculate all requested recipe sizes and export them to ``db_path``."""
    normalized_product_name = product_name.strip().lower().replace(" ", "_")
    all_combinations_by_size, _, _ = get_best_mix(
        combination_size, normalized_product_name, max_level, collect_all_combinations=True
    )
    for size, combinations_data in all_combinations_by_size.items():
        store_all_combinations_normalized(db_path, normalized_product_name, size, combinations_data)

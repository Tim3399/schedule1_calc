import sys
import os
from decimal import Decimal
from typing import Dict, List, Union, Tuple
from itertools import product as itertool_product
import time 
from functools import wraps


sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from functionality.logging.logging_config import setup_logging
logger = setup_logging()
logger.info("Starting the calculation process...")

from src.lookup.lookup import substances, effects, products, level_name_to_int
from src.util.models import CombinationResult
from src.datenbank.initialize_db import initialize_database
from src.datenbank.populate_db import populate_database, store_all_combinations_normalized
from src.datenbank.get_db_data import get_best_recipe_filtered

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
    substance_names: List[str], 
    product_name: str = None
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


def _calculate_price(product_name: str, total_effect_multiplier: float) -> Decimal:
    """Calculate the final price based on the product's base price and total effect multiplier."""
    product_map = {product.name: product for product in products}
    product = product_map.get(product_name)
    
    if not product:
        raise ValueError(f"Product '{product_name}' not found!")
    
    return Decimal(float(product.base_sell_price) * (1 + total_effect_multiplier))

@timing
def _find_best_combinations(
    combination_size: int, 
    product_name: str, 
    max_level: Union[int, str]
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

    if combination_size > len(filtered_substances):
        raise ValueError("Not enough substances available for the given combination size and level.")

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
        combinations_data = {}

        # Test all combinations of the given size
        for combination in itertool_product(filtered_substances, repeat=size):
            # Calculate the modifier for the current combination
            current_multiplier, active_effects = _calculate_modificator(list(combination), product_name)

            sell_price = _calculate_price(product_name, current_multiplier)


            # Calculate the manufacturing cost
            substance_cost = sum(
                substance_map[substance].price for substance in combination
            )

            # Calculate the profit
            profit = sell_price - substance_cost

            # Create a unique key for the combination
            combination_key = "_".join(combination)

            # Store the result in the dictionary
            combination_result = CombinationResult(
                sell_price=sell_price,
                substance_cost=substance_cost,
                modifier=current_multiplier,
                substances=list(combination),
                effects=list(active_effects.keys()),
            )
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

        all_combinations_by_size[size] = combinations_data
    return all_combinations_by_size, best_modifier_entry, best_profit_entry

@timing
def get_best_mix(
    combination_size: int, 
    product_name: str, 
    max_level: Union[int, str]
) -> Tuple[CombinationResult, CombinationResult, Dict[str,CombinationResult]]:
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

    return _find_best_combinations(combination_size, product_name, max_level)

@timing
def find_min_substances_for_effect(
    product_name: str,
    desired_effects: Union[str, List[str]],
    not_desired_effects: Union[str, List[str]],
    max_level: Union[int, str],
    max_search_size: int = 6,
    max_results: int = 10,
    combination_search_limit: int = 200_000
) -> Tuple[int, List[CombinationResult]]:
    """
    Find the minimum number of substances (combined with the given product)
    required to activate all `desired_effects`.

    Returns:
        Tuple[int, List[CombinationResult]]: (found_size, list_of_CombinationResult).
        If nothing is found, returns (0, []).
    """
    product_name = product_name.lower().replace(" ", "_")

    # support list or comma-separated string for (not)desired effects
    if isinstance(desired_effects, str):
        desired_list = [e.strip().lower().replace(" ", "_") for e in desired_effects.split(",") if e.strip()]
    else:
        desired_list = [e.strip().lower().replace(" ", "_") for e in desired_effects]

    if not_desired_effects is None:
        not_desired_list: List[str] = []
    elif isinstance(not_desired_effects, str):
        not_desired_list = [e.strip().lower().replace(" ", "_") for e in not_desired_effects.split(",") if e.strip()]
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

    if not filtered_substances:
        raise ValueError("Keine Substanzen für das gegebene Level verfügbar.")

    # Validate product
    product_map = {product.name: product for product in products}
    product = product_map.get(product_name)
    if not product:
        raise ValueError(f"Product '{product_name}' not found!")

    # Search for the smallest combination size that yields the desired effects
    for size in range(1, min(max_search_size, len(filtered_substances)) + 1):
        estimated_count = len(filtered_substances) ** size
        if estimated_count > combination_search_limit:
            logger.warning(
                f"Search for size={size} would check {estimated_count} combinations; "
                "skipping this size due to limit."
            )
            continue

        found_results: List[CombinationResult] = []
        # iterate over all ordered combinations with repetition
        for comb in itertool_product(filtered_substances, repeat=size):
            current_multiplier, active_effects = _calculate_modificator(list(comb), product_name)
            # normalize active effect names for comparison
            active_keys_normalized = {e.lower().replace(" ", "_") for e in active_effects.keys()}

            # check that all desired effects are present
            desired_ok = set(desired_list).issubset(active_keys_normalized)
            # check that no not-desired effect is present
            not_desired_ok = not set(not_desired_list).intersection(active_keys_normalized)

            if desired_ok and not_desired_ok:
                sell_price = _calculate_price(product_name, current_multiplier)
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
    max_level: Union[int, str]
) -> None:

    all_combinations_by_size, best_modifier_entry, best_profit_entry = get_best_mix(combination_size, product_name, max_level)
    for size, combinations_data in all_combinations_by_size.items():
        store_all_combinations_normalized("combinations.db", product_name, size, combinations_data)
    
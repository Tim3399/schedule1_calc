import sys
import os
from decimal import Decimal
from typing import Dict, List, Union, Tuple
from itertools import product as itertool_product

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from src.logging_config import setup_logging
logger = setup_logging()
logger.info("Starting the calculation process...")

from src.lookup.lookup import substances, effects, products, level_name_to_int
from src.util.models import CombinationResult



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
            logger.debug(f"Adding product effect: {effect}")
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
                logger.debug(f"Replacing effect '{effect}' with '{replacement}'")
                active_effects.pop(effect)
                replace_effects.append(replacement)

        for effect in replace_effects:
            logger.debug(f"Adding replaced effect: {effect}")
            active_effects[effect] = effect_modificators.get(effect, 0.0)  

        # Apply resulting effect
        resulting_effect = substance.resulting_effect
        logger.debug(f"Adding resulting effect: {resulting_effect}")
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


def _find_best_combinations(
    combination_size: int, 
    product_name: str, 
    max_level: Union[int, str]
) -> Dict[str, CombinationResult]:
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

    combinations_data = {}
    best_modifier_entry = None
    best_profit_entry = None
    highest_modifier = float("-inf")
    highest_profit = Decimal("-inf")


    for size in range(combination_size, 0, -1):
        logger.info(f"Calculating combinations of size {size}...")

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
            combination_key = "_".join(sorted(combination))

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

    return combinations_data, best_modifier_entry, best_profit_entry


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

def _print_result(combination: CombinationResult, message: str = None) -> None:
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


if __name__ == "__main__":

    combination_size = 4
    product_name = "green_crack" # Example: Use product name ("og_kush"...)
    max_level = 51  # Example: Use level name or int (6 or "hoodium IV")

    # Find all combinations
    combinations_data, best_modifier_entry, best_profit_entry = get_best_mix(combination_size, product_name, max_level)

    print(f"Best Combinations for {product_name} at level {max_level} with up to {combination_size} products:")
    _print_result(best_modifier_entry, "Best Modifier Combination:")
    _print_result(best_profit_entry, "Best Profit Combination:")

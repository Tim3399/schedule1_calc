import argparse
from typing import Optional

from functionality.calc_modifier import (
    find_min_substances_for_effect,
    get_best_mix,
    print_result,
)

def main(
    product: str,
    desired: str,
    not_desired: Optional[str],
    max_level: str,
    max_search_size: int,
    combination_size: int,
):
    # call find_min_substances_for_effect (use keyword args to avoid positional mixups)
    size, results = find_min_substances_for_effect(
        product_name=product,
        desired_effects=desired,
        not_desired_effects=not_desired,
        max_level=max_level,
        max_search_size=max_search_size,
        max_results=10,
        combination_search_limit=200_000,
    )

    if size == 0:
        print(f"No combination found for effect(s) '{desired}' with product '{product}'.")
    else:
        print(f"Minimum number of substances: {size} — {len(results)} result(s)")
        for idx, res in enumerate(results, start=1):
            print(f"\nResult {idx}:")
            print_result(res)

    # call get_best_mix
    all_combinations, best_modifier, best_profit = get_best_mix(
        combination_size=combination_size,
        product_name=product,
        max_level=max_level,
    )

    print("\n--- Best Results from get_best_mix ---")
    if best_modifier:
        print("Best modifier-combination:")
        print_result(best_modifier)
    else:
        print("No best modifier-combination found.")

    if best_profit:
        print("Best profit-combination:")
        print_result(best_profit)
    else:
        print("No best profit-combination found.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run calc_modifier quick checks.")
    parser.add_argument("--product", default="cocaine")
    parser.add_argument("--desired", default="seizure_inducing", help="CSV or single desired effect(s)")
    parser.add_argument("--not_desired", default=None, help="CSV or single not-desired effect(s)")
    parser.add_argument("--max_level", default="max", help="Level name or int")
    parser.add_argument("--max_search_size", type=int, default=4)
    parser.add_argument("--combination_size", type=int, default=4)

    args = parser.parse_args()
    main(
        product=args.product,
        desired=args.desired,
        not_desired=args.not_desired,
        max_level=args.max_level,
        max_search_size=args.max_search_size,
        combination_size=args.combination_size,
    )
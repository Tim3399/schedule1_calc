"""Dispatch explicitly selected searches without weakening the exact-result contract."""

from functionality import calc_modifier
from src.functionality import search_exact, search_fast


class SearchIncomplete(RuntimeError):
    """No winners are exposed when the selected search cannot finish within its limits."""

    def __init__(self, mode: str, reason: str):
        super().__init__(f"Search incomplete: {reason} No recipe is returned.")
        self.mode = mode


# Server-controlled limits; request fields cannot override them.
EXACT_OPTIONS = {
    "tail_depth": 1,
    "frontier_limit": 300_000,
    "cache_limit": 32_768,
    "work_limit": 20_000_000,
    "time_limit_seconds": 90.0,
}
FAST_OPTIONS = {
    "beam_width": 1024,
    "lookahead": 1,
    "work_limit": 2_000_000,
    "time_limit_seconds": 15.0,
}


def get_best_mix(combination_size, product_name, max_level, *, search_mode="exact"):
    """Return (certification metadata, modifier winner, profit winner) or raise.

    Exact is the default and never falls back to fast. Only successful completion of
    the exhaustive exact engine certifies either winner. Fast always stays approximate.
    The legacy calculator's collection/DB-export entry point remains separate.
    """
    if search_mode not in ("exact", "fast"):
        raise ValueError("Search mode must be exact or fast.")
    normalized_product = (
        product_name.strip().lower().replace(" ", "_")
        if isinstance(product_name, str)
        else product_name
    )

    def price_from_effects(active_effects):
        return calc_modifier._calculate_price(
            normalized_product,
            sum(active_effects.values()),
            active_effects=active_effects,
        )

    try:
        if search_mode == "exact":
            modifier, profit, stats = search_exact.search(
                normalized_product,
                max_level,
                combination_size,
                price_from_effects=price_from_effects,
                **EXACT_OPTIONS,
            )
        else:
            modifier, profit, stats = search_fast.search(
                normalized_product,
                max_level,
                combination_size,
                price_from_effects=price_from_effects,
                **FAST_OPTIONS,
            )
    except (search_exact.SearchLimitExceeded, search_fast.SearchLimitExceeded) as error:
        # There is deliberately no alternate-engine call or incumbent in this path.
        raise SearchIncomplete(search_mode, str(error)) from None
    if modifier is None or profit is None:
        raise RuntimeError("Search completed without both winning recipes.")
    if search_mode == "exact" and stats.get("optimality_guaranteed") is not True:
        raise RuntimeError("Exact search did not certify its result.")
    return (
        {
            "mode": search_mode,
            "status": "optimal" if search_mode == "exact" else "approximate",
            "optimality_proven": search_mode == "exact",
        },
        modifier,
        profit,
    )

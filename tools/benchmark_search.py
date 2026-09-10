"""Compare the current search with the isolated runtime experiment; no app changes."""

import argparse
import gc
import json
import logging
from pathlib import Path
import platform
import statistics
import sys
import time
import tracemalloc
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT), str(ROOT / "src")]

from functionality.logging import logging_config

benchmark_logger = logging.getLogger("search_benchmark")
benchmark_logger.handlers.clear()
handler = logging.NullHandler()
handler.setLevel(logging.INFO)
benchmark_logger.addHandler(handler)
benchmark_logger.propagate = False
benchmark_logger.setLevel(logging.DEBUG)

with patch.object(logging_config, "setup_logging", return_value=benchmark_logger):
    from functionality import calc_modifier

from experiments.search_runtime import search
from experiments.legacy_pricing import calculate_price as legacy_price

# This standalone historical runner compares algorithms under the frozen price model.
# Production uses the central Decimal arithmetic instead; do not import this runner there.
calc_modifier._calculate_price = legacy_price


def measure(function, repeats, measure_memory=False):
    samples = []
    result = None
    for _ in range(repeats):
        gc.collect()
        start = time.perf_counter()
        current = function()
        samples.append(time.perf_counter() - start)
        if result is not None and current != result:
            raise AssertionError("Repeated searches returned different results.")
        result = current
    measurements = {
        "median_seconds": statistics.median(samples),
        "min_seconds": min(samples),
        "max_seconds": max(samples),
    }
    if measure_memory:
        gc.collect()
        tracemalloc.start()
        try:
            current = function()
            _, peak = tracemalloc.get_traced_memory()
            if current != result:
                raise AssertionError("Memory measurement changed the result.")
            measurements["peak_traced_bytes"] = peak
        finally:
            tracemalloc.stop()
    return result, measurements


def summarize(result):
    return {
        "recipe": result.substances,
        "effects": result.effects,
        "modifier": result.modifier,
        "sell_price": str(result.sell_price),
        "ingredient_cost": str(result.substance_cost),
        "profit": str(result.sell_price - result.substance_cost),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--size", type=int, default=4)
    parser.add_argument("--product", default="og_kush")
    parser.add_argument("--level", default="max")
    parser.add_argument("--repeats", type=int, default=3)
    parser.add_argument("--beam-widths", type=int, nargs="+", default=[64, 256])
    parser.add_argument("--measure-memory", action="store_true")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    if args.repeats < 1:
        parser.error("--repeats must be positive")

    report = {
        "python": platform.python_version(),
        "platform": platform.platform(),
        "product": args.product,
        "level": args.level,
        "max_size": args.size,
        "repeats": args.repeats,
        "note": (
            "DEBUG baseline creates discarded records as the app currently does; "
            "INFO file/console output is suppressed. Disabled baseline removes record creation. "
            "Each prototype call starts with empty state/transition tables."
        ),
        "modes": {},
    }

    def reference():
        _, modifier, profit = calc_modifier.get_best_mix(args.size, args.product, args.level)
        return modifier, profit

    for disabled in (False, True):
        name = "baseline_logging_disabled" if disabled else "baseline_debug_records"
        benchmark_logger.disabled = disabled
        result, measurements = measure(reference, args.repeats, args.measure_memory)
        if disabled and result != expected:
            raise AssertionError("Logging changed the result.")
        expected = result
        report["modes"][name] = {
            **measurements,
            "best_modifier": summarize(result[0]),
            "best_profit": summarize(result[1]),
        }

    for width in (None, *args.beam_widths):
        name = "exact_states" if width is None else f"beam_{width}"
        result, measurements = measure(
            lambda: search(args.product, args.level, args.size, beam_width=width),
            args.repeats,
            args.measure_memory,
        )
        modifier, profit, stats = result
        if width is None and (modifier, profit) != expected:
            raise AssertionError("Exact prototype differs from the exhaustive reference.")
        reference_profit = expected[1].sell_price - expected[1].substance_cost
        actual_profit = profit.sell_price - profit.substance_cost
        if actual_profit > reference_profit:
            raise AssertionError("Prototype exceeds the exhaustive reference; investigate.")
        report["modes"][name] = {
            **measurements,
            "matches_both_reference_recipes": (modifier, profit) == expected,
            "profit_gap": str(reference_profit - actual_profit),
            "best_modifier": summarize(modifier),
            "best_profit": summarize(profit),
            "stats": stats,
        }

    encoded = json.dumps(report, indent=2)
    if args.output:
        args.output.write_text(encoded + "\n", encoding="utf-8")
    print(encoded)


if __name__ == "__main__":
    main()

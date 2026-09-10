"""Acceptance checks for the independent low-memory exhaustive reference."""

from decimal import Decimal
import logging
from pathlib import Path
import sys
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT), str(ROOT / "src")]

from functionality.logging import logging_config

quiet_logger = logging.getLogger("search_reference_tests")
quiet_logger.disabled = True
with patch.object(logging_config, "setup_logging", return_value=quiet_logger):
    from functionality import calc_modifier

from experiments import search_reference, search_runtime
from experiments.legacy_pricing import calculate_price as legacy_price
from src.util.models import Effect, Product, Substance


class SearchReferenceTests(unittest.TestCase):
    def setUp(self):
        # These experiments deliberately retain the historical, unrounded float model.
        patcher = patch.object(calc_modifier, "_calculate_price", legacy_price)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_all_products_match_legacy_through_four_ingredients(self):
        with patch.object(calc_modifier, "logger", quiet_logger):
            for product in calc_modifier.products:
                for size in (1, 2, 3, 4):
                    with self.subTest(product=product.name, size=size):
                        _, modifier, profit = calc_modifier.get_best_mix(size, product.name, "max")
                        actual_modifier, actual_profit, stats = search_reference.search(
                            product.name, "max", size
                        )
                        self.assertEqual((actual_modifier, actual_profit), (modifier, profit))
                        self.assertEqual(
                            stats["evaluated_candidates"],
                            sum(16**depth for depth in range(1, size + 1)),
                        )

    def test_six_ingredients_with_repetition_match_exact_states_at_low_level(self):
        for product in search_reference.lookup.products:
            with self.subTest(product=product.name):
                expected = search_runtime.search(product.name, "street_rat_i", 6)
                actual = search_reference.search(product.name, "street_rat_i", 6)
                self.assertEqual(actual[:2], expected[:2])
                self.assertEqual(
                    actual[2]["evaluated_candidates"], sum(4**depth for depth in range(1, 7))
                )

    def test_independent_modifier_and_profit_ties(self):
        with patch.multiple(
            search_reference.lookup,
            effects=[Effect("same", 0.5)],
            products=[Product("fixture", Decimal("10"), Decimal("0"), 1, [])],
            substances=[
                Substance("expensive", Decimal("2"), 1, "same", {}),
                Substance("cheap", Decimal("1"), 1, "same", {}),
            ],
        ):
            modifier, profit, stats = search_reference.search("fixture", 1, 6)
        self.assertEqual(modifier.substances, ["expensive"] * 6)
        self.assertEqual(profit.substances, ["cheap"])
        self.assertEqual(stats["evaluated_candidates"], 126)

    def test_candidate_budget_rejects_oversized_search_upfront(self):
        for size in (7, 10**100):
            with (
                self.subTest(size=size),
                self.assertRaises(search_reference.ReferenceSearchLimitExceeded),
            ):
                search_reference.search("og_kush", "max", size)


if __name__ == "__main__":
    unittest.main()

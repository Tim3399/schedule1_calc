"""Compare experimental state search against the independent exhaustive implementation."""

import logging
from pathlib import Path
import sys
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT), str(ROOT / "src")]

from functionality.logging import logging_config
from experiments.legacy_pricing import calculate_price as legacy_price

quiet_logger = logging.getLogger("search_runtime_tests")
quiet_logger.disabled = True
with patch.object(logging_config, "setup_logging", return_value=quiet_logger):
    from functionality import calc_modifier

from experiments import search_runtime
from src.util.models import Effect, Product, Substance
from decimal import Decimal


class SearchRuntimeTests(unittest.TestCase):
    def setUp(self):
        price_patcher = patch.object(calc_modifier, "_calculate_price", legacy_price)
        price_patcher.start()
        self.addCleanup(price_patcher.stop)
        patcher = patch.object(calc_modifier, "logger", quiet_logger)
        patcher.start()
        self.addCleanup(patcher.stop)

    def assert_matches_reference(self, product, level, size, beam_width=None):
        _, expected_modifier, expected_profit = calc_modifier.get_best_mix(size, product, level)
        modifier, profit, _ = search_runtime.search(product, level, size, beam_width=beam_width)
        self.assertEqual(modifier, expected_modifier)
        self.assertEqual(profit, expected_profit)

    def test_all_products_and_available_levels_match_exhaustive_search(self):
        for product in calc_modifier.products:
            for level in ("street_rat_i", "peddler_i", "max"):
                with self.subTest(product=product.name, level=level):
                    self.assert_matches_reference(product.name, level, 3)

    def test_short_searches_and_maximum_current_search_size_match(self):
        for size in (1, 2, 4):
            with self.subTest(size=size):
                self.assert_matches_reference("og_kush", "max", size)

    def test_transient_effect_ingredient_is_preserved(self):
        self.assert_matches_reference("cocaine", "max", 4)
        _, profit, _ = search_runtime.search("cocaine", "max", 4)
        self.assertEqual(profit.substances, ["banana", "cuke", "horse_semen", "mega_bean"])
        self.assertNotIn("gingeritis", profit.effects)
        self.assertEqual(profit.sell_price - profit.substance_cost, Decimal("421"))

    def test_separate_cheapest_and_earliest_paths_preserve_both_tie_rules(self):
        fixtures = {
            "effects": [Effect("same", 0.5)],
            "products": [Product("fixture", Decimal("10"), Decimal("0"), 1, [])],
            "substances": [
                Substance("expensive", Decimal("2"), 1, "same", {}),
                Substance("cheap", Decimal("1"), 1, "same", {}),
            ],
        }
        with (
            patch.multiple(calc_modifier, **fixtures),
            patch.multiple(search_runtime.lookup, **fixtures),
        ):
            self.assert_matches_reference("fixture", 1, 2)
            modifier, profit, _ = search_runtime.search("fixture", 1, 2)
        self.assertEqual(modifier.substances, ["expensive", "expensive"])
        self.assertEqual(profit.substances, ["cheap"])

    def test_wide_beam_matches_exact_when_no_states_need_pruning(self):
        self.assert_matches_reference("green_crack", "street_rat_i", 3, beam_width=10_000)

    def test_narrow_beam_returns_reproducible_available_recipes(self):
        product = "og_kush"
        level = "peddler_i"
        _, _, exact_profit = calc_modifier.get_best_mix(3, product, level)
        modifier, profit, _ = search_runtime.search(product, level, 3, beam_width=1)
        available = {
            s.name
            for s in calc_modifier.substances
            if s.level <= calc_modifier.level_name_to_int[level]
        }
        for winner in (modifier, profit):
            self.assertGreaterEqual(len(winner.substances), 1)
            self.assertLessEqual(len(winner.substances), 3)
            self.assertTrue(set(winner.substances).issubset(available))
            multiplier, active = calc_modifier._calculate_modificator(winner.substances, product)
            self.assertEqual(winner.modifier, multiplier)
            self.assertEqual(winner.effects, list(active))
            self.assertEqual(winner.sell_price, calc_modifier._calculate_price(product, multiplier))
            prices = {s.name: s.price for s in calc_modifier.substances}
            self.assertEqual(winner.substance_cost, sum(prices[s] for s in winner.substances))
        self.assertLessEqual(
            profit.sell_price - profit.substance_cost,
            exact_profit.sell_price - exact_profit.substance_cost,
        )

    def test_invalid_beam_width_is_rejected(self):
        for width in (0, -1):
            with self.subTest(width=width), self.assertRaises(ValueError):
                search_runtime.search("og_kush", "max", 2, beam_width=width)

    def test_both_modes_raise_instead_of_returning_partial_results_at_limit(self):
        for width in (None, 1):
            with (
                self.subTest(width=width),
                patch.object(search_runtime, "SEARCH_EXPANSION_LIMIT", 16),
            ):
                with self.assertRaises(search_runtime.SearchRuntimeLimitExceeded):
                    search_runtime.search("og_kush", "max", 2, beam_width=width)


if __name__ == "__main__":
    unittest.main()

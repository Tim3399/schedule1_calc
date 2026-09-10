"""Independent acceptance checks for exact hybrid search and explicit no-result limits."""

import sys
import unittest
from decimal import Decimal
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from experiments import search_bounded, search_reference
from src.util.models import Effect, Product, Substance


class BoundedSearchTests(unittest.TestCase):
    def test_all_products_match_exhaustive_reference(self):
        for product in search_reference.lookup.products:
            for size in (1, 3):
                with self.subTest(product=product.name, size=size):
                    expected = search_reference.search(product.name, "max", size)
                    actual = search_bounded.search(product.name, "max", size)
                    self.assertEqual(actual[:2], expected[:2])

    def test_streamed_tails_and_cache_eviction_do_not_change_winners(self):
        expected = search_reference.search("og_kush", "max", 4)
        for tail in (1, 2):
            for cache in (0, 4, 32768):
                with self.subTest(tail=tail, cache=cache):
                    actual = search_bounded.search(
                        "og_kush", "max", 4, tail_depth=tail, cache_limit=cache
                    )
                    self.assertEqual(actual[:2], expected[:2])

    def test_earliest_modifier_and_cheapest_profit_paths_are_both_preserved(self):
        with patch.multiple(
            search_bounded.lookup,
            effects=[Effect("same", 0.5)],
            products=[Product("fixture", Decimal(10), Decimal(0), 1, [])],
            substances=[
                Substance("expensive", Decimal(2), 1, "same", {}),
                Substance("cheap", Decimal(1), 1, "same", {}),
            ],
        ):
            modifier, profit, _ = search_bounded.search("fixture", 1, 6)
        self.assertEqual(modifier.substances, ["expensive"] * 6)
        self.assertEqual(profit.substances, ["cheap"])

    def test_every_resource_limit_raises_without_a_partial_winner(self):
        for limits in (
            {"expansion_limit": 1},
            {"frontier_limit": 1},
            {"time_limit_seconds": 1e-12},
        ):
            with self.subTest(limits=limits):
                with self.assertRaises(search_bounded.SearchLimitExceeded) as raised:
                    search_bounded.search("og_kush", "max", 5, **limits)
                self.assertFalse(hasattr(raised.exception, "best_profit"))
                self.assertFalse(hasattr(raised.exception, "best_modifier"))

    def test_outrageous_size_is_rejected_without_search(self):
        with self.assertRaises(ValueError):
            search_bounded.search("og_kush", "max", 10**100)


if __name__ == "__main__":
    unittest.main()

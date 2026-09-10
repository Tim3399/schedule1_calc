"""Verify lookahead beam outputs, bounded work and compatibility on exhaustive cases."""

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from experiments import search_fast, search_reference


class FastSearchTests(unittest.TestCase):
    def test_wide_beam_matches_reference_for_all_products(self):
        for product in search_reference.lookup.products:
            with self.subTest(product=product.name):
                expected = search_reference.search(product.name, "street_rat_i", 3)
                actual = search_fast.search(product.name, "street_rat_i", 3, beam_width=1000)
                self.assertEqual(actual[:2], expected[:2])

    def test_lookahead_results_respect_depth_and_are_reproducible(self):
        for size in (1, 2, 3):
            with self.subTest(size=size):
                expected = search_reference.search("og_kush", "max", size)
                result = search_fast.search("og_kush", "max", size, beam_width=4)
                repeated = search_fast.search("og_kush", "max", size, beam_width=4)
                self.assertEqual(result[:2], repeated[:2])
                for stats in (result[2], repeated[2]):
                    self.assertGreaterEqual(stats["elapsed_seconds"], 0)
                self.assertEqual(
                    {key: value for key, value in result[2].items() if key != "elapsed_seconds"},
                    {key: value for key, value in repeated[2].items() if key != "elapsed_seconds"},
                )
                for winner in result[:2]:
                    self.assertLessEqual(len(winner.substances), size)
                    self.assertGreaterEqual(len(winner.substances), 1)
                    self.assertTrue(
                        set(winner.substances).issubset(
                            {s.name for s in search_reference.lookup.substances}
                        )
                    )
                self.assertLessEqual(result[0].modifier, expected[0].modifier)
                self.assertLessEqual(
                    result[1].sell_price - result[1].substance_cost,
                    expected[1].sell_price - expected[1].substance_cost,
                )

    def test_budget_includes_work_and_returns_no_partial_result(self):
        for limits in ({"expansion_limit": 1}, {"time_limit_seconds": 1e-12}):
            with self.subTest(limits=limits), self.assertRaises(search_fast.SearchLimitExceeded):
                search_fast.search("og_kush", "max", 5, **limits)

    def test_single_state_beam_respects_its_width(self):
        _, _, stats = search_fast.search("og_kush", "max", 4, beam_width=1)
        self.assertTrue(all(count == 1 for count in stats["retained_states_by_depth"].values()))
        self.assertGreater(stats["beam_pruned_states"], 0)


if __name__ == "__main__":
    unittest.main()

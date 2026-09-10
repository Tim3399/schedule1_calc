"""Regression tests for calculator search limits and result retention."""

from pathlib import Path
import sys
import unittest
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "src"))

from functionality.logging import logging_config

with mock.patch.object(logging_config, "setup_logging", return_value=mock.Mock()):
    from functionality import calc_modifier
    from webapp.app import app


class CalculatorBudgetTests(unittest.TestCase):
    def setUp(self):
        app.config.update(TESTING=True)
        self.client = app.test_client()

    def test_json_endpoint_rejects_size_eight_before_cartesian_enumeration(self):
        with mock.patch.object(calc_modifier, "itertool_product") as product:
            response = self.client.post(
                "/get_best_mix",
                json={"combination_size": 8, "product_name": "og_kush", "level": "max"},
            )

        self.assertEqual(response.status_code, 400)
        self.assertIn("too many combinations", response.get_json()["error"])
        product.assert_not_called()

    def test_html_post_rejects_oversized_search_before_cartesian_enumeration(self):
        with mock.patch.object(calc_modifier, "itertool_product") as product:
            response = self.client.post(
                "/",
                data={"combination_size": "8", "product_name": "og_kush", "level": "max"},
            )

        self.assertEqual(response.status_code, 400)
        self.assertIn("too many combinations", response.get_data(as_text=True))
        product.assert_not_called()

    def test_exact_budget_boundary_is_accepted_and_next_size_is_rejected(self):
        available_count = len(calc_modifier.substances)
        exact_two_item_budget = available_count**2

        with mock.patch.object(calc_modifier, "COMBINATION_SEARCH_LIMIT", exact_two_item_budget):
            combinations, best_modifier, best_profit = calc_modifier.get_best_mix(
                2, "og_kush", "max"
            )
            with mock.patch.object(calc_modifier, "itertool_product") as product:
                with self.assertRaises(calc_modifier.CombinationSearchLimitExceeded) as raised:
                    calc_modifier.get_best_mix(3, "og_kush", "max")

        self.assertEqual(combinations, {})
        self.assertIsNotNone(best_modifier)
        self.assertIsNotNone(best_profit)
        self.assertEqual(raised.exception.allowed_size, 2)
        self.assertEqual(raised.exception.limit, exact_two_item_budget)
        product.assert_not_called()

    def test_huge_request_and_power_estimate_stop_without_enumeration(self):
        huge_size = 10**100
        with mock.patch.object(calc_modifier, "itertool_product") as product:
            with self.assertRaises(calc_modifier.CombinationSearchLimitExceeded):
                calc_modifier.get_best_mix(huge_size, "og_kush", "max")

        product.assert_not_called()
        self.assertEqual(
            calc_modifier._bounded_power_with_limit(2, huge_size, 200_000),
            200_001,
        )

    def test_default_search_retains_only_winners_and_matches_collection_mode(self):
        compact, compact_modifier, compact_profit = calc_modifier.get_best_mix(
            2, "green_crack", "hustler_iii"
        )
        collected, collected_modifier, collected_profit = calc_modifier.get_best_mix(
            2,
            "green_crack",
            "hustler_iii",
            collect_all_combinations=True,
        )

        self.assertEqual(compact, {})
        self.assertTrue(collected[2])
        self.assertTrue(collected[1])
        self.assertEqual(compact_modifier, collected_modifier)
        self.assertEqual(compact_profit, collected_profit)
        self.assertEqual(compact_modifier.substances, ["horse_semen", "mega_bean"])
        self.assertEqual(compact_profit.substances, ["viagra", "mega_bean"])

        response = self.client.post(
            "/get_best_mix",
            json={
                "combination_size": 2,
                "product_name": "green_crack",
                "level": "hustler_iii",
            },
        )
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["best_modifier"]["substances"], compact_modifier.substances)
        self.assertEqual(payload["best_profit"]["substances"], compact_profit.substances)

    def test_database_export_explicitly_collects_all_combinations(self):
        with (
            mock.patch.object(
                calc_modifier, "get_best_mix", return_value=({}, None, None)
            ) as search,
            mock.patch.object(calc_modifier, "store_all_combinations_normalized"),
        ):
            calc_modifier.generate_db_entrys(2, "og_kush", "max")

        search.assert_called_once_with(
            2,
            "og_kush",
            "max",
            collect_all_combinations=True,
        )


if __name__ == "__main__":
    unittest.main()

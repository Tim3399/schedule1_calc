"""Regression tests for ordered recipes that repeat ingredients."""

from decimal import Decimal
import logging
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
    from src.util.models import Substance
    from webapp.app import app


class RepeatedIngredientTests(unittest.TestCase):
    def setUp(self):
        app.config.update(TESTING=True)
        self.client = app.test_client()
        quiet_logger = logging.getLogger(f"{__name__}.{self.id()}")
        quiet_logger.disabled = True
        logger_patch = mock.patch.object(calc_modifier, "logger", quiet_logger)
        logger_patch.start()
        self.addCleanup(logger_patch.stop)

    def test_size_five_with_four_available_ingredients_works_everywhere(self):
        collected, best_modifier, best_profit = calc_modifier.get_best_mix(
            5,
            "og_kush",
            "street_rat_i",
            collect_all_combinations=True,
        )

        self.assertEqual(len(collected[5]), 4**5)
        repeated_recipe = "cuke_donut_donut_paracetamol_banana"
        self.assertEqual(
            collected[5][repeated_recipe].substances,
            ["cuke", "donut", "donut", "paracetamol", "banana"],
        )
        self.assertIsNotNone(best_modifier)
        self.assertIsNotNone(best_profit)

        payload = {
            "combination_size": 5,
            "product_name": "og_kush",
            "level": "street_rat_i",
        }
        json_response = self.client.post("/get_best_mix", json=payload)
        html_response = self.client.post("/", data=payload)

        self.assertEqual(json_response.status_code, 200)
        self.assertIn("best_modifier", json_response.get_json())
        self.assertEqual(html_response.status_code, 200)
        self.assertIn('id="result"', html_response.get_data(as_text=True))

    def test_minimum_effect_search_finds_repeated_size_five_recipe(self):
        desired_effects = [
            "calorie_dense",
            "explosive",
            "gingeritis",
            "jennerising",
            "slippery",
            "sneaky",
        ]

        below_size, below_results = calc_modifier.find_min_substances_for_effect(
            "og_kush",
            desired_effects,
            [],
            "street_rat_i",
            max_search_size=4,
        )
        found_size, found_results = calc_modifier.find_min_substances_for_effect(
            "og_kush",
            desired_effects,
            [],
            "street_rat_i",
            max_search_size=5,
            max_results=100,
        )

        self.assertEqual((below_size, below_results), (0, []))
        self.assertEqual(found_size, 5)
        self.assertIn(
            ["cuke", "donut", "donut", "paracetamol", "banana"],
            [result.substances for result in found_results],
        )

    def test_empty_ingredient_set_is_rejected_before_enumeration(self):
        with (
            mock.patch.object(calc_modifier, "substances", []),
            mock.patch.object(calc_modifier, "itertool_product") as product,
        ):
            with self.assertRaisesRegex(ValueError, "No substances"):
                calc_modifier.get_best_mix(1, "og_kush", "max")
            with self.assertRaisesRegex(ValueError, "Substanzen"):
                calc_modifier.find_min_substances_for_effect("og_kush", "energizing", [], "max")

        product.assert_not_called()

    def test_single_ingredient_search_is_supported_and_has_bounded_work(self):
        only_substance = Substance(
            name="only",
            price=Decimal("1"),
            level=1,
            resulting_effect="energizing",
            side_effect_replacements={},
        )
        with mock.patch.object(calc_modifier, "substances", [only_substance]):
            collected, best_modifier, best_profit = calc_modifier.get_best_mix(
                3,
                "og_kush",
                1,
                collect_all_combinations=True,
            )
            self.assertEqual(collected[3]["only_only_only"].substances, ["only"] * 3)
            self.assertIsNotNone(best_modifier)
            self.assertIsNotNone(best_profit)

            with mock.patch.object(calc_modifier, "itertool_product") as product:
                with self.assertRaisesRegex(
                    calc_modifier.CombinationSearchLimitExceeded,
                    "ingredient-processing budget units",
                ):
                    calc_modifier.get_best_mix(10**100, "og_kush", 1)

            product.assert_not_called()

            with mock.patch.object(calc_modifier, "itertool_product", return_value=()) as product:
                with self.assertRaises(calc_modifier.MinimumSearchLimitExceeded):
                    calc_modifier.find_min_substances_for_effect(
                        "og_kush",
                        "calorie_dense",
                        [],
                        1,
                        max_search_size=10**100,
                        combination_search_limit=3,
                    )

            self.assertEqual(product.call_count, 2)

    def test_extreme_minimum_search_size_caps_before_enumeration(self):
        with mock.patch.object(calc_modifier, "itertool_product", return_value=()) as product:
            with self.assertRaises(calc_modifier.MinimumSearchLimitExceeded):
                calc_modifier.find_min_substances_for_effect(
                    "og_kush",
                    "calorie_dense",
                    [],
                    "street_rat_i",
                    max_search_size=10**100,
                    combination_search_limit=4,
                )

        product.assert_called_once()


if __name__ == "__main__":
    unittest.main()

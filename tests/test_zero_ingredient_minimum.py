"""Regression tests for zero-ingredient minimum-effect matches."""

from contextlib import redirect_stdout
from decimal import Decimal
import io
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
    import main as main_module


class ZeroIngredientMinimumTests(unittest.TestCase):
    def setUp(self):
        quiet_logger = logging.getLogger(f"{__name__}.{self.id()}")
        quiet_logger.disabled = True
        logger_patch = mock.patch.object(calc_modifier, "logger", quiet_logger)
        logger_patch.start()
        self.addCleanup(logger_patch.stop)

    def test_base_product_can_be_the_exact_zero_ingredient_minimum(self):
        size, results = calc_modifier.find_min_substances_for_effect(
            "og_kush",
            "calming",
            [],
            "street_rat_i",
            max_search_size=0,
        )

        self.assertEqual(size, 0)
        self.assertEqual(len(results), 1)
        result = results[0]
        self.assertEqual(result.substances, [])
        self.assertEqual(result.effects, ["calming"])
        self.assertEqual(result.modifier, 0.1)
        self.assertEqual(result.substance_cost, Decimal("0"))
        self.assertEqual(result.sell_price, Decimal("38.50"))

    def test_base_match_needs_no_ingredients_or_combination_budget(self):
        for maximum in (0, 6):
            with (
                self.subTest(maximum=maximum),
                mock.patch.object(calc_modifier, "substances", []),
                mock.patch.object(calc_modifier, "itertool_product") as enumerate_recipes,
            ):
                size, results = calc_modifier.find_min_substances_for_effect(
                    "og_kush",
                    ["calming"],
                    [],
                    1,
                    max_search_size=maximum,
                    combination_search_limit=0,
                )
                self.assertEqual(size, 0)
                self.assertEqual(len(results), 1)
                enumerate_recipes.assert_not_called()

    def test_base_match_honors_excluded_effects_and_all_desired_effects(self):
        excluded = calc_modifier.find_min_substances_for_effect(
            "og_kush", "calming", "calming", "street_rat_i", max_search_size=0
        )
        missing = calc_modifier.find_min_substances_for_effect(
            "og_kush",
            ["calming", "energizing"],
            [],
            "street_rat_i",
            max_search_size=0,
        )

        self.assertEqual(excluded, (0, []))
        self.assertEqual(missing, (0, []))

    def test_positive_search_still_finds_a_non_base_recipe(self):
        size, results = calc_modifier.find_min_substances_for_effect(
            "og_kush",
            "energizing",
            [],
            "street_rat_i",
            max_search_size=1,
        )

        self.assertEqual(size, 1)
        self.assertTrue(results)
        self.assertTrue(all(result.substances for result in results))

    def test_invalid_product_and_level_are_not_accepted_by_base_shortcut(self):
        with self.assertRaisesRegex(ValueError, "Product 'unknown' not found"):
            calc_modifier.find_min_substances_for_effect(
                "unknown", "calming", [], "street_rat_i", max_search_size=0
            )
        with self.assertRaisesRegex(ValueError, "Invalid level name"):
            calc_modifier.find_min_substances_for_effect(
                "og_kush", "calming", [], "unknown", max_search_size=0
            )

    def test_negative_size_and_missing_ingredients_keep_prior_behavior(self):
        negative = calc_modifier.find_min_substances_for_effect(
            "og_kush", "calming", [], "street_rat_i", max_search_size=-1
        )
        with mock.patch.object(calc_modifier, "substances", []):
            with self.assertRaisesRegex(ValueError, "Substanzen"):
                calc_modifier.find_min_substances_for_effect(
                    "og_kush", "energizing", [], "street_rat_i", max_search_size=1
                )
            base_size, base_results = calc_modifier.find_min_substances_for_effect(
                "og_kush", "calming", [], "street_rat_i", max_search_size=1
            )

        self.assertEqual(negative, (0, []))
        self.assertEqual(base_size, 0)
        self.assertEqual(len(base_results), 1)

    def test_cli_prints_zero_ingredient_success_as_a_result(self):
        with (
            mock.patch.object(main_module, "get_best_mix", return_value=({}, None, None)),
            redirect_stdout(io.StringIO()) as output,
        ):
            self._run_cli()

        text = output.getvalue()
        self.assertIn("Minimum number of substances: 0", text)
        self.assertIn("Result 1", text)
        self.assertNotIn("No combination found for effect", text)
        self.assertNotIn("Minimum search incomplete", text)
        self.assertIn("Effects: calming", text)
        self.assertIn("Sell Price: 38.50$", text)
        self.assertIn("Substance Cost: 0.00$", text)

    def test_cli_keeps_complete_no_result_and_budget_messages_distinct(self):
        budget_error = calc_modifier.MinimumSearchLimitExceeded(6, 4, 200_000)

        complete_text = self._capture_cli((0, []))
        budget_text = self._capture_cli(budget_error)

        self.assertIn("No combination found for effect", complete_text)
        self.assertNotIn("Minimum search incomplete", complete_text)
        self.assertIn("Minimum search incomplete", budget_text)
        self.assertNotIn("No combination found for effect", budget_text)

    def _capture_cli(self, minimum_result):
        if isinstance(minimum_result, Exception):
            minimum_patch = mock.patch.object(
                main_module,
                "find_min_substances_for_effect",
                side_effect=minimum_result,
            )
        else:
            minimum_patch = mock.patch.object(
                main_module,
                "find_min_substances_for_effect",
                return_value=minimum_result,
            )

        with (
            minimum_patch,
            mock.patch.object(main_module, "get_best_mix", return_value=({}, None, None)),
            redirect_stdout(io.StringIO()) as output,
        ):
            self._run_cli()
        return output.getvalue()

    def _run_cli(self):
        main_module.main(
            product="og_kush",
            desired="calming",
            not_desired=None,
            max_level="street_rat_i",
            max_search_size=0,
            combination_size=1,
        )


if __name__ == "__main__":
    unittest.main()

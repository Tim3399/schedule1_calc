"""Regression tests for incomplete minimum-search reporting."""

from contextlib import redirect_stdout
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


DESIRED_EFFECTS = [
    "calorie_dense",
    "explosive",
    "gingeritis",
    "jennerising",
    "slippery",
    "sneaky",
]


class MinimumSearchBudgetTests(unittest.TestCase):
    def setUp(self):
        quiet_logger = logging.getLogger(f"{__name__}.{self.id()}")
        quiet_logger.disabled = True
        logger_patch = mock.patch.object(calc_modifier, "logger", quiet_logger)
        logger_patch.start()
        self.addCleanup(logger_patch.stop)

    def test_budget_limited_no_result_reports_last_completely_searched_size(self):
        searched_sizes = []

        def one_candidate(substances, repeat):
            searched_sizes.append(repeat)
            return [(substances[0],) * repeat]

        with (
            mock.patch.object(calc_modifier, "itertool_product", side_effect=one_candidate),
            mock.patch.object(
                calc_modifier, "_calculate_modificator", return_value=(0.0, {"calming": 0.1})
            ),
        ):
            with self.assertRaises(calc_modifier.MinimumSearchLimitExceeded) as raised:
                calc_modifier.find_min_substances_for_effect(
                    "og_kush",
                    "calorie_dense",
                    [],
                    "street_rat_i",
                    max_search_size=3,
                    combination_search_limit=4,
                )

        self.assertEqual(searched_sizes, [1])
        self.assertEqual(raised.exception.requested_size, 3)
        self.assertEqual(raised.exception.searched_size, 1)
        self.assertEqual(raised.exception.limit, 4)
        self.assertIn("incomplete", str(raised.exception))

    def test_budget_too_small_for_first_size_reports_zero_checked(self):
        with mock.patch.object(calc_modifier, "itertool_product") as product:
            with self.assertRaises(calc_modifier.MinimumSearchLimitExceeded) as raised:
                calc_modifier.find_min_substances_for_effect(
                    "og_kush",
                    "calorie_dense",
                    [],
                    "street_rat_i",
                    max_search_size=1,
                    combination_search_limit=3,
                )

        self.assertEqual(raised.exception.searched_size, 0)
        product.assert_not_called()

    def test_complete_no_result_keeps_existing_empty_tuple(self):
        result = calc_modifier.find_min_substances_for_effect(
            "og_kush",
            DESIRED_EFFECTS,
            [],
            "street_rat_i",
            max_search_size=4,
            combination_search_limit=256,
        )

        self.assertEqual(result, (0, []))

    def test_early_exact_minimum_returns_despite_larger_requested_size(self):
        size, results = calc_modifier.find_min_substances_for_effect(
            "og_kush",
            DESIRED_EFFECTS,
            [],
            "street_rat_i",
            max_search_size=10**100,
            max_results=100,
        )

        self.assertEqual(size, 5)
        self.assertIn(
            ["cuke", "donut", "donut", "paracetamol", "banana"],
            [result.substances for result in results],
        )

    def test_real_full_rank_trigger_reports_checked_size_four(self):
        with self.assertRaises(calc_modifier.MinimumSearchLimitExceeded) as raised:
            calc_modifier.find_min_substances_for_effect(
                "og_kush",
                DESIRED_EFFECTS,
                [],
                "max",
                max_search_size=6,
            )

        self.assertEqual(raised.exception.requested_size, 6)
        self.assertEqual(raised.exception.searched_size, 4)
        self.assertEqual(raised.exception.limit, 200_000)

    def test_cli_reports_incomplete_search_and_continues_best_mix(self):
        error = calc_modifier.MinimumSearchLimitExceeded(6, 4, 200_000)
        with (
            mock.patch.object(main_module, "find_min_substances_for_effect", side_effect=error),
            mock.patch.object(
                main_module, "get_best_mix", return_value=({}, None, None)
            ) as best_mix,
            redirect_stdout(io.StringIO()) as output,
        ):
            self._run_cli()

        text = output.getvalue()
        self.assertIn("Minimum search incomplete", text)
        self.assertIn("requested maximum size 6", text)
        self.assertIn("completely checked through size 4", text)
        self.assertIn("search-work limit 200,000", text)
        self.assertNotIn("No combination found for effect", text)
        self.assertIn("Best Results from get_best_mix", text)
        best_mix.assert_called_once()

    def test_cli_complete_no_result_uses_scoped_negative_message(self):
        with (
            mock.patch.object(main_module, "find_min_substances_for_effect", return_value=(0, [])),
            mock.patch.object(main_module, "get_best_mix", return_value=({}, None, None)),
            redirect_stdout(io.StringIO()) as output,
        ):
            self._run_cli()

        text = output.getvalue()
        self.assertIn("No combination found for effect", text)
        self.assertIn("within requested maximum size 6", text)
        self.assertNotIn("Minimum search incomplete", text)

    def _run_cli(self):
        main_module.main(
            product="og_kush",
            desired=",".join(DESIRED_EFFECTS),
            not_desired=None,
            max_level="max",
            max_search_size=6,
            combination_size=1,
        )


if __name__ == "__main__":
    unittest.main()

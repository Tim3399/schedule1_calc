"""Cross-language contract tests for the downloadable browser search model."""

import json
import shutil
import subprocess
import sys
import unittest
from decimal import Decimal
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT), str(ROOT / "src")]

from functionality.logging import logging_config

with mock.patch.object(logging_config, "setup_logging", return_value=mock.Mock()):
    from src.functionality import browser_catalog, calc_modifier, search_exact, search_fast
    from src.lookup import lookup


RUNNER = ROOT / "tests" / "browser" / "run-search-fixtures.cjs"
ENGINE = ROOT / "webapp" / "static" / "js" / "search-engine.js"


def _price(product_name):
    def calculate(active_effects):
        return calc_modifier._calculate_price(
            product_name,
            sum(active_effects.values()),
            active_effects=active_effects,
        )

    return calculate


def _serialize(result):
    return {
        "sell_price": float(result.sell_price),
        "substance_cost": float(result.substance_cost),
        "modifier": float(result.modifier),
        "substances": list(result.substances),
        "effects": list(result.effects),
    }


def _python_result(fixture):
    request = fixture["request"]
    options = fixture.get("options", {})
    product_name = request["product_name"].strip().lower().replace(" ", "_")
    if request["search_mode"] == "exact":
        modifier, profit, stats = search_exact.search(
            product_name,
            request["level"],
            request["combination_size"],
            price_from_effects=_price(product_name),
            **options,
        )
    else:
        modifier, profit, stats = search_fast.search(
            product_name,
            request["level"],
            request["combination_size"],
            price_from_effects=_price(product_name),
            **options,
        )
    mode = request["search_mode"]
    return {
        "search": {
            "mode": mode,
            "status": "optimal" if mode == "exact" else "approximate",
            "optimality_proven": mode == "exact" and stats["optimality_guaranteed"],
        },
        "best_modifier": _serialize(modifier),
        "best_profit": _serialize(profit),
    }


class BrowserSearchTests(unittest.TestCase):
    maxDiff = None

    def run_browser(self, fixtures):
        node = shutil.which("node")
        self.assertIsNotNone(node, "Node is required to verify the browser search engine")
        self.assertTrue(ENGINE.is_file(), f"Browser search engine is missing: {ENGINE}")
        self.assertTrue(RUNNER.is_file(), f"Browser fixture runner is missing: {RUNNER}")
        completed = subprocess.run(
            [node, str(RUNNER)],
            input=json.dumps({"catalog": browser_catalog.build_catalog(), "fixtures": fixtures}),
            text=True,
            capture_output=True,
            cwd=ROOT,
            timeout=120,
            check=False,
        )
        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertEqual(completed.stderr, "", "fixture runner must not emit diagnostic noise")
        return json.loads(completed.stdout)

    def test_browser_winners_match_python_across_products_modes_and_pruned_searches(self):
        fixtures = []
        for product in lookup.products:
            for size in (1, 3):
                for mode in ("exact", "fast"):
                    fixtures.append(
                        {
                            "label": f"{mode}:{product.name}:{size}",
                            "request": {
                                "combination_size": size,
                                "product_name": product.name,
                                "level": "max",
                                "search_mode": mode,
                            },
                        }
                    )
        for product_name in ("og_kush", "sour_diesel"):
            fixtures.append(
                {
                    "label": f"exact:{product_name}:5",
                    "request": {
                        "combination_size": 5,
                        "product_name": product_name,
                        "level": "max",
                        "search_mode": "exact",
                    },
                }
            )
        for beam_width in (1, 64):
            for lookahead in (0, 1):
                fixtures.append(
                    {
                        "label": f"fast:og_kush:4:beam={beam_width}:lookahead={lookahead}",
                        "request": {
                            "combination_size": 4,
                            "product_name": "og_kush",
                            "level": "max",
                            "search_mode": "fast",
                        },
                        "options": {"beam_width": beam_width, "lookahead": lookahead},
                    }
                )

        browser_outcomes = self.run_browser(fixtures)
        self.assertEqual(len(browser_outcomes), len(fixtures))
        for fixture, browser_outcome in zip(fixtures, browser_outcomes, strict=True):
            with self.subTest(fixture=fixture["label"]):
                self.assertTrue(browser_outcome["ok"], browser_outcome)
                browser_result = browser_outcome["result"]
                comparable = {
                    "search": browser_result["search"],
                    "best_modifier": browser_result["best_modifier"],
                    "best_profit": browser_result["best_profit"],
                }
                self.assertEqual(comparable, _python_result(fixture))

    def test_limits_never_expose_a_partial_winner_or_false_certification(self):
        base_request = {
            "combination_size": 2,
            "product_name": "og_kush",
            "level": "max",
            "search_mode": "exact",
        }
        fixtures = [
            {"label": "exact work", "request": base_request, "options": {"work_limit": 1}},
            {
                "label": "exact frontier",
                "request": base_request,
                "options": {"frontier_limit": 1},
            },
            {
                "label": "exact completion deadline",
                "request": {**base_request, "combination_size": 1},
                "options": {"time_limit_seconds": 1},
                "clock_advance_on_complete": True,
            },
            {
                "label": "fast completion deadline",
                "request": {
                    **base_request,
                    "combination_size": 1,
                    "search_mode": "fast",
                },
                "options": {"time_limit_seconds": 1},
                "clock_advance_on_complete": True,
            },
            {
                "label": "fast work",
                "request": {**base_request, "search_mode": "fast"},
                "options": {"work_limit": 1},
            },
            {
                "label": "maximum depth",
                "request": {**base_request, "combination_size": 17},
            },
        ]
        outcomes = self.run_browser(fixtures)
        for fixture, expected_reason, outcome in zip(
            fixtures,
            (
                "work_limit",
                "frontier_limit",
                "time_limit",
                "time_limit",
                "work_limit",
                "max_size",
            ),
            outcomes,
            strict=True,
        ):
            with self.subTest(fixture=fixture["label"]):
                self.assertFalse(outcome["ok"])
                self.assertEqual(outcome["error"]["name"], "SearchLimitExceeded")
                self.assertEqual(outcome["error"]["reason"], expected_reason)
                self.assertFalse(outcome["error"]["exposes_winners"])
                self.assertEqual(
                    outcome["error"]["completed_phase_reached"],
                    fixture.get("clock_advance_on_complete", False),
                )

    def test_catalog_preserves_ordered_replacements_and_exact_money_units(self):
        catalog = browser_catalog.build_catalog()
        self.assertEqual(catalog["effect_scale"], 100)
        self.assertEqual(catalog["money_scale"], 100)
        self.assertEqual(
            [item["name"] for item in catalog["substances"]],
            [item.name for item in lookup.substances],
        )
        for exported, source in zip(catalog["substances"], lookup.substances, strict=True):
            self.assertEqual(exported["price_cents"], int(source.price * Decimal(100)))
            self.assertEqual(
                exported["replacements"],
                [list(pair) for pair in source.side_effect_replacements.items()],
            )

    def test_all_browser_node_tests_are_discovered_by_the_python_suite(self):
        node = shutil.which("node")
        self.assertIsNotNone(node, "Node is required to run browser unit tests")
        test_files = sorted((ROOT / "tests" / "browser").glob("*.test.cjs"))
        self.assertTrue(test_files, "No browser *.test.cjs files were found")
        completed = subprocess.run(
            [node, "--test", *(str(path) for path in test_files)],
            text=True,
            capture_output=True,
            cwd=ROOT,
            timeout=120,
            check=False,
        )
        self.assertEqual(completed.returncode, 0, completed.stdout + completed.stderr)


if __name__ == "__main__":
    unittest.main()

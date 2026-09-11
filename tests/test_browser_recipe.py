"""Cross-language contract tests for direct ordered browser recipes."""

import json
import shutil
import subprocess
import sys
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT), str(ROOT / "src")]

from functionality.logging import logging_config

with mock.patch.object(logging_config, "setup_logging", return_value=mock.Mock()):
    from src.functionality import browser_catalog, calc_modifier
    from src.lookup import lookup


RUNNER = ROOT / "tests" / "browser" / "run-recipe-fixtures.cjs"


class BrowserRecipeTests(unittest.TestCase):
    maxDiff = None

    def test_real_ordered_recipes_match_independent_python_calculation(self):
        long_recipe = [
            "cuke",
            "flu_medicine",
            "gasoline",
            "donut",
            "energy_drink",
            "mouth_wash",
            "motor_oil",
            "banana",
            "chili",
            "iodine",
            "paracetamol",
            "viagra",
            "horse_semen",
            "mega_bean",
        ]
        fixtures = [
            {"product_name": "og_kush", "substances": []},
            {"product_name": "green_crack", "substances": ["cuke", "cuke", "gasoline"]},
            {"product_name": "cocaine", "substances": long_recipe},
        ]

        node = shutil.which("node")
        self.assertIsNotNone(node, "Node is required to verify direct browser recipes")
        completed = subprocess.run(
            [node, str(RUNNER)],
            input=json.dumps({"catalog": browser_catalog.build_catalog(), "fixtures": fixtures}),
            text=True,
            capture_output=True,
            cwd=ROOT,
            timeout=30,
            check=False,
        )
        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertEqual(completed.stderr, "", "fixture runner must not emit diagnostic noise")

        substance_prices = {substance.name: substance.price for substance in lookup.substances}
        for request, browser_result in zip(fixtures, json.loads(completed.stdout), strict=True):
            with self.subTest(request=request):
                modifier, effects = calc_modifier._calculate_modificator(
                    request["substances"], request["product_name"]
                )
                expected = {
                    "sell_price": float(
                        calc_modifier._calculate_price(
                            request["product_name"], modifier, active_effects=effects
                        )
                    ),
                    "substance_cost": float(
                        sum(substance_prices[name] for name in request["substances"])
                    ),
                    "modifier": modifier,
                    "substances": request["substances"],
                    "effects": list(effects),
                }
                self.assertEqual(browser_result, expected)


if __name__ == "__main__":
    unittest.main()

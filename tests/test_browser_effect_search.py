"""Real-catalog target searches checked against complete Python enumeration."""

import itertools
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


class BrowserEffectSearchTests(unittest.TestCase):
    def test_effect_constraint_winners_match_complete_python_search(self):
        prices = {substance.name: substance.price for substance in lookup.substances}

        def evaluate(product, recipe):
            modifier, effects = calc_modifier._calculate_modificator(recipe, product)
            return {
                "effects": list(effects),
                "substances": list(recipe),
                "modifier": modifier,
                "sell_price": float(
                    calc_modifier._calculate_price(product, modifier, active_effects=effects)
                ),
                "substance_cost": float(sum(prices[name] for name in recipe)),
            }

        cases = []
        for product in lookup.products:
            targets = evaluate(product.name, ["cuke", "banana"])["effects"]
            cases.append((product.name, "max", 3, targets, 3, "exact", []))
        cases.extend(
            [
                ("og_kush", "street_rat_i", 0, ["calming"], 0, "exact", []),
                ("cocaine", "max", 3, ["zombifying"], 3, "exact", []),
                (
                    "shroom",
                    "street_rat_i",
                    16,
                    [
                        "calorie_dense",
                        "thought_provoking",
                        "balding",
                        "sneaky",
                        "jennerising",
                        "gingeritis",
                    ],
                    6,
                    "exact",
                    [],
                ),
                ("og_kush", "max", 1, ["energizing"], 1, "contains", ["toxic"]),
                ("og_kush", "max", 1, ["sneaky"], 1, "contains", ["toxic"]),
                ("og_kush", "max", 1, [], 1, "contains", ["calming"]),
            ]
        )
        fixtures, expected = [], []
        for product, level, maximum, targets, oracle_depth, match_mode, excluded in cases:
            available = [
                s.name for s in lookup.substances if s.level <= lookup.level_name_to_int[level]
            ]
            target_set = set(targets)
            excluded_set = set(excluded)
            winner = None
            for depth in range(oracle_depth + 1):
                rank = None
                for indexes in itertools.product(range(len(available)), repeat=depth):
                    recipe = [available[index] for index in indexes]
                    candidate = evaluate(product, recipe)
                    final_effects = set(candidate["effects"])
                    if excluded_set & final_effects or not target_set <= final_effects:
                        continue
                    if match_mode == "exact" and final_effects != target_set:
                        continue
                    candidate_rank = (sum(prices[name] for name in recipe), indexes)
                    if rank is None or candidate_rank < rank:
                        winner, rank = candidate, candidate_rank
                if winner is not None:
                    break
            expected.append(winner)
            fixtures.append(
                {
                    "product_name": product,
                    "level": level,
                    "combination_size": maximum,
                    "target_effects": list(reversed(targets)),
                    "match_mode": match_mode,
                    "excluded_effects": list(reversed(excluded)),
                    "search_mode": "exact",
                }
            )

        node = shutil.which("node")
        self.assertIsNotNone(node, "Node is required for effect-search verification")
        runner = """
const engine = require('./webapp/static/js/search-engine.js');
const data = JSON.parse(require('node:fs').readFileSync(0, 'utf8'));
process.stdout.write(JSON.stringify(data.fixtures.map(request => engine.searchEffects(data.catalog, request))));
"""
        completed = subprocess.run(
            [node, "-e", runner],
            input=json.dumps(
                {
                    "catalog": browser_catalog.build_catalog(),
                    "fixtures": fixtures,
                }
            ),
            text=True,
            capture_output=True,
            cwd=ROOT,
            timeout=45,
            check=False,
        )
        self.assertEqual(completed.returncode, 0, completed.stderr)
        for request, winner, actual in zip(
            fixtures, expected, json.loads(completed.stdout), strict=True
        ):
            with self.subTest(request=request):
                self.assertEqual(actual["recipe"], winner)
                self.assertEqual(actual["match_mode"], request["match_mode"])
                self.assertEqual(actual["target_effects"], request["target_effects"])
                self.assertEqual(actual["excluded_effects"], request["excluded_effects"])
                self.assertEqual(
                    actual["search"],
                    {
                        "mode": "exact",
                        "status": "optimal" if winner else "not_found",
                        "optimality_proven": True,
                    },
                )


if __name__ == "__main__":
    unittest.main()

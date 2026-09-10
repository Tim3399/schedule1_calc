"""Regression tests for exact decimal price arithmetic."""

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
from tests.api_test_support import authorized_client

with mock.patch.object(logging_config, "setup_logging", return_value=mock.Mock()):
    from functionality import calc_modifier
    from src.util.models import Effect, Product, Substance
    from webapp.app import app


class PriceArithmeticTests(unittest.TestCase):
    def setUp(self):
        app.config.update(TESTING=True)
        self.client = authorized_client(self, app)
        quiet_logger = logging.getLogger(f"{__name__}.{self.id()}")
        quiet_logger.disabled = True
        logger_patch = mock.patch.object(calc_modifier, "logger", quiet_logger)
        logger_patch.start()
        self.addCleanup(logger_patch.stop)

    def test_direct_price_calculation_preserves_decimal_boundaries(self):
        product = Product("fixture", Decimal("100"), Decimal("0"), 1, [])
        cases = {
            0.0049: Decimal("100.4900"),
            0.005: Decimal("100.500"),
            0.0051: Decimal("100.5100"),
            0.015: Decimal("101.500"),
            0.484: Decimal("148.400"),
        }

        with mock.patch.object(calc_modifier, "products", [product]):
            for multiplier, expected in cases.items():
                with self.subTest(multiplier=multiplier):
                    self.assertEqual(
                        calc_modifier._calculate_price("fixture", multiplier),
                        expected,
                    )

    def test_active_effect_values_avoid_float_sum_residue(self):
        product = Product("fixture", Decimal("10"), Decimal("0"), 1, [])
        active_effects = {"first": 0.1, "second": 0.2}
        float_total = sum(active_effects.values())

        with mock.patch.object(calc_modifier, "products", [product]):
            exact = calc_modifier._calculate_price("fixture", float_total, active_effects)
            reconstructed = calc_modifier._calculate_price("fixture", float_total)

        self.assertEqual(float_total, 0.30000000000000004)
        self.assertEqual(exact, Decimal("13.0"))
        self.assertEqual(reconstructed, Decimal("13.00000000000000040"))

    def test_explicit_empty_effects_override_the_float_total(self):
        product = Product("fixture", Decimal("35.00"), Decimal("0"), 1, [])

        with mock.patch.object(calc_modifier, "products", [product]):
            price = calc_modifier._calculate_price("fixture", 0.75, {})

        self.assertEqual(price, Decimal("35.00"))

    def test_profit_tie_keeps_first_recipe_despite_different_float_sums(self):
        fixtures = {
            "effects": [
                Effect("base", 0.1),
                Effect("additional", 0.7),
                Effect("combined", 0.8),
                Effect("zero", 0.0),
            ],
            "products": [Product("fixture", Decimal("35"), Decimal("0"), 1, ["base"])],
            "substances": [
                Substance("residue", Decimal("1"), 1, "additional", {}),
                Substance("exact", Decimal("1"), 1, "zero", {"base": "combined"}),
            ],
        }

        with mock.patch.multiple(calc_modifier, **fixtures):
            _, best_modifier, best_profit = calc_modifier.get_best_mix(1, "fixture", 1)

        self.assertEqual(best_modifier.substances, ["exact"])
        self.assertEqual(best_profit.substances, ["residue"])
        self.assertEqual(best_profit.sell_price, Decimal("63.0"))
        self.assertEqual(best_modifier.sell_price, Decimal("63.0"))

    def test_best_mix_and_http_use_the_same_exact_price(self):
        _, best_modifier, best_profit = calc_modifier.get_best_mix(2, "green_crack", "hustler_iii")
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
        self.assertEqual(best_modifier.sell_price, Decimal("85.40"))
        self.assertEqual(best_profit.sell_price, Decimal("83.30"))
        self.assertEqual(payload["best_modifier"]["sell_price"], float(best_modifier.sell_price))
        self.assertEqual(payload["best_profit"]["sell_price"], float(best_profit.sell_price))

    def test_database_export_receives_exact_calculated_prices(self):
        with mock.patch.object(calc_modifier, "store_all_combinations_normalized") as store:
            calc_modifier.generate_db_entrys(1, "og_kush", "street_rat_i")

        store.assert_called_once()
        combinations = store.call_args.args[3]
        self.assertEqual(combinations["cuke"].sell_price, Decimal("46.2000"))


if __name__ == "__main__":
    unittest.main()

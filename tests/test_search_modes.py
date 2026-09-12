"""The exact API must certify both winners or expose none, including late limits."""

import sys
import unittest
from decimal import Decimal
from pathlib import Path
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT), str(ROOT / "src")]

from functionality.logging import logging_config
from src.util.models import Effect, Product, Substance
from tests.api_test_support import authorized_client

with patch.object(logging_config, "setup_logging", return_value=Mock()):
    from functionality import calc_modifier
    from src.functionality import mix_search, search_exact, search_fast
    from webapp import app as app_module


class SearchModeTests(unittest.TestCase):
    def setUp(self):
        app_module.app.config.update(TESTING=True)
        self.client = authorized_client(self, app_module.app)
        self.request_data = {
            "combination_size": 3,
            "product_name": "og_kush",
            "level": "max",
        }
        logger_patch = patch.object(calc_modifier, "logger", Mock())
        logger_patch.start()
        self.addCleanup(logger_patch.stop)

    def test_both_modes_match_current_price_oracle_on_complete_small_searches(self):
        for product in calc_modifier.products:
            for size in (1, 3):
                expected = calc_modifier.get_best_mix(size, product.name, "max")[1:]
                for mode in ("exact", "fast"):
                    with self.subTest(product=product.name, size=size, mode=mode):
                        metadata, *winners = mix_search.get_best_mix(
                            size, product.name, "max", search_mode=mode
                        )
                        self.assertEqual(tuple(winners), expected)
                        self.assertEqual(metadata["optimality_proven"], mode == "exact")
                        self.assertEqual(
                            metadata["status"], "optimal" if mode == "exact" else "approximate"
                        )

    def test_complete_exact_api_certifies_both_results_by_default(self):
        response = self.client.post("/get_best_mix", json=self.request_data)
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(
            payload["search"],
            {"mode": "exact", "status": "optimal", "optimality_proven": True},
        )
        self.assertTrue(payload["best_profit"]["substances"])
        self.assertTrue(payload["best_modifier"]["substances"])

    def test_fast_api_and_html_never_claim_global_optimality(self):
        data = {**self.request_data, "search_mode": "fast"}
        response = self.client.post("/get_best_mix", json=data)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json()["search"],
            {"mode": "fast", "status": "approximate", "optimality_proven": False},
        )
        html_response = self.client.post("/", data=data)
        self.assertEqual(html_response.status_code, 200)
        html = html_response.get_data(as_text=True)
        self.assertIn("optimality not guaranteed", html)
        self.assertNotIn("Best Profit Combination", html)
        self.assertNotIn("Optimality proven", html)

    def test_exact_limit_after_finding_candidates_never_calls_fast_or_returns_winners(self):
        with (
            patch.object(mix_search, "EXACT_OPTIONS", {"work_limit": 1}),
            patch.object(search_fast, "search") as fast,
        ):
            for route in ("/get_best_mix", "/"):
                with self.subTest(route=route):
                    response = (
                        self.client.post(route, json=self.request_data)
                        if route == "/get_best_mix"
                        else self.client.post(route, data=self.request_data)
                    )
                    self.assertEqual(response.status_code, 503)
                    if route == "/get_best_mix":
                        payload = response.get_json()
                        self.assertNotIn("best_profit", payload)
                        self.assertNotIn("best_modifier", payload)
                        self.assertEqual(payload["search"]["status"], "incomplete")
                        self.assertFalse(payload["search"]["optimality_proven"])
                    else:
                        html = response.get_data(as_text=True)
                        self.assertIn("Search incomplete", html)
                        self.assertNotIn("Best Profit Combination", html)
                        self.assertNotIn("Best Modifier Combination", html)
            fast.assert_not_called()

    def test_deadline_at_completion_withholds_already_discovered_winners(self):
        with (
            patch.object(search_exact, "perf_counter", side_effect=[0.0, 2.0]),
            patch.object(mix_search, "EXACT_OPTIONS", {"time_limit_seconds": 1.0}),
            patch.object(search_fast, "search") as fast,
            patch.object(calc_modifier, "_calculate_price", return_value=Decimal(100)) as price,
        ):
            with self.assertRaises(mix_search.SearchIncomplete) as raised:
                mix_search.get_best_mix(1, "og_kush", "street_rat_i")
            self.assertTrue(price.called)
            self.assertFalse(hasattr(raised.exception, "best_profit"))
            fast.assert_not_called()

    def test_fast_limit_never_calls_exact_as_an_implicit_fallback(self):
        with (
            patch.object(mix_search, "FAST_OPTIONS", {"work_limit": 1}),
            patch.object(search_exact, "search") as exact,
        ):
            response = self.client.post(
                "/get_best_mix", json={**self.request_data, "search_mode": "fast"}
            )
        self.assertEqual(response.status_code, 503)
        self.assertNotIn("best_profit", response.get_json())
        self.assertEqual(response.get_json()["search"]["mode"], "fast")
        exact.assert_not_called()

    def test_both_engines_use_central_pricing_with_individual_effect_values(self):
        for mode in ("exact", "fast"):
            with (
                self.subTest(mode=mode),
                patch.object(
                    calc_modifier, "_calculate_price", return_value=Decimal("123.45")
                ) as price,
            ):
                _, modifier, profit = mix_search.get_best_mix(1, "OG Kush", "max", search_mode=mode)
                self.assertEqual(modifier.sell_price, Decimal("123.45"))
                self.assertEqual(profit.sell_price, Decimal("123.45"))
                for call in price.call_args_list:
                    self.assertEqual(call.args[0], "og_kush")
                    self.assertIsInstance(call.kwargs["active_effects"], dict)
                    self.assertEqual(call.args[1], sum(call.kwargs["active_effects"].values()))

    def test_tied_modifier_prefers_profit_then_shorter_recipe_in_both_engines(self):
        fixture = {
            "effects": [Effect("same", 0.5)],
            "products": [Product("fixture", Decimal(10), Decimal(0), 1, [])],
            "substances": [
                Substance("expensive", Decimal(2), 1, "same", {}),
                Substance("cheap", Decimal(1), 1, "same", {}),
            ],
        }

        def price(active_effects):
            return Decimal(10) * (
                Decimal(1) + sum(map(Decimal.from_float, active_effects.values()))
            )

        with patch.multiple(search_exact.lookup, **fixture):
            for engine in (search_exact, search_fast):
                with self.subTest(engine=engine.__name__):
                    modifier, profit, stats = engine.search(
                        "fixture", 1, 16, price_from_effects=price
                    )
                    self.assertEqual(modifier.substances, ["cheap"])
                    self.assertEqual(profit.substances, ["cheap"])
                    self.assertEqual(modifier.substance_cost, Decimal(1))
                    self.assertEqual(stats["work_units"], 4)

    def test_all_self_loops_still_return_one_step_and_skip_useless_repetitions(self):
        fixture = {
            "effects": [Effect("same", 0.5)],
            "products": [Product("fixture", Decimal(10), Decimal(0), 1, ["same"])],
            "substances": [
                Substance("costly_loop", Decimal(1), 1, "same", {}),
                Substance("free_loop", Decimal(0), 1, "same", {}),
            ],
        }

        def price(_active_effects):
            return Decimal(15)

        with patch.multiple(search_exact.lookup, **fixture):
            for engine in (search_exact, search_fast):
                with self.subTest(engine=engine.__name__):
                    modifier, profit, stats = engine.search(
                        "fixture", 1, 16, price_from_effects=price
                    )
                    self.assertEqual(modifier.substances, ["free_loop"])
                    self.assertEqual(profit.substances, ["free_loop"])
                    self.assertEqual(modifier.effects, ["same"])
                    self.assertEqual(stats["work_units"], 2)

    def test_effect_order_is_part_of_dominance_state_in_both_engines(self):
        fixture = {
            "effects": [Effect("a", 0.1), Effect("b", 0.2)],
            "products": [Product("fixture", Decimal(10), Decimal(0), 1, [])],
            "substances": [
                Substance("add_a", Decimal(0), 1, "a", {}),
                Substance("add_b", Decimal(0), 1, "b", {}),
            ],
        }

        def price(active_effects):
            return Decimal(10) + sum(
                (Decimal.from_float(value) * Decimal(10) for value in active_effects.values()),
                Decimal(0),
            )

        with patch.multiple(search_exact.lookup, **fixture):
            for engine in (search_exact, search_fast):
                with self.subTest(engine=engine.__name__):
                    modifier, _, stats = engine.search("fixture", 1, 2, price_from_effects=price)
                    self.assertEqual(modifier.substances, ["add_a", "add_b"])
                    self.assertEqual(modifier.effects, ["a", "b"])
                    if engine is search_fast:
                        self.assertEqual(stats["unique_states_by_depth"][2], 2)

    def test_invalid_mode_is_rejected_before_search(self):
        with patch.object(app_module, "get_best_mix") as search:
            for mode in (None, False, 1, "", "automatic", [], {}):
                with self.subTest(mode=mode):
                    response = self.client.post(
                        "/get_best_mix", json={**self.request_data, "search_mode": mode}
                    )
                    self.assertEqual(response.status_code, 400)
            search.assert_not_called()

    def test_uncertified_exact_engine_result_is_not_published(self):
        winner = Mock()
        with patch.object(
            search_exact, "search", return_value=(winner, winner, {"optimality_guaranteed": False})
        ):
            response = self.client.post("/get_best_mix", json=self.request_data)
        self.assertEqual(response.status_code, 500)
        self.assertNotIn("best_profit", response.get_json())
        self.assertNotIn("best_modifier", response.get_json())

    def test_html_validation_error_preserves_explicit_fast_selection(self):
        response = self.client.post(
            "/", data={**self.request_data, "combination_size": 0, "search_mode": "fast"}
        )
        self.assertEqual(response.status_code, 400)
        self.assertRegex(
            response.get_data(as_text=True),
            r'<input(?=[^>]*id="search-mode-fast")(?=[^>]*checked)[^>]*>',
        )

    def test_huge_depth_is_incomplete_instead_of_infeasible_or_approximate(self):
        response = self.client.post(
            "/get_best_mix", json={**self.request_data, "combination_size": 10**100}
        )
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.get_json()["search"]["status"], "incomplete")
        self.assertNotIn("best_profit", response.get_json())


if __name__ == "__main__":
    unittest.main()

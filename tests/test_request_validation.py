"""Request validation tests for the calculator HTML and JSON endpoints."""

from decimal import Decimal
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
    from src.util.models import CombinationResult
    from webapp import app as app_module


class RequestValidationTests(unittest.TestCase):
    def setUp(self):
        app_module.app.config.update(TESTING=True)
        self.client = authorized_client(self, app_module.app)
        self.valid_json = {
            "combination_size": "1",
            "product_name": "og_kush",
            "level": "street_rat_i",
        }

    def assert_json_client_error(self, payload):
        with mock.patch.object(app_module, "get_best_mix") as calculate:
            if payload is None:
                response = self.client.post(
                    "/get_best_mix", data="null", content_type="application/json"
                )
            else:
                response = self.client.post("/get_best_mix", json=payload)

        self.assertEqual(response.status_code, 400)
        self.assertIsInstance(response.get_json().get("error"), str)
        calculate.assert_not_called()

    def test_json_rejects_non_object_and_missing_fields_before_calculation(self):
        for payload in (None, [], "request", {"combination_size": 1}, {"level": "max"}):
            with self.subTest(payload=payload):
                self.assert_json_client_error(payload)

    def test_json_rejects_invalid_combination_sizes_before_calculation(self):
        invalid_sizes = [
            True,
            False,
            0,
            -1,
            1.0,
            1.5,
            "",
            "0",
            "-1",
            "1.0",
            "1e2",
            None,
            [],
            {},
            "9" * 5000,
        ]
        for size in invalid_sizes:
            with self.subTest(size=size):
                self.assert_json_client_error({**self.valid_json, "combination_size": size})

    def test_json_rejects_invalid_products_and_levels_before_calculation(self):
        invalid_fields = {
            "product_name": [None, "", "unknown", 1, [], {}],
            "level": [None, "", "unknown", True, 0, 52, 1.0, [], {}],
        }
        for field, values in invalid_fields.items():
            for value in values:
                with self.subTest(field=field, value=value):
                    self.assert_json_client_error({**self.valid_json, field: value})

    def test_json_malformed_body_and_wrong_content_type_are_structured_errors(self):
        malformed = self.client.post("/get_best_mix", data="{", content_type="application/json")
        wrong_type = self.client.post("/get_best_mix", data="{}", content_type="text/plain")

        self.assertEqual(malformed.status_code, 400)
        self.assertEqual(malformed.get_json(), {"error": "Malformed JSON body."})
        self.assertEqual(wrong_type.status_code, 415)
        self.assertIsInstance(wrong_type.get_json().get("error"), str)

    def test_json_accepts_digit_string_aliases_and_numeric_level(self):
        aliases = self.client.post(
            "/get_best_mix",
            json={
                "combination_size": "1",
                "product_name": " OG Kush ",
                "level": " Street Rat I ",
            },
        )
        numeric_level = self.client.post(
            "/get_best_mix",
            json={"combination_size": 1, "product_name": "og_kush", "level": 1},
        )

        self.assertEqual(aliases.status_code, 200)
        self.assertEqual(numeric_level.status_code, 200)
        self.assertIn("best_modifier", aliases.get_json())
        self.assertIn("best_profit", numeric_level.get_json())

    def test_html_rejects_invalid_and_missing_fields_before_calculation(self):
        invalid_forms = [
            {},
            {"combination_size": "1", "product_name": "og_kush"},
            {"combination_size": "1.0", "product_name": "og_kush", "level": "max"},
            {"combination_size": "1", "product_name": "unknown", "level": "max"},
            {"combination_size": "1", "product_name": "og_kush", "level": "unknown"},
            {"combination_size": "9" * 5000, "product_name": "og_kush", "level": "max"},
        ]
        with mock.patch.object(app_module, "get_best_mix") as calculate:
            for form in invalid_forms:
                with self.subTest(form=form):
                    response = self.client.post("/", data=form)
                    self.assertEqual(response.status_code, 400)
                    self.assertIn('role="alert"', response.get_data(as_text=True))

        calculate.assert_not_called()

    def test_recipe_larger_than_available_ingredient_count_is_accepted(self):
        request_data = {
            "combination_size": 5,
            "product_name": "og_kush",
            "level": "street_rat_i",
        }
        with mock.patch.object(
            app_module,
            "get_best_mix",
            return_value=(
                {},
                mock.Mock(
                    sell_price=1,
                    substance_cost=1,
                    modifier=0,
                    substances=["cuke"] * 5,
                    effects=[],
                ),
                mock.Mock(
                    sell_price=1,
                    substance_cost=1,
                    modifier=0,
                    substances=["cuke"] * 5,
                    effects=[],
                ),
            ),
        ) as calculate:
            json_response = self.client.post("/get_best_mix", json=request_data)
            html_response = self.client.post("/", data=request_data)

        self.assertEqual(json_response.status_code, 200)
        self.assertEqual(html_response.status_code, 200)
        self.assertEqual(calculate.call_count, 2)

    def test_html_error_message_is_escaped(self):
        response = self.client.post(
            "/",
            data={
                "combination_size": "1",
                "product_name": "<script>alert(1)</script>",
                "level": "max",
            },
        )

        html = response.get_data(as_text=True)
        self.assertEqual(response.status_code, 400)
        self.assertIn("&lt;script&gt;alert(1)&lt;/script&gt;", html)
        self.assertNotIn("<script>alert(1)</script>", html)
        self.assertLess(html.index('id="result"'), html.index('role="alert"'))

    def test_internal_value_error_is_generic_500_for_both_endpoints(self):
        with mock.patch.object(
            app_module, "get_best_mix", side_effect=ValueError("private detail")
        ):
            json_response = self.client.post("/get_best_mix", json=self.valid_json)
            html_response = self.client.post("/", data=self.valid_json)

        self.assertEqual(json_response.status_code, 500)
        self.assertNotIn("private detail", json_response.get_json()["error"])
        self.assertEqual(html_response.status_code, 500)
        self.assertNotIn("private detail", html_response.get_data(as_text=True))
        self.assertIn('role="alert"', html_response.get_data(as_text=True))

    def test_internal_errors_are_logged_with_tracebacks(self):
        with (
            mock.patch.object(app_module, "get_best_mix", side_effect=RuntimeError("broken")),
            mock.patch.object(app_module.logger, "exception") as log_exception,
        ):
            self.client.post("/get_best_mix", json=self.valid_json)
            self.client.post("/", data=self.valid_json)

        self.assertEqual(log_exception.call_count, 2)

    def test_missing_or_broken_results_are_generic_500(self):
        valid_result = CombinationResult(
            sell_price=Decimal("1"),
            substance_cost=Decimal("1"),
            modifier=0.0,
            substances=[],
            effects=[],
        )
        for result in (None, object()):
            with self.subTest(result=result):
                with mock.patch.object(
                    app_module, "get_best_mix", return_value=({}, result, valid_result)
                ):
                    json_response = self.client.post("/get_best_mix", json=self.valid_json)
                    html_response = self.client.post("/", data=self.valid_json)

                self.assertEqual(json_response.status_code, 500)
                self.assertEqual(json_response.get_json(), {"error": app_module._INTERNAL_ERROR})
                self.assertEqual(html_response.status_code, 500)

    def test_html_input_declares_positive_integer_constraints(self):
        html = self.client.get("/").get_data(as_text=True)

        self.assertIn('min="1"', html)
        self.assertIn('step="1"', html)


if __name__ == "__main__":
    unittest.main()

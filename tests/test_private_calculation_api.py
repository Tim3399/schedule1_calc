"""Access-control contract for the retained server-side calculation endpoints."""

import sys
import unittest
from decimal import Decimal
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT), str(ROOT / "src")]

from functionality.logging import logging_config

with mock.patch.object(logging_config, "setup_logging", return_value=mock.Mock()):
    from src.util.models import CombinationResult
    from webapp import app as app_module


class PrivateCalculationApiTests(unittest.TestCase):
    token = "private-test-token-that-must-never-be-rendered"

    def setUp(self):
        configuration = mock.patch.dict(
            app_module.app.config,
            {
                "TESTING": True,
                "SERVER_CALCULATION_TOKEN": self.token,
                "HTTP_RATE_LIMIT_ENABLED": False,
            },
        )
        configuration.start()
        self.addCleanup(configuration.stop)
        self.client = app_module.app.test_client()

    def assert_calculation_not_called(self, requests):
        with mock.patch.object(app_module, "get_best_mix") as calculate:
            responses = [request() for request in requests]
        calculate.assert_not_called()
        return responses

    def test_unset_or_empty_token_disables_both_post_routes_before_validation(self):
        for configured_token in (None, ""):
            with self.subTest(configured_token=configured_token):
                with mock.patch.dict(
                    app_module.app.config, {"SERVER_CALCULATION_TOKEN": configured_token}
                ):
                    responses = self.assert_calculation_not_called(
                        [
                            lambda: self.client.post("/", data={}),
                            lambda: self.client.post(
                                "/get_best_mix", data="{", content_type="application/json"
                            ),
                        ]
                    )
                self.assertEqual([response.status_code for response in responses], [404, 404])
                for response in responses:
                    self.assertEqual(
                        response.get_json(), {"error": "Server-side calculation is disabled."}
                    )

    def test_missing_or_wrong_bearer_is_rejected_before_html_and_json_validation(self):
        for authorization in (None, "", "Bearer wrong", self.token, f"Basic {self.token}"):
            with self.subTest(authorization=authorization):
                headers = {} if authorization is None else {"Authorization": authorization}
                responses = self.assert_calculation_not_called(
                    [
                        lambda headers=headers: self.client.post("/", data={}, headers=headers),
                        lambda headers=headers: self.client.post(
                            "/get_best_mix",
                            data="{",
                            content_type="application/json",
                            headers=headers,
                        ),
                    ]
                )
                self.assertEqual([response.status_code for response in responses], [401, 401])
                for response in responses:
                    self.assertEqual(response.headers["WWW-Authenticate"], "Bearer")
                    self.assertEqual(response.headers["Cache-Control"], "no-store")

    def test_query_parameter_and_cookie_cannot_supply_the_bearer_token(self):
        self.client.set_cookie("Authorization", f"Bearer {self.token}")
        responses = self.assert_calculation_not_called(
            [
                lambda: self.client.post(f"/?authorization=Bearer%20{self.token}", data={}),
                lambda: self.client.post(
                    f"/get_best_mix?access_token={self.token}",
                    data="{",
                    content_type="application/json",
                ),
            ]
        )
        self.assertEqual([response.status_code for response in responses], [401, 401])

    def test_public_page_and_catalog_do_not_disclose_server_token(self):
        page = self.client.get("/")
        catalog = self.client.get("/search-data")

        self.assertEqual(page.status_code, 200)
        self.assertEqual(catalog.status_code, 200)
        self.assertNotIn(self.token, page.get_data(as_text=True))
        self.assertNotIn(self.token, catalog.get_data(as_text=True))
        self.assertEqual(catalog.get_json()["schema_version"], 1)

    def test_exact_bearer_token_allows_existing_json_and_html_calculation_flows(self):
        result = CombinationResult(
            sell_price=Decimal("42.50"),
            substance_cost=Decimal("2.00"),
            modifier=0.22,
            substances=["cuke"],
            effects=["calming", "energizing"],
        )
        headers = {"Authorization": f"Bearer {self.token}"}
        json_data = {
            "combination_size": 1,
            "product_name": "og_kush",
            "level": "street_rat_i",
        }
        with mock.patch.object(
            app_module,
            "get_best_mix",
            return_value=(
                {"mode": "exact", "status": "optimal", "optimality_proven": True},
                result,
                result,
            ),
        ) as calculate:
            json_response = self.client.post("/get_best_mix", json=json_data, headers=headers)
            html_response = self.client.post("/", data=json_data, headers=headers)

        self.assertEqual(json_response.status_code, 200)
        self.assertEqual(html_response.status_code, 200)
        self.assertEqual(json_response.get_json()["best_profit"]["substances"], ["cuke"])
        self.assertIn("Cuke", html_response.get_data(as_text=True))
        self.assertEqual(calculate.call_count, 2)


if __name__ == "__main__":
    unittest.main()

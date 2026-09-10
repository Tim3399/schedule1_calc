"""Regression tests for rendering both calculator winners."""

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
    from webapp.app import app


class ResultRenderingTests(unittest.TestCase):
    def setUp(self):
        app.config.update(TESTING=True)
        self.client = authorized_client(self, app)

    def post_mix(self, combination_size, product_name, level):
        return self.client.post(
            "/",
            data={
                "combination_size": str(combination_size),
                "product_name": product_name,
                "level": level,
            },
        )

    def test_html_post_renders_distinct_modifier_and_profit_winners(self):
        response = self.post_mix(2, "green_crack", "hustler_iii")

        self.assertEqual(response.status_code, 200)
        html = response.get_data(as_text=True)
        modifier_heading = html.index("<h2>Best Modifier Combination</h2>")
        profit_heading = html.index("<h2>Best Profit Combination</h2>")
        modifier_result = html[modifier_heading:profit_heading]
        profit_result = html[profit_heading:]

        self.assertIn("Effects:", modifier_result)
        self.assertIn("Ingredients: Horse Semen, Mega Bean", modifier_result)
        self.assertIn("Modifier:", modifier_result)
        self.assertIn("Sell Price: 85.40$", modifier_result)
        self.assertIn("Ingredient Cost: 16.00$", modifier_result)
        self.assertIn("Profit: 69.40$", modifier_result)

        self.assertIn("Effects:", profit_result)
        self.assertIn("Ingredients: Viagra, Mega Bean", profit_result)
        self.assertIn("Modifier:", profit_result)
        self.assertIn("Sell Price: 83.30$", profit_result)
        self.assertIn("Ingredient Cost: 11.00$", profit_result)
        self.assertIn("Profit: 72.30$", profit_result)

    def test_html_post_keeps_both_headings_for_an_identical_winner(self):
        response = self.post_mix(1, "green_crack", "hustler_iii")

        self.assertEqual(response.status_code, 200)
        html = response.get_data(as_text=True)
        self.assertEqual(html.count("<h2>Best Modifier Combination</h2>"), 1)
        self.assertEqual(html.count("<h2>Best Profit Combination</h2>"), 1)
        self.assertEqual(html.count("Ingredients: Mega Bean"), 2)

    def test_get_renders_readable_product_and_level_names_with_stable_values(self):
        response = self.client.get("/")

        self.assertEqual(response.status_code, 200)
        html = response.get_data(as_text=True)
        self.assertIn('<option value="og_kush">OG Kush</option>', html)
        self.assertIn('<option value="green_crack">Green Crack</option>', html)
        self.assertIn('<option value="street_rat_i">Street Rat I</option>', html)
        self.assertIn("up to 5 minutes", html)

    def test_html_validation_error_does_not_show_a_raw_identifier(self):
        response = self.post_mix(1, "motor_oil", "street_rat_i")

        self.assertEqual(response.status_code, 400)
        html = response.get_data(as_text=True)
        self.assertIn("Unknown product: Motor Oil.", html)
        self.assertNotIn("Unknown product: motor_oil.", html)


if __name__ == "__main__":
    unittest.main()

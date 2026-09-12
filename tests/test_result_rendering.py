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

    def assert_card_layout(self, card, ingredients, sell_price, cost, profit):
        labels = [
            "<dt>Profit</dt>",
            "<dt>Sell Price</dt>",
            "<dt>Ingredient Cost</dt>",
            "<dt>Modifier</dt>",
            '<span class="chips-label">Ingredients</span>',
            '<span class="chips-label">Effects</span>',
        ]
        positions = [card.index(label) for label in labels]
        self.assertEqual(positions, sorted(positions))
        self.assertRegex(card, ingredients)
        self.assertRegex(card, rf"<dt>Sell Price</dt>\s*<dd>{sell_price}\$</dd>")
        self.assertRegex(card, rf"<dt>Ingredient Cost</dt>\s*<dd>{cost}\$</dd>")
        self.assertRegex(card, rf"<dt>Profit</dt>\s*<dd>{profit}\$</dd>")
        self.assertRegex(card, r"<dt>Modifier</dt>\s*<dd>")

    def test_html_post_renders_distinct_modifier_and_profit_winners(self):
        response = self.post_mix(2, "green_crack", "hustler_iii")

        self.assertEqual(response.status_code, 200)
        html = response.get_data(as_text=True)
        profit_heading = html.index("Best Profit Combination")
        comparison = html.index('<details class="result-comparison">')
        summary = html.index("<summary>Compare highest modifier</summary>", comparison)
        modifier_heading = html.index("Best Modifier Combination", summary)
        self.assertLess(profit_heading, comparison)
        self.assertLess(summary, modifier_heading)

        profit_result = html[profit_heading:comparison]
        modifier_result = html[modifier_heading : html.index("</details>", modifier_heading)]
        self.assert_card_layout(
            profit_result,
            r"<li>Viagra</li>\s*<li>Mega Bean</li>",
            r"83\.30",
            r"11\.00",
            r"72\.30",
        )
        self.assert_card_layout(
            modifier_result,
            r"<li>Horse Semen</li>\s*<li>Mega Bean</li>",
            r"85\.40",
            r"16\.00",
            r"69\.40",
        )
        self.assertEqual(profit_result.count("Optimality proven"), 1)
        self.assertEqual(modifier_result.count("Optimality proven"), 1)

    def test_html_post_keeps_both_headings_for_an_identical_winner(self):
        response = self.post_mix(1, "green_crack", "hustler_iii")

        self.assertEqual(response.status_code, 200)
        html = response.get_data(as_text=True)
        self.assertEqual(html.count("Best Modifier Combination"), 1)
        self.assertEqual(html.count("Best Profit Combination"), 1)
        self.assertEqual(html.count("<li>Mega Bean</li>"), 2)

    def test_get_renders_readable_product_and_level_names_with_stable_values(self):
        response = self.client.get("/")

        self.assertEqual(response.status_code, 200)
        html = response.get_data(as_text=True)
        self.assertRegex(html, r'<option value="og_kush">\s*OG Kush\s*</option>')
        self.assertRegex(html, r'<option value="green_crack">\s*Green Crack\s*</option>')
        self.assertRegex(html, r'<option value="street_rat_i">\s*Street Rat I\s*</option>')
        self.assertIn('<label for="product-name">Base product</label>', html)
        self.assertIn('<label for="level">Your rank</label>', html)
        self.assertIn('<label for="combination-size">Max ingredients</label>', html)
        self.assertRegex(html, r'id="combination-size"[\s\S]*?value="3"')
        self.assertRegex(
            html,
            r'<input(?=[^>]*id="search-mode-exact")(?=[^>]*checked)[^>]*>',
        )
        self.assertRegex(html, r'<input(?=[^>]*id="search-mode-fast")[^>]*>')
        self.assertRegex(
            html,
            r"Exact proves the best mix or returns no result \(up to 5 min\)\.",
        )
        self.assertRegex(html, r"Fast gives a quick\s+estimate without a guarantee\.")
        self.assertNotIn('id="combination-size-hint"', html)
        self.assertRegex(
            html,
            r'<button type="button" id="restore-recipe" hidden>Undo clear</button>',
        )

    def test_html_validation_error_does_not_show_a_raw_identifier(self):
        response = self.post_mix(1, "motor_oil", "street_rat_i")

        self.assertEqual(response.status_code, 400)
        html = response.get_data(as_text=True)
        self.assertIn("Unknown product: Motor Oil.", html)
        self.assertNotIn("Unknown product: motor_oil.", html)


if __name__ == "__main__":
    unittest.main()

"""Regression tests for rendering both calculator winners."""

from pathlib import Path
from html import unescape
import posixpath
import re
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
            '<span class="chips-label">Mix</span>',
            '<span class="chips-label">Effects · ',
        ]
        positions = [card.index(label) for label in labels]
        self.assertEqual(positions, sorted(positions))
        self.assertRegex(card, ingredients)
        self.assertRegex(card, rf"<dt>Sell Price</dt>\s*<dd>\${sell_price}</dd>")
        self.assertRegex(card, rf"<dt>Ingredient Cost</dt>\s*<dd>\${cost}</dd>")
        self.assertRegex(card, rf"<dt>Profit</dt>\s*<dd>\${profit}</dd>")
        self.assertRegex(card, r"<dt>Modifier</dt>\s*<dd>\d+\.\d{2}</dd>")
        self.assertRegex(card, r'<span class="chips-label">Effects · \d+</span>')

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
            r'<li class="mix__item">\s*<span class="mix__step">1</span>\s*<span class="mix__name">Viagra</span>\s*</li>\s*<li class="mix__item">\s*<span class="mix__step">2</span>\s*<span class="mix__name">Mega Bean</span>\s*</li>',
            r"83\.30",
            r"11\.00",
            r"72\.30",
        )
        self.assert_card_layout(
            modifier_result,
            r'<li class="mix__item">\s*<span class="mix__step">1</span>\s*<span class="mix__name">Horse Semen</span>\s*</li>\s*<li class="mix__item">\s*<span class="mix__step">2</span>\s*<span class="mix__name">Mega Bean</span>\s*</li>',
            r"85\.40",
            r"16\.00",
            r"69\.40",
        )
        self.assertEqual(profit_result.count("Optimality proven"), 1)
        self.assertEqual(modifier_result.count("Optimality proven"), 1)

    def test_barlow_700_is_preloaded_with_the_url_the_stylesheet_resolves_to(self):
        html = self.client.get("/").get_data(as_text=True)
        links = re.findall(r"<link\s[^>]*rel=\"preload\"[^>]*>", html)
        self.assertEqual(len(links), 1)
        link = links[0]
        self.assertRegex(link, r'as="font"')
        self.assertRegex(link, r'type="font/woff2"')
        self.assertRegex(link, r"\scrossorigin")
        href = re.search(r'href="([^"]+)"', link).group(1)
        css_href = re.search(r'<link rel="stylesheet" href="([^"]+/css/styles\.css)"', html).group(
            1
        )
        resolved = posixpath.normpath(
            posixpath.join(posixpath.dirname(css_href), "../fonts/barlow-latin-700-normal.woff2")
        )
        self.assertEqual(href, resolved)
        self.assertEqual(self.client.get(href).status_code, 200)

    def test_recipe_result_is_a_result_surface(self):
        html = self.client.get("/").get_data(as_text=True)
        self.assertRegex(html, r'id="recipe-result"\s+class="result-stack result-surface"')

    def test_html_post_keeps_both_headings_for_an_identical_winner(self):
        response = self.post_mix(1, "green_crack", "hustler_iii")

        self.assertEqual(response.status_code, 200)
        html = response.get_data(as_text=True)
        self.assertEqual(html.count("Best Modifier Combination"), 1)
        self.assertEqual(html.count("Best Profit Combination"), 1)
        self.assertEqual(html.count('<span class="mix__name">Mega Bean</span>'), 2)

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
            r"Exact proves the best mix when complete \(up to 5 min\)\.",
        )
        self.assertRegex(html, r"Fast gives a quick\s+estimate\.")
        self.assertRegex(
            html,
            r"If stopped, the best result found is kept without a guarantee\.",
        )
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

    def test_effect_colors_render_from_lookup_in_both_winners(self):
        from src.lookup.lookup import effects

        with app.test_request_context():
            combination = {
                "sell_price": 50,
                "substance_cost": 2,
                "modifier": 0.22,
                "substances": ["cuke"],
                "effects": [effect.name for effect in effects] + ["unknown_effect"],
            }
            from webapp.app import _template_context
            from flask import render_template

            html = render_template(
                "index.html",
                **_template_context(
                    best_profit=combination,
                    best_modifier=combination,
                    search={"status": "optimal", "mode": "exact", "optimality_proven": True},
                ),
            )
        for effect in effects:
            self.assertEqual(html.count(f"--effect-color: {effect.color}"), 4)
            self.assertGreaterEqual(unescape(html).count(effect.description), 2)
        self.assertEqual(html.count('class="effect-chip"'), 2 * len(effects))
        self.assertEqual(html.count("What these effects do"), 2)
        self.assertIn("Unknown Effect", html)

    def test_effect_tab_starts_without_submitting_a_server_calculation(self):
        html = self.client.get("/").get_data(as_text=True)
        self.assertRegex(html, r'id="effect-tab"[\s\S]*?aria-controls="effect-panel"')
        self.assertRegex(html, r'<section[^>]+id="effect-panel"[^>]+hidden')
        self.assertRegex(html, r'<button[^>]+id="find-effects"[^>]+disabled')
        self.assertIn('id="effect-filter"', html)
        self.assertIn('id="effect-options"', html)
        self.assertIn(
            "Wanted effects must be present; avoided effects must be absent. Other effects are allowed.",
            " ".join(html.split()),
        )
        self.assertIn("Fewest steps, then lowest cost.", html)
        self.assertRegex(html, r'name="effect_match_mode"[^>]*value="contains"[^>]*checked')
        self.assertRegex(html, r'name="effect_match_mode"[^>]*value="exact"(?![^>]*checked)')
        self.assertIn('id="effect-selection-summary"', html)

    def test_unknown_or_malformed_effect_color_has_a_neutral_fallback(self):
        from webapp.app import _EFFECT_COLORS, _effect_color

        self.assertIsNone(_effect_color("unknown_effect"))
        with mock.patch.dict(_EFFECT_COLORS, {"energizing": "#9afe6d; color: red"}):
            self.assertIsNone(_effect_color("energizing"))


if __name__ == "__main__":
    unittest.main()

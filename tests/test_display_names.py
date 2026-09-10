"""Tests for separating stable identifiers from labels shown to people."""

from pathlib import Path
import sys
import unittest


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.functionality.browser_catalog import build_catalog
from src.util.display_names import humanize_identifier, object_display_name
from src.util.models import Effect


class DisplayNameTests(unittest.TestCase):
    def test_humanize_identifier_preserves_acronyms_and_rank_numerals(self):
        self.assertEqual(humanize_identifier("og_kush"), "OG Kush")
        self.assertEqual(humanize_identifier("street_rat_iv"), "Street Rat IV")
        self.assertEqual(humanize_identifier("kingpin_i+"), "Kingpin I+")
        self.assertEqual(humanize_identifier("motor_oil"), "Motor Oil")
        self.assertEqual(humanize_identifier("low_quality_pesudo"), "Low Quality Pseudo")

    def test_explicit_model_display_name_takes_precedence(self):
        self.assertEqual(object_display_name(Effect("technical_id", 0.1, "Game Name")), "Game Name")

    def test_browser_catalog_adds_labels_without_changing_identifier_maps(self):
        catalog = build_catalog()

        self.assertEqual(catalog["levels"]["street_rat_i"], 1)
        self.assertEqual(catalog["level_display_names"]["street_rat_i"], "Street Rat I")
        products = {product["name"]: product for product in catalog["products"]}
        self.assertEqual(products["og_kush"]["display_name"], "OG Kush")


if __name__ == "__main__":
    unittest.main()

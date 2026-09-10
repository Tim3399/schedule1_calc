"""Regression tests for the current supported Schedule I base-product catalog."""

from decimal import Decimal
import unittest

from src.functionality.browser_catalog import build_catalog
from src.lookup.lookup import products, quality_name_to_int


class ProductCatalogUpdateTests(unittest.TestCase):
    def test_shrooms_use_verified_mixing_values_without_invented_metadata(self):
        shroom = next(product for product in products if product.name == "shroom")

        self.assertEqual(shroom.display_name, "Shrooms")
        self.assertEqual(shroom.base_sell_price, Decimal("65.00"))
        self.assertEqual(shroom.effects, [])
        self.assertEqual(shroom.quality, quality_name_to_int["n_a"])
        self.assertIsNone(shroom.buy_price)
        self.assertIsNone(shroom.level)

    def test_browser_catalog_exposes_shrooms_as_a_calculable_base(self):
        catalog_product = next(
            product for product in build_catalog()["products"] if product["name"] == "shroom"
        )

        self.assertEqual(catalog_product["base_price_cents"], 6500)
        self.assertEqual(catalog_product["effects"], [])


if __name__ == "__main__":
    unittest.main()

"""Frozen float-price model for historical experiments, never for application searches."""

from decimal import Decimal

from src.lookup import lookup


def calculate_price(product_name, total_effect_multiplier, active_effects=None):
    """Reproduce the price arithmetic used by the September 10 benchmark snapshots."""
    product = next(item for item in lookup.products if item.name == product_name)
    return Decimal(float(product.base_sell_price) * (1 + total_effect_multiplier))

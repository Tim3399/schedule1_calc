"""Read-only browser model, derived from the same lookup data as the Python searches."""

from decimal import Decimal
from functools import lru_cache
import hashlib
import json
from pathlib import Path

from src.lookup import lookup
from src.util.display_names import humanize_identifier, object_display_name

MAX_SAFE_INTEGER = 2**53 - 1


def _hundredths(value):
    scaled = Decimal(str(value)) * 100
    if not scaled.is_finite() or scaled < 0 or scaled != scaled.to_integral_value():
        raise ValueError("Browser model values must be nonnegative exact hundredths.")
    if scaled > MAX_SAFE_INTEGER:
        raise ValueError("Browser model value exceeds the exact integer range.")
    return int(scaled)


def build_catalog():
    """Preserve lookup/replacement order and reject lossy numeric conversion."""
    catalog = {
        "schema_version": 1,
        "product_version": (Path(__file__).resolve().parents[2] / "VERSION")
        .read_text(encoding="utf-8")
        .strip(),
        "effect_scale": 100,
        "money_scale": 100,
        "levels": dict(lookup.level_name_to_int),
        "level_display_names": {
            name: humanize_identifier(name) for name in lookup.level_name_to_int
        },
        "effects": [
            {
                "name": effect.name,
                "display_name": object_display_name(effect),
                "color": effect.color,
                "description": effect.description,
                "modifier": effect.modificator,
                "modifier_units": _hundredths(effect.modificator),
            }
            for effect in lookup.effects
        ],
        "products": [
            {
                "name": product.name,
                "display_name": object_display_name(product),
                "base_price_cents": _hundredths(product.base_sell_price),
                "effects": list(product.effects or ()),
            }
            for product in lookup.products
        ],
        "substances": [
            {
                "name": substance.name,
                "display_name": object_display_name(substance),
                "price_cents": _hundredths(substance.price),
                "level": substance.level,
                "resulting_effect": substance.resulting_effect,
                "replacements": [list(pair) for pair in substance.side_effect_replacements.items()],
            }
            for substance in lookup.substances
        ],
    }
    maximum_multiplier = 100 + sum(effect["modifier_units"] for effect in catalog["effects"])
    if any(
        product["base_price_cents"] * maximum_multiplier > MAX_SAFE_INTEGER
        for product in catalog["products"]
    ) or any(
        substance["price_cents"] * 16 * 100 > MAX_SAFE_INTEGER
        for substance in catalog["substances"]
    ):
        raise ValueError("Browser model calculations exceed the exact integer range.")
    encoded = json.dumps(catalog, sort_keys=True, separators=(",", ":")).encode("utf-8")
    catalog["model_hash"] = hashlib.sha256(encoded).hexdigest()
    return catalog


@lru_cache(maxsize=1)
def get_catalog():
    """Lookup data is fixed for the lifetime of the application process."""
    return build_catalog()

"""Tests for optional effect-color metadata and browser catalog transport."""

from pathlib import Path
import re
import sys
import unittest


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.functionality.browser_catalog import build_catalog
from src.lookup import lookup
from src.util.models import Effect


class EffectColorTests(unittest.TestCase):
    def test_effect_color_remains_optional_for_existing_callers(self):
        legacy = Effect("legacy", 0.25)
        labelled = Effect("labelled", 0.10, "Labelled")

        self.assertIsNone(legacy.color)
        self.assertEqual(labelled.display_name, "Labelled")
        self.assertIsNone(labelled.color)

    def test_lookup_has_a_valid_color_for_every_effect(self):
        self.assertEqual(len(lookup.effects), 34)
        self.assertTrue(
            all(re.fullmatch(r"#[0-9a-f]{6}", effect.color or "") for effect in lookup.effects)
        )

        colors = {effect.name: effect.color for effect in lookup.effects}
        self.assertEqual(colors["anti_gravity"], "#245bcc")
        self.assertEqual(colors["bright_eyed"], "#bff8ff")
        self.assertEqual(colors["calming"], "#ffd19b")
        self.assertEqual(colors["seizure_inducing"], "#ffea00")
        self.assertEqual(colors["sneaky"], "#7b7b7b")
        self.assertEqual(colors["zombifying"], "#71ab5d")

    def test_browser_catalog_transports_colors_and_hashes_them(self):
        catalog = build_catalog()
        exported = {effect["name"]: effect for effect in catalog["effects"]}

        self.assertEqual(
            {name: effect["color"] for name, effect in exported.items()},
            {effect.name: effect.color for effect in lookup.effects},
        )

        source = lookup.effects[0]
        original_color = source.color
        try:
            source.color = "#000000"
            changed = build_catalog()
        finally:
            source.color = original_color
        self.assertNotEqual(changed["model_hash"], catalog["model_hash"])


if __name__ == "__main__":
    unittest.main()

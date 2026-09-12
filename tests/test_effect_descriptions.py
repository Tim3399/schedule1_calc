"""Tests for optional effect descriptions and browser catalog transport."""

import re
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.functionality.browser_catalog import build_catalog
from src.lookup import lookup
from src.util.models import Effect


class EffectDescriptionTests(unittest.TestCase):
    def test_description_remains_optional_for_existing_callers(self):
        legacy = Effect("legacy", 0.25)
        labelled_and_colored = Effect("labelled", 0.10, "Labelled", "#123456")

        self.assertIsNone(legacy.description)
        self.assertEqual(labelled_and_colored.display_name, "Labelled")
        self.assertEqual(labelled_and_colored.color, "#123456")
        self.assertIsNone(labelled_and_colored.description)

    def test_every_lookup_effect_has_plain_text_description(self):
        self.assertEqual(len(lookup.effects), 34)

        descriptions = {effect.name: effect.description for effect in lookup.effects}
        self.assertTrue(all(description for description in descriptions.values()))
        self.assertTrue(
            all(
                "\n" not in description and not re.search(r"[<>]", description)
                for description in descriptions.values()
                if description is not None
            )
        )
        undocumented = {
            name
            for name, description in descriptions.items()
            if description == "No additional gameplay effect documented."
        }
        self.assertEqual(undocumented, {"munchies", "refreshing"})

        self.assertIn("no speed effect on players", descriptions["focused"])
        self.assertIn("police detection", descriptions["sneaky"])
        self.assertEqual(
            descriptions["schizophrenia"],
            "Randomly inverts controls and causes muffled voices and pulsing vision.",
        )
        self.assertEqual(
            descriptions["seizure_inducing"],
            "Makes the user have a seizure and shake on the ground.",
        )

    def test_browser_catalog_transports_descriptions_and_hashes_them(self):
        catalog = build_catalog()
        exported = {effect["name"]: effect for effect in catalog["effects"]}

        self.assertEqual(
            {name: effect["description"] for name, effect in exported.items()},
            {effect.name: effect.description for effect in lookup.effects},
        )

        source = lookup.effects[0]
        original_description = source.description
        try:
            source.description = "Changed for hash verification."
            changed = build_catalog()
        finally:
            source.description = original_description
        self.assertNotEqual(changed["model_hash"], catalog["model_hash"])


if __name__ == "__main__":
    unittest.main()

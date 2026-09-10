import sqlite3
import sys
import tempfile
import unittest
from decimal import Decimal
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "src"))

from functionality.logging import logging_config
from src.datenbank.initialize_db import initialize_database
from src.datenbank.populate_db import populate_database, store_all_combinations_normalized
from src.util.models import CombinationResult

with mock.patch.object(logging_config, "setup_logging", return_value=mock.Mock()):
    from functionality.calc_modifier import generate_db_entrys


class DatabaseExportTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.temp_path = Path(self.directory.name)

    def create_database(self, name):
        db_path = self.temp_path / name
        initialize_database(db_path)
        populate_database(db_path)
        return db_path

    def counts(self, db_path):
        connection = sqlite3.connect(db_path)
        try:
            return tuple(
                connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
                for table in (
                    "calculated_combinations",
                    "calculated_combination_substances",
                    "calculated_combination_effects",
                )
            )
        finally:
            connection.close()

    def exported_recipes(self, db_path):
        connection = sqlite3.connect(db_path)
        try:
            recipes = []
            rows = connection.execute(
                """SELECT combinations.id, products.name, combinations.combination_size,
                          combinations.modifier, combinations.sell_price,
                          combinations.substance_cost
                   FROM calculated_combinations combinations
                   JOIN products ON products.product_id = combinations.product_id
                   ORDER BY combinations.id"""
            )
            for combination_id, *combination in rows:
                substances = connection.execute(
                    """SELECT substances.name
                       FROM calculated_combination_substances combination_substances
                       JOIN substances
                         ON substances.substance_id = combination_substances.substance_id
                       WHERE combination_substances.combination_id = ?
                       ORDER BY combination_substances.position""",
                    (combination_id,),
                ).fetchall()
                effects = connection.execute(
                    """SELECT effects.name
                       FROM calculated_combination_effects combination_effects
                       JOIN effects ON effects.effect_id = combination_effects.effect_id
                       WHERE combination_effects.combination_id = ?
                       ORDER BY effects.name""",
                    (combination_id,),
                ).fetchall()
                recipes.append(
                    (
                        tuple(combination),
                        tuple(row[0] for row in substances),
                        tuple(e[0] for e in effects),
                    )
                )
            return recipes
        finally:
            connection.close()

    def result(self, substances=None, effects=None):
        return CombinationResult(
            sell_price=Decimal("50.25"),
            substance_cost=Decimal(4),
            modifier=0.25,
            substances=substances or ["cuke"],
            effects=effects or ["calming"],
        )

    def test_generate_normalizes_product_once_and_honors_explicit_database_path(self):
        display_name_db = self.create_database("display-name.db")
        canonical_name_db = self.create_database("canonical-name.db")

        generate_db_entrys(1, "OG Kush", 1, display_name_db)
        generate_db_entrys(1, "og_kush", 1, canonical_name_db)

        display_recipes = self.exported_recipes(display_name_db)
        canonical_recipes = self.exported_recipes(canonical_name_db)
        self.assertTrue(display_recipes)
        self.assertEqual(display_recipes, canonical_recipes)
        self.assertEqual({recipe[0][0] for recipe in display_recipes}, {"og_kush"})

    def test_unknown_database_product_raises_value_error_and_closes_connection(self):
        db_path = self.create_database("unknown-product.db")

        with self.assertRaisesRegex(ValueError, "Product 'missing_product' not found"):
            store_all_combinations_normalized(db_path, "missing_product", 1, {})

        db_path.unlink()
        self.assertFalse(db_path.exists())

    def test_successful_recipe_keeps_order_repetition_and_all_effects(self):
        db_path = self.create_database("complete-recipe.db")
        recipe = self.result(
            substances=["cuke", "donut", "cuke"],
            effects=["calming", "toxic"],
        )

        store_all_combinations_normalized(db_path, "og_kush", 3, {"recipe": recipe})

        exported = self.exported_recipes(db_path)
        self.assertEqual(len(exported), 1)
        self.assertEqual(exported[0][1], ("cuke", "donut", "cuke"))
        self.assertEqual(exported[0][2], ("calming", "toxic"))

    def test_missing_recipe_reference_never_persists_a_partial_recipe(self):
        db_path = self.create_database("missing-reference.db")

        invalid_recipes = (
            (self.result(substances=["cuke", "missing_substance"]), "missing_substance"),
            (self.result(effects=["calming", "missing_effect"]), "missing_effect"),
        )
        for recipe, missing_name in invalid_recipes:
            with self.subTest(missing_name=missing_name):
                with self.assertRaisesRegex(ValueError, missing_name):
                    store_all_combinations_normalized(
                        db_path, "og_kush", len(recipe.substances), {"invalid": recipe}
                    )
                self.assertEqual(self.counts(db_path), (0, 0, 0))

    def test_insert_failure_rolls_back_parent_and_children_but_keeps_existing_data(self):
        db_path = self.create_database("rollback.db")
        store_all_combinations_normalized(db_path, "og_kush", 1, {"existing": self.result()})
        existing_recipes = self.exported_recipes(db_path)

        connection = sqlite3.connect(db_path)
        try:
            connection.execute(
                """CREATE TRIGGER reject_second_ingredient
                   BEFORE INSERT ON calculated_combination_substances
                   WHEN NEW.position = 1
                    AND NEW.substance_id = (
                        SELECT substance_id FROM substances WHERE name = 'cuke'
                    )
                   BEGIN
                       SELECT RAISE(FAIL, 'second ingredient rejected');
                   END"""
            )
            connection.commit()
        finally:
            connection.close()

        valid_sibling = self.result(substances=["donut", "donut"])
        failing_recipe = self.result(substances=["cuke", "cuke"])
        with self.assertRaisesRegex(sqlite3.IntegrityError, "second ingredient rejected"):
            store_all_combinations_normalized(
                db_path,
                "og_kush",
                2,
                {"valid-sibling": valid_sibling, "failing": failing_recipe},
            )

        self.assertEqual(self.exported_recipes(db_path), existing_recipes)
        self.assertEqual(self.counts(db_path), (1, 1, 1))


if __name__ == "__main__":
    unittest.main()

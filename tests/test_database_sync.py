import copy
from contextlib import contextmanager
from decimal import Decimal
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest import mock

from src.datenbank.initialize_db import initialize_database
from src.datenbank import populate_db
from src.util.models import Effect, Product, Substance


class DatabaseSyncTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.db_path = Path(self.directory.name) / "sync.db"
        initialize_database(self.db_path)
        populate_db.populate_database(self.db_path)

    @contextmanager
    def connect(self):
        connection = sqlite3.connect(self.db_path)
        connection.execute("PRAGMA foreign_keys = ON")
        try:
            with connection:
                yield connection
        finally:
            connection.close()

    def seed_cache(self):
        with self.connect() as connection:
            product_id = connection.execute(
                "SELECT product_id FROM products WHERE name = 'og_kush'"
            ).fetchone()[0]
            substance_id = connection.execute(
                "SELECT substance_id FROM substances WHERE name = 'cuke'"
            ).fetchone()[0]
            effect_id = connection.execute(
                "SELECT effect_id FROM effects WHERE name = 'calming'"
            ).fetchone()[0]
            combination_id = connection.execute(
                """INSERT INTO calculated_combinations
                   (product_id, combination_size, modifier, sell_price, substance_cost)
                   VALUES (?, 1, 0.1, 40, 2)""",
                (product_id,),
            ).lastrowid
            connection.execute(
                """INSERT INTO calculated_combination_substances
                   (combination_id, substance_id, position) VALUES (?, ?, 0)""",
                (combination_id, substance_id),
            )
            connection.execute(
                """INSERT INTO calculated_combination_effects
                   (combination_id, effect_id) VALUES (?, ?)""",
                (combination_id, effect_id),
            )
        return combination_id

    def lookup_copy(self):
        return (
            copy.deepcopy(populate_db.effects),
            copy.deepcopy(populate_db.substances),
            copy.deepcopy(populate_db.products),
            copy.deepcopy(populate_db.level_name_to_int),
        )

    def patched_lookup(self, effects, substances, products, levels):
        return mock.patch.multiple(
            populate_db,
            effects=effects,
            substances=substances,
            products=products,
            level_name_to_int=levels,
        )

    def test_identical_population_preserves_entity_and_cached_recipe_ids(self):
        combination_id = self.seed_cache()
        with self.connect() as connection:
            ids_before = {
                table: dict(connection.execute(f"SELECT name, {id_column} FROM {table}"))
                for table, id_column in (
                    ("effects", "effect_id"),
                    ("products", "product_id"),
                    ("substances", "substance_id"),
                )
            }

        populate_db.populate_database(self.db_path)

        with self.connect() as connection:
            ids_after = {
                table: dict(connection.execute(f"SELECT name, {id_column} FROM {table}"))
                for table, id_column in (
                    ("effects", "effect_id"),
                    ("products", "product_id"),
                    ("substances", "substance_id"),
                )
            }
            cached = connection.execute("SELECT id FROM calculated_combinations").fetchall()
            cached_substances = connection.execute(
                "SELECT combination_id FROM calculated_combination_substances"
            ).fetchall()
            cached_effects = connection.execute(
                "SELECT combination_id FROM calculated_combination_effects"
            ).fetchall()
            level_51 = connection.execute(
                "SELECT level_name FROM levels WHERE level_id = 51"
            ).fetchone()

        self.assertEqual(ids_after, ids_before)
        self.assertEqual(cached, [(combination_id,)])
        self.assertEqual(cached_substances, [(combination_id,)])
        self.assertEqual(cached_effects, [(combination_id,)])
        self.assertEqual(level_51, ("kingpin_i+",))

    def test_changed_lookup_updates_full_reference_set_and_invalidates_cache(self):
        combination_id = self.seed_cache()
        effects, substances, products, levels = self.lookup_copy()
        old_ids = {}
        with self.connect() as connection:
            for table, id_column, name in (
                ("effects", "effect_id", "calming"),
                ("products", "product_id", "og_kush"),
                ("substances", "substance_id", "cuke"),
            ):
                old_ids[(table, name)] = connection.execute(
                    f"SELECT {id_column} FROM {table} WHERE name = ?", (name,)
                ).fetchone()[0]

        next(effect for effect in effects if effect.name == "calming").modificator = 0.11
        og_kush = next(product for product in products if product.name == "og_kush")
        og_kush.base_sell_price = 36
        og_kush.buy_price = 31
        og_kush.level = levels["street_rat_ii"]
        og_kush.effects = []
        cuke = next(substance for substance in substances if substance.name == "cuke")
        cuke.price = 3
        cuke.level = levels["street_rat_ii"]
        cuke.resulting_effect = "athletic"
        del cuke.side_effect_replacements["foggy"]
        cuke.side_effect_replacements["euphoric"] = "focused"
        products = [product for product in products if product.name != "sour_diesel"]
        substances = [substance for substance in substances if substance.name != "battery"]
        effects = [effect for effect in effects if effect.name != "zombifying"]
        effects.append(Effect(name="new_effect", modificator=0.25))
        products.append(
            Product(
                name="new_product",
                base_sell_price=Decimal("50"),
                buy_price=Decimal("20"),
                level=levels["street_rat_i"],
                effects=["new_effect"],
            )
        )
        substances.append(
            Substance(
                name="new_substance",
                price=Decimal("4"),
                level=levels["street_rat_i"],
                resulting_effect="new_effect",
                side_effect_replacements={"calming": "new_effect"},
            )
        )

        with self.patched_lookup(effects, substances, products, levels):
            populate_db.populate_database(self.db_path)

        with self.connect() as connection:
            calming = connection.execute(
                "SELECT effect_id, modificator FROM effects WHERE name = 'calming'"
            ).fetchone()
            product = connection.execute(
                """SELECT product_id, base_sell_price, buy_price, level_id
                   FROM products WHERE name = 'og_kush'"""
            ).fetchone()
            substance = connection.execute(
                """SELECT s.substance_id, s.price, s.level_id, e.name
                   FROM substances s JOIN effects e ON e.effect_id = s.resulting_effect_id
                   WHERE s.name = 'cuke'"""
            ).fetchone()
            replacements = dict(
                connection.execute(
                    """SELECT original.name, replacement.name
                       FROM side_effect_replacements replacements
                       JOIN substances s ON s.substance_id = replacements.substance_id
                       JOIN effects original ON original.effect_id = replacements.original_effect_id
                       JOIN effects replacement
                         ON replacement.effect_id = replacements.replacement_effect_id
                       WHERE s.name = 'cuke'"""
                )
            )

            self.assertEqual(calming, (old_ids[("effects", "calming")], 0.11))
            self.assertEqual(product, (old_ids[("products", "og_kush")], 36, 31, 2))
            self.assertEqual(substance, (old_ids[("substances", "cuke")], 3, 2, "athletic"))
            self.assertEqual(replacements["euphoric"], "focused")
            self.assertNotIn("foggy", replacements)
            self.assertEqual(
                connection.execute(
                    """SELECT COUNT(*) FROM product_effects pe
                       JOIN products p ON p.product_id = pe.product_id
                       WHERE p.name = 'og_kush'"""
                ).fetchone()[0],
                0,
            )
            for table, name in (
                ("products", "sour_diesel"),
                ("substances", "battery"),
                ("effects", "zombifying"),
            ):
                self.assertEqual(
                    connection.execute(
                        f"SELECT COUNT(*) FROM {table} WHERE name = ?", (name,)
                    ).fetchone()[0],
                    0,
                )
            for table in (
                "calculated_combinations",
                "calculated_combination_substances",
                "calculated_combination_effects",
            ):
                self.assertEqual(
                    connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0], 0
                )
            self.assertEqual(
                connection.execute(
                    """SELECT effect.name
                       FROM product_effects pe
                       JOIN products product ON product.product_id = pe.product_id
                       JOIN effects effect ON effect.effect_id = pe.effect_id
                       WHERE product.name = 'new_product'"""
                ).fetchall(),
                [("new_effect",)],
            )
            self.assertEqual(
                connection.execute(
                    """SELECT resulting.name, original.name, replacement.name
                       FROM substances substance
                       JOIN effects resulting
                         ON resulting.effect_id = substance.resulting_effect_id
                       JOIN side_effect_replacements replacements
                         ON replacements.substance_id = substance.substance_id
                       JOIN effects original
                         ON original.effect_id = replacements.original_effect_id
                       JOIN effects replacement
                         ON replacement.effect_id = replacements.replacement_effect_id
                       WHERE substance.name = 'new_substance'"""
                ).fetchall(),
                [("new_effect", "calming", "new_effect")],
            )
            self.assertEqual(connection.execute("PRAGMA foreign_key_check").fetchall(), [])
            self.assertIsNotNone(combination_id)

    def test_relationship_only_change_invalidates_cache(self):
        self.seed_cache()
        effects, substances, products, levels = self.lookup_copy()
        og_kush = next(product for product in products if product.name == "og_kush")
        og_kush.effects = ["athletic"]

        with self.patched_lookup(effects, substances, products, levels):
            populate_db.populate_database(self.db_path)

        with self.connect() as connection:
            self.assertEqual(
                connection.execute(
                    """SELECT effect.name
                       FROM product_effects pe
                       JOIN products product ON product.product_id = pe.product_id
                       JOIN effects effect ON effect.effect_id = pe.effect_id
                       WHERE product.name = 'og_kush'"""
                ).fetchall(),
                [("athletic",)],
            )
            for table in (
                "calculated_combinations",
                "calculated_combination_substances",
                "calculated_combination_effects",
            ):
                self.assertEqual(
                    connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0], 0
                )

    def test_level_names_can_swap_ids_atomically(self):
        effects, substances, products, levels = self.lookup_copy()
        first_id = levels["street_rat_i"]
        second_id = levels["street_rat_ii"]
        levels["street_rat_i"] = second_id
        levels["street_rat_ii"] = first_id

        with self.patched_lookup(effects, substances, products, levels):
            populate_db.populate_database(self.db_path)

        with self.connect() as connection:
            self.assertEqual(
                dict(
                    connection.execute(
                        "SELECT level_name, level_id FROM levels WHERE level_id IN (?, ?)",
                        (first_id, second_id),
                    )
                ),
                {"street_rat_i": second_id, "street_rat_ii": first_id},
            )
            self.assertEqual(connection.execute("PRAGMA foreign_key_check").fetchall(), [])

    def test_invalid_lookup_reference_fails_without_changing_database(self):
        combination_id = self.seed_cache()
        effects, substances, products, levels = self.lookup_copy()
        next(product for product in products if product.name == "og_kush").effects = ["unknown"]

        with self.patched_lookup(effects, substances, products, levels):
            with self.assertRaisesRegex(ValueError, "unbekannten Effekt 'unknown'"):
                populate_db.populate_database(self.db_path)

        with self.connect() as connection:
            self.assertEqual(
                connection.execute("SELECT id FROM calculated_combinations").fetchall(),
                [(combination_id,)],
            )

    def test_database_error_rolls_back_prior_changes_and_releases_connection(self):
        combination_id = self.seed_cache()
        effects, substances, products, levels = self.lookup_copy()
        next(effect for effect in effects if effect.name == "calming").modificator = 0.99
        next(substance for substance in substances if substance.name == "cuke").price = 99
        with self.connect() as connection:
            connection.execute(
                """CREATE TRIGGER reject_cuke_update BEFORE UPDATE ON substances
                   WHEN OLD.name = 'cuke'
                   BEGIN SELECT RAISE(ABORT, 'test trigger failure'); END"""
            )

        with self.patched_lookup(effects, substances, products, levels):
            with self.assertRaisesRegex(sqlite3.IntegrityError, "test trigger failure"):
                populate_db.populate_database(self.db_path)

        with self.connect() as connection:
            self.assertEqual(
                connection.execute(
                    "SELECT modificator FROM effects WHERE name = 'calming'"
                ).fetchone(),
                (0.1,),
            )
            self.assertEqual(
                connection.execute("SELECT price FROM substances WHERE name = 'cuke'").fetchone(),
                (2,),
            )
            self.assertEqual(
                connection.execute("SELECT id FROM calculated_combinations").fetchall(),
                [(combination_id,)],
            )
            self.assertEqual(
                connection.execute(
                    "SELECT combination_id FROM calculated_combination_substances"
                ).fetchall(),
                [(combination_id,)],
            )
            self.assertEqual(
                connection.execute(
                    "SELECT combination_id FROM calculated_combination_effects"
                ).fetchall(),
                [(combination_id,)],
            )
            connection.execute("INSERT INTO levels (level_name) VALUES ('after_failure')")


if __name__ == "__main__":
    unittest.main()

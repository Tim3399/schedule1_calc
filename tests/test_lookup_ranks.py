"""Regression tests for corrected product and ingredient unlock ranks."""

import copy
from contextlib import closing
import logging
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "src"))

from functionality.logging import logging_config

with mock.patch.object(logging_config, "setup_logging", return_value=mock.Mock()):
    from functionality import calc_modifier
    from src.datenbank.initialize_db import initialize_database
    from src.datenbank import populate_db


class LookupRankTests(unittest.TestCase):
    def setUp(self):
        quiet_logger = logging.getLogger(f"{__name__}.{self.id()}")
        quiet_logger.disabled = True
        logger_patch = mock.patch.object(calc_modifier, "logger", quiet_logger)
        logger_patch.start()
        self.addCleanup(logger_patch.stop)

    def test_mega_bean_unlocks_at_peddler_iii_in_legacy_collection(self):
        below_unlock, _, _ = calc_modifier.get_best_mix(
            1,
            "og_kush",
            "peddler_ii",
            collect_all_combinations=True,
        )
        at_unlock, _, _ = calc_modifier.get_best_mix(
            1,
            "og_kush",
            "peddler_iii",
            collect_all_combinations=True,
        )

        self.assertNotIn("mega_bean", below_unlock[1])
        self.assertIn("mega_bean", at_unlock[1])

    def test_cocaine_metadata_unlocks_at_enforcer_i(self):
        cocaine = next(product for product in calc_modifier.products if product.name == "cocaine")

        self.assertEqual(cocaine.level, calc_modifier.level_name_to_int["enforcer_i"])
        self.assertEqual(cocaine.level, 26)

    def test_database_sync_replaces_old_ranks_and_invalidates_cached_recipes(self):
        with tempfile.TemporaryDirectory() as directory:
            db_path = Path(directory) / "lookup-ranks.db"
            initialize_database(db_path)

            old_substances = copy.deepcopy(populate_db.substances)
            old_products = copy.deepcopy(populate_db.products)
            next(item for item in old_substances if item.name == "mega_bean").level = 17
            next(item for item in old_products if item.name == "cocaine").level = 17
            with mock.patch.multiple(
                populate_db,
                substances=old_substances,
                products=old_products,
            ):
                populate_db.populate_database(db_path)

            with closing(sqlite3.connect(db_path)) as connection:
                with connection:
                    cocaine_id = connection.execute(
                        "SELECT product_id FROM products WHERE name = 'cocaine'"
                    ).fetchone()[0]
                    mega_bean_id = connection.execute(
                        "SELECT substance_id FROM substances WHERE name = 'mega_bean'"
                    ).fetchone()[0]
                    foggy_id = connection.execute(
                        "SELECT effect_id FROM effects WHERE name = 'foggy'"
                    ).fetchone()[0]
                    combination_id = connection.execute(
                        """INSERT INTO calculated_combinations
                           (product_id, combination_size, modifier, sell_price, substance_cost)
                           VALUES (?, 1, 0.36, 204, 7)""",
                        (cocaine_id,),
                    ).lastrowid
                    connection.execute(
                        """INSERT INTO calculated_combination_substances
                           (combination_id, substance_id, position) VALUES (?, ?, 0)""",
                        (combination_id, mega_bean_id),
                    )
                    connection.execute(
                        """INSERT INTO calculated_combination_effects
                           (combination_id, effect_id) VALUES (?, ?)""",
                        (combination_id, foggy_id),
                    )

            populate_db.populate_database(db_path)

            with closing(sqlite3.connect(db_path)) as connection:
                cocaine = connection.execute(
                    "SELECT product_id, level_id FROM products WHERE name = 'cocaine'"
                ).fetchone()
                mega_bean = connection.execute(
                    "SELECT substance_id, level_id FROM substances WHERE name = 'mega_bean'"
                ).fetchone()
                cached_counts = tuple(
                    connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
                    for table in (
                        "calculated_combinations",
                        "calculated_combination_substances",
                        "calculated_combination_effects",
                    )
                )

        self.assertEqual(cocaine, (cocaine_id, 26))
        self.assertEqual(mega_bean, (mega_bean_id, 13))
        self.assertEqual(cached_counts, (0, 0, 0))


if __name__ == "__main__":
    unittest.main()

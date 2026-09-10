"""Subprocess tests for the database population command-line entry points."""

import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "src" / "datenbank" / "populate_db.py"


class DatabaseEntryTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.temp_path = Path(self.directory.name)
        self.database_directory = self.temp_path / "database paths"
        self.database_directory.mkdir()

    def run_command(self, *arguments, cwd=None, env=None):
        if env is None:
            env = os.environ.copy()
            env.pop("PYTHONPATH", None)
        return subprocess.run(
            [sys.executable, *map(str, arguments)],
            cwd=cwd or ROOT,
            env=env,
            capture_output=True,
            text=True,
            timeout=30,
        )

    def assert_populated(self, db_path):
        connection = sqlite3.connect(db_path)
        try:
            tables = {
                row[0]
                for row in connection.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
            }
            self.assertTrue(
                {
                    "levels",
                    "effects",
                    "products",
                    "substances",
                    "product_effects",
                    "side_effect_replacements",
                }.issubset(tables)
            )
            expected_counts = {"effects": 34, "products": 8, "substances": 16}
            for table, expected_count in expected_counts.items():
                with self.subTest(table=table):
                    count = connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
                    self.assertEqual(count, expected_count)
            cuke_price = connection.execute(
                "SELECT price FROM substances WHERE name = 'cuke'"
            ).fetchone()
            self.assertEqual(cuke_price, (2,))
            calculated_count = connection.execute(
                "SELECT COUNT(*) FROM calculated_combinations"
            ).fetchone()[0]
            self.assertEqual(calculated_count, 0)
        finally:
            connection.close()

    def test_direct_script_from_foreign_working_directory_populates_database(self):
        db_path = self.database_directory / "direct entry.db"

        result = self.run_command(SCRIPT, "--db-path", db_path, cwd=self.temp_path)

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assert_populated(db_path)

    def test_module_entry_populates_database(self):
        db_path = self.database_directory / "module entry.db"

        result = self.run_command("-m", "src.datenbank.populate_db", "--db-path", db_path, cwd=ROOT)

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assert_populated(db_path)

    def test_default_path_is_repeatable_without_duplicate_reference_data(self):
        working_directory = self.temp_path / "default database"
        working_directory.mkdir()
        db_path = working_directory / "combinations.db"

        first_result = self.run_command(SCRIPT, cwd=working_directory)
        second_result = self.run_command(SCRIPT, cwd=working_directory)

        self.assertEqual(first_result.returncode, 0, first_result.stderr)
        self.assertEqual(second_result.returncode, 0, second_result.stderr)
        self.assert_populated(db_path)

    def test_help_and_import_do_not_create_default_database(self):
        help_directory = self.temp_path / "help"
        import_directory = self.temp_path / "import"
        help_directory.mkdir()
        import_directory.mkdir()

        help_result = self.run_command(SCRIPT, "--help", cwd=help_directory)
        environment = os.environ.copy()
        environment["PYTHONPATH"] = str(ROOT)
        import_result = self.run_command(
            "-c", "import src.datenbank.populate_db", cwd=import_directory, env=environment
        )

        self.assertEqual(help_result.returncode, 0, help_result.stderr)
        self.assertIn("--db-path", help_result.stdout)
        self.assertFalse((help_directory / "combinations.db").exists())
        self.assertEqual(import_result.returncode, 0, import_result.stderr)
        self.assertFalse((import_directory / "combinations.db").exists())

    def test_unusable_database_path_exits_nonzero(self):
        result = self.run_command(
            "-m",
            "src.datenbank.populate_db",
            "--db-path",
            self.temp_path,
            cwd=ROOT,
        )

        self.assertNotEqual(result.returncode, 0)
        self.assertTrue(result.stderr)


if __name__ == "__main__":
    unittest.main()

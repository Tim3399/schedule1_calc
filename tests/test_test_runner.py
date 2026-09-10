"""Tests for the project command's unittest discovery and exit behavior."""

import contextlib
import io
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tools import project


class TestRunnerTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        (self.root / "tests").mkdir()

    def run_tests(self):
        errors = io.StringIO()
        with contextlib.redirect_stderr(errors):
            status = project.run_tests(self.root)
        return status, errors.getvalue()

    def write_test(self, name, source):
        (self.root / "tests" / name).write_text(source, encoding="utf-8")

    def test_empty_discovery_is_rejected(self):
        with self.assertRaisesRegex(project.ProjectError, "No tests discovered"):
            project.run_tests(self.root)

    def test_discovered_passing_test_runs_and_succeeds(self):
        self.write_test(
            "test_runner_pass.py",
            "import unittest\n\n"
            "class PassingTest(unittest.TestCase):\n"
            "    def test_passes(self):\n"
            "        self.assertEqual(2 + 2, 4)\n",
        )

        status, output = self.run_tests()

        self.assertEqual(status, 0)
        self.assertIn("Ran 1 test", output)
        self.assertIn("OK", output)

    def test_discovered_failure_returns_nonzero(self):
        self.write_test(
            "test_runner_failure.py",
            "import unittest\n\n"
            "class FailingTest(unittest.TestCase):\n"
            "    def test_fails(self):\n"
            "        self.fail('expected failure')\n",
        )

        status, output = self.run_tests()

        self.assertEqual(status, 1)
        self.assertIn("FAILED (failures=1)", output)

    def test_discovery_import_error_returns_nonzero(self):
        self.write_test("test_runner_import_error.py", "raise RuntimeError('cannot import')\n")

        status, output = self.run_tests()

        self.assertEqual(status, 1)
        self.assertIn("FAILED (errors=1)", output)
        self.assertIn("cannot import", output)


if __name__ == "__main__":
    unittest.main()

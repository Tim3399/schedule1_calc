"""Resource controls for the Windows-only evaluation subprocess runner."""

from pathlib import Path
import sys
import unittest


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from tools.evaluate_search import isolated_case


@unittest.skipUnless(sys.platform == "win32", "Evaluation runner uses Windows process counters")
class SearchEvaluationTests(unittest.TestCase):
    def test_memory_limit_observes_actual_interpreter_instead_of_venv_launcher(self):
        case = {"product": "og_kush", "level": "max", "size": 5, "method": "exact"}
        result = isolated_case(case, timeout=10, memory_mib=64)
        self.assertEqual(result["status"], "memory_limit")
        self.assertGreater(result["private_bytes"], 64 * 1024**2)
        self.assertNotIn("best_profit", result)

    def test_timeout_returns_no_partial_exact_winner(self):
        case = {"product": "og_kush", "level": "max", "size": 6, "method": "reference"}
        result = isolated_case(case, timeout=0.3, memory_mib=512)
        self.assertEqual(result["status"], "time_limit")
        self.assertNotIn("best_profit", result)


if __name__ == "__main__":
    unittest.main()

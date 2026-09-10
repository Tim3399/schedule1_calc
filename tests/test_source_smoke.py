"""Source smoke must fail honestly and clean up only its launched process."""

from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tools import source_smoke


class SourceSmokeTests(unittest.TestCase):
    def test_exited_child_is_not_mistaken_for_ready_application(self):
        process = Mock()
        process.poll.return_value = 1
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with patch.object(source_smoke.subprocess, "Popen", return_value=process):
                with self.assertRaisesRegex(source_smoke.SmokeError, "exited before readiness"):
                    source_smoke.exercise(root, root / "startup.log")
        process.terminate.assert_not_called()

    def test_deadline_terminates_owned_child_and_escalates_if_needed(self):
        process = Mock()
        process.poll.return_value = None
        process.wait.side_effect = [subprocess.TimeoutExpired("owned child", 5), 0]
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with patch.object(source_smoke.subprocess, "Popen", return_value=process):
                with self.assertRaisesRegex(source_smoke.SmokeError, "deadline"):
                    source_smoke.exercise(root, root / "startup.log", deadline_seconds=0)
        process.terminate.assert_called_once_with()
        process.kill.assert_called_once_with()

    def test_unsafe_archive_is_rejected_before_extraction_or_process_start(self):
        with patch.object(
            source_smoke, "validate_zip", side_effect=source_smoke.ReleaseError("unsafe")
        ):
            with patch.object(source_smoke, "exercise") as exercise:
                with self.assertRaisesRegex(source_smoke.ReleaseError, "unsafe"):
                    source_smoke.smoke_archive(Path("untrusted.zip"), "1.0.3")
        exercise.assert_not_called()


if __name__ == "__main__":
    unittest.main()

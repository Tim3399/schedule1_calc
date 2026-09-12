"""The application owns a bounded set of logging handlers and files."""

import logging
from pathlib import Path
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.functionality.logging import logging_config


class LoggingConfigurationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.logger = logging.Logger("isolated-schedule-logging")
        self.patchers = [
            mock.patch.object(logging_config.logging, "getLogger", return_value=self.logger),
            mock.patch.object(
                logging_config, "__file__", str(Path(self.temp.name) / "logging_config.py")
            ),
            mock.patch.dict(logging_config.os.environ, {"SCHEDULE1_LOG_STDOUT_ONLY": "0"}),
        ]
        for patcher in self.patchers:
            patcher.start()
            self.addCleanup(patcher.stop)
        self.addCleanup(lambda: [handler.close() for handler in self.logger.handlers])

    def test_setup_preserves_foreign_handlers_and_installs_ours_only_once(self):
        foreign = logging.NullHandler()
        self.logger.addHandler(foreign)
        for _ in range(3):
            self.assertIs(logging_config.setup_logging(), self.logger)
        self.assertEqual(len(self.logger.handlers), 3)
        self.assertIn(foreign, self.logger.handlers)
        file_handler = next(
            h for h in self.logger.handlers if getattr(h, "_schedule1_kind", None) == "file"
        )
        self.assertEqual(Path(file_handler.baseFilename).name, "sh_log.log")
        self.assertEqual(file_handler.maxBytes, 1024 * 1024)
        self.assertEqual(file_handler.backupCount, 5)
        file_handler.maxBytes = 100
        record = logging.LogRecord("test", logging.INFO, "", 0, "x" * 70, (), None)
        for _ in range(15):
            file_handler.emit(record)
        files = list((Path(self.temp.name) / "logs").glob("sh_log.log*"))
        self.assertLessEqual(len(files), 6)

    def test_stdout_only_does_not_create_files(self):
        with mock.patch.dict(logging_config.os.environ, {"SCHEDULE1_LOG_STDOUT_ONLY": "1"}):
            logging_config.setup_logging()
            logging_config.setup_logging()
        self.assertEqual(len(self.logger.handlers), 1)
        self.assertEqual(self.logger.handlers[0]._schedule1_kind, "console")
        self.assertFalse((Path(self.temp.name) / "logs").exists())


if __name__ == "__main__":
    unittest.main()

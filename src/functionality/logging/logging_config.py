import logging
import os
from logging.handlers import RotatingFileHandler

MAX_LOG_BYTES = 1024 * 1024
LOG_BACKUPS = 5


def setup_logging():
    """Install our handlers once, including when imported through both package paths."""
    logger = logging.getLogger()
    logger.setLevel(logging.DEBUG)
    installed = {getattr(handler, "_schedule1_kind", None) for handler in logger.handlers}
    if "console" not in installed:
        handler = logging.StreamHandler()
        handler._schedule1_kind = "console"
        handler.setLevel(logging.INFO)
        handler.setFormatter(logging.Formatter("%(levelname)s - %(message)s"))
        logger.addHandler(handler)
    if os.environ.get("SCHEDULE1_LOG_STDOUT_ONLY") != "1" and "file" not in installed:
        log_dir = os.path.join(os.path.dirname(__file__), "logs")
        os.makedirs(log_dir, exist_ok=True)
        handler = RotatingFileHandler(
            os.path.join(log_dir, "sh_log.log"),
            maxBytes=MAX_LOG_BYTES,
            backupCount=LOG_BACKUPS,
            encoding="utf-8",
        )
        handler._schedule1_kind = "file"
        handler.setLevel(logging.INFO)
        handler.setFormatter(logging.Formatter("%(asctime)s - %(levelname)s - %(message)s"))
        logger.addHandler(handler)
    return logger

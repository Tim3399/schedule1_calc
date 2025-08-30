import logging
import os
from logging.handlers import RotatingFileHandler
from datetime import datetime

def setup_logging():
    # Log-Verzeichnis
    log_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "logs"))
    os.makedirs(log_dir, exist_ok=True)

    # Log-Dateiname mit aktuellem Datum
    log_filename = f"sh_log_{datetime.now().strftime('%d_%m_%y')}.log"
    log_filepath = os.path.join(log_dir, log_filename)

    # Logger konfigurieren
    logger = logging.getLogger()
    logger.setLevel(logging.DEBUG)

    # Rotating File Handler (max. 10 Dateien, jede max. 1 MB)
    file_handler = RotatingFileHandler(
        log_filepath, maxBytes=1_000_000_000_000, backupCount=10
    )
    file_handler.setLevel(logging.INFO)
    file_formatter = logging.Formatter(
        "%(asctime)s - %(levelname)s - %(message)s"
    )
    file_handler.setFormatter(file_formatter)

    # Stream Handler (für Konsole)
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.INFO)
    console_formatter = logging.Formatter("%(levelname)s - %(message)s")
    console_handler.setFormatter(console_formatter)

    # Handler dem Logger hinzufügen
    logger.addHandler(file_handler)
    logger.addHandler(console_handler)

    return logger
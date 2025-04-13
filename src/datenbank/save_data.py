import sqlite3
from typing import Dict
from src.util.models import CombinationResult
from decimal import Decimal


def save_substances_to_db(substances, db_path="combinations.db"):
    """Saves the substances to the database."""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    for substance in substances:
        cursor.execute("""
        INSERT OR IGNORE INTO substances (name, price, level)
        VALUES (?, ?, ?, ?)
        """, (
            substance.name,
            Decimal(substance.price),
            substance.level,
        ))

    conn.commit()
    conn.close()

def save_effects_to_db(effects, db_path="combinations.db"):
    """Saves the effects to the database."""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    for effect in effects:
        cursor.execute("""
        INSERT OR IGNORE INTO effects (name, modificator)
        VALUES (?, ?)
        """, (
            effect.name,
            effect.modificator
        ))

    conn.commit()
    conn.close()
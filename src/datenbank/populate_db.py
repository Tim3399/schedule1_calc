import argparse
from pathlib import Path
import sqlite3
import sys
from typing import Dict

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from src.datenbank.initialize_db import initialize_database
from src.util.models import CombinationResult
from src.lookup.lookup import effects, substances, products, level_name_to_int


def _lookup_data():
    levels_by_id = {}
    for name, level_id in level_name_to_int.items():
        levels_by_id.setdefault(level_id, name)

    effects_by_name = {}
    for effect in effects:
        if effect.name in effects_by_name:
            raise ValueError(f"Doppelter Effekt im Lookup: {effect.name}")
        effects_by_name[effect.name] = float(effect.modificator)

    products_by_name = {}
    product_effects = set()
    for product in products:
        if product.name in products_by_name:
            raise ValueError(f"Doppeltes Produkt im Lookup: {product.name}")
        if product.level not in levels_by_id:
            raise ValueError(
                f"Produkt {product.name!r} verweist auf unbekanntes Level {product.level!r}"
            )
        products_by_name[product.name] = (
            float(product.base_sell_price),
            float(product.buy_price),
            product.level,
        )
        for effect_name in product.effects or []:
            if effect_name not in effects_by_name:
                raise ValueError(
                    f"Produkt {product.name!r} verweist auf unbekannten Effekt {effect_name!r}"
                )
            product_effects.add((product.name, effect_name))

    substances_by_name = {}
    replacements = set()
    for substance in substances:
        if substance.name in substances_by_name:
            raise ValueError(f"Doppelte Substanz im Lookup: {substance.name}")
        if substance.level not in levels_by_id:
            raise ValueError(
                f"Substanz {substance.name!r} verweist auf unbekanntes Level {substance.level!r}"
            )
        if substance.resulting_effect not in effects_by_name:
            raise ValueError(
                f"Substanz {substance.name!r} verweist auf unbekannten resultierenden Effekt "
                f"{substance.resulting_effect!r}"
            )
        substances_by_name[substance.name] = (
            float(substance.price),
            substance.level,
            substance.resulting_effect,
        )
        for original_name, replacement_name in substance.side_effect_replacements.items():
            for role, effect_name in (
                ("Ausgangseffekt", original_name),
                ("Ersatzeffekt", replacement_name),
            ):
                if effect_name not in effects_by_name:
                    raise ValueError(
                        f"Substanz {substance.name!r}: {role} {effect_name!r} ist unbekannt"
                    )
            replacements.add((substance.name, original_name, replacement_name))

    return {
        "levels": set(levels_by_id.items()),
        "effects": effects_by_name,
        "products": products_by_name,
        "substances": substances_by_name,
        "product_effects": product_effects,
        "replacements": replacements,
    }


def _database_data(cursor):
    levels = set(cursor.execute("SELECT level_id, level_name FROM levels"))
    effect_rows = list(cursor.execute("SELECT effect_id, name, modificator FROM effects"))
    product_rows = list(
        cursor.execute(
            "SELECT product_id, name, base_sell_price, buy_price, level_id FROM products"
        )
    )
    substance_rows = list(
        cursor.execute(
            "SELECT substance_id, name, price, level_id, resulting_effect_id FROM substances"
        )
    )

    effect_names = {row[0]: row[1] for row in effect_rows}
    product_names = {row[0]: row[1] for row in product_rows}
    substance_names = {row[0]: row[1] for row in substance_rows}

    return {
        "levels": levels,
        "effects": {row[1]: row[2] for row in effect_rows},
        "products": {row[1]: (row[2], row[3], row[4]) for row in product_rows},
        "substances": {
            row[1]: (row[2], row[3], effect_names.get(row[4], ("missing-effect", row[4])))
            for row in substance_rows
        },
        "product_effects": {
            (
                product_names.get(product_id, ("missing-product", product_id)),
                effect_names.get(effect_id, ("missing-effect", effect_id)),
            )
            for product_id, effect_id in cursor.execute(
                "SELECT product_id, effect_id FROM product_effects"
            )
        },
        "replacements": {
            (
                substance_names.get(substance_id, ("missing-substance", substance_id)),
                effect_names.get(original_id, ("missing-effect", original_id)),
                effect_names.get(replacement_id, ("missing-effect", replacement_id)),
            )
            for substance_id, original_id, replacement_id in cursor.execute(
                """SELECT substance_id, original_effect_id, replacement_effect_id
                   FROM side_effect_replacements"""
            )
        },
    }


def _synchronize_lookup_data(cursor, target):
    cursor.execute("DELETE FROM calculated_combination_effects")
    cursor.execute("DELETE FROM calculated_combination_substances")
    cursor.execute("DELETE FROM calculated_combinations")
    cursor.execute("DELETE FROM product_effects")
    cursor.execute("DELETE FROM side_effect_replacements")

    target_level_ids = {level_id for level_id, _ in target["levels"]}
    # Unique temporary names allow names to move between IDs while foreign keys keep their IDs.
    for (level_id,) in cursor.execute("SELECT level_id FROM levels").fetchall():
        cursor.execute(
            "UPDATE levels SET level_name = ? WHERE level_id = ?",
            (f"\x00schedule1-sync-level-{level_id}", level_id),
        )
    for level_id, level_name in sorted(target["levels"]):
        cursor.execute(
            """INSERT INTO levels (level_id, level_name) VALUES (?, ?)
               ON CONFLICT(level_id) DO UPDATE SET level_name = excluded.level_name""",
            (level_id, level_name),
        )

    for name, modificator in target["effects"].items():
        cursor.execute(
            """INSERT INTO effects (name, modificator) VALUES (?, ?)
               ON CONFLICT(name) DO UPDATE SET modificator = excluded.modificator""",
            (name, modificator),
        )
    effect_ids = dict(cursor.execute("SELECT name, effect_id FROM effects"))

    for name, (base_sell_price, buy_price, level_id) in target["products"].items():
        cursor.execute(
            """INSERT INTO products (name, base_sell_price, buy_price, level_id)
               VALUES (?, ?, ?, ?)
               ON CONFLICT(name) DO UPDATE SET
                   base_sell_price = excluded.base_sell_price,
                   buy_price = excluded.buy_price,
                   level_id = excluded.level_id""",
            (name, base_sell_price, buy_price, level_id),
        )

    for name, (price, level_id, resulting_effect) in target["substances"].items():
        cursor.execute(
            """INSERT INTO substances (name, price, level_id, resulting_effect_id)
               VALUES (?, ?, ?, ?)
               ON CONFLICT(name) DO UPDATE SET
                   price = excluded.price,
                   level_id = excluded.level_id,
                   resulting_effect_id = excluded.resulting_effect_id""",
            (name, price, level_id, effect_ids[resulting_effect]),
        )

    product_ids = dict(cursor.execute("SELECT name, product_id FROM products"))
    substance_ids = dict(cursor.execute("SELECT name, substance_id FROM substances"))
    cursor.executemany(
        "INSERT INTO product_effects (product_id, effect_id) VALUES (?, ?)",
        [
            (product_ids[product_name], effect_ids[effect_name])
            for product_name, effect_name in sorted(target["product_effects"])
        ],
    )
    cursor.executemany(
        """INSERT INTO side_effect_replacements
           (substance_id, original_effect_id, replacement_effect_id) VALUES (?, ?, ?)""",
        [
            (substance_ids[substance_name], effect_ids[original_name], effect_ids[replacement_name])
            for substance_name, original_name, replacement_name in sorted(target["replacements"])
        ],
    )

    for entity_id, name in cursor.execute("SELECT product_id, name FROM products").fetchall():
        if name not in target["products"]:
            cursor.execute("DELETE FROM products WHERE product_id = ?", (entity_id,))
    for entity_id, name in cursor.execute("SELECT substance_id, name FROM substances").fetchall():
        if name not in target["substances"]:
            cursor.execute("DELETE FROM substances WHERE substance_id = ?", (entity_id,))
    for entity_id, name in cursor.execute("SELECT effect_id, name FROM effects").fetchall():
        if name not in target["effects"]:
            cursor.execute("DELETE FROM effects WHERE effect_id = ?", (entity_id,))
    for (level_id,) in cursor.execute("SELECT level_id FROM levels").fetchall():
        if level_id not in target_level_ids:
            cursor.execute("DELETE FROM levels WHERE level_id = ?", (level_id,))


def populate_database(db_path="combinations.db"):
    """Atomically sync lookup data and invalidate stored combinations only when it changed."""
    conn = sqlite3.connect(db_path)
    changed = False
    try:
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("BEGIN IMMEDIATE")
        cursor = conn.cursor()
        target = _lookup_data()
        changed = _database_data(cursor) != target
        if changed:
            _synchronize_lookup_data(cursor, target)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

    if changed:
        print("Stammdaten synchronisiert; berechnete Kombinationen wurden invalidiert.")
    else:
        print("Stammdaten bereits aktuell; berechnete Kombinationen wurden beibehalten.")


def store_all_combinations_normalized(
    db_path: str,
    product_name: str,
    combination_size: int,
    combinations: Dict[str, CombinationResult],
):
    """Store one recipe batch atomically after validating every database reference."""
    conn = sqlite3.connect(db_path)
    try:
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("BEGIN IMMEDIATE")
        cursor = conn.cursor()

        product_row = cursor.execute(
            "SELECT product_id FROM products WHERE name = ?", (product_name,)
        ).fetchone()
        if product_row is None:
            raise ValueError(f"Product '{product_name}' not found in database.")
        product_id = product_row[0]

        substance_map = dict(cursor.execute("SELECT name, substance_id FROM substances"))
        effect_map = dict(cursor.execute("SELECT name, effect_id FROM effects"))

        for result in combinations.values():
            for substance_name in result.substances:
                if substance_name not in substance_map:
                    raise ValueError(f"Substance '{substance_name}' not found in database.")
            for effect_name in result.effects:
                if effect_name not in effect_map:
                    raise ValueError(f"Effect '{effect_name}' not found in database.")

        for result in combinations.values():
            cursor.execute(
                """
                INSERT INTO calculated_combinations (
                    product_id, combination_size, modifier, sell_price, substance_cost
                ) VALUES (?, ?, ?, ?, ?)
            """,
                (
                    product_id,
                    combination_size,
                    round(float(result.modifier), 2),
                    round(float(result.sell_price), 2),
                    round(float(result.substance_cost), 2),
                ),
            )
            combination_id = cursor.lastrowid

            for position, substance_name in enumerate(result.substances):
                cursor.execute(
                    """
                    INSERT INTO calculated_combination_substances (
                        combination_id, substance_id, position
                    ) VALUES (?, ?, ?)
                """,
                    (combination_id, substance_map[substance_name], position),
                )

            for effect_name in result.effects:
                cursor.execute(
                    """
                    INSERT INTO calculated_combination_effects (
                        combination_id, effect_id
                    ) VALUES (?, ?)
                """,
                    (combination_id, effect_map[effect_name]),
                )

        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

    print(f"{len(combinations)} Kombinationen (normalisiert) gespeichert.")


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Initialisiert die SQLite-Datenbank und befüllt ihre Stammdaten."
    )
    parser.add_argument(
        "--db-path",
        default="combinations.db",
        help="Pfad zur SQLite-Datenbank (Standard: combinations.db)",
    )
    args = parser.parse_args(argv)

    initialize_database(args.db_path)
    populate_database(args.db_path)


if __name__ == "__main__":
    main()

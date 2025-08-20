import sqlite3
from typing import Dict

from src.util.models import CombinationResult
from src.lookup.lookup import effects, substances, products, level_name_to_int

def populate_database(db_path="combinations.db"):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # 1. LEVELS
    for level_name, level_id in level_name_to_int.items():
        cursor.execute("""
            INSERT OR IGNORE INTO levels (level_id, level_name) VALUES (?, ?)
        """, (level_id, level_name))

    # 2. EFFECTS
    effect_ids = {}
    for effect in effects:
        cursor.execute("""
            INSERT OR IGNORE INTO effects (name, modificator) VALUES (?, ?)
        """, (effect.name, float(effect.modificator)))
        cursor.execute("SELECT effect_id FROM effects WHERE name = ?", (effect.name,))
        effect_ids[effect.name] = cursor.fetchone()[0]

    # 3. SUBSTANCES + SIDE EFFECTS
    for substance in substances:
        resulting_id = effect_ids.get(substance.resulting_effect)
        level_id = substance.level

        cursor.execute("""
            INSERT OR IGNORE INTO substances (name, price, level_id, resulting_effect_id)
            VALUES (?, ?, ?, ?)
        """, (substance.name, float(substance.price), level_id, resulting_id))

        cursor.execute("SELECT substance_id FROM substances WHERE name = ?", (substance.name,))
        substance_id = cursor.fetchone()[0]

        for orig, repl in substance.side_effect_replacements.items():
            cursor.execute("""
                INSERT OR IGNORE INTO side_effect_replacements
                (substance_id, original_effect_id, replacement_effect_id)
                VALUES (?, ?, ?)
            """, (
                substance_id,
                effect_ids.get(orig),
                effect_ids.get(repl)
            ))

    # 4. PRODUCTS + PRODUCT_EFFECTS
    for product in products:
        level_id = product.level
        cursor.execute("""
            INSERT OR IGNORE INTO products (name, base_sell_price, buy_price, level_id)
            VALUES (?, ?, ?, ?)
        """, (product.name, float(product.base_sell_price), float(product.buy_price), level_id))

        cursor.execute("SELECT product_id FROM products WHERE name = ?", (product.name,))
        product_id = cursor.fetchone()[0]

        for effect_name in product.effects:
            effect_id = effect_ids.get(effect_name)
            if effect_id:
                cursor.execute("""
                    INSERT OR IGNORE INTO product_effects (product_id, effect_id)
                    VALUES (?, ?)
                """, (product_id, effect_id))

    conn.commit()
    conn.close()
    print("Datenbank erfolgreich befüllt.")



def store_all_combinations_normalized(
    db_path: str,
    product_name: str,
    combination_size: int,
    combinations: Dict[str, CombinationResult]
):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Lookup maps
    cursor.execute("SELECT product_id FROM products WHERE name = ?", (product_name,))
    product_id = cursor.fetchone()[0]

    cursor.execute("SELECT name, substance_id FROM substances")
    substance_map = dict(cursor.fetchall())

    cursor.execute("SELECT name, effect_id FROM effects")
    effect_map = dict(cursor.fetchall())

    for result in combinations.values():

        cursor.execute("""
            INSERT INTO calculated_combinations (
                product_id, combination_size, modifier, sell_price, substance_cost
            ) VALUES (?, ?, ?, ?, ?)
        """, (
            product_id,
            combination_size,
            round(float(result.modifier), 2),
            round(float(result.sell_price), 2),
            round(float(result.substance_cost), 2)
        ))
        combination_id = cursor.lastrowid

        for idx, sub in enumerate(result.substances):
            substance_id = substance_map.get(sub)
            if substance_id:
                cursor.execute("""
                    INSERT INTO calculated_combination_substances (
                        combination_id, substance_id, position
                    ) VALUES (?, ?, ?)
                """, (combination_id, substance_id, idx))

        for eff in result.effects:
            effect_id = effect_map.get(eff)
            if effect_id:
                cursor.execute("""
                    INSERT INTO calculated_combination_effects (
                        combination_id, effect_id
                    ) VALUES (?, ?)
                """, (combination_id, effect_id))

    conn.commit()
    conn.close()
    print(f"{len(combinations)} Kombinationen (normalisiert) gespeichert.")

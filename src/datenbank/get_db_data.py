def get_best_recipe_filtered(product_name: str, max_level: int, combination_size: int, db_path="combinations.db"):
    """
    Führt eine Abfrage in der Datenbank durch, um das beste Rezept (höchster Profit)
    für das angegebene Produkt zu ermitteln, das nur Substanzen bis zu 'max_level' benutzt
    und genau 'combination_size' Substanzen enthält.
    """
    import sqlite3

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Finde die product_id
    cursor.execute("SELECT product_id FROM products WHERE name = ? LIMIT 1", (product_name,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return None  # Produkt nicht gefunden

    product_id = row[0]

    # Suche die beste Kombination basierend auf Profit, gefiltert nach Level und Kombinationgröße
    query = """
        SELECT c.id, c.modifier, c.sell_price, c.substance_cost,
               (c.sell_price - c.substance_cost) AS profit
        FROM calculated_combinations c
        JOIN calculated_combination_substances cs ON c.id = cs.combination_id
        JOIN substances s ON s.substance_id = cs.substance_id
        WHERE c.product_id = ?
          AND c.combination_size = ?
        GROUP BY c.id
        HAVING MAX(s.level_id) <= ?
        ORDER BY profit DESC
        LIMIT 1
    """
    cursor.execute(query, (product_id, combination_size, max_level))
    best_combination = cursor.fetchone()

    if not best_combination:
        conn.close()
        return None  # Keine passende Kombination gefunden

    combination_id, modifier, sell_price, substance_cost, profit = best_combination

    # Hole die zugehörigen Substanzen
    cursor.execute("""
        SELECT s.name
        FROM calculated_combination_substances cs
        JOIN substances s ON s.substance_id = cs.substance_id
        WHERE cs.combination_id = ?
        ORDER BY cs.position
    """, (combination_id,))
    substances = [r[0] for r in cursor.fetchall()]

    conn.close()

    return {
        "combination_id": combination_id,
        "modifier": modifier,
        "sell_price": sell_price,
        "substance_cost": substance_cost,
        "profit": profit,
        "substances": substances
    }
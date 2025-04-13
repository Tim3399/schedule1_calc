import sqlite3

def get_recipes_by_effect(effect_name: str, db_path="combinations.db"):
    """Fetches all recipes that include a specific effect."""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    cursor.execute("""
    SELECT combination, effects, modifier, profit
    FROM recipes
    WHERE effects LIKE ?
    """, (f"%{effect_name}%",))

    results = cursor.fetchall()
    conn.close()
    return results

def get_all_substances(db_path="combinations.db"):
    """Fetches all substances from the database."""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM substances")
    results = cursor.fetchall()
    conn.close()
    return results

def get_all_effects(db_path="combinations.db"):
    """Fetches all effects from the database."""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM effects")
    results = cursor.fetchall()
    conn.close()
    return results
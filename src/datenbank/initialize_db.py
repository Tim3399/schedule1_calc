import sqlite3

def initialize_database(db_path="combinations.db"):
    """Initializes the database and creates necessary tables."""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Create substances table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS substances (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        price REAL NOT NULL,
        level INTEGER NOT NULL,
    )
    """)

    # Create effects table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS effects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        modifier REAL NOT NULL
    )
    """)

    # Create recipes table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS recipes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_name TEXT NOT NULL,
        modifier REAL NOT NULL,
        sell_price REAL NOT NULL
    )
    """)

    # Create rec <-> eff table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS rec_to_eff (
        recipe_id INTEGER,
        effect_id INTEGER,
        FOREIGN KEY (recipe_id) REFERENCES recipes (id),
        FOREIGN KEY (effect_id) REFERENCES effects (id)
    )
    """)

    # Create rec <-> sub table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS rec_to_sub (
        recipe_id INTEGER,
        substance_id INTEGER,
        FOREIGN KEY (recipe_id) REFERENCES recipes (id),
        FOREIGN KEY (substance_id) REFERENCES substances (id)
    )
    """)


    conn.commit()
    conn.close()
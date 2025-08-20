import sqlite3

def initialize_database(db_path="combinations.db"):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Levels
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS levels (
            level_id INTEGER PRIMARY KEY AUTOINCREMENT,
            level_name TEXT UNIQUE NOT NULL
        );
    """)

    # Effects
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS effects (
            effect_id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            modificator NUMERIC
        );
    """)

    # Products
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS products (
            product_id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            base_sell_price NUMERIC,
            buy_price NUMERIC,
            level_id INTEGER,
            FOREIGN KEY (level_id) REFERENCES levels(level_id)
        );
    """)

    # Product -> Effects (Many-to-Many)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS product_effects (
            product_id INTEGER,
            effect_id INTEGER,
            PRIMARY KEY (product_id, effect_id),
            FOREIGN KEY (product_id) REFERENCES products(product_id),
            FOREIGN KEY (effect_id) REFERENCES effects(effect_id)
        );
    """)

    # Substances
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS substances (
            substance_id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            price NUMERIC,
            level_id INTEGER,
            resulting_effect_id INTEGER,
            FOREIGN KEY (level_id) REFERENCES levels(level_id),
            FOREIGN KEY (resulting_effect_id) REFERENCES effects(effect_id)
        );
    """)

    # Side Effect Replacements
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS side_effect_replacements (
            substance_id INTEGER,
            original_effect_id INTEGER,
            replacement_effect_id INTEGER,
            PRIMARY KEY (substance_id, original_effect_id),
            FOREIGN KEY (substance_id) REFERENCES substances(substance_id),
            FOREIGN KEY (original_effect_id) REFERENCES effects(effect_id),
            FOREIGN KEY (replacement_effect_id) REFERENCES effects(effect_id)
        );
    """)

    # Calculated_combinations
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS calculated_combinations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id INTEGER NOT NULL,
            combination_size INTEGER NOT NULL,
            modifier NUMERIC NOT NULL,
            sell_price NUMERIC NOT NULL,
            substance_cost NUMERIC NOT NULL,
            FOREIGN KEY (product_id) REFERENCES products(product_id)
        );
    """)

    # Calculated_combination substances
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS calculated_combination_substances (
            combination_id INTEGER,
            substance_id INTEGER,
            position INTEGER,
            FOREIGN KEY (combination_id) REFERENCES calculated_combinations(id),
            FOREIGN KEY (substance_id) REFERENCES substances(substance_id),
            PRIMARY KEY (combination_id, position)
        );
    """)

    # Calculated combination effects
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS calculated_combination_effects (
            combination_id INTEGER,
            effect_id INTEGER,
            FOREIGN KEY (combination_id) REFERENCES calculated_combinations(id),
            FOREIGN KEY (effect_id) REFERENCES effects(effect_id),
            PRIMARY KEY (combination_id, effect_id)
        );
    """)

    conn.commit()
    conn.close()
    print(f"Database initialized at: {db_path}")

# Run the function
if __name__ == "__main__":
    initialize_database()
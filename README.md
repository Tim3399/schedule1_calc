
# schedule1_calc

# Todo 
- write readme without AI 

# Description
-----------
`schedule1_calc` is a small Python project that calculates profitable product combinations from a set of substances. It includes a lightweight Flask web interface for interactive use. Data is stored in a local SQLite database (`combinations.db`).

Repository contents (high level)
- `webapp/` – Flask application (`app.py`) with templates, JS and CSS for the UI.
- `src/datenbank/` – Database helper scripts: initialization (`initialize_db.py`), population (`populate_db.py`) and helpers (`get_db_data.py`).
- `src/functionality/` – Core calculation logic (`calc_modifier.py`).
- `src/lookup/` – Static model data: products, substances, effects and level mappings (`lookup.py`).
- `src/util/models.py` – Data classes for products, substances, effects and result objects.
- `combinations.db` – optional SQLite database (may already exist in the repo).

Quickstart (PowerShell)
1) Create and activate a virtual environment (recommended):

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

2) Install dependencies:

```powershell
pip install -r requirements.txt
```

3) Initialize the database (creates `combinations.db` and tables):

```powershell
python src\datenbank\initialize_db.py
```

4) (Optional) Populate the database with lookup data:

```powershell
python src\datenbank\populate_db.py
```

5) Start the webapp:

```powershell
python webapp\app.py
```

The web UI will then be available at `http://127.0.0.1:5000/`.

CLI / Batch usage
- The calculation and export functions are implemented in `src/functionality/calc_modifier.py`. That file contains a `__main__` example block with sample parameters (combination size, product name, level); either adjust those values or import `get_best_mix` from other scripts to use the functions programmatically.

Important notes
- Product and substance data are maintained in `src/lookup/lookup.py`. Update prices, levels or effects there before populating the database.
- Logging is configured in `src/logging_config.py` and logs are written to `src/logs/`.
- The calculation enumerates combinations using the cartesian product (with repetition). This can become very slow and memory intensive for large combination sizes. Limit `combination_size` and `max_level` to keep runs practical.

Project structure (short)

```
README.md
requirements.txt
combinations.db            # optional
webapp/                    # Flask app
src/
	datenbank/             # DB initialization / population / helpers
	functionality/         # calculation logic
	lookup/                # products / substances / effects / levels
	util/                  # data classes
```

Further / ToDo
- (optional) extend / pin `requirements.txt` if you add more dependencies.
- Add tests and CI (e.g. GitHub Actions) to automatically validate changes.

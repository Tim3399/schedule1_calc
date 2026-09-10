# schedule1_calc

[Deutsch](README.md) · **English**

A local ingredient combination calculator for the game **Schedule I**. For a selected product, the Flask web interface displays both the combination with the highest effect modifier and the one with the highest profit, including their ingredients, effects, selling prices and ingredient costs. The current project version is recorded in [VERSION](VERSION).

The application uses the game data stored in the repository at [src/lookup/lookup.py](src/lookup/lookup.py). The web interface does not require a database; SQLite is available for optional data exports.

## Quick start

Select a Python installation **3.12 or newer**; **Python 3.12.14** is the tested version. Node.js, npm and formatters are only needed for development. The launcher accepts newer Python versions, but that does not mean they have been tested.

Clone the repository or open an existing copy:

```shell
git clone https://github.com/Tim3399/schedule1_calc.git
cd schedule1_calc
```

Run all commands below from the repository directory. Select Python with your runtime manager first and check the output of `python --version`; when creating the environment, `python` must point to that interpreter.

### Windows / PowerShell

```powershell
python --version
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe tools\project.py start
```

### Linux / macOS

```bash
python --version
python -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python tools/project.py start
```

If your selected interpreter has a different name, use that name or its full path to check the version and create the environment. All subsequent commands explicitly use the Python interpreter in `.venv`.

Wait for `[web] Ready`, then open [http://127.0.0.1:5000/](http://127.0.0.1:5000/). Stop the application with `Ctrl+C`.

## Usage

The web interface currently uses English labels:

1. Under **Level**, select the highest rank whose ingredients should be available.
2. Under **Combination Size**, enter the maximum number of added ingredients. Start with **1 or 2**.
3. Under **Product Name**, select the base product and click **Get Best Mix**.

The search considers ingredient order, repeated ingredients and all sizes from one to the maximum entered. It displays both **Best Modifier Combination** (highest effect modifier) and **Best Profit Combination** (highest profit), including the selling price, ingredient costs and their difference as **Profit**. This difference excludes the production costs of the base product. Both sections appear even when the same recipe wins for both objectives.

The rank filters ingredients but does not enforce the unlock rank of the base product. Searches allow at most 200,000 combinations per recipe length and reject larger requests before calculation; the JSON API then returns HTTP 400. With all 16 ingredients available, this permits at most four ingredients per recipe. By default, only the two best results are retained; database export explicitly requests the full collection. Further bugs and differences from the reviewed references are documented for the data and calculations. See [Reviews and known limitations](#reviews-and-known-limitations).

## Development setup

Development and CI tools are pinned to exact versions: **Python 3.12.14**, **Node 22.23.2** and **npm 10.9.8**. Their shared source is [tools/toolchains.json](tools/toolchains.json). Select these versions before setup; an environment created with a different Python version must be recreated with the correct interpreter for development checks.

Using the matching `.venv` from the quick start:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
npm ci
.\.venv\Scripts\python.exe tools\project.py doctor
```

On Linux/macOS, replace `.\.venv\Scripts\python.exe` with `.venv/bin/python` and `tools\project.py` with `tools/project.py` in the development commands.

The formatting, local startup and versioning rules come from Quiltor and have been adapted to Flask. Required commands, exceptions and verification limits are documented in the [project profile (German)](docs/PROJECT_PROFILE.md); the versioned baseline is in [docs/standards](docs/standards/README.md).

## Local startup and ports

`tools/project.py start` starts the frontend and API together in the same Flask process; `dev` is an equivalent alias. The `[web] Ready` message includes the URL, mode, version, Git revision and source digest. After changing Python, templates, JavaScript or CSS, stop your server with `Ctrl+C` and restart it; automatic reloading is disabled.

Choose another port explicitly. An occupied port causes an error; other processes are not terminated.

```powershell
.\.venv\Scripts\python.exe tools\project.py start --port 5011
```

Alternatively, set `SCHEDULE1_PORT`; `--port` takes precedence. Use separate ports and data paths for parallel checkouts: a different port does not isolate databases or logs. The launcher does not create a database, install anything or change the version. There is no separate frontend build or production preview mode.

## Formatting, checks and tests

```powershell
.\.venv\Scripts\python.exe tools\project.py format
.\.venv\Scripts\python.exe tools\project.py check-format
.\.venv\Scripts\python.exe tools\project.py check
.\.venv\Scripts\python.exe tools\project.py test
```

`format` writes changes; `check-format` checks the same Python, web and documentation files without modifying them. `check` also checks Python syntax, version pins and product version consistency. It runs neither tests nor a production build. `test` runs the existing unit tests; this is not a complete test suite for the game model.

Ruff handles Python, Biome handles JavaScript/JSON/CSS, and Prettier handles Markdown/YAML/HTML. Shared rules: UTF-8, LF, a line width of 100 and two-space indentation; Python uses four spaces. Details and exclusions are in the [project profile (German)](docs/PROJECT_PROFILE.md).

## Continuous Integration

The GitHub Actions workflow [Project checks](.github/workflows/check.yml) runs on pushes and pull requests using **Ubuntu 24.04** and **Windows 2025**. It installs the pinned tools and runs `check` and `test` separately.

Verified on **2026-09-09**: both platforms passed for version **1.0.3**, commit [`f618c15`](https://github.com/Tim3399/schedule1_calc/commit/f618c151e42bdc93b8a01e0292347fbe31b49f19) ([CI run](https://github.com/Tim3399/schedule1_calc/actions/runs/34382331671)). See [GitHub Actions](https://github.com/Tim3399/schedule1_calc/actions/workflows/check.yml) for current results. The workflow does not publish a release or perform a deployment.

## Changing the version

`VERSION` is the authoritative stable product version. The update command synchronizes `package.json` and both version fields in `package-lock.json` and requires a clean Git working tree.

```powershell
.\.venv\Scripts\python.exe tools\project.py check-version
.\.venv\Scripts\python.exe tools\project.py set-version patch
```

Instead of `patch`, use `minor`, `major` or a higher explicit version such as `1.1.0`. Then review the diff, format the files and run `check`/`test`. The command does not create a commit, tag or release, and does not push. Release checks that have not yet been implemented are listed in the project profile.

## Optional: create a lookup database

The interactive web calculator does not require a SQLite database. To create a new optional data export, run this command from the repository directory:

```powershell
.\.venv\Scripts\python.exe -m src.datenbank.populate_db --db-path combinations.db
```

The command creates missing tables and populates reference data. You can also run `src/datenbank/populate_db.py` directly with the same arguments. `--db-path` is optional and defaults to `combinations.db`; relative paths resolve against the current working directory. Use `--help` to display the options.

Population synchronizes reference data with `src/lookup/lookup.py`: values are updated, new entries are added, and removed entries and relationships are deleted. IDs of surviving effects, ingredients and products remain stable. Manually added reference data is therefore not retained permanently.

When reference data changes, stored recipe calculations and their relationships are removed in the same transaction. These derived records must then be recalculated and exported; the population command does not calculate recipes. An unchanged dataset preserves existing recipes. Errors roll back the synchronization. For parallel exports, use a separate database path for each checkout.

Recipe calculations can be exported with `generate_db_entrys(1, "OG Kush", "street_rat_i", db_path="combinations.db")` from `src/functionality/calc_modifier.py`. The database must first be initialized and populated with reference data. Export normalizes product names and uses the supplied path; omitting `db_path` keeps the default `combinations.db`. Each write for one recipe length is atomic. If a later write fails, previously saved recipe lengths remain intact.

## Reviews and known limitations

- [Detailed code review from 2026-09-08 (German)](docs/reviews/2026-09-08-code-review.md): reproduced bugs, technical risks and verification limits.
- [Wiki and data review from 2026-09-08 (German)](docs/reviews/2026-09-08-wiki-audit.md): comparison of all 34 local effect modifiers, 16 ingredients, 114 replacement rules and 8 products; conflicting sources are listed separately.

The P1 finding F01 concerning unbounded web searches has been fixed with a combination limit and continuous selection of the two best results. F02 is also fixed: Both winners are displayed in the web interface. F03/F12 are fixed: Invalid input returns clear 4xx responses, including form submissions without JavaScript. F04 is fixed: Repeated ingredients allow recipes longer than the list of available ingredients, provided they fit within the search budget. F05 is fixed: An incomplete minimum-ingredient search raises `MinimumSearchLimitExceeded` with the requested and actually checked maximum lengths; the CLI explicitly reports the budget limit. F06 is fixed: A base product that already meets the requested effects is returned as a valid recipe with zero additions and displayed by the CLI. F07/F08 are fixed: The database command initializes and synchronizes reference data; changed data invalidates stored recipe calculations. F09 is partially fixed: Money values are calculated from individual effect modifiers using decimal arithmetic. Rounding to whole dollars remains open because the treatment of exact half-dollar values is not yet reliably established. F11 is fixed: Export preserves canonical product names and rolls back failed writes. The effect limit remains open. The limit applies per recipe length; shorter lengths are also searched. A result is not automatically verified against the current game version. The wiki comparison records the sources available on its review date; it is not a test against current game binaries.

## Project structure

| Directory            | Contents                                        |
| -------------------- | ----------------------------------------------- |
| `webapp/`            | Flask app, templates, JavaScript and CSS        |
| `src/functionality/` | Calculation and logging                         |
| `src/lookup/`        | Local game data                                 |
| `src/datenbank/`     | SQLite schema, population and queries           |
| `src/util/`          | Data classes                                    |
| `tools/`             | Startup, formatting, check and version commands |
| `tests/`             | Unit tests for project tooling                  |
| `.github/workflows/` | CI configuration                                |
| `docs/`              | Project profile, standards and review reports   |

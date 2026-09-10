# schedule1_calc

**Deutsch** · [English](README.en.md)

Ein lokaler Rechner für Zutatenkombinationen im Spiel **Schedule I**. Die Flask-Weboberfläche zeigt für ein gewähltes Produkt die Kombination mit dem höchsten Effektzuschlag und die mit dem höchsten Gewinn an, jeweils mit Zutaten, Effekten, Verkaufspreis und Zutatenkosten. Die aktuelle Projektversion steht in [VERSION](VERSION).

Die Anwendung rechnet mit den im Repository hinterlegten Spieldaten aus [src/lookup/lookup.py](src/lookup/lookup.py). Eine Datenbank ist für die Weboberfläche nicht erforderlich; SQLite ist für optionale Datenexporte vorhanden.

## Schnellstart

Voraussetzung ist eine ausgewählte Python-Installation **ab 3.12**; geprüft ist **Python 3.12.14**. Node.js, npm und Formatierer brauchst du nur für die Entwicklung. Neuere Python-Versionen werden vom Launcher akzeptiert, sind damit aber nicht automatisch getestet.

Klone das Repository oder öffne eine vorhandene Kopie:

```shell
git clone https://github.com/Tim3399/schedule1_calc.git
cd schedule1_calc
```

Alle folgenden Befehle werden im Repository ausgeführt. Wähle Python vorab über deinen Runtime-Manager und kontrolliere die Ausgabe von `python --version`; beim Erstellen der Umgebung muss `python` auf diesen Interpreter zeigen.

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

Falls dein gewählter Interpreter anders heißt, verwende für Versionsprüfung und Umgebungserstellung dessen Namen oder vollständigen Pfad. Danach führen alle Befehle ausdrücklich den Python-Interpreter aus `.venv` aus.

Warte auf die Meldung `[web] Ready` und öffne [http://127.0.0.1:5000/](http://127.0.0.1:5000/). Beenden kannst du die Anwendung mit `Ctrl+C`.

## Verwendung

Die Weboberfläche ist derzeit englisch beschriftet:

1. Wähle unter **Level** den Rang, bis zu dem Zutaten verfügbar sein sollen.
2. Trage unter **Combination Size** die maximale Anzahl zugesetzter Zutaten ein. Beginne mit **1 oder 2**.
3. Wähle unter **Product Name** das Ausgangsprodukt und klicke auf **Get Best Mix**.

Die Suche berücksichtigt Zutatenreihenfolgen, wiederholte Zutaten und die Größen von eins bis zum eingegebenen Maximum. Angezeigt werden **Best Modifier Combination** (höchster Effektzuschlag) und **Best Profit Combination** (höchster Gewinn), jeweils mit Verkaufspreis, Zutatenkosten und der Differenz als **Profit**. Diese Differenz berücksichtigt keine Herstellungskosten des Ausgangsprodukts. Beide Bereiche erscheinen auch dann, wenn dasselbe Rezept beide Ziele erfüllt.

Der Rang filtert die Zutaten, erzwingt aber keine Freischaltung des Ausgangsprodukts. In der Weboberfläche ist **Exact** voreingestellt: Beide Sieger werden erst nach bewiesen vollständiger Suche ausgegeben. **Fast** liefert ausdrücklich als Näherung gekennzeichnete Ergebnisse. Bei Ressourcenlimits antwortet die JSON-API mit HTTP 503 und `incomplete`, ohne Siegerrezepte und ohne automatischen Moduswechsel. Auch fünf oder sechs Schritte sind möglich, sofern die Suche innerhalb ihrer Grenzen abschließt. Beide Modi behalten nur Gewinner; der separate Legacy-/Datenbankexportpfad hat weiterhin sein bisheriges Kombinationsbudget. Parameter und Antwortschema stehen im [Vertrag der Suchmodi](docs/SEARCH_MODES.md). Weitere Daten- und Berechnungsgrenzen stehen unter [Review und bekannte Grenzen](#review-und-bekannte-grenzen).

## Entwicklung einrichten

Die Entwicklungs- und CI-Werkzeuge sind exakt gepinnt: **Python 3.12.14**, **Node 22.23.2** und **npm 10.9.8**. Gemeinsame Quelle ist [tools/toolchains.json](tools/toolchains.json). Wähle diese Versionen vor der Einrichtung; eine bereits mit einem anderen Python angelegte Umgebung muss für die Entwicklungsprüfungen passend neu eingerichtet werden.

Mit der passenden `.venv` aus dem Schnellstart:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
npm ci
.\.venv\Scripts\python.exe tools\project.py doctor
```

Unter Linux/macOS ersetzt du in den Entwicklungsbefehlen `.\.venv\Scripts\python.exe` durch `.venv/bin/python` und `tools\project.py` durch `tools/project.py`.

Die Regeln für Formatierung, lokale Starts und Versionierung stammen aus Quiltor und wurden an Flask angepasst. Verbindliche Befehle, Ausnahmen und Prüfgrenzen stehen im [Projektprofil](docs/PROJECT_PROFILE.md), die versionierte Baseline unter [docs/standards](docs/standards/README.md).

## Lokaler Start und Ports

`tools/project.py start` startet Frontend und API gemeinsam im selben Flask-Prozess; `dev` ist ein gleichwertiger Alias. Die Meldung `[web] Ready` nennt URL, Modus, Version, Git-Revision und Quelldigest. Nach Änderungen an Python, Templates, JavaScript oder CSS den eigenen Server mit `Ctrl+C` stoppen und neu starten; automatisches Neuladen ist deaktiviert.

Ein anderer Port wird explizit gewählt. Belegte Ports führen zu einem Fehler; fremde Prozesse werden nicht beendet.

```powershell
.\.venv\Scripts\python.exe tools\project.py start --port 5011
```

Alternativ ist `SCHEDULE1_PORT` möglich; `--port` hat Vorrang. Für parallele Checkouts getrennte Ports und eigene Datenpfade verwenden: Ein anderer Port isoliert keine Datenbank oder Logs. Der Launcher erzeugt keine Datenbank, installiert nichts und ändert keine Version. Es gibt keinen getrennten Frontend-Build oder Produktions-Preview-Modus.

## Formatieren, prüfen und testen

```powershell
.\.venv\Scripts\python.exe tools\project.py format
.\.venv\Scripts\python.exe tools\project.py check-format
.\.venv\Scripts\python.exe tools\project.py check
.\.venv\Scripts\python.exe tools\project.py test
```

`format` schreibt Änderungen; `check-format` prüft dieselben Python-, Web- und Dokumentationsdateien ohne Änderung. `check` ergänzt Python-Syntaxprüfung, Pinprüfung und Versionskonsistenz. Es führt weder Tests noch einen Produktions-Build aus. `test` führt die vorhandenen Unittests aus; das ist kein vollständiger fachlicher Spielmodelltest.

Python gehört Ruff, JavaScript/JSON/CSS Biome, Markdown/YAML/HTML Prettier. Gemeinsame Regeln: UTF-8, LF, Breite 100, zwei Leerzeichen; Python vier Leerzeichen. Weitere Details und Ausschlüsse stehen im [Projektprofil](docs/PROJECT_PROFILE.md).

## Continuous Integration

Der GitHub-Actions-Workflow [Project checks](.github/workflows/check.yml) läuft bei Pushes und Pull Requests unter **Ubuntu 24.04** und **Windows 2025**. Er installiert die gepinnten Werkzeuge und führt `check` sowie `test` getrennt aus.

Geprüfter Stand vom **09.09.2026**: Für Version **1.0.3**, Commit [`f618c15`](https://github.com/Tim3399/schedule1_calc/commit/f618c151e42bdc93b8a01e0292347fbe31b49f19), waren beide Plattformen erfolgreich ([CI-Lauf](https://github.com/Tim3399/schedule1_calc/actions/runs/34382331671)). Aktuelle Ergebnisse findest du in [GitHub Actions](https://github.com/Tim3399/schedule1_calc/actions/workflows/check.yml). Der Workflow veröffentlicht kein Release und führt kein Deployment aus.

## Version ändern

`VERSION` ist die maßgebliche stabile Produktversion. Der Änderungsbefehl synchronisiert `package.json` und beide Versionsfelder in `package-lock.json` und verlangt einen sauberen Git-Arbeitsbaum.

```powershell
.\.venv\Scripts\python.exe tools\project.py check-version
.\.venv\Scripts\python.exe tools\project.py set-version patch
```

Statt `patch` sind `minor`, `major` oder eine höhere explizite Version wie `1.1.0` möglich. Danach Diff prüfen, formatieren und `check`/`test` ausführen. Der Befehl erstellt keinen Commit, Tag oder Release und pusht nichts. Noch nicht eingerichtete Veröffentlichungsprüfungen stehen im Projektprofil.

## Optional: Lookup-Datenbank anlegen

Für die interaktive Webberechnung ist keine SQLite-Datenbank erforderlich. Für einen neuen optionalen Datenexport aus dem Repository-Verzeichnis aufrufen:

```powershell
.\.venv\Scripts\python.exe -m src.datenbank.populate_db --db-path combinations.db
```

Der Befehl legt fehlende Tabellen an und befüllt sie mit Stammdaten. Alternativ funktioniert der direkte Aufruf `src/datenbank/populate_db.py` mit denselben Argumenten. `--db-path` ist optional und verwendet standardmäßig `combinations.db`; relative Pfade beziehen sich auf das aktuelle Arbeitsverzeichnis. `--help` zeigt die Optionen.

Die Befüllung synchronisiert die Stammdaten mit `src/lookup/lookup.py`: Werte werden aktualisiert, neue Einträge ergänzt und entfallene Einträge und Beziehungen entfernt. IDs weiterhin vorhandener Effekte, Zutaten und Produkte bleiben erhalten. Manuell ergänzte Stammdaten gehören damit nicht zu einem dauerhaft erhaltenen Datenbestand.

Bei geänderten Stammdaten werden gespeicherte Rezeptberechnungen samt ihren Zuordnungen in derselben Transaktion entfernt. Diese abgeleiteten Daten müssen anschließend neu berechnet und exportiert werden; der Befüllungsbefehl berechnet keine Rezepte. Ein unveränderter Datenstand erhält vorhandene Rezepte. Bei einem Fehler wird die Synchronisierung zurückgerollt. Für parallele Exporte pro Checkout einen eigenen Datenbankpfad verwenden.

Rezeptberechnungen lassen sich über `generate_db_entrys(1, "OG Kush", "street_rat_i", db_path="combinations.db")` aus `src/functionality/calc_modifier.py` exportieren. Die Datenbank muss vorher initialisiert und mit Stammdaten befüllt sein. Der Export normalisiert Produktnamen und verwendet den angegebenen Pfad; ohne `db_path` gilt weiterhin `combinations.db`. Ein Speichervorgang pro Rezeptlänge ist atomar. Bei einem späteren Fehler bleiben bereits erfolgreich gespeicherte andere Rezeptlängen erhalten.

## Review und bekannte Grenzen

- [Ausführliches Code-Review vom 08.09.2026](docs/reviews/2026-09-08-code-review.md): reproduzierte Fehler, technische Risiken und Prüfgrenzen.
- [Wiki- und Datenreview vom 08.09.2026](docs/reviews/2026-09-08-wiki-audit.md): Vergleich aller 34 lokalen Effektzuschläge, 16 Zutaten, 114 Ersetzungsregeln und 8 Produkte; Quellenkonflikte sind gesondert ausgewiesen.
- [Rangkorrekturen vom 10.09.2026](docs/reviews/2026-09-10-rank-corrections.md): Mega Bean ist ab Peddler III verfügbar; Cocaine ist als Enforcer I hinterlegt. Quellen und Spielversionsgrenzen sind dokumentiert.
- [Lokaler Patch-Abschluss vom 10.09.2026](docs/reviews/2026-09-10-patch-abschluss.md): erledigte Korrekturen, Suchintegration, Prüfnachweise und ausdrücklich offene Spielregeln und Datenfragen.

Der P1-Befund F01 zur unbeschränkten Websuche wurde durch ein Kombinationslimit und die laufende Auswahl der beiden besten Ergebnisse behoben. F02 ist ebenfalls behoben: Beide Gewinner werden in der Weboberfläche angezeigt. F03/F12 sind behoben: Ungültige Eingaben liefern verständliche 4xx-Antworten, auch bei Formularaufrufen ohne JavaScript. F04 ist behoben: Wiederholte Zutaten erlauben auch Rezepte, die länger sind als die Liste verfügbarer Zutaten, sofern das Suchbudget reicht. F05 ist behoben: Bei einer unvollständigen Minimumsuche wird `MinimumSearchLimitExceeded` mit angeforderter und tatsächlich geprüfter Höchstlänge ausgelöst; die CLI zeigt den Budgetabbruch ausdrücklich an. F06 ist behoben: Ein bereits passendes Basisprodukt wird als gültiges Rezept mit null Zusätzen erkannt und in der CLI angezeigt. F07/F08 sind behoben: Der Datenbankbefehl initialisiert und synchronisiert Stammdaten; geänderte Daten verwerfen veraltete Rezeptberechnungen. F09 ist teilweise behoben: Geldpreise werden aus den einzelnen Effektzuschlägen dezimal berechnet. Die Rundung auf ganze Dollar bleibt offen, weil die Behandlung exakter Halbdollarwerte noch nicht belastbar belegt ist. F11 ist behoben: Der Export erhält kanonische Produktnamen und rollt fehlerhafte Speichervorgänge zurück. Das Effektlimit bleibt offen. Das frühere Kombinationslimit gilt weiterhin für die Legacy-/Exportsuche; kleinere Längen werden zusätzlich durchsucht. Die Webmodi verwenden die separat beschriebenen Ressourcenlimits. Ein Ergebnis ist nicht automatisch gegen die aktuelle Spielversion verifiziert. Der Wiki-Abgleich ist ein datierter Quellenvergleich, kein Test gegen aktuelle Spielbinärdateien.

## Aufbau

| Verzeichnis          | Inhalt                                            |
| -------------------- | ------------------------------------------------- |
| `webapp/`            | Flask-App, Templates, JavaScript und CSS          |
| `src/functionality/` | Berechnung und Logging                            |
| `src/lookup/`        | lokale Spieldaten                                 |
| `src/datenbank/`     | SQLite-Schema, Befüllung und Abfragen             |
| `src/util/`          | Datenklassen                                      |
| `tools/`             | Start-, Formatierungs-, Prüf- und Versionsbefehle |
| `tests/`             | Unittests des Projekttoolings                     |
| `.github/workflows/` | CI-Konfiguration                                  |
| `docs/`              | Projektprofil, Standards und Reviewberichte       |

# schedule1_calc

Python-Rechner für Zutatenkombinationen im Spiel Schedule I mit einer Flask-Oberfläche. Die Spieldaten stehen in `src/lookup/lookup.py`; SQLite dient dem optionalen Export vorberechneter Ergebnisse.

Regeln für Formatierung, lokale Starts und Versionierung stammen aus Quiltor und wurden an Flask angepasst. Befehle, Ausnahmen und Prüfgrenzen stehen im [Projektprofil](docs/PROJECT_PROFILE.md), die versionierte Vorlage unter [docs/standards](docs/standards/README.md).

## Einrichtung unter Windows / PowerShell

Exakte Entwicklungswerkzeuge: Python **3.12.14**, Node **22.23.2**, npm **10.9.8**. Wähle diese Versionen mit deinem Runtime-Manager; `tools/toolchains.json` ist die gemeinsame Pinquelle. Die folgenden Befehle werden im Repository ausgeführt. Beim Erstellen der Umgebung muss `python` bereits auf den gewählten Interpreter zeigen.

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
npm ci
.\.venv\Scripts\python.exe tools\project.py doctor
```

Unter Linux/macOS entspricht `.venv/bin/python` dem Windows-Pfad `.venv\Scripts\python.exe`. Nur zum Ausführen genügt eine gewählte Python-Umgebung ab 3.12 mit `pip install -r requirements.txt`. Node/npm/Ruff werden für Entwicklungsprüfungen benötigt, nicht vom Anwendungsstart. Neuere Python-Versionen werden vom Launcher akzeptiert, sind damit aber nicht automatisch getestet.

## Anwendung starten

```powershell
.\.venv\Scripts\python.exe tools\project.py start
```

Die Anwendung startet unter [http://127.0.0.1:5000/](http://127.0.0.1:5000/). Warte auf `[web] Ready` mit URL, Modus, Version, Git-Revision und Quelldigest. `dev` ist gleichwertig: Frontend und API laufen gemeinsam im selben Flask-Prozess. Nach Änderungen an Python, Templates, JavaScript oder CSS den eigenen Server mit `Ctrl+C` stoppen und neu starten; automatisches Neuladen ist deaktiviert.

Ein anderer Port wird explizit gewählt. Belegte Ports führen zu einem Fehler; fremde Prozesse werden nicht beendet.

```powershell
.\.venv\Scripts\python.exe tools\project.py start --port 5011
```

Alternativ ist `SCHEDULE1_PORT` möglich; `--port` hat Vorrang. Für parallele Checkouts getrennte Ports verwenden. Der Launcher erzeugt keine Datenbank, installiert nichts und ändert keine Version. Es gibt keinen getrennten Frontend-Build oder Produktions-Preview-Modus.

## Formatieren, prüfen und testen

```powershell
.\.venv\Scripts\python.exe tools\project.py format
.\.venv\Scripts\python.exe tools\project.py check-format
.\.venv\Scripts\python.exe tools\project.py check
.\.venv\Scripts\python.exe tools\project.py test
```

`format` schreibt Änderungen; `check-format` prüft dieselben Python-, Web- und Dokumentationsdateien ohne Änderung. `check` ergänzt Python-Syntaxprüfung, Pinprüfung und Versionskonsistenz. Es führt weder Tests noch einen Produktions-Build aus. `test` führt die vorhandenen Unittests aus; das ist kein vollständiger fachlicher Spielmodelltest.

Python gehört Ruff, JavaScript/JSON/CSS Biome, Markdown/YAML/HTML Prettier. Gemeinsame Regeln: UTF-8, LF, Breite 100, zwei Leerzeichen; Python vier Leerzeichen. Weitere Details und Ausschlüsse stehen im [Projektprofil](docs/PROJECT_PROFILE.md).

## Version ändern

`VERSION` ist die maßgebliche stabile Produktversion. Der Änderungsbefehl synchronisiert `package.json` und beide Versionsfelder in `package-lock.json` und verlangt einen sauberen Git-Arbeitsbaum.

```powershell
.\.venv\Scripts\python.exe tools\project.py check-version
.\.venv\Scripts\python.exe tools\project.py set-version patch
```

Statt `patch` sind `minor`, `major` oder eine höhere explizite Version wie `1.1.0` möglich. Danach Diff prüfen, formatieren und `check`/`test` ausführen. Der Befehl erstellt keinen Commit, Tag oder Release und pusht nichts. Noch nicht eingerichtete Veröffentlichungsprüfungen stehen im Projektprofil.

## Optional: Lookup-Datenbank anlegen

Für die interaktive Webberechnung ist keine SQLite-Datenbank erforderlich. Für einen neuen optionalen Datenexport die Funktionen aus dem Repository-Kontext aufrufen:

```powershell
.\.venv\Scripts\python.exe -c "from src.datenbank.initialize_db import initialize_database; from src.datenbank.populate_db import populate_database; initialize_database('combinations.db'); populate_database('combinations.db')"
```

Die Befüllung erzeugt Stammdaten, keine vorberechneten Rezeptkombinationen. Sie ist keine Migration vorhandener Werte: `INSERT OR IGNORE` aktualisiert vorhandene Zeilen nicht. Bei parallelen Exporten pro Checkout einen eigenen Datenbankpfad verwenden. Vorhandene Datenbanken nicht ungeprüft überschreiben oder löschen.

## Review und bekannte Grenzen

- [Ausführliches Code-Review vom 08.09.2026](docs/reviews/2026-09-08-code-review.md): reproduzierte Fehler, technische Risiken und Prüfgrenzen.
- [Wiki- und Datenreview vom 08.09.2026](docs/reviews/2026-09-08-wiki-audit.md): Vergleich aller 34 lokalen Effektzuschläge, 16 Zutaten, 114 Ersetzungsregeln und 8 Produkte; Quellenkonflikte sind gesondert ausgewiesen.

Die Übernahme des Entwicklungstoolings behebt die dort dokumentierten fachlichen Fehler nicht. Große Kombinationssuchen können sehr viel Zeit und Speicher benötigen. Kleine Suchumfänge verwenden; ein Ergebnis ist nicht automatisch gegen die aktuelle Spielversion verifiziert.

## Aufbau

| Verzeichnis          | Inhalt                                            |
| -------------------- | ------------------------------------------------- |
| `webapp/`            | Flask-App, Templates, JavaScript und CSS          |
| `src/functionality/` | Berechnung und Logging                            |
| `src/lookup/`        | lokale Spieldaten                                 |
| `src/datenbank/`     | SQLite-Schema, Befüllung und Abfragen             |
| `src/util/`          | Datenklassen                                      |
| `tools/`             | Start-, Formatierungs-, Prüf- und Versionsbefehle |
| `docs/`              | Projektprofil, Standards und Reviewberichte       |

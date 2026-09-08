# Projektprofil schedule1_calc

## Übernahme

| Feld                  | Festlegung                                                                            |
| --------------------- | ------------------------------------------------------------------------------------- |
| Produkt               | schedule1_calc, Flask-Anwendung für das Spiel Schedule I                              |
| Baseline              | Cross-project engineering standard **1.0.0**, aus Quiltor vom **08.09.2026**          |
| Verbindliche Baseline | [Lokale Kopie](standards/README.md), Vorlagen und Herkunft in `docs/standards/`       |
| Status                | **Teilweise übernommen**; implementierte Befehle und offene Anforderungen siehe unten |
| Aktive Profile        | Python, Web (JavaScript/JSON/CSS), Dokumentation (Markdown/YAML/HTML)                 |
| Entwicklerplattform   | Windows/PowerShell lokal geprüft; Ubuntu 24.04 und Windows 2025 in CI konfiguriert    |
| Produkt-Build         | Kein kompiliertes Frontend, keine eigene Release-Pipeline                             |

Die Baseline regelt das Entwicklungstooling. Fachlogik und Spieldaten wurden dabei nur formatiert und reviewt. Die [Codebefunde](reviews/2026-09-08-code-review.md) und der [Wiki-Abgleich](reviews/2026-09-08-wiki-audit.md) bleiben eigenständige Arbeit. Die lokale Standardskopie ist ein datierter Arbeitsstand; die genaue Herkunft steht in [SOURCE.md](standards/SOURCE.md).

## Formatierung und Toolchains

| Gegenstand                       | Quelle                                     | Regel                                                                                                                                 |
| -------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Exakte Entwicklungs-/CI-Runtimes | `tools/toolchains.json`                    | Python 3.12.14, Node 22.23.2, npm 10.9.8                                                                                              |
| Runtime-Manager                  | `.python-version`, `.node-version`         | Müssen der gemeinsamen Quelle entsprechen                                                                                             |
| npm-Pins                         | `package.json`                             | `packageManager` und `engines` entsprechen der gemeinsamen Quelle                                                                     |
| JavaScript-Pakete                | `package.json`, `package-lock.json`        | Exakte Versionen; Installation mit `npm ci`                                                                                           |
| Python-Pakete                    | `requirements.txt`, `requirements-dev.txt` | Exakte Laufzeitpakete und Ruff; Installation mit gewähltem Python                                                                     |
| Python-Formatierer               | `pyproject.toml`, Ruff 0.16.4              | Vier Leerzeichen, Breite 100, doppelte Anführungszeichen, LF, Syntaxziel py312                                                        |
| Web-Formatierer                  | `biome.json`, Biome 2.5.7                  | JS/MJS/CJS/JSON/JSONC/CSS; zwei Leerzeichen, Breite 100, doppelte Anführungszeichen, Semikolons, nachgestellte Kommas, Arrow-Klammern |
| Dokumente/Templates              | `.prettierrc`, Prettier 3.9.6              | MD/YAML/HTML; zwei Leerzeichen, Breite 100, Prosaumbrüche erhalten; eingebettete Sprachen nicht umformatieren                         |
| Editor und Git                   | `.editorconfig`, `.gitattributes`          | UTF-8, LF, finaler Zeilenumbruch; Python vier Leerzeichen, sonst zwei; Markdown-Ausnahme für abschließende Leerzeichen                |
| Pinprüfung                       | `tools/project.py doctor`                  | Tatsächliche Runtimes, Runtime-Kopien, installierte Pins und Produktversionskopien                                                    |

Der Anwendungsstart benötigt Python **ab 3.12** und die exakten Pakete aus `requirements.txt`; Node/npm/Ruff sind dafür nicht erforderlich. Python **3.12.14** ist der geprüfte und für `doctor`/Formatierung/`check` vorgeschriebene Interpreter. Das breitere Startintervall verspricht keine getestete Kompatibilität aller zukünftigen Python-Versionen.

Generierte Dateien, `node_modules`, virtuelle Umgebungen, Caches, Builds und Logs gehören nicht zur Formatierung. Die versionierte Standardskopie unter `docs/standards/` ist als übernommener Quellenstand ebenfalls von schreibender Formatierung ausgeschlossen; `SOURCE.md` dokumentiert die Originaldateien mit SHA-256. `package-lock.json` gehört npm. Gepflegte Quellen einschließlich `src/util/models.py` bleiben enthalten. TOML-, Requirements- und reine Werkzeugkonfigurationen werden manuell gepflegt und durch ihre Werkzeuge gelesen; für zusätzliche Quellsprachen ist vor Aufnahme in den Sammelcheck ein Formatierer festzulegen.

## Befehlsübersicht

`PY` steht für `.venv\Scripts\python.exe` unter Windows beziehungsweise `.venv/bin/python` unter POSIX. Kommandos werden im Repository ausgeführt. Python ist der Befehlsverteiler; npm verwaltet Webformatierer. Dies entspricht projektspezifisch der npm-Oberfläche aus der Baseline.

| Aufgabe                         | Befehl                                                | Umfang                                                 |
| ------------------------------- | ----------------------------------------------------- | ------------------------------------------------------ |
| App-Pakete installieren         | `PY -m pip install -r requirements.txt`               | App ohne Formatierer                                   |
| Entwicklung installieren        | `PY -m pip install -r requirements-dev.txt`, `npm ci` | Gepinnte Pakete                                        |
| Doctor                          | `PY tools/project.py doctor`                          | Exakte Runtimes, Pakete, Versionen                     |
| Vollständiger Start             | `PY tools/project.py start`                           | Frontend und API gemeinsam                             |
| Entwicklung                     | `PY tools/project.py dev`                             | Startalias; kein Hot Reload                            |
| Formatieren                     | `PY tools/project.py format`                          | Ruff/Biome/Prettier; schreibt                          |
| Format prüfen                   | `PY tools/project.py check-format`                    | Dieselben Bereiche; schreibt nicht                     |
| Statische Checks                | `PY tools/project.py check`                           | Doctor, Formatchecks, Python-Syntax mittels AST        |
| Tests                           | `PY tools/project.py test`                            | `unittest discover -s tests -v`; getrennt von `check`  |
| Version prüfen                  | `PY tools/project.py check-version`                   | VERSION/Manifest/Lock stimmen überein                  |
| Version vorbereiten             | `PY tools/project.py set-version patch`               | Auch minor, major oder höhere stabile Version          |
| Produktions-Build               | Nicht vorhanden                                       | Flask liefert gepflegte Quellen direkt aus             |
| Ende-zu-Ende-Suite              | Offen                                                 | Keine vollständige Browser-/Fachsuite                  |
| Release-Preflight / Publikation | Nicht eingerichtet                                    | Vor einer ersten Veröffentlichung festlegen und testen |

`check` ist weder ein Testlauf noch ein Linter-/Typechecker-Lauf oder Release-Gate. Isolierte npm-Skripte `format:web`, `check:format:web`, `format:docs` und `check:format:docs` prüfen nur ihren Teilbereich. Die Python-Sammelbefehle sind für den gesamten Bestand maßgeblich. `.github/workflows/check.yml` installiert die Pins und führt `check` sowie `test` getrennt aus; eine vorhandene Konfiguration ist kein Nachweis eines bereits ausgeführten Remote-CI-Laufs.

## Lokaler Start

| Dienst                 | Bindung / Standard | Override                      | Bereitschaft                                              |
| ---------------------- | ------------------ | ----------------------------- | --------------------------------------------------------- |
| Flask-Frontend und API | `127.0.0.1:5000`   | `--port` vor `SCHEDULE1_PORT` | Einmalige HTTP-Startidentität, danach Rendercheck von `/` |

Der Launcher löst Quellpfade relativ zu `tools/project.py` auf. Er importiert die App und startet einen eigenen Werkzeug-Serverthread. Es gibt keinen Frontend-Proxy, keine zweite API-Adresse und keine Kindprozess-Baumstruktur. Derselbe Port gilt für Frontend, API und Bereitschaftsprobe; die lokale Probe umgeht konfigurierte HTTP-Proxys.

Ports sind Ganzzahlen von 1 bis 65535. Ein belegter Port führt zu einem Fehler; es gibt keinen Ausweichport und kein Beenden fremder Prozesse. Die HTTP-Bereitschaftsprobe hat zehn Sekunden Frist. Danach prüft der Root-Rendercheck HTTP 200; das ersetzt keinen Browser-Funktionstest. Ein Start-Token und Quelldigest verhindern die Verwechslung mit einem fremden Server.

Die Startmeldung gibt URL, Modus `development`, Produktversion, Git-Revision mit gegebenenfalls `-dirty` und Quelldigest aus. Ohne zugängliche Git-Metadaten ist die Revision `unknown`. `/__dev__/identity` sowie `X-Schedule1-Version`/`X-Schedule1-Source` dienen lokaler Diagnostik; absolute Checkout-Pfade und der Start-Token werden dort nicht veröffentlicht. Der Digest bezeichnet Startquellen einer Entwicklungsinstanz, kein Release-Artefakt; seine Eingaben sind in `source_identity` definiert. Nach relevanten Quelländerungen explizit neu starten. `Ctrl+C`/SIGTERM und Startfehler räumen den eigenen Server auf.

Vollständiges Beispiel für einen alternativen Port unter PowerShell:

```powershell
.\.venv\Scripts\python.exe tools\project.py start --port 5011
```

Der Launcher installiert nichts, erzeugt keine Datenbank und erhöht keine Version. Die UI berechnet aus Python-Lookups. Optionale SQLite-Dateien und Logs sind lokale Daten. Pro Checkout eigene Verzeichnisse und für Exporte eigene Datenbankpfade verwenden. Verschiedene Ports im selben Checkout isolieren vorhandene Logging-/Datenpfade nicht; diese Art automatischer Datenisolation ist offen.

## Version und Veröffentlichung

Maßgeblich ist Root-`VERSION`. Kopien sind `package.json.version`, `package-lock.json.version` und `package-lock.json.packages[""].version`. Nur stabile `MAJOR.MINOR.PATCH`-Versionen werden unterstützt: Patch für kompatible Fehlerbehebung, Minor für kompatible Funktionalität, Major für inkompatible öffentliche Verträge.

Der Updater prüft alle Kopien vor dem Schreiben, verlangt einen sauberen Arbeitsbaum, verwirft gleiche/niedrigere Versionen und prüft vorhandene lokale Tags. Er bereitet die drei Dateien vor und versucht bei Schreibfehlern, Originale wiederherzustellen; Wiederherstellungsfehler werden gemeldet. Danach Diff reviewen, formatieren und `check`/`test` ausführen. Der Befehl erzeugt keine Commits, Tags, Pushes oder Veröffentlichungen.

Es gibt keine Frontend-Bundles oder getrackten Buildausgaben. Der Server liest die Version beim Start. Buildzeit-Metadaten, Artefaktdigests, veröffentlichte Versionsprüfung und Veröffentlichung bereits geprüfter Artefakte sind vor Einführung einer Produktionsverteilung umzusetzen. Aktuell existiert kein automatischer Veröffentlichungstrigger; ein Versionsupdate ist keine Release-Freigabe.

## Ausnahmen und offene Anforderungen

| Baseline-Anforderung                      | Tatsächlicher Stand                                   | Grund / erneute Prüfung                                                         |
| ----------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------- |
| npm als Befehlsoberfläche                 | Python-Äquivalente                                    | App primär Python; kein Node zum bloßen Start                                   |
| Frontend-dev mit Hot Reload               | Gemeinsamer Flask-Start ohne Reload                   | Kein eigener Buildserver; bei Reloader-Einführung Identität/Stopp erneut prüfen |
| Produktions-Build/Bundle-Metadaten        | Aktuell nicht anwendbar                               | Vor Einführung erzeugter Frontend-Dateien neu bewerten                          |
| Release-Gates, Remote-/Registry-Versionen | Nicht eingerichtet                                    | Vor erster Veröffentlichung implementieren                                      |
| Lint/Typprüfung                           | Nicht eingerichtet; Syntax und Format vorhanden       | Bestehende Codebefunde separat abarbeiten                                       |
| Vollständige E2E-/Fachtests               | Offen                                                 | Werkzeugtests decken das Spielmodell und UI nicht vollständig ab                |
| Parallele Starts im selben Checkout       | Port konfigurierbar, Daten nicht vollständig isoliert | Getrennte Checkouts/Exportpfade; später konfigurierbare Datenpfade              |
| Python-Artefaktreproduzierbarkeit         | Exakte Paketversionen, keine Artefakthashes           | Vor Release Hash-/Plattform-Lock festlegen                                      |
| Weitere Python-Versionen                  | Start akzeptiert >=3.12; 3.12.14 geprüft              | Erst nach Laufzeit-/CI-Prüfung als getestet bezeichnen                          |

## Verifikation am 08.09.2026

Unabhängig geprüft: installierte Python-Paketmetadaten einschließlich transitiver Abhängigkeiten und Environment-Marker unter Windows/Python 3.12.14. Alle aktiven Anforderungen sind im Pinset inklusive Ruff abgedeckt und versionskompatibel; Click 8.5.0 deklariert hier keine zusätzliche Colorama-Abhängigkeit. Biome 2.5.7 und Prettier 3.9.6 stimmen zwischen npm-Manifest, Lock-Wurzel, Lock-Paketen und Installation überein. Die npm-Enginekopien stimmen ebenfalls überein.

Im gemeinsamen Abschlussreview wurden zehn Werkzeugtests, Doctor, Versionsgleichheit und Rollback im isolierten Versionsfixture geprüft. Ein unabhängiger Windows-Lauf bestätigte die Ablehnung eines fremden Portlisteners und zwei Start-/Stoppzyklen mit Wiederverwendung des Ports. Neun vorhandene Python-Dateien und beide JavaScript-Dateien blieben gegenüber dem Ausgangsstand AST-identisch; Jinja-Steuer- und Ausdruckstokens blieben unverändert. Der abschließende lokale Lauf von `.venv\Scripts\python.exe tools/project.py check` war erfolgreich: Doctor, Ruff (11 Dateien), Biome (6 Dateien), Prettier für alle zugeordneten Dokumente/Templates und Python-Syntaxprüfung bestanden. Ohne ausgeführten Remote-Lauf bleibt CI nur konfiguriert. Die fachlichen Grenzen stehen im [Code-Review](reviews/2026-09-08-code-review.md).

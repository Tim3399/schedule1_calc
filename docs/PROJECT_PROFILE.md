# Projektprofil schedule1_calc

## Übernahme

| Feld                  | Festlegung                                                                            |
| --------------------- | ------------------------------------------------------------------------------------- |
| Produkt               | schedule1_calc, Flask-Anwendung für das Spiel Schedule I                              |
| Kickoff skill         | `project-start` **1.1.0**, reapplied on **2026-09-10**                                |
| Baseline              | Cross-project engineering standard **1.0.0**, übernommen am **08.09.2026**            |
| Verbindliche Baseline | [Lokale Kopie](standards/README.md), Vorlagen und Herkunft in `docs/standards/`       |
| Status                | **Teilweise übernommen**; implementierte Befehle und offene Anforderungen siehe unten |
| Aktive Profile        | Python, Web (JavaScript/JSON/CSS), Dokumentation (Markdown/YAML/HTML)                 |
| Entwicklerplattform   | Windows/PowerShell lokal geprüft; Ubuntu 24.04 und Windows 2025 in CI konfiguriert    |
| Produkt-Build         | Quell-ZIP und Linux/amd64-Container; siehe CI/CD-Profil                               |

Die Baseline regelt das Entwicklungstooling. Fachlogik und Spieldaten wurden dabei nur formatiert und reviewt. Die [Codebefunde](reviews/2026-09-08-code-review.md) und der [Wiki-Abgleich](reviews/2026-09-08-wiki-audit.md) bleiben eigenständige Arbeit. Die lokale Standardskopie ist ein datierter Arbeitsstand; die genaue Herkunft steht in [SOURCE.md](standards/SOURCE.md).

## Bereichsstand der CI/CD-Aktualisierung

`project-start` **1.3.0** aktualisiert hier ausschließlich CI/CD und dessen notwendige
Test-/Paketierungswerkzeuge. Die bisherige Baseline und historische Prüfergebnisse
bleiben erhalten. Die genaue Delivery-Konfiguration und verbleibende Verifikation
stehen im [CI/CD-Profil](CI_CD_PROFILE.md).

| Bereich                     | Bisher übernommen                  | Ziel  | Stand                                                                   |
| --------------------------- | ---------------------------------- | ----- | ----------------------------------------------------------------------- |
| Agent-Regeln / Formatierung | 1.0.0                              | 1.0.0 | Beibehalten; Profilverweis um CI/CD ergänzt                             |
| Bisherige Sprachprofile     | 1.0.0                              | 1.0.0 | Runtimes und Entwicklungspins beibehalten                               |
| Container-Sprachprofil      | Unbekannt / bisher nicht vorhanden | 1.3.0 | Neu, eigener Produktions-Lock; Validierung siehe CI/CD-Profil           |
| Tooling                     | 1.0.0, teilweise                   | 1.3.0 | Nur Testentdeckung und Delivery-Helfer aktualisiert                     |
| CI/CD                       | Unbekannt / noch nicht bewertet    | 1.3.0 | Teilweise; CI/Artefakte geprüft, Branch-Schutz aktiv, Publikation offen |

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

Generierte Dateien, `node_modules`, virtuelle Umgebungen, Caches, Builds und Logs gehören nicht zur Formatierung. Die JSON-Berichte unter `docs/reviews/data/` werden von `tools/evaluate_search.py` erzeugt; vorhandene Messausgaben bleiben als datierte Nachweise bytegenau erhalten und werden weder von Biome noch manuell umformatiert. Die versionierte Standardskopie unter `docs/standards/` ist als übernommener Quellenstand ebenfalls von schreibender Formatierung ausgeschlossen; `SOURCE.md` dokumentiert die Originaldateien mit SHA-256. `package-lock.json` gehört npm. Gepflegte Quellen einschließlich `src/util/models.py` bleiben enthalten. TOML-, Requirements- und reine Werkzeugkonfigurationen werden manuell gepflegt und durch ihre Werkzeuge gelesen; für zusätzliche Quellsprachen ist vor Aufnahme in den Sammelcheck ein Formatierer festzulegen.

## Befehlsübersicht

`PY` steht für `.venv\Scripts\python.exe` unter Windows beziehungsweise `.venv/bin/python` unter POSIX. Kommandos werden im Repository ausgeführt. Python ist der Befehlsverteiler; npm verwaltet Webformatierer. Dies entspricht projektspezifisch der npm-Oberfläche aus der Baseline.

| Aufgabe                         | Befehl                                                | Umfang                                                                          |
| ------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------- |
| App-Pakete installieren         | `PY -m pip install -r requirements.txt`               | App ohne Formatierer                                                            |
| Entwicklung installieren        | `PY -m pip install -r requirements-dev.txt`, `npm ci` | Gepinnte Pakete                                                                 |
| Doctor                          | `PY tools/project.py doctor`                          | Exakte Runtimes, Pakete, Versionen                                              |
| Vollständiger Start             | `PY tools/project.py start`                           | Frontend und API gemeinsam                                                      |
| Entwicklung                     | `PY tools/project.py dev`                             | Startalias; kein Hot Reload                                                     |
| Formatieren                     | `PY tools/project.py format`                          | Ruff/Biome/Prettier; schreibt                                                   |
| Format prüfen                   | `PY tools/project.py check-format`                    | Dieselben Bereiche; schreibt nicht                                              |
| Statische Checks                | `PY tools/project.py check`                           | Doctor, Formatchecks, Python-Syntax mittels AST                                 |
| Tests                           | `PY tools/project.py test`                            | Einmalige unittest-Entdeckung; leere Suite ist ein Fehler; getrennt von `check` |
| Version prüfen                  | `PY tools/project.py check-version`                   | VERSION/Manifest/Lock stimmen überein                                           |
| Version vorbereiten             | `PY tools/project.py set-version patch`               | Auch minor, major oder höhere stabile Version                                   |
| Produktions-Build               | `PY tools/release.py build`, `docker build`           | Quell-ZIP und Linux/amd64-Image; genaue Aufrufe im CI/CD-Workflow               |
| Ende-zu-Ende-Suite              | Offen                                                 | Keine vollständige Browser-/Fachsuite                                           |
| Release-Preflight / Publikation | `PY tools/release.py`, `PY tools/publish_release.py`  | Tag-/Quell-/Artefaktvertrag; Aufruf und Grenzen im CI/CD-Profil                 |

`check` ist weder ein Testlauf noch ein Linter-/Typechecker-Lauf oder Release-Gate. Isolierte npm-Skripte `format:web`, `check:format:web`, `format:docs` und `check:format:docs` prüfen nur ihren Teilbereich. Die Python-Sammelbefehle sind für den gesamten Bestand maßgeblich. `.github/workflows/check.yml` installiert die Pins und führt `check` sowie `test` getrennt aus; eine vorhandene Konfiguration ist kein Nachweis eines bereits ausgeführten Remote-CI-Laufs.

CI installiert Python aus `.python-version` mit der auf einen Commit gepinnten Action `astral-sh/setup-uv` und uv **0.12.8**; der uv-Pin steht im Workflow und gilt nur für CI. Die Action erstellt und aktiviert `.venv`, sodass alle folgenden `python`-Befehle den gewählten Interpreter verwenden. `uv pip install -r requirements-dev.txt` installiert die gepinnten Python-Pakete in diese Umgebung. Damit ist Python **3.12.14** auch unter Windows verfügbar, wo `actions/setup-python` diese Sicherheitsversion nicht bereitstellt.

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

Es gibt keine Frontend-Bundles oder getrackten Buildausgaben. Der Server liest die Version beim Start. Die neue CI/CD-Konfiguration baut ein Quellpaket und ein Container-Image, prüft ihre Identität und veröffentlicht sie bei einem passenden Versions-Tag ohne erneuten Build. Der genaue Umfang, die Ausnahmen und der Verifikationsstand stehen im [CI/CD-Profil](CI_CD_PROFILE.md). Ein lokales Versionsupdate erzeugt weiterhin keinen Tag und löst keine Veröffentlichung aus.

## Ausnahmen und offene Anforderungen

| Baseline-Anforderung                      | Tatsächlicher Stand                                              | Grund / erneute Prüfung                                                         |
| ----------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| npm als Befehlsoberfläche                 | Python-Äquivalente                                               | App primär Python; kein Node zum bloßen Start                                   |
| Frontend-dev mit Hot Reload               | Gemeinsamer Flask-Start ohne Reload                              | Kein eigener Buildserver; bei Reloader-Einführung Identität/Stopp erneut prüfen |
| Produktions-Build/Bundle-Metadaten        | Quell-ZIP und Container mit Manifest; kein Frontend-Bundle       | Artefaktvertrag und Grenzen im CI/CD-Profil                                     |
| Release-Gates, Remote-/Registry-Versionen | Implementiert, tatsächliche Publikation noch nicht ausgeführt    | Siehe CI/CD-Profil und konkrete Laufnachweise                                   |
| Lint/Typprüfung                           | Nicht eingerichtet; Syntax und Format vorhanden                  | Bestehende Codebefunde separat abarbeiten                                       |
| Vollständige E2E-/Fachtests               | Offen                                                            | Werkzeugtests decken das Spielmodell und UI nicht vollständig ab                |
| Parallele Starts im selben Checkout       | Port konfigurierbar, Daten nicht vollständig isoliert            | Getrennte Checkouts/Exportpfade; später konfigurierbare Datenpfade              |
| Python-Artefaktreproduzierbarkeit         | Container: exakte Wheels mit Hashes; Entwicklung: bisherige Pins | Produktions-Lock getrennt von Entwicklungspflichten                             |
| Weitere Python-Versionen                  | Start akzeptiert >=3.12; 3.12.14 geprüft                         | Erst nach Laufzeit-/CI-Prüfung als getestet bezeichnen                          |

## Agent workflow

`AGENTS.md` binds agents to this profile, its command map and the adopted baseline. Handle small or tightly coupled changes directly. For substantial work with independently useful subtasks, use the available `orchestrated-development` skill when delegation adds clear value. Assign self-contained scopes and exclusive file ownership, preserve other contributors' changes, and review actual diffs and verification evidence before accepting worker output. Workers do not delegate further. Retain the configured model and reasoning defaults unless the user chooses otherwise; if delegation is unavailable, complete the work directly.

The shared workflow is maintained in `../ai-infra/codex/AGENTS.md`; repository instructions remain a thin project binding. Reapplying `project-start` 1.1.0 retains the adopted baseline **1.0.0**. The skill's bundled baseline 1.1.0 is not an automatic migration of this repository.

## Verification on 2026-09-10

Reapplied `project-start` 1.1.0 to the existing checkout. Formatter configurations, matching write/check scopes, pinned dependencies, README setup commands and agent instructions were already present. Existing local changes were preserved. No launcher, version helper or application changes were required by this pass.

- `.venv\Scripts\python.exe tools/project.py doctor` passed with the selected project interpreter and all runtime, package and product-version copies matching.
- `.venv\Scripts\python.exe tools/project.py check` passed: Ruff checked 11 Python files, Biome checked 6 files, Prettier accepted all matched documents/templates, and Python syntax checks passed.
- `.venv\Scripts\python.exe tools/project.py test` passed all 10 tooling tests, including alternate-port startup/shutdown, foreign-listener protection, missing dependencies, version rejection and rollback fixtures.
- `.venv\Scripts\python.exe tools/project.py start --port 62164` reported `[web] Ready` on a free loopback port. HTTP checks verified the rendered frontend, version **1.0.3**, dirty Git revision, checkout source digest and matching response headers. Git's sandbox ownership exception was scoped to this launch process; no global Git settings were changed.

The additional smoke-test process did not stop through the tool's PTY Ctrl+C input and was explicitly terminated by its verified listener PID; port closure was then confirmed. Graceful shutdown passed separately in the automated startup test.

No compiled production build applies to this Flask source application. This local pass does not establish a new remote CI result or close the documented release, E2E and game-model gaps.

## Verifikation am 08.09.2026

Unabhängig geprüft: installierte Python-Paketmetadaten einschließlich transitiver Abhängigkeiten und Environment-Marker unter Windows/Python 3.12.14. Alle aktiven Anforderungen sind im Pinset inklusive Ruff abgedeckt und versionskompatibel; Click 8.5.0 deklariert hier keine zusätzliche Colorama-Abhängigkeit. Biome 2.5.7 und Prettier 3.9.6 stimmen zwischen npm-Manifest, Lock-Wurzel, Lock-Paketen und Installation überein. Die npm-Enginekopien stimmen ebenfalls überein.

Im gemeinsamen Abschlussreview wurden zehn Werkzeugtests, Doctor, Versionsgleichheit und Rollback im isolierten Versionsfixture geprüft. Ein unabhängiger Windows-Lauf bestätigte die Ablehnung eines fremden Portlisteners und zwei Start-/Stoppzyklen mit Wiederverwendung des Ports. Neun vorhandene Python-Dateien und beide JavaScript-Dateien blieben gegenüber dem Ausgangsstand AST-identisch; Jinja-Steuer- und Ausdruckstokens blieben unverändert. Der abschließende lokale Lauf von `.venv\Scripts\python.exe tools/project.py check` war erfolgreich: Doctor, Ruff (11 Dateien), Biome (6 Dateien), Prettier für alle zugeordneten Dokumente/Templates und Python-Syntaxprüfung bestanden. Ohne ausgeführten Remote-Lauf bleibt CI nur konfiguriert. Die fachlichen Grenzen stehen im [Code-Review](reviews/2026-09-08-code-review.md).

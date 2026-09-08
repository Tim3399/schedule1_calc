# Projektregeln

Lies vor Änderungen an Formatierung, Start-, Prüf- oder Versionstooling `docs/PROJECT_PROFILE.md` und die dort verlinkte Baseline in `docs/standards/README.md`. Das Projektprofil beschreibt die tatsächlichen Befehle und Ausnahmen dieser Flask-Anwendung; Quiltor-Referenzpfade sind keine Befehle für dieses Repository.

- Bewahre fremde und nicht zum Auftrag gehörende Änderungen. Halte mechanische Formatierung und Fachänderungen im Review getrennt.
- Verwende die gewählte Projektumgebung: Windows `.venv\Scripts\python.exe`, POSIX `.venv/bin/python`. Verlasse dich nicht auf einen ungeprüften Python im PATH.
- Nutze `tools/project.py doctor`, `format`, `check-format`, `check` und `test` entsprechend dem Profil. `check` führt keine Tests aus; melde nur tatsächlich ausgeführte Prüfungen als bestanden.
- Python formatiert Ruff, JS/JSON/CSS Biome und MD/YAML/HTML Prettier. Gepinnte Versionen und Ausschlüsse sind maßgeblich. Keine zusätzlichen Import-, Lint- oder Verhaltensänderungen als Nebeneffekt der Formatierung.
- Starte vollständig über `tools/project.py start` oder den gleichwertigen `dev`-Befehl. Prüfe `[web] Ready` mit Port, Version und Quellidentität. Wähle für parallele Projekte einen freien expliziten Port; beende keine unbekannten Listener.
- Der Backend-Reloader ist deaktiviert. Starte nach Quelländerungen neu, bevor du die laufende App als aktualisiert bezeichnest. Verwende pro Checkout eigene Daten; Porttrennung isoliert keine Datenbank und Logs.
- Ändere Produktversionen über `tools/project.py set-version`, halte VERSION/Manifest/Lock synchron und reviewe den Diff. Der Versionsschritt darf nicht implizit committen, taggen, pushen oder veröffentlichen.
- Spieldaten liegen in `src/lookup/lookup.py`. Trenne belegte Abweichungen von Wikikonflikten. Dokumentiere Quelle, Prüfdatum und Spielversion; übernimm unsichere Sollwerte nicht ungeprüft.
- Reviewberichte in `docs/reviews/` sind Befunde und kein pauschaler Auftrag, alle beschriebenen Fehler zu beheben. Beachte den aktuellen Nutzerauftrag und dokumentiere offene Anforderungen ehrlich.

# Korrektur der Freischaltränge vom 10.09.2026

Die beiden konsistent belegten Rangabweichungen aus dem [Wiki-Review vom 08.09.2026](2026-09-08-wiki-audit.md) wurden im lokalen Lookup korrigiert.

| Eintrag   | Vorher            | Jetzt              | Quellen                                                                                                                                                  |
| --------- | ----------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mega Bean | `hustler_ii` = 17 | `peddler_iii` = 13 | [Ingredients](https://schedule-1.fandom.com/wiki/Ingredients), [Ranks](https://schedule-1.fandom.com/wiki/Ranks)                                         |
| Cocaine   | `hustler_ii` = 17 | `enforcer_i` = 26  | [Cocaine: Required Rank](https://schedule-1.fandom.com/wiki/Cocaine), ergänzend [Drugs](https://schedule-1.fandom.com/wiki/Drugs) zu den Ausgangsstoffen |

## Herkunft und Aussagegrenze

**Prüfdatum: 10.09.2026. Spielversion: aus diesen Quellen nicht eindeutig zuordenbar.** Fandom ist eine Communityquelle. Direkte Abrufe waren durch `robots.txt` gesperrt; geprüft wurden Suchindex-Auszüge mit dem ausgewiesenen Crawl-Stand „vor zwei Monaten“. Beide Sollwerte stimmen mit dem früheren Wiki-Abgleich überein. Die Korrektur gleicht das Projekt an diesen belegten Wiki-Stand an; sie ist kein Test gegen aktuelle Spielbinärdateien.

Mega Bean wird in Ingredients und Ranks ausdrücklich bei Peddler III genannt. Das leere Rangfeld auf [Gas-Mart](https://schedule-1.fandom.com/wiki/Gas-Mart) liefert keinen gegenteiligen Wert. Cocaine nennt Enforcer I als erforderlichen Rang; laut derselben Seite hängt der tatsächliche Zugang außerdem von Salvador Moreno und dem Docks-Fortschritt ab. Diese weiteren Voraussetzungen werden im Rechner nicht modelliert.

## Auswirkungen im Projekt

Geändert wurden ausschließlich die zwei Rangzuordnungen in `src/lookup/lookup.py`. Preise, Effekte und Ersetzungsregeln bleiben gleich. Die Zutatenfilter verwenden Mega Bean ab Rang 13 statt erst ab Rang 17. Die Suche filtert weiterhin Zutaten nach Rang und erzwingt keine Freischaltung des Ausgangsprodukts; die Cocaine-Korrektur ändert dessen Metadaten und deren SQLite-Abbild.

Vorhandene Datenbanken übernehmen die neuen Werte beim nächsten `populate_database`-Aufruf. Die bereits implementierte Synchronisierung erhält bestehende IDs und entfernt bei geänderten Stammdaten gespeicherte Rezeptberechnungen einschließlich ihrer Zuordnungen. Diese müssen anschließend neu exportiert werden.

Historische Messberichte und deren JSON-Dateien wurden nicht nachträglich geändert. Sie bleiben Nachweise für den jeweils dort dokumentierten Quellenstand.

## Verifikation

`tests/test_lookup_ranks.py` prüft die echte Rezeptsuche unmittelbar unterhalb und an der Mega-Bean-Freischaltung, die Cocaine-Rangangabe sowie die Synchronisierung einer temporären Datenbank mit den alten Werten. Dabei werden stabile IDs und die Entfernung veralteter Rezeptberechnungen geprüft.

Ausgeführt und bestanden:

- `.venv\Scripts\python.exe -m unittest tests.test_lookup_ranks -v`: alle drei neuen Regressionstests.
- `.venv\Scripts\python.exe tools/project.py check`: Formatierung, Toolchain-/Versionskonsistenz und Python-Syntax, einschließlich der parallel integrierten Suchmodi.
- `.venv\Scripts\python.exe tools/project.py test`: vollständige gemeinsame Testsuite.
- `git diff --check`: keine Whitespacefehler.

Es wurden ausschließlich temporäre Testdatenbanken verändert. Bestehende lokale Datenbanken wurden nicht automatisch aktualisiert.

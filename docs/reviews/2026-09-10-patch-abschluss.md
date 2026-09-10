# Lokaler Patch-Abschluss vom 10.09.2026

Produktversion: **1.0.3**. Die belegten Korrekturen und die Suchmodusintegration sind lokal geprüft. Die unten genannten offenen Spielregeln und Datenfragen sind ausdrücklich nicht als behoben zu verstehen. Dieser Abschluss umfasst keine Veröffentlichung und keinen neuen Remote-CI-Nachweis.

## Erledigte Arbeiten

Die Befundnummern beziehen sich auf das [ursprüngliche Code-Review](2026-09-08-code-review.md).

| Befunde        | Ergebnis                                                                                                                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F01/F02        | Begrenzte Sucharbeit und Ausgabe beider Gewinner; der Webpfad bietet inzwischen Exact und ausdrücklich näherungsweises Fast. Ressourcenabbrüche liefern keine Gewinner und keinen stillen Moduswechsel. |
| F03/F12        | Validierte Eingaben und verständliche Fehlerantworten für JSON und Formulare.                                                                                                                           |
| F04            | Wiederholte Zutaten ermöglichen Rezeptlängen oberhalb der Anzahl unterschiedlicher verfügbarer Zutaten innerhalb des Budgets.                                                                           |
| F05/F06        | Die Minimumsuche unterscheidet Budgetabbruch, vollständig erfolglose Suche und ein gültiges Rezept ohne Zusätze.                                                                                        |
| F07/F08        | Die Datenbank-CLI initialisiert und synchronisiert Stammdaten atomar; Änderungen verwerfen veraltete Rezeptberechnungen.                                                                                |
| F09, teilweise | Geldpreise werden aus den einzelnen Effektwerten mit Decimal berechnet. Die Rundung auf ganze Dollar bleibt offen.                                                                                      |
| F11            | Kanonische Produktnamen bleiben beim Export erhalten; fehlerhafte Speicherbatches werden vollständig zurückgerollt.                                                                                     |

Die [Rangkorrekturen](2026-09-10-rank-corrections.md) setzen Mega Bean auf Peddler III und Cocaine auf Enforcer I. Grundlage sind die dort datierten Wiki-Belege, kein neuer Spielbinärtest. Produkt-Freischaltränge werden durch die Rezeptsuche weiterhin nicht erzwungen.

Die übernommenen Projektregeln beschreiben die tatsächlichen Start-, Formatierungs-, Prüf- und Versionsbefehle im [Projektprofil](../PROJECT_PROFILE.md). Die [Quellenherkunft](../standards/SOURCE.md) trennt den ursprünglichen Quiltor-Stand von seiner redaktionellen Ableitung; alle zehn Originalhashes wurden gegen den angegebenen Git-Stand geprüft.

## Suchintegration und historische Messdaten

Der [Vertrag der Suchmodi](../SEARCH_MODES.md) beschreibt Exact, Fast, Gleichstände, Ressourcenlimits und Fehlerantworten. Das unabhängige Abschlussreview fand in seinem zugewiesenen Such-/Webumfang keine relevanten Fehler. Der Lead hat die Änderungen und Prüfnachweise vor der Aufnahme selbst geprüft.

Die [historischen Suchversuche](2026-09-10-bounded-search-research.md) verwenden die damalige Float-Preisbildung, heute festgehalten in `experiments/legacy_pricing.py`. Die produktiven Modi verwenden dagegen die zentrale Decimal-Preisbildung. Alte Profittabellen sind keine aktuelle Produktionsreferenz. Die aktuelle Lookup-Datei weicht nach den Rangkorrekturen ebenfalls vom Messstand ab.

Der Vergleich der neueren Messberichte prüfte 208 Haupt- und 20 Pilotproben gegen die damalige vollständige Referenz. Die älteste Datei `2026-09-10-search-depths-5-6.json` enthält keinen Modellhash und ist deshalb keine gültige Eingabe für das heutige Vergleichswerkzeug. Auch die neueren Vergleiche beweisen keine vollständige Identität sämtlicher Preis- und Runnerquellen. Die sechs JSON-Rohdateien bleiben bytegenau erhalten, einschließlich ihrer ursprünglichen Zeilenenden; Git-Normalisierung und Formatierer sind für diese Messarchive entsprechend ausgeschlossen.

## Ausgeführte Verifikation

- Lead: `.\.venv\Scripts\python.exe tools/project.py test` — **109 Tests in 20,343 Sekunden bestanden**.
- Lead: `.\.venv\Scripts\python.exe tools/project.py check` — Runtime-/Versionskonsistenz, Ruff für 39 Python-Dateien, Biome für sechs Dateien, Prettier und Python-Syntax bestanden.
- Unabhängiges Suchreview: `.\.venv\Scripts\python.exe -m unittest tests.test_search_modes tests.test_calculator_budget` — **17 Tests bestanden**. Zusätzlich bestand ein synthetischer Test für getrennte früheste/billigste Rezeptwege, deaktivierten Cache und zwei gestreamte Endschichten.
- Lead: `tools/compare_search.py` mit der vollständigen historischen Referenz und `bounded-exact`, `bounded-fast`, `bounded-pilot` — **228 Proben erfolgreich verglichen**. Die konkreten Befehle und Quellenprüfungsgrenzen stehen im verlinkten Messbericht.
- Übernommener Nachweis des Integrationstasks: Browser-Smoke über den vollständigen Projektstarter in einer isolierten temporären Kopie. OG Kush, Rang `max`, sechs Schritte: Exact zeigte 119,50 Dollar Profit und die Optimalitätskennzeichnung, Fast 118,30 Dollar mit Näherungskennzeichnung. Eine anschließende Anfrage mit 17 Schritten entfernte alte Gewinner und zeigte den Abbruch. Der eigene Prüfserver wurde danach beendet.

Der Browsernachweis ersetzt keine vollständige E2E-Suite. Die Testzahlen älterer Berichte gehören zu deren damaligem Arbeitsstand. Nach dem Gesamttest folgten nur Dokumentations- und Git-Archivierungsänderungen.

## Bewusst offen

- **F09:** Die Rundung exakter Halbdollarwerte auf ganze Dollar benötigt einen belastbaren Nachweis für eine benannte Spielversion.
- **F10:** Das vermutete Limit von acht aktiven Effekten und der Zeitpunkt seiner Anwendung innerhalb der Transformationen sind nicht ausreichend gegen eine aktuelle Spielversion belegt.
- **Wiki-Konflikte:** Banana/Cyclopean, Freischaltränge von Sour Diesel und Green Crack sowie Shrooms-Werte bleiben ungeklärt. Shrooms sind weiterhin nicht als Produkt modelliert. Details und Quellen stehen im [Wiki-Audit](2026-09-08-wiki-audit.md).
- **Kompatibilität der Namen:** `hoodium`, `schizophrenia` und `pesudo` bleiben bestehende interne Schlüssel. Korrigierte Aliasse erfordern abgestimmte Eingabe- und Rückwärtszuordnungen sowie gegebenenfalls Datenbankmigrationen; dieser Patch benennt die Schlüssel nicht stillschweigend um.
- **Modell und Veröffentlichung:** Herstellkosten, Qualitätsmodell, Produktfreischaltung und die im Projektprofil dokumentierten Release-/E2E-Anforderungen werden durch diesen Abschluss nicht erweitert.

Die Arbeitsschritte werden einzeln lokal committet. Es erfolgen kein Push, Tag, Deployment oder weiterer Versionssprung. Suchergebnisse gelten für das dokumentierte lokale Rechenmodell; offene Quellenfragen sind keine bestätigten Spielregeln.

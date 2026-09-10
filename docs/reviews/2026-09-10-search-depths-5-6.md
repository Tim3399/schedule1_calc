# Evaluation aller Produkte mit fünf und sechs Zutaten

Stand: 10.09.2026. Fortsetzung des [ersten Laufzeitversuchs](2026-09-10-search-runtime.md). Gemeint sind Rezepte mit **bis zu** fünf beziehungsweise sechs Zutaten; Reihenfolge und Wiederholungen werden berücksichtigt. Alle 16 Zutaten sind verfügbar (`max`). Bewertet wird das damalige Rechenmodell, nicht eine neu verifizierte Spielversion.

**Fortsetzung:** Der hier empfohlene nächste Ansatz wurde inzwischen umgesetzt und vermessen: [Exakter Hybrid, Vorausblick-Beam und Recherche verwandter Algorithmen](2026-09-10-bounded-search-research.md). Die folgenden Zahlen bleiben der unveränderte Nachweis der ersten Fünf-/Sechs-Zutaten-Reihe.

## Ergebnis und geänderte Empfehlung

Die Empfehlung aus dem Vier-Zutaten-Versuch muss eingeschränkt werden: Der exakte Zustandsprototyp benötigt bei fünf Zutaten bereits 226–293 MiB Prozess-Commit. Bei sechs Zutaten bricht er für alle acht Produkte an der extern gesetzten Speichergrenze von 512 MiB ab. Das unveränderte interne Budget von zwei Millionen Erweiterungen wird damit nicht angehoben; abgebrochene Läufe liefern keinen Gewinner.

Eine zusätzlich implementierte, vollständige Referenzsuche mit Wiederverwendung gemeinsamer Rezeptanfänge berechnet dagegen alle Sechs-Zutaten-Optima in jeweils 40–55 Sekunden bei ungefähr 24 MiB Prozess-Commit. Sie speichert nur den aktuellen Pfad und die Gewinner. Bei fünf Zutaten benötigt sie 2,3–3,6 Sekunden, gegenüber 10–26 Sekunden für den bisherigen Algorithmus ohne Logging in diesen Einzelmessungen.

Der Schnellmodus ist deutlich schneller, verliert bei sechs Zutaten jedoch regelmäßig Profit. Mit 4.096 Zuständen trifft er bei fünf Zutaten alle acht Profitoptima, bei sechs Zutaten nur eines. Eine feste Beam-Breite ist daher kein Nachweis für ein Optimum.

**Nächster sinnvoller Versuch:** Gemeinsame Rezeptanfänge weiterverwenden, aber letzte Suchschichten unmittelbar auswerten und verwerfen sowie Caches ausdrücklich begrenzen. Erst dann erneut messen, ob gezieltes Zusammenfassen von Zuständen den Speicherbedarf rechtfertigt. Dieser Mischansatz ist eine aus den Messungen abgeleitete Empfehlung, noch keine gemessene Implementierung. Für einen optionalen Schnellmodus bieten 1.024 Zustände bereits einen interessanten Vergleichspunkt; eine Vervierfachung auf 4.096 verbessert die Profitlücke in diesen Sechs-Zutaten-Fällen um höchstens einen Dollar.

## Exakte Profitoptima und Verluste des Schnellmodus

Profit bedeutet im historischen Rechenmodell dieses Versuchs Verkaufspreis minus Zutatenkosten. Der Grundpreis des eingesetzten Produkts wird nicht abgezogen. Die Preisbildung bewahrt die damalige Float-Summierung, die heute in `experiments/legacy_pricing.py` für die Experimente festgehalten ist; die Produktion verwendet inzwischen die zentrale Decimal-Preisbildung. Alle Dollarwerte sind zur Darstellung auf Cent gerundet; die Prüfung vergleicht zusätzlich die vollständigen ungerundeten historischen Ergebnisse.

| Basisprodukt        | Exakter Profit bis 5 | Exakter Profit bis 6 | Verlust Beam 64 bei 6 | Verlust Beam 256 bei 6 | Verlust Beam 1.024 bei 6 | Verlust Beam 4.096 bei 6 |
| ------------------- | -------------------: | -------------------: | --------------------: | ---------------------: | -----------------------: | -----------------------: |
| OG Kush             |             108,40 $ |             119,50 $ |                5,80 $ |                 4,20 $ |                   1,90 $ |                   1,50 $ |
| Sour Diesel         |             104,60 $ |             117,20 $ |               11,90 $ |                 5,00 $ |                   0,00 $ |                   0,00 $ |
| Green Crack         |             109,40 $ |             120,30 $ |               13,60 $ |                 7,50 $ |                   2,30 $ |                   1,70 $ |
| Granddaddy Purple   |             104,10 $ |             116,60 $ |                5,70 $ |                 5,70 $ |                   4,70 $ |                   3,80 $ |
| Low Quality Pesudo  |             214,00 $ |             241,80 $ |                8,20 $ |                 5,20 $ |                   5,20 $ |                   4,20 $ |
| Pseudo              |             214,00 $ |             241,80 $ |                8,20 $ |                 5,20 $ |                   5,20 $ |                   4,20 $ |
| High Quality Pesudo |             214,00 $ |             241,80 $ |                8,20 $ |                 5,20 $ |                   5,20 $ |                   4,20 $ |
| Cocaine             |             486,00 $ |             549,00 $ |               35,00 $ |                 2,00 $ |                   1,00 $ |                   1,00 $ |

Die Bezeichnungen der Meth-Produkte entsprechen den vorhandenen Lookup-Namen einschließlich `pesudo`. Diese drei Produkte besitzen denselben Basisverkaufspreis von 70 und keine Starteffekte; Qualität, Produkt-Freischaltlevel und Einkaufspreis gehen nicht in die untersuchte Suchfunktion ein. Deshalb ergeben sich identische Rezepte und Profitwerte. Alle drei wurden trotzdem einzeln gerechnet. Die acht Produktnamen repräsentieren somit sechs unterschiedliche Kombinationen aus Basispreis und Starteffekten.

Bei fünf Zutaten verteilen sich die Profitverluste folgendermaßen:

| Basisprodukt        | Beam 64 | Beam 256 | Beam 1.024 | Beam 4.096 |
| ------------------- | ------: | -------: | ---------: | ---------: |
| OG Kush             |  1,50 $ |   1,50 $ |     0,00 $ |     0,00 $ |
| Sour Diesel         |  5,80 $ |   4,50 $ |     0,00 $ |     0,00 $ |
| Green Crack         |  9,00 $ |   4,90 $ |     4,10 $ |     0,00 $ |
| Granddaddy Purple   |  0,00 $ |   0,00 $ |     0,00 $ |     0,00 $ |
| Low Quality Pesudo  |  0,00 $ |   0,00 $ |     0,00 $ |     0,00 $ |
| Pseudo              |  0,00 $ |   0,00 $ |     0,00 $ |     0,00 $ |
| High Quality Pesudo |  0,00 $ |   0,00 $ |     0,00 $ |     0,00 $ |
| Cocaine             | 23,00 $ |   0,00 $ |     0,00 $ |     0,00 $ |

## Profit, Multiplikator und Rezeptgleichstand sind verschiedene Kriterien

Die Treffer zählen die exakte numerische Übereinstimmung, nicht nur gleiche gerundete Dollarwerte. Die letzte Spalte verlangt zusätzlich dieselben beiden Gewinnerrezepte, geordneten Effekte, Verkaufspreise und Kosten wie die vollständige Referenz.

| Zutaten bis | Beam-Breite | Profitoptimum getroffen | Multiplikatoroptimum getroffen | Beide vollständigen Gewinner identisch |
| ----------- | ----------: | ----------------------: | -----------------------------: | -------------------------------------: |
| 5           |          64 |                     4/8 |                            0/8 |                                    0/8 |
| 5           |         256 |                     5/8 |                            5/8 |                                    0/8 |
| 5           |       1.024 |                     7/8 |                            7/8 |                                    1/8 |
| 5           |       4.096 |                     8/8 |                            7/8 |                                    6/8 |
| 6           |          64 |                     0/8 |                            0/8 |                                    0/8 |
| 6           |         256 |                     0/8 |                            0/8 |                                    0/8 |
| 6           |       1.024 |                     1/8 |                            5/8 |                                    1/8 |
| 6           |       4.096 |                     1/8 |                            6/8 |                                    1/8 |

Beispielsweise trifft Beam 4.096 bei Green Crack mit fünf Zutaten den optimalen Profit, verfehlt aber den besten Multiplikator um 0,04. Die bisherige Beam-Bewertung priorisiert aktuellen Profit und schützt das andere Suchziel nicht eigenständig. Ein anderer gleich guter Zutatenweg ist dagegen kein wirtschaftlicher Verlust, kann aber die angezeigte Auswahl verändern.

## Laufzeit und Speicher

Windows 11, Projekt-Python 3.12.14. Jede Wiederholung läuft in einem frischen Prozess mit leeren Caches. Zeiten umfassen die Suche, jedoch keine Imports, keinen Prozessstart, kein HTTP und keinen Browser. Zustandssuche und Beam: Median aus drei Wiederholungen pro Produkt; Referenz und bisheriger Algorithmus: je ein vollständiger Lauf pro Produkt und Tiefe. Angegeben ist die Spanne über die acht Produkte. Feste Reihenfolge und wechselnde Systemlast erlauben grobe Vergleiche, keine präzisen universellen Beschleunigungsfaktoren.

| Verfahren                                            | Sekunden bis 5 |           Sekunden bis 6 | Prozess-Commit bis 5 |         Prozess-Commit bis 6 |
| ---------------------------------------------------- | -------------: | -----------------------: | -------------------: | ---------------------------: |
| Bisheriger Algorithmus, Logging aus                  |      10,0–25,8 | OG Kush: Zeitlimit 240 s |           ca. 24 MiB |          OG Kush: ca. 23 MiB |
| Vollständige Referenz mit gemeinsamen Rezeptanfängen |        2,3–3,6 |                40,2–54,5 |            23–24 MiB |                    23–24 MiB |
| Exakte Zustandssuche                                 |      1,54–2,85 |     8/8 Speicherabbrüche |          226–293 MiB | Grenze 512 MiB überschritten |
| Beam 64                                              |    0,010–0,020 |              0,014–0,029 |            23–25 MiB |                    23–25 MiB |
| Beam 256                                             |    0,042–0,088 |              0,058–0,110 |            28–29 MiB |                    29–31 MiB |
| Beam 1.024                                           |    0,131–0,261 |              0,206–0,351 |            42–44 MiB |                    49–52 MiB |
| Beam 4.096                                           |    0,458–1,051 |              0,664–1,899 |            86–96 MiB |                  109–129 MiB |

Speicherwerte sind vom Betriebssystem gemeldete Spitzen des gesamten Prozess-Commit einschließlich Interpreter und Imports. Die Rohdaten enthalten zusätzlich Peak Working Set. Sie sind nicht mit den zusätzlichen Python-Allokationen der früheren `tracemalloc`-Messung gleichzusetzen. Die externe Grenze prüft aktuelle private Bytes etwa alle 50 ms; beim Abbruch lagen die gemeldeten Commit-Spitzen bei 514–548 MiB. Das kleine Überschreiten erklärt sich durch das Abtastintervall.

Die Anwendung selbst lehnt die Vollsuche mit fünf oder sechs Zutaten weiterhin vorab ab. Nur für den isolierten Vergleich wurde ihr Kombinationsbudget im Kindprozess auf 20 Millionen erhöht und Logging deaktiviert. Der Code und das Budget der laufenden Anwendung wurden dafür nicht geändert. Die regulären Messprozesse haben 120 Sekunden Zeitbudget und 512 MiB Speichergrenze; Grenzabbrüche werden ausdrücklich ohne Teilgewinner gespeichert.

Zusätzlich wurde der bisherige Algorithmus für OG Kush bis Tiefe sechs mit 240 Sekunden Prozesszeitbudget gemessen. Er lieferte innerhalb dieses Budgets kein Ergebnis und wurde nach 240,14 Sekunden beendet. Die Referenz benötigte für genau diesen Fall 54,51 Sekunden Suchzeit. Die gemeldete Commit-Spitze des abgebrochenen bisherigen Algorithmus lag bei 22,75 MiB. Dieser einzelne Langlauf ist keine Laufzeitmessung für die übrigen sieben Produkte; seine tatsächliche vollständige Laufzeit wurde nicht bestimmt.

## Was bleibt von der Effekt-Vorauswahl?

Die optimalen Endeffektmengen aller 16 Produkt-/Tiefenkombinationen wurden zusätzlich rückwärts untersucht. Ein unmittelbarer Filter nach eigenem Zutateneffekt oder Ersetzungsziel würde jeweils 8–14 Zutaten behalten. Er ist jedoch wegen nötiger Zwischeneffekte nicht zuverlässig; das konkrete Gegenbeispiel steht im ersten Versuchsbericht.

Für die Rückwärtsanalyse wurde mit der endgültigen Effektmenge begonnen und wiederholt für jede Ersetzung `Quelle → Ziel` die Quelle ergänzt, wenn das Ziel bereits benötigt wurde. Nach Erreichen eines unveränderten Zustands waren jeweils 32–34 Effekte enthalten. Alle 16 Zutaten besitzen dann einen eigenen Effekt oder ein Ersetzungsziel innerhalb dieser Menge. **Diese pauschale transitive Analyse reduziert den Zutatenpool bei keinem der 16 untersuchten Ziele.**

Das widerlegt nicht eine gezieltere Rückwärtssuche: Die betrachtete Analyse ignoriert bewusst Schrittzahl, Kosten, aktuellen Zustand und gegenseitige Wechselwirkungen. Gerade diese Einschränkungen wären für nützliches, nachweislich sicheres Aussortieren erforderlich. Ein bloßer Rang nach dem Wert endgültiger Effekte kennt außerdem noch nicht die günstigsten erreichbaren Zutatenwege.

## Exakte Sechs-Zutaten-Rezepte für den Profit

| Basisprodukt                        | Zutatenfolge                                                         |
| ----------------------------------- | -------------------------------------------------------------------- |
| OG Kush                             | `cuke → gasoline → cuke → mouth_wash → viagra → mega_bean`           |
| Sour Diesel                         | `banana → cuke → horse_semen → mega_bean → iodine → motor_oil`       |
| Green Crack                         | `paracetamol → mega_bean → motor_oil → cuke → battery → mega_bean`   |
| Granddaddy Purple                   | `cuke → energy_drink → mega_bean → paracetamol → chili → mouth_wash` |
| Alle drei Meth-Produkte und Cocaine | `cuke → paracetamol → gasoline → cuke → battery → mega_bean`         |

Mehrfaches Verwenden derselben Zutat gehört zu mehreren Gewinnern. Auch ein Ausschluss von Wiederholungen würde damit relevante Rezepte entfernen.

## Nachweise und Reproduktion

- [Zustands- und Beam-Messungen](data/2026-09-10-search-depths-5-6.json): alle acht Produkte, beide Tiefen, vier Beam-Breiten und unveränderter exakter Zustandsprototyp.
- [Vollständige Referenz und bisheriger Algorithmus](data/2026-09-10-search-depths-5-6-reference.json): ungerundete Gewinner, Zeiten, Prozessspeicher und Kandidatenzahlen.
- [Referenzimplementierung](../../experiments/search_reference.py): vollständige Tiefensuche ohne Zustandszusammenfassung oder heuristisches Abschneiden, Speicher proportional zur Pfadlänge.
- [Messprogramm](../../tools/evaluate_search.py): isolierte Prozesse, Begrenzung des tatsächlichen Interpreters statt nur des Windows-Venv-Launchers, Quellhashes und getrennte Statuswerte für Ergebnis, Speichergrenze, Zeitgrenze und Suchbudget.

Die Referenz bewertet pro Produkt 1.118.480 Rezeptfolgen bis Tiefe fünf und 17.895.696 bis Tiefe sechs. Sie ist gegen den bisherigen Algorithmus für alle acht Produkte bei Tiefen eins bis vier sowie gegen die Zustandssuche bei Tiefe sechs mit vier verfügbaren Zutaten geprüft. Die großen Daten wurden nach Produkt und Tiefe zusammengeführt: Alle acht abgeschlossenen Zustandssuchen bei Tiefe fünf und alle acht bisherigen Vollsuchen bei Tiefe fünf liefern exakt dieselben beiden vollständigen Gewinner wie die Referenz. Alle 64 Beam-Fälle liefern rekonstruierbare Rezepte und überschreiten keines der Referenzoptima.

Die beiden Rohdatendateien protokollieren ihre jeweiligen damaligen Quellhashes. Suchprototypen und Lookup-Daten sind zwischen beiden historischen Serien identisch; die aktuelle Lookup-Datei besitzt inzwischen einen anderen Hash. Die Dateien entstanden vor der Auslagerung der historischen Float-Preisbildung nach `experiments/legacy_pricing.py` und enthalten deshalb noch keinen eigenen Hash für diesen Helfer. Die ältere Zustands- und Beam-Datei enthält außerdem noch keinen Hash für `src/util/models.py` und ist daher kein direkt gültiger Eingabebericht für die heutige Version von `tools/compare_search.py`; ein fehlender Hash belegt keine Quellenübereinstimmung. Die Referenzserie lief auf einer eingefrorenen Kopie unter dem Betriebssystem-Temp-Verzeichnis, weil parallel die separate Suche nach vorgegebenen Effekten bearbeitet wurde. Verworfene Vorbereitungs- und Kontrollläufe sind nicht Teil dieser Tabellen.

Beispielbefehle auf einem unveränderten Arbeitsstand; für verschiedene Messserien getrennte Ausgabedateien verwenden:

```powershell
.\.venv\Scripts\python.exe tools/evaluate_search.py --sizes 5 6 --methods exact beam64 beam256 beam1024 beam4096 --repeats 3 --output "$env:TEMP/search-fast.json"
.\.venv\Scripts\python.exe tools/evaluate_search.py --sizes 5 6 --methods reference --repeats 1 --output "$env:TEMP/search-reference.json"
.\.venv\Scripts\python.exe tools/evaluate_search.py --sizes 5 --methods baseline --repeats 1 --output "$env:TEMP/search-baseline.json"
.\.venv\Scripts\python.exe tools/evaluate_search.py --products og_kush --sizes 6 --methods baseline --repeats 1 --timeout 240 --output "$env:TEMP/search-baseline-six.json"
.\.venv\Scripts\python.exe tools/project.py check
.\.venv\Scripts\python.exe tools/project.py test
```

Zum Zeitpunkt dieser Evaluation waren die Programme Experimente ohne Anbindung an die Oberfläche. Effektdaten, Preisregeln und Produktversion wurden durch die Evaluation nicht geändert. Ihre Ergebnisse bleiben an den eingefrorenen historischen Messstand gebunden und beschreiben nicht die inzwischen geänderte produktive Decimal-Preisbildung oder die aktuelle Lookup-Datei. Die später integrierten Modi und ihre Grenzen dokumentiert [Suchmodi und Grenzen](../SEARCH_MODES.md).

Abschlussprüfung: `.venv\Scripts\python.exe tools/project.py check` bestand mit Doctor, Format- und Syntaxprüfung. `.venv\Scripts\python.exe -m unittest discover -s tests -p 'test_search_*.py' -v` bestand mit allen 14 Such- und Messprogrammtests. Der abschließende Lauf von `.venv\Scripts\python.exe tools/project.py test` bestand mit allen 63 Tests. Ein vorheriger Gesamtlauf hatte einen noch unvollständigen und einen widersprüchlichen Test aus den parallelen Änderungen erfasst; diese anderen Dateien wurden im Rahmen dieser Evaluation nicht bearbeitet.

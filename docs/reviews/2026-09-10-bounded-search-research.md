# Exakte und schnelle Rezeptsuche: zweiter Versuch und Recherche

Stand: 10.09.2026. Fortsetzung der [Messung mit fünf und sechs Zutaten](2026-09-10-search-depths-5-6.md). Untersucht werden alle acht Basisprodukte, jeweils mit **bis zu** fünf beziehungsweise sechs Mischschritten und allen 16 verfügbaren Zutaten. Reihenfolge und Wiederholungen zählen. Die Aussagen betreffen das vorhandene Rechenmodell; die Spieldaten wurden für diesen Versuch nicht verändert oder erneut extern verifiziert.

## Die beiden gewünschten Modi

- **Exakt:** Gibt die bewiesenen Gewinner für Profit und Multiplikator zurück. Erschöpfte Zeit-, Arbeits- oder Speicherbudgets bedeuten „Suche nicht abgeschlossen“ und liefern keinen Gewinner. Das bedeutet ausdrücklich nicht, dass kein Rezept existiert. Eine schlechte Näherung darf hier nicht unbemerkt einspringen.
- **Schnell:** Liefert tatsächlich überprüfte Rezepte aus einer begrenzten Suche, sichtbar ohne Optimalitätsgarantie. Eine größere Beam-Breite oder mehr Vorausblick beweist kein Optimum. Die experimentellen Funktionen brechen bei ihren Zeit-/Arbeitslimits ebenfalls ausdrücklich ab.

Die neuen Implementierungen lagen zum Zeitpunkt dieses Versuchs getrennt von der Anwendung in `experiments/search_bounded.py` und `experiments/search_fast.py`; Oberfläche und produktive Suchauswahl wurden durch den Versuch selbst nicht umgestellt. Den später integrierten Stand beschreibt [Suchmodi und Grenzen](../SEARCH_MODES.md).

## Was der exakte Versuch verbessert

`bounded1` fasst gleichwertige Rezeptanfänge zusammen und speichert nur die vorderen Schichten. Die letzte Schicht wird vollständig erzeugt und unmittelbar ausgewertet. `bounded2` streamt die letzten beiden Schichten: Das spart zusätzlich Speicher, berechnet aber mehr Übergänge erneut. Beide verwenden getrennte, auf jeweils 32.768 Einträge begrenzte Übergangs- und Bewertungscaches; in der letzten Schicht werden keine neuen Cache-Einträge angelegt.

Die Zusammenfassung ist exakt, weil ein geordnetes Effekttupel bei gleicher Tiefe sämtliche zukünftigen Effekte bestimmt. Für jedes Tupel bleiben der früheste Zutatenweg für den Multiplikator und der günstigste Weg für den Profit erhalten; bei gleichen Kosten entscheidet die bisherige Zutatenreihenfolge. Über unterschiedliche Tiefen gilt weiterhin die bestehende Bevorzugung längerer gleich guter Rezepte. Cache-Verdrängung führt nur zu Neuberechnung, nie zum Verlust eines Suchzweigs.

Das geordnete Tupel ist absichtlich kein sortierter Effektvorrat: Die zum Messzeitpunkt verwendete Float-Summierung und ausgegebene Effektreihenfolge gehören zum historischen Vergleichsvertrag. `experiments/legacy_pricing.py` hält diese damalige Preisbildung für die Experimente fest; die Produktion verwendet inzwischen die zentrale Decimal-Preisbildung. Beide vollständigen Gewinner einschließlich Rezept, Effektreihenfolge und ungerundeter Zahlen werden mit der vollständigen Referenz desselben historischen Modells verglichen.

### Gemessene exakte Ergebnisse

| Verfahren                                          | Sekunden bis 5 |       Sekunden bis 6 | Prozess-Commit bis 5 | Prozess-Commit bis 6 |
| -------------------------------------------------- | -------------: | -------------------: | -------------------: | -------------------: |
| Neuer Hybrid, letzte Schicht streamen (`bounded1`) |      1,05–1,66 |          11,69–18,31 |            49–57 MiB |          165–219 MiB |
| Vollständige Referenz, vorherige Messreihe         |        2,3–3,6 |            40,2–54,5 |            23–24 MiB |            23–24 MiB |
| Vorherige exakte Zustandssuche                     |      1,54–2,85 | 8/8 Speicherabbrüche |          226–293 MiB |  Abbruch bei 512 MiB |

Alle **16 neuen exakten Fälle** stimmen bei beiden vollständigen Gewinnern mit der Referenz überein. Der Hybrid benötigt bei sechs Schritten deutlich weniger Speicher als die bisherige vollständige Zustandssuche und weniger Zeit als die sparsame Referenz. Die Referenz bleibt die Variante mit dem geringsten Speicherbedarf.

Im vorgeschalteten Pilotversuch mit OG Kush und Cocaine benötigte `bounded2` bei sechs Schritten 17,49–21,54 Sekunden und 59–63 MiB, gegenüber 9,70–13,94 Sekunden und 165–200 MiB für `bounded1`. Dieser Vergleich umfasst nur zwei Produkte. Die abweichenden Zeiten zwischen Pilot und Hauptmessung zeigen den Einfluss der Systemlast.

Zusätzlich wurden OG Kush und Cocaine mit sieben und acht Schritten für beide Varianten ausgeführt. **Alle acht Grenzfälle** brechen ausdrücklich am Präfix-Zustandslimit ab und enthalten keinerlei Gewinnerfelder: `bounded1` nach 5,71–8,00 Sekunden bei 330–361 MiB, `bounded2` nach 1,12–1,47 Sekunden bei 111–116 MiB. Damit ist das gewünschte Verhalten „perfektes Ergebnis oder kein ausgegebenes Rezept bei zu großem Suchraum“ praktisch geprüft. Diese Abbrüche beweisen keine Unlösbarkeit. Nachweis: [Grenzfälle](data/2026-09-10-bounded-limits.json).

## Schnellmodus: Vorausblick und zwei Suchziele

Der neue Beam bewertet jeden Kandidaten zusätzlich anhand seiner erreichbaren Nachfolger im nächsten Mischschritt. Die gehaltenen Plätze verteilen sich auf gute Profit- und Multiplikatorpfade. Gültige Rezepte aus dem Vorausblick dürfen bereits die Gewinner verbessern, auch wenn ihr Ausgangszustand später verworfen wird. Die zusätzliche Schicht bleibt innerhalb der angeforderten maximalen Rezeptlänge.

Der Vergleich wurde für alle Produkte mit drei frischen Prozessen je Fall wiederholt. Auch die alten Beams wurden in dieser Reihe erneut gemessen:

| Verfahren                      | Sekunden bis 5 | Sekunden bis 6 | Prozess-Commit bis 6 | Profitoptimum bei 6 | Multiplikatoroptimum bei 6 |
| ------------------------------ | -------------: | -------------: | -------------------: | ------------------: | -------------------------: |
| Einfacher Beam 1.024           |      0,13–0,33 |      0,19–0,84 |            49–53 MiB |                 1/8 |                        5/8 |
| Einfacher Beam 4.096           |      0,41–1,17 |      0,77–2,34 |          110–128 MiB |                 1/8 |                        6/8 |
| Vorausblick 256 (`fast256`)    |      0,36–0,88 |      0,53–1,27 |            25–28 MiB |                 1/8 |                        2/8 |
| Vorausblick 1.024 (`fast1024`) |      0,94–2,54 |      1,57–3,88 |            36–40 MiB |                 2/8 |                        8/8 |

Bei fünf Schritten treffen beide neuen Beam-Breiten sämtliche Profit- und Multiplikatorwerte. Mit 1.024 Zuständen stimmen sogar beide vollständigen Gewinner für alle acht Produkte; mit 256 sind es drei. Das ist eine Beobachtung dieser Fälle, keine Garantie für andere Eingaben.

Der neue Vorausblick mit 1.024 Zuständen verbessert gegenüber dem einfachen Beam 4.096 den Sechs-Schritt-Profit bei OG Kush und Granddaddy Purple, hält ihn bei den übrigen Produkten und findet jetzt überall den besten Multiplikator. Er benötigt deutlich weniger Speicher, aber mehr Zeit. Der kleinere Vorausblick ist kein durchgängiger Ersatz: Bei Granddaddy Purple und beim Multiplikator kann er schlechter abschneiden.

| Basisprodukt        | Exakter Profit bis 6 | Verlust einfacher Beam 4.096 | Verlust Vorausblick 256 | Verlust Vorausblick 1.024 |
| ------------------- | -------------------: | ---------------------------: | ----------------------: | ------------------------: |
| OG Kush             |             119,50 $ |                       1,50 $ |                  1,20 $ |                    1,20 $ |
| Sour Diesel         |             117,20 $ |                       0,00 $ |                  0,00 $ |                    0,00 $ |
| Green Crack         |             120,30 $ |                       1,70 $ |                  1,70 $ |                    1,70 $ |
| Granddaddy Purple   |             116,60 $ |                       3,80 $ |                  4,70 $ |                    0,00 $ |
| Low Quality Pesudo  |             241,80 $ |                       4,20 $ |                  4,20 $ |                    4,20 $ |
| Pseudo              |             241,80 $ |                       4,20 $ |                  4,20 $ |                    4,20 $ |
| High Quality Pesudo |             241,80 $ |                       4,20 $ |                  4,20 $ |                    4,20 $ |
| Cocaine             |             549,00 $ |                       1,00 $ |                  1,00 $ |                    1,00 $ |

Profit bedeutet in diesem historischen Modell Verkaufspreis minus Zutatenkosten; der Produkteinkaufspreis wird nicht abgezogen. Die Tabelle ist auf Cent gerundet; geprüft wurden die vollständigen historischen Decimal-aus-Float-Werte. Diese Zahlen sind wegen der inzwischen geänderten produktiven Decimal-Preisbildung kein Nachweis aktueller Produktionspreise. Beim Vorausblick 1.024 beträgt die größte beobachtete relative Profitlücke **1,74 %**. Das ist keine zugesicherte Fehlergrenze. Die drei Meth-Namen stellen aufgrund identischer Preise/Starteffekte keine drei unabhängigen mathematischen Probleme dar, wurden aber einzeln ausgeführt.

**Empfehlung aus diesem Versuch:** Den exakten Hybrid mit einer gestreamten Endschicht als Grundlage des garantierten Modus verwenden. Für einen qualitativ stärkeren Schnellmodus ist Vorausblick 1.024 der neue Vergleichspunkt; für kürzere Wartezeiten bleibt 256 eine mögliche interne Abstimmung. Bei nur fünf Schritten lohnt der teure Vorausblick oft nicht, weil der exakte Hybrid bereits ähnlich schnell oder schneller ist. Die Rechnung „mehr Vorausblick = immer besser“ geht also nicht auf. Die nächsten größeren Verbesserungen sollten sichere Branch-and-Bound-Schranken für den exakten Modus und eine günstigere Bewertung beim Vorausblick untersuchen.

## Recherche: welche bekannten Probleme und Algorithmen passen?

Dies ist eine Suche nach einer Aktionsfolge mit terminaler Belohnung und Zutatenkosten. Die Reihenfolge verändert den Zustand; Effekte können verschwinden und später wieder entstehen. Ein reines Rucksackproblem über unabhängige Zutatenwerte bildet das nicht ab.

| Ansatz / Primärquelle                                                                                                       | Übertragung auf unseren Rechner                                                                                                                                                                                   | Grenze / aktueller Stand                                                                                                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Depth-first Branch-and-Bound, Poole und Mackworth](https://www.cs.ubc.ca/~poole/aibook/2e/html2e/ArtInt2e.Ch3.S8.SS1.html) | Mit dem besten bekannten Rezept als Untergrenze und einer sicheren Obergrenze für den erreichbaren Profit können aussichtslose Zweige entfallen. Tiefensuche hält den Speicher klein.                             | Die Quelle formuliert Kostenminimierung; die Richtung der Schranken muss für Profitmaximierung umgekehrt werden. Eine bloß gut klingende Gewinnschätzung genügt nicht für sicheres Abschneiden. Noch nicht implementiert. |
| [Frontier Search, Korf et al., 2005](https://doi.org/10.1145/1089023.1089024)                                               | Zeigt den Nutzen, Speicher durch begrenzte Suchfronten und spätere Neuberechnung einzusparen.                                                                                                                     | Unser Hybrid nutzt diesen allgemeinen Zeit-/Speicherkompromiss, implementiert aber nicht den beschriebenen Frontier-Search-Algorithmus mit Pfadrekonstruktion.                                                            |
| [Beam-Stack Search, Zhou und Hansen, 2005](https://cdn.aaai.org/ICAPS/2005/ICAPS05-010.pdf)                                 | Eine schnelle Beam-Suche kann durch systematisches Wiederaufnehmen zuvor verworfener Bereiche bis zum bewiesenen Optimum fortgesetzt werden. Das passt perspektivisch zu gemeinsam genutztem Code für beide Modi. | Erst vollständiges Backtracking mit zulässigen Schranken liefert die Garantie. Der neue feste Beam mit Vorausblick ist **kein** Beam-Stack Search.                                                                        |
| [Planning with Penalties and Rewards, Geffner und Bonet, 2006](https://bonetblai.github.io/reports/KR06-h%2B.pdf)           | Verwandtes Planungsproblem mit Aktionskosten und Zustandsbelohnungen. Relaxationen und vorberechnetes Wissen können die Suche gezielt führen.                                                                     | Auch das optimale relaxierte Problem kann teuer sein. Eine approximative Schätzung ist nicht automatisch eine sichere Schranke. Die Übertragung auf unseren finalen Rezeptwert ist ein eigener Modellierungsschritt.      |

Es gibt sogar einen direkt verwandten [Schedule-I-Optimierer](https://github.com/nowaythatworked/schedule1-mix-calc). Dessen README beschreibt DP, Memoisierung und Branch-and-Bound. Die dort genannten Laufzeiten und Optimalitätsaussagen wurden hier nicht unabhängig bestätigt; der eigentliche Optimiererquelltext war über den Recherchezugang nicht abrufbar. Außerdem beschreibt das Projekt andere Preise, sortierte Effektzustände und eine Acht-Effekte-Grenze. Seine Millisekundenangaben sind deshalb kein fairer Benchmark gegen unseren Rechner, und seine Spielregeln wurden nicht übernommen.

### Bewertung der Idee, gute Effektkombinationen vorab auszuwählen

Als Rangfolge für den Schnellmodus ist die Idee sinnvoll. Als exakter Ausschlussfilter ist sie im untersuchten Modell zu grob: Ein Bestandteil kann ausschließlich einen später benötigten Zwischeneffekt erzeugen. Im [vorherigen Versuch](2026-09-10-search-depths-5-6.md) entfernt ein direkter Beitragsfilter bei Cocaine einen notwendigen Bananenschritt und verliert Profit. Berücksichtigt man dagegen alle indirekten Voraussetzungen der optimalen Zielkombinationen, bleiben für die untersuchten fünf/sechs Schritte wieder sämtliche 16 Zutaten übrig.

Ein besserer nächster Einsatz der Vorberechnung wäre eine **optimistische Restwerttabelle** nach aktuellem Effektzustand, verfügbaren Zutaten und verbleibenden Schritten. Sie darf unerreichbare Kombinationen zusätzlich zulassen, um eine sichere Obergrenze zu liefern. Ein Zweig darf erst entfallen, wenn er weder den Profit- noch den Multiplikatorsieger verbessern kann. Gleichstände brauchen wegen der Rezeptpräferenz besondere Behandlung. Bei optionalem vorzeitigem Ende darf man nicht pauschal die Kosten aller verbleibenden Schritte abziehen. Diese Schranke ist eine Entwicklungsidee, noch kein vermessener Bestandteil des Hybrids.

Andere sinnvolle, unabhängige Verbesserungen sind das Wiederverwenden bereits berechneter Ergebnisse und vorberechneter Übergänge. Cache-Schlüssel müssen dabei mindestens Datenversion, verfügbare Zutaten, Basisverkaufspreis, Starteffekte, Tiefe und Suchmodus samt Parametern abdecken. Die drei Meth-Qualitätsnamen besitzen im untersuchten Modell identische Suchparameter und könnten dieselbe Berechnung teilen.

## Grenzen und Reproduzierbarkeit

Jede Probe läuft in einem frischen Windows-Prozess mit leerem Cache. Gemessen wird die Suchdauer ohne Imports, Prozessstart, HTTP und Browser. Der angegebene Peak-Commit umfasst dagegen den gesamten Python-Prozess einschließlich Imports. Ein separater Wächter prüft den **tatsächlichen Interpreter-PID** alle 50 ms und beendet ihn bei mehr als 512 MiB privatem Speicher oder 120 Sekunden Laufzeit. Das ist eine überwachte Abbruchgrenze, keine Garantie, dass der Spitzenwert nie kurz darüberliegt.

Im exakten Hybrid gelten zusätzlich 20 Millionen Übergangsanfragen und 90 Sekunden. `bounded1` erlaubt im Messwerkzeug 300.000 Zustände pro Präfixschicht; `bounded2` und der direkte Funktionsstandard erlauben 100.000 und streamen zwei Endschichten. Übergangsanfragen zählen auch Cache-Treffer. Ein Zustandslimit ist kein Byte-Limit. Der Schnellmodus wird mit einem Schritt Vorausblick, zwei Millionen Übergangsanfragen einschließlich Vorausblick und 15 Sekunden gemessen. Frei gewähltes großes `lookahead` kann erhebliche temporäre Listen erzeugen und ist nicht durch einen internen Byte-Zähler geschützt.

Die Hauptreihe des exakten Hybrids enthält einen Lauf pro Produkt und Tiefe; der Schnellvergleich verwendet drei Wiederholungen und deren Median. Feste Fallreihenfolge und wechselnde Last erlauben keine universellen Beschleunigungsfaktoren. Besonders die späten Schnellmessungen waren deutlich langsamer als die Pilotmessung desselben Problems; die Tabelle zeigt trotzdem die gesamte gemessene Spanne. Die Hauptquellen wurden vor den Läufen in ein temporäres, unveränderliches Verzeichnis kopiert, weil andere Arbeiten im gemeinsamen Checkout stattfinden. Die JSON-Berichte enthalten die damals erfassten SHA-256-Werte. Bei den neueren Bounded-Berichten stimmen die jeweils vorhandenen Hashes für Lookup-, Modell- und Referenzdatei mit der früheren vollständigen Referenzreihe überein; die aktuelle Lookup-Datei besitzt inzwischen einen anderen Hash. Die bewertende Produktionsdatei hat seitdem weitere Änderungen einschließlich der Decimal-Preisbildung erhalten. Die damaligen neuen Gewinnerrezepte wurden zusätzlich mit dem zu diesem Messstand gehörenden Produktionsmodell validiert. Am damaligen Abschlussstand wurden nach dem Snapshot lediglich Import-/UTC-Schreibweisen des Messrunners bereinigt. Später wurde die historische Float-Preisbildung semantikerhaltend nach `experiments/legacy_pricing.py` ausgelagert; die vermessenen Suchimplementierungen blieben identisch.

Die Experimente berücksichtigen Wiederholungen auch dann, wenn weniger unterschiedliche Zutaten verfügbar sind als Schritte angefordert werden; kleine Akzeptanztests decken solche Fälle ab. Der exakte Hybrid lehnt Tiefen außerhalb 1–16 vorab ab; innerhalb dieses Bereichs bleiben die Ressourcenlimits maßgeblich. Die produktive Eingabevalidierung wird parallel bearbeitet und ist kein eingefrorener Bestandteil dieses Experiments. „Exakt“ bezieht sich auf das unveränderte Berechnungsmodell, nicht auf einen unabhängig bestätigten Spielstand.

Die reproduzierbaren Befehle im Checkout lauten:

```powershell
.\.venv\Scripts\python.exe tools/evaluate_search.py --sizes 5 6 --methods bounded1 --repeats 1 --output "$env:TEMP\schedule1-exact-new.json"
.\.venv\Scripts\python.exe tools/evaluate_search.py --sizes 5 6 --methods fast256 fast1024 beam1024 beam4096 --repeats 3 --output "$env:TEMP\schedule1-fast-new.json"
.\.venv\Scripts\python.exe tools/compare_search.py --reference docs/reviews/data/2026-09-10-search-depths-5-6-reference.json docs/reviews/data/2026-09-10-bounded-exact.json docs/reviews/data/2026-09-10-bounded-fast.json
.\.venv\Scripts\python.exe tools/compare_search.py --reference docs/reviews/data/2026-09-10-search-depths-5-6-reference.json docs/reviews/data/2026-09-10-bounded-pilot.json
```

Bei Quelländerungen verweigert der aktuelle Messrunner das Fortsetzen alter Ergebnisdateien, indem er den vollständigen aktuellen Hashsatz mit dem gespeicherten Satz vergleicht. Die vorhandenen historischen JSON-Dateien entstanden vor der Auslagerung der Float-Preisbildung nach `experiments/legacy_pricing.py` und enthalten daher noch keinen eigenen Hash für diese Datei. `tools/compare_search.py` prüft bei den in den beiden Befehlen genannten neueren Berichten die Identität von Lookup- und Modelldatei sowie die Gewinnerwerte gegen die Referenz; es beweist keine vollständige Quellidentität aller Runner- und Preisdateien. Die ältere Datei `2026-09-10-search-depths-5-6.json` besitzt noch keinen Hash für `src/util/models.py` und kann deshalb nicht direkt mit dem aktuellen Vergleichswerkzeug geprüft werden; ein fehlender Hash wird nicht als Übereinstimmung behandelt. Für einen Wiederholungslauf sind neue Ausgabepfade zu verwenden.

Rohdaten: [Pilot](data/2026-09-10-bounded-pilot.json), [exakte Hauptreihe](data/2026-09-10-bounded-exact.json), [Schnellvergleich](data/2026-09-10-bounded-fast.json), [vollständige Referenz](data/2026-09-10-search-depths-5-6-reference.json).

## Ausgeführte Prüfungen

- `.venv\Scripts\python.exe tools/project.py check`: bestanden; Runtime-/Versionsprüfung, Ruff-Format, Biome, Prettier und Python-Syntax. 31 Python-Dateien formatiert geprüft. Dies ist kein Testlauf.
- `.venv\Scripts\python.exe tools/project.py test`: **84 Tests bestanden**. Enthalten sind die neuen Vergleiche beider Suchziele mit der vollständigen Suche, Cache-Verdrängung, Tie-Regeln, Wiederholungen, knappe Arbeits-/Zeitbudgets, deterministische Beam-Ergebnisse ohne Vergleich der Laufzeit sowie die Beam-Breite eins. Bestehende Tests prüfen zusätzlich Prozess-Speicherabbruch und Timeout ohne exakten Teilgewinner.
- Gezieltes `ruff check` für beide neuen Suchmodule, beide neuen Testdateien, Messrunner und Vergleichswerkzeug: bestanden.
- `tools/compare_search.py` validiert **208 erfolgreiche Proben** der beiden Hauptreihen gegen die ungerundeten Referenzgewinner. Alle exakten Gewinner sind vollständig identisch; alle schnellen Gewinner liegen höchstens beim jeweiligen exakten Zielfunktionswert. Auch die 20 Pilotproben wurden damit erfolgreich verglichen.
- Insgesamt enthalten die vier neuen Rohdatenberichte **108 Fälle und 236 Proben**: 228 erfolgreiche Ergebnisse und acht erwartete Zustandslimit-Abbrüche. Die Abbrüche enthalten keine Gewinnerfelder. Die vier Berichte verwenden denselben eingefrorenen Quellstand; die vermessenen Suchmodule und die Modelldatei stimmen weiterhin mit dessen Hashes überein. Die aktuelle Lookup-Datei weicht davon ab.

Die produktive Oberfläche wurde im Rahmen dieses Experiments nicht umgestellt oder manuell im Browser geprüft. Die Ergebnisse waren ein geprüfter Prototyp und eine Entscheidungsgrundlage für die spätere Integration der beiden Modi; deren aktuellen Stand beschreibt [Suchmodi und Grenzen](../SEARCH_MODES.md).

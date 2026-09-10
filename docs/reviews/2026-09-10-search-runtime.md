# Laufzeitversuch: Effektzustände und Schnellmodus

Die [anschließende Evaluation mit fünf und sechs Zutaten über alle Produkte](2026-09-10-search-depths-5-6.md) erweitert diesen ersten Versuch und schränkt seine Empfehlung für die exakte Zustandssuche wegen des höheren Speicherbedarfs ein.

Stand: 10.09.2026. Separater Prototyp in [search_runtime.py](../../experiments/search_runtime.py), reproduzierbarer Vergleich in [benchmark_search.py](../../tools/benchmark_search.py). Zum Zeitpunkt dieses Versuchs verwendete die Anwendung noch ihre vorherige Suche; den später integrierten Stand beschreibt [Suchmodi und Grenzen](../SEARCH_MODES.md). Die Messungen beziehen sich auf den lokalen, bereits anderweitig bearbeiteten Arbeitsstand und seine vorhandenen Spielregeln; sie bestätigen keine Übereinstimmung mit einer aktuellen Spielversion.

## Ergebnis

Eine exakte Suche über wiederverwendete Effektzustände ist in den geprüften Vier-Zutaten-Fällen deutlich schneller als die vollständige Aufzählung von Rezepten. Sie reproduziert beide bisherigen Gewinner einschließlich Reihenfolge, Kosten und numerischer Werte. Ein zusätzlicher Beam-Modus ist wesentlich schneller, kann aber Profit verlieren.

Windows 11, Projekt-Python 3.12.14, alle 16 Zutaten verfügbar, Rezeptlängen eins bis vier, Median aus drei Aufrufen pro Variante. Die Tabellen und Caches des Prototyps beginnen bei jedem Aufruf leer. Gemessen wird die Berechnung ohne HTTP, Browser oder Importzeit.

| Variante                                               | OG Kush | Cocaine | Profit OG Kush | Profit Cocaine |
| ------------------------------------------------------ | ------: | ------: | -------------: | -------------: |
| Bisherige Vollsuche, Debug-Records wie derzeit erzeugt | 1,104 s | 1,106 s |        96,30 $ |       421,00 $ |
| Vollsuche mit vollständig deaktiviertem Logger         | 0,771 s | 0,496 s |        96,30 $ |       421,00 $ |
| Exakter Zustandsprototyp                               | 0,178 s | 0,133 s |        96,30 $ |       421,00 $ |
| Beam, 64 Zustände je Tiefe                             | 0,008 s | 0,008 s |        96,30 $ |       413,00 $ |
| Beam, 256 Zustände je Tiefe                            | 0,035 s | 0,025 s |        96,30 $ |       421,00 $ |

Damit ist der exakte Prototyp hier ungefähr 6–8-mal schneller als die damalige Suche mit Debug-Records und 3,7–4,3-mal schneller als dieselbe Vollsuche ohne Logging. Laufzeiten hängen von Produkt, Tiefe, Systemlast und Anzahl erreichbarer Zustände ab. Profit wird im historischen Rechenmodell als Verkaufspreis minus Zutatenkosten berechnet; Tabellenwerte sind zur Lesbarkeit auf Cent gerundet. Die Experimente bewahren dessen Float-Preisbildung heute über `experiments/legacy_pricing.py`, während die Produktion inzwischen die zentrale Decimal-Preisbildung verwendet.

Im Benchmark erzeugt ein DEBUG-Logger die anschließend vom INFO-Handler verworfenen Records wie in der Anwendung. INFO-Ausgaben auf Datei und Konsole werden unterdrückt. Eine separate cProfile-Stichprobe für OG Kush bis Tiefe drei maß 0,344 s insgesamt, davon 0,195 s kumuliert in `logger.debug`. Profiling beeinflusst die Laufzeit; diese Stichprobe ist keine allgemeine Prozentprognose.

Der Beam-Modus priorisiert aktuellen Profit. Bei OG Kush liefern beide Beam-Breiten zwar den optimalen Profit, aber einen anderen Rezeptgleichstand und einen schlechteren besten Multiplikator: 2,38 statt 2,42. Bei Cocaine verfehlt Breite 64 auch den Profit um 8 $. Die Qualität beider Ergebnisarten muss daher gesondert bewertet werden.

## Warum ein direkter Zutatenfilter das Optimum verlieren kann

Bei Cocaine lautet das günstigste Rezept für den besten Profit bis Tiefe vier:

`banana → cuke → horse_semen → mega_bean`

Die entscheidende Kette ist `gingeritis → thought_provoking → electrifying`. Banana erzeugt einen nötigen Zwischeneffekt, der im Endprodukt nicht mehr vorkommt. Die endgültigen Effekte sind `electrifying`, `long_faced`, `cyclopean` und `foggy`.

Eine zusätzliche vollständige Prüfung ergab:

- Alle 16 Zutaten: bester Profit 421 $.
- Nur Zutaten, deren eigener Effekt oder irgendein Ersetzungsziel in der endgültigen Effektmenge liegt: acht Zutaten, bester Profit 414 $.
- Nur Zutaten, deren eigener Effekt in der endgültigen Effektmenge liegt: zwei Zutaten, bester Profit 252 $.

Bereits der großzügigere direkte Filter entfernt Banana und verliert 7 $. Die Regeln stehen in [lookup.py](../../src/lookup/lookup.py), insbesondere bei Banana, Cuke, Horse Semen und Mega Bean.

Auch die wertvollste Effektkombination allein identifiziert noch keinen besten Profit: Entscheidend sind ihre Erreichbarkeit und die Kosten des günstigsten Zutatenwegs. Die Vorauswahl eignet sich deshalb zunächst als Suchpriorität. Ein sicherer Ausschluss benötigt einen Nachweis, dass auch über Zwischeneffekte kein besseres Ergebnis erreichbar ist.

## Aufbau des Prototyps

1. Verfügbare Zutaten und Nachschlagetabellen einmal pro Suche vorbereiten. Die bestehende Suche filtert bereits nach Freischaltlevel; ein separat auswählbarer Lagerbestand ist hier nicht ergänzt.
2. Einen Effektzustand schrittweise um eine Zutat erweitern. Gemeinsame Rezeptanfänge und bekannte Übergänge werden wiederverwendet.
3. Bei gleicher Tiefe und gleichem geordnetem Effektzustand den günstigsten Weg für Profit sowie den zuerst auftretenden Weg für den Multiplikator behalten.
4. Im exakten Modus alle so unterscheidbaren Zustände verfolgen. Im Beam-Modus nach Bewertung der erzeugten Kandidaten nur die besten N Zustände nach aktuellem Profit weiterverfolgen.

Der geordnete Zustand erhält die damalige Effektanzeige und die Reihenfolge der historischen Float-Summierung. Bei gleichem Ergebnis bevorzugte die damalige Vollsuche längere Rezepte und danach die zuerst auftretende Zutatenfolge in Lookup-Reihenfolge; der Prototyp bildet dies ausdrücklich nach. Zutaten dürfen mehrfach verwendet werden.

OG Kush bis Tiefe vier: Die Vollsuche bewertet 69.904 Rezeptfolgen. Der Zustandsprototyp erzeugt 51.360 Kandidaten, davon 47.168 tatsächlich berechnete Übergänge. Am Ende verbleiben 29.137 geordnete Zustände. Der Laufzeitgewinn entsteht daher sowohl durch weniger Arbeit als auch durch günstigere einzelne Rechenschritte, nicht allein durch das Zusammenfassen gleicher Zustände.

Beide Prototypmodi brechen bei 2.000.000 Kandidatenerweiterungen mit einer ausdrücklichen Ausnahme ab; ein unvollständiges Ergebnis wird nicht als exakt zurückgegeben. Dieses Arbeitsbudget ersetzt keine Speicher- oder Zeitgrenze. Das bestehende App-Limit von 200.000 Rezepten je Größe bleibt unverändert.

## Speicher und größere Suchtiefen

Eine separate Messung mit `tracemalloc` bei OG Kush bis Tiefe vier ergab ungefähr 26 MiB zusätzliche Python-Allokationen für den exakten Prototyp, 1,5 MiB für Beam 64 und 5,3 MiB für Beam 256. Die kompakte Vollsuche benötigte etwa 12 KiB. Das sind zusätzliche getrackte Allokationen während der Suche, keine gesamten Prozessspeicherwerte. Die exakte Variante tauscht also Speicher gegen Laufzeit; größere Tiefen benötigen weitere Begrenzung und Messung.

Explorative Beam-Läufe bis Tiefe acht benötigten bei drei Wiederholungen ungefähr 0,027–0,154 s. Bei Cocaine fand Breite 64 einen Profit von 619 $, Breite 256 einen Profit von 662 $. Dafür wurde kein exaktes Optimum bestimmt. Diese längeren Rezepte verwenden ausschließlich die vorhandenen Regeln: Der aktuelle Rechner enthält insbesondere keine Begrenzung auf acht aktive Effekte. Die offenen Spiellogikbefunde bleiben separat zu behandeln.

## Nächster Optimierungsschritt

Die exakte Zustandsuche ist die geeignete Grundlage. Darauf kann die vorgeschlagene Effektanalyse aufbauen: rückwärts alle nötigen Vorläufereffekte berücksichtigen und günstige erreichbare Zielkombinationen zuerst verfolgen. Für einen sicheren Suchabbruch eignet sich anschließend eine optimistische Obergrenze des noch erreichbaren Verkaufspreises abzüglich einer Untergrenze der Zutatenkosten. Ein Zweig darf erst entfallen, wenn er damit keines der gesuchten Ergebnisse mehr verbessern kann; Gleichstände müssen berücksichtigt werden.

Weitere sinnvolle Schritte sind ein kleinerer Zustandsschlüssel nach separat geklärter numerischer Semantik, gezieltere Cache-Begrenzung und eine Beam-Bewertung, die neben aktuellem Profit auch Entwicklungspotenzial und verschiedene Effektzustände berücksichtigt. Parallelisierung wäre erst danach sinnvoll zu messen, weil sie die unnötige Sucharbeit selbst nicht reduziert.

Für die damals noch ausstehende Integration waren insbesondere Ressourcenlimits, verständliche Kennzeichnung des Schnellmodus, beide Optimierungsziele und der vollständige Datenbankexport zu berücksichtigen. Der Prototyp lieferte nur Gewinner und ersetzte keinen Export aller Rezepte. Den später integrierten Stand beschreibt [Suchmodi und Grenzen](../SEARCH_MODES.md).

## Reproduktion und Prüfung

```powershell
.\.venv\Scripts\python.exe tools/benchmark_search.py --product og_kush --size 4 --repeats 3
.\.venv\Scripts\python.exe tools/benchmark_search.py --product cocaine --size 4 --repeats 3
.\.venv\Scripts\python.exe tools/benchmark_search.py --repeats 1 --measure-memory
.\.venv\Scripts\python.exe tools/project.py check
.\.venv\Scripts\python.exe tools/project.py test
```

Die eigenständigen Regressionstests in [test_search_runtime.py](../../tests/test_search_runtime.py) vergleichen alle acht Produkte auf drei Freischaltstufen bis Tiefe drei, zusätzlich Tiefen eins, zwei und vier, beide Gleichstandsregeln, den nötigen Zwischeneffekt, einen ungekappten Beam, die Rekonstruktion eines stark begrenzten Beam-Ergebnisses sowie Eingabe- und Arbeitsbudgetgrenzen. Die Referenz ist die damalige Vollsuche unter derselben historischen Float-Preisbildung. Die aktuellen Lookup-Daten besitzen inzwischen einen anderen Hash als der Messstand; die gespeicherten Rohdaten der späteren Messreihen entstanden außerdem vor dem separaten Hash für `experiments/legacy_pricing.py`. Der aktuelle Messrunner verweigert das Fortsetzen einer Ergebnisdatei, sobald sein vollständiger Hashsatz abweicht; `tools/compare_search.py` prüft bei historischen Berichten dagegen gezielt Lookup, Modell und Gewinnerwerte, nicht die vollständige Identität aller Runner- und Preisquellen.

Abschlussprüfung: `tools/project.py check` bestand mit Doctor, Format- und Syntaxprüfung; `tools/project.py test` bestand mit 38 Tests, darunter acht neue Prototyptests. Der repositoryweite zusätzliche Aufruf von `git diff --check` meldete eine zusätzliche Leerzeile am Dateiende in der parallel bearbeiteten `docs/standards/README.md`; diese Datei gehört nicht zu diesem Versuch und wurde hier nicht verändert. Ein Start oder Browserdurchlauf für den Prototyp entfällt, da er keine App-Anbindung besitzt.

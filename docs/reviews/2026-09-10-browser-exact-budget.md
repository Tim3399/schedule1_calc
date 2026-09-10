# Größeres Browser-Budget für die exakte Suche

Prüfdatum: 10.09.2026. Anlass: Green Crack, Level `max`, sieben Mischzutaten erschien dem Nutzer sehr schnell. Die Website von Version 1.2.0 begrenzte exakte Suchen auf 20 Millionen Übergänge, 90 Sekunden und 300.000 gespeicherte Zustände pro Präfixschicht.

## Befund und Entscheidung

Der bisherige exakte Lauf für diesen Fall lieferte bei der lokalen Nachmessung keinen Gewinner: Nach 16,34 Sekunden erreichte er in Schicht sechs das Zustandslimit. Die schnelle Beendigung war kein abgeschlossener Optimalitätsbeweis. Der Schnellmodus fand in 0,58 Sekunden einen Profit von 129,30 Dollar und bleibt auf ausdrücklichen Nutzerwunsch unverändert.

Die exakte Browser-Suche erhält 200 Millionen Übergänge und 300 Sekunden. Ab sieben angeforderten Schritten werden die letzten zwei Schichten vollständig durchlaufen, ohne ihre Frontiers zu speichern. Frühere Schichten behalten die bisherigen verlustfreien Zustandszusammenfassungen. Das Zustandslimit von 300.000 und beide Cachegrößen von 32.768 werden nicht erhöht. Die private Python-API behält ihre bisherigen Ressourcenlimits.

Das ermöglicht mehr tatsächlich abgeschlossene Suchtiefe, erhöht aber nicht die absolute unterstützte Grenze von 16 Schritten. Größere Anfragen können weiterhin am Zustands-, Arbeits- oder Zeitlimit abbrechen. Die Oberfläche erlaubt 305 Sekunden einschließlich Modellladen und beendet den eigenen Worker bei Abbruch. Unvollständige Suchen geben weiterhin keine Gewinner zurück.

## Lokale Messungen

Die JavaScript-Engine wurde mit Node 22.23.2 und dem aus dem Python-Lookup erzeugten Katalog auf diesem Windows-Gerät ausgeführt. Jeder Fall lief in einem frischen Node-Prozess mit `--max-old-space-size=2048`; gemessen wurde die Suchfunktion einschließlich Fortschrittsmeldungen, ohne Browser-Rendering oder Modell-Download. Die Werte sind einzelne Läufe, keine über Geräte hinweg geltende Leistungszusage. RSS wurde an Fortschrittsmeldungen abgetastet und umfasst auch V8-Verwaltung und noch nicht eingesammelte Objekte; es ist weder ein exaktes Betriebssystem-Maximum noch eine garantierte Speichergrenze.

| Fall, jeweils Level max | Konfiguration                           | Ergebnis                            |     Zeit |
| ----------------------- | --------------------------------------- | ----------------------------------- | -------: |
| Green Crack, 7, exakt   | v1.2.0                                  | Zustandslimit, kein Gewinner        |  16,34 s |
| Green Crack, 7, exakt   | Zwei letzte Schichten, 200 Mio. / 300 s | Optimalität bewiesen, Profit 129,50 | 154,63 s |
| Green Crack, 7, schnell | Unverändert                             | Näherung, Profit 129,30             |   0,58 s |
| Green Crack, 8, exakt   | v1.2.0                                  | Zustandslimit, kein Gewinner        |  16,74 s |
| OG Kush, 6, exakt       | v1.2.0                                  | Optimalität bewiesen, Profit 119,50 |  10,32 s |

Der erfolgreiche größere Lauf benötigte 77.929.264 Übergänge, eine letzte gespeicherte Frontier mit 284.468 Zuständen und rund 935 MiB maximal abgetastetes RSS. Eine höhere Anzahl erlaubter Frontier-Zustände wäre deshalb keine geeignete pauschale Standardeinstellung. Auch mit unveränderter Anzahl gespeicherter Zustände kann der tatsächliche Speicherverbrauch je nach Lauf und Gerät erheblich schwanken.

Gewinner nach Profit: `paracetamol, horse_semen, mega_bean, motor_oil, cuke, battery, mega_bean`. Die technischen Kennungen dienen hier der Reproduzierbarkeit; die Oberfläche verwendet Anzeigenamen.

## Korrektheitsprüfung

Die geänderte Trennstelle zwischen gespeicherten Zuständen und vollständiger Aufzählung verwirft keinen Suchzweig. Bis zur Trennstelle bleiben billigster und frühester Weg getrennt erhalten; danach werden alle Zutaten in beiden letzten Schichten betrachtet. Die Rückgabe des Optimalitätsnachweises erfolgt erst nach der abschließenden Zeitprüfung.

Die Browser-Vertragstests vergleichen zusätzlich vollständige Gewinner für Green Crack mit dem kleineren Zutatenpool `street_rat_i` bei Tiefe sieben und 16 gegen die Python-Engine. Synthetische Tests vergleichen eine und zwei letzte Schichten bei gleichen Preis- und Effektwerten, erlauben einen erst nach 120 Sekunden beendeten exakten Lauf und prüfen weiterhin, dass am endgültigen Zeitlimit kein Gewinner herausgegeben wird. Für Fast bleibt das bisherige 15-Sekunden-Limit bestehen.

Die anschließende echte Browserprüfung lief über `tools/project.py start --port 42761`, Quellidentität `83b005ceec4487235b284952ea70aafcc25c1a0c8b2a7d46291099201b7c969f`, vor dem Versionsschritt zu 1.3.0. Green Crack, Max, sieben Zutaten lieferte vollständig exakt 129,50 und im unveränderten Schnellmodus 129,30 Profit. Abbruch entfernte die vorherigen Gewinner, der anschließende exakte Neustart schloss erfolgreich ab. Shrooms, Max, drei Zutaten ergab exakt 141,70 Profit. Auswahl und Ergebnisse zeigten Anzeigenamen einschließlich Motor Oil, Shrooms und der Meth-Varianten; die Konsole enthielt keine Fehler oder Warnungen. Die Serverprotokolle der Browserläufe enthielten ausschließlich GETs. Der getrennte HTTP-Smoke bestätigte Modell-/Skriptverfügbarkeit und die Ablehnung beider anonymen Rechen-POSTs.

# Vertrag der Rezeptsuche

Die Weboberfläche und `POST /get_best_mix` bieten die Modi `exact` und `fast`. Ohne Auswahl gilt `exact`. Beide suchen Rezepte mit einer bis zur angeforderten Zahl an Zutaten; Reihenfolge und Wiederholungen werden berücksichtigt. Ein Rezept ohne Zusätze ist Teil der getrennten Minimum-Effekt-Suche, nicht dieser Best-Mix-Suche.

## Berechnung auf dem Gerät des Besuchers

Die Website lädt einmal die Regeln und Preise über `GET /search-data`. Jede Suche läuft anschließend in einem eigenen Browser-Worker aus `webapp/static/js/search-engine.js`; sie sendet keine Rechenanfrage an den Server. Die Seite bleibt bedienbar und zeigt Tiefe und Arbeitszähler. **Cancel search** beendet den Worker und verwirft alle Kandidaten. Ein neuer Lauf startet unabhängig; verspätete Nachrichten alter Läufe werden ignoriert.

Die Laufzeit und verfügbare Speichermenge hängen vom Gerät ab. JavaScript und Web Workers sind erforderlich; fehlende Unterstützung, Ladefehler, Abbruch und Zeitlimits lösen keinen Server-Fallback aus. Ohne JavaScript bleibt die Rechenschaltfläche gesperrt. Worker-Auslagerung und unmittelbares Beenden verwenden die [Web-Worker-API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers).

Der Server erzeugt das schreibgeschützte Modell aus `src/lookup/lookup.py`, einschließlich geordneter Ersetzungsregeln und eines Modellhashs. Es gibt keine zweite manuell gepflegte Spieldatenliste. Die Skalen sind 100 Effektpunkte und 100 Cent pro Dollar. Geldwerte und Profitvergleiche verwenden exakt darstellbare ganzzahlige Zehntausendstel-Dollar; nicht darstellbare zukünftige Daten werden abgelehnt statt gerundet. Der Effekt-Multiplikator und sein Ranking behalten die kompensierte Float-Summierung von [CPython 3.12.14](https://github.com/python/cpython/blob/v3.12.14/Python/bltinmodule.c#L2464-L2497). Ein mathematisch gleicher Effektzuschlag darf dadurch weiterhin einen historisch unterschiedlichen Float-Gleichstand haben.

Technische Kennungen bleiben in Anfragen, Suchregeln und gespeicherten Rezepten stabil. Ein eigener `display_name` bezeichnet Produkte, Zutaten und Effekte in der Oberfläche; die Rangnamen kommen aus `level_display_names`. So zeigt die Website beispielsweise „Motor Oil“ und „OG Kush“, während die API weiter `motor_oil` und `og_kush` verwendet. Der [Produktdaten-Audit](reviews/2026-09-10-product-catalog-update.md) dokumentiert die ergänzten Shrooms und die Grenzen des zugrunde liegenden Preismodells.

## Eigenes Rezept

Der Reiter **Your Recipe** berechnet genau die ausgewählte Zutatenfolge. Nach Auswahl des Basisprodukts können Zutaten einzeln angefügt, geändert, nach oben oder unten verschoben und entfernt werden. Wiederholungen zählen als eigene Mischschritte und werden jedes Mal berechnet und bezahlt. Ohne Zutaten erscheint das Basisprodukt mit seinen anfänglichen Effekten und ohne Zutatenkosten. Die Anzeige enthält Effekte, Zutatenfolge, Multiplikator, Verkaufspreis, Zutatenkosten und Profit nach dem bestehenden Preismodell.

Jede Änderung aktualisiert das Ergebnis unmittelbar im Browser. `Schedule1Search.evaluateRecipe(catalog, { product_name, substances })` verwendet dieselben geordneten Effektübergänge und dieselbe Preisberechnung wie die Suche. Es werden keine alternativen Kombinationen durchsucht; deshalb gilt die Suchgrenze von 16 Schritten hier nicht. Auch 14 oder mehr ausdrücklich ausgewählte Zutaten sind möglich. Alle Zutaten stehen unabhängig vom Spielerrang zur Auswahl. Die Berechnung prüft Eingaben und sichere Ganzzahlarithmetik anhand der tatsächlichen Rezeptlänge und liefert bei ungültigen Daten kein Teilergebnis. Sie macht keine Aussage über globale Optimalität.

Das Zutatenregal ersetzt die manuellen Zutaten-Dropdowns. Jeder Klick hängt einen Schritt an;
Drag-and-drop fügt Zutaten an einer bestimmten Position ein oder verschiebt bestehende Schritte.
Während des Ziehens bleiben Rezept und Ergebnis unverändert, bis die Zutat gültig abgelegt wird.
Alt + Pfeil hoch/runter verschiebt einen fokussierten Schritt per Tastatur. Clear lässt sich mit
Undo clear einschließlich aller Wiederholungen zurücknehmen.

Beide Reiter teilen erfolgreich geladene Modelldaten. Beim Wechsel zu **Your Recipe** wird eine noch laufende Optimierung abgebrochen; deren verspätete Ergebnisse bleiben verworfen. Einstellungen und eigenes Rezept bleiben beim Wechsel zwischen den Reitern erhalten. Ladefehler können erneut versucht werden. Es entsteht kein neuer Server-Rechenweg. Die direkte Auswertung benötigt JavaScript, aber keinen Web Worker; diese bleiben für die Optimierung erforderlich.

`tests/test_browser_recipe.py` vergleicht unter anderem ein Rezept mit 14 unterschiedlichen Zutaten gegen die bestehende Python-Berechnung. Die Node-Tests prüfen zusätzlich Reihenfolge, Wiederholungen, mehr als 16 Schritte, Eingabefehler und die Bedienung des neuen Reiters.

## Private Server-API

Die Python-Suche bleibt für vertrauenswürdige Programme erhalten. Ohne serverseitig gesetztes `SCHEDULE1_API_TOKEN` sind **beide** Rechenwege (`POST /get_best_mix` und der bisherige `POST /`) deaktiviert und liefern HTTP 404 ohne Berechnung. Ist ein geheimes zufälliges Token konfiguriert, muss der Client `Authorization: Bearer <token>` über einen vertrauenswürdigen lokalen oder TLS-Transport senden; fehlende oder falsche Zugangsdaten liefern HTTP 401, bevor Eingaben verarbeitet oder Suchläufe begonnen werden. URL-Parameter und Cookies schalten die API nicht frei. Das Token gehört weder in den Browser noch in den öffentlichen Modellendpunkt.

Die folgenden HTTP-Schemas gelten für autorisierte API-Aufrufe. Öffentliche Website-Nutzer benötigen keinen API-Zugang.

## Exakter Modus

Der exakte Modus gibt die Gewinner für Profit und Multiplikator ausschließlich nach vollständigem Abschluss seiner exakten Suche zurück. Die Garantie bezieht sich auf die angeforderten Eingaben und die aktuelle zentrale Berechnung. Beim höchsten Multiplikator entscheidet bei einem numerisch exakt gleichen Multiplikator zuerst der höhere Profit, dann die kürzere Zutatenfolge und zuletzt die Lookup-Reihenfolge. Beim besten Profit entscheiden bei numerisch exakt gleichem Profit die kürzere Zutatenfolge und danach die Lookup-Reihenfolge. Der Schnellmodus verwendet dieselben Gleichstandsregeln für die von ihm untersuchten Kandidaten, ohne dadurch globale Optimalität zu versprechen.

Gemeinsame Zwischenzustände dürfen nur verlustfrei zusammengefasst werden. Für dieselbe geordnete Effektfolge bei derselben Tiefe bleibt der billigste Rezeptweg erhalten; bei gleichen Kosten entscheidet die Lookup-Reihenfolge. Ein Schritt, der die vollständige geordnete Effektfolge unverändert lässt, wird als Kandidat ausgewertet, aber bei nichtnegativen Zutatenkosten nicht weiter verlängert: Jede Fortsetzung ist ohne diesen Schritt mindestens so profitabel und bei Gleichstand kürzer. Dadurch bleibt selbst dann ein zulässiges Rezept mit einem Schritt verfügbar, wenn alle Zutaten den Ausgangszustand unverändert lassen. Explizit eingegebene eigene Rezepte werden weiterhin Schritt für Schritt einschließlich solcher Wiederholungen berechnet. Cache-Verdrängung erzwingt gegebenenfalls Neuberechnung und verwirft keinen Suchzweig. Eine Heuristik darf niemals als stiller Ersatz für die exakte Suche dienen.

Eine erreichte Ressourcen- oder Größenbegrenzung liefert **kein Rezept**. Bereits gefundene Kandidaten bleiben intern; selbst ein erst bei der abschließenden Zeitprüfung festgestelltes Limit verhindert die Rückgabe. Der Status lautet `incomplete`, nicht „unlösbar“. Bei endlicher Rezeptlänge ist der Suchraum theoretisch entscheidbar; ein praktisch begrenzter Lauf muss ihn aber nicht vollständig bewältigen.

## Schnellmodus

Der Schnellmodus verwendet eine begrenzte Beam-Suche mit einem Schritt Vorausblick und getrennten Bewertungen für Profit und Multiplikator. Ergebnisse tragen immer den Status `approximate`, auch wenn sie zufällig einem Optimum entsprechen. Es gibt keine zugesicherte Fehlergrenze. Auch dieser Modus liefert bei überschrittenen internen Limits keine Teilantwort und wechselt nicht automatisch zum anderen Modus.

## JSON-Vertrag

Anfrage, alle Felder bis auf `search_mode` sind erforderlich:

```json
{
  "combination_size": 6,
  "product_name": "og_kush",
  "level": "max",
  "search_mode": "exact"
}
```

Ein erfolgreicher HTTP-200-Response enthält wie bisher `best_modifier` und `best_profit`, zusätzlich:

```json
{
  "search": {
    "mode": "exact",
    "status": "optimal",
    "optimality_proven": true
  }
}
```

Im Schnellmodus lauten diese Werte `fast`, `approximate` und `false`. Ein Ressourcenabbruch liefert HTTP 503 mit `error` und:

```json
{
  "search": {
    "mode": "exact",
    "status": "incomplete",
    "optimality_proven": false
  }
}
```

Die Felder `best_modifier` und `best_profit` fehlen dann vollständig. Ungültige Eingaben autorisierter Aufrufe bleiben HTTP 400; unerwartete interne Fehler werden als generischer HTTP 500 ohne Gewinner gemeldet. Der Browser verwendet entsprechende Ergebniszustände lokal, leert alte Ergebnisse beim Start, verhindert gleichzeitige eigene Suchanfragen und akzeptiert nur Ergebnisse für den tatsächlich angeforderten Modus.

## Ressourcen und Rechenmodell

Die Browser-Suche erhält für den exakten Modus ein größeres Budget. Die private Python-API behält ihre bisherigen Grenzen aus `src/functionality/mix_search.py`; der Schnellmodus bleibt auf beiden Seiten unverändert:

| Modus              |                                               Sucharbeit |         Zeit | Zustände                                                       |
| ------------------ | -------------------------------------------------------: | -----------: | -------------------------------------------------------------- |
| Exakt, Browser     |                          200 Millionen Übergangsanfragen | 300 Sekunden | 300.000 pro Präfixschicht, zwei Caches mit je 32.768 Einträgen |
| Exakt, private API |                           20 Millionen Übergangsanfragen |  90 Sekunden | 300.000 pro Präfixschicht, zwei Caches mit je 32.768 Einträgen |
| Schnell, beide     | 2 Millionen Übergangsanfragen einschließlich Vorausblick |  15 Sekunden | Beam-Breite 1.024, temporäre Nachfolger zusätzlich             |

Mehr als 16 Schritte überschreiten die derzeit unterstützte Größe und führen ebenfalls zu `incomplete`. Die exakte Browser-Suche streamt ab sieben angeforderten Schritten die letzten zwei Schichten vollständig, bei kleineren Anfragen weiterhin nur die letzte. Dadurch entfällt die Speicherung der besonders großen vorletzten Schicht, allerdings werden mehr Übergänge erneut berechnet. Die Zustandsgrenze wird nicht erhöht. Das garantiert keine vollständige Suche für jede unterstützte Tiefe: Noch größere Präfixschichten können weiterhin das Zustandslimit erreichen. Die private API streamt unverändert eine letzte Schicht.

Zeitkontrollen sind kooperativ: Python prüft im exakten Modus alle 1.024 Übergangsanfragen, die Browser-Engine vor jedem Übergang; beide prüfen zusätzlich vor Rückgabe. Die Oberfläche beendet einen hängenden Worker spätestens bei ihrer nächsten Zeitkontrolle nach 305 Sekunden (exakt) beziehungsweise 20 Sekunden (schnell), einschließlich Ladezeit. Hintergrund-Tabs können Browser-Timer verzögern. Dies sind Grenzen für Sucharbeit und Datenstrukturen, kein harter Betriebssystemschutz in Bytes. Der separate historische Messrunner hat zusätzlich einen Prozess-Speicherwächter; die Webanwendung übernimmt diesen Windows-spezifischen Wächter nicht.

Die beiden Python-Engines erhalten die zentrale Preisberechnung als Pflichtfunktion. Diese berechnet Preise aus den einzelnen Effektwerten dezimal; die Float-Berechnung des angezeigten Multiplikators bleibt erhalten. Die Browser-Engine bildet diese Zahlenwerte mit den oben beschriebenen Ganzzahlen und der kompensierten Float-Summe nach. Unbelegte Rundung auf ganze Dollar wird nicht angenommen. Die alten Experimente und JSON-Messdaten dokumentieren ausdrücklich das damalige Float-Preismodell. Ihre Differentialtests und Messwerkzeuge verwenden `experiments/legacy_pricing.py`; die produktiven Suchmodi importieren keine Experimente. Alte Profittabellen sind daher keine neue Referenz für geänderte Preise oder Gleichstände.

Der bisherige `calc_modifier.get_best_mix` bleibt als vollständiger Legacy-/Exportpfad mit seinem bisherigen Kombinationsbudget bestehen. Die private API verwendet `mix_search.get_best_mix`; die Website verwendet die entsprechende JavaScript-Portierung. Datenbankexport und CLI-Minimumsuche werden dadurch nicht auf einen Beam umgestellt.

`tests/test_browser_search.py` führt die JavaScript-Tests und vollständige Gewinnervergleiche mit den Python-Engines über den gepinnten Node-Interpreter aus. `tests/test_private_calculation_api.py` prüft die Zugangssperre einschließlich des alten Formularpfads. Diese Tests gehören zu `tools/project.py test`; sie werden nicht durch fehlendes Node oder eine fehlende Browser-Engine übersprungen.

Gezielte Vertragstests: `tests/test_search_modes.py`. Sie prüfen unter anderem exakte Ergebnisse gegen vollständige Suche unter dem aktuellen Preismodell, beide Abbruchpfade ohne Fallback und ohne Gewinner, einen erst am Suchende eintretenden Zeitabbruch sowie die Kennzeichnung schneller Ergebnisse. Die früheren Messungen und die wissenschaftlichen Quellen stehen im [Evaluationsbericht](reviews/2026-09-10-bounded-search-research.md).

## Browser-Integrationsprüfung am 10.09.2026

- `tools/project.py check`: erfolgreich, einschließlich Version-/Runtimepins und Format-/Syntaxprüfung.
- `tools/project.py test`: 152 Tests erfolgreich im abschließenden Lauf (36,402 Sekunden), einschließlich der über Node gestarteten Engine-, Worker- und Oberflächentests. Ein vorangegangener Lauf während paralleler Lasttests scheiterte im bestehenden Windows-Test `test_timeout_returns_no_partial_exact_winner` am Beenden seines Testprozesses; der isolierte Wiederholungslauf und der anschließende vollständige Lauf waren erfolgreich. Der historische Prozessrunner wurde hierfür nicht geändert.
- Zusätzlicher Vergleich über `tests.test_browser_search.BrowserSearchTests.run_browser` und `_python_result`: vollständige Gewinnergleichheit für alle acht Produkte mit fünf Zutaten sowie OG Kush mit sechs Zutaten in beiden Modi. Die zehn Vergleiche wurden gemeinsam ausgeführt; dies ist eine Korrektheitsprüfung, keine neue isolierte Laufzeitmessreihe.
- Echter Browser über `tools/project.py start --port 42751`, Quellidentität `cacdb2ad99f43a0f07646bfd26a9d0c7fc692cdc76e0a15c56275b6ef96f63b2`: sechs Zutaten liefern exakt 119,50 Dollar Profit beziehungsweise 118,30 Dollar im Schnellmodus. Abbruch einer größeren Suche, Neustart und anschließendes Größenlimit bei 17 Zutaten zeigen keine alten oder unvollständigen Gewinner. Keine Browser-Konsolenfehler.
- Das Serverprotokoll der Browser-Läufe enthält nur Modell-/Skript-GETs. Der getrennte HTTP-Smoke prüft die Modell-/Skriptverfügbarkeit und erhält für beide anonymen Rechen-POSTs HTTP 404. Der eigene Testserver wurde beendet und sein Port geschlossen; der Prüftab wurde geschlossen.
- Diese Nachweise entstanden vor dem Versionsschritt für 1.2.0. Sie ersetzen dessen eigenen Container-/Release-Lauf nicht; der veröffentlichte Tag und seine CI-Protokolle liefern den späteren Publikationsnachweis.

## Frühere Server-Integrationsprüfung am 10.09.2026

- `tools/project.py test`: 101 Tests bestanden im vollständigen Lauf nach der Modusintegration. Eine anschließend im parallelen Export-Task hinzugefügte Testdatei war bei der Discovery dieses Laufs noch nicht enthalten.
- `tools/project.py check`: bestanden, einschließlich Runtime-/Versionpins, Ruff, Biome, Prettier und Syntaxprüfung. Die zwischenzeitlichen Formatabweichungen des parallelen Export-Tasks waren beim abschließenden Check behoben.
- Browserprüfung über den vollständigen Projektstarter in einer isolierten temporären Kopie, Version 1.0.3: OG Kush bei Rang `max` und sechs Schritten zeigt exakt 119,50 Dollar Profit mit `Optimality proven`; der Schnellmodus zeigt 118,30 Dollar mit Näherungskennzeichnung. Bei einer folgenden exakten Anfrage mit 17 Schritten verschwinden sämtliche alten Gewinner und nur der Abbruchtext bleibt sichtbar. Dies ist ein Integrationstest, keine neue Laufzeitmessreihe.
- Der eigene temporäre Server wurde nach Identitätsprüfung beendet und der Prüftab geschlossen. Die Dateien der Integration stehen im Checkout bereit; bereits anderswo laufende App-Instanzen müssen vor Verwendung der Änderungen neu gestartet werden.

# Vertrag der Rezeptsuche

Die Weboberfläche und `POST /get_best_mix` bieten die Modi `exact` und `fast`. Ohne Auswahl gilt `exact`. Beide suchen Rezepte mit einer bis zur angeforderten Zahl an Zutaten; Reihenfolge und Wiederholungen werden berücksichtigt. Ein Rezept ohne Zusätze ist Teil der getrennten Minimum-Effekt-Suche, nicht dieser Best-Mix-Suche.

## Berechnung auf dem Gerät des Besuchers

Die Website lädt die Regeln und Preise über `GET /browser/<revision>/search-data`. Diese URL und alle CSS-/JS-URLs enthalten einen gemeinsamen Inhalts-Hash und dürfen langfristig im Browser-Cache bleiben. Alle drei Reiter teilen die geladenen Modelldaten. Der kompatible Endpunkt `GET /search-data` bleibt mit erneuter Cache-Validierung erreichbar. Die [HTTP-Auslieferung](HTTP_DELIVERY.md) beschreibt Cache-Vertrag und Request-Limits.

Jede Suche läuft anschließend in einem eigenen Browser-Worker aus `webapp/static/js/search-engine.js`; sie sendet keine Rechenanfrage an den Server. Die Seite bleibt bedienbar und zeigt Tiefe und Arbeitszähler. **Cancel search** beendet den Worker und verwirft alle Kandidaten. Ein neuer Lauf startet unabhängig; verspätete Nachrichten alter Läufe werden ignoriert.

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

Alle drei Reiter teilen erfolgreich geladene Modelldaten. Beim Verlassen eines Suchreiters wird
seine laufende Optimierung abgebrochen; verspätete Ergebnisse bleiben verworfen. Einstellungen,
Wunscheffekte und eigenes Rezept bleiben beim Wechsel erhalten. Ladefehler können erneut versucht
werden. Es entsteht kein neuer Server-Rechenweg. Die direkte Rezeptauswertung benötigt JavaScript,
aber keinen Web Worker; die Optimierungen benötigen weiterhin einen Worker.

`tests/test_browser_recipe.py` vergleicht unter anderem ein Rezept mit 14 unterschiedlichen Zutaten gegen die bestehende Python-Berechnung. Die Node-Tests prüfen zusätzlich Reihenfolge, Wiederholungen, mehr als 16 Schritte, Eingabefehler und die Bedienung des neuen Reiters.

## Gewünschte und ausgeschlossene Effekte

**Match Effects** bietet zwei voneinander getrennte Entscheidungen: `match_mode` bestimmt die
zulässigen Endeffekte, `search_mode` weiterhin die Genauigkeit der Suche. **Only these**
(`match_mode: "exact"`, Standard) verlangt genau die gewünschten Effekte. **Allow extras**
(`match_mode: "contains"`) verlangt alle gewünschten Effekte und verbietet alle ausgeschlossenen;
weitere neutrale Effekte dürfen vorkommen. Die Reihenfolge der Zielauswahl ist bedeutungslos.
Zwischenzustände und Mischschritte behalten jedoch ihre vollständige Reihenfolge. Vorübergehend
sind auch ausgeschlossene Effekte erlaubt, weil spätere Zutaten sie entfernen oder umwandeln können.

Der Nutzer wählt Basisprodukt, Rang, maximale Zutatenzahl und markiert Effekte mit **Want**,
**Neutral** oder **Avoid**. Ein Effekt kann nicht gleichzeitig gewünscht und ausgeschlossen sein.
Mindestens ein Wunscheffekt ist erforderlich; bei **Allow extras** genügt auch ein Ausschluss
ohne Wunscheffekte. Eine komplett leere Vorgabe ist ungültig. Die Suche
berücksichtigt das unveränderte Basisprodukt mit null Zusätzen bis zur maximalen Zutatenzahl.
Das Ranking lautet: **wenigste Mischschritte**, dann **geringste Zutatenkosten**, schließlich
Lookup-Reihenfolge. Die Garantie bezieht sich auf diese Einstellungen und das vorhandene Spielmodell.

`Schedule1Search.searchEffects(catalog, request, options)` verwendet dieselben Übergangs- und
Preisfunktionen wie die anderen Browser-Rechner. `request` enthält `product_name`, `level`,
`combination_size` (0 bis 16), `search_mode` und `target_effects` als Array technischer IDs.
Optional sind `match_mode` (Standard `exact`) und `excluded_effects` (Standard leeres Array).
Unbekannte Modi, unbekannte/doppelte Effekte und überlappende Wunsch-/Ausschlusslisten werden
abgelehnt. Die Worker-Nachricht trägt `type: "search_effects"`.

Exact durchsucht die Tiefen der Reihe nach. Die erste vollständig geprüfte Treffertiefe beweist
die geringste Schrittzahl; unter ihren Treffern entscheidet der Preis. Identische geordnete
Zwischenzustände werden verlustfrei zusammengefasst. Erschöpfte Suche ohne Treffer liefert
`not_found` mit Beweis nur für die angeforderten Grenzen. Ein Zeit-, Arbeits-, Zustands- oder
Größenlimit liefert dagegen `incomplete` **ohne Rezept und ohne Unmöglichkeitsbehauptung**.

Die letzte angeforderte Schicht wird vollständig ausgewertet, aber nicht mehr gespeichert.
Ein Frontier-Limit für danach ungenutzte Zustände verhindert deshalb dort keinen Beweis.

Fast verwendet eine begrenzte, auf die Ziele gerichtete Beam-Suche. Auch dieser Modus zeigt
ausschließlich Rezepte, die alle gewählten Effektbedingungen erfüllen. Im Modus **Allow extras**
zählen erlaubte zusätzliche Effekte nicht als Abweichung in der Beam-Bewertung. Ein Treffer belegt
damit die Effekte, aber nicht das beste Ranking; er bleibt `approximate`. `not_found` im Schnellmodus ist
kein Beweis, dass die Kombination unerreichbar ist. Fast wechselt nicht heimlich zu Exact.

Ergebnis: `search` mit Modus/Status/Beweisflag, `recipe` (oder `null`), `match_mode`, `target_effects`,
`excluded_effects` und `stats`. Die Oberfläche prüft diese Angaben gegen die gestartete Anfrage
und wertet die Zutatenfolge erneut aus, bevor sie das Ergebnis anzeigt.
Abbruch und verspätete Worker-Antworten werden wie in der Profitsuche behandelt. Die bestehenden
Arbeits-/Zeitbudgets bleiben maßgeblich. Es gibt keinen neuen öffentlichen oder privaten
Server-Rechenendpunkt für die Effektsuche.

Alle 34 Effekte tragen kurze Beschreibungen aus dem dokumentierten
[Wiki-Abgleich](reviews/2026-09-12-effect-descriptions.md). Sie stehen direkt in der Zielauswahl
und aufklappbar unter den Ergebnissen aller Reiter. Farbe und Beschreibung sind optionale
Metadaten aus der zentralen Lookup-Liste; sie beeinflussen keine Mischregel.

### Verifikation der Effektsuche am 12.09.2026

- `tools/project.py check`: bestanden.
- `tools/project.py test`: 175 Tests bestanden (29,868 Sekunden). Ein erster Gesamtlauf fand
  ein Importproblem des neuen Python-Vergleichstests bei Testentdeckung; der Test verwendet nun
  denselben expliziten Projektpfad wie die übrigen Browser-Tests. Der komplette Wiederholungslauf
  war erfolgreich.
- `tests/test_browser_effect_search.py`: unabhängige vollständige Python-Enumeration für alle
  neun Basisprodukte, ein Null-Schritt-Rezept, einen unerreichbaren Einzeleffekt und die bekannte
  Shrooms-Kombination mit sechs Effekten. Die vollständigen Gewinner einschließlich Geldwerten
  und Reihenfolge stimmen mit der neuen Browser-Suche überein.
- Gezielte Node-UI-Suiten: 27/27 bestanden. Engine-Tests prüfen Zwischenzustände, Zielmengen,
  Ranking, Null-Schritt-Treffer, Abschlusszeit und Frontier-/Arbeitsgrenzen. Ein unabhängiges
  Code-Review fand keine Verletzung der Exact-/Fast-Garantien.
- Echter Browser auf Port 42765, Quelldigest
  `85bcb48228464d2f178c7a233d56aa30a80cee77a534dcc7fc5a6f1288408323`:
  OG Kush mit nur Calming liefert null Zutaten; Sneaky/Thought Provoking/Gingeritis liefern
  Cuke und Banana für 4 Dollar Zutatenkosten. Beide Suchmodi getestet. Maximal null Zutaten
  mit diesen drei Zielen zeigt im Exact-Modus einen begrenzten Unmöglichkeitsbeweis, im
  Schnellmodus ausdrücklich keinen solchen Beweis.
- Abbruch einer tiefen exakten Suche, erhaltene Auswahl beim Filtern/Tabwechsel, Leertaste für
  Checkboxen, Pfeil-/Home-/End-Tasten zwischen drei Tabs sowie Erklärungen in allen drei Reitern
  geprüft. Light/Dark bei Desktopbreite und 320 px: kein horizontaler Überlauf und keine
  Browserfehler oder Warnungen. Screenreader, reale Touchgeräte und separate Textvergrößerung
  wurden nicht getestet.

Der neue Reiter ist lokal vorbereitet; diese Verifikation ist kein Veröffentlichungsnachweis.

### Erweiterung um Ausschlüsse und zusätzliche Effekte am 12.09.2026

- `tools/project.py check` bestanden; vollständiger `tools/project.py test` mit 175 Tests
  in 34,958 Sekunden bestanden. Die gezielten Node-Suiten prüfen 31 UI-Fälle und 21 Engine-/
  Worker-Fälle. Die bestehende Profit-Engine-Suite ist ebenfalls erfolgreich.
- Die unabhängige Python-Enumeration umfasst jetzt auch erlaubte Zusatzeffekte und reine
  Ausschlusslisten. Synthetische Fälle prüfen vorübergehend ausgeschlossene Zwischenzustände,
  Konflikte/Normalisierung der Listen und die Behandlung erlaubter Extras im Fast-Ranking.
- Browser mit Quelldigest `3d21ed01c178c3701889d9a0411a62ee42f00f45eb83910ea09cf7314ed2a0ca`:
  „Energizing gewünscht, Toxic ausgeschlossen“ liefert bei OG Kush in beiden Suchmodi Cuke
  mit Calming und Energizing. Eine reine Toxic-Ausschlussliste erlaubt das unveränderte
  Basisprodukt. Der Wechsel zu „Only these“ bewahrt die Ausschlüsse und deaktiviert ohne
  Wunscheffekt die Suche; veraltete Ergebnisse werden entfernt.
- Native Radiogruppen per Pfeiltasten, Fokusrahmen, Filter mit erhaltener Auswahl, Entfernen
  einzelner Chips und PageDown im Scrollbereich geprüft. Desktop sowie 320 px in Light/Dark
  ohne horizontalen Überlauf; „Neutral“ bleibt bei 320 px einzeilig. Kleinster gemessener
  Textkontrast der gewählten Calming-/Toxic-Karten: 5,61:1 in Light, 6,26:1 in Dark.
- Keine Browserfehler/-warnungen. Screenreader, reale Touchgeräte und separate Textvergrößerung
  weiterhin nicht geprüft. Keine neue Version oder Veröffentlichung.
- Abschließende CSS-Korrektur: Ausschlusschips behalten auch bei Hover/Druck die Ausschlussfarbe.
  Nach Neustart unter `70cf935a159beb24c4f48cda632622242f16ff3b44ad343f5d63b91d4e10260d`
  wurden die geladene CSS-Regel und die reine Ausschlusssuche im Exact-Modus nochmals geprüft.

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

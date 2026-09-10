# Code-Review vom 8. September 2026

Ausgangspunkt ist Commit `8639d74`. Geprüft wurde die vorhandene Fachlogik von `schedule1_calc`, einschließlich Flask-Routen, tatsächlich eingebundenem JavaScript, Jinja-Template, CLI, Lookup-Modellen und sämtlichen SQLite-Helfern. Die Stellenangaben beziehen sich auf den Arbeitsstand nach der mechanischen Formatierung vom 08.09.2026. Dieser Bericht verändert keine Fachlogik. Die parallel übernommenen Quiltor-Konventionen und das neue Tooling wurden zusätzlich unabhängig geprüft; das Ergebnis steht am Ende.

Die ursprünglichen wesentlichen Probleme waren eine unbeschränkte Vollsuche im HTTP-Request, ein im Frontend verborgenes profitableres Ergebnis, falsche Erfolgsmeldungen für ungültige Eingaben sowie Such- und Datenbankpfade, die vorhandene Lösungen beziehungsweise aktualisierte Stammdaten nicht korrekt berücksichtigen.

**Nachtrag vom 10.09.2026:** F01 (P1), F02/F03/F04/F05/F06/F08 (P2) und F07/F11/F12 (P3) sind im lokalen Arbeitsstand behoben. F09 ist teilweise behoben; dessen Ganzdollarrundung und F10 bleiben offen. Die folgenden ursprünglichen Nachweise beschreiben den Stand vom 08.09.2026; Änderungen sind beim jeweiligen Befund vermerkt. Der Wiki-Abgleich wurde durch diesen Patch nicht verändert.

**Aktuelle Gesamtprüfung nach F11 und Integration der Suchmodi:** `tools/project.py check` bestand vollständig; `tools/project.py test` bestand alle **106 Tests**. `git diff --check` war ebenfalls erfolgreich. Die bei F07–F09 dokumentierten zwischenzeitlichen Formatierungs- und Integrationsfehler sind damit im gemeinsamen Arbeitsstand behoben. Dies ist ein lokaler Nachweis, kein neuer Remote-CI-Lauf und keine Verifikation der offenen Spielregeln.

## Vorgehen und Aussagegrenzen

- Alle Python-Quelldateien und beide JavaScript-Kopien wurden gelesen. Das Template lädt ausschließlich `webapp/static/js/script.js`.
- Echte Flask-Requests wurden mit `Flask.test_client()` unter der lokalen Python-3.12.14-Umgebung und Flask 3.1.2 ausgeführt. Es wurden keine Flask- oder HTTP-Funktionen gemockt. Nur `setup_logging` wurde durch einen inaktiven Logger ersetzt, um Review-Logs im Projekt zu vermeiden.
- Berechnungsfehler wurden mit vorhandenen Lookup-Daten reproduziert. Der Suchraum für kleine Beispiele wurde vollständig enumeriert.
- SQLite-Initialisierung, Befüllung, Speicherung und gefiltertes Lesen wurden in einer temporären Datenbank ausgeführt. Lookup-Änderungen für den Refresh-Test erfolgten nur im Speicher und wurden zurückgesetzt.
- Milliarden Kombinationen wurden bewusst nicht berechnet. Die Größenabschätzung folgt exakt aus den vorhandenen 16 Zutaten und den tatsächlich durchlaufenen kartesischen Produkten.
- Es wurde keine reale Browser-Sitzung für Layout- oder Interaktionstests verwendet. Aussagen zum Rendering beruhen auf dem tatsächlich eingebundenen JavaScript, dem Template und echten API-Antworten.
- Rundung und das Limit von acht Effekten hängen von externen Spielregeln ab. Die Quellen und ihre Grenzen stehen direkt bei diesen Befunden. Widersprüchliche Wiki-Transformationen wurden nicht als gesicherte Algorithmusfehler ausgegeben.
- `buy_price` wurde nicht pauschal als Kosten je fertiger Produkteinheit abgezogen: Die Daten modellieren teilweise Samen beziehungsweise Rohstoffchargen. Ein solches Abziehen wäre ohne Ertragsmodell keine belastbare Korrektur.

## Priorisierte Befunde

### F01 · P1 · Eine zulässige Formulareingabe löst Milliarden Berechnungen im Request aus

**Status am 10.09.2026: behoben.** Der übernommene Patch prüft vor der Enumeration ein Limit von 200.000 Kombinationen je Rezeptlänge mit begrenzter Multiplikation. Bei 16 Zutaten wird ab Länge fünf abgewiesen; Länge vier durchsucht einschließlich kürzerer Rezepte insgesamt 69.904 Kombinationen. Die JSON-Route liefert für die Budgetüberschreitung HTTP 400 mit einer Erklärung. Standardmäßig werden nur die beiden Gewinner gehalten; `collect_all_combinations=True` aktiviert die vollständige Sammlung für den Datenbankexport. Auch der HTML-POST verwendet die begrenzte Suche; im Zuge von F03/F12 wurden HTTP 400 und eine sichtbare Fehlermeldung ergänzt. Das Limit ist kein Gesamtbudget über alle Längen oder parallelen Requests.

**Regressionstests:** `tests/test_calculator_budget.py` prüft die Ablehnung vor der Enumeration für JSON und HTML, die exakte Budgetgrenze, extrem große Größenangaben, identische Gewinner mit und ohne vollständige Sammlung sowie die ausdrückliche Sammlung beim Export. Die Flask-Requests und zulässigen kleinen Berechnungen laufen gegen die echte Anwendung; überschrittene Budgets werden ohne Ausführung der teuren Enumeration geprüft.

**Stelle:** [calc_modifier.py](C:/Users/timra/git/schedule1_calc/src/functionality/calc_modifier.py:165), `_find_best_combinations`, Zeilen 165–170; anschließend wird jedes Ergebnis in `combinations_data` behalten.

**Auslöser:** `POST /get_best_mix` mit `{"combination_size":8,"product_name":"og_kush","level":"max"}`. Acht ist auch über das normale Zahlenfeld zulässig. Die einzige obere Prüfung erlaubt bis zu 16, weil 16 Zutaten verfügbar sind.

**Nachweis:** Die Schleife besucht für Größe acht insgesamt `16**8 + 16**7 + ... + 16 = 4.581.298.448` Rezepte. Alle Ergebnisse werden als Dataclasses mit mehreren Listen und Decimal-Werten gehalten, obwohl die JSON-Route nur zwei Gewinner benötigt. Ein Zeit-, Speicher- oder Kombinationsbudget existiert in diesem Pfad nicht. Das Limit aus `find_min_substances_for_effect` wird hier nicht verwendet.

**Auswirkung:** Ein einzelner normaler Request kann den Prozess über sehr lange Zeit auslasten und den Speicher erschöpfen. Weitere Requests konkurrieren mit derselben Berechnung; das UI besitzt auch keine Abbruchfunktion.

**Mögliche Korrektur:** Vor dem Start den Suchraum begrenzen und eine verständliche 4xx-Antwort zurückgeben; für die interaktive Suche Gewinner laufend vergleichen, anstatt alle Rezepte zu sammeln. Eine umfassendere Suche benötigt eine geeignete Zustands-/Pruning-Strategie oder einen begrenzten Hintergrundjob. Eine reine HTML-Obergrenze reicht als serverseitiger Schutz nicht aus.

### F02 · P2 · Das Frontend zeigt das profitabelste berechnete Rezept nicht an

**Status am 10.09.2026: behoben.** Die Weboberfläche zeigt beide Optimierungsziele mit getrennten Überschriften und vollständigen Rezeptangaben. Das gilt sowohl für die AJAX-Antwort als auch für den HTML-POST ohne JavaScript. Verkaufspreis, Zutatenkosten und Gewinn werden mit zwei Nachkommastellen angezeigt. Auch bei identischen Gewinnern bleiben beide Ziele sichtbar. Die Berechnung und die Definition des Gewinns wurden nicht geändert. Die folgenden Angaben dokumentieren den ursprünglichen Befund.

**Nachprüfung:** Zwei Flask-Regressionstests in `tests/test_result_rendering.py` sichern den HTML-POST für unterschiedliche und identische Gewinner ab. Im echten Browser wurde zusätzlich der JavaScript-Pfad mit dem untenstehenden Beispiel (69,40 gegenüber 72,30 Gewinn), einem identischen Gewinner und einer anschließenden Budgetüberschreitung geprüft. Wiederholte Anfragen ersetzen die bisherigen Ergebnisse; die Budgetfehlermeldung bleibt sichtbar. API-Werte und Fehlertexte werden im JavaScript über `textContent` eingefügt.

**Stelle:** [script.js](C:/Users/timra/git/schedule1_calc/webapp/static/js/script.js:28), Ergebnis-Rendering, Zeilen 28–35; gleicher Sachverhalt im [Template](C:/Users/timra/git/schedule1_calc/webapp/templates/index.html:34), Zeilen 34–41.

**Auslöser:** Produkt `green_crack`, Level `hustler_iii`, Kombinationgröße `2`.

**Nachweis mit echten Berechnungsergebnissen:**

| Ergebnis                             | Zutaten                    | Verkauf | Zutatenkosten | Gewinn |
| ------------------------------------ | -------------------------- | ------: | ------------: | -----: |
| `best_modifier`, im UI angezeigt     | `horse_semen`, `mega_bean` |   85,40 |         16,00 |  69,40 |
| `best_profit`, von der API geliefert | `viagra`, `mega_bean`      |   83,30 |         11,00 |  72,30 |

Auch bei Rundung der Verkaufspreise auf ganze Dollar bleibt das zweite Rezept um drei Dollar profitabler. Der Fehler hängt somit nicht von den Nachkommastellen ab.

**Auswirkung:** Der als Rechner für profitable Kombinationen beschriebene Dienst berechnet den besseren Gewinn korrekt, macht dieses Ergebnis im normalen Frontend aber nicht zugänglich.

**Mögliche Korrektur:** `best_profit` zusätzlich sichtbar rendern und beide Optimierungsziele eindeutig beschriften, oder Gewinn als voreingestelltes Ziel verwenden. Auch den HTML-POST-Pfad berücksichtigen.

### F03 · P2 · Ungültige Größen erzeugen erfolgreiche Nullrezepte; andere Eingabefehler werden zu HTTP 500

**Status am 10.09.2026: behoben.** JSON- und Formularanfragen validieren Pflichtfelder, Typen und bekannte Produkte/Ränge vor der Berechnung. Positive Ganzzahlen und ganzzahlige Zeichenfolgen bleiben zulässig; Boolean-Werte, Dezimalzahlen, nichtpositive Größen und unbekannte Angaben werden mit HTTP 400 abgewiesen. Die JSON-Route verlangt ein JSON-Objekt; fehlerhafte JSON-Syntax liefert 400, ein ungeeigneter Content-Type 415. Unerwartete interne Fehler bleiben HTTP 500 mit einer allgemeinen Meldung. Der Serializer erzeugt aus fehlenden Gewinnern keine künstlichen Nullrezepte mehr. Die zunächst beibehaltene Zutatenanzahl-Grenze wurde anschließend im Rahmen von F04 entfernt; das P1-Budget bleibt maßgeblich. Die nachstehende Tabelle dokumentiert den ursprünglichen Stand.

**Nachprüfung:** Zwölf Regressionstests in `tests/test_request_validation.py` prüfen unter anderem Typ-/Wertefehler vor der Berechnung, 5.000-stellige Größenangaben, gültige normalisierte Namen und numerische Ränge, JSON-Syntax und Content-Type sowie interne Fehler und fehlende Gewinner. Formularmeldungen werden escaped innerhalb des Ergebniscontainers ausgegeben. Im echten Browser wurden die Mindestgröße, eine Budgetfehlermeldung und anschließend wieder die korrekten beiden Gewinner geprüft.

**Stelle:** [app.py](C:/Users/timra/git/schedule1_calc/webapp/app.py:64), `get_best_mix_json`, Zeilen 64–70 sowie der Fallback in Zeilen 82–89. Im HTML-Pfad steht die Konvertierung bereits vor dem `try`, Zeilen 16–21.

**Auslöser und echte HTTP-Ergebnisse:**

| Eingabe bei sonst gültigem OG-Kush/Street-Rat-I-Request | Ergebnis                                                                     |
| ------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `combination_size: 0` oder `-1`                         | HTTP 200; beide Gewinner haben Verkauf 0, Kosten 0 und leere Zutaten/Effekte |
| `combination_size: "1.5"`                               | HTTP 500 mit `invalid literal for int()`                                     |
| fehlendes `combination_size`                            | HTTP 500 mit `int(... NoneType)`                                             |
| JSON-Array `[1]`                                        | HTTP 500 mit `list object has no attribute get`                              |
| unbekannter Produktname                                 | HTTP 500 mit `Product ... not found`                                         |
| `combination_size: true`                                | HTTP 200; Boolean wird als Größe eins akzeptiert                             |

**Ursache:** Für nichtpositive Größen durchläuft `_find_best_combinations` keine Iteration und liefert `None` als Gewinner. `_serialize` versteckt das als gültiges Nullobjekt. Der allgemeine Exception-Handler unterscheidet Benutzereingaben nicht von Serverfehlern.

**Auswirkung:** Ungültige Eingaben erscheinen teilweise als erfolgreich berechnetes Rezept; andere liefern unnötige Serverfehler. Das normale HTML-Zahlenfeld hat kein `min`, deshalb ist Größe null auch ohne manipulierten Client möglich.

**Mögliche Korrektur:** JSON-Objekt, Pflichtfelder, tatsächlichen Integer-Typ und zulässigen Wertebereich vor der Berechnung prüfen; bekannte Eingabefehler als 400/422 ausgeben. `None` nicht in ein künstliches Rezept umwandeln. Soll Größe null fachlich unterstützt werden, muss das reale Basisprodukt berechnet werden.

### F04 · P2 · Die Anzahl unterschiedlicher Zutaten begrenzt fälschlich die Rezeptlänge

**Status am 10.09.2026: behoben.** Die Best-Mix-Suche, die Minimumsuche und die gemeinsame Webvalidierung begrenzen Rezeptlängen nicht mehr durch die Anzahl unterschiedlicher Zutaten. Wiederholungen bleiben geordnet; die Suche berücksichtigt weiterhin alle kürzeren Rezeptlängen. Die maximal berechenbare Länge wird vor der Enumeration aus dem Budget bestimmt, ohne eine Potenz mit einem beliebig großen Exponenten auszurechnen. Der Schutz gilt auch für die Minimumsuche. Die folgende Beschreibung dokumentiert den ursprünglichen Befund.

**Budgetgrenzen:** Bei mindestens zwei verfügbaren Zutaten gilt unverändert das Kombinationslimit je Rezeptlänge. Für genau eine Zutat begrenzt dasselbe Budget stattdessen die Summe der verarbeiteten Zutaten über alle Rezeptlängen (`1 + 2 + ... + n`); damit bleibt auch dieser Sonderfall endlich. Eine leere Zutatenmenge wird vor der Enumeration abgewiesen, wenn die Suche Zusätze erfordert; ein bereits passendes Basisprodukt wird seit F06 ohne Zusätze zurückgegeben. Diese Schutzregeln ändern keine Spieldaten.

**Nachprüfung:** `tests/test_repeated_ingredients.py` prüft echte Berechnungen einschließlich der vollständigen Sammlung aller 1.024 Fünf-Schritt-Folgen auf Level eins, beide HTTP-Routen und das bekannte Minimalrezept. Weitere Fälle sichern leere und einzelne Zutaten sowie extrem große Größenangaben ohne proportional lange Vorprüfung ab.

**Stelle:** [calc_modifier.py](C:/Users/timra/git/schedule1_calc/src/functionality/calc_modifier.py:148), `_find_best_combinations`, Zeilen 148–151, und `find_min_substances_for_effect`, Zeile 300.

**Auslöser:** Auf Level eins sind vier Zutaten verfügbar. `get_best_mix(5, "og_kush", 1)` wirft `Not enough substances available`, obwohl die eigentliche Enumeration ausdrücklich Wiederholungen mit `product(..., repeat=size)` erlaubt.

**Konkretes Gegenbeispiel:** `cuke → donut → donut → paracetamol → banana` erzeugt laut vorhandener Fachlogik die sechs Effekte `calorie_dense`, `explosive`, `gingeritis`, `jennerising`, `slippery`, `sneaky`. Eine vollständige Enumeration aller Rezepte mit null bis vier Schritten deckt diese sechs Effekte nicht gleichzeitig ab. `find_min_substances_for_effect(..., max_level=1, max_search_size=5)` liefert trotzdem `(0, [])`, weil die Suche bei vier aufhört.

**Auswirkung:** Gültige Rezepte mit wiederholten Zutaten werden abgewiesen beziehungsweise als nicht auffindbar gemeldet.

**Mögliche Korrektur:** Rezeptlänge unabhängig von der Anzahl unterschiedlicher Zutaten validieren; stattdessen ein explizites Suchbudget verwenden. Das Budgetproblem aus F01 bleibt dabei getrennt zu lösen.

### F05 · P2 · Eine aus Budgetgründen ausgelassene Suche wird als erfolglose vollständige Suche ausgegeben

**Status am 10.09.2026: behoben.** Wenn nach Prüfung aller budgetkonformen Längen kein Rezept gefunden wurde, aber angeforderte größere Längen ungeprüft bleiben, wirft die Minimumsuche `MinimumSearchLimitExceeded`. Die Ausnahme enthält `requested_size`, `searched_size` und `limit`; bei einem Budget unterhalb der ersten Rezeptlänge ist `searched_size` gleich `0`. Ein bereits innerhalb des Budgets gefundenes Minimum wird wie bisher zurückgegeben. Nur eine vollständig erfolglose Suche innerhalb des angeforderten Bereichs liefert `(0, [])`. Die CLI zeigt den unvollständigen Suchlauf ausdrücklich mit angeforderter und geprüfter Höchstlänge an und setzt anschließend die unabhängige Best-Mix-Berechnung fort. Die folgenden Angaben dokumentieren den ursprünglichen Befund.

**Nachprüfung:** Der echte CLI-Aufruf für die sechs Zieleffekte aus F04 mit `--max_level max --max_search_size 6 --combination_size 1` meldet angeforderte Länge sechs, vollständig geprüfte Länge vier und das Budget 200.000. Anschließend werden beide Best-Mix-Gewinner ausgegeben. Die Regressionen in `tests/test_minimum_search_budget.py` sichern Budgetende, vollständigen Negativnachweis, frühen Treffer sowie die CLI-Ausgaben getrennt ab.

**Stelle:** [calc_modifier.py](C:/Users/timra/git/schedule1_calc/src/functionality/calc_modifier.py:302), `find_min_substances_for_effect`, Zeilen 302–307 und 339–341.

**Auslöser:** Die sechs Zieleffekte aus F04, `max_level=51` und `max_search_size=6`, mit dem voreingestellten Limit `200_000`.

**Nachweis:** Das bekannte Fünf-Schritt-Rezept ist auf diesem Level verfügbar. Mit 16 Zutaten übersteigen aber schon `16**5 = 1.048.576` das Limit; Größe fünf und sechs werden übersprungen. Der Aufruf liefert `(0, [])`. Ein Produkt mit einem Basiseffekt kann bei höchstens vier Schritten unter der vorhandenen Logik höchstens fünf Effekte enthalten; die übersprungenen Größen sind für diese Anfrage also entscheidend.

**Auswirkung:** Aufrufer und CLI unterscheiden ein Budgetende nicht von „kein Rezept vorhanden“. Ein höherer Spielerlevel kann hier ein zuvor auffindbares Ziel scheinbar unmöglich machen, weil er den Suchraum vergrößert.

**Mögliche Korrektur:** Einen expliziten Status wie `search_limit_reached` mit tatsächlich geprüfter maximaler Größe zurückgeben und anzeigen. Wenn ein exaktes Minimum zugesagt wird, darf ein unvollständig geprüfter Bereich nicht als vollständiger Negativnachweis gelten.

### F06 · P2 · Die Minimumsuche berücksichtigt ein bereits passendes Basisprodukt nicht

**Status am 10.09.2026: behoben.** Die Minimumsuche prüft zuerst die tatsächlichen Effekte des Basisprodukts gegen gewünschte und ausgeschlossene Effekte. Ein Treffer liefert `(0, [CombinationResult])` mit leeren Zutaten, Zutatenkosten null und den bestehenden Preis-/Effektwerten des Basisprodukts. `(0, [])` bleibt ein vollständig erfolgloser Suchlauf. Die CLI unterscheidet beide Fälle über die Ergebnisliste und zeigt auch Null-Zutaten-Rezepte an. Die Prüfung funktioniert bei Höchstlänge null, ohne verfügbare Zusätze und ohne Budget für Zutatenkombinationen; negative Höchstlängen bleiben leere Suchbereiche. Die Best-Mix-Websuche verlangt weiterhin positive Rezeptgrößen. Die folgenden Angaben dokumentieren den ursprünglichen Befund.

**Nachprüfung:** Der echte CLI-Aufruf mit `--product og_kush --desired calming --max_level street_rat_i --max_search_size 0 --combination_size 1` meldet Minimum null mit genau einem Rezept, Effekt `calming`, Modifikator 0,10, Verkaufspreis 38,50 und Zutatenkosten 0,00 nach dem bestehenden Rechenmodell. Die Tests in `tests/test_zero_ingredient_minimum.py` sichern die Abgrenzung zum leeren Ergebnis und die Berücksichtigung ausgeschlossener Effekte ab.

**Stelle:** [calc_modifier.py](C:/Users/timra/git/schedule1_calc/src/functionality/calc_modifier.py:300), `find_min_substances_for_effect`, Beginn der Schleife bei eins.

**Auslöser:** `find_min_substances_for_effect("og_kush", ["calming"], [], 1)`.

**Nachweis:** `og_kush` besitzt laut Lookup bereits `calming`. Die Funktion meldet trotzdem Minimum eins und schlägt unter anderem `cuke` oder `donut` vor.

**Auswirkung:** Ein explizit als Minimum ausgewiesenes Ergebnis enthält unnötige Zutaten, Kosten und zusätzliche Effekte.

**Mögliche Korrektur:** Den Zustand ohne Zusätze zuerst gegen gewünschte und ausgeschlossene Effekte prüfen. Der Rückgabevertrag und die CLI müssen dabei „gültiges Rezept mit null Zutaten“ von „nichts gefunden“ unterscheiden; derzeit verwendet die CLI allein `size == 0` als Fehlschlag.

### F07 · P3 · Der direkte DB-Scripteinstieg fehlt

**Status am 10.09.2026: behoben.** Sowohl `python src/datenbank/populate_db.py` als auch `python -m src.datenbank.populate_db` initialisieren jetzt das Schema und befüllen die Stammdaten. `--db-path` wählt die Datenbank; ohne Angabe gilt `combinations.db` relativ zum Arbeitsverzeichnis. Der direkte Scriptaufruf funktioniert auch aus einem anderen Arbeitsverzeichnis. Import und `--help` führen keine Datenbankoperationen aus. README und englische Übersetzung dokumentieren den Moduleinstieg. Die folgenden Angaben dokumentieren den ursprünglichen Befund; die Aktualisierung bestehender Lookup-Werte bleibt separat unter F08 offen.

**Nachprüfung:** `tests/test_database_entry.py` startet beide Einstiege als echte Unterprozesse mit temporären Datenbanken, einschließlich Pfaden mit Leerzeichen und direktem Aufruf aus einem anderen Arbeitsverzeichnis ohne `PYTHONPATH`. Geprüft werden die erzeugten Stammdaten, der Standardpfad, wiederholte Befüllung ohne Duplikate sowie Import/Hilfe ohne Datenbankanlage und ein Fehlerstatus bei unbrauchbarem Datenbankpfad.

**Prüfgrenze des gemeinsamen Arbeitsstands:** Die fünf F07-Tests, ihre Ruff-Prüfung und Python-Kompilierung bestehen. Der anschließende Gesamtlauf vom 10.09.2026 führte 77 Tests aus und meldete drei fehlgeschlagene Teiltests in den parallel hinzugekommenen Such-Experimenten: `test_search_fast.py` verglich auch die variable Statistik `elapsed_seconds`. Der Sammelcheck meldete außerdem eine Ruff-Abweichung in `experiments/search_fast.py`. Diese Befunde wurden an den zuständigen parallelen Task zurückgegeben; dieser Lauf gilt nicht als bestandene Gesamtprüfung.

**Stelle:** [populate_db.py](C:/Users/timra/git/schedule1_calc/src/datenbank/populate_db.py:4), Imports Zeilen 4–5 und fehlender Programmeinstieg am Dateiende. Der README-Quickstart in Ausgangscommit `8639d74` nannte `python src\datenbank\populate_db.py`.

**Nachweis:** Dieser direkte Befehl scheitert aus dem Repository-Root mit `ModuleNotFoundError: No module named 'src'`. Wird der Root-Pfad extern bereitgestellt, endet das Script ohne Befüllung: Ein Aufruf per `runpy.run_path(..., run_name="__main__")` mit instrumentiertem `sqlite3.connect` führt null Datenbankzugriffe aus, weil lediglich Funktionen definiert werden.

**Zwischenstand vor der Behebung:** Der README-Abschnitt rief `initialize_database(...)` und `populate_database(...)` ausdrücklich per `python -c` aus dem Repository-Kontext auf. Der empfohlene Quickstart war damit korrigiert. Der alte direkte Script-Aufruf und ein wirkungsloser `python -m src.datenbank.populate_db` blieben als Einstiegsfalle bestehen; deshalb wurde der Befund auf P3 statt des ursprünglichen P2-Dokumentationsfehlers eingestuft.

**Mögliche Korrektur:** Falls ein ausführbares DB-Script gewünscht ist, einen konsistenten Modulaufruf mit tatsächlichem `__main__`-Einstieg und DB-Pfad anbieten. Andernfalls beim nun dokumentierten Funktionsaufruf bleiben. Der Flask-Start und `src/main.py` wurden nicht als betroffen bewertet: deren vorhandene Pfadergänzung erreicht den Repository-Root korrekt.

### F08 · P2 · Erneutes Befüllen übernimmt geänderte Lookup-Werte nicht

**Status am 10.09.2026: behoben.** `populate_database` synchronisiert die Lookup-Stammdaten einschließlich geänderter Werte und entfallener Beziehungen und Einträge. IDs weiterhin vorhandener Effekte, Zutaten und Produkte bleiben stabil. Bei einer tatsächlichen Änderung werden gespeicherte Rezeptberechnungen mit ihren Zutaten-/Effektzuordnungen innerhalb derselben Transaktion entfernt; bei identischem Datenstand bleiben sie erhalten. Die Befüllung berechnet keine Ersatzrezepte. Fremdschlüssel werden geprüft, ungültige Lookup-Verweise führen zum Fehler, und ein Fehler rollt die Synchronisierung zurück. Der Alias `max` für Level 51 erzeugt keine dauernde Änderung gegenüber `kingpin_i+`. Die folgenden Angaben dokumentieren den ursprünglichen Befund.

**Nachprüfung:** Sechs Regressionstests in `tests/test_database_sync.py` prüfen echte temporäre SQLite-Datenbanken: unveränderte Befüllung samt Rezepten und IDs, geänderte Felder sowie neue/entfallene Entitäten und Beziehungen, reine Beziehungsänderungen, vertauschte Levelzuordnungen, ungültige Lookup-Verweise und einen per Trigger ausgelösten Fehler nach begonnenen Änderungen. Der Fehlerfall erhält auch beide Rezept-Zuordnungstabellen und gibt die Verbindung frei. Die fünf CLI-Tests bleiben erfolgreich. Im abschließenden Lauf von `tools/project.py test` bestanden alle 84 Tests, einschließlich der zuvor fehlschlagenden parallelen Such-Experimente. Der Sammelcheck bestand Ruff und Biome, meldete aber noch eine Prettier-Abweichung im parallel erstellten Bericht `docs/reviews/2026-09-10-bounded-search-research.md`; diese wurde an dessen zuständigen Task zurückgegeben.

**Stelle:** [populate_db.py](C:/Users/timra/git/schedule1_calc/src/datenbank/populate_db.py:40), `populate_database`, Zeilen 40–43; dieselbe `INSERT OR IGNORE`-Strategie wird auch für Effekte, Produkte und Beziehungen benutzt.

**Auslöser:** Eine bestehende Datenbank wurde bereits befüllt. Danach werden beispielsweise Preise, Freischaltlevel oder Effektregeln im Lookup geändert und `populate_database` erneut ausgeführt.

**Nachweis in temporärer SQLite-DB:** Erstbefüllung setzt `cuke.price=2`. Danach wurde ausschließlich im Python-Speicher `cuke.price=Decimal("3.00")` gesetzt und erneut befüllt. Die Funktion meldete Erfolg; `SELECT price FROM substances WHERE name='cuke'` lieferte weiterhin `2`.

**Auswirkung:** Live-Berechnung und Datenbank können nach dem angefragten Datenabgleich unterschiedliche Werte verwenden. Geänderte Zutatenlevel verfälschen die DB-Level-Filterung; gespeicherte Kombinationen behalten zudem ihre alten Preise und Modifikatoren. Entfernte Beziehungen bleiben ebenfalls erhalten.

**Mögliche Korrektur:** Stammdaten synchronisieren statt nur erstmalig einzufügen, einschließlich entfernter Beziehungen; berechnete Kombinationen an eine Datenversion binden oder bei relevanten Änderungen gezielt neu erzeugen. Die Aktualisierung sollte transaktional sein.

### F09 · P2 · Der Verkaufspreis wird nach der dokumentierten Wiki-Formel nicht gerundet

**Status am 10.09.2026: teilweise behoben.** Die Geldberechnung verwendet jetzt die dezimalen Einzelzuschläge der aktiven Effekte und den dezimalen Basispreis. Best-Mix-Suche, Minimumsuche und deren Null-Zutaten-Fall verwenden dieselbe Preisfunktion vor Gewinnvergleich und Export. Dadurch entfallen die aus binärer Addition und Multiplikation stammenden Preisreste. Der öffentliche Modifikator bleibt ein Float; ein direkter Aufruf der Preisfunktion ohne aktive Einzelwerte kann eine bereits ungenaue Float-Summe nicht nachträglich rekonstruieren. Die Ganzdollarrundung bleibt offen: Es wird weiterhin der exakte ungerundete Rechenpreis ausgegeben, auch bei `.50`. Die folgenden Nachweise beschreiben den ursprünglichen Stand.

**Erneute Quellenprüfung am 10.09.2026:** Die [offizielle Unity-2022.3-Dokumentation](https://docs.unity3d.com/2022.3/Documentation/ScriptReference/Mathf.RoundToInt.html) belegt bei `Mathf.RoundToInt` die Rundung exakter Halbwerte zur geraden ganzen Zahl. Ein Nachweis, dass der Vanilla-Preiscode diese Funktion verwendet, wurde jedoch nicht gefunden. Der öffentliche Drittanbieter-[Projektmirror](https://github.com/Skippeh/ScheduleOne_UnityProject/blob/42f85de31642125fb980092b4367894094b73a14/README.md) beschreibt entfernte Methodenkörper; sein [Preisgetter](https://github.com/Skippeh/ScheduleOne_UnityProject/blob/42f85de31642125fb980092b4367894094b73a14/Assets/Scripts/ScheduleOne/Product/ProductDefinition.cs) ist ein Platzhalter und belegt keine Spielregel. Diese Quellen reichen weder zur Festlegung der Halbwertregel noch zum Nachweis vollständiger Parität mit der Float-Arithmetik einer aktuellen Spielversion. Deshalb wurde keine Rundungsart geraten.

**Nachprüfung der Teilkorrektur:** `tests/test_price_arithmetic.py` prüft Dezimalgrenzen, Addition einzelner Effektwerte, explizit leere Effekte, einen echten Profitgleichstand trotz unterschiedlicher Float-Summen und den konkreten Exportpreis von OG Kush + Cuke (46,20). Diese fünf Prüfungen und die acht Null-Zutaten-/Minimumtests bestanden isoliert. `tools/project.py check` bestand vollständig. Der gemeinsame Gesamtlauf mit 99 Tests meldete dagegen 12 fehlgeschlagene Prüfungen und 34 Fehler in der gleichzeitig entstehenden Suchmodus-Integration: `mix_search` übergab das von den Suchmodulen noch nicht akzeptierte Argument `expansion_limit`. Dadurch war auch der neue HTTP-Preisvergleich nicht erfolgreich. Der Schnittstellenbefund wurde an den zuständigen parallelen Task übergeben; dieser Lauf gilt nicht als bestandene Gesamtprüfung.

**Nach Korrektur der Exact-Schnittstelle:** Der erneute Lauf `python -m unittest tests.test_price_arithmetic tests.test_zero_ingredient_minimum -v` bestand alle 14 Tests einschließlich des HTTP-Preisvergleichs. Die Gesamtprüfung nach Abschluss der noch laufenden Schnellmodus-Integration steht separat aus.

**Stelle:** [calc_modifier.py](C:/Users/timra/git/schedule1_calc/src/functionality/calc_modifier.py:114), `_calculate_price`, Zeile 114.

**Nachweis:** Die Funktion gibt `Decimal(float(base_price) * (1 + multiplier))` zurück. Für Basispreis 70 und Summe 1,12 ist das Ergebnis ungefähr 148,40 statt 148. Außerdem entstehen lange binäre Nachkommarestwerte, die der HTML-POST-Pfad ungefiltert ausgibt.

**Externe Regel:** Die [Effects-Seite des Wikis](https://schedule-1.fandom.com/wiki/Effects) nennt `Round(B * (1 + Sum[multipliers]))` und das konkrete Meth-Beispiel 148,40 → 148. Nach anfänglich eingeschränktem Web-Abruf wurde die Seite am 08.09.2026 vom Wiki-Agenten direkt im Browser gelesen und die Rundungsformel bestätigt. Die Behandlung von exakt halben Dollarbeträgen ist damit nicht belegt.

**Auswirkung bei dieser Spielregel:** Verkaufspreise und ausgewiesener Gewinn stimmen nicht exakt mit dem Spiel überein. Die Rangfolge kann ebenfalls betroffen sein, wenn ungerundete Unterschiede oder bisherige Gleichstände die Gewinnerauswahl beeinflussen.

**Mögliche Korrektur:** Den Preis vollständig in dezimaler Arithmetik berechnen und die belegte Spielrundung vor Gewinnvergleich und Persistierung anwenden. Für `.50`-Grenzfälle erst die tatsächliche Spielregel verifizieren, statt eine Rundungsart zu raten.

### F10 · P2 · Rezepte können mehr als acht aktive Effekte erhalten

**Erneute Prüfung am 10.09.2026: weiterhin offen.** Auch die [S1API-Dokumentation zu Mischreaktionen](https://ifbars.github.io/S1API/api/S1API.Products.MixReactions.html) beschreibt ein Acht-Effekte-Limit für ihre Erweiterungen. Das ist ein technisches Community-Indiz, kein Nachweis der Vanilla-Implementierung einer festgelegten Spielversion. Die [offizielle Ankündigung zu v0.2.7](https://store.steampowered.com/news/app/3164500/view/524207770906394892?l=english) dokumentiert eine Überarbeitung des Mischalgorithmus, legt aber dessen genaue Kapazitätsprüfung nicht fest. Der bestehende Quellenkonflikt zur Reihenfolge bleibt ungelöst. Für eine definitive Korrektur fehlt ein Grenztest im Spiel oder ein nachvollziehbarer Vanilla-Codepfad mit zugeordneter Version; deshalb wurde die Effektlogik nicht geändert.

**Stelle:** [calc_modifier.py](C:/Users/timra/git/schedule1_calc/src/functionality/calc_modifier.py:98), `_calculate_modificator`, Zeilen 98–100.

**Nachweis mit aktuellen lokalen Daten:**

```text
Produkt: og_kush
donut → energy_drink → chili → donut → mouth_wash → battery → addy → horse_semen
```

Die Funktion liefert neun Effekte und Modifikator 3,16: `spicy`, `sneaky`, `balding`, `zombifying`, `bright_eyed`, `calming`, `refreshing`, `electrifying`, `long_faced`. Nach den Ersetzungen wird der Basis-Effekt jeder Zutat ohne Kapazitätsprüfung angefügt.

**Externe Regel und Grenze:** Die vom Betreiber eines Community-Rechners veröffentlichte [Regelerklärung](https://schedule1-calculator.com/howitworks) beschreibt höchstens acht Effekte und das Ergänzen des Basis-Effekts nur bei freiem Platz. Eine [Wiki-Diskussion](https://schedule-1.fandom.com/f/p/4400000000000044237) bestätigt dieses Limit. Die Rechnerseite weist darauf hin, nicht mehr gepflegt zu werden; das ist keine Zusicherung für sämtliche späteren Spielversionen.

**Auswirkung unter der dokumentierten Acht-Effekte-Regel:** Lange Rezepte und ihre Preise können im Spiel nicht erreichbare Ergebnisse enthalten.

**Mögliche Korrektur:** Das verifizierte Effektlimit im Zustandsübergang berücksichtigen und mit einem Rezept an der Grenze prüfen. Die Reihenfolge einzelner Transformationsregeln bleibt gesondert zu verifizieren, da die untersuchten externen Quellen hierzu nicht durchgehend übereinstimmen.

### F11 · P3 · Die DB-Erzeugung verliert die Produktnormalisierung

**Status am 10.09.2026: behoben.** `generate_db_entrys` normalisiert den Produktnamen am Eingang und reicht den kanonischen Wert an Berechnung und Speicherung weiter. Der optionale Parameter `db_path` ermöglicht einen eigenen Exportpfad; vorhandene Aufrufe verwenden weiterhin `combinations.db`. Die Speicherung meldet fehlende Produkte, Zutaten und Effekte ausdrücklich statt unvollständige Rezepte zu schreiben. Jeder Aufruf von `store_all_combinations_normalized` ist transaktional und schließt seine Verbindung auch nach Fehlern. Der Export mehrerer Rezeptlängen besteht weiterhin aus getrennten Speichertransaktionen; frühere erfolgreiche Längen werden durch einen späteren Fehler nicht zurückgerollt. Die folgenden Angaben dokumentieren den ursprünglichen Befund.

**Nachprüfung:** Fünf Tests in `tests/test_database_export.py` verwenden echte temporäre SQLite-Datenbanken. Sie vergleichen den Export für `OG Kush` und `og_kush`, prüfen eigene Datenbankpfade, geordnete wiederholte Zutaten und vollständige Effektzuordnungen. Fehlende Referenzen erzeugen keine Teilrezepte; nach einem unbekannten Produkt kann die Datei unter Windows unmittelbar gelöscht werden. Ein Triggerfehler nach einem bereits vollständig eingefügten Rezept und weiteren Teilinserts rollt den gesamten neuen Speicheraufruf zurück, während vorher gespeicherte Daten erhalten bleiben. Alle fünf Tests sind im erfolgreichen 106-Test-Gesamtlauf enthalten.

**Stelle:** [calc_modifier.py](C:/Users/timra/git/schedule1_calc/src/functionality/calc_modifier.py:369), `generate_db_entrys`, Zeilen 369–373; [populate_db.py](C:/Users/timra/git/schedule1_calc/src/datenbank/populate_db.py:99), Zeilen 99–100.

**Auslöser:** Eine initialisierte und befüllte Datenbank liegt im Arbeitsverzeichnis; Aufruf `generate_db_entrys(1, "OG Kush", 1)`.

**Nachweis:** `get_best_mix` normalisiert den Namen und berechnet erfolgreich. Anschließend erhält die SQL-Abfrage wieder den ursprünglichen Namen `OG Kush` statt `og_kush`; `fetchone()` ist `None`, und `[0]` löst `TypeError: 'NoneType' object is not subscriptable` aus.

**Auswirkung:** Ein vom Berechnungs-API akzeptierter Produktname kann nicht gespeichert werden. Der Fehlerpfad schließt die geöffnete Verbindung nicht zuverlässig; unter Windows blockierte dies im Test die unmittelbare Entfernung der temporären Datenbank bis zum Prozessende.

**Mögliche Korrektur:** Einmal am Eingang normalisieren und den kanonischen Namen weiterreichen; fehlende Produkte explizit behandeln und Verbindungen auch bei Ausnahmen schließen.

### F12 · P3 · Der HTML-POST-Pfad verschweigt berechenbare Eingabefehler

**Status am 10.09.2026: zusammen mit F03 behoben.** Das Template zeigt Formularfehler sichtbar und HTML-escaped an. Ungültige Eingaben und Budgetüberschreitungen liefern HTTP 400, interne Fehler eine allgemeine Meldung mit HTTP 500. Die folgenden Angaben dokumentieren den ursprünglichen Befund.

**Stelle:** [index.html](C:/Users/timra/git/schedule1_calc/webapp/templates/index.html:33), Ergebnisbereich Zeilen 33–42; `index()` übergibt bei Fehlern zwar `error`, das Template liest diesen Wert jedoch nirgends.

**Auslöser:** Normaler POST nach `/`, wenn JavaScript deaktiviert oder nicht geladen ist, mit einem ungültigen Produkt oder einer Kombinationgröße oberhalb der auf dem Level erlaubten Zahl.

**Nachweis:** Ein echter Flask-POST mit Produkt `does_not_exist` lieferte HTTP 200; der HTML-Inhalt enthielt weder `not found` noch eine andere Fehlermeldung. Ungültige Größenstrings erzeugen wegen der Konvertierung vor dem `try` stattdessen HTTP 500, siehe F03.

**Auswirkung:** Der vorhandene serverseitige Formularpfad zeigt nach einem Fehler nur das leere Formular. Nutzer erfahren nicht, was sie korrigieren müssen.

**Mögliche Korrektur:** Den übergebenen Fehler im Template sicher rendern, die Eingaben erhalten und einen passenden Statuscode setzen; Validierung aus beiden POST-Pfaden gemeinsam verwenden.

## Reproduktionskern

Der folgende Code lässt sich aus dem Repository-Root mit `.venv\Scripts\python.exe -B -` ausführen. Er verändert keine Projektdateien und ersetzt ausschließlich das dateischreibende Logging. Die SQLite-Tests wurden zusätzlich mit einer temporären Datenbank ausgeführt, wie oben beschrieben.

```python
import logging
import sys
import types

logging_stub = types.ModuleType("functionality.logging.logging_config")
logging_stub.setup_logging = lambda: logging.getLogger("review")
sys.modules[logging_stub.__name__] = logging_stub

from webapp.app import app
from functionality.calc_modifier import (
    _calculate_modificator,
    find_min_substances_for_effect,
    get_best_mix,
)

logging.disable(logging.CRITICAL)
client = app.test_client()
base = {"combination_size": 1, "product_name": "og_kush", "level": "street_rat_i"}
for size in [1, 0, -1, "1.5", True]:
    response = client.post("/get_best_mix", json=dict(base, combination_size=size))
    print(size, response.status_code, response.json)

_, best_modifier, best_profit = get_best_mix(2, "green_crack", "hustler_iii")
print(best_modifier, best_profit)
print(find_min_substances_for_effect("og_kush", ["calming"], [], 1))

recipe = ["cuke", "donut", "donut", "paracetamol", "banana"]
target = list(_calculate_modificator(recipe, "og_kush")[1])
print("Known solution:", recipe, target)
print(find_min_substances_for_effect("og_kush", target, [], 1, max_search_size=5))
print(find_min_substances_for_effect("og_kush", target, [], 51, max_search_size=6))

print("Size-eight search candidates:", sum(16 ** n for n in range(1, 9)))
```

## Erfolgreich geprüfte Pfade und offene Grenzen

GET `/`, ein gültiger JSON-Request, Berechnung beider Gewinner, SQLite-Erstbefüllung, Speicherung einer kleinen Rezeptmenge und `get_best_recipe_filtered` für diese Daten funktionierten. Die Speicherung bewahrt die Zutatenreihenfolge über `position`; die Abfrage rekonstruiert diese Reihenfolge. Die geprüften SQL-Werte werden mit Parametern übergeben. Es wurde kein belastbarer SQL-Injection-Befund gefunden.

Die ursprüngliche Annahme eines generellen `src`-Importfehlers wurde geprüft und verworfen: `calc_modifier.py` ergänzt mit `../..` tatsächlich den Repository-Root. Nur der alte direkte DB-Scriptaufruf aus F07 bleibt fehlerhaft; die neue README verwendet den erfolgreichen Funktionsaufruf.

Das Projekt hatte vor der parallel erfolgenden Konventionsübernahme keine Tests. Dieser Review ersetzt weder einen vollständigen Spielabgleich aller geordneten Rezeptfolgen noch einen Browser-, Last- oder Langzeittest. Der separate Wiki-Bericht behandelt konkrete Stammdatenabweichungen und widersprüchliche Quellen; dieser Bericht führt keine unbestätigten Wiki-Transformationen als sichere Codefehler auf.

## Übernommenes Tooling geprüft

Der Review-Agent las zusätzlich den neuen [Projektadapter](C:/Users/timra/git/schedule1_calc/tools/project.py), dessen Tests, die Formatter-Konfigurationen und den CI-Workflow. Die folgenden Prüfungen erfolgten unabhängig von den Tests des implementierenden Agents, mit temporären Dateien beziehungsweise ausschließlich selbst gestarteten lokalen Prozessen:

| Bereich              | Unabhängiger Nachweis                                                                | Ergebnis                                                                     |
| -------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| Versionsänderung     | `minor` aktualisiert VERSION, package.json und beide eigenen Lockfile-Kopien         | erfolgreich                                                                  |
| Versionsfehler       | unveränderte/kleinere Version, führende Null, Prerelease und schmutziger Arbeitsbaum | vor Änderung abgewiesen                                                      |
| Rollback             | `os.replace` beim zweiten Ziel gezielt fehlschlagen lassen                           | alle Originalbytes wiederhergestellt, keine `.version-*`-Reste               |
| Fremder Windows-Port | normaler vorhandener `HTTPServer`, ohne selbst gesetzte Exklusivoption               | nach Nachbesserung sofortiger Bindfehler; Fremdserver antwortet unverändert  |
| Quellidentität       | ausschließlich `tools/project.py` in temporärem Root verändern                       | Digest ändert sich nach Nachbesserung                                        |
| Readiness            | echter HTTP-Abruf der Identität und des Frontends                                    | Version/Digest-Header korrekt, Diagnoseantwort `no-store`, Frontend HTTP 200 |
| Stop und Wiederstart | echter Windows-`CTRL_BREAK_EVENT`, zweimal nacheinander derselbe Port                | jeweils Ready, Exit 0 mit `Stopping`, direkter Wiederstart erfolgreich       |

**Im Review gefunden und bereits korrigiert:** Werkzeug konnte mit seiner normalen Wiederverwendungsoption unter Windows zunächst denselben Port wie ein fremder `HTTPServer` binden. Erst die Identitätsprüfung ließ den neuen Start scheitern. Der Agent ergänzte exklusives Windows-Binden ohne `SO_REUSEADDR`; der identische unabhängige Test scheitert nun bereits beim Binden. Außerdem fehlte der aktive Startadapter zunächst im Quell-Digest. Er wurde in dessen Eingabemenge aufgenommen und die Änderung unabhängig nachgewiesen.

Diese beiden erledigten Tooling-Befunde sind keine offenen Fachlogik-Findings. Ein tatsächlicher Stromausfall während mehrerer Dateiersetzungen wurde nicht simuliert; der geprüfte Versionsrollback betrifft abgefangene Schreibfehler. Der CI-Workflow wurde lokal gelesen und seine Befehle durch die Projektprüfungen abgedeckt; ein Lauf auf GitHub wurde nicht gestartet.

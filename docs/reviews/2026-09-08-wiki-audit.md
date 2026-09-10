# Wiki- und Datenreview vom 08.09.2026

Die vorhandenen Preise und Effektzuschläge sind überwiegend konsistent mit den abrufbaren Referenzen. Belegt abweichend sind der Freischaltrang von Mega Bean und der Rang von Cocaine. Shrooms fehlen als Produktart. Mehrere Wiki-Seiten widersprechen einander; diese Konflikte rechtfertigen keine automatische Datenkorrektur.

Dieser Bericht dokumentiert den ursprünglichen Review. Spielwerte, Datenbank und Berechnungslogik wurden dafür am 08.09.2026 nicht geändert.

**Nachtrag vom 10.09.2026:** Die beiden Rangabweichungen bei Mega Bean und Cocaine wurden nach erneuter Quellenprüfung korrigiert. Herkunft, Spielversionsgrenze, Auswirkungen und Regressionstests stehen im [separaten Änderungsnachweis](2026-09-10-rank-corrections.md). Die folgenden Vergleichstabellen dokumentieren weiterhin den ursprünglichen Stand vom 08.09.2026. Die übrigen Datenkonflikte bleiben offen.

## Gegenstand und Belastbarkeit

Im untersuchten Bestand gibt es keine versionierten JSON-, JSONC- oder JSON5-Dateien mit Spieldaten. Die vom Nutzer angesprochenen Werte stehen in [lookup.py](C:/Users/timra/git/schedule1_calc/src/lookup/lookup.py:71); `populate_database` übernimmt diese Python-Datensätze nach SQLite. Während des parallelen Tooling-Auftrags neu angelegte JSON-Konfigurationen sind keine Spielwertquellen.

Bestand, durch Python-AST und Lesen der Zuordnungstabellen ermittelt: **34 Effekte, 16 Zutaten, 114 Ersetzungsregeln, 8 Produkte, 5 reguläre Qualitätsstufen sowie 52 Rangschlüssel für 51 verschiedene Zahlenwerte**. Der zusätzliche Rangschlüssel ist `max`; `n_a=-1` ist ein projektspezifischer Qualitätsplatzhalter.

Die Quellen wurden am **08.09.2026** geprüft. Erste Abrufe mit dem Web-Lesewerkzeug scheiterten mit HTTP 402 beziehungsweise robots.txt. Anschließend gelang der normale, nicht angemeldete Abruf im Codex-Browser: Ingredients, Effects, Ranks, Cocaine, Shrooms und Drugs wurden dort direkt gelesen. Ergänzende Seiten wurden über den Suchindex geprüft (überwiegend Crawl vor zwei Monaten, Meth teilweise vor fünf Monaten). „Stimmt“ bedeutet **stimmt mit dem jeweils angegebenen Wiki-Stand**, keine Verifikation gegen aktuelle Spielbinärdateien oder eigene Spieltests.

Ergänzend wurde die vollständige Transformationstabelle einer Analyse von Spieldateien durch Schedule One Mixer maschinell verglichen. Diese Quelle nennt ausdrücklich **03.05.2025 / Spielversion 0.3.4f8**. Sie ist als historische, nachvollziehbare Gegenprüfung brauchbar, aber kein Beleg für unveränderte Regeln im September 2026. [Schedule One Mixer: Analyse und Datum](https://scheduleonemixer.com/how-mixing-in-schedule-1-works)

## Abrufstatus der zentralen Quellen

| Quelle                                                                  | Abrufart am 08.09.2026 | Direkt geprüfter Inhalt                                                                         |
| ----------------------------------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------- |
| Ingredients                                                             | Live-Browser           | alle 16 Preise/Ränge/Basiseffekte und 114 Ersetzungen                                           |
| Effects                                                                 | Live-Browser           | alle 34 lokalen Zuschläge, Rundungsformel, Lethal-Fußnote, Banana-/Flu-Medicine-Matrixkonflikte |
| Ranks                                                                   | Live-Browser           | relevante Ränge für Mega Bean, Sour Diesel und Green Crack                                      |
| Cocaine                                                                 | Live-Browser           | Enforcer I, $1.500 je Charge; übrige Angaben ergänzend im Index                                 |
| Shrooms / Drugs                                                         | Live-Browser           | Produkt vorhanden; $65 gegenüber $100, Cocaine Enforcer I                                       |
| Marijuanasorten, Items, Gas-Mart, Meth, Shirley Watts, Quality, Console | Suchindex              | ergänzende Preise, Sorteneffekte, Freischaltungen und Qualitätscodes                            |
| Schedule One Mixer / How Mixing Works                                   | Web-Direktabruf        | historische Analyse beziehungsweise Community-Modellregeln                                      |

Die in diesem Bericht ausdrücklich behandelten Wiki-Widersprüche bei Banana und beim Shrooms-Preis bestehen somit auch beim Live-Abruf. Der Abruf selbst beweist nicht, dass jeder Wiki-Eintrag bereits an die aktuelle Spielversion angepasst wurde.

## Konkrete Befunde

| Priorität   | Lokaler Wert                                                                                                                 | Referenz und Befund                                                                                                                                                                                                                                                    | Konsequenz                                                                                                                         |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| P2          | [Mega Bean, Rang](C:/Users/timra/git/schedule1_calc/src/lookup/lookup.py:380): `hustler_ii` = 17                             | **Peddler III = 13** in [Items](https://schedule-1.fandom.com/wiki/Items) und [Ranks](https://schedule-1.fandom.com/wiki/Ranks).                                                                                                                                       | Der Zutatenfilter schließt Mega Bean bei den Rängen 13–16 aus; erreichbare Rezepte fehlen.                                         |
| P2          | [Cocaine, Rang](C:/Users/timra/git/schedule1_calc/src/lookup/lookup.py:173): `hustler_ii` = 17                               | **Enforcer I = 26** in [Cocaine](https://schedule-1.fandom.com/wiki/Cocaine) und [Drugs](https://schedule-1.fandom.com/wiki/Drugs).                                                                                                                                    | Der Datensatz behauptet eine frühere Freischaltung. Die Durchsetzung von Produkträngen muss separat im Code geprüft werden.        |
| P2 / Umfang | [Produktliste](C:/Users/timra/git/schedule1_calc/src/lookup/lookup.py:109): keine Shrooms                                    | Shrooms existieren seit v0.4.2 laut [Shrooms](https://schedule-1.fandom.com/wiki/Shrooms); auch der [offizielle Steam-Eintrag zum Shrooms-Update](https://store.steampowered.com/news/app/3164500/view/523111043238463501?l=english) bestätigt das Update als solches. | Der Rechner deckt diese Produktart nicht ab. Die konkrete Preisergänzung bleibt wegen des unten beschriebenen Wikikonflikts offen. |
| P3          | [Rangschlüssel](C:/Users/timra/git/schedule1_calc/src/lookup/lookup.py:11): `hoodium_i` bis `hoodium_v`                      | Der Rang heißt **Hoodlum**. [Ranks](https://schedule-1.fandom.com/wiki/Ranks)                                                                                                                                                                                          | Namens-/Schnittstellenabweichung; Umbenennung benötigt Kompatibilitätsentscheidung für gespeicherte Daten und Eingaben.            |
| P3          | [Effektname](C:/Users/timra/git/schedule1_calc/src/lookup/lookup.py:94): `schizophrenia`                                     | Wiki-Anzeigename und ID sind **Schizophrenic / schizophrenic**. [Effects](https://schedule-1.fandom.com/wiki/Effects)                                                                                                                                                  | Intern konsistent verwendeter Alias, keine nachgewiesene falsche Rechnung. Externe Eingaben sollten normalisiert werden.           |
| P3          | [Meth-Produktnamen](C:/Users/timra/git/schedule1_calc/src/lookup/lookup.py:145): `low_quality_pesudo`, `high_quality_pesudo` | Gemeint ist **Pseudo**, außerdem sind diese Einträge Ausgangsstoffqualitäten, während die Preisbasis das fertige Meth beschreibt. [Shirley Watts](https://schedule-1.fandom.com/wiki/Shirley_Watts), [Meth](https://schedule-1.fandom.com/wiki/Meth)                   | Tippfehler und unklare Produktbezeichnung; bei späterer Bereinigung bestehende IDs migrieren oder als Alias erhalten.              |

## Vollständigkeit des tatsächlich durchgeführten Vergleichs

| Bereich                                     | Geprüft                                       | Ergebnis                                                                                  |
| ------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Effektzuschläge                             | alle 34 lokalen Zahlen                        | 34 stimmen nach Umrechnung `Wiki-Multiplikator − 1`                                       |
| Zutatenpreise                               | alle 16                                       | 16 stimmen                                                                                |
| Zutatenbasiseffekte                         | alle 16                                       | 16 stimmen nach Namensnormalisierung                                                      |
| Zutatenränge                                | alle 16                                       | 15 stimmen, Mega Bean weicht ab                                                           |
| Ersetzungen gegen Fandom Ingredients        | alle 114 lokalen Paare                        | 113 stimmen, Banana/Cyclopean ist ein Wikikonflikt                                        |
| Ersetzungen gegen historische Datei-Analyse | alle 114 lokalen Paare                        | 114 stimmen; maschineller Paarvergleich, keine fehlenden Paare                            |
| Produktpreisbasen                           | alle 8 Datensätze / 3 vorhandene Produktarten | 35 / 70 / 150 bestätigt; Shrooms fehlen                                                   |
| Produkt-Einkaufspreise                      | 8 Datensätze                                  | 4 Samenpreise und 3 Pseudopreise stimmen; Cocaine `0` ist kein belegter Herstellungspreis |
| Produktbasiseffekte                         | alle 8                                        | 4 Cannabis-Effekte und 4 leere Effektlisten stimmen                                       |
| Produktränge                                | alle 8                                        | 5 ohne Konflikt bestätigt, 2 widersprüchliche Wiki-Angaben, Cocaine weicht ab             |
| Qualitätscodes                              | 5 reguläre Codes                              | 0–4 bestätigt; `n_a=-1` ist lokal                                                         |

Nicht durchgeführt: sämtliche möglichen Rezeptfolgen durchspielen, Wiki-Änderungshistorien abrufen oder garantieren, dass aktuelle Spielversionen keine zusätzlichen Effekte/Zutaten enthalten. Insbesondere ist die Aussage „alle aktuellen Effekte vorhanden“ nicht belegt: Das Wiki führt zusätzlich Lethal, bezeichnet diesen jedoch als nur über Save-Editing beziehungsweise Konsole verfügbar. [Effects](https://schedule-1.fandom.com/wiki/Effects)

## Zutaten: Preise, Ränge und Ersetzungsumfang

Die Preis-/Rangspalten vergleichen lokale Werte mit [Items](https://schedule-1.fandom.com/wiki/Items); die vier frühen Zutaten sind zusätzlich durch [Gas-Mart](https://schedule-1.fandom.com/wiki/Gas-Mart), [Donut](https://schedule-1.fandom.com/wiki/Donut) und [Paracetamol](https://schedule-1.fandom.com/wiki/Paracetamol) belegt. `SR` = Street Rat, `HL` = Hoodlum, `P` = Peddler, `H` = Hustler. Die Anzahl stammt aus dem lokalen AST und dem eigenen Vergleich, nicht aus einer übernommenen Wiki-Tabelle.

| Lokale Zutat | Preis lokal / Wiki | Rang lokal / Wiki | Ersetzungen lokal | Vergleich Ingredients |
| ------------ | ------------------ | ----------------- | ----------------: | --------------------- |
| cuke         | $2 / $2            | SR I / SR I       |                 7 | 7 gleich              |
| flu_medicine | $5 / $5            | HL IV / HL IV     |                10 | 10 gleich             |
| gasoline     | $5 / $5            | HL V / HL V       |                11 | 11 gleich             |
| donut        | $3 / $3            | SR I / SR I       |                 7 | 7 gleich              |
| energy_drink | $6 / $6            | P I / P I         |                 9 | 9 gleich              |
| mouth_wash   | $4 / $4            | HL III / HL III   |                 4 | 4 gleich              |
| motor_oil    | $6 / $6            | P II / P II       |                 5 | 5 gleich              |
| banana       | $2 / $2            | SR I / SR I       |                 9 | 8 gleich, 1 Konflikt  |
| chili        | $7 / $7            | P IV / P IV       |                 6 | 6 gleich              |
| iodine       | $8 / $8            | H I / H I         |                 6 | 6 gleich              |
| paracetamol  | $3 / $3            | SR I / SR I       |                10 | 10 gleich             |
| viagra       | $4 / $4            | HL II / HL II     |                 5 | 5 gleich              |
| horse_semen  | $9 / $9            | H III / H III     |                 4 | 4 gleich              |
| mega_bean    | $7 / $7            | **H II / P III**  |                10 | 10 gleich             |
| addy         | $9 / $9            | H II / H II       |                 5 | 5 gleich              |
| battery      | $8 / $8            | P V / P V         |                 6 | 6 gleich              |

Die 16 Basiseffekte stimmen mit [Ingredients](https://schedule-1.fandom.com/wiki/Ingredients) überein. Für den Ersetzungsvergleich wurden Schreibweisen normalisiert: Bindestriche/Leerzeichen zu Unterstrichen, Viagor zu `viagra`, Schizophrenic zu `schizophrenia`. Methodik der maschinellen Gegenprüfung: `ast.parse` und `ast.literal_eval` extrahierten die lokalen `side_effect_replacements` ohne Modulimport als JSON nach stdout. Aus der per `web.open` gelesenen HTML-Tabelle „All Transformations“ von Schedule One Mixer wurden die drei Spalten Start Effect / Ingredient / Target Effect extrahiert und nach derselben Normalisierung als Tripel mengenweise verglichen. Das Ergebnis lautete `localCount=114, sourceCount=114, matched=114, unmatched=[]`. Das bestätigt die gespeicherten Einzelregeln; es prüft nicht die Laufzeitreihenfolge oder Kollisionen zwischen mehreren Effekten.

## Effektzuschläge

Alle folgenden lokalen Werte stimmen mit `Multiplikator − 1` in [Effects](https://schedule-1.fandom.com/wiki/Effects) überein. Zum Beispiel entspricht lokal `0.54` dem Wiki-Faktor `1.54`; die unterschiedlichen Darstellungen sind kein Datenfehler.

| Lokal         | Zuschlag | Lokal             | Zuschlag |
| ------------- | -------: | ----------------- | -------: |
| anti_gravity  |     0.54 | laxative          |     0.00 |
| athletic      |     0.32 | long_faced        |     0.52 |
| balding       |     0.30 | munchies          |     0.12 |
| bright_eyed   |     0.40 | paranoia          |     0.00 |
| calming       |     0.10 | refreshing        |     0.14 |
| calorie_dense |     0.28 | schizophrenia     |     0.00 |
| cyclopean     |     0.56 | sedating          |     0.26 |
| disorienting  |     0.00 | seizure_inducing  |     0.00 |
| electrifying  |     0.50 | shrinking         |     0.60 |
| energizing    |     0.22 | slippery          |     0.34 |
| euphoric      |     0.18 | smelly            |     0.00 |
| explosive     |     0.00 | sneaky            |     0.24 |
| focused       |     0.16 | spicy             |     0.38 |
| foggy         |     0.36 | thought_provoking |     0.44 |
| gingeritis    |     0.20 | toxic             |     0.00 |
| glowing       |     0.48 | tropic_thunder    |     0.46 |
| jennerising   |     0.42 | zombifying        |     0.58 |

## Produkte und Qualität

`buy_price` bezeichnet bei Cannabis den Preis eines Samens, bei Meth den eines Pseudoprodukts. Diese Beträge dürfen nicht ohne Ertragsumrechnung als Kosten einer verkauften Einheit interpretiert werden. Das Projekt speichert keine vollständige einheitliche Herstellkostenrechnung.

| Lokales Produkt     | Preisbasis | buy_price | Basiseffekt | Rang     | Vergleich                                                           |
| ------------------- | ---------: | --------: | ----------- | -------- | ------------------------------------------------------------------- |
| og_kush             |        $35 |       $30 | calming     | SR I     | stimmt                                                              |
| sour_diesel         |        $35 |       $35 | refreshing  | SR IV    | Preise/Effekt stimmen; Rangkonflikt                                 |
| green_crack         |        $35 |       $40 | energizing  | HL II    | Preise/Effekt stimmen; Rangkonflikt                                 |
| granddaddy_purple   |        $35 |       $45 | sedating    | HL IV    | stimmt                                                              |
| low_quality_pesudo  |        $70 |       $60 | leer        | HL I     | Werte für Low-Quality Pseudo/Meth stimmen                           |
| pseudo              |        $70 |       $80 | leer        | H III    | Werte für Pseudo/Meth stimmen                                       |
| high_quality_pesudo |        $70 |      $110 | leer        | Bagman V | Werte für High-Quality Pseudo/Meth stimmen                          |
| cocaine             |       $150 |        $0 | leer        | H II     | Preisbasis/Effekt stimmen; Rang weicht ab; Kosten nicht verifiziert |

Cannabis-Samenpreise und Effekte: [Marijuana](https://schedule-1.fandom.com/wiki/Marijuana). Die $35 sind die Rechenbasis vor dem jeweiligen Effekt, nicht der Wiki-Marktpreis einer fertigen Sorte. Methwerte und Qualitätszuordnung Poor/Standard/Premium: [Shirley Watts](https://schedule-1.fandom.com/wiki/Shirley_Watts), [Meth](https://schedule-1.fandom.com/wiki/Meth). Cocaine: [Cocaine](https://schedule-1.fandom.com/wiki/Cocaine). Ein Cocaine-Kostenwert von $0 lässt sich daraus nicht als realer Herstellkostenwert bestätigen; die Quelle beschreibt mehrere Kostenbestandteile und verschiedene Erträge.

Die lokale Zuordnung Trash=0, Poor=1, Standard=2, Premium=3, Heavenly=4 stimmt mit den [Quality IDs](https://schedule-1.fandom.com/wiki/Console) überein. Die drei Pseudo-Einträge sind den passenden Qualitäten zugeordnet. `n_a=-1` bei Cannabis und Cocaine sagt lediglich, dass der Rechner keine Qualität festlegt; diese Produkte besitzen im Spiel Qualitätsstufen. [Quality](https://schedule-1.fandom.com/wiki/Quality)

## Nicht automatisch auflösbare Wikikonflikte

| Thema                     | Lokaler Stand                                                            | Widersprüchliche Belege                                                                                                                                                                                                                                                                                          | Bewertung                                                                                 |
| ------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Banana + Cyclopean        | [Energizing](C:/Users/timra/git/schedule1_calc/src/lookup/lookup.py:296) | [Banana](https://schedule-1.fandom.com/wiki/Banana) und [Ingredients](https://schedule-1.fandom.com/wiki/Ingredients): Thought-Provoking; [Effects-Matrix](https://schedule-1.fandom.com/wiki/Effects) und [historische Datei-Analyse](https://scheduleonemixer.com/how-mixing-in-schedule-1-works): Energizing. | Lokaler Wert wird von zwei Referenzen gestützt. Ohne aktuellen Spieltest keine Korrektur. |
| Sour Diesel Freischaltung | SR IV                                                                    | [Sour Diesel](https://schedule-1.fandom.com/wiki/Sour_Diesel_%28Marijuana%29) und Sortentabelle: IV; [Ranks](https://schedule-1.fandom.com/wiki/Ranks) und Marijuana-Infobox: V.                                                                                                                                 | Offen.                                                                                    |
| Green Crack Freischaltung | HL II                                                                    | [Green Crack](https://schedule-1.fandom.com/wiki/Green_Crack_%28Marijuana%29): II; [Ranks](https://schedule-1.fandom.com/wiki/Ranks): III.                                                                                                                                                                       | Offen.                                                                                    |
| Shrooms Preisbasis        | fehlt                                                                    | [Shrooms](https://schedule-1.fandom.com/wiki/Shrooms): $65; [Drugs](https://schedule-1.fandom.com/wiki/Drugs): $100.                                                                                                                                                                                             | Produktlücke belegt, einzutragender Preis offen.                                          |

Auch die Effects-Matrix ist keine zuverlässige alleinige Transformationsquelle: Beispielsweise steht dort Focused + Flu Medicine → Bright-Eyed, während Ingredients und die historische Datei-Analyse → Calming nennen und damit dem lokalen Datensatz entsprechen. Die getrennte Ingredients-Liste war deshalb die Hauptreferenz für die 114 Einzelregeln; die Matrix wurde zum Erkennen von Konflikten verwendet.

## Für das Code-Review bestätigte und offene Spielregeln

**Rundung:** Das Wiki beschreibt eine Rundung auf ganze Dollar. Das dortige Meth-Beispiel Gasoline → Cuke → Mouth Wash → Banana endet rechnerisch bei $148.40, angezeigt $148. Die konkrete Behandlung exakter Halbdollarwerte folgt daraus nicht. Das ist ein Beleg gegen das unveränderte Ausgeben beliebiger Centbeträge, aber keiner für eine bestimmte `.5`-Rundungsmethode. [Effects: Usage](https://schedule-1.fandom.com/wiki/Effects)

**Acht Effekte:** Die Regelbeschreibung des Wiki-verlinkten Rechnerteams nennt höchstens acht Effekte und ergänzt den Standard-Effekt nach den Ersetzungen nur bei freiem Platz. Der Rechner weist heute selbst auf seinen Umzug und die fehlende weitere Wartung dieses Angebots hin. Die Regel ist damit durch Community-Spielmodell-Dokumentation belegt, nicht durch einen aktuellen Spieltest dieses Reviews. [How Mixing Works](https://schedule1-calculator.com/howitworks)

**Kollisionen und Reihenfolge:** Die historische Datei-Analyse beschreibt das Hinzufügen des Basis-Effekts vor der Transformation; die andere Rechnerdokumentation beschreibt ihn danach. Aus der Übereinstimmung der 114 Einzelregeln folgt nicht, welche Effekte bei bereits vorhandenem Ersetzungsziel, wiederholtem Donut oder erreichter Effektgrenze erhalten bleiben. Solche Fälle benötigen konkrete Regressionsexempel gegen eine festgelegte aktuelle Spielversion. Keine dieser Fragen wurde als sicherer neuer Sollwert in die Daten geschrieben.

## Empfohlene nächste Schritte

1. **Erledigt am 10.09.2026:** Die Rangabweichungen von Mega Bean und Cocaine wurden als [getrennte Datenkorrektur](2026-09-10-rank-corrections.md) übernommen. Die Suche erzwingt weiterhin keinen Produktrang; diese bestehende Verhaltensgrenze wurde geprüft und dokumentiert.
2. Eine unterstützte Spielversion festlegen und gezielte Spieltests für die vier Wikikonflikte sowie Effektkollisionen durchführen.
3. Shrooms nach dieser Verifikation ergänzen; dabei den Umfang der Herstellkostenrechnung ausdrücklich definieren.
4. Herkunft, Spielversion und letztes Prüfdatum bei künftigen Spieldatenänderungen dokumentieren. Die Anwendungsdatei `VERSION` ersetzt diese Herkunftsangabe nicht.

Die verbleibenden Punkte sind Review-Empfehlungen und noch nicht ausgeführte Datenänderungen.

# DESIGN.md — Best Mix Calculator (Webapp)

**Stand: 12. September 2026** · Gilt für `webapp/`.

Diese Datei hält die Produktidentität und die begründeten Entscheidungen fest. Die allgemeinen
Qualitätsanforderungen stehen in [FRONTEND_STYLEGUIDE_v2.1.md](FRONTEND_STYLEGUIDE_v2.1.md), die
technische Wahrheit in [`webapp/static/css/tokens.css`](../static/css/tokens.css). Werte werden
hier **nicht** dupliziert; nur Rollen, Gründe und Prüfergebnisse.

## 1. Designbrief

| Frage                        | Festlegung                                                                                                                    |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Wer benutzt die Oberfläche?  | Spieler von Schedule I, die eine Mischung optimieren wollen. _Annahme_ — keine Nutzungsdaten vorhanden.                       |
| Hauptaufgabe                 | Für Level, Produkt und Kombinationsgröße die beste Mischung finden; alternativ eine eigene Rezeptreihenfolge nachrechnen.     |
| Häufigkeit und Geräte        | Gelegentlich, oft neben dem laufenden Spiel. Desktop und Handy. _Annahme._                                                    |
| Teuerster Fehler             | Ein Näherungsergebnis für bewiesen optimal halten, oder `Sell Price` mit `Profit` verwechseln und mit Verlust verkaufen.      |
| Woran erkennt man den Erfolg | Ein Ergebnisblock mit eindeutig beschrifteten Zahlen, hervorgehobenem Profit und einem Badge, das Beweis von Näherung trennt. |

Daraus folgen die beiden wichtigsten Gestaltungsentscheidungen: **Profit ist die Leitzahl** und
**der Optimalitätsstatus ist kein Fließtext, sondern ein Badge an der Ergebniskarte**.

## 2. Vier Entscheidungsfelder

| Feld             | Festlegung                                                                                                                                                                                                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Typografie**   | System-UI für Bedienung und Fließtext, Monospace mit `tabular-nums` für **jede Zahl, jeden Chip und jedes Badge**. Labels klein, versal, leicht gesperrt — dort sitzt der Terminal-Charakter. Kein Webfont: offlinefähig, keine externe Abhängigkeit, keine CSP-Änderung. |
| **Farbe**        | Dunkler Grund als Standard, ein einziger Akzent (Acid Green). Grundstimmung ruhig und technisch; Farbe trägt nie allein eine Bedeutung.                                                                                                                                   |
| **Raum**         | Abstandsskala 4–64px. Dicht, aber nicht gedrängt: Zusammengehöriges teilt Kanten, Gruppen trennen Abstände statt zusätzlicher Linien. Zwei Spalten ab 900px (Eingabe links, Ergebnis rechts), darunter eine Spalte.                                                       |
| **Ausarbeitung** | Kleine Radienfamilie (4/6/10px, Pille für Chips). Tiefe entsteht über Flächenhelligkeit und Haarlinien, nicht über Schatten — im hellen Theme genau ein sehr weicher Kartenschatten. Bewegung nur als Zustandsrückmeldung.                                                |

## 3. Referenzen

**Übernommen von TUI-Werkzeugen (htop, lazygit):** Monospace-Kennzahlen in ausgerichteten Spalten,
dichte Zeilen, eine Statuszeile, die den Zustand benennt statt ihn zu färben.

**Übernommen von Linear:** Flächenhierarchie über feine Konturen und Helligkeitsstufen statt
Schatten; genau ein Akzent, der für Aktion und Auswahl reserviert bleibt.

**Ausdrücklich nicht gewünscht:**

1. **CRT-Nostalgie** — Scanlines, Glow, `text-shadow`, Flacker- oder Tippanimationen. Der
   Terminal-Charakter kommt aus Schrift, Dichte und Labels, nicht aus Effekten.
2. **Farbe als einziger Bedeutungsträger** und dekorative Vollflächenverläufe. Jeder Status trägt
   zusätzlich Text; jede Fläche hat eine Aufgabe.

## 4. Akzent ist nicht Erfolg

Der Fallstrick dieser Richtung: Grün ist hier die **Akzentfarbe** (Aktion, Auswahl, Fokus,
Profit). Deshalb kodiert Grün **keinen Statuszustand**. Die Statusrollen sind:

| Zustand                        | Träger                                                                                    |
| ------------------------------ | ----------------------------------------------------------------------------------------- |
| Optimalität bewiesen           | Badge `badge--proven`, Akzentkontur **plus** der Text „Optimality proven".                |
| Näherung                       | Badge `badge--approximate`, Amber **plus** der vollständige Warnsatz.                     |
| Fehler / Abbruch ohne Ergebnis | `alert--error`, roter linker Balken **plus** der Fehlertext und „No result was produced." |
| Profit                         | Akzentfläche **plus** das Label `Profit` und die größte Zahl der Karte.                   |

Kein Zustand ist allein an seiner Farbe erkennbar. Das erfüllt WCAG 1.4.1 und hält Akzent und
Status sauber getrennt.

## 5. Themes

Effekt-Chips verwenden zusätzlich die belegten Label-Farben aus den Spieldaten: ein Farbpunkt
in der Originalfarbe und eine dezente Tönung von Fläche und Kontur. Der lesbare Name bleibt in
`--text-primary`, damit auch sehr helle oder dunkle Spielfarben in beiden Themes funktionieren.
Diese Farben sind fachliche Metadaten in `src/lookup/lookup.py`, keine zweite Designpalette.
`tokens.css` bleibt die Quelle für Oberflächen, Text und alle übrigen Gestaltungsrollen.
Quelle, Abgleich mit dem Wiki und Grenzen stehen im
[Farbabgleich vom 12.09.2026](../../docs/reviews/2026-09-12-effect-colors.md).

Dunkel ist der Standard (`:root`). Hell überschreibt dieselben semantischen Rollen — eine
Komponente, zwei Wertesätze, keine parallele Implementierung. Auflösung:

- Kein Attribut oder `data-theme="system"` → Systemvorgabe über `prefers-color-scheme`.
- `data-theme="light"` / `data-theme="dark"` → ausdrückliche Wahl, gewinnt in beide Richtungen.

Die Wahl liegt in `localStorage` unter `schedule1-theme` (Wert `light`/`dark`; „System" löscht den
Eintrag). Ein vierzeiliges Inline-Skript im `<head>` setzt das Attribut vor dem ersten Paint, damit
das falsche Theme nicht aufblitzt; [`theme.js`](../static/js/theme.js) besitzt nur das Bedienelement.

**Wichtig:** `#9dff6b` ist auf Weiß unlesbar. Das helle Theme verwendet für `--action-primary`
deshalb ein dunkles Blattgrün mit weißer Schrift. Die Rolle bleibt, der Wert wechselt.

## 6. Zustände

| Ablauf          | Umgesetzte Zustände                                                                                                                                                                                                                           |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Suche           | Leer (erklärt exact vs. fast) · Katalog lädt · Suche läuft (Fortschrittstext mit Tiefe/Operationen, Fortschrittsbalken, `Cancel Search`) · Ergebnis bewiesen · Ergebnis approximativ · Abgebrochen · Fehler · Browser ohne Worker.            |
| Rezept          | Tab noch nicht geöffnet · Daten laden · geladen mit leerem Rezept (zeigt das Basisprodukt) · Ergebnis · Rechenfehler · Ladefehler mit `Retry Loading`.                                                                                        |
| Wunscheffekte   | Katalog laden · Filter ohne Treffer · leere/erhaltene Auswahl · Suche läuft/Abbruch · exakt passendes Rezept · bewiesen kein Rezept innerhalb der Einstellungen · Fast ohne Treffer, ohne Unmöglichkeitsbeweis · Ressourcenlimit ohne Rezept. |
| Nicht anwendbar | Kein Login, keine Berechtigungen, kein Autosave, keine destruktiven Serveraktionen. `Clear Recipe` ist lokal; `Undo clear` stellt die zuletzt geleerte Folge einschließlich Wiederholungen wieder her.                                        |

Eingaben bleiben in **jedem** Fehlerfall erhalten; `#result` ist eine `aria-live="polite"`-Region,
Fehler tragen zusätzlich `role="alert"`.

## 7. Bewegungsvertrag

Bewegung ist bewusst minimal, weil Suche und Rezeptbearbeitung wiederholte Bedienung sind.

- **Buttons, Tabs, Controls:** Farb- und Konturwechsel über `--motion-fast` (90 ms). Kein Scale.
- **Tabwechsel:** kein räumlicher Übergang — sofortiger Zustandswechsel.
- **Fortschritt:** ein schmaler indeterminierter Balken im Busy-Block. Er ist `aria-hidden`; die
  Information steht im Text daneben.
- **Bewusst nicht animiert:** Ergebniskarten, Rezeptzeilen, Theme-Wechsel, Chips.
- `prefers-reduced-motion: reduce` setzt Transitions und Animationen auf 1 ms und ersetzt den
  laufenden Balken durch einen statischen. Es geht dabei keine Information verloren.

## 8. Gemessene Kontrastpaare

Berechnet aus den tatsächlich gesetzten Tokenwerten inklusive Alphamischung der `*-quiet`-Flächen
(WCAG-Formel). Textziel 4,5:1, Nicht-Text-Ziel 3:1.

| Paar                                         | Dunkel | Hell  |
| -------------------------------------------- | ------ | ----- |
| text-primary / surface                       | 15,58  | 17,99 |
| text-secondary / surface                     | 8,60   | 8,12  |
| text-muted / surface                         | 6,09   | 5,99  |
| text-muted / ground (Footer)                 | 6,50   | 5,51  |
| text-primary / sunken (Chips, Werte)         | 17,03  | 15,73 |
| Primärbutton: ink / accent                   | 15,39  | 6,50  |
| Aktiver Tab: accent / ground                 | 15,67  | 5,97  |
| Inaktiver Tab: secondary / ground            | 9,18   | 7,47  |
| Badge „proven": accent / accent-quiet        | 10,89  | 5,61  |
| Badge „approximate": warn / warn-quiet       | 8,38   | 6,13  |
| Alert-Text / danger-quiet auf ground         | 14,18  | 14,56 |
| Profitwert / accent-quiet                    | 11,56  | 15,55 |
| **Nicht-Text (Ziel 3:1)**                    |        |       |
| Fokusring / surface                          | 14,67  | 6,50  |
| Fokusring / ground                           | 15,67  | 5,97  |
| Control-Kontur `border-strong` / surface     | 3,54   | 4,01  |
| Control-Kontur `border-strong` / Feldfüllung | 3,87   | 3,51  |
| Fehlerkontur `status-danger` / ground        | 8,00   | 6,01  |
| Fehlerkontur / danger-quiet auf ground       | 6,82   | 5,29  |

`--border-subtle` liegt bewusst darunter (dunkel 2,04 gegen Ground, hell 1,47). Es ist ein
dekorativer Trenner zwischen Flächen, die sich zusätzlich durch ihre eigene Füllung unterscheiden —
kein Merkmal, das ein Bedienelement identifiziert. Bedienelementgrenzen verwenden ausschließlich
`--border-strong`.

Am 12.09.2026 unabhängig nachgerechnet. Die Alert-Werte berücksichtigen jetzt den tatsächlichen
Hintergrund `ground`: Ergebniscontainer haben keine eigene Füllung. Die frühere Tabelle hatte
die transparente Fehlerfläche fälschlich über `surface` gemischt. Die Korrektur ändert das
Kontrasturteil nicht; alle hier geprüften aktiven Text- und Nicht-Text-Paare erreichen ihr Ziel.

## 9. Prüfungen

### Von Claude dokumentierte Vorprüfung

Die folgenden Angaben stammen aus Claudes ursprünglichem Arbeitsstand, lokal unter
`http://localhost:5011`, Chromium im Browser-Pane. Sie sind kein Nachweis für spätere Änderungen:

- Suche `fast` und `exact` bis zum Ergebnis; Ergebniskarten in beiden Themes betrachtet.
- Fehlerfall erzwungen (Kombinationsgröße 20): `role="alert"`, roter Alert, Eingaben erhalten,
  Submit wieder bedienbar, Cancel verborgen.
- Rezept-Tab: drei Zutaten hinzugefügt, Zeilen und Ergebniskarte geprüft.
- Reflow bei **320 px**: `scrollWidth == clientWidth`, kein überlaufendes Element.
- Tastatur: Tab-Reihenfolge bis zu den Selects; Fokusring gemessen als `2px solid #9dff6b`,
  Offset 2px, `:focus-visible` greift.
- Theme-Umschalter: Attribut, `localStorage`, `aria-checked` und Roving-`tabindex` bleiben über
  alle vier Wechsel synchron; „System" löscht den Eintrag; gespeicherte Wahl überlebt den Reload
  und schlägt die Systemvorgabe.
- Kontrast: alle Paare aus Abschnitt 8 rechnerisch aus den Tokens bestimmt.
- `tools/project.py test` (162 Tests) und `tools/project.py check` grün.

### Unabhängige Fortsetzung am 12.09.2026

Der Abgleich mit Claudes Plan „Redesign der Webapp — Richtung Terminal“, die bewussten
Abweichungen und die aktuellen Prüfnachweise stehen im
[Reviewbericht](../../docs/reviews/2026-09-12-terminal-review.md).

Die Suchansicht führt jetzt mit der Profitkarte und bietet den höchsten Modifier als nativen,
aufklappbaren Vergleich an. Innerhalb beider Karten stehen Profit und Preise vor der nummerierten
Zutatenfolge und den Effekten. Das Suchformular startet mit drei maximalen Zutaten und erläutert,
dass auch kürzere Rezepte erlaubt sind. Die kurzen Modusnamen erhalten einen eigenen Erklärungstext.

Die Suche verwendet auf breiten Bildschirmen fünf Spaltenanteile für Eingaben und sieben für das
Ergebnis. Beim manuellen Rezept bleibt die größere Eingabespalte; das Ergebnis bleibt beim Scrollen
daneben sichtbar. Sprunglinks verbinden lange Zutatenlisten mit ihrem Ergebnis. Auf kleinen
Bildschirmen entfallen der zusätzliche Introblock und große Nebenkennzahl-Kacheln. Theme- und
Rezeptaktionen haben mindestens 44 px Höhe. `Undo clear` gilt bis zur nächsten Rezeptänderung und
setzt den Fokus nach Wiederherstellung auf die erste Zutat.

**Weiterhin nicht geprüft / offene Lücken:**

- Keine Prüfung mit echter assistiver Technik (Screenreader-Ausgabe nur aus dem Markup abgeleitet).
- Kein Test auf einem realen Mobilgerät; Touch nur über die Viewport-Emulation betrachtet.
- `prefers-reduced-motion: reduce` ist im CSS umgesetzt, konnte im Pane aber nicht emuliert und
  daher nicht gerendert beobachtet werden.
- Textvergrößerung auf 200 % wurde nicht separat gemessen; geprüft wurde nur der Reflow bei 320 px.

## 10. Umfang und Fachvertrag

Watchdog-Budgets, der ARIA-Tabvertrag, die zentrale Preisberechnung und die Datenquelle bleiben
erhalten. Die Suchansicht behält ihre Element-IDs. Die ausdrücklich freigegebene neue
Zutatenauswahl ersetzt dagegen die manuellen Zutaten-Selects und deren DOM-Struktur; die
zugehörigen UI-Tests prüfen den neuen Bedienvertrag.

Auf den zusätzlichen Nutzerbericht zu wirkungslosen Zutaten wurde der fachliche Auftrag erweitert:
Bei exakt gleichem Modifier gewinnt zuerst der höhere Profit, danach das kürzere Rezept. Eine
kostenpflichtige oder kostenlose Wiederholung ohne Änderung der vollständigen geordneten
Effektfolge wird nicht weiter verlängert. Sie bleibt als zulässiger Ein-Schritt-Kandidat verfügbar.
Der [Suchvertrag](../../docs/SEARCH_MODES.md) beschreibt die Begründung und Grenzen. Die exakte
Suche liefert weiterhin nur bewiesene Gewinner oder kein Ergebnis; eigene Rezepte behalten jeden
explizit eingegebenen Schritt.

`webapp/js/script.js` ist eine ungenutzte Altkopie aus der Zeit der Serverberechnung und gehört
nicht zu diesem Auftrag.

## 11. Zutatenregal und Drag-and-drop

Der Nutzer hat am 12.09.2026 Konzept 1 aus drei bedienbaren Entwürfen ausgewählt: ein sichtbares
Zutatenregal, ergänzt um sauberes Drag-and-drop. Die Texteingabe und ein permanentes Brett mit
Einfügeknöpfen zwischen allen Schritten sind nicht Teil dieser Umsetzung.

- Jede Kachel zeigt den lesbaren Namen und den Zutatenpreis aus dem bestehenden Katalog. Ein
  Klick fügt einen Schritt am Ende an; wiederholte Klicks ergeben wiederholte Schritte. Die
  Kachel bleibt fokussiert. Eine Kachel ist keine Checkbox und kein Mengenregler.
- Auf ausdrücklichen Nutzerwunsch entfallen zusätzliche Insert-/Replace-Aktionen und Drag-Griffe.
  Ganze Kacheln und ganze Rezeptschritte sind ziehbar. Die nummerierte Rezeptliste zeigt Namen
  und ausschließlich eine sichtbare Aktion zum Löschen. Preise stehen im Zutatenregal und als
  Gesamtkosten im Ergebnis, nicht zusätzlich in jedem Mischschritt.
- Beim Hinzufügen wird die Zutat aus dem Regal
  kopiert, beim Verschieben ein vorhandener Schritt versetzt. Eine Einfügelinie zeigt das Ziel.
  Die geordnete Zutatenfolge und das berechnete Ergebnis ändern sich erst beim gültigen Loslassen.
- Eine Kopie folgt unmittelbar dem Zeiger am ursprünglichen Anfasspunkt. Es gibt keine Feder,
  dekorative Nachbewegung oder automatische Sortierung. Scrollen am Fensterrand unterstützt
  lange Rezepte. Normales Wischen über Kacheln bleibt Seitenscrollen; auf Touchscreens startet
  Ziehen nach kurzem Halten. Es gibt keine flächige Scrollsperre auf Regal und Rezept.
- Loslassen außerhalb des Rezeptbereichs, Escape und unterbrochene Zeigereingaben verwerfen den
  Ziehvorgang. Kacheln lassen sich per Klick oder Enter anhängen; Alt + Pfeil hoch/runter
  verschiebt den fokussierten Rezeptschritt. Einfügen mit einem einzelnen Zeiger erfolgt
  entsprechend dem Nutzerwunsch ausschließlich durch Ziehen; zusätzliche Positionsknöpfe entfallen.
- Die vorhandene Rücknahme von Clear stellt die exakte Reihenfolge wieder her. Basisprodukt,
  Zutatenregal, Mischfolge und Ergebnis bleiben visuell und semantisch getrennt.

Die Implementierung orientiert sich bei Zeigerbindung und Abbruch an
[Pointer Events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events) und
[setPointerCapture](https://developer.mozilla.org/en-US/docs/Web/API/Element/setPointerCapture)
(geprüft am 12.09.2026). Für die Trennung zwischen Scrollen und Ziehen ohne Griffe ist außerdem
der dokumentierte Unterschied zwischen
[Pointer-Sensoren](https://dndkit.com/legacy/api-documentation/sensors/pointer/) und
[Touch-Sensoren](https://dndkit.com/legacy/api-documentation/sensors/touch/) relevant: Eine
Scrollsperre lässt sich nicht nachträglich über `touch-action` in einer laufenden Pointer-Geste
aktivieren. Die Umsetzung verwendet keine zusätzliche UI-Bibliothek.

### Prüfung der Umsetzung am 12.09.2026

- `tools/project.py test`: 165 Tests bestanden, einschließlich der eingebundenen
  JavaScript-Suiten. Die gezielte Rezept-UI-Suite hat 11 bestandene Fälle für Regal,
  Reihenfolge, Abbruch, Fokus und Touch-Ereignisse.
- Im lokalen Chromium-Pane geprüft: ganze Kacheln in das leere Rezept ziehen,
  Schritte ohne Griff verschieben, Einfügen zwischen Schritten, Loslassen außerhalb
  verwerfen sowie Hinzufügen per Enter und Umsortieren per Alt + Pfeiltaste.
- Ein Rezept mit 14 Schritten einschließlich Wiederholungen bleibt nach Clear und
  Undo clear in identischer Reihenfolge erhalten. Die Zutatenkosten betragen für die
  geprüfte Folge 36,00 $. Löschen fokussiert einen benachbarten Schritt beziehungsweise
  nach dem letzten verbleibenden Schritt wieder die erste Regalkachel.
- Die Rezeptliste zeigt ausschließlich Delete als Aktion pro Schritt. Regal und Liste
  wurden bei 320 px in Light und Dark ohne horizontalen Überlauf geprüft; die breite
  Ansicht wurde bei 1440 px betrachtet. Nach abgeschlossenen Ziehvorgängen bleibt
  keine Ziehkopie im DOM zurück.

Touch-Halten, Wischen vor der Aktivierung, unterbrochene Gesten und verzögerte Klicks
sind durch simulierte Ereignisse geprüft. Ein reales Touchgerät, Screenreader,
200-%-Textvergrößerung und gerenderte Reduced-Motion-Emulation bleiben ungeprüft.

## 12. Reduzierte Bedienoberfläche

Auf Nutzerwunsch vom 12.09.2026 beginnt die Oberfläche direkt mit den beiden Rechner-Tabs.
Der Werbe-Introblock, technische Kopf-/Fußzeilen und der wiederholte Einführungstext des
Rezept-Tabs entfallen. „Max ingredients“ benennt die Suchgrenze ohne zusätzlichen Hilfsabsatz.
Die Mischfolge zeigt nur Schritt, Zutatenname und Delete.

Exact und Fast bilden einen Zweifach-Schalter mit nativen Radio-Inputs. Ein gemeinsamer Hinweis
darunter nennt die garantierte beziehungsweise ungefähre Suche und das Zeitlimit. Der Hinweis
ändert sich beim Wechsel nicht und wird im leeren Ergebnis nicht wiederholt. Die Auswahl bleibt
per Tab und Pfeiltasten bedienbar; der gewählte Modus wird beim Suchstart übernommen.

Produkt und Rang behalten native Select-Semantik mit gemeinsam gestalteten Feldern, Pfeilen,
Fokuszuständen und — in unterstützenden Browsern — geöffneten Optionslisten. Die CSS-Erweiterung
`appearance: base-select` wird über `@supports` aktiviert. Ältere Browser behalten ihre native
Optionsliste und den gestalteten geschlossenen Auswahlschalter. Grundlage:
[MDN: Customizable select elements](https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Forms/Customizable_select),
geprüft am 12.09.2026. Eine zusätzliche JavaScript-Dropdown-Bibliothek ist dafür nicht nötig.

### Verifikation

`tools/project.py test` bestand mit 165 Tests; die gezielten Such- und Rezept-UI-Suiten
bestanden mit 8 beziehungsweise 11 Fällen. Die Moduswahl wird beim Submit festgehalten,
einschließlich des zugehörigen Watchdog-Budgets; eine spätere Wahl verändert die laufende
Suche nicht. Die HTML-Prüfungen decken den gemeinsamen Hinweis und die erhaltene Fast-Wahl
nach einem Validierungsfehler ab.

Im lokalen Chromium-Pane wurden Exact und Fast für Green Crack, Max und drei Zutaten bis
zum passend gekennzeichneten Ergebnis ausgeführt. Native Pfeiltasten wechseln den Modus;
Produkt-/Ranglisten lassen sich per Tastatur auswählen und mit Escape schließen. Light und
Dark wurden bei 320 px betrachtet, ebenso das Desktopformular bei 1280 px. Der lange Name
„Meth (High-Quality Pseudo)“ wird geschlossen mit Auslassungspunkten dargestellt und bleibt
in der geöffneten Liste vollständig lesbar. Es gibt keinen horizontalen Seitenüberlauf.
Die Mischfolge ohne Preise wurde erneut gezogen; die Browserkonsole meldete keine Fehler
oder Warnungen. Touchgeräte, Screenreader und die native Fallback-Liste in einem Browser
ohne `base-select` wurden nicht separat geprüft.

## 13. Wunscheffekte und Beschreibungen

**Match Effects** ist der dritte gleichrangige Reiter. Jede Effektkarte trägt Spielfarbe,
Name, kurze Erklärung und einen kompakten Dreierschalter **Want / Neutral / Avoid**. Native
Radiogruppen erhalten die Tastaturbedienung; die sichtbaren Segmente ersetzen die einzelnen
Checkboxen. Gewünscht verwendet die vorhandene Aktionsfarbe, ausgeschlossen die vorhandene
Gefahrenfarbe; Text und markiertes Segment machen den Zustand auch ohne Farberkennung klar.
Die Karte selbst schaltet keinen Zustand durch, damit ein Klick immer eine eindeutige Wahl trifft.

**Recipe match** steht direkt über der Auswahl: **Only these** verlangt genau die Wunscheffekte,
**Allow extras** erlaubt weitere neutrale Effekte. Ausgeschlossene Effekte fehlen in beiden
Fällen im Ergebnis. Ein Textfilter reduziert die Liste, ohne ausgeblendete Auswahlen zu löschen.
Unter der Liste bleiben Wunsch-/Ausschlussanzahl und einzeln entfernbare Auswahlchips sichtbar.
Ein Moduswechsel bewahrt diese Präferenzen, verwirft jedoch ein veraltetes Ergebnis und beendet
eine laufende Suche. Bei **Allow extras** ist auch eine reine Ausschlussliste gültig.

Das Ranking steht bei den Rezepteinstellungen: möglichst wenige Schritte, danach niedrige Kosten.
**Exact / Fast** bleibt davon getrennt. Ein Fast-Treffer erfüllt immer die Effektbedingungen,
garantiert jedoch nicht das kürzeste oder günstigste Rezept. Die Resultate bewahren dieselbe
Kartenstruktur.

Unter allen Ergebniskarten stehen Beschreibungen in einem nativen `details`-Element
„What these effects do“. Der geschlossene Zustand hält das Rezept kompakt; Erklärungen sind
per Klick, Touch und Tastatur erreichbar und nicht an Hover gebunden. Unbekannte Metadaten
erzeugen keine leeren Erklärungszeilen. Die Quellen sind im
[Beschreibungsabgleich](../../docs/reviews/2026-09-12-effect-descriptions.md) dokumentiert.

Am Desktop steht die Effektauswahl zuerst links, Einstellungen und Ergebnis stehen rechts.
Auf schmalen Bildschirmen folgt dieselbe Reihenfolge untereinander. Die filterbare Liste hat
eine begrenzte Scrollhöhe mit ruhiger vertiefter Fläche und einer schmalen, themengerechten
nativen Scrollleiste. Fokus, Tastatur-Scrollen und das automatische Sichtbarwerden fokussierter
Controls bleiben erhalten. Auswahltext, Chips und Clear bleiben außerhalb dieser Liste. Die drei Tabs
bleiben auch bei 320 px in einer Zeile mit gegebenenfalls mehrzeiligem Label.

Die Abnahme einschließlich Tastaturbedienung, Light/Dark, 320 px und 175 bestandener Tests ist
im [Suchvertrag](../../docs/SEARCH_MODES.md#verifikation-der-effektsuche-am-12092026) dokumentiert.

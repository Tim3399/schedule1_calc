# Frontend Styleguide

**Version 2.1 · Stand: 12. September 2026**

**Leitbild:** Produktoberflächen sollen bewusst gestaltet, verständlich, eigenständig und verlässlich sein. Gestaltung erleichtert die Aufgabe, bewahrt den Arbeitskontext und erklärt den Zustand. Dekoration ist erlaubt, aber kein Ersatz für diese Leistungen.

Diese Fassung integriert den bisherigen Frontend-Styleguide, die Emil-Ergänzung sowie ausgewählte Prinzipien aus `apple-design` und Apples Originaldokumentation. Sie **ersetzt den bisherigen `FRONTEND_STYLEGUIDE.md` und `STYLEGUIDE_ERGAENZUNG_EMIL.md` als gemeinsame Regelquelle**. Sie ist eine eigenständige Synthese, kein offizieller Guide von Apple, Emil Kowalski oder designmotionhq.

**Verwendung:** Allgemeine Qualität hier; konkrete Produktidentität und begründete Abweichungen im vorhandenen projektbezogenen `DESIGN.md`; technische Wahrheit in den tatsächlich verwendeten Tokens und Komponenten. Der Guide verlangt weder einen bestimmten Stack noch eine universelle Palette oder einen Apple-Look. Fehlt ein `DESIGN.md`, zuerst vorhandene gleichwertige Projektquellen verwenden; keine konkurrierende Dokumentation anlegen.

**Verbindlichkeit:** **MUSS** bezeichnet eine Qualitätsanforderung dieses Guides. **SOLL** ist ein begründbar abweichbarer Standard. **KANN** ist eine Gestaltungsoption. Nicht jede MUSS-Regel ist eine gesetzliche oder normative Forderung; WCAG-Kriterien werden ausdrücklich benannt. Zahlen ohne Normverweis sind Startwerte, keine nachgewiesenen Optima.

## Einstieg für Agents

Zuerst diesen Einstieg, Abschnitt 1 und die Definition of Done in Abschnitt 12 lesen. Anschließend die zur Aufgabe passenden Abschnitte und die bestehenden Projektquellen hinzunehmen. Bei einer kleinen Korrektur weder einen Voll-Audit noch ein Redesign auslösen. Quellen nur vertiefen, wenn eine fachliche Aussage, neue Technik oder ein Konflikt überprüft werden muss.

**Kurzvertrag:** Bestehendes wiederverwenden; Hauptaufgabe und Arbeitskontext schützen; Normal- und relevante Fehlerzustände abdecken; Bewegung begründen; Zugänglichkeit und beide vorhandenen Themes prüfen; nur tatsächlich ausgeführte Prüfungen als Nachweis nennen. Ein Skill ändert weder diese Qualitätsanforderungen noch die Freigabegrenzen des Auftrags.

| Aufgabe | Vertiefend lesen |
|---|---|
| Neues Produkt / neue Designrichtung | 2–4, 6 und 12; 7–11 nach betroffenen Abläufen. |
| Farbe, Typografie, Light/Dark, Materialien | 3, 10, 11. |
| Neue Komponente / Design-Dateistruktur / öffentliche UI-API | 7, 10.3–10.6 und 12; bestehende Architekturquellen zuerst. |
| Navigation, Inspector, Arbeitsbereichwechsel | 4, 7, 8, 11. |
| Bewegung, Drag, Tooltip, Overlay | 5, 7, 10, 11. |
| Formulare, Speichern, Fehler, Löschaktionen | 7–9, 11. |
| Offene Designfrage / Variantenvergleich | 2–4 und Abschnitt 12, Schritt 3. |
| Umfassender UI-Audit | 1–12; Tiefe nach beauftragtem Umfang. |

| Orientierung | Inhalt |
|---|---|
| [1. Priorität](#s01) · [2. Identität](#s02) | Bestehendes schützen; Produktabsicht und Charakter festlegen. |
| [3. Visuelles System](#s03) · [4. Komposition](#s04) | Typografie, Farben, Materialhierarchie, Navigation und Kontext. |
| [5. Bewegung](#s05) · [6. Sprache](#s06) | Direkte Reaktion, kontrollierbare Übergänge und konkrete Texte. |
| [7. Komponenten](#s07) · [8. Zustände](#s08) · [9. Formulare](#s09) | Vollständige Interaktionen und sichere Wiederherstellung. |
| [10. Umsetzung](#s10) · [11. Zugänglichkeit](#s11) · [12. Agent-Workflow](#s12) | Technische Grenzen, Nachtests, Prototypen und Abnahme. |
| [Einbindung](#einbindung) · [Übernahmegrenzen und Quellen](#quellen) | Referenz und kleiner Skill; fachliche Einordnung. |

<a id="s01"></a>
## 1. Priorität und Schutz bestehender Projekte

**Ein neues Feature ist keine Erlaubnis zum Redesign.** Vor Änderungen MUSS der Agent die tatsächlich verwendeten Designquellen und vergleichbare vorhandene Screens untersuchen. Maßgeblich sind nicht nur Konfigurationsdateien, sondern auch reale Komponentenverwendungen.

Für Konflikte gilt: notwendige Sicherheit und Zugänglichkeit zuerst; danach ausdrücklich freigegebene Projektanforderungen und Änderungsgrenzen; anschließend das bestehende Designsystem; zuletzt die allgemeinen Empfehlungen dieses Guides. Verletzt ein vorhandenes Muster eine Qualitätsanforderung, MUSS der Konflikt benannt und möglichst lokal behoben werden. Daraus folgt keine Freigabe für einen großflächigen Umbau.

**Bestehendes Projekt:** Farben, Größen, Abstände, Radien, Schatten, Symbole und Interaktionsmuster wiederverwenden. Neue Varianten nur für eine nachgewiesene Lücke ergänzen. Keine zweite Button-Familie, kein zusätzliches CSS-System und keine neue UI-Bibliothek für ein bereits gelöstes Problem.

**Neues Projekt:** Zuerst eine konkrete visuelle Richtung und ein kleines gemeinsames System festlegen; anschließend umsetzen. Nicht jede Komponente unabhängig nach Geschmack gestalten.

**Reines Restyling:** Geschäftslogik, Datenfluss, fachliche Bedeutung der Texte und bestehende Interaktionsverträge bleiben erhalten, sofern die Aufgabe keine Änderung verlangt. Verbesserungsbedarf außerhalb des Auftrags wird separat dokumentiert.

<a id="s02"></a>
## 2. Produktabsicht und visuelle Identität

Vor dem Entwurf MUSS ein kurzer Designbrief vorliegen: Wer benutzt die Oberfläche? Welche Hauptaufgabe wird erledigt? Wie häufig, auf welchen Geräten und unter welchen Bedingungen? Welcher Fehler wäre besonders teuer? Woran erkennt die Person den erfolgreichen Abschluss?

Fehlende Informationen werden als Annahmen gekennzeichnet. Ein Feature-Entwurf braucht keine ausführliche Markenstrategie; ein neues Produkt braucht aber mehr als „modern, clean, premium“.

Die Startseite von designmotionhq beschreibt visuellen Charakter über vier Entscheidungsfelder. Daraus übernimmt dieser Guide die Struktur, nicht eine feste Ausprägung.[^D00]

| Feld | Im `DESIGN.md` festlegen |
|---|---|
| Typografie | Charakter, Schriftrollen, Lesetext, Bedienoberfläche und Zahlen. |
| Farbe | Grundstimmung, Akzentrollen, Statusfarben und Themen. |
| Raum | Informationsdichte, Rhythmus, Inhaltsbreite und Gruppierung. |
| Ausarbeitung | Radien, Konturen, Tiefe, Symbole und Bewegungscharakter. |

**Charakter muss sich in Entscheidungen zeigen.** „Ruhig“ kann weniger konkurrierende Akzente und zurückhaltende Bewegung bedeuten. „Präzise“ kann ausgerichtete Zahlen, klare Zustände und kompakte Tabellen bedeuten. „Warm“ kann durch Typografie und abgestimmte Oberflächen entstehen, ohne jede Fläche beige einzufärben. Diese Übersetzungen sind Entwurfsmöglichkeiten, keine Pflichtrezepte.

Ein Schreibwerkzeug darf eine andere Dichte und Materialwirkung besitzen als eine Betriebsoberfläche. Eine Landingpage darf großzügiger sein als der zugehörige Arbeitsbereich. Zusammengehörigkeit entsteht durch gemeinsame Regeln, nicht durch überall identische Layouts.

**Keine Ersatzästhetik:** Linear ist eine mögliche Referenz für eine dichte, zurückhaltende Anwendung, kein universeller Zielzustand. Verläufe, Schatten und räumliche Effekte sind ebenfalls mögliche Ausdrucksmittel. Entscheidend ist ihre begründete Auswahl, nicht ihre pauschale Anwesenheit oder Abwesenheit.[^D03][^D53][^D76]

Das `DESIGN.md` SOLL zwei passende Referenzen mit übernommenen Eigenschaften und zwei ausdrücklich nicht gewünschten Eigenschaften enthalten. Keine bloße Sammlung schöner Screenshots: festhalten, was daran für dieses Produkt relevant ist.

### 2.1 Produktnutzen vor Oberflächenreduktion

Apples Designprinzipien behandeln Einfachheit, Handlungsspielraum, Vertrautheit und Sorgfalt als zusammenhängende Qualitäten. Daraus übernimmt dieser Guide keine feste Formensprache, sondern die folgenden Entscheidungsregeln.[^AP01]

**Aufwand reduzieren, nicht bloß Elemente zählen.** Ein zusätzliches Label, eine sichtbare Hauptaktion oder eine kontextnahe Erklärung kann eine Aufgabe einfacher machen. Häufig benötigte Werkzeuge dürfen nicht allein für einen aufgeräumten Screenshot versteckt werden.

**Kontrolle und Wiederaufnahme mitentwerfen.** Menschen sollen einen Nebenweg verlassen, Änderungen korrigieren und zur Arbeit zurückkehren können. Umfang und Grenzen von Undo, Abbruch und Wiederherstellung gehören zur Aufgabe, nicht erst zur späteren Ausarbeitung.

**Vertrautheit bewahren.** Gleich aussehende Controls verhalten sich konsistent. Plattformkonventionen werden auf die tatsächlich unterstützte Umgebung bezogen; die Position eines nativen macOS-Fensterknopfs ist kein pauschales Muster für alle Webdialoge.

**Charakter ergibt sich aus dem gesamten Ablauf.** Für ein ruhiges Werkzeug können zuverlässige Wiederaufnahme und klare Rückmeldung wertvoller sein als ein spektakulärer Effekt. Gewünschte Stimmung im `DESIGN.md` nennen und daran auch Fehlerzustände und Bewegung messen, nicht nur den Startbildschirm.

<a id="s03"></a>
## 3. Visuelles System

### 3.1 Hierarchie und Informationsgewicht

Jeder Aufgabenbereich SOLL einen erkennbaren Schwerpunkt besitzen. Titel, primäre Handlung, Arbeitsinhalt und ergänzende Metadaten dürfen nicht dieselbe Aufmerksamkeit beanspruchen. Größe, Gewicht, Abstand, Kontrast und Position werden gemeinsam eingesetzt; nicht jedes Problem verlangt eine weitere Akzentfarbe.[^D43]

„Eine primäre Handlung“ gilt pro zusammenhängender Aufgabe, nicht als Verbot mehrerer wichtiger Aktionen in einer komplexen Anwendung. Sekundäre und gefährliche Aktionen bleiben erkennbar, ohne mit dem normalen nächsten Schritt zu konkurrieren.

**Prüfung:** Ohne den Text vollständig zu lesen, sollten Zweck, Arbeitsbereich und nächster sinnvoller Schritt auffindbar sein. Danach muss auch die Detailinformation lesbar bleiben. Hierarchie darf nicht dadurch entstehen, dass notwendige Informationen unlesbar gemacht werden.

### 3.2 Typografie

Für Texte SOLLEN benannte Rollen existieren: Seitentitel, Abschnittstitel, Fließtext, Bedienelement, Beschriftung, Metadaten und numerische Information. Eine Rolle enthält nicht nur Schriftgröße, sondern auch Gewicht, Zeilenhöhe und gegebenenfalls Laufweite.

Für neue Projekte sind folgende Werte **eigene Startvorschläge**, die mit der gewählten Schrift und echten Inhalten überprüft werden müssen:

| Rolle | Möglicher Startwert | Entscheidungskriterium |
|---|---|---|
| Lesetext | `1rem`, Zeilenhöhe etwa `1.5–1.7` | Längeres Lesen ohne gedrängte Zeilen. |
| Bedien- und Hilfstext | `0.875–1rem` | Dichte, Schriftbild und Zielgruppe. |
| Abschnittstitel | `1.125–1.5rem` | Sichtbarer Abstand zur nächstkleineren Rolle. |
| Seitentitel | `1.75–2.5rem` | Inhalt und verfügbare Fläche, nicht bloße Größe. |
| Lesebreite | ungefähr `60–75ch` | Mit realer Sprache und Schrift prüfen. |

Diese Tabelle ist kein Grund, vorhandene Schriftgrößen umzuschreiben. Marken-, System- und Monospace-Schriften werden nach ihrer Aufgabe eingesetzt, nicht nach Trend. Eine zusätzliche Familie braucht einen erkennbaren Nutzen. Zahlenkolonnen können tabellarische Ziffern verwenden; lange deutsche Bezeichnungen und mehrzeilige Buttons müssen im Entwurf vorkommen.[^D17][^D63]

**Optische Abstimmung statt pauschaler Laufweite.** Größe, Gewicht, Zeilenhöhe und Laufweite SOLLEN als Textrolle gemeinsam geprüft werden. Große Überschriften benötigen nicht automatisch dieselbe Laufweite wie kleine Beschriftungen. Keine allgemeine Pflicht zu engeren Überschriften oder weiter gesperrter Kleinschrift: Schrift, Sprache und tatsächlicher Einsatz entscheiden. Der zugrunde liegende Zusammenhang wird in Apples Typografievortrag erläutert.[^AP04]

`font-optical-sizing: auto` KANN bei einer Schrift mit entsprechender Unterstützung deren optische Größenanpassung nutzen; die Eigenschaft ergänzt keine fehlende Schriftachse und ersetzt keine Sichtprüfung.[^M09]

**Vergrößerung mitentwerfen.** Textrollen SOLLEN die nutzerseitige Schriftvergrößerung sinnvoll mittragen; relative Einheiten sind dafür ein geeignetes Mittel. Container müssen erforderlichenfalls wachsen oder umbrechen. Weder reine `rem`-Verwendung noch Browserzoom allein beweisen, dass der konkrete Ablauf erhalten bleibt; Abnahme nach Abschnitt 11.

**Arbeitsinhalt nicht als Fußnote behandeln.** Ein Versionsvergleich, Formularfehler oder Speicherhinweis darf nicht nur deshalb winzig werden, weil er außerhalb des Haupteditors steht. Solche Inhalte mit realen Texten und einer zur Aufgabe passenden Größe prüfen. Eine systemweite Schriftänderung folgt daraus nicht.

### 3.3 Farben und semantische Rollen

Komponenten SOLLEN Rollen wie `text.primary`, `surface.raised`, `action.primary`, `border.subtle`, `status.error` und `focus.ring` verwenden. Die Namen sind Beispiele; vorhandene Projektnamen bleiben maßgeblich. Primitive Werte dürfen nach Farbe benannt sein. Die semantische Ebene beschreibt, wozu ein Wert dient.[^D69]

Eine ruhige Grundfläche und begrenzte Akzentverwendung sind ein sinnvoller Start für viele Arbeitsoberflächen, aber keine universelle Pflicht. Status- und Diagrammfarben sind zusätzliche funktionale Rollen, keine verbotenen „weiteren Markenfarben“. Warnung und primäre Aktion müssen nicht nur irgendwie bunt, sondern in ihrer Bedeutung unterscheidbar sein.

**Nicht übernehmen:** fixe Prozentdeckkraft als Lesbarkeitsrezept. Ein halbtransparenter Text hat je nach Hintergrund einen anderen tatsächlichen Kontrast. Ebenso ist ein dekorativer Verlauf nicht automatisch schlecht; Text und Bedienelemente darauf müssen auf den relevanten Hintergrundbereichen geprüft werden.[^D70][^W01]

### 3.4 Abstände, Raster und Dichte

Zusammengehörige Elemente SOLLEN kleinere Zwischenräume haben als unabhängige Gruppen. Gemeinsame Kanten, wiederkehrende Innenabstände und nachvollziehbare Ausrichtung haben Vorrang vor zusätzlichen Trennlinien oder Kartenrahmen.[^D32][^D71]

Für ein neues System KANN eine kleine Abstandsskala wie `4 / 8 / 12 / 16 / 24 / 32 / 48 / 64` CSS-Pixel dienen. Das ist eine bewusst gewählte Arbeitsgrundlage, kein Verbot optischer Korrekturen. Eine begründete Feinjustierung wird als Variante oder Entscheidung dokumentiert, nicht heimlich überall anders umgesetzt.

Raster und Breakpoints folgen dem Inhalt. Zwölf Spalten oder der Goldene Schnitt sind Möglichkeiten, keine Qualitätsnachweise. Eine schmale Einstellungsseite benötigt nicht dieselbe Struktur wie eine Vergleichstabelle.[^D25][^D26]

Dichte wird pro Anwendungsbereich festgelegt. „Kompakt“ heißt weniger ungenutzter Raum, nicht verkleinerte Schrift bis zur Unlesbarkeit. „Großzügig“ heißt klare Gliederung, nicht riesige Leerflächen zwischen jeder Information.

### 3.5 Oberflächen, Karten und Tiefe

Karten SOLLEN eine eigenständige Einheit oder Handlung zusammenfassen. Nicht jeder Absatz benötigt einen abgerundeten Container. Ähnliche Karten teilen dieselbe innere Logik; ihre unterschiedlichen Inhalte bleiben sichtbar.

Für Radien und Tiefe genügt zunächst eine kleine Familie. Benachbarte Komponenten dürfen nicht zufällig andere Rundungen und Schatten besitzen. Bei verschachtelten Konturen kann `innerer Radius ≈ äußerer Radius − tatsächlicher Einzug` als geometrischer Ausgangspunkt dienen; das Ergebnis wird visuell geprüft.[^D72]

Tiefe SOLL einen Zweck erfüllen: schwebende Ebene, interaktiver Zustand oder bewusst gewählte Markenwirkung. Eine flache Oberfläche ist nicht automatisch unfertig; eine starke Schattierung nicht automatisch hochwertig. Die exakten Pixel- und Opazitätswerte der „Perfect Card“ sind Anschauungsbeispiele, keine systemweiten Vorgaben.[^D36][^D75]

Ein Hover-Lift KANN interaktive Karten unterstützen. Nichtinteraktive Karten erhalten keine falsche Klick-Andeutung. Skalierung darf keine Nachbarelemente störend überdecken; die Kernhandlung bleibt ohne Hover erkennbar.[^D64]

**Material hat eine Rolle.** Arbeitsinhalt, dauerhafte Navigation und schwebende Werkzeuge SOLLEN als unterschiedliche Ebenen erkennbar sein. Das lässt sich mit deckenden Flächen, Helligkeit, Konturen, Abstand oder gezielter Transparenz erreichen. Apples Materialrichtlinien begründen Materialien mit räumlicher Orientierung und warnen vor übermäßigem Glaseinsatz; daraus folgt keine Pflicht für Glasflächen in einem Webprodukt.[^AP02]

Ein nichtmodaler Inspector begleitet die Arbeit und darf nicht wie eine blockierende Entscheidung wirken. Ein modaler Ablauf besitzt dagegen eine klar erkennbare Unterbrechung und den zugehörigen Fokusvertrag. Optische Abdunklung und tatsächliche Bedienbarkeit müssen zueinander passen.

**Materialeffekte gegen echte Inhalte prüfen.** Transparente Toolbars und Popover werden über Text, Bildern, Auswahlmarkierungen und anderen relevanten Untergründen betrachtet. Kontrast gegen eine ideale einfarbige Musterfläche genügt nicht. Bei überlagerten Ebenen die tatsächlich zusammengesetzten Farben prüfen.

Keine Pflicht zu stärkeren Schatten auf größeren Flächen, animiertem Blur oder zum Entfernen aller Trennlinien. Auch ein einfacher Rand kann die klarste Lösung sein. Deckende Alternativen und beide Themes sind Teil des Materialvertrags in Abschnitt 3.7.

### 3.6 Icons und Bildsprache

Eine konsistente Icon-Familie verwenden. Strichstärke, optische Größe und ausgewählte Zustände müssen zusammenpassen; eine universelle Strichstärke ist nicht erforderlich. Unbekannte Symbole brauchen sichtbare Beschriftung oder eine andere eindeutige Erklärung. Dekorative Icons dürfen assistive Ausgabe nicht mit bedeutungslosen Namen überladen.[^D66]

Produktbilder SOLLEN tatsächliche Funktionen oder nachvollziehbare Nutzung zeigen. Keine Stock-Illustration als Ersatz für die Erklärung einer Kernfunktion. Platzhalterbilder sind in Prototypen zulässig, müssen aber als solche behandelt werden und passende reale Abmessungen besitzen.

### 3.7 Light- und Darkmode

Ein zweites Theme ist eine eigene Abstimmung der semantischen Rollen. Flächenhierarchie, Textkontrast, Statusfarben, Fokus und Overlays müssen in beiden Richtungen funktionieren. Mechanisches Invertieren oder pauschales Entsättigen reicht als Entwurfsregel nicht aus.[^D73]

Keine pauschalen Verbote für reines Schwarz oder Weiß. Stattdessen das konkrete Zusammenspiel prüfen, einschließlich transparenter Flächen, ausgewählter Zeilen, Fehlermeldungen und Diagramme. Ein neues Theme wird nur ergänzt, wenn es zum Auftrag gehört.

**Theme-Wechsel als kompletter Ablauf.** Projektseitig unterstützte Präferenzen, etwa hell, dunkel und System, müssen für alle Komponenten gleich aufgelöst werden. Portale, native Controls und Drittkomponenten dürfen nicht unabhängig in ein anderes Theme fallen. Eine gespeicherte Wahl, sofern vorgesehen, möglichst vor der ersten sichtbaren Darstellung anwenden; ein unnötiges Aufblitzen des falschen Themes vermeiden. Beim Wechsel Auswahl, Fokus, Cursor und ungespeicherte Eingaben erhalten.

**Deckende Materialalternative.** Transparente Ebenen SOLLEN zusätzlich ohne Transparenz und ohne Blur funktionieren. Dafür semantische Flächentokens des aktiven Themes verwenden, nicht hartcodiertes Weiß. `prefers-reduced-transparency` KANN dies an eine Systemeinstellung koppeln; die Abfrage ist zum Quellenstand nicht in allen wichtigen Browsern verfügbar. Die Basisdarstellung muss unabhängig davon lesbar sein.[^M05]

**Prüfmatrix:** Gleichen Inhalt und gleichen Zustand in beiden Themes vergleichen: Normalfall, Hover, Druck, Auswahl, Fokus, Fehler, Disabled und offene Overlays, soweit relevant. Zusätzlich lange Inhalte, wechselnde Hintergründe und die deckende Variante prüfen. Für normale Texte mindestens das konkrete Text-Hintergrund-Paar messen; ein bestandener Tokentest ersetzt keine Prüfung der Kombination im Produkt.

Beispiel einer vermeidbaren Fehlverwendung: Ein als Statusrand ausgelegter Ton wird als Wortmarkierungsfläche benutzt, während der normale Text unverändert bleibt. Die Korrektur ist zuerst eine geeignete Kombination aus Flächen- und Textrolle, nicht eine globale Änderung der Statuspalette. Dies ist ein allgemeines Prüfbeispiel, kein aktueller Repository-Befund.

Ein Übergang beim Theme-Wechsel ist optional. Er darf weder Eingaben verzögern noch im Zwischenzustand notwendige Information unlesbar machen. Keine globale Farb-Transition nur für den Effekt einführen.

<a id="s04"></a>
## 4. Komposition, Navigation und Seitentypen

### 4.1 Aufgaben sichtbar strukturieren

**Arbeitsoberflächen** SOLLEN den Arbeitsgegenstand priorisieren. Navigation, Werkzeuge und Status unterstützen ihn. Selten benötigte Optionen können ausgelagert werden; häufige Kernhandlungen dürfen nicht hinter beliebigen Symbolen oder einer ausschließlich per Shortcut erreichbaren Suche verschwinden.[^D29]

**Detail- und Einstellungsseiten** SOLLEN Informationen nach der Aufgabe der Person gruppieren, nicht nach Tabellenstruktur oder internen Service-Namen. Abschnitte können unabhängige Speichervorgänge haben, müssen deren Geltungsbereich aber deutlich machen.[^D08]

**Landingpages** SOLLEN verständlich machen, für wen ein Produkt welches konkrete Ergebnis bietet. Ein echter Produktausschnitt und belastbare Belege sind besser als austauschbare Behauptungen. Eine primäre Handlungsaufforderung kann durch eine zurückhaltende Alternative ergänzt werden; wiederholte Aufforderungen dürfen dieselbe Absicht unterstützen.[^D02][^D67]

Die Reihenfolge von Problem, Lösung, Produktbeleg, Einwänden und Handlung folgt den Informationsbedürfnissen. Sie wird nicht auf exakt fünf Abschnitte festgeschrieben. Einstieg und Abschluss sind wichtig; sicherheitsrelevante oder entscheidende Informationen dürfen deshalb nicht aus der Mitte verschwinden.[^D35]

**Mobile Ansichten** werden als eigene Anordnung derselben Aufgaben entworfen. Inhalte priorisieren, Werkzeuge sinnvoll gruppieren und Überläufe bewusst behandeln. Nicht lediglich eine Desktopansicht verkleinern. Kritische Aktionen müssen auch mit Touch und ohne Hover auffindbar bleiben.[^D06]

### 4.2 Orientierung und Nähe zur Aufgabe

Jeder Arbeitsbereich SOLL erkennen lassen: Welches Objekt ist aktiv? In welchem Bereich befinde ich mich? Welche Wirkung haben die sichtbaren Aktionen? Wie komme ich zurück? Der Name der aktiven Figur, Datei oder Karte kann dafür hilfreicher sein als eine generische Seitenüberschrift.

Controls SOLLEN nahe am betroffenen Inhalt stehen und dessen Struktur nachvollziehbar abbilden. Sichtbare Beschriftungen bleiben ausdrücklich erwünscht; eine Funktion ist nicht schon deshalb selbsterklärend, weil das Icon passend positioniert wurde. Häufige Aktionen und seltene Optionen werden nach Aufgabe und Nutzung getrennt, nicht nach Platzmangel in einem einzelnen Screenshot.

### 4.3 Arbeitskontext und Rückweg

Beim Wechsel zwischen Bereichen SOLL der relevante Arbeitskontext erhalten bleiben: etwa Filter, Auswahl, Scrollposition, Cursor, Textselektion oder geöffnete Detailbereiche. Die Anforderung konkretisiert den Kontextschutz aus Apples Designprinzipien für komplexe Arbeitsoberflächen.[^AP01]

**Eigener Wiederaufnahmevertrag:** Für jeden betroffenen Ablauf Ausgangszustand, Nebenweg, Rückkehrziel und Lebensdauer benennen. Beispiel: Manuskript bearbeiten → Figur nachschlagen → an derselben Textstelle fortsetzen, mit erhaltener Auswahl und sinnvoll wiederhergestelltem Fokus. Bei verändertem Inhalt stabile Anker verwenden und eine sichere Ersatzposition festlegen, statt ungeprüft alte Pixelkoordinaten zu erzwingen.

Fokus nicht während der laufenden Bedienung stehlen. Wird das ursprüngliche Ziel entfernt oder unzugänglich, auf ein nachvollziehbares benachbartes Ziel zurückkehren. Welche Informationen nur in der Sitzung und welche dauerhaft bestehen, wird projektspezifisch festgelegt. Kontextschutz ist keine pauschale Freigabe für zusätzliche Datenspeicherung oder die Wiederöffnung sensibler Inhalte nach Logout.

<a id="s05"></a>
## 5. Bewegung und wahrgenommene Reaktion

### 5.1 Zuerst Zweck und Nutzungshäufigkeit

Bewegung SOLL eine Zustandsänderung, räumliche Beziehung oder Rückmeldung erklären. Sie KANN Charakter vermitteln, wenn das zur Aufgabe passt. Vor einer Ergänzung benennen: Was versteht die Person danach besser, und wie oft wird sie diesen Übergang sehen? Ohne Nutzungsdaten die Häufigkeit als Annahme ausweisen.[^D14][^D21][^E01]

| Nutzung | Standard dieses Guides |
|---|---|
| Laufende Textarbeit, häufige Navigation, wiederholte Auswahl | Unmittelbare Reaktion; keine zusätzliche räumliche Inszenierung. Kurzes nicht blockierendes Feedback bleibt möglich. |
| Gelegentliche Overlays oder größere Zustandswechsel | Kurzer Übergang, sofern er Herkunft, Zusammenhang oder Zustand verständlicher macht. |
| Seltene Einführung oder erklärender Produktmoment | Mehr Ausdruck ist möglich, aber weder Pflicht noch Grund, den Zugang zur Aufgabe aufzuhalten. |

Keine universelle Grenze von 100 Aufrufen pro Tag und kein pauschales Animationsverbot für Tastatureingaben. Entscheidend sind Nutzen, Wiederholung und unverzögerte Bedienbarkeit. Ein Audit SOLL auch festhalten, welche Bereiche bewusst bewegungslos bleiben. Keine neuen Animationen vorzuschlagen ist ein gültiges Ergebnis.[^E02]

### 5.2 Sofortiges Feedback, richtige Aktivierung

Ein Control SOLL bereits beim Drücken erkennbar reagieren, ohne eine Backendantwort abzuwarten. Das Feedback darf Farbe, Kontur oder dezente Skalierung verwenden. `scale(0.97)` ist eine mögliche Stilentscheidung, keine Pflicht für alle Buttons.[^E03]

**Druckfeedback ist nicht die fachliche Aktion.** Gewöhnliche native Aktivierung und Zeigerabbruch beibehalten; eine Löschung oder Navigation nicht pauschal auf `pointerdown` verlegen. Ein Klick darf nicht zusätzlich zur Tastaturaktivierung ein zweites Mal ausgeführt werden. Die einschlägigen Bedingungen beschreibt WCAG 2.5.2.[^W11]

Bei dichten Werkzeugleisten SOLLEN Beschriftung, Layout und Trefferfläche stabil bleiben. Bewegte Hover-Effekte nur für geeignete Eingabegeräte aktivieren; sichtbarer Fokus und Touch-Bedienung bleiben unabhängig davon erhalten.

### 5.3 Dauer, Kurve und räumlicher Zusammenhang

**Eigene Startwerte für neue Projekte:**

| Zweck | Ausgangspunkt | Grenze |
|---|---|---|
| Druck- oder lokale Zustandsrückmeldung | Sofortige Reaktion; kurzer Übergang etwa `80–100 ms` | Rückmeldung nicht von Serverantwort oder Animation abhängig machen. |
| Kleine Farb- und Positionswechsel | Etwa `120–180 ms` | Wiederholte Bedienung nicht sichtbar verzögern. |
| Eintritt einer größeren Ebene | Etwa `200–300 ms` | Inhalt nicht bis zum Animationsende unbenutzbar machen. |
| Schließen einer Ebene | Etwa `120–180 ms` | Die Oberfläche zügig freigeben; Fokus und Modalität passend abschließen. |
| Ergänzender Tooltip | Etwa `300 ms` beim ersten Hover | Weitere Hinweise derselben Gruppe nach Abschnitt 7.1; Fokuszugang gesondert prüfen. |

Diese Werte sind Heuristiken und überschreiben keine bewährten Projekttokens. Eine feste Millisekundengrenze oder bestimmte Easing-Kurve garantiert keine gute UX. Beschleunigender Start kann bei einblendenden Arbeitscontrols zögerlich wirken; deshalb dort oft eine früh reagierende, zum Ende beruhigte Bewegung wählen. Eine andere Kurve ist erst mit einer konkreten Beeinträchtigung ein Befund.[^D18][^E01]

Wird ein verankertes Menü skaliert, SOLL sein Ursprung zur tatsächlichen Platzierung am Auslöser passen, auch nach einem Flip am Bildschirmrand. Ein zentrierter Dialog braucht diesen Triggerbezug nicht. Ein- und Ausblenden SOLLEN räumlich zusammenpassen; Änderungen der Anordnung etwa beim Wechsel zu einer mobilen Ansicht werden bewusst behandelt.[^E03]

Ein Popover SOLL nicht ohne Grund von winziger Größe auf volle Größe aufspringen. Ein Fade ohne Skalierung ist ebenso zulässig. Keine Animation ergänzen, nur um eine Vorgabe zum Animationsursprung erfüllen zu können.

### 5.4 Unterbrechen und umlenken

Die nächste gültige Eingabe hat Vorrang vor dem Abschluss des visuellen Übergangs. Wiederholtes Öffnen, Schließen und Umkehren MUSS ohne verlorene Eingabe, veralteten Endzustand oder Sprung zum früheren Startwert funktionieren. Eine visuelle Transition allein rechtfertigt keine Eingabesperre; fachlich erforderliche Busy-Sperren bleiben davon getrennt.[^E04][^AP03]

Bei einer unterbrochenen Bewegung an den aktuell sichtbaren Zustand anschließen, nicht ungeprüft an das bisherige logische Ziel. Fokus, Tab-Reihenfolge, Scroll-Lock und Trefferflächen müssen den aktuellen Interaktionszustand abbilden. Ausblendende Inhalte dürfen nicht als unsichtbare Bedienelemente zurückbleiben.

**Eigene Abnahmefälle:** öffnen → sofort schließen; während des Schließens erneut öffnen; Escape während der Bewegung; Größenänderung während eines Übergangs. Die letzte gültige Absicht, der finale Fokus und die nächste mögliche Handlung werden jeweils geprüft.

CSS-Transitions, programmgesteuerte Animationen oder Springs können je nach Aufgabe geeignet sein. Die Prüfung gilt dem Verhalten, nicht dem bloßen Einsatz von `@keyframes`. Die Web Animations API bietet unter anderem `Animation.reverse()` für die Umkehr einer laufenden Animation.[^M06]

### 5.5 Direkte Manipulation und Gesten

Beim Ziehen SOLL der tatsächlich angefasste Punkt unter dem Zeiger bleiben; das Objekt springt nicht erst mit seiner Mitte dorthin. Für eigene Pointer-Implementierungen bei Bedarf Pointer Capture einsetzen; Abbruch, verlorene Capture, weitere Kontaktpunkte und konkurrierendes Scrollen berücksichtigen. Eine vorhandene geprüfte Gestenkomponente wird nicht ohne Anlass ersetzt.[^E04][^M10]

**Eigene Regel für präzise Werkzeuge:** Graphknoten, Maßstäbe und Layoutgriffe folgen der Eingabe ohne dekorative Trägheit. Nach Loslassen wird nicht allein zur Unterhaltung weiterbewegt. Eine physikalische Nachbewegung kommt nur infrage, wenn sie dem vereinbarten Interaktionsmodell entspricht, etwa bei einem wegwischbaren Panel.

Für solche Gesten KANN eine passende Feder die aktuelle Position und Geschwindigkeit übernehmen. Messintervall, Vorzeichen, Einheiten, Grenzen und kleine Restdistanzen müssen definiert sein. Keine universelle Flick-Schwelle oder Apple-Beispielzahl ungeprüft übernehmen.[^AP03]

Apples Dämpfungsverhältnis ist nicht derselbe Parameter wie Motions `damping`. Springs anhand der tatsächlich verwendeten API abstimmen; keine scheinbar identischen Zahlen zwischen Bibliotheken übersetzen. `bounce`/`duration` und physikalische Parameter haben in Motion eigene Regeln und Vorränge.[^E04][^M08]

### 5.6 Ladefeedback auswählen

**Unmittelbare Reaktion und Ladeanzeige sind verschiedene Dinge.** Ein Button kann den Beginn einer Aktion sofort zeigen, ohne für eine sehr kurze Anfrage einen flackernden Spinner einzublenden.[^D28]

| Kenntnis über den Vorgang | Geeignetes Muster |
|---|---|
| Inhalt und Geometrie bekannt, Daten fehlen | Layoutnahes Skeleton; vorhandene Inhalte beim Aktualisieren möglichst erhalten. |
| Kurzer Vorgang, Dauer unbekannt | Lokaler Busy-Zustand; bei spürbarem Warten dezenter Spinner und verständlicher Text. |
| Fortschritt messbar | Tatsächliche Fortschrittsanzeige mit Einheit oder sinnvollem Gesamtumfang. |
| Langer Vorgang ohne messbare Prozentzahl | Wahrer Phasen- oder Bearbeitungsstatus; Abbruch beziehungsweise Wiederholung nur, wenn unterstützt. |

Skeletons SOLLEN dem späteren Inhalt ähneln und Platz reservieren; Schimmern ist keine Pflicht. Fortschrittsbalken dürfen nicht bis 99 Prozent vorlaufen, wenn dafür keine Messgrundlage existiert.[^D54]

### 5.7 Reduzierte Bewegung und zusätzliche Rückmeldung

Bei `prefers-reduced-motion: reduce` MUSS eine reduzierte Variante funktionieren. Größere Verschiebungen, Parallaxe, wiederholtes Pulsieren und unnötige Skalierungen entfallen oder werden ersetzt. Die Information bleibt erhalten; **auch ein vollständig statischer Zustandswechsel ist zulässig**. Ein kurzer Fade ist eine Möglichkeit, keine Pflicht.[^M04]

Scroll-Effekte bleiben eine progressive Verbesserung: Inhalte müssen auch ohne den Effekt zugänglich sein.[^D68] Sound oder Haptik KANN in passenden Umgebungen ergänzen, aber nie eine erforderliche visuelle oder programmatisch zugängliche Rückmeldung ersetzen. Solche Kanäle nur bei belegtem Nutzen und tatsächlicher Plattformunterstützung einsetzen; nicht als Standard für alltägliche Textarbeit.

### 5.8 Interaktionsvertrag für größere Änderungen

Eigene Vorlage; nur für nichttriviale Bewegung oder Gesten ausfüllen. Bestehende Tokennamen verwenden, keinen zweiten Zahlenkatalog anlegen.

```text
Element und Aufgabe:
Häufigkeit: beobachtet oder begründet angenommen
Zweck der Bewegung:
Auslöser: Maus, Touch, Tastatur, Systemzustand
Sofort sichtbare Rückmeldung:
Animierte Eigenschaften und verwendete Tokens:
Herkunft und Ziel:
Erneute Eingabe während des Übergangs:
Abbruch, Fokus und verbindlicher Endzustand:
Reduzierte Variante:
Relevante Prüfungen:
Bewusst nicht animierte Nachbarbereiche:
```

<a id="s06"></a>
## 6. Sprache, Glaubwürdigkeit und Produktcharakter

Texte SOLLEN die Handlung und deren Konsequenz konkret benennen. Beispiele dieses Guides: „Rechnung erstellen“ statt „Absenden“; „Änderungen verwerfen“ statt „Nein“; „Keine Treffer für diese Filter“ statt „Hier ist nichts“.[^D51]

Ein leerer Bereich braucht eine zum Grund passende Erklärung und, soweit sinnvoll, einen nächsten Schritt. Erstnutzung, fehlende Berechtigung, fehlgeschlagene Anfrage und erfolglose Suche sind verschiedene Situationen.[^D22]

Erfolgstexte SOLLEN den tatsächlichen Abschluss bestätigen und den nächsten sinnvollen Schritt zeigen. Keine Konfetti-Pflicht nach alltäglichen Aktionen. Ein Prozess darf ruhig enden; der Abschluss muss nur eindeutig sein.[^D31]

**MUSS unterbleiben:** erfundene Kundenzahlen, Bewertungen, Testimonials, Sicherheitszusagen oder Kennzeichnungen wie „am beliebtesten“ ohne Grundlage. Ebenso kein absichtlich falscher Fortschritt, um offene Aufgaben vorzutäuschen. Reale noch offene Schritte dürfen sichtbar sein; optionale Aufgaben werden als optional bezeichnet.[^D45][^D74]

Die Produktstimme bleibt in Fehlern, Dialogen und Einstellungen erkennbar, verliert dort aber nicht ihre Präzision. Humor darf niemals verdecken, ob Daten gespeichert wurden, Kosten entstehen oder ein Vorgang rückgängig gemacht werden kann.

<a id="s07"></a>
## 7. Komponenten nach Aufgabe auswählen

Die folgenden Regeln sind eine Entscheidungshilfe, kein Auftrag, alle Komponenten in jedem Projekt zu bauen. Vorhandene zugängliche Komponenten werden zuerst geprüft.

| Muster | SOLL leisten | Vermeiden |
|---|---|---|
| Tabs | Gleichrangige Ansichten wechseln; Auswahl und Tastaturfokus unterscheiden; Überlauf planen. | Tabs für lineare Pflichtschritte oder unklare Mischung aus Navigation und Formularfortschritt.[^D39] |
| Accordion | Ergänzende Abschnitte gezielt offenlegen; Zustand am Trigger erkennbar machen. | Wesentliche Fehler und Pflichtinformationen standardmäßig verbergen.[^D62] |
| Menü / Kontextmenü | Verwandte Aktionen kontextnah anbieten; am Viewportrand passend platzieren. | Exklusiver Zugang per Rechtsklick, Long-Press oder präziser Mausbewegung.[^D13] |
| Command Palette | Wiederkehrende Befehle schnell auffindbar machen; Such- und Tastaturzustände abdecken. | Alle gewöhnlichen Aktionen ausschließlich dort verstecken.[^D58] |
| Tooltip | Kurze Zusatzhilfe, auch beim Fokus. | Pflichtinformation oder interaktive Formulare in einem flüchtigen Tooltip.[^D42] |
| Dialog / Drawer / Sheet | Passend zu Unterbrechung, Umfang und verfügbarem Platz auswählen. | Modalität allein aus der visuellen Form ableiten; ein Sheet kann modal sein.[^D49][^D65] |
| Toast / Banner / Inline-Hinweis | Meldung dort und so lange zeigen, wie es Handlungsbedarf und Risiko erfordern. | Kritische Fehler nur kurz am Bildschirmrand anzeigen.[^D30][^D40] |
| Suche / Filter | Suchbereich, aktive Kriterien, Kombination und Rücksetzung verständlich machen. | Leere Trefferliste ohne Erklärung; veraltete Trefferzahlen als aktuell ausgeben.[^D34][^D59] |
| Datentabelle | Wichtige Spalten, vergleichbare Zahlen, erkennbare Sortierung und getrennte Auswahlaktionen. | Unklare Zeilenaktionen, zufällige Ausrichtung oder abgeschnittene wesentliche Werte.[^D63] |
| Pagination | Passendes Navigationsmodell und sinnvolle Wiederaufnahme bieten. | Unendliches Scrollen reflexartig für jede Recherche- oder Verwaltungsaufgabe verwenden.[^D61] |
| Bulk-Aktion | Auswahlumfang, betroffene Objekte und Ergebnis einschließlich Teilfehlern anzeigen. | „Alle“ sagen, wenn nur die aktuelle Seite gemeint ist.[^D04] |
| Inline Editing | Bearbeitung erkennbar starten und konsistent speichern oder abbrechen. | Entwürfe bei Fehlern verlieren oder durch unklare Blur-Regeln versehentlich übernehmen.[^D10] |
| Toggle | Binären Zustand und Wirkung erklären; laufende Verarbeitung bei Bedarf anzeigen. | Unbestätigte Änderung wie endgültig gespeichert darstellen.[^D41] |
| Drag / Swipe | Manipulation nachvollziehbar machen, Ziel und Konsequenz zeigen, Alternative anbieten. | Eine Geste als einzige Bedienmöglichkeit oder als unauffällige irreversible Aktion.[^D19][^D47] |
| Wizard | Fachlich sinnvolle Schritte mit Rückweg und erhaltenen Eingaben. | Künstlich viele Schritte oder Fortschritt ohne Bezug zum verbleibenden Aufwand.[^D38] |
| Präsenz / Live-Cursor | Beteiligte und ihren relevanten Bearbeitungskontext verständlich machen. | Dekorative Dauerbewegung; Sperren oder konfliktfreie Zusammenarbeit ohne Backendgrundlage versprechen.[^D11] |

### 7.1 Tooltip-Gruppen und unaufdringliche Meldungen

Der erste ergänzende Hover-Hinweis darf verzögert erscheinen. Beim unmittelbaren Wechsel zwischen benachbarten Hinweisen derselben Werkzeuggruppe SOLL die Wartezeit entfallen oder deutlich kürzer werden. Nach Verlassen der Gruppe gilt wieder der normale Einstieg. Zeitfenster und Zustandsführung gehören in die vorhandene Tooltip-Komponente, nicht in einzelne Screens.[^E03]

Die Optimierung gilt nicht als Ersatz für eine sichtbare Beschriftung, einen zugänglichen Namen oder eine Touch-Alternative. Notwendige Information bleibt auch ohne den Tooltip verfügbar. Hinweise beim Fokus werden nach dem Tastaturvertrag geprüft, nicht blind nach der Hover-Verzögerung.

Toasts SOLLEN wiederholte Meldungen eines Vorgangs sinnvoll aktualisieren statt vervielfachen. Bei automatisch verschwindenden Meldungen müssen Inhalt, Bedeutung und Gelegenheit zur Wahrnehmung zusammenpassen; Hover-, Fokus- und Sichtbarkeitspausen sind mögliche Hilfen, keine alleinige Absicherung wichtiger Wiederherstellung. Dauerhafter Speicherfehler und flüchtige Bestätigung bleiben unterschiedliche Muster.[^D40][^E03]

### 7.2 Modal oder begleitend

Die Form eines Panels entscheidet nicht über seine Modalität. Ein Inspector, der parallel zum Text benutzt werden soll, braucht einen erreichbaren Rückweg zum Text und darf den Rest der Oberfläche nicht versehentlich deaktivieren. Ein modales Sheet muss den Dialogvertrag einschließlich Fokus, Hintergrund und Schließen erfüllen.[^A01]

Nötige Unterbrechungen klar kennzeichnen; zusätzliche verschachtelte Modals möglichst durch eine verständliche Folge oder lokale Details ersetzen. Wo Überlagerungen nötig sind, Rückkehrfokus und Reihenfolge des Schließens explizit prüfen.

### 7.3 Diagramme und Bewertungen

Ein Diagramm MUSS die Datenfrage korrekt abbilden. Einheit, Zeitraum, Filter und fehlende Daten müssen nachvollziehbar sein. Wenn Balkenlängen Mengen vergleichen, ist eine Nullbasis der Standard; andere Kodierungen und begründete Ausnahmen müssen ihre Skala klar zeigen. Linienverläufe benötigen nicht pauschal dieselbe Nullbasis. Keine verzerrenden 3D-Effekte oder irreführenden Achsensprünge.[^D15]

Farben unterscheiden Serien und Zustände, nicht automatisch „gut“ und „schlecht“. Wesentliche Werte dürfen nicht ausschließlich per Hover zugänglich sein. Präzise Zahlen werden bei Bedarf zusätzlich als Text oder Tabelle angeboten.

Bei Bewertungen sind Abgabe, Hover-Vorschau und tatsächlicher Mittelwert unterschiedliche Zustände. Anzahl und Berechnungsbasis müssen stimmen. Rechenbeispiel: Bei 4,4 von 5 sind vier Sterne ganz und der fünfte zu 40 Prozent gefüllt, nicht zu 44 Prozent.[^D37]

<a id="s08"></a>
## 8. Zustände, Speicherung und sichere Wiederherstellung

### 8.1 Zustandsvertrag

Vor der Implementierung MUSS für den betroffenen Ablauf eine kleine Zustandsmatrix entstehen. Nicht relevante Zustände werden als „nicht anwendbar“ begründet; eine rein lokale Oberfläche braucht keinen erfundenen Netzwerkmodus.

| Zustand | Im Entwurf beantworten |
|---|---|
| Initial / Laden | Was ist schon bedienbar? Welche Geometrie steht bereits fest? |
| Inhalt vorhanden | Welche Daten und Aktionen bilden den Normalfall? |
| Erstnutzung / keine Inhalte | Warum ist der Bereich leer? Wie entsteht der erste Inhalt? |
| Keine Treffer | Welche Suche oder Filter verursachen das Ergebnis? Wie geht es weiter? |
| Teilweise verfügbar | Was ist vollständig, was fehlt, welche Aktion bleibt sicher? |
| Fehler | Was scheiterte, was blieb erhalten, wie kann die Person fortfahren? |
| Erfolg | Welche konkrete Änderung ist tatsächlich bestätigt? |
| Offline / veraltet | Welche Daten sind nur lokal oder nicht mehr aktuell? |
| Ohne Berechtigung / nur lesbar | Welche Einschränkung gilt, und gibt es einen berechtigten nächsten Schritt? |
| Ungespeichert / in Bearbeitung / Konflikt | Welche Fassung ist betroffen und welche Entscheidung ist erforderlich? |

Fehler SOLLEN am betroffenen Objekt oder Eingabefeld erscheinen. Ein systemweites Problem erhält eine entsprechend übergreifende Darstellung. Eingaben bleiben erhalten; hilfreiche Wiederholung oder Korrektur ersetzt einen bloßen Fehlercode.[^D23]

### 8.2 Optimistische Interaktionen

Eine optimistische Änderung ist ein **vorläufiger lokaler Zustand**, keine Bestätigung des Servers. Sie KANN für kostengünstige, reversible Aktionen eingesetzt werden, wenn Fehlschlag und spätere Antworten sauber behandelt werden. Beispiele dieses Guides sind Favorisieren oder ein rücknehmbarer Anzeigeparameter.[^D52]

Für jede solche Änderung müssen die verantwortliche Implementierung und das UI gemeinsam klären: temporäre Identität, Wiederholung, Antwortreihenfolge, Rücknahme, Konflikt und verständliche Fehlermeldung. Eine ältere Serverantwort darf keine neuere lokale Absicht unsichtbar überschreiben.

Zahlungen, endgültige Buchungen und ähnlich folgenreiche Aktionen erhalten keine vorgetäuschte Erfolgsbestätigung. Sofortige Rückmeldung lautet dann sinngemäß „Wird verarbeitet“, nicht „Erledigt“. Clientprüfungen ersetzen keine serverseitige Berechtigungs- oder Fachprüfung.[^D07]

### 8.3 Autosave

Der Ablauf MUSS mindestens unterscheiden können: ungespeicherte Änderung, Speichern läuft, erfolgreich gespeichert und Speichern fehlgeschlagen. Offline- und Konfliktzustände kommen hinzu, sofern relevant. „Gespeichert“ bezeichnet nur die jeweils zugesagte und tatsächlich erreichte Haltbarkeit; eine lokale Kopie ist nicht automatisch eine serverseitige Speicherung.[^D09]

Debouncing, lokale Entwürfe und Wiederholungsversuche werden nach Inhalt, Risiko und vorhandenem Backend festgelegt. Der Guide schreibt keine pauschale Speicherdauer und kein lokales Speichern sensibler Inhalte vor. Vor Reload, Logout und Gerätewechsel dürfen nur die tatsächlich unterstützten Schutzmechanismen versprochen werden.

`beforeunload` ist insbesondere mobil nicht zuverlässig. Es KANN ein zusätzlicher Hinweis sein, aber nicht der alleinige Schutz vor Datenverlust.[^M02]

### 8.4 Destruktive Aktionen

**Entscheidung nach Wiederherstellbarkeit und Auswirkung:**

| Situation | Standard dieses Guides |
|---|---|
| Geringes Risiko, echte verlässliche Rücknahme | Direkt ausführen; Ergebnis und gut erreichbares Undo anbieten. |
| Größerer Umfang oder unsichere Folgen | Betroffene Objekte und Konsequenz vorher prüfen lassen; gegebenenfalls Vorschau. |
| Irreversibel, finanziell oder betrieblich folgenreich | Explizite benannte Bestätigung; zusätzliche bewusste Eingabe nur bei entsprechendem Risiko. |

Ein Bestätigungsdialog ist weder immer falsch noch immer ausreichend. Die Aktion muss konkret benannt sein; „Sind Sie sicher?“ allein erklärt keine Konsequenz. Ein pauschaler Halteknopf von wenigen hundert Millisekunden ersetzt keine Risikoanalyse.[^D12]

Undo darf nur angeboten werden, wenn der Zustand zuverlässig wiederherstellbar ist. Ein kurz sichtbarer Toast SOLL nicht die einzige Möglichkeit sein, einen wesentlichen Verlust abzuwenden. Dauerhafte Wiederherstellung oder angemessene Zeitsteuerung berücksichtigen; reine Hover-Pause hilft Tastaturnutzung nicht.[^D48][^W10]

<a id="s09"></a>
## 9. Formulare und spezialisierte Eingaben

### 9.1 Labels, Hilfe und Validierung

Ein Feld MUSS eine programmatisch zugeordnete Beschriftung und einen nachvollziehbaren Zweck besitzen. Sichtbare Labels bleiben der Standard; ein Placeholder ersetzt sie nicht. Pflichtangaben, Einheiten, Einschränkungen und Fehler werden verständlich vermittelt. Farbe ist nur ein zusätzliches Merkmal.[^D24]

**Standard für Validierung:** Vor dem ersten Bearbeiten keinen Fehlervorwurf anzeigen. Nach sinnvoll abgeschlossener Eingabe beziehungsweise beim Verlassen des Felds prüfen; beim Absenden auch unberührte Pflichtfelder prüfen. Sobald ein Fehler angezeigt wird, die Korrektur zeitnah erkennen. Hilfreiche Hinweise während der Eingabe, etwa Passwortanforderungen, sind von vorzeitigem Fehlerfeedback zu unterscheiden.[^D50]

Nach erfolglosem Submit MUSS die Person wissen, wo sie korrigieren kann. Bei längeren Formularen sind eine Fehlerübersicht und sinnvoll gesetzter Fokus hilfreich. Unveränderte Felder dürfen nicht nach jedem Tastendruck erneut laut angekündigt werden.

Ein nicht verfügbares Steuerelement benötigt einen nachvollziehbaren Grund. Ein deaktivierter Absende-Button ohne Erklärung ist keine Validierungsstrategie. `disabled`, `readonly`, `aria-disabled` und Busy-Zustand sind keine austauschbaren Begriffe. Bei eigener ARIA-Abbildung muss auch das tatsächliche Verhalten stimmen.[^D05]

### 9.2 Eingabetyp passend zur Aufgabe

| Eingabe | Anforderungen dieses Guides |
|---|---|
| Auswahl | Native oder vorhandene zugängliche Auswahl bevorzugen; Suche nur bei tatsächlichem Nutzen. Trigger und Optionsliste müssen zusammengehören.[^D20] |
| Datum / Zeitraum | Direkte Eingabe und Kalender sinnvoll kombinieren; Format, Grenzen und Zeitzone fachlich klären. Voreinstellungen nach realen Aufgaben wählen.[^D16] |
| Formatierte Eingabe | Einfügen, Löschen, Cursor und Teilwerte testen. Formatierung darf keine fachlich bedeutsamen Zeichen verlieren; Identifikatoren sind nicht automatisch Zahlen.[^D27] |
| Passwort | Passwortmanager und Einfügen zulassen; Sichtbarkeit kontrollierbar; reale Regeln erklären, keine zusätzlichen Regeln erfinden.[^D57] |
| Einmalcode | Vorzugsweise ein semantisches Eingabefeld mit möglicher optischer Segmentierung; Einfügen und Autofill unterstützen. Länge und Zeichensatz vom Backend übernehmen.[^D60] |
| Slider | Aktuellen Wert, sinnvolle Schritte und Tastaturbedienung anbieten; für Präzision ergänzende Zahleneingabe vorsehen.[^D33] |
| Farbauswahl | Exakte Werte eingeben können; Transparenz nachvollziehbar darstellen; resultierende Kontraste prüfen, soweit für den Einsatzzweck relevant.[^D55] |
| Datei-Upload | Dateiauswahl zusätzlich zur Dropzone; zulässige Dateien erklären; pro Datei Fortschritt, Fehler und erneuten Versuch behandeln. Fortsetzung nur bei vorhandener Unterstützung.[^D56] |

Eingabekomfort erlaubt keine unkritische Speicherung sensibler Rohdaten. Für Zahlungs- oder Authentifizierungsdaten gelten die vorhandenen, fachlich verantworteten Integrationen; ein Styleguide definiert dafür keine neue Sicherheitsarchitektur.

<a id="s10"></a>
## 10. Technische Umsetzung ohne Design-Drift

**Tokens sind die technische Referenz, `DESIGN.md` erklärt Entscheidungen.** Das Dokument SOLL auf die echten Definitionen verweisen, statt Werte in mehreren Dateien manuell nachzuführen. Neue semantische Rollen werden ergänzt, wenn ein wiederkehrender Zweck bisher nicht abbildbar ist; nicht zur Tarnung willkürlicher Einzelwerte.

Native HTML-Semantik und bestehende zugängliche Primitives haben Vorrang vor selbstgebauten Interaktionssystemen. Eine neue Dependency benötigt einen konkreten Nutzen, den vorhandene Mittel nicht angemessen bieten. Der Umfang des Designsystems bleibt proportional zum Produkt.

CSS KANN DOM-Zustände direkt gestalten, beispielsweise über `:has()`. Das vermeidet unnötig doppelt geführten Styling-Zustand, ersetzt aber weder Fachlogik noch echte Deaktivierung oder Validierung.[^D01]

Für Layer eine nachvollziehbare Reihenfolge und bestehende Overlay-Infrastruktur verwenden. Kein Wettlauf zu `z-index: 999999`. Die Aussage, `z-index` funktioniere ausschließlich bei gesetztem `position`, ist zu pauschal: Flex- und Grid-Items sind ebenfalls relevant.[^D44][^M01]

Neue CSS-Funktionen werden gegen die unterstützten Zielbrowser geprüft. Beispielsweise ermöglicht `interpolate-size` in unterstützenden Browsern bestimmte Übergänge zwischen fester und intrinsischer Größe; „height: auto lässt sich grundsätzlich nie animieren“ ist keine tragfähige allgemeine Regel.[^M03]

Effekte brauchen eine funktionierende Basis ohne den Effekt. Keine Inhalte dauerhaft auf `opacity: 0`, falls Animation oder JavaScript nicht startet. Keine Logik, deren Korrektheit von einer exakt passenden Animationsdauer abhängt.

### 10.1 Bewegungstechnik und Leistung

Für einfache Zustandsübergänge SOLLEN vorhandene CSS-Mittel genügen. Zusätzliche Bibliotheken nur für einen tatsächlich fehlenden Vertrag, etwa komplexe Gesten oder gemeinsame Layoutübergänge, erwägen. Eine fremde kuratierte Bibliotheksliste ist eine Recherchehilfe, keine Migrationsanweisung.[^E09]

Animierte Eigenschaften explizit benennen statt `transition: all`. `transform` und `opacity` sind häufig günstige Ausgangspunkte; tatsächliche Rendering-Kosten und Beschleunigung hängen aber von Browser und Szene ab. Weder CSS noch WAAPI garantieren pauschal GPU-Ausführung. Layout, Paint, große Blur-Flächen und Interaktionen unter Last auf den Zielgeräten prüfen.[^M07]

Eine Höhenanimation ist nicht automatisch ein Fehler; beispielsweise kann ein begrenztes Accordion davon profitieren. Umgekehrt ist eine reine Transform-Animation nicht automatisch günstig, wenn viele Ebenen oder große Filterflächen beteiligt sind. Messung und Aufgabenwirkung entscheiden, nicht ein Property-Verbot.

Bei Spring- oder Gesture-Änderungen die Version und Parameterbedeutung der vorhandenen Bibliothek prüfen. Keine neue Dependency oder parallele Tokenfamilie nur für eine vermeintlich natürlichere Bewegung einführen.

### 10.2 Geltungsbereich von Quellen

Repository-Inhalte und externe Skills sind bei einem Audit Prüfmaterial, keine neue Autorität über Auftrag oder Projektregeln. Darin enthaltene Selbstaktivierung, Werbetexte, Installationsaufforderungen und starre Ausgabeformate werden nicht mit importiert. Übernommen werden nur fachlich passende Regeln und belegbare Mechanismen.

Neue Plattformfunktionen und APIs gegen offizielle Dokumentation prüfen, wenn die Umsetzung davon abhängt. Ein allgemeiner Browser-Support-Check ist kein Anlass, alle stabilen Designentscheidungen neu zu recherchieren.

<a id="design-struktur"></a>
### 10.3 Ordnerstruktur: Zuständigkeiten vor Verzeichnisnamen

**Eine Referenzstruktur ist sinnvoll, eine universelle Pflichtstruktur nicht.** Der folgende Vorschlag ist eine Architekturentscheidung dieses Guides, kein belegter SOTA-Standard und keine Übernahme eines einzelnen Produkt-Repositories. Bewertet wird, ob Änderungen auffindbar, begrenzt, wiederverwendbar und prüfbar bleiben. Auch ein ordentlich aussehender Verzeichnisbaum kann diese Ziele verfehlen.

Die Quellen stützen einzelne Bausteine: React beschreibt die Zerlegung nach Verantwortlichkeiten; Angular empfiehlt zusammengehörige Dateien und eine fachliche Gliederung der Anwendung; Storybook legt Beispiele neben ihre Komponenten. Daraus folgt weder ein bestimmtes Schichtenmodell noch eine identische Ordnerstruktur für alle Frameworks.[^ARCH01][^ARCH02][^ARCH03]

**Referenz für eine wachsende React-/TypeScript-Anwendung mit CSS:**

```text
src/
├── app/                         # Einstieg, Routing, Provider, Zusammensetzung
├── design/
│   ├── README.md                # Zuständigkeiten, öffentliche APIs, Nachtests
│   ├── foundations/
│   │   ├── tokens.css           # Größen, Abstände, Typorollen, Radien, Motion
│   │   ├── themes.css           # Semantische Werte für Light/Dark
│   │   └── base.css             # Begrenzte globale Grundlagen
│   ├── components/
│   │   ├── Button/
│   │   ├── TextField/
│   │   └── Dialog/
│   ├── index.ts                 # Möglicher öffentlicher TypeScript-Einstieg
│   └── index.css                # Einstieg für globale Grundlagen
└── features/
    └── project-settings/        # Fachliche Oberfläche, Zustand und Datenzugriff
        ├── ProjectSettings.tsx
        └── ProjectSettings.test.tsx
```

Die Namen `app`, `design` und `features` sind Beispiele. Bestehende Framework-Verzeichnisse, etwa `modules`, Paketgrenzen und Routing-Konventionen bleiben erhalten. `docs/design/` enthält weiterhin den Guide und gegebenenfalls die Projektentscheidungen, nicht eine zweite manuell gepflegte Kopie der Tokens. Ein vorhandenes gleichwertiges Design-README wird erweitert statt dupliziert.

**Klein anfangen.** Für wenige Komponenten genügen gemeinsame Token-/Theme-Dateien und ein Komponentenverzeichnis; `foundations/` muss dann kein eigener Ordner sein. `primitives/` für bewusst getrennte Basisbausteine, `patterns/` für mehrfach verwendete fachneutrale Abläufe und `internal/` für gemeinsame nicht öffentliche Hilfen KÖNNEN später hinzukommen. Keine leeren Ebenen auf Vorrat und kein zusätzlicher Wrapper allein, um eine Ebene zu füllen. Bereits sinnvoll getrennte Ebenen werden umgekehrt nicht zur Vereinfachung dieses Baums zusammengelegt.

### 10.4 Dateivertrag einer wiederverwendbaren Komponente

Zusammengehörige Implementierung, lokale Styles, Verhaltenstests und ausführbare Zustandsbeispiele SOLLEN nahe beieinander liegen. Beispiel, keine starre Pflicht zu fünf Dateien:[^ARCH02][^ARCH03]

```text
Button/
├── Button.tsx
├── Button.module.css            # Falls eigene Styles und CSS Modules verwendet werden
├── Button.test.tsx              # Verhalten und Interaktionsvertrag
├── Button.stories.tsx           # Falls Storybook verwendet wird; sonst vorhandene Gallery
└── index.ts                     # Nur falls dies der vereinbarte öffentliche Einstieg ist
```

**Erforderlich ist der Vertrag, nicht die Dateianzahl.** Öffentliche interaktive Komponenten brauchen passende Verhaltensprüfungen; eine vorhandene gleichwertige Testorganisation bleibt zulässig. Visuelle Zustände müssen reproduzierbar prüfbar sein, etwa durch Stories oder die bestehende Gallery. Ein reiner Weiterexport benötigt keine künstliche Interaktionssuite. Storybook wird nicht allein für diese Struktur installiert. Seine Story-Dateien bilden gerenderte Zustände ab; das Vorhandensein einer Datei ersetzt keinen ausgeführten Test.[^ARCH03]

Dateiendungen und Stylingtechnik folgen dem Projekt: beispielsweise `.css`, `.module.css`, `.vue`, `.svelte`, `.test` oder `.spec`. Keine leere CSS-Datei bei einem Baustein ohne eigene Styles. Kleine Props-Typen bleiben bei der Komponente; eine separate `types.ts`, zusätzliche Hooks oder Unterkomponenten erst bei echtem Umfang beziehungsweise Wiederverwendung anlegen. Namen beschreiben die Aufgabe statt Sammeldateien wie `misc.ts` zu erzeugen.

**Inhalte mit eindeutiger Zuständigkeit:** komponentenspezifische Assets liegen bei der Komponente, gemeinsame Markenelemente im vorhandenen Design-Asset-Bereich, fachliche Bilder beim Feature beziehungsweise in dessen Datenverwaltung. Herkunft und Nutzungsrechte erhalten. Eine bestehende Icon-Bibliothek wird nicht in lokale Einzeldateien kopiert, nur um die Struktur zu vervollständigen.

### 10.5 Abhängigkeiten, Styles und Themes

**Fachliche Oberflächen verwenden das gemeinsame Designsystem, nicht umgekehrt.** Ein `Dialog` kennt Fokus, Öffnen, Schließen und Darstellung. Ein `DeleteProjectDialog` kennt die konkrete Löschaufgabe und bleibt beim Feature. Wiederverwendbare Design-Komponenten importieren keine Produkt-Routen, Fach-Stores, Backend-Clients oder Datenbankmodelle. Benötigte Inhalte und Aktionen werden über vereinbarte Schnittstellen übergeben. Eigener UI-Zustand, Kontext für Overlays und konfigurierbare UI-Provider bleiben erlaubt. Diese Grenze ist eine Empfehlung dieses Guides, keine Behauptung über eine einzig zulässige React-Architektur.

**Öffentliche Schnittstellen festlegen.** Konsumenten verwenden dokumentierte Einstiege, keine privaten Implementierungsdateien. Ein gemeinsamer Barrel ist eine Möglichkeit; explizite Einstiege wie `@project/ui/button` sind ebenso möglich. Bei einem tatsächlichen Paket können `package.json`-Exports diese API einschließlich öffentlicher Unterpfade beschreiben. Ein lokaler Ordner benötigt deshalb noch kein eigenes Paket. Interne Komponentenimporte dürfen keine Zyklen über den eigenen öffentlichen Barrel erzeugen.[^ARCH05]

**Pro Baustein eine zuständige Implementierung.** Die Komponente verantwortet ihre inneren Styles und Zustände; das Feature die Anordnung und den fachlichen Ablauf. Erweiterungen über vorhandene Varianten, Slots und dokumentierte Styling-Einstiege statt über fremde interne Selektoren. Ein `className` für äußeres Layout ist kein genereller Regelverstoß. Fehlt eine wiederkehrende Darstellungsvariante, wird sie beim zuständigen Baustein ergänzt, nicht mehrfach im Feature überschrieben. Bestehende zugängliche Bibliotheksbausteine weiterverwenden; native HTML-Elemente sind nicht pauschal verboten.

**Light und Dark verwenden dieselben Komponenten.** Themeabhängige Farben, Materialien und Schatten SOLLEN über dieselben semantischen Rollen aufgelöst werden. Carbon dokumentiert dieses Prinzip ausdrücklich: Der Wert wechselt mit dem Theme, die Rolle bleibt gleich.[^ARCH04] Keine parallelen `ButtonLight.tsx`-/`ButtonDark.tsx`-Familien. Beide Themes können in einer überschaubaren Datei stehen; getrennte Theme-Dateien lohnen sich erst bei entsprechendem Umfang. Rohwerte und generierte Tokens dürfen nicht mehrere unabhängig gepflegte Wahrheiten bilden. Ein Token-Generator wird erst eingeführt, wenn Plattformen oder Werkzeuge ihn tatsächlich benötigen.

Gemeinsame Grundlagen werden an einem dokumentierten Einstieg geladen; Komponentenstyles bleiben bei ihrem Baustein beziehungsweise dessen bestehendem Build-Vertrag. Kein neues globales `button`- oder `input`-Rezept in einem Feature-Stylesheet. Themepräferenz und Speicherung bleiben beim zuständigen App-/Plattformteil; das Designsystem definiert die Darstellung. Begründete Bild-/Assetvarianten pro Theme sind erlaubt und kein Anlass, Verhalten zu duplizieren.

### 10.6 Einordnung neuer Elemente und sichere Weiterentwicklung

Vor einer neuen Datei zuerst vergleichbare Implementierungen und Verbraucher suchen. Danach die kleinste passende Zuständigkeit wählen:

| Frage | Ablage / Entscheidung |
|---|---|
| Ändert sich eine gemeinsame visuelle Rolle? | Bestehende Foundation-/Theme-Quelle; Auswirkungen auf alle Verbraucher prüfen. |
| Existiert der Baustein bereits? | Wiederverwenden oder eine begründete Variante ergänzen, nicht kopieren. |
| Ist Verhalten und API fachneutral? | Gemeinsame Komponente; zusätzliche Unterteilung nur bei erkennbarem Nutzen. |
| Enthält das Element Fachbegriffe, Rechteprüfung oder Datenzugriff? | Beim Feature; fachneutrale Teile bei Bedarf herauslösen. |
| Wiederholt sich ein vollständiger fachneutraler Ablauf? | Gemeinsame Komposition; `patterns/` optional, kein Zwang zur weiteren Ebene. |

Mehrfache Verwendung allein macht eine fachliche Oberfläche nicht zum Designbaustein. Umgekehrt kann ein wichtiger zugänglicher Basisbaustein schon beim ersten Einsatz zentral sinnvoll sein. Keine starre Regel wie „ab der dritten Verwendung verschieben“.

**Das Design-README dokumentiert den tatsächlichen Bestand:** zuständige Token-/Theme-Dateien, öffentliche Importpfade, Erweiterungsstellen, isolierte Vorschau und vorhandene Testbefehle. Auf den allgemeinen Guide und die Projektentscheidungen verweisen, Regeln nicht abschreiben. Neue Zustände derselben Komponente in beiden vorhandenen Themes und im relevanten Verwendungskontext prüfen. Integrationstests für vollständige Abläufe bleiben außerhalb der isolierten Komponententests erforderlich.

**Keine automatische Migration.** Ein Agent bildet diese Verantwortlichkeiten zuerst auf vorhandene Verzeichnisse ab. Neue Strukturen oder Verschiebungen brauchen einen konkreten Nutzen, betroffene Verbraucher und eine zum Auftrag passende Freigabe. Zusätzliche Paketgrenzen, Prüfscripts oder Verzeichnis-Splits entstehen nicht bloß zur Ähnlichkeit mit einem Referenzprojekt. Bei einer erlaubten Strukturänderung Imports, Styles, öffentliche API, Vorschau und Tests gemeinsam prüfen. Vorhandene Importregeln oder Linter nach Möglichkeit verwenden; zusätzliche Gates nur für konkrete, wiederkehrende Verstöße.

<a id="s11"></a>
## 11. Zugänglichkeit als Abnahmekriterium

Der Guide nutzt relevante WCAG-2.2-Kriterien und WAI-ARIA-Entwurfsmuster. Die folgende Auswahl ist **keine vollständige WCAG-Konformitätsprüfung**. Die verlinkten Understanding-Seiten erläutern die Kriterien; die hier zusätzlich gesetzten Komfortziele sind eigene Empfehlungen.

### Kontrast und Status

WCAG 2.2 AA fordert für gewöhnlichen Text grundsätzlich mindestens **4,5:1**, für großen Text **3:1**. Als groß gelten mindestens 18 pt oder 14 pt fett. Inaktive Bedienelemente sind von dieser Textkontrastforderung ausgenommen; dieser Guide empfiehlt dennoch gut erkennbare Beschriftung und eine verständliche Erklärung ihrer Nichtverfügbarkeit.[^W01]

Wesentliche selbst gestaltete visuelle Merkmale zur Identifikation von Bedienelementen und Zuständen benötigen grundsätzlich **3:1** gegen angrenzende Farben, mit den im Kriterium genannten Ausnahmen. Das ist keine Pflicht, jede dekorative Kontur mit 3:1 zu zeichnen.[^W04]

Bedeutung nicht ausschließlich über Farbe vermitteln. Labels, Symbole, Muster oder Text unterscheiden wichtige Zustände zusätzlich. Fehler-, Auswahl- und Fokuszustand dürfen einander nicht überdecken.

### Tastatur, Fokus und Modalität

Alle relevanten Aufgaben MUSS die Person ohne Maus erledigen können. Tastaturfokus bleibt sichtbar. Sticky Header, Fußleisten und Overlays dürfen ein fokussiertes Element nach dem AA-Kriterium nicht vollständig verdecken; dieser Guide setzt als Qualitätsziel eine möglichst vollständige Sichtbarkeit.[^W05][^W06]

Ein modaler Dialog hat eine zugängliche Bezeichnung, passende Anfangsfokussierung, einen tatsächlich inaktiven Hintergrund und eine im Dialog verbleibende Tab-Reihenfolge. Er besitzt eine erreichbare Schließmöglichkeit und gibt den Fokus nach dem Schließen sinnvoll zurück. Ein nichtmodaler Drawer darf nicht versehentlich dieselbe Fokusfalle erhalten.[^A01]

Tabs verwenden ein konsistentes Tastaturmodell mit erkennbarer Auswahl. Automatische Aktivierung eignet sich nur, wenn das Panel ohne merkliche Verzögerung bereitsteht; andernfalls manuelle Aktivierung. Vorhandene geprüfte Komponenten sind einem unvollständigen Nachbau vorzuziehen.[^A02]

### Touch, Hover und Ziehen

WCAG 2.2 AA nennt für Zeigerziele grundsätzlich **24 × 24 CSS-Pixel**, mit definierten Ausnahmen unter anderem für Abstand und Inline-Ziele. Als Komfortziel empfiehlt dieser Guide häufig **44–48 CSS-Pixel** große Trefferflächen für wichtige Touch-Bedienelemente. Das sichtbare Icon darf kleiner sein.[^W02]

Zusatzinhalte bei Hover oder Fokus müssen die relevanten Bedingungen zu Schließbarkeit, Erreichbarkeit per Hover und Beständigkeit erfüllen. Ein Tooltip darf nicht verschwinden, nur weil die Person den Zeiger vom Trigger zum Hinweis bewegt; Ausnahmen und Details nennt das Kriterium.[^W07]

Drag-and-drop erhält eine Alternative mit einem einzelnen Zeiger ohne Ziehen, sofern keine Ausnahme greift, etwa „Nach oben“, „Nach unten“ oder „Verschieben nach …“. **Eine Tastaturalternative allein erfüllt dieses Zeigerkriterium nicht.**[^W03]

### Reflow, Schriftvergrößerung und Ansagen

Für gewöhnlich vertikal gelesene Inhalte MUSS die relevante Reflow-Anforderung bei **320 CSS-Pixeln** Breite berücksichtigt werden; dies entspricht etwa 400 Prozent Zoom auf einer 1280-CSS-Pixel breiten Ausgangsansicht. Fachlich erforderliche zweidimensionale Inhalte haben Ausnahmen, aber nicht automatisch ihre gesamte umgebende Bedienoberfläche.[^W08]

Textvergrößerung und Reflow sind getrennt zu prüfen. WCAG 1.4.4 verlangt unter seinen Bedingungen Textvergrößerung bis **200 Prozent** ohne Verlust von Inhalt oder Funktion. Für WCAG 1.4.12 darf die Anpassung der vorgesehenen Textabstände keine Inhalte oder Funktionen verlieren: Zeilenhöhe `1.5`, Absatzabstand `2em`, Buchstabenabstand `0.12em`, Wortabstand `0.16em`; die genauen Anwendungsbedingungen stehen im Kriterium. Das sind Prüfeinstellungen, keine Pflicht-Defaults für die Gestaltung.[^W12][^W13]

Reduzierte Bewegung wird nach Abschnitt 5 unterstützt; verringerte Transparenz und erhöhter Kontrast werden unabhängig davon betrachtet. Eine deckende Theme-Variante darf nicht mit einer bewegungsreduzierten Variante verwechselt werden. Relevante Statusmeldungen müssen programmatisch erkennbar sein, ohne dafür den Fokus zu stehlen. Dringliche Ansagen bleiben selten; nicht jede Filteränderung braucht eine unterbrechende Fehlermeldungsrolle.[^W09]

<a id="s12"></a>
## 12. Arbeitsablauf für Coding-Agents und Abnahme

Dieser Ablauf ist eine eigene Arbeitsvorgabe. Er integriert Bestandsaufnahme, begrenzte Umsetzung und überprüfbare Übergabe. Der Umfang bleibt proportional zum Auftrag. Ein Agent erzeugt nicht automatisch Varianten, Unteragenten oder einen vollständigen Audit, nur weil er diesen Guide gelesen hat.[^E06]

### Schritt 1 — Bestand und Änderungsgrenze prüfen

Projektanweisungen, vorhandenes `DESIGN.md` oder gleichwertige Designquelle, tatsächliche Tokens, Komponenten und mindestens einen fachlich ähnlichen Screen lesen. Betroffene Dateien, geschützte Muster und relevante States benennen. Bereits gelieferte Pläne mit dem aktuellen Repository-Stand abgleichen.

Der Arbeitsmodus folgt dem Auftrag: **prüfen** liefert Befunde ohne Produktänderung; **planen** liefert einen umsetzbaren Auftrag; **umsetzen** ändert ausschließlich den freigegebenen Bereich. Eine Review-Anfrage ist keine Schreibfreigabe.

### Schritt 2 — Einen prüfbaren Kurzplan erstellen

Der Plan enthält Zielaufgabe, betroffene Ansichten und Dateien, wiederverwendete Komponenten und Tokens, erforderliche neue Varianten, relevante Zustände und Nachtests. Bei begrenzten Korrekturen reicht eine kurze Entscheidung; bei neuen Bereichen wird die visuelle Richtung konkretisiert.

Für einen an andere Agents übergebenen Auftrag zusätzlich Commit/Ref, aktuelle Fundstelle, vorhandenes Vergleichsmuster und Grenzen aufnehmen. Der Auftrag muss ohne Gesprächshistorie verständlich sein. Exakte Tokennamen und Zielzustände sind wichtiger als aus fremden Beispielen übernommene Millisekunden. Dies übernimmt den nützlichen Kern der Planvorlage aus `improve-animations`.[^E07]

**Eigene Übergabevorlage:**

```text
Aufgabe und freigegebener Umfang:
Repository-Stand / Commit:
Problem: Fundstelle und beobachtete Auswirkung
Vorhandenes funktionierendes Vergleichsmuster:
Ziel: Verhalten, Textrollen, Tokens, Zustände
Kontextschutz: Auswahl, Cursor, Fokus, Scrollen, Entwurf
Schritte und betroffene Dateien:
Nicht ändern:
Nachtests: vorhandene Befehle und konkrete Bediensequenzen
Abnahme: beobachtbare Kriterien
Offene Annahmen und nicht verfügbare Prüfmittel:
```

Stimmt der Plan nicht mehr mit dem Code überein, erst den betroffenen Teil neu einordnen. Keine stillen Scope-Erweiterungen. Ein lokaler Planabgleich ist besser als ungeprüft alte Zeilennummern oder einen veralteten API-Aufruf umzusetzen.

### Schritt 3 — Nur offene Designfragen in Varianten prüfen

Gibt es mehrere ernsthaft plausible Lösungen, KANN eine isolierte Exploration vorausgehen. Wenige funktionierende Varianten in einer benannten Dimension vergleichen: Anordnung, Dichte, Hierarchie oder Bedienablauf. Drei Richtungen sind ein möglicher Ausgangspunkt, keine Pflicht. Ein bereits entschiedener Stil wird nicht neu zur Wahl gestellt.[^E05]

Vorhandene Tokens verwenden, realistische Inhalte einsetzen und jede Variante in voller Größe mit passender Umgebung zeigen. Derselbe Inhalt, gleiche Zustände und gleiche Viewports machen den Vergleich aussagekräftig. Beide vorhandenen Themes und eine schmale Ansicht gehören in den Vergleich, wenn sie betroffen sind.

Prototypen bleiben außerhalb der produktiven Oberfläche. Erst eine ausgewählte oder ausdrücklich beauftragte Richtung integrieren. Übernommene Tests und nützliche Stories behalten; temporäre Hilfsoberflächen nach vereinbartem Umfang entfernen. Ein Farbtausch desselben Layouts gilt nicht als eigenständige Lösung einer Interaktionsfrage.

### Schritt 4 — Vollständigen Ablauf lokal implementieren

Normalfall und relevante Gegenfälle gemeinsam umsetzen. Vorhandene Primitives und fachliche Verträge beibehalten. Kein paralleler Umbau unbeteiligter Screens, keine erfundenen Produktionsdaten und keine kosmetische Erfolgsanzeige ohne tatsächlichen Abschluss. Projektentscheidungen nur aktualisieren, wenn eine neue freigegebene Regel entstanden ist.

Verfügbare Subagents erhalten getrennte, klar begrenzte Aufträge. Mehrere Agents sollen nicht gleichzeitig dieselben globalen Tokens ändern. Befunde anderer Agents am genannten Code prüfen; bewusstes Design, Dubletten und unbelegte Vermutungen aus der Fehlerliste entfernen.[^E06]

### Schritt 5 — Gerenderte Oberfläche und tatsächliches Verhalten prüfen

Mindestens betroffene Desktop- und schmale Ansichten mit realistischen Inhalten betrachten. Lange deutsche Texte, leere Inhalte, große Zahlen und relevante Fehlerfälle verwenden. Eine Codeinspektion beweist keine stimmigen Umbrüche, Abstände oder Overlay-Platzierung.

Prüfung nach Risiko: zuerst korrekter Ablauf, Daten und Abbruch; anschließend Zugänglichkeit; danach Leistung und Systemkonsistenz; zuletzt optischer Feinschliff. Auf relevanten Screens Tastatur, Fokus, beide vorhandenen Themes, größere Schrift sowie reduzierte Bewegung und Materialalternativen prüfen. Assistive Ausgabe nicht allein aus vorhandenen ARIA-Attributen als korrekt ableiten.

Bei Bewegung zusätzlich rasche Wiederholung, Umkehr, Escape, Pointer-Abbruch und Resize prüfen. Details KANN man verlangsamt oder bildweise betrachten; die abschließende Beurteilung erfolgt auch bei normaler Geschwindigkeit und wiederholter Alltagsbedienung. Gesten, sofern möglich, auf einem realen Zielgerät testen. Ein Screenshot beweist keine flüssige Unterbrechung.[^E07]

Codebefund, errechneter Wert, Browserbeobachtung und Messung im Ergebnis unterscheiden. Sind Browser, Daten oder assistive Technik nicht verfügbar, die verbleibende Prüflücke benennen. Keine Screenshots, Testerfolge oder Nutzerstudien behaupten, die nicht tatsächlich vorliegen.

### Schritt 6 — Befunde nach Risiko behandeln

| Schwere | Beispiele | Abschlussregel |
|---|---|---|
| Blockierend | Datenverlust, falsche Erfolgsbestätigung, unbedienbarer Kernablauf, unsichere irreversible Aktion. | Kein „fertig“, solange der Befund offen ist. |
| Wesentlich | Fehlender Fehlerzustand, unzugänglicher Fokus, gebrochener schmaler Workflow, verlorener Arbeitskontext, deutliche Systemabweichung. | Vor Abnahme beheben oder ausdrücklich als offene Einschränkung vereinbaren. |
| Feinschliff | Kleine optische Unwucht ohne relevante Beeinträchtigung. | Lokal korrigieren; kein zusätzliches Redesign auslösen. |

Jeder Befund nennt Ort, beobachtetes Problem, Auswirkung, kleinste sinnvolle Korrektur und Nachtest. Stilpräferenzen von tatsächlichen Mängeln trennen. Keine Schönheitsnote, die blockierende Fehler durch hübsche Details ausgleicht.

### Definition of Done

- [ ] Hauptaufgabe, aktive Inhalte, nächste Handlung und Rückweg sind verständlich.
- [ ] Die Oberfläche passt zum Projekt; neue Entscheidungen und Abweichungen sind begründet.
- [ ] Neue oder geänderte Designbausteine haben eine klare Zuständigkeit, passende öffentliche Einstiege und zugeordnete Nachtests; keine parallele Theme-Implementierung oder unbeauftragte Umstrukturierung.
- [ ] Relevante Lade-, Leer-, Teil-, Fehler-, Erfolgs- und Speicherzustände sind umgesetzt oder nachvollziehbar nicht anwendbar.
- [ ] Vorläufige und bestätigte Ergebnisse sind getrennt; Eingaben, Konflikte und verlässliche Rücknahme sind berücksichtigt.
- [ ] Vorgesehener Arbeitskontext bleibt beim Verlassen und Wiederaufnehmen erhalten; Fokus wird nicht unbeabsichtigt gestohlen.
- [ ] Navigation, Formulare und Overlays funktionieren mit den vorgesehenen Eingabegeräten; Fokus und tatsächliche Farbpaare wurden geprüft.
- [ ] Betroffene schmale Ansichten, lange Inhalte, Textvergrößerung und beide vorhandenen Themes wurden angemessen geprüft.
- [ ] Vorhandene Bewegung hat einen Zweck, toleriert neue Eingaben und bietet eine reduzierte Variante; transparente Ebenen besitzen eine lesbare Alternative.
- [ ] Texte, Zahlen, Bewertungen und Fortschritt sind wahr beziehungsweise als Prototypdaten gekennzeichnet.
- [ ] Tatsächlich ausgeführte Prüfungen, verbleibende Lücken und bewusst unveränderte Bereiche sind dokumentiert.

**Endmaßstab:** Die nächste Person soll die Oberfläche verstehen, ihr Ergebnis einschätzen und ohne unnötige Unterbrechung weiterarbeiten können. Der nächste Agent soll diese Entscheidung nachvollziehen, ohne einen zweiten Stil zu erfinden.

<a id="einbindung"></a>
## Einbindung: Referenzdatei mit optionalem Skill

**Empfehlung für wiederkehrende, projektübergreifende Agent-Arbeit:** Den Guide als versionierte fachliche Referenz behalten und einen kleinen `frontend-design`-Skill als Einstieg verwenden. Nicht das gesamte Dokument in `SKILL.md` kopieren. Projektidentität und genehmigte Abweichungen bleiben in den vorhandenen Projektquellen.

Ein reiner Anweisungs-Skill stellt keine zusätzlichen Browser- oder Testwerkzeuge bereit und garantiert keine bessere gestalterische Entscheidung. Er organisiert Auslöser, Quellen und Arbeitsschritte. Claude Code und Codex unterstützen Skills mit einem `SKILL.md`-Einstieg sowie optionalen Referenzen; der Einstieg wird bei Verwendung geladen, weitere Materialien können bedarfsgerecht gelesen werden. Automatische Auswahl hängt unter anderem von Beschreibung und Host ab und ist keine garantierte Durchsetzung aller Regeln.[^T01][^T02]

### Sofort ohne Skill verwendbar

Die Datei im Repository als `docs/design/FRONTEND_STYLEGUIDE.md` ablegen. Im tatsächlich verwendeten `CLAUDE.md` beziehungsweise `AGENTS.md` einen kurzen Verweis mit den wichtigsten Änderungsgrenzen pflegen. Ein unreferenziertes beliebiges Markdown ist kein verlässlicher Agent-Einstieg; für Codex ist `AGENTS.md` ein dokumentierter Projektanweisungspfad.[^T03]

**Vorschlag für den Projektverweis** — vorhandenen Designabschnitt anpassen, nicht parallel einen widersprüchlichen zweiten Abschnitt anlegen:

```text
Bei Frontend-Aufgaben gilt docs/design/FRONTEND_STYLEGUIDE.md.
Lies zuerst dessen Einstieg, Abschnitt 1 und Definition of Done;
anschließend die zur Aufgabe passenden Abschnitte sowie vorhandene
Projekt-Designquellen, Tokens und vergleichbare Komponenten.
Bestehende Identität und freigegebenen Änderungsumfang bewahren.
Ein Review ist keine Änderungsfreigabe. Prüfe Pläne am aktuellen Code.
Nenne tatsächlich durchgeführte Prüfungen und verbleibende Lücken.
```

### Aufgabe des kleinen Skills

Der Skill SOLL UI-Entwurf, UI-Review und beauftragte UI-Änderungen erkennen, nicht reine Backend- oder Infrastrukturarbeit. Er klärt den Arbeitsmodus, ermittelt den Repository-Pfad und lädt den dort referenzierten Guide nach dessen Lesepfad. Er verlangt Bestandsprüfung, lokale Umsetzung im freigegebenen Umfang und eine überprüfbare Abnahme. Die eigentlichen Farb-, Typografie-, Motion- und Komponentenregeln werden **nicht im Skill dupliziert**.

Bei fehlender Referenzdatei diese Lücke benennen und vorhandene Projektregeln verwenden. Nicht stillschweigend eine fremde Palette installieren, einen eigenen Ersatzguide erzeugen oder Dateien außerhalb des freigegebenen Arbeitsbereichs durchsuchen.

Übliche projektbezogene Einstiegspfade sind `.claude/skills/frontend-design/SKILL.md` für Claude Code und `.agents/skills/frontend-design/SKILL.md` für Codex. Den jeweiligen Einstieg auf denselben Guide verweisen lassen; bei einem portablen Paket Host-spezifische Felder und Aufrufsyntax getrennt halten.[^T01][^T02]

**Wartung:** Eine fachliche Regelquelle pro Projekt. Änderungen an einer zentralen Vorlage versioniert und bewusst in Projekte übernehmen. Den vorhandenen Bestand nicht durch ein stilles globales Update umgestalten. Die frühere Emil-Ergänzung kann archiviert werden; sie soll nicht zusätzlich als konkurrierender Regeltext geladen werden.

**Auswahl:** Für gelegentliche manuelle Nutzung genügt die Datei mit Projektverweis. Für wiederholte Arbeit mit verschiedenen Agents und Projekten ist der kleine Skill die sinnvolle Ergänzung. Der Mehrwert liegt im wiederholbaren Ablauf und gezielten Laden, nicht im Dateinamen. Die Einbindung hier ist ein Vorschlag, kein bereits installierter oder getesteter Skill.

<a id="quellen"></a>
## Übernahmegrenzen und Quellen

### Bewusst nicht als allgemeine Regeln übernommen

| Quellaussage / Rezept | Regel dieser Fassung |
|---|---|
| Jede Tastaturaktion oder jede sehr häufige Aktion darf niemals animieren. | Keine zusätzliche Wartezeit oder Inszenierung; zweckmäßiges nicht blockierendes Feedback bleibt möglich. [^E01] |
| Vorgegebene Kurven, starre Dauern und Druckskalierung für alle Controls. | Bestehende Projekttokens verwenden; Werte als Startpunkte behandeln, nicht als Qualitätsbeweis. [^E01][^E03] |
| Reine Fades sind Fehler; reduzierte Bewegung darf nie vollständig statisch sein. | Fade und statischer Zustandswechsel sind mögliche zugängliche Alternativen. [^E08][^M04] |
| CSS/WAAPI sind automatisch GPU-beschleunigt; alle Layoutanimationen sind verboten. | Eigenschaften, Renderingkosten und Zielbrowser prüfen; Beschleunigung nicht allein aus der Technik ableiten. [^M07] |
| Keyframes lassen sich grundsätzlich nicht unterbrechen. | Konkrete Steuerung und Endzustände prüfen; die Web Animations API erlaubt auch Umkehr. [^M06] |
| Alle Toolbars und Panels brauchen Glas, stärkeren Blur oder größere Schatten. | Ebenen verständlich machen; deckende Flächen sind gleichwertige Mittel. [^E04][^AP02] |
| Eine Beschriftung zeigt, dass die Zuordnung des Controls schlecht ist. | Nähe und verständliche Labels ergänzen sich; notwendige Beschriftungen nicht aus Stilgründen streichen. [^E04] |
| Apple-Springwerte lassen sich direkt auf Webbibliotheken übertragen. | Parameterbedeutung, Einheiten und Bibliotheksversion prüfen; Dämpfungsverhältnis nicht mit `damping` gleichsetzen. [^M08] |
| Eine kuratierte Bibliothek ist für jede passende Aufgabe verbindlich. | Bestehende Komponenten zuerst; Bibliothekswechsel benötigt einen konkreten Grund und passenden Auftrag. [^E09] |

### Quellenstand und Reichweite

Die Basisregeln und D-/W-/A-/M01–M04-Verweise stammen aus dem zuvor erstellten Guide. Der damalige Quellenbestand zu designmotionhq wurde für diese Überarbeitung nicht vollständig neu erhoben. Die historische Vollinventarliste kann weiterhin separat archiviert werden; zum Anwenden dieser Datei ist sie nicht erforderlich. Alle hier verwendeten Quellenverweise sind nachfolgend enthalten.

Die Emil-Skills werden auf den zuvor geprüften Stand `d23d7f88a2e21c9e4b1418c7abe420f5c1052ba7` bezogen. Apples Originaldokumentation und die neu aufgeführten technischen Dokumentationen wurden für diese Fassung am 12.09.2026 geprüft. Bei WWDC-Videos wurden die veröffentlichten Transkripte ausgewertet, nicht sämtliche visuellen Demonstrationen. Beispielwerte aus Vorträgen sind keine universellen Plattformkonstanten.

Die Ergänzung zur Datei- und Ordnerstruktur (10.3–10.6) wurde am 12.09.2026 gegen die nachfolgend benannten Primärquellen eingeordnet. Diese belegen einzelne Organisations- und API-Prinzipien, nicht die Überlegenheit des vorgeschlagenen Verzeichnisbaums. Bestehende Kapitel wurden für Version 2.1 nicht erneut vollständig recherchiert.

Die Quellen liefern Prinzipien und technische Grundlagen; Priorität, Lesepfade, Vorlagen und konkrete Abnahmeregeln sind die Synthese dieses Guides. Er ist kein neuer Quiltor-Audit und kein Nachweis für bereits bestandene Browser-, Performance- oder Konformitätstests.

### Quellenverweise

[^D00]: designmotionhq: [UX Engine / Startseite](https://www.designmotionhq.com/). Abruf: 11.09.2026.
[^D03]: designmotionhq: [Reverse-Engineered Linear](https://www.designmotionhq.com/patterns/reverse-engineered-linear). Abruf: 11.09.2026.
[^D53]: designmotionhq: [Gradient Design](https://www.designmotionhq.com/patterns/gradient-design). Abruf: 11.09.2026.
[^D76]: designmotionhq: [Depth Layers](https://www.designmotionhq.com/patterns/depth-layers). Abruf: 11.09.2026.
[^D43]: designmotionhq: [Visual Hierarchy](https://www.designmotionhq.com/patterns/visual-hierarchy). Abruf: 11.09.2026.
[^D17]: designmotionhq: [Design System Kit](https://www.designmotionhq.com/patterns/design-system-kit). Abruf: 11.09.2026.
[^D63]: designmotionhq: [Data Table](https://www.designmotionhq.com/patterns/data-table). Abruf: 11.09.2026.
[^D69]: designmotionhq: [Design Tokens](https://www.designmotionhq.com/patterns/design-tokens). Abruf: 11.09.2026.
[^D70]: designmotionhq: [Color Accessibility](https://www.designmotionhq.com/patterns/color-accessibility). Abruf: 11.09.2026.
[^W01]: W3C WAI: [WCAG 2.2 — SC 1.4.3 Contrast (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html). Abruf: 11.09.2026.
[^D32]: designmotionhq: [Proximity Rule](https://www.designmotionhq.com/patterns/proximity-rule). Abruf: 11.09.2026.
[^D71]: designmotionhq: [Gestalt Laws](https://www.designmotionhq.com/patterns/gestalt-laws). Abruf: 11.09.2026.
[^D25]: designmotionhq: [Golden Ratio](https://www.designmotionhq.com/patterns/golden-ratio). Abruf: 11.09.2026.
[^D26]: designmotionhq: [Grid System](https://www.designmotionhq.com/patterns/grid-system). Abruf: 11.09.2026.
[^D72]: designmotionhq: [Border Radius](https://www.designmotionhq.com/patterns/border-radius). Abruf: 11.09.2026.
[^D36]: designmotionhq: [Shadow Elevation](https://www.designmotionhq.com/patterns/shadow-elevation). Abruf: 11.09.2026.
[^D75]: designmotionhq: [Perfect Card](https://www.designmotionhq.com/patterns/perfect-card). Abruf: 11.09.2026.
[^D64]: designmotionhq: [Card Hover Anatomy](https://www.designmotionhq.com/patterns/card-hover-anatomy). Abruf: 11.09.2026.
[^D66]: designmotionhq: [Icon Design Rules](https://www.designmotionhq.com/patterns/icon-design-rules). Abruf: 11.09.2026.
[^D73]: designmotionhq: [Dark Mode](https://www.designmotionhq.com/patterns/dark-mode). Abruf: 11.09.2026.
[^D29]: designmotionhq: [Navigation Patterns](https://www.designmotionhq.com/patterns/navigation-patterns). Abruf: 11.09.2026.
[^D08]: designmotionhq: [Settings System](https://www.designmotionhq.com/patterns/settings-system). Abruf: 11.09.2026.
[^D02]: designmotionhq: [De-AI Landing Hero](https://www.designmotionhq.com/patterns/de-ai-landing-hero). Abruf: 11.09.2026.
[^D67]: designmotionhq: [Landing Page Skeleton](https://www.designmotionhq.com/patterns/landing-page-skeleton). Abruf: 11.09.2026.
[^D35]: designmotionhq: [Serial Position](https://www.designmotionhq.com/patterns/serial-position). Abruf: 11.09.2026.
[^D06]: designmotionhq: [Hover Trap](https://www.designmotionhq.com/patterns/hover-trap). Abruf: 11.09.2026.
[^D14]: designmotionhq: [Animation Timing](https://www.designmotionhq.com/patterns/animation-timing). Abruf: 11.09.2026.
[^D21]: designmotionhq: [Easing Curves](https://www.designmotionhq.com/patterns/easing-curves). Abruf: 11.09.2026.
[^D18]: designmotionhq: [Doherty Threshold](https://www.designmotionhq.com/patterns/doherty-threshold). Abruf: 11.09.2026.
[^D28]: designmotionhq: [Loading States System](https://www.designmotionhq.com/patterns/loading-states-system). Abruf: 11.09.2026.
[^D54]: designmotionhq: [Skeleton Loading](https://www.designmotionhq.com/patterns/skeleton-loading). Abruf: 11.09.2026.
[^M04]: MDN Web Docs: [prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion). Erneut geprüft: 12.09.2026; Bewegung darf reduziert, ersetzt oder entfernt werden.
[^D68]: designmotionhq: [Scroll-Driven Animations](https://www.designmotionhq.com/patterns/scroll-driven-animations). Abruf: 11.09.2026.
[^D51]: designmotionhq: [Microcopy](https://www.designmotionhq.com/patterns/microcopy). Abruf: 11.09.2026.
[^D22]: designmotionhq: [Empty States](https://www.designmotionhq.com/patterns/empty-states). Abruf: 11.09.2026.
[^D31]: designmotionhq: [Peak-End Rule](https://www.designmotionhq.com/patterns/peak-end-rule). Abruf: 11.09.2026.
[^D45]: designmotionhq: [Zeigarnik Effect](https://www.designmotionhq.com/patterns/zeigarnik-effect). Abruf: 11.09.2026.
[^D74]: designmotionhq: [Von Restorff Effect](https://www.designmotionhq.com/patterns/von-restorff). Abruf: 11.09.2026.
[^D39]: designmotionhq: [Tabs System](https://www.designmotionhq.com/patterns/tabs-system). Abruf: 11.09.2026.
[^D62]: designmotionhq: [Accordion Disclosure](https://www.designmotionhq.com/patterns/accordion-disclosure). Abruf: 11.09.2026.
[^D13]: designmotionhq: [Context Menu](https://www.designmotionhq.com/patterns/context-menu). Abruf: 11.09.2026.
[^D58]: designmotionhq: [Command Palette](https://www.designmotionhq.com/patterns/command-palette). Abruf: 11.09.2026.
[^D42]: designmotionhq: [Tooltip Design](https://www.designmotionhq.com/patterns/tooltip-design). Abruf: 11.09.2026.
[^D49]: designmotionhq: [Bottom Sheets](https://www.designmotionhq.com/patterns/bottom-sheets). Abruf: 11.09.2026.
[^D65]: designmotionhq: [Modal Hierarchy](https://www.designmotionhq.com/patterns/modal-hierarchy). Abruf: 11.09.2026.
[^D30]: designmotionhq: [Notification System](https://www.designmotionhq.com/patterns/notification-system). Abruf: 11.09.2026.
[^D40]: designmotionhq: [Toast Notifications](https://www.designmotionhq.com/patterns/toast-notifications). Abruf: 11.09.2026.
[^D34]: designmotionhq: [Search Experience System](https://www.designmotionhq.com/patterns/search-experience-system). Abruf: 11.09.2026.
[^D59]: designmotionhq: [Filter Chips](https://www.designmotionhq.com/patterns/filter-chips). Abruf: 11.09.2026.
[^D61]: designmotionhq: [Pagination](https://www.designmotionhq.com/patterns/pagination). Abruf: 11.09.2026.
[^D04]: designmotionhq: [Bulk Actions](https://www.designmotionhq.com/patterns/bulk-actions). Abruf: 11.09.2026.
[^D10]: designmotionhq: [Inline Editing](https://www.designmotionhq.com/patterns/inline-editing). Abruf: 11.09.2026.
[^D41]: designmotionhq: [Toggle Anatomy](https://www.designmotionhq.com/patterns/toggle-anatomy). Abruf: 11.09.2026.
[^D19]: designmotionhq: [Drag and Drop](https://www.designmotionhq.com/patterns/drag-and-drop). Abruf: 11.09.2026.
[^D47]: designmotionhq: [Swipe Actions](https://www.designmotionhq.com/patterns/swipe-actions). Abruf: 11.09.2026.
[^D38]: designmotionhq: [Stepper Wizard](https://www.designmotionhq.com/patterns/stepper-wizard). Abruf: 11.09.2026.
[^D11]: designmotionhq: [Live Cursors](https://www.designmotionhq.com/patterns/live-cursors). Abruf: 11.09.2026.
[^D15]: designmotionhq: [Charts That Lie](https://www.designmotionhq.com/patterns/charts-that-lie). Abruf: 11.09.2026.
[^D37]: designmotionhq: [Star Rating](https://www.designmotionhq.com/patterns/star-rating). Abruf: 11.09.2026.
[^D23]: designmotionhq: [Error States](https://www.designmotionhq.com/patterns/error-states). Abruf: 11.09.2026.
[^D52]: designmotionhq: [Optimistic UI](https://www.designmotionhq.com/patterns/optimistic-ui). Abruf: 11.09.2026.
[^D07]: designmotionhq: [Behind the Button](https://www.designmotionhq.com/patterns/behind-the-button). Abruf: 11.09.2026.
[^D09]: designmotionhq: [Autosave](https://www.designmotionhq.com/patterns/autosave-ux). Abruf: 11.09.2026.
[^M02]: MDN Web Docs: [Window: beforeunload event](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event). Abruf: 11.09.2026.
[^D12]: designmotionhq: [Destructive Actions](https://www.designmotionhq.com/patterns/destructive-actions). Abruf: 11.09.2026.
[^D48]: designmotionhq: [Undo UX](https://www.designmotionhq.com/patterns/undo-ux). Abruf: 11.09.2026.
[^W10]: W3C WAI: [WCAG 2.2 — SC 2.2.1 Timing Adjustable](https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable.html). Abruf: 11.09.2026.
[^D24]: designmotionhq: [Form Field States](https://www.designmotionhq.com/patterns/form-field-states). Abruf: 11.09.2026.
[^D50]: designmotionhq: [Form Validation Timing](https://www.designmotionhq.com/patterns/form-validation-timing). Abruf: 11.09.2026.
[^D05]: designmotionhq: [Disabled Buttons](https://www.designmotionhq.com/patterns/disabled-buttons). Abruf: 11.09.2026.
[^D20]: designmotionhq: [Dropdown Design](https://www.designmotionhq.com/patterns/dropdown-design). Abruf: 11.09.2026.
[^D16]: designmotionhq: [Date Pickers](https://www.designmotionhq.com/patterns/date-pickers). Abruf: 11.09.2026.
[^D27]: designmotionhq: [Input Masking](https://www.designmotionhq.com/patterns/input-masking). Abruf: 11.09.2026.
[^D57]: designmotionhq: [Password Field UX](https://www.designmotionhq.com/patterns/password-field-ux). Abruf: 11.09.2026.
[^D60]: designmotionhq: [OTP Input](https://www.designmotionhq.com/patterns/otp-input). Abruf: 11.09.2026.
[^D33]: designmotionhq: [Range Sliders](https://www.designmotionhq.com/patterns/range-sliders). Abruf: 11.09.2026.
[^D55]: designmotionhq: [Color Picker UX](https://www.designmotionhq.com/patterns/color-picker-ux). Abruf: 11.09.2026.
[^D56]: designmotionhq: [File Upload UX](https://www.designmotionhq.com/patterns/file-upload-ux). Abruf: 11.09.2026.
[^D01]: designmotionhq: [CSS Has Selector](https://www.designmotionhq.com/patterns/css-has-selector). Abruf: 11.09.2026.
[^D44]: designmotionhq: [Z-Index Mastery](https://www.designmotionhq.com/patterns/z-index-mastery). Abruf: 11.09.2026.
[^M01]: MDN Web Docs: [z-index](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/z-index). Abruf: 11.09.2026.
[^M03]: MDN Web Docs: [interpolate-size](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/interpolate-size). Abruf: 11.09.2026.
[^W04]: W3C WAI: [WCAG 2.2 — SC 1.4.11 Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html). Abruf: 11.09.2026.
[^W05]: W3C WAI: [WCAG 2.2 — SC 2.4.7 Focus Visible](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html). Abruf: 11.09.2026.
[^W06]: W3C WAI: [WCAG 2.2 — SC 2.4.11 Focus Not Obscured (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html). Abruf: 11.09.2026.
[^A01]: W3C WAI: [ARIA Authoring Practices — Dialog (Modal) Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/). Abruf: 11.09.2026.
[^A02]: W3C WAI: [ARIA Authoring Practices — Tabs Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/). Abruf: 11.09.2026.
[^W02]: W3C WAI: [WCAG 2.2 — SC 2.5.8 Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html). Abruf: 11.09.2026.
[^W07]: W3C WAI: [WCAG 2.2 — SC 1.4.13 Content on Hover or Focus](https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html). Abruf: 11.09.2026.
[^W03]: W3C WAI: [WCAG 2.2 — SC 2.5.7 Dragging Movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html). Abruf: 11.09.2026.
[^W08]: W3C WAI: [WCAG 2.2 — SC 1.4.10 Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html). Abruf: 11.09.2026.
[^W09]: W3C WAI: [WCAG 2.2 — SC 4.1.3 Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html). Abruf: 11.09.2026.

[^E01]: Emil Kowalski: [animate/SKILL.md](https://github.com/emilkowalski/skills/blob/d23d7f88a2e21c9e4b1418c7abe420f5c1052ba7/skills/animate/SKILL.md). Stand der vorherigen Skill-Auswertung: 12.09.2026.
[^E02]: Emil Kowalski: [find-animation-opportunities/SKILL.md](https://github.com/emilkowalski/skills/blob/d23d7f88a2e21c9e4b1418c7abe420f5c1052ba7/skills/find-animation-opportunities/SKILL.md). Zweck, Häufigkeit und bewusst verworfene Vorschläge.
[^E03]: Emil Kowalski: [emil-design-eng/SKILL.md](https://github.com/emilkowalski/skills/blob/d23d7f88a2e21c9e4b1418c7abe420f5c1052ba7/skills/emil-design-eng/SKILL.md). Druckfeedback, Tooltip-Gruppen, Herkunft und Komponentenverhalten.
[^E04]: Emil Kowalski: [apple-design/SKILL.md](https://github.com/emilkowalski/skills/blob/d23d7f88a2e21c9e4b1418c7abe420f5c1052ba7/skills/apple-design/SKILL.md). Interpretation für Weboberflächen; keine offizielle Apple-Veröffentlichung.
[^E05]: Emil Kowalski: [prototype/SKILL.md](https://github.com/emilkowalski/skills/blob/d23d7f88a2e21c9e4b1418c7abe420f5c1052ba7/skills/prototype/SKILL.md). Isolierte, funktionierende und tatsächlich unterschiedliche Varianten.
[^E06]: Emil Kowalski: [improve-animations/SKILL.md](https://github.com/emilkowalski/skills/blob/d23d7f88a2e21c9e4b1418c7abe420f5c1052ba7/skills/improve-animations/SKILL.md). Bestandsaufnahme, bestätigte Befunde und begrenzte Pläne.
[^E07]: Emil Kowalski: [improve-animations/PLAN-TEMPLATE.md](https://github.com/emilkowalski/skills/blob/d23d7f88a2e21c9e4b1418c7abe420f5c1052ba7/skills/improve-animations/PLAN-TEMPLATE.md). Nachvollziehbare Übergabe und konkrete Nachtests.
[^E08]: Emil Kowalski: [review-animations/SKILL.md](https://github.com/emilkowalski/skills/blob/d23d7f88a2e21c9e4b1418c7abe420f5c1052ba7/skills/review-animations/SKILL.md). Quelle kritisch eingeordneter Review-Vorgaben, kein unverändert übernommener Maßstab.
[^E09]: Emil Kowalski: [pick-ui-library/SKILL.md](https://github.com/emilkowalski/skills/blob/d23d7f88a2e21c9e4b1418c7abe420f5c1052ba7/skills/pick-ui-library/SKILL.md). Kuratierte Präferenzen; bestehende Bibliotheken nicht unaufgefordert austauschen.
[^AP01]: Apple: [Human Interface Guidelines — Design principles](https://developer.apple.com/design/human-interface-guidelines/design-principles). Geprüft: 12.09.2026. Insbesondere Agency, Familiarity, Flexibility, Simplicity, Craft und Delight.
[^AP02]: Apple: [Human Interface Guidelines — Materials](https://developer.apple.com/design/human-interface-guidelines/materials). Geprüft: 12.09.2026. Hierarchie, Lesbarkeit und gezielter Materialeinsatz; plattformspezifische Gestaltung wird nicht universell vorgeschrieben.
[^AP03]: Apple: [Designing Fluid Interfaces](https://developer.apple.com/videos/play/wwdc2018/803/), WWDC 2018, Session 803. Transkript geprüft: 12.09.2026. Direkte Reaktion, Unterbrechung und Gestenübergang.
[^AP04]: Apple: [The details of UI typography](https://developer.apple.com/videos/play/wwdc2020/10175/), WWDC 2020, Session 10175. Transkript geprüft: 12.09.2026. Größenabhängige Schriftgestaltung, Abstände und skalierbare Typografie.
[^M05]: MDN Web Docs: [prefers-reduced-transparency](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-transparency). Geprüft: 12.09.2026; eingeschränkte Browserverfügbarkeit beachten.
[^M06]: MDN Web Docs: [Animation: reverse() method](https://developer.mozilla.org/en-US/docs/Web/API/Animation/reverse). Geprüft: 12.09.2026.
[^M07]: Motion: [Animation performance guide](https://motion.dev/docs/performance). Geprüft: 12.09.2026. Renderingkosten, Hardwarebeschleunigung und Ausnahmen.
[^M08]: Motion: [React transitions](https://motion.dev/docs/react-transitions). Geprüft: 12.09.2026. Physikalische und zeitbasierte Springparameter, `damping`, `bounce` und Vorränge.
[^M09]: MDN Web Docs: [font-optical-sizing](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/font-optical-sizing). Geprüft: 12.09.2026. Voraussetzung einer passenden optischen Größenachse.
[^M10]: MDN Web Docs: [Pointer events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events). Geprüft: 12.09.2026. Pointer Capture, Zeigerabbruch und Eingabegeräte.
[^W11]: W3C WAI: [WCAG 2.2 — SC 2.5.2 Pointer Cancellation](https://www.w3.org/WAI/WCAG22/Understanding/pointer-cancellation.html). Geprüft: 12.09.2026.
[^W12]: W3C WAI: [WCAG 2.2 — SC 1.4.4 Resize Text](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html). Geprüft: 12.09.2026.
[^W13]: W3C WAI: [WCAG 2.2 — SC 1.4.12 Text Spacing](https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html). Geprüft: 12.09.2026.
[^T01]: OpenAI: [Build skills](https://developers.openai.com/codex/skills/). Geprüft: 12.09.2026. Skill-Einstieg, Metadaten, Referenzen und projektbezogene Codex-Pfade.
[^T02]: Anthropic: [Extend Claude with skills](https://code.claude.com/docs/en/skills). Geprüft: 12.09.2026. Kleine Skill-Einstiege, bedarfsweise Referenzen und Claude-Code-Pfade.
[^T03]: OpenAI: [Custom instructions with AGENTS.md](https://developers.openai.com/codex/guides/agents-md/). Geprüft: 12.09.2026. Projektanweisungen und deren Einlesen.

[^ARCH01]: React: [Thinking in React](https://react.dev/learn/thinking-in-react). Geprüft: 12.09.2026. Komponenten nach Verantwortlichkeiten und UI-Struktur zerlegen; keine allgemeine Ordnerhierarchie vorgeschrieben.
[^ARCH02]: Angular: [Angular coding style guide](https://angular.dev/style-guide). Geprüft: 12.09.2026. Zusammengehörige Dateien und Unit-Tests nebeneinander; Produktcode nach fachlichen Bereichen; Konsistenz mit dem Bestand. Angular-spezifische Benennungen werden nicht auf andere Frameworks übertragen.
[^ARCH03]: Storybook: [How to write stories](https://storybook.js.org/docs/writing-stories). Geprüft: 12.09.2026. Gerenderte Komponentenzustände und Story-Dateien neben der Implementierung; keine Pflicht zur Installation von Storybook.
[^ARCH04]: IBM Carbon Design System: [Themes](https://carbondesignsystem.com/elements/themes/overview/). Geprüft: 12.09.2026. Stabile Tokenrollen und themeabhängige Werte; kein vorgeschriebener physischer Dateischnitt für andere Projekte.
[^ARCH05]: Node.js: [Modules: Packages — Package entry points / Subpath exports](https://nodejs.org/api/packages.html#package-entry-points). Geprüft: 12.09.2026. Explizite Paket-APIs und öffentliche Unterpfade; keine Forderung nach einem einzigen Barrel oder einem eigenen UI-Paket.

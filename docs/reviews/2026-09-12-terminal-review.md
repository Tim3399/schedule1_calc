# Review und Fortsetzung des Terminal-Designs

Stand: 12.09.2026. Basis: Commit `6fe3b2a9493969ba4ca5484cf113c5ca11f2f2fe`
mit Claudes vorhandenen, uncommitteten Frontend-Änderungen. Keine Veröffentlichung dieses Standes.

## Planabgleich

Geprüfte Quellen: Claudes lokaler Plan `schaue-dir-einmal-in-delightful-sundae.md`
(„Redesign der Webapp — Richtung Terminal“),
[DESIGN.md](../../webapp/design/DESIGN.md),
[Frontend-Styleguide 2.1](../../webapp/design/FRONTEND_STYLEGUIDE_v2.1.md)
und die tatsächlichen Templates, Tokens und Skripte.

| Vorgabe                                                         | Befund und Entscheidung                                                                                                                                           |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Terminal, dunkle Grundpalette, Acid Green, Monospace für Zahlen | Konsistent umgesetzt und beibehalten; keine externen Fonts oder dekorativen Animationen.                                                                          |
| System/Light/Dark, persistente ausdrückliche Wahl               | Tokens und Umschalter passen zum Plan. Neue Tests decken auch gesperrten Speicher und Tastaturbedienung ab.                                                       |
| Profit als wichtigste Kennzahl                                  | Im übernommenen Entwurf kam die Modifierkarte zuerst. Korrigiert: Profitkarte und Profitwert führen; der Modifier bleibt über einen nativen Vergleich erreichbar. |
| Einfacher Einstieg                                              | Produkt zuerst, Startwert drei Zutaten, verständliche Labels, kurze Modusoptionen mit vollständigem Hinweis auf Beweis bzw. Näherung.                             |
| Desktop und schmale Ansichten                                   | Suchergebnis erhält mehr Breite; lange eigene Rezepte erhalten ein daneben haftendes Ergebnis und Sprunglinks. Mobile Darstellung wurde verdichtet.               |
| Sichere Bearbeitung eigener Rezepte                             | Clear erhält Undo einschließlich Reihenfolge und Wiederholungen. Verschiebeaktionen bleiben über zugängliche Namen bedienbar.                                     |
| Fehler, Abbruch, exakte vs. angenäherte Ergebnisse              | Eindeutige Statuswörter bleiben erhalten. Manuelle Fehler erhalten zusätzlich `role="alert"`.                                                                     |
| Versionsangabe im Footer                                        | Im übernommenen Entwurf nicht implementiert und weiterhin offen. Kein statisch hart codierter Versionswert ergänzt.                                               |
| Fachlogik im reinen Designauftrag unverändert                   | Durch den späteren Nutzerbericht ausdrücklich erweitert; Suchkorrektur separat unten beschrieben.                                                                 |

Der öffentliche HTTP-Header enthielt bei der Kontrolle keine Content Security Policy. Ein
behaupteter CSP-Ausfall des Inline-Theme-Starts wäre daher nicht belegt. Keine CSP-Änderung vorgenommen.

## Suchkorrektur: keine Füllzutaten bei Gleichstand

Der bisherige Modifier-Gleichstand bevorzugte eine frühe Lookup-Rezeptfolge, selbst wenn diese
teurer und länger war. Browser- und Python-Suche vergleichen nun bei numerisch exakt gleichem
Modifier erst Profit, dann Länge und Lookup-Reihenfolge. Profitgleichstände bevorzugen Länge und
danach Lookup-Reihenfolge. Wirkungslos bleibende Schritte werden ausgewertet, aber bei
nichtnegativen Kosten nicht weiter verlängert. Entscheidend ist die vollständige geordnete
Effektfolge; bloß gleiche Effektmengen werden nicht gleichgesetzt.

Das gemeldete Beispiel wurde mit **Shrooms, Street Rat I, maximal 16 Zutaten** nachvollzogen:

|               | Gemeldetes Rezept | Korrigierte Suche, exakt und schnell |
| ------------- | ----------------: | -----------------------------------: |
| Zutaten       |                16 |                                    6 |
| Modifier      |              1,88 |                                 1,88 |
| Verkaufspreis |          187,20 $ |                             187,20 $ |
| Zutatenkosten |           35,00 $ |                              15,00 $ |
| Profit        |          152,20 $ |                             172,20 $ |

Die neue Folge lautet **Donut → Banana → Paracetamol → Cuke → Paracetamol → Banana**.
Die sechs geordneten Effekte sind unverändert. Beide Engines untersuchen dafür 20.840
Übergangsanfragen. Der Schnellmodus kennzeichnet sein Ergebnis weiterhin als Näherung.
Die manuelle Auswertung entfernt ausdrücklich ausgewählte Wiederholungen nicht.

## Prüfnachweise der Fortsetzung

- `tools/project.py test` mit der ausgewählten `.venv`: alle 165 Testfälle erfolgreich, einschließlich
  Python/JavaScript-Gewinnervergleich, Ressourcenabbrüchen ohne Teilgewinner und privater API-Sperre.
- `tools/project.py check` erfolgreich: Runtime-/Paketpins, Versionsgleichheit, Ruff, Biome,
  Prettier und Python-Syntax. `git diff --check` ebenfalls ohne Befund.
- Neue fachliche Regressionen vergleichen kleine Suchräume mit vollständiger Enumeration und
  decken günstigere Gleichstände, kostenlose Schleifen, ausschließlich wirkungslose Zutaten sowie
  die relevante Effektreihenfolge ab.
- Zusätzliche UI-Tests prüfen Kartenreihenfolge, Beweis-/Näherungskennzeichnung, dynamische Hinweise,
  Fehlerrollen und das genaue Wiederherstellen einer 14-Schritt-Folge einschließlich Fokus.
- Lokaler Start über `tools/project.py start --port 42765`: `[web] Ready`, Version 1.4.0,
  Revision `6fe3b2a-dirty`, Quelldigest
  `b7e10f1d10ddb551d09e7fdcad1180040113e89fdb3f1ebb42bf97c80b808e15`.
- Im echten Browser: exakte und schnelle Suche für das gemeldete 16-Schritt-Beispiel, exakte
  Shrooms/Max/3-Suche, Größenfehler bei 20 und manueller Abbruch bei Shrooms/Max/16. Größenlimit
  und Abbruch liefern keine Gewinner; Eingaben bleiben erhalten.
- Desktop-Screenshots mit 1440 px in Light und Dark sowie mobile Ansichten mit 320 px geprüft.
  Mobile Suche und 14-Schritt-Rezept: `scrollWidth == clientWidth == 305` CSS-Pixel bei
  sichtbarer Scrollbar. Keine horizontale Überbreite beobachtet.
- Manuell 14 abwechselnde Cuke/Motor-Oil-Schritte eingegeben, geleert und exakt wiederhergestellt;
  Fokus danach auf „Ingredient 1“. Sprung zum Ergebnis setzt den Fokus auf `recipe-result`.
  Produktwechsel auf Cocaine behält alle Schritte und berechnet 267,00 $ Verkauf, 56,00 $ Kosten,
  211,00 $ Profit, Modifier 0,78.
- Tastatur im Browser: Pfeiltaste wechselt den aktiven Reiter samt Fokus, Home im Theme-Umschalter
  wählt System samt ARIA-Zustand. Tab auf den aktiven Reiter zeigt `:focus-visible` mit
  `2px solid rgb(157, 255, 107)`. Weitere Tasten- und Speicherfälle sind in den UI-Tests abgedeckt.
- Kontraste unabhängig aus aktuellen Tokens inklusive Alphamischung nachgerechnet. Alle geprüften
  aktiven Text-/Button-/Badge-/Fokus-/Control-Paare erreichen ihre jeweiligen Ziele. Die Alert-Zeilen
  in DESIGN.md wurden auf den tatsächlich darunterliegenden `ground` korrigiert; beispielsweise
  Fehlertext nun 14,18:1 dunkel und 14,56:1 hell. Keine Farbänderung erforderlich.

Die übernommene Styleguide-Datei ließ den Projekt-Formatcheck scheitern. Ihre Änderung ist rein
mechanisch: exakt der Output des gepinnten Prettier auf den HEAD-Inhalt, separat verifiziert;
keine redaktionellen Änderungen. Fachänderungen liegen in anderen Dateien.

## Verbleibende Grenzen

Keine reale Screenreader- oder Mobilgeräteprüfung. 200 % Textvergrößerung wurde nicht separat
getestet; 320-px-Reflow ersetzt diese Prüfung nicht. Reduced Motion ist im CSS vorhanden, wurde
aber mangels verfügbarer Emulation nicht gerendert geprüft. Die historischen Kontrastwerte aus
DESIGN.md sind Rechenwerte, kein alleiniger Nachweis vollständiger Barrierefreiheit.

Vorhandene Agent-Regeln und lokale Claude-Startkonfiguration wurden bewahrt. Produktversion,
Deployment und öffentliche Server-Rechensperre wurden nicht geändert.

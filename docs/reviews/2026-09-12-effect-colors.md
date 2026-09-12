# Effektfarben — Quellenabgleich am 12.09.2026

## Entscheidung

Alle 34 modellierten Effekte erhalten die Label-Farben des unten belegten Spiel-Datenexports.
Die gemeinsame Quelle ist `Effect.color` in `src/lookup/lookup.py`; der Browserkatalog liefert
sie als additive Metadaten einschließlich Modell-Hash. IDs, Modifikatoren, Reaktionen und
Suchalgorithmen bleiben unverändert. `schizophrenia` bleibt unsere technische ID für den
angezeigten Effekt „Schizophrenic“.

## Belege und Grenzen

- [Schedule 1 Wiki: Effects](https://schedule-1.fandom.com/wiki/Effects), am 12.09.2026 im
  Browser geöffnet. Ausgelesen wurden die ausdrücklich gesetzten `span.style.color`-RGB-Werte
  der Namen in der ersten Effekttabelle, keine aus Screenshots geschätzten Farben.
- [O2theC/Schedule1Data](https://github.com/O2theC/Schedule1Data) beschreibt die Extraktion der
  Effect-Objektdaten zur Laufzeit im Spiel mittels UnityExplorer. Verwendet wird das Feld
  `labelColor`, nicht die separate Produktfarbe `productColor`.
- Das [Extraktionsskript](https://github.com/O2theC/Schedule1Data/blob/982a612db340a572df9c185226362c0ac34f39c9/dataExtraction/getEffects.cs)
  liest `Property.LabelColor` unmittelbar aus den Effekten der `WeedMixMap`. Dieser spätere
  Skriptstand erklärt die Extraktion, belegt aber keinen neueren Stand der älteren Farbdatei.
- Fester Datenstand:
  [EffectData.json, Revision bb1fb127](https://github.com/O2theC/Schedule1Data/blob/bb1fb127acfd874ceee94b8cfcfa3b34acca6a1c/data/EffectData.json),
  Dateirevision vom 18.07.2025. Die normalisierten RGB-Komponenten werden mit
  `round(component * 255)` auf 8-Bit-Werte umgerechnet. Alle 34 vorhandenen Effekte sind
  abgedeckt; der zusätzliche Effekt Lethal wird durch diesen Auftrag nicht ins Modell aufgenommen.

**Spielversion:** Der Export nennt keine konkrete Buildnummer. Es handelt sich um einen
nachvollziehbar beschriebenen Community-Export, nicht um ein signiertes TVGS-Artefakt oder einen
Nachweis für den derzeit neuesten Spielbuild. In den vier deklarierten lokalen Steam-Libraries
fehlt das Manifest für App 3164500; deshalb war kein direkter Vergleich mit einer lokalen
Spielinstallation möglich. Es wurde kein Spiel heruntergeladen oder gestartet.

## Wiki-Abweichungen

Die Wiki-Farben und die exportierten Label-Farben sind ähnlich, aber nicht durchgehend identisch.
Die Ursache der Unterschiede ist unbelegt. Die Runtime-Werte werden bevorzugt, weil sie das
konkrete Label-Feld abbilden; die Wiki-Werte werden nicht als identischer Beleg ausgegeben.

| Effekt       | Wiki RGB      | Export RGB    |
| ------------ | ------------- | ------------- |
| Energizing   | 154, 254, 109 | 154, 255, 109 |
| Anti-Gravity | 35, 91, 203   | 36, 91, 204   |
| Bright-Eyed  | 190, 247, 253 | 191, 248, 255 |
| Sedating     | 107, 95, 216  | 107, 95, 217  |
| Glowing      | 133, 228, 89  | 133, 229, 89  |
| Laxative     | 118, 60, 37   | 118, 60, 37   |
| Sneaky       | 123, 123, 123 | 123, 123, 123 |

## Darstellung

Exact, Fast, Vergleichskarte, manuelles Rezept und der private HTML-Renderer verwenden dieselben
Farben. Der Punkt zeigt den unveränderten RGB-Wert; Fläche und Rand werden mit vorhandenen
Theme-Rollen getönt. Beschriftungen behalten die kontrastreiche Textrolle. Zutaten bleiben
neutrale Chips. Fehlende, unbekannte oder ungültige Farbwerte ergeben lesbare neutrale Chips.
Es gibt keine zusätzlichen Laufzeitabrufe von Wiki oder GitHub.

## Prüfungen

- `tools/project.py check`: Toolchains, Versionskonsistenz, Formatierung und Python-Syntax bestanden.
- `tools/project.py test`: vollständige Testsuite bestanden, einschließlich der eingebundenen
  Node-Tests. Neue Regressionen prüfen alle 34 Farben, den Modelltransport, Hashänderungen,
  optionale Metadaten, beide HTML-Gewinner, Exact/Fast, manuelle Rezepte und neutrale Fallbacks.
- `node --test tests/browser/search-ui.test.cjs tests/browser/recipe-ui.test.cjs`: 21/21 bestanden.
- `python -B -m unittest tests.test_result_rendering`: 6/6 bestanden.
- Lokale App nach finalen Quelländerungen neu gestartet; `[web] Ready` auf Port 42765,
  Version 1.5.0, Quelldigest `16142e0306a1f08befa3f3c8fcdf6c3e1fc82b95c652e4f1c9a84b180d81b2e8`.
- Echter Browser: Exact und Fast mit OG Kush / Street Rat I / drei Zutaten; sichtbare
  Farbwerte aus `getComputedStyle` entsprechen dem Katalog. Manuelles Rezept mit Cuke und
  Banana sowie das unveränderte Basisprodukt geprüft. Light/Dark bei Desktopbreite und
  320 px betrachtet; kein horizontaler Überlauf, keine Browserfehler.
- Textkontrast aus den tatsächlich verwendeten Tokens und der sRGB-Mischung aller 34 Farben
  berechnet: mindestens **12,38:1 dunkel** und **12,62:1 hell**. Der volle Name trägt die
  Bedeutung zusätzlich zur Farbe; die Farbpunkte sind keine eigenständigen Bedienelemente.

Keine Prüfung am aktuell installierten Spielbuild möglich; Begründung siehe Quellenabschnitt.
Diese Änderung ist lokal vorbereitet und noch nicht veröffentlicht.

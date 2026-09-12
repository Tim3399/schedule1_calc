# Effektbeschreibungen — Quellenabgleich am 12.09.2026

## Entscheidung

Alle 34 modellierten Effekte erhalten eine kurze englische Beschreibung. `Effect.description`
bleibt optionale Metadaten und wird vom Browserkatalog einschließlich Modell-Hash ausgeliefert.
Technische IDs, Anzeigenamen, Modifikatoren, Farben und Mischregeln bleiben unverändert.

## Quelle und Grenzen

Grundlage ist die erste Tabelle der
[Schedule 1 Wiki-Seite „Effects“](https://schedule-1.fandom.com/wiki/Effects), am 12.09.2026
vollständig im Browser gelesen. Die Texte unten sind eigenständige Kurzfassungen der dort
beschriebenen Auswirkungen. Als `verify` markierte Angaben, insbesondere zu gegenseitig
ausgeschlossenen Effekten, wurden nicht übernommen. Für Munchies und Refreshing nennt die Tabelle
keine zusätzliche Wirkung; dies wird ausdrücklich so beschrieben, statt eine Wirkung aus dem Namen
abzuleiten.

Die Wiki-Seite nennt für diese Tabelle keine eindeutige Spiel-Buildnummer. Sie ist eine
Community-Quelle und kein signiertes TVGS-Artefakt. Deshalb dokumentieren die Beschreibungen den am
Prüfdatum sichtbaren Wiki-Stand, nicht eine direkt gegen den aktuellsten Spielbuild verifizierte
Spezifikation.

## Umsetzung und Besonderheiten

Die kanonischen Kurzbeschreibungen stehen ausschließlich an den `Effect`-Objekten in
`src/lookup/lookup.py`; dieses Review führt keine zweite vollständige Textliste. Die Formulierungen
unterscheiden klar zwischen Auswirkungen auf Spieler und NPCs. So betrifft die dokumentierte
Geschwindigkeitssteigerung von Focused nur NPCs und Arbeiter. Sneaky nennt neben der langsameren
Polizeierkennung und größeren Erfolgsfläche beim Taschendiebstahl auch die geringere
Bewegungsgeschwindigkeit. Schizophrenic beschreibt das Hören gedämpfter Stimmen, statt vorhandene
Stimmen als gedämpft darzustellen. Seizure-Inducing beschreibt den Krampfanfall und das Schütteln
am Boden, ohne eine stehende Körperhaltung zu behaupten.

## Verifikation

Gezielte Tests prüfen, dass alle 34 modellierten Effekte genau eine einzeilige
Plain-Text-Beschreibung haben, nur Munchies und Refreshing als nicht dokumentiert gekennzeichnet
sind und der Browserkatalog die optionalen Metadaten transportiert und in seinen Hash einbezieht.

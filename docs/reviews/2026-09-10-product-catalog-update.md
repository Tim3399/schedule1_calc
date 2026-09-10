# Aktualisierung des Produktkatalogs vom 10.09.2026

Der Rechner unterstützt jetzt Shrooms als mischbares Basisprodukt unter der stabilen technischen
ID `shroom`. Damit enthält er alle in den geprüften aktuellen Spieldaten vorhandenen
Basisproduktarten. Bestehende IDs und Spielwerte wurden nicht umbenannt oder geändert.

## Geprüfter Veröffentlichungsstand

Prüfdatum ist der **10.09.2026**. Die offizielle Ankündigung zu
[v0.4.2: Shrooms Update](https://steamcommunity.com/games/3164500/announcements/detail/523111043238463502)
vom **26.12.2025** bezeichnet das Update als vollständig veröffentlicht und nennt Shrooms als neue
Produktart zwischen Meth und Cocaine. Die
[offizielle Ankündigungsübersicht](https://steamcommunity.com/app/3164500/announcements/?l=english)
führt am Prüfdatum **v0.4.6f13** als jüngsten stabilen Patch. Die späteren Ankündigungen bis zu
diesem Stand nennen keine weitere neue Produktart. Zukünftige oder diskutierte Drogen wurden
deshalb nicht vorweggenommen.

Als genauer Spieldatennachweis wurde
[`data/BaseData.json`](https://github.com/O2theC/Schedule1Data/blob/6356f6dd0120ca3e5e7f7e9cd350d3aea7f1dc35/data/BaseData.json)
aus Commit
[`6356f6d`](https://github.com/O2theC/Schedule1Data/commit/6356f6dd0120ca3e5e7f7e9cd350d3aea7f1dc35)
vom **19.03.2026** geprüft. Das Repository beschreibt die Daten als per UnityExplorer direkt aus
dem Spiel extrahiert. Die Datei enthält genau OG Kush, Sour Diesel, Green Crack, Granddaddy
Purple, Meth, Cocaine und Shroom. Für Shroom stehen dort die Spiel-ID `shroom`, `basePrice: 65`
und eine leere Effektliste. Der begleitende
[Datenhinweis](https://github.com/O2theC/Schedule1Data/tree/6356f6dd0120ca3e5e7f7e9cd350d3aea7f1dc35)
erklärt außerdem, dass das Shrooms-Update keine neuen Mischeffekte, Zutaten oder
Effekttransformationen mitbrachte.

Der Preis und die leere Basiseffektliste werden unabhängig durch die Communityseiten
[Shrooms](https://schedule-1.fandom.com/wiki/Shrooms) und
[Effects](https://schedule-1.fandom.com/wiki/Effects) bestätigt. Die Shrooms-Seite nennt **$65**
und **None**; ihre Ein-Zutaten-Beispiele ergeben mit den bereits vorhandenen Effektzuschlägen
dieselben Preise. Eine aktuelle
[Steam-Community-Anleitung](https://steamcommunity.com/sharedfiles/filedetails/?id=3648936312)
nennt ebenfalls $65 als Shrooms-Basispreis. Communityquellen sind nur die Gegenprüfung; der
extrahierte Datensatz ist für ID, Preis und Basiseffekte maßgeblich.

## Eingetragene Daten

| Feld               | Wert      | Begründung                                                                      |
| ------------------ | --------- | ------------------------------------------------------------------------------- |
| Technische ID      | `shroom`  | extrahierte Spiel-ID; bestehende IDs bleiben unverändert                        |
| Anzeigename        | `Shrooms` | Bezeichnung der offiziellen Updateankündigung                                   |
| Basisverkaufspreis | `$65.00`  | extrahierte Spieldaten und zwei Community-Gegenprüfungen                        |
| Basiseffekte       | leer      | extrahierte Spieldaten und Wiki; vorhandene Mischregeln gelten unverändert      |
| `buy_price`        | `None`    | kein einzelner belegter Einkaufs- oder Herstellungspreis je verkaufter Einheit  |
| `level`            | `None`    | Zugang erfolgt über Region, Quest und Beziehung statt eines reinen Produktrangs |
| Qualität           | `n_a`     | bestehender Rechnerplatzhalter; Qualitätsaufschläge sind nicht Teil des Modells |

`buy_price=None` und `level=None` werden als SQL `NULL` synchronisiert. Das ist eine
ausdrückliche Unbekannt-/nicht-anwendbar-Angabe und kein Spielwert. Bekannte, aber ungültige
Produktränge bleiben ein Validierungsfehler; Zutaten verlangen weiterhin immer einen gültigen
Rang.

## Kosten-, Qualitäts- und Mischgrenzen

Die Shroom-Herstellung hat keinen belastbaren einzelnen `buy_price`: Eine Spore Syringe kostet
$120, Mushroom Substrate $60 und ein Grain Bag $20; der Ertrag wird mit etwa 16 bis 20 Einheiten
angegeben und kann durch Anbau, Zusätze, Qualität und Trocknung beeinflusst werden. Die
[PC-Gamer-Anleitung](https://www.pcgamer.com/games/sim/schedule-1-how-to-get-shrooms/)
dokumentiert diese drei Verbrauchspreise. Aus $200 Chargenkosten wurde bewusst kein scheinbar
exakter Stückpreis abgeleitet.

Shrooms besitzen wie andere angebaute Produkte Qualitätsstufen. Der Rechner berechnet weiterhin
nur den Basispreis plus Mischeffektzuschläge; Qualität, Ertrag, Trocknung, Verpackung,
Anschaffungskosten und Kundenverhandlung sind für alle Produktarten außerhalb des
Berechnungsmodells. Shrooms sind damit für denselben Mischvergleich wie Meth und Cocaine
unterstützt, nicht als vollständiger Anbau- oder Gewinnsimulator. Es wurden keine neuen Effekte
oder Transformationen erfunden.

Die technischen IDs und Rechenwerte der drei historischen Pseudo-Einträge bleiben unverändert. Ihre Anzeigenamen benennen jetzt ausdrücklich Meth und den jeweiligen Pseudo-Ausgangsstoff. Sie bilden verschiedene
Meth-Ausgangsqualitäten beziehungsweise Einkaufspreise des bisherigen Projekts ab, während die
extrahierten Basisdaten nur ein Basisprodukt `meth` nennen. Eine Umstellung oder Zusammenführung
würde bestehende technische IDs und gespeicherte Rezepte betreffen und ist ohne eigenen
Migrationsauftrag nicht gerechtfertigt.

## Verifikation

- `tests/test_product_catalog_update.py` prüft ID, Anzeigenamen, Basispreis, leere Effekte,
  unbekannte Metadaten und den Export in den Browserkatalog.
- `tests/test_database_sync.py` prüft SQL-NULL, stabile Produkt-ID und Idempotenz sowie weiterhin
  die Ablehnung eines unbekannten nichtleeren Produktrangs.

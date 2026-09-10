# Vertrag der Rezeptsuche

Die Weboberfläche und `POST /get_best_mix` bieten die Modi `exact` und `fast`. Ohne Auswahl gilt `exact`. Beide suchen Rezepte mit einer bis zur angeforderten Zahl an Zutaten; Reihenfolge und Wiederholungen werden berücksichtigt. Ein Rezept ohne Zusätze ist Teil der getrennten Minimum-Effekt-Suche, nicht dieser Best-Mix-Suche.

## Exakter Modus

Der exakte Modus gibt die Gewinner für Profit und Multiplikator ausschließlich nach vollständigem Abschluss seiner exakten Suche zurück. Die Garantie bezieht sich auf die angeforderten Eingaben und die aktuelle zentrale Berechnung. Sie gilt auch bei mehreren gleich guten Rezepten: Die bisherige Bevorzugung längerer Rezepte und anschließend der Lookup-Reihenfolge bleibt erhalten.

Gemeinsame Zwischenzustände dürfen nur verlustfrei zusammengefasst werden. Für dieselbe geordnete Effektfolge bei derselben Tiefe werden der früheste Rezeptweg und der billigste Weg getrennt gehalten. Cache-Verdrängung erzwingt gegebenenfalls Neuberechnung und verwirft keinen Suchzweig. Eine Heuristik darf niemals als stiller Ersatz für die exakte Suche dienen.

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

Die Felder `best_modifier` und `best_profit` fehlen dann vollständig. Ungültige Eingaben bleiben HTTP 400; unerwartete interne Fehler werden als generischer HTTP 500 ohne Gewinner gemeldet. Formularaufrufe ohne JavaScript folgen denselben Regeln. Der Browser leert alte Ergebnisse beim Start, verhindert gleichzeitige eigene Suchanfragen und akzeptiert nur Ergebnisse für den tatsächlich angeforderten Modus.

## Ressourcen und Rechenmodell

Die serverseitigen Standards in `src/functionality/mix_search.py` sind:

| Modus   |                                               Sucharbeit |        Zeit | Zustände                                                       |
| ------- | -------------------------------------------------------: | ----------: | -------------------------------------------------------------- |
| Exakt   |                           20 Millionen Übergangsanfragen | 90 Sekunden | 300.000 pro Präfixschicht, zwei Caches mit je 32.768 Einträgen |
| Schnell | 2 Millionen Übergangsanfragen einschließlich Vorausblick | 15 Sekunden | Beam-Breite 1.024, temporäre Nachfolger zusätzlich             |

Mehr als 16 Schritte überschreiten die derzeit unterstützte Größe und führen ebenfalls zu `incomplete`. Die exakte Suche streamt die letzte Schicht vollständig. Zeitkontrollen sind kooperativ: Exakt wird alle 1.024 Übergangsanfragen sowie vor Rückgabe geprüft. Dies sind Grenzen für Sucharbeit und Datenstrukturen, kein harter Betriebssystemschutz in Bytes. Der separate historische Messrunner hat zusätzlich einen Prozess-Speicherwächter; die Webanwendung übernimmt diesen Windows-spezifischen Wächter nicht.

Beide produktiven Engines erhalten die zentrale Preisberechnung als Pflichtfunktion. Diese berechnet Preise aus den einzelnen Effektwerten dezimal; die Float-Berechnung des angezeigten Multiplikators bleibt erhalten. Unbelegte Rundung auf ganze Dollar wird nicht angenommen. Die alten Experimente und JSON-Messdaten dokumentieren ausdrücklich das damalige Float-Preismodell. Ihre Differentialtests und Messwerkzeuge verwenden `experiments/legacy_pricing.py`; die produktiven Suchmodi importieren keine Experimente. Alte Profittabellen sind daher keine neue Referenz für geänderte Preise oder Gleichstände.

Der bisherige `calc_modifier.get_best_mix` bleibt als vollständiger Legacy-/Exportpfad mit seinem bisherigen Kombinationsbudget bestehen. Der neue Webpfad verwendet `mix_search.get_best_mix`; Datenbankexport und CLI-Minimumsuche werden dadurch nicht auf einen Beam umgestellt.

Gezielte Vertragstests: `tests/test_search_modes.py`. Sie prüfen unter anderem exakte Ergebnisse gegen vollständige Suche unter dem aktuellen Preismodell, beide Abbruchpfade ohne Fallback und ohne Gewinner, einen erst am Suchende eintretenden Zeitabbruch sowie die Kennzeichnung schneller Ergebnisse. Die früheren Messungen und die wissenschaftlichen Quellen stehen im [Evaluationsbericht](reviews/2026-09-10-bounded-search-research.md).

## Integrationsprüfung am 10.09.2026

- `tools/project.py test`: 101 Tests bestanden im vollständigen Lauf nach der Modusintegration. Eine anschließend im parallelen Export-Task hinzugefügte Testdatei war bei der Discovery dieses Laufs noch nicht enthalten.
- `tools/project.py check`: bestanden, einschließlich Runtime-/Versionpins, Ruff, Biome, Prettier und Syntaxprüfung. Die zwischenzeitlichen Formatabweichungen des parallelen Export-Tasks waren beim abschließenden Check behoben.
- Browserprüfung über den vollständigen Projektstarter in einer isolierten temporären Kopie, Version 1.0.3: OG Kush bei Rang `max` und sechs Schritten zeigt exakt 119,50 Dollar Profit mit `Optimality proven`; der Schnellmodus zeigt 118,30 Dollar mit Näherungskennzeichnung. Bei einer folgenden exakten Anfrage mit 17 Schritten verschwinden sämtliche alten Gewinner und nur der Abbruchtext bleibt sichtbar. Dies ist ein Integrationstest, keine neue Laufzeitmessreihe.
- Der eigene temporäre Server wurde nach Identitätsprüfung beendet und der Prüftab geschlossen. Die Dateien der Integration stehen im Checkout bereit; bereits anderswo laufende App-Instanzen müssen vor Verwendung der Änderungen neu gestartet werden.

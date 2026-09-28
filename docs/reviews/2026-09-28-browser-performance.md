# Browser-Laufzeit: Codex und Microsoft Edge

Stand: 28.09.2026. Forschungsbefund, keine Freigabe einer Algorithmusänderung.

## Fragestellung und gesicherter Rechenweg

Der Nutzer beobachtet einen Unterschied abhängig vom Hosting: lokal auf seinem Rechner
bereitgestellte Anwendung gegenüber der Installation auf seinem Homelab, jeweils auf dem
Rechner bedient. Die Homelab-Adresse ist ausdrücklich
`https://schedule-calc.bananenban.de/`. Als langsamen Browser hatte er Microsoft Edge
genannt, die bisher übermittelte lokale Messung stammt laut Rückfrage aus Codex. Die Ursache
des beobachteten Hosting-Unterschieds ist noch nicht nachgewiesen; lokale Mikrobenchmarks
allein prüfen diesen Unterschied nicht.

Am Prüftag entsprechen die öffentlich geladenen Dateien `script.js`, `search-worker.js` und
`search-engine.js` bytegenau dem Git-Tag `v1.5.1`. Die Oberfläche lädt den Katalog per GET und
übergibt ihn einem lokalen Web Worker. Die Suchschleife enthält keine Serveranfragen und
keine Auswahl eines anderen Algorithmus abhängig von Hostname oder Protokoll. Die noch nicht
veröffentlichte lokale Zwischenstand-Funktion ist nicht Bestandteil der öffentlichen Dateien.

Öffentliche Browserrevision:
`3440f9e5239effacad34fb0cfab986ba62ddc5cfb2e353bcbd31bad6954a000f`.

- SHA-256 Engine: `6bef08a9a9fe8b63c8bad1418e140cb9cffdbffeaa28fee4855072175068af85`.
- SHA-256 Katalog: `8be0ef7917b328d669ad29ef7cce5272cf15c3fdc7eaa07aaa0a36941d8a362f`.
- Modellhash: `ec3863053346f4838591fae2f23efce476d123f7eb5c25512b67ce03372427f7`.

## Auslieferung

Einzelne HTTPS-GETs mit dem Projekt-Python ergaben: HTML 240 ms, Katalog 104 ms,
Worker 82 ms, Engine 129 ms und UI-Skript 134 ms. Der Katalog umfasst 13.881 Bytes,
die Engine 50.976 Bytes. Versionierte Antworten haben
`Cache-Control: public, max-age=31536000, immutable`.

Dies sind einzelne Netzwerkproben, keine Browser-HAR-Messung. Sie belegen weder frühere
Netzwerkbedingungen noch den Cachezustand des Nutzerprofils. Die Antwort enthielt bei diesen
Abrufen kein Content-Encoding; der Python-Client hat keine Komprimierung ausgehandelt.
Daraus folgt kein Befund über fehlende Browser-Komprimierung.

## Kontrollierter Testfall

Alle folgenden Messungen verwenden die verifizierte veröffentlichte Engine und den
veröffentlichten Katalog: **Green Crack / Max / 5 Zutaten / Exact**. Die Sucharbeit beträgt
529.488 Übergangsanfragen. Das Ergebnis ist in allen abgeschlossenen Läufen bewiesen optimal:
109,40 Dollar Profit mit Paracetamol → Gasoline → Cuke → Battery → Mega Bean.

Die Suchzeit kommt aus `result.stats.elapsed_seconds` innerhalb der Engine. Sie enthält
keinen Katalogdownload und keinen Worker-Start. Es ist verstrichene Zeit innerhalb der Suche,
keine vom Betriebssystem gemessene reine CPU-Zeit.

### Node/V8 mit und ohne JIT

Node 22.23.2, V8 12.4.254.21-node.56; je drei neue Prozesse in wechselnder Reihenfolge.
Fortschrittsmeldungen werden wie beim Worker erzeugt und mit `structuredClone` kopiert.

| Modus            |     Lauf 1 |     Lauf 2 |     Lauf 3 |     Median |
| ---------------- | ---------: | ---------: | ---------: | ---------: |
| Normales Node    |   480,2 ms |   463,2 ms |   463,6 ms |   463,6 ms |
| `node --jitless` | 1.887,0 ms | 1.867,4 ms | 1.959,5 ms | 1.887,0 ms |

Ohne JIT dauert derselbe Fall etwa **4,07-mal so lange**. Dies zeigt die Empfindlichkeit des
Algorithmus gegenüber JavaScript-Kompilierung, beweist aber weder die JIT-Einstellung noch
eine konkrete Ursache in Microsoft Edge. Node und der Browser haben unterschiedliche
Umgebungen und möglicherweise unterschiedliche V8-Versionen.

### Codex-Browser mit echtem Worker

Eine temporäre Messseite auf `127.0.0.1:42766` lädt vor dem Test den festen Katalog und startet
für jeden Lauf einen neuen Worker mit unveränderter Release-Engine. Der sichtbare Bericht
erfasst zusätzlich Worker-Start, Zeit von Übergabe bis Ergebnis, Sucharbeit und Hintergrundstatus.
Der Browser meldet Chromium 153; alle drei Läufe blieben sichtbar.

| Lauf | Worker-Start | Engine-Suchzeit | Übergabe bis Ergebnis |
| ---- | -----------: | --------------: | --------------------: |
| 1    |      25,0 ms |        456,1 ms |              457,3 ms |
| 2    |      20,7 ms |        429,0 ms |              430,2 ms |
| 3    |       5,8 ms |        426,2 ms |              427,1 ms |

Median der Engine-Suchzeit: **429,0 ms**. Ergebnis und Arbeitszahl entsprechen der Referenz.
Die Browserkonsole enthielt keine Warnungen oder Fehler. Frühere Zeitmessungen vom
automatisierten Klick bis zum Auslesen sind wegen Werkzeug- und Scheduling-Latenzen kein
präziser Ersatz für diese Messung.

Der anschließend vom Nutzer übermittelte Bericht enthält Suchzeiten von 407,9 / 407,0 /
408,1 ms, also einen Median von **407,9 ms**. Der Worker-Start dauert 5,6–7,1 ms; alle
Läufe bleiben sichtbar und entsprechen der Referenz. Damit ist in diesem lokalen Test
keine Verlangsamung zu sehen. Der Nutzer hat anschließend bestätigt, dass auch dieser
Bericht aus dem Codex-Browser stammt. Es handelt sich daher nicht um eine Edge-Messung und
nicht um einen Hosting-Vergleich.

Edge ist in dieser Sitzung nicht als steuerbarer Browser verbunden. Die Messseite verändert
keine Browsereinstellungen und lädt keine Berichte hoch. Da sie lokal bereitgestellt wird,
erfasst sie keine abweichenden Sicherheitsregeln der öffentlichen Domain.

### Direkter Vergleich der beiden Installationen

Anschließend wurden die echte Homelab-Website und die vollständig gestartete lokale
Anwendung unter `http://127.0.0.1:42765/` im selben Codex-Browser bedient, jeweils mit
Green Crack / Max / 5 / Exact. Beide zeigen denselben bewiesen optimalen Gewinner mit
109,40 Dollar Profit. Die Homelab-Seite liefert auch bei sechs Zutaten das bewiesene
Optimum von 120,30 Dollar; für diesen Lauf liegt keine verlässliche Zeitmessung vor.

Eine erste Serie von Klick-bis-Ergebnis-Messungen schwankte stark. Bei Aufteilung der
Werkzeugaufrufe zeigte sich, dass der Klick nach einem Tabwechsel allein bis zu 2.898 ms
beanspruchte. Ohne erneuten Tabwechsel waren es im Homelab-Kontrolllauf insgesamt 499 ms
(Klickaufruf 278 ms, Ergebniswarteaufruf 221 ms) und lokal 612 ms (282 + 330 ms).
Diese Zeiten enthalten Werkzeuglatenz und sind ausdrücklich keine Engine-Messungen.
Die vorangegangenen scheinbar deutlichen Unterschiede sind damit nicht belastbar.

Der direkte Test reproduziert bislang keine beständige Verlangsamung durch das Hosting
im Codex-Browser. Er widerlegt die Nutzerbeobachtung in Edge nicht. Der Nutzer hat
anschließend eingegrenzt: Die Verzögerung tritt bei größeren Zutatenzahlen während
„Searching locally“ mit steigendem Operationszähler auf; fünf Zutaten sind noch schnell.
Damit betrifft die Beobachtung die laufende Suche nach dem Laden des Modells, nicht das
anfängliche Warten auf Suchdaten. Der lokal ausgelieferte Katalog ist bytegleich mit dem
verifizierten öffentlichen Katalog (SHA-256 siehe oben).

Beim erneuten Aufruf der echten Homelab-Website meldet der Nutzer schließlich selbst,
dass sie deutlich schneller ist. Anwendungscode, Homelab-Deployment und Browser-Sicherheit
wurden während dieses Vergleichs nicht geändert. Ein vorübergehender Einfluss ist daher
plausibel; eine konkrete Ursache wie CPU-Last, Speicherdruck oder Browserzustand ist damit
nicht bewiesen. Der Befund lautet: derzeit nicht beständig reproduzierbar, kein nachgewiesener
Hosting- oder Algorithmusfehler. Weitere große Benchmarks wurden daraufhin nicht gestartet.

Eine zusätzliche Codeprüfung bestätigt: Fehler beim Laden der Assets, Katalog-429,
Worker-Fehler oder fehlende Browserunterstützung führen zu sichtbaren Fehlern beziehungsweise
deaktivierten Schaltflächen, nicht zu einem automatischen Wechsel zur Serverberechnung.
Der ungenutzte Legacy-Code unter `webapp/js/script.js` enthält zwar einen POST-Aufruf;
das ausgelieferte Template lädt aber `webapp/static/js/script.js` über die Browserrevision.
Die Server-Rechenwege erfordern unabhängig davon einen autorisierten API-POST.

## Browserhypothesen und Grenzen

Microsoft dokumentiert, dass Edges erhöhte Sicherheit JavaScript-JIT deaktiviert und je nach
Modus auf unterschiedliche Websites angewendet wird. Das kann einen großen Unterschied bei
CPU-intensiver Suche erklären. Der Nutzer sieht auf der öffentlichen Website jedoch keinen
Hinweis auf zusätzliche Sicherheit; die Hypothese ist daher **nicht bestätigt**.
[Microsoft: erhöhte Sicherheit](https://support.microsoft.com/en-us/edge/enhance-your-security-on-the-web-with-microsoft-edge).

Eine automatische Ausnahme für localhost oder Intranet wird nicht angenommen. Microsoft
dokumentiert für die Intranet-Ausnahme eine eigene Richtlinie.
[Microsoft: EnhanceSecurityModeBypassIntranet](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-policies/EnhanceSecurityModeBypassIntranet).

Chromes dokumentiertes Energy-Saver-Freezing betrifft länger unsichtbare, stille Seiten unter
zusätzlichen Bedingungen. Die ebenfalls dokumentierte Drosselung verketteter Timer ist für
sich keine Erklärung für diese synchron rechnende Worker-Schleife im Vordergrund.
[Chrome: Energy Saver](https://developer.chrome.com/blog/freezing-on-energy-saver),
[Chrome: Timer-Drosselung](https://developer.chrome.com/blog/timer-throttling-in-chrome-88).

## Profiling und nächste Untersuchung

Je ein Node-CPU-Profil mit normaler Ausführung und `--jitless` zeigt rund 29–30 % der
Self-Samples in `runtime.transition`. Dort werden für jeden tatsächlich berechneten Übergang
Paare und eine neue `Map` angelegt und die Effektfolge erneut als Array erzeugt.
`stateKey` und der Übergangs-Wrapper sind weitere auffällige Kostenstellen. Ohne JIT werden
zusätzlich Effektbewertung und kompensierte Float-Summierung teurer.

Das stützt ein begrenztes Experiment mit kleinen Arrays für die Effektübergänge. Es muss
Reihenfolge, Entfernen/Wiedereinfügen, Deduplizierung und sämtliche Gleichstandsregeln erhalten.
Der Befund rechtfertigt keine approximative Kürzung des exakten Suchraums. Einzelne
statistische Profile sind keine präzise Prognose einer Edge-Beschleunigung.

Die Rohdaten und temporären Messprogramme liegen unter
`%TEMP%/schedule1-performance-20260928/`, einschließlich `delivery-evidence.json`,
`jit-results.json`, `normal.cpuprofile`, `jitless.cpuprofile` und `diagnostic.html`.

### Separates Array-Experiment

Eine temporäre Kopie der Release-Engine ersetzt ausschließlich die `Map` im Effektübergang
durch ein kleines Array. Entfernen, späteres Wiedereinfügen und Deduplizierung bleiben in
derselben Reihenfolge. Die produktive Engine wurde dafür nicht geändert.

- 320.000 direkte Vergleiche mit der bisherigen Übergangsfunktion stimmen überein:
  20.000 deterministische Zustände × 16 synthetische Zutaten, einschließlich doppelter
  Einträge und Ersetzungsziele, Selbstersetzungen und bereits vorhandener Ziele.
- 38 vollständige Engine-Vergleiche stimmen nach Ausklammern der Laufzeit überein:
  alle neun Produkte mit Exact/Fast auf niedrigem Rang bei Tiefe 1 und 2 sowie
  Green Crack/Max/5 in beiden Modi. Ergebnisreihenfolge und Arbeitsstatistik bleiben gleich.
- Je drei neue Node-Prozesse pro Variante, wechselnde Reihenfolge AB / BA / AB:

| Ausführung     | Bisher, Median | Array, Median | Änderung der Laufzeit |
| -------------- | -------------: | ------------: | --------------------: |
| Normal mit JIT |       494,1 ms |      364,1 ms |               −26,3 % |
| Ohne JIT       |     1.955,9 ms |    1.931,6 ms |                −1,2 % |

Die Tabelle misst den gesamten synchronen `search`-Aufruf einschließlich Runtime-Aufbau;
die reine Engine-Suchzeit liegt jeweils rund 1 ms darunter. Alle Benchmarkläufe haben
529.488 Übergangsanfragen, denselben Gewinner und bewiesene Optimalität. Die kleine
Abweichung ohne JIT liegt innerhalb der beobachteten Laufzeitschwankung und ist kein
belastbarer Geschwindigkeitsgewinn.

Das ist ein aussichtsreicher Optimierungsansatz für normale JIT-Ausführung, keine Erklärung
für den gemeldeten Browserunterschied. Die Messungen gelten für diesen Testfall in Node;
größere Suchtiefen, gezielte Effektsuche und der aktuelle lokale Zwischenstand-Code sind noch
nicht mit dem Kandidaten geprüft. Breite Stichproben ersetzen keinen allgemeinen Beweis.
Der Lead hat den tatsächlichen Diff und die Prüfprogramme kontrolliert.

Zusätzliche Nachweise im temporären Verzeichnis: `candidate-array-engine.cjs`,
`array-transition-validation.cjs`, `array-transition-validation-results.json`,
`array-benchmark-once.cjs`, `run-array-benchmarks.cjs` und `array-benchmark-results.json`.

In dieser Untersuchung wurden weder Anwendungscode noch Browser-Sicherheitsregeln geändert.
Die bereits vorhandenen Änderungen zur Zwischenstand-Anzeige bleiben bestehen.

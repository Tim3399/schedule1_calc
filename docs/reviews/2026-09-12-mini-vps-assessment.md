# Schedule Calc auf dem Mini-VPS

Bewertung am 12.09.2026 für **1 vCPU, 2 GB RAM und 20 GB SSD** unter b825.de.
Geprüft wurde der lokale Entwicklungsstand nach Effektauswahl und Ausschlussmodus auf Basis
von Version 1.5.0. Es wurde nichts veröffentlicht oder auf dem VPS verändert.

Nachtrag vom selben Tag: Die anschließende Arbeit an den Request-Limits hat die unten
beschriebenen Logging-Probleme lokal behoben und Größen-, Verbindungs- sowie Anfrageratenlimits
ergänzt. Versionierte Browser-Ressourcen vermeiden die bisherige erneute Asset-Validierung.
Der aktuelle Vertrag steht in [HTTP-Auslieferung und Limits](../HTTP_DELIVERY.md).
Die folgenden Messwerte und Befunde beschreiben den ursprünglichen Bewertungsstand;
VPS-Konfiguration, Container-Logrotation und Linux-Lasttest bleiben offen.

**Empfehlung: geeignet.** Der Rechner benötigt öffentlich keine serverseitigen Suchläufe und
keine Datenbank. Nach dem Laden von Oberfläche und Spieldaten laufen Exact, Fast und eigene
Rezepte auf dem Gerät des Besuchers. Eine hohe Zahl gleichzeitig rechnender Browser erzeugt
deshalb keine entsprechende Zahl von Suchprozessen auf dem VPS. Seitenaufrufe, Datenübertragung
und TLS benötigen weiterhin Serverressourcen.

## Nachweise aus der Anwendung

Ein frischer Prozess der ausgewählten Windows-Umgebung (Python 3.12.14) hat mit dem Flask-Testclient
je 50 Anfragen an `/`, `/search-data` und die sechs CSS-/JS-Ressourcen ausgeführt.

| Messung                                        |         Ergebnis |
| ---------------------------------------------- | ---------------: |
| HTML                                           |     36.482 Bytes |
| Spieldaten                                     |     13.882 Bytes |
| Alle acht Ressourcen zusammen, unkomprimiert   |    199.875 Bytes |
| Summe nach separater lokaler Gzip-Kompression  |     36.920 Bytes |
| Spitzen-Working-Set des gesamten Testprozesses |        36,98 MiB |
| Private Bytes nach den Abrufen                 |        26,43 MiB |
| Median pro Anfrage innerhalb des Testclients   |   0,196–0,416 ms |
| Anonyme `POST /` und `POST /get_best_mix`      | jeweils HTTP 404 |

Diese Werte enthalten weder Netzwerk/TLS noch Waitress, Docker oder das VPS-Betriebssystem.
Die Gzip-Zahl ist eine Kompressionsmessung, kein Nachweis einer bereits aktiven Proxy-Kompression.
Aus den lokalen Antwortzeiten wird keine Besucher- oder Requests-pro-Sekunde-Garantie abgeleitet.
Die Messung belegt die geringe Größe und den geringen Grundaufwand der Anwendung.

Die Modelldaten werden einmal pro Prozess aufgebaut. Modell und statische Ressourcen besitzen
ETags; `Cache-Control: no-cache` erlaubt Speicherung mit erneuter Validierung. Unversionierte
Asset-URLs sollten nicht pauschal mit langfristigem `immutable`-Caching ausgeliefert werden.

## Passender Betriebsrahmen

- Vorhandenes Release-Image nach Digest aus der Registry beziehen. Build und CI weiter außerhalb
  des Mini-VPS ausführen. Das derzeit veröffentlichte Image enthält die jüngsten lokalen
  Effektauswahländerungen noch nicht.
- Ein App-Prozess mit den vorhandenen vier Waitress-Threads hinter dem HTTPS-Proxy genügt als
  Ausgangspunkt. Threads bearbeiten HTTP-Anfragen; sie starten keine Browsersuchen auf dem Server.
  Waitress dokumentiert diese Einstellungen in seiner
  [Argumentreferenz](https://docs.pylonsproject.org/projects/waitress/en/stable/arguments.html).
- Als anfängliches **App-Speicherlimit 256 MiB** vorsehen und im Linux-Betrieb prüfen. Das ist ein
  vorgeschlagener Schutzrahmen, kein gemessener maximaler Produktionsbedarf. Bei 2 GB Gesamtspeicher
  bleibt bei einer schlanken Installation Platz für Betriebssystem, Docker und Proxy; vorhandene
  andere Dienste müssen vor Ort berücksichtigt werden.
- `SCHEDULE1_API_TOKEN` nicht setzen, sodass serverseitige Rechenwege vollständig deaktiviert
  bleiben. Der Web-Container erhält nur einen internen beziehungsweise Loopback-Port.
- Proxy-Kompression für HTML, CSS, JavaScript und JSON aktivieren. Request-Body-Limits klein
  halten: Die öffentliche Anwendung lädt keine Dateien hoch. Die Waitress-Vorgabe von 1 GiB
  ist für diesen Dienst unnötig groß; etwa 64 KiB ist ein passender Startwert.
- 20 GB SSD sind für diese Anwendung ausreichend, wenn Logs und alte Images begrenzt bleiben.
  Platz für Betriebssystem-Updates und ein vorheriges Release zum Rollback freihalten; den
  Build-Cache nicht auf diesem Host ansammeln.

## Vor dem Deployment zu erledigen

1. **Datei-Logging korrigieren.** `src/functionality/logging/logging_config.py` nennt im Kommentar
   1 MB, verwendet aber `maxBytes=1_000_000_000_000` (1 TB) und zehn Backups. Zusätzlich erzeugt
   das Datum im Basisnamen bei späteren Neustarts weitere Dateien außerhalb derselben Rotation.
   `calc_modifier.py` und `webapp/app.py` registrieren zudem beide dieselben Logging-Handler,
   sodass spätere Meldungen doppelt in Datei und Konsole erscheinen.
   Im Container vorzugsweise nur auf stdout/stderr protokollieren und die Docker-Logs begrenzen;
   alternativ einen festen Dateinamen mit kleiner, begrenzter Rotation verwenden.
2. **Betriebslimits im neuen Ziel hinterlegen.** Die vorhandene Schedule-Compose-Datei enthält
   weder ein Speicherlimit noch eine eigene Docker-Logbegrenzung. Der Docker-Standardtreiber
   `json-file` rotiert standardmäßig nicht; Docker empfiehlt dafür den automatisch rotierenden
   [`local`-Treiber](https://docs.docker.com/engine/logging/configure/). Eine explizite kleine
   Rotation mit Größen- und Dateizahlgrenze ist ebenfalls möglich.
3. **VPS als eigenen Zielhost aufnehmen.** Das gelesene Infra-Inventar zeigt auf den Heimserver
   `192.168.178.101`. Es ist kein Nachweis für freien RAM, SSD oder laufende Dienste des Mini-VPS.
   Das veröffentlichte Container-Artefakt unterstützt derzeit nur Linux/amd64; die VPS-Architektur
   muss dazu passen. Bei ARM ist ein separat gebautes und geprüftes Artefakt erforderlich.
4. **DNS/TLS für den konkreten Hostnamen festlegen.** Die vorhandenen Infra-Unterlagen schützen
   das bestehende Hosting von `b825.de` und `www.b825.de`. Für diese Bewertung wurde weder deren
   Belegung noch eine DNS-Zuordnung geändert. Eine eigene Subdomain kann unabhängig eingerichtet
   werden, sobald das gewünschte öffentliche Ziel feststeht.

Ein kurzer Linux-Lasttest mit Seiten-/Modellabrufen und Beobachtung von RSS, CPU, Antwortzeiten
und freiem Speicher bleibt Teil der späteren Inbetriebnahme. Aktuelle VPS-Auslastung, freie
SSD, CPU-Architektur, Netzwerkrate und Reverse-Proxy-Konfiguration wurden nicht live gemessen.
Die Bewertung erfordert keine Änderung des Suchalgorithmus oder Verlagerung seiner Arbeit auf
den Server.

Das unabhängige Code-Review hat außerdem bestätigt: Die HTTP-Sperre greift vor der Python-Suche,
aber erst nach möglicher Annahme des Request-Bodys durch Waitress. Das kleine Body-Limit gehört
deshalb an den vorgeschalteten Proxy beziehungsweise direkt in die Waitress-Konfiguration.

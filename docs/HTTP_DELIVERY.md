# HTTP- und Browser-Delivery

Dieses Dokument beschreibt den aktuellen Produktionsvertrag. Die Argumente von Waitress sind in
der [Waitress-Referenz](https://docs.pylonsproject.org/projects/waitress/en/stable/arguments.html)
erläutert.

## Produktionsserver

Der Container startet `python -m webapp.serve` und lauscht standardmäßig auf
`0.0.0.0:8080`. `--host` und `--port` dienen lokalen Prüfbindungen; ungültige Argumente beenden den
Start. Der Entwicklungslauncher `tools/project.py start` verwendet weiterhin Werkzeug und setzt die
folgenden Transportgrenzen nicht durch.

| Waitress-Einstellung     | Wert        |
| ------------------------ | ----------- |
| Threads                  | 4           |
| Aktive Verbindungen      | 32          |
| TCP-Backlog              | 64          |
| Inaktivitätsfrist        | 30 Sekunden |
| Bereinigungsintervall    | 5 Sekunden  |
| Request-Header           | 16 KiB      |
| Request-Body             | 64 KiB      |
| Input-Pufferüberlauf     | 64 KiB      |
| Output-Pufferüberlauf    | 256 KiB     |
| Output-High-Watermark    | 1 MiB       |
| Tracebacks in Antworten  | aus         |
| Vertrauenswürdiger Proxy | keiner      |

`Forwarded` und `X-Forwarded-*` verleihen einem Client daher keine andere Identität oder
Vertrauensstellung. Ein vorgeschalteter Proxy benötigt eine spätere, explizite Konfiguration mit
konkreten vertrauenswürdigen Adressen; ein Wildcard-Proxy gehört nicht zum Vertrag.

## Anwendungsgrenzen

Ein konstanter Token-Bucket gilt gemeinsam für alle Requests des Prozesses, alle Routen und alle
Besucher. Er ist keine Rate-Limitierung je IP oder Benutzer. Der Standard beträgt 30 Requests pro
Sekunde mit Burst 60. `SCHEDULE1_HTTP_RATE_PER_SECOND` und `SCHEDULE1_HTTP_BURST` ändern diese Werte;
beide müssen endlich und positiv sein, der Burst außerdem mindestens 1.

Ist das Budget leer, antwortet die Anwendung sofort mit HTTP 429, `Retry-After` und
`Cache-Control: no-store`. Der Browser wiederholt solche Requests nicht automatisch. Bei mehreren
Containerprozessen besitzt jeder Prozess sein eigenes Budget; eine hostweite oder verteilte Grenze
muss die Betriebsumgebung bereitstellen.

Flask begrenzt Request-Bodies auf 64 KiB, ein Nicht-Datei-Feld in `multipart/form-data` auf 16 KiB
und Multipart-Teile auf 8. Diese Einstellungen entsprechen `MAX_CONTENT_LENGTH`,
`MAX_FORM_MEMORY_SIZE` und `MAX_FORM_PARTS` aus den
[Flask-Sicherheitshinweisen](https://flask.palletsprojects.com/en/stable/web-security/#resource-use).
Waitress und Flask erzwingen denselben Body-Höchstwert auf unterschiedlichen Protokollschichten.

Die alten Rechen-POST-Endpunkte bleiben ohne `SCHEDULE1_API_TOKEN` deaktiviert. Mit Token verlangen
sie `Authorization: Bearer ...`. Genau eine Serverberechnung darf gleichzeitig laufen; ein
überlappender autorisierter Request erhält HTTP 429, statt einen HTTP-Thread in einer Warteschlange
zu belegen.

## Cache- und Revisionsvertrag

Beim Prozessstart erstellt die Anwendung einen unveränderlichen Snapshot aus dem Browsermodell und
allen Dateien unter `webapp/static`. Der SHA-256-Revisionswert bindet Ressourcennamen, stabile
MIME-Typen und Inhalte. HTML verweist Modell und sämtliche CSS-/JavaScript-Dateien auf genau diese
Revision:

```text
/browser/<digest>/search-data
/browser/<digest>/static/<path>
```

Diese Antworten tragen `Cache-Control: public, max-age=31536000, immutable` und einen inhaltsbezogenen
ETag. Dazu gehören auch relative Worker-Abhängigkeiten: `importScripts("search-engine.js")` löst
innerhalb desselben Revisionsverzeichnisses auf. Die Bedeutung von `immutable` und `no-store`
beschreibt die [MDN-Referenz zu Cache-Control](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control).

`/` trägt `Cache-Control: no-cache` und einen ETag. Die Legacy-Pfade `/search-data` und `/static/...`
bleiben für Kompatibilität verfügbar und werden per ETag revalidiert. Nach einem Neustart bedient
der Prozess nur seinen neuen Snapshot; eine URL mit einer alten oder unbekannten Revision liefert 404. Der Client muss dann `/` neu laden. Änderungen an Modell oder statischen Dateien werden erst
nach einem Prozessneustart sichtbar.

## Logging und Nachweise

Im Container schreibt die Anwendung ausschließlich auf Standardausgabe und Standardfehler. Rotation
und Aufbewahrung übernimmt der konfigurierte Docker-Logging-Treiber; dessen Einrichtung ist eine
[Aufgabe der Docker-Betriebsumgebung](https://docs.docker.com/engine/logging/configure/). Lokal schreibt
die Anwendung zusätzlich nach `src/functionality/logging/logs/sh_log.log`, rotiert bei 1 MiB und
behält fünf Backups. Wiederholte Importe installieren keine doppelten eigenen Handler.

Lokale Sockettests mit Waitress 3.0.2 haben normale GET-/HEAD-Antworten sowie HTTP 413 für deklarierte
und chunked Bodies über 64 KiB, HTTP 431 für zu große Header und HTTP 429 einschließlich
`Retry-After`/`no-store` geprüft. Verschiedene willkürliche `X-Forwarded-For`-Werte umgehen das globale
Budget dabei nicht.

Eine reale Browsermessung am 12.09.2026 mit normaler Navigation und aktivem Cache ergab für eine
kalte neue Revision einschließlich erster Standardsuche acht GETs: HTML, fünf CSS-/JavaScript-Dateien,
Modell und Worker; der relative Engine-Import traf bereits den Seitencache. Weitere Suchen und die
Tabwechsel „Your Recipe“/„Match Effects“ erzeugten keine Requests. Ein neuer Browser-Tab derselben URL
mit erfolgreicher Suche erzeugte nur `GET /` mit HTTP 304 und keine Asset-, Modell- oder
Worker-Requests. Die Browserkonsole zeigte keine Warnungen oder Fehler. Ein lokaler Docker-Build und
ein VPS-Lasttest wurden nicht durchgeführt.

`tools/project.py test` bestand mit 205 Tests; nach der abschließenden Anpassung des
429-Hinweistexts bestanden die drei betroffenen Browser-UI-Suiten mit 32 Tests erneut.
`tools/project.py check` und `git diff --check` bestanden ebenfalls. Die Konfigurationswerte für
Verbindungslimit und Inaktivitätsbereinigung sind geprüft; ihre Sättigung wurde nicht durch einen
Lasttest simuliert.

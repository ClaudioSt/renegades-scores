# LeagueSphere API – Strukturanalyse & Vorschlag für ein sinnvolleres Design

**Datum:** 30. Juli 2026
**Basis:** `leaguesphere-api-analysis.md` (Feldanalyse vom 25. Mai 2026) + praktische Erfahrung
aus `_gen_snapshot.js` / `standings.js` in diesem Repo, wo alles nachgebaut werden musste,
was die API nicht liefert.

Dieser Bericht beantwortet zwei Fragen:
1. **Was fehlt der aktuellen API strukturell** (nicht nur auf Feldebene, sondern architektonisch)?
2. **Wie müsste eine API aussehen**, die Anwendungsfälle wie "zeig mir Team X komplett" oder
   "zeig mir die Tabelle der Liga Y" nativ unterstützt, statt sie dem Client aufzubürden?

---

## 1. Ausgangsbefund: Diese API ist Event-zentriert, nicht Team- oder Liga-zentriert

Die gesamte LeagueSphere-API ist um **eine** Ressource herum gebaut: den *Gameday* (Spieltag).

```
GET /api/gamedays/                          → Liste aller Spieltage (flach, alle Ligen gemischt)
GET /api/gamedays/{id}/games/               → Spiele eines Spieltags
GET /gamedays/gameday/{id}/game/{game_id}   → Play-by-play (HTML, kein JSON, kein CORS)
GET /passcheck/team/all/list/               → Team-Namen (HTML-Scrape, kein JSON-Endpoint)
GET /liveticker/                            → Live-Status (Struktur nur teilweise bekannt)
```

Es gibt **keine** Ressource für:
- ein Team als Ganzes (Name, Liga-Zugehörigkeit, alle Spiele über Saisons hinweg)
- eine Liga als Ganzes (Teilnehmer, Saison, Tabelle)
- eine Tabelle/Standings überhaupt

Jede sinnvolle Frage ("Wie hat Team X in dieser Saison gespielt?", "Wie sieht die Tabelle
der FF BL aus?") lässt sich nur beantworten, indem man **alle** Spieltage lädt und clientseitig
filtert/aggregiert. Das ist der Kernbefund, der auch dieses Projekt gezwungen hat,
`_gen_snapshot.js` und `standings.js` zu bauen, statt einfach einen Endpoint abzufragen.

---

## 1a. Auffälligkeiten auf einen Blick

Kurzübersicht aller Beobachtungen aus diesem Bericht, bevor sie im Detail ausgeführt werden:

| # | Beobachtung | Kategorie |
|---|---|---|
| 1 | Keine Team-Ansicht/Endpoint — Team-Historie nur durch Laden **aller** 734 Spieltage rekonstruierbar | Struktur |
| 2 | Keine Tabellen-/Standings-Ressource — Ligaordnung (Punktequotient, Aufstiegssperren) muss clientseitig neu implementiert werden | Struktur |
| 3 | `?league=`-Filter auf `/api/gamedays/` wirkungslos, keine adressierbare Liga/Saison-Ressource | Struktur |
| 4 | Play-by-play nur als HTML ohne CORS, kein JSON-Endpoint | Struktur |
| 5 | Teamnamen nur über zweckentfremdeten `/passcheck/`-HTML-Scrape auflösbar, nicht vollständig | Struktur |
| 6 | Uneinheitliche Status-/Format-Werte (leerer String vs. `DRAFT` vs. `PUBLISHED`; lokalisierte Strings wie `"beendet"`) | Struktur |
| 7 | **Keine Authentifizierung für irgendeinen Call** — komplette API (inkl. aller Ligen/Teams, nicht nur der hier relevanten) ist ohne Auth lesbar | Sicherheit |
| 8 | `DRAFT`-Spieltage (laut API-Konvention "nicht veröffentlicht") sind trotzdem öffentlich ohne Auth abrufbar — Entwurfsstatus ist rein kosmetisch, keine echte Zugriffskontrolle | Sicherheit |
| 9 | `page_size` scheinbar unbegrenzt (9999 liefert alle Datensätze in einem Request) — kein serverseitiges Rate-Limiting beobachtet | Sicherheit |
| 10 | `author`-Feld (interne User-ID des Erstellers) wird ungeschützt in einer öffentlichen, unauthentifizierten Response mitgeliefert | Sicherheit |

---

## 2. Konkrete strukturelle Probleme

### 2.1 Kein Team-Endpoint → N+1-Problem beim Datenabruf

Um herauszufinden, welche Spieltage Team 159 überhaupt betreffen, gibt es zwei Strategien,
beide schlecht (siehe `leaguesphere-api-analysis.md`, Abschnitt 6):

- **Volle Pagination:** alle 734 Spieltage laden (bei `page_size=1000` immerhin 1 Request),
  dann für **jeden einzelnen** Spieltag `/api/gamedays/{id}/games/` abrufen und nach `team_id`
  filtern → **735 Requests**, nur um die Historie eines Teams zu rekonstruieren.
- **Suche über `name`:** funktioniert nur für Spieltage, die nach dem gesuchten Team benannt
  sind (Heimspieltage) – Auswärtsspiele werden nicht gefunden, weil der Liganame/Teamname des
  Gegners im Spieltagnamen steht, nicht der eigene.

Es gibt keinen Weg, direkt zu fragen: *"Alle Spiele von Team 159."* Das ist der Grund, warum
dieses Projekt einen kompletten Snapshot-Cache mit täglichem Full-Rebuild braucht, statt live
zu fragen.

### 2.2 Keine Tabelle/Standings-Ressource → Ligaordnung wird im Client dupliziert

`standings.js` in diesem Repo berechnet die Tabelle (SQ, EP, GP, PD, S/U/N) manuell aus rohen
Spielergebnissen – inklusive der Aufstiegs-Sperrregel nach §28.3 Ligaordnung
(`promotion_restricted`), die **nirgendwo in der API steht** und komplett manuell in
`league-config.json` gepflegt werden muss (Mapping Liga → Saison → Spieltag-IDs).

Das bedeutet: Jeder, der eine Tabelle anzeigen will, muss
1. wissen, welche Spieltag-IDs zu welcher Liga/Saison gehören (die API sagt es nicht
   zuverlässig – `league`-Filter funktioniert laut Analyse **nicht**, `league_display` ist nur
   ein Anzeigename ohne stabile Zuordnung zu einer Saison-Instanz),
2. die Punktequotienten-Formel der Ligaordnung selbst implementieren,
3. Promotion-Sperren aus einem externen Regelwerk (PDF/Satzung) manuell nachpflegen.

Das ist fachliche Logik, die eindeutig auf Serverseite gehört – LeagueSphere kennt die Liga,
die Saison und die Ligaordnung, der Client muss sie erraten.

### 2.3 Play-by-play nur als HTML ohne CORS

`/gamedays/gameday/{id}/game/{game_id}` liefert eine komplette HTML-Seite, aus der
`_gen_snapshot.js` eine Tabelle mit CSS-Klasse `game-log-table` per Regex herausparsen muss
(`parseGameLog()`). Es gibt:
- keinen JSON-Endpoint für Spielverlauf/Play-by-play-Events,
- keinen `Access-Control-Allow-Origin`-Header, wodurch der Browser direkt blockiert wird.

Das zwingt jede Konsumenten-App dazu, einen Server-Proxy zu betreiben (wie hier: täglicher
Node-Job, der serverseitig scraped und das Ergebnis vorbereitet), obwohl das für reine
Lesezugriffe unnötig ist.

### 2.4 Team-Namen nur über HTML-Scrape auflösbar

Der eigentliche Vereinsname ("Nürnberg Renegades") kommt nicht aus der Gamedays/Games-API,
sondern nur aus `/passcheck/team/all/list/` – einer HTML-Seite, die für einen komplett anderen
Zweck (Passkontrolle) gebaut wurde und zufällig alle Teamnamen enthält. `_gen_snapshot.js` hat
zusätzlich eine manuelle `NAME_MAP` und eine Heuristik (`inferName()`), die aus den
Spieltag-Namen der Heimspiele den wahrscheinlichen Vereinsnamen rekonstruiert, weil selbst der
Scrape nicht für alle Team-IDs etwas liefert. Das ist mehrfach redundante Fallback-Logik für
etwas, das ein einzelnes Feld `full_name` auf der Team-Ressource sein sollte.

### 2.5 Inkonsistente/nicht-normalisierte Statuswerte

- Gameday-`status`: `""`, `"DRAFT"`, `"PUBLISHED"` – drei Werte für zwei Zustände
  (unveröffentlicht vs. veröffentlicht), einer davon ein leerer String statt eines Enums.
- Game-`status`: u. a. `"beendet"` (deutsch, string-literal) wird im Code direkt verglichen
  (`game.status === 'beendet'`) – keine sprachneutrale Konstante/kein Enum.
- `format` (Spielmodus) hat mit/ohne Unterstrich und mit/ohne Leerzeichen faktisch dieselbe
  Bedeutung (`"NRW U13_Gruppen1_Felder2"` vs. `"NRW_U13_Gruppen1_Felder2"`) – nicht
  maschinenlesbar ohne Normalisierungstabelle.

### 2.6 Liga/Saison sind nicht als adressierbare Ressourcen modelliert

`league` und `season` sind nur Fremdschlüssel-Integer ohne dokumentierte `/api/leagues/{id}/`
bzw. `/api/seasons/{id}/`-Endpoints (zumindest keine bekannten, nutzbaren). Der Filter
`?league=` auf `/api/gamedays/` ist laut Analyse wirkungslos. Das bedeutet: "Liga" existiert
in der API praktisch nur als Anzeigetext (`league_display`), nicht als abfragbare Entität.

---

## 3. Sicherheits-Review: API ohne Authentifizierung

Zusätzlich zur strukturellen Analyse ein kurzer Blick auf die Sicherheitsseite der API, da
`CLAUDE.md` und die Integrations-Doku dieses Repos bereits festhalten: *"LeagueSphere API
(public, no auth)"*. Das ist für dieses Projekt praktisch (kein Auth-Handling nötig), aus
API-Design-Sicht aber bemerkenswert offen:

### 3.1 Keine Authentifizierung für sämtliche Endpoints

Alle bekannten Endpoints (`/api/gamedays/`, `/api/gamedays/{id}/games/`,
`/passcheck/team/all/list/`, `/gamedays/gameday/{id}/game/{game_id}`, `/liveticker/`) sind
ohne API-Key, Token oder Session-Cookie erreichbar. Das betrifft nicht nur die für dieses
Projekt relevanten Ligen (DKB DFFL, FF BL, RL Bayern), sondern **alle** Ligen und Teams, die
LeagueSphere insgesamt verwaltet — die komplette Plattform-Datenbasis ist per einfachem
`GET`-Request auslesbar. Für öffentliche Sportergebnisse ist das nicht per se falsch (die
Ergebnisse sollen ja öffentlich sein), aber es bedeutet auch: Es gibt keine Unterscheidung
zwischen "öffentlich sichtbaren" und "nur für Vereine/Verband sichtbaren" Daten auf
API-Ebene — die einzige Kontrolle ist, ob ein Client die richtige ID/den richtigen Pfad kennt
("security through obscurity" statt echter Autorisierung).

### 3.2 `DRAFT`-Status ist keine echte Zugriffskontrolle

Aus der Feldanalyse (`leaguesphere-api-analysis.md`, Abschnitt 2, Feld `status`): Spieltage
mit Status `""` oder `"DRAFT"` gelten laut Beobachtung als *"noch nicht offiziell
veröffentlicht"* — sind aber über denselben unauthentifizierten Endpoint genauso abrufbar
wie `"PUBLISHED"`-Spieltage, inklusive echter Spieldaten (bestätigt am Beispiel Spieltag 834).
Das heißt: Der Entwurfsstatus ist ein reines UI-Flag für die LeagueSphere-Oberfläche selbst,
aber **keine serverseitige Zugriffsbeschränkung**. Wer die ID eines Entwurfs-Spieltags kennt
(oder einfach alle IDs durchprobiert/paginiert), sieht dieselben Daten wie nach der
Veröffentlichung. Für einen Verband, der Entwürfe vor der Öffentlichkeit verbergen will, ist
das ein Zielkonflikt zwischen der eigenen Konvention ("DRAFT = nicht öffentlich") und der
tatsächlichen API-Implementierung ("DRAFT = trotzdem öffentlich lesbar"). Für dieses Projekt
selbst ergibt sich daraus indirekt die Notwendigkeit, bewusst zu entscheiden, ob
`snapshot.json` (welches öffentlich auf GitHub Pages liegt) auch `DRAFT`-Spieltage
weiterverbreiten soll.

### 3.3 Kein beobachtbares Rate-Limiting

`page_size=1000` bzw. `9999` liefert laut Analyse alle 734 Spieltage in einem einzigen
Request in ca. 12 Sekunden, ohne dass ein Limit, ein `429 Too Many Requests` oder ein
Retry-After-Header beobachtet wurde. `_gen_snapshot.js` throttelt sich selbst (Batch-Größe 5,
100 ms Pause, exponentielles Retry) rein aus Vorsicht/Fairness gegenüber dem Server — nicht,
weil der Server das erzwingt. Ohne serverseitiges Rate-Limiting ist die API grundsätzlich
anfällig für unabsichtliche oder mutwillige Überlastung durch Drittclients, die sich nicht
so rücksichtsvoll verhalten wie dieses Projekt.

### 3.4 Geringfügiges Info-Disclosure über `author`

Das `author`-Feld auf Spieltagen (interne Nutzer-ID des Erstellers, siehe
`leaguesphere-api-analysis.md` Abschnitt 2) wird ungefiltert in derselben öffentlichen,
unauthentifizierten Response ausgeliefert wie die Spieldaten. Isoliert betrachtet harmlos
(nur eine Zahl, kein Name), aber ein Beispiel dafür, dass interne/administrative Felder nicht
von der öffentlichen Repräsentation getrennt sind — ein API-Response-Schema sollte zwischen
"public view" und "internal/admin view" unterscheiden, statt ein einziges Objekt für beide
Zwecke zu benutzen.

### 3.5 Einordnung

Keiner der Punkte ist ein klassischer "Exploit" (kein Zugriff auf fremde Konten, keine
Schreibrechte beobachtet, keine Passwörter/Secrets involviert) — es handelt sich um
**Absenz von Zugriffskontrolle und Ratenbegrenzung** bei einer ansonsten als "öffentlich"
gedachten Sport-API. Relevant wird das vor allem dort, wo LeagueSphere selbst zwischen
öffentlich und nicht-öffentlich unterscheiden will (z. B. `DRAFT`-Status) — die Trennung
existiert nur in der UI, nicht auf API-Ebene.

---

## 4. Wie eine sinnvoller aufgebaute API aussehen sollte

Der Leitgedanke: **API-Design entlang der Fragen, die Nutzer tatsächlich stellen** (Team,
Liga/Tabelle, Spieltag), statt nur entlang der internen Datenbank-Struktur (Gameday → Games).

### 4.1 Team als First-Class-Ressource

```
GET /api/teams/{id}/
→ { id, full_name, short_name, club, current_leagues: [...], seasons: [2025, 2026] }

GET /api/teams/{id}/games/?season=2026
→ flache Liste ALLER Spiele dieses Teams über alle Spieltage/Ligen der Saison,
  jeweils mit gameday_id, date, opponent, score, status, league

GET /api/teams/{id}/games/?since=2026-01-01
→ inkrementeller Abruf für Live-/Delta-Updates
```

Damit entfällt der komplette "735-Requests-um-ein-Team-zu-finden"-Umweg. Ein Widget wie
dieses hier bräuchte im Idealfall **einen** Request pro Team statt eines täglichen
Full-Crawls von 734 Spieltagen.

### 4.2 Tabelle/Standings als berechnete Server-Ressource

```
GET /api/leagues/{league_id}/seasons/{season}/standings/
→ [{ team_id, team_name, Sp, S, U, N, EP, GP, PD, SQ, promotion_eligible }]
```

Serverseitig berechnet, inklusive der Ligaordnung-Regeln (Punktequotient, Aufstiegssperren),
weil nur LeagueSphere die Ligaordnung und die Zuordnung Spieltag→Liga→Saison verlässlich kennt.
Das würde `standings.js` und die komplette manuelle Pflege von `league-config.json` in diesem
Repo überflüssig machen.

### 4.3 Liga/Saison als adressierbare, filterbare Ressourcen

```
GET /api/leagues/                       → Liste aller Ligen mit stabiler ID, Name, Ebene
GET /api/leagues/{id}/seasons/          → Saisons dieser Liga
GET /api/leagues/{id}/seasons/{s}/gamedays/   → Spieltage EINER Liga/Saison (funktionierender Filter!)
```

Der aktuell wirkungslose `?league=`-Parameter auf `/api/gamedays/` sollte entweder repariert
oder durch verschachtelte, garantiert korrekte Routen ersetzt werden.

### 4.4 Play-by-play als JSON mit CORS

```
GET /api/games/{id}/log/
→ { home_team, away_team, events: [{ type, minute, score_home, score_away, ... }] }
Access-Control-Allow-Origin: *   (oder zumindest für GET auf öffentliche Ligadaten)
```

Damit könnten Clients direkt aus dem Browser lesen, ohne einen serverseitigen Scraping-Proxy
betreiben zu müssen – reine Lesezugriffe auf öffentliche Sportdaten sind kein
Sicherheitsrisiko, das CORS-Sperren rechtfertigt.

### 4.5 Batch-/Expand-Parameter gegen N+1

Selbst mit Team-Endpoint bleibt das Grundproblem: Spieltag-Liste und zugehörige Spiele sind
getrennte Requests. Ein `expand`-Parameter würde das entschärfen:

```
GET /api/gamedays/?season=2026&expand=games
→ Spieltage inkl. eingebetteter Spiele in einem Response, statt 1 + N Requests
```

### 4.6 Normalisierte, dokumentierte Enums

- `status`: `draft | published` statt `""`/`"DRAFT"`/`"PUBLISHED"`
- `game.status`: sprachneutrales Enum (`scheduled | live | finished`) statt lokalisierter
  Strings wie `"beendet"`
- `format`: kanonischer Slug (z. B. `nrw_u13_g1_f2`) statt Freitext mit inkonsistenten
  Leerzeichen/Unterstrichen – zusätzlich ein separates, lesbares `format_display`-Feld

### 4.7 Ein echter Team-Suchindex statt HTML-Scrape

```
GET /api/teams/?search=Renegades
→ [{ id, full_name, club, active_leagues }]
```
ersetzt `/passcheck/team/all/list/` (HTML) als "eigentliche" Quelle für Teamnamen.

### 4.8 Echte Zugriffskontrolle statt Status-Flag

Analog zu 3.1/3.2: Wenn `DRAFT` tatsächlich "nicht öffentlich" bedeuten soll, müsste der
Server das durchsetzen (z. B. `DRAFT`-Spieltage nur mit gültigem Autoren-/Verbands-Token
ausliefern), statt es nur als Anzeigehinweis in der eigenen Oberfläche zu behandeln.
Zusätzlich: interne Felder wie `author` gehören in eine separate "admin"-Repräsentation statt
in dieselbe Response wie die öffentlichen Spieldaten, und ein dokumentiertes Rate-Limit
(inkl. `429`/`Retry-After`) würde die API robuster gegen exzessive `page_size`-Abfragen
machen.

---

## 5. Priorisierung – was am meisten bringt

| Priorität | Maßnahme | Warum |
|---|---|---|
| 1 (höchster Hebel) | `GET /api/teams/{id}/games/` | Löst das N+1-Problem, macht tägliche Full-Crawls überflüssig |
| 1 | `GET /api/leagues/{id}/seasons/{s}/standings/` | Eliminiert komplette Client-Nachbildung der Ligaordnung |
| 2 | Funktionierender `league`/`season`-Filter auf Gamedays | Kleine Änderung, behebt einen dokumentierten Bug |
| 2 | JSON + CORS für Play-by-play | Erlaubt echte Client-seitige Live-Ansichten ohne Server-Proxy |
| 3 | `expand`-Parameter für Gamedays→Games | Reduziert Requestzahl deutlich, auch ohne Team-Endpoint |
| 3 | Normalisierte Status-/Format-Enums | Reduziert Parsing-Sonderfälle, keine Breaking-Change-Pflicht wenn zusätzlich zum Altfeld eingeführt |
| 4 | `/api/teams/`-Suchendpoint (JSON) | Ersetzt HTML-Scrape, geringer Aufwand für großen Robustheitsgewinn |
| 2 (Sicherheit) | Echte Zugriffskontrolle für `DRAFT`-Status statt reinem UI-Flag | Entwurfsdaten sollen laut eigener Konvention nicht öffentlich sein, sind es aber |
| 3 (Sicherheit) | Dokumentiertes Rate-Limiting (`429`/`Retry-After`) | Aktuell keine serverseitige Grenze bei beliebigem `page_size` beobachtet |
| 4 (Sicherheit) | Trennung public/admin-Felder (z. B. `author` nicht in der öffentlichen Response) | Geringer Aufwand, vermeidet unnötiges Info-Disclosure |

---

## 6. Fazit

Die aktuelle LeagueSphere-API bildet nur die interne Datenstruktur ab (Spieltag → Spiele),
aber keine der Fragen, die Endnutzer typischerweise stellen (Team-Historie, Tabelle,
Liga-Übersicht). Dieses Projekt ist der lebende Beweis dafür: `_gen_snapshot.js` crawlt
täglich alle 734 Spieltage samt Play-by-play-HTML-Scrape, `standings.js` implementiert die
komplette Ligaordnung-Punktequotienten-Logik neu, und `league-config.json` pflegt von Hand,
was eigentlich eine Server-Antwort sein sollte (welche Spieltage zu welcher Liga/Saison
gehören). Die zwei Endpoints mit dem größten Hebel wären ein team-zentrierter
Games-Endpoint und ein serverseitig berechneter Standings-Endpoint – beide würden den
Großteil der Komplexität in diesem Repo (Snapshot-Crawling, Retry-Batching, manuelle
Ligaordnung-Nachbildung) überflüssig machen.

Daneben zeigt der Sicherheits-Review, dass die API zwar bewusst öffentlich ist (was für
Sportergebnisse sinnvoll ist), aber keine echte Zugriffskontrolle kennt: Der `DRAFT`-Status
ist nur ein UI-Hinweis, kein Server-seitiges Zugriffsrecht, es gibt kein beobachtbares
Rate-Limiting, und interne Felder wie `author` landen ungefiltert in der öffentlichen
Antwort. Keiner dieser Punkte ist für sich genommen kritisch, zusammen zeigen sie aber, dass
"öffentlich, weil kein Auth nötig ist" und "bewusst als öffentlich gestaltet" hier nicht
dasselbe sind.

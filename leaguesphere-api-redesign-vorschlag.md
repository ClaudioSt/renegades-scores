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

## 3. Wie eine sinnvoller aufgebaute API aussehen sollte

Der Leitgedanke: **API-Design entlang der Fragen, die Nutzer tatsächlich stellen** (Team,
Liga/Tabelle, Spieltag), statt nur entlang der internen Datenbank-Struktur (Gameday → Games).

### 3.1 Team als First-Class-Ressource

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

### 3.2 Tabelle/Standings als berechnete Server-Ressource

```
GET /api/leagues/{league_id}/seasons/{season}/standings/
→ [{ team_id, team_name, Sp, S, U, N, EP, GP, PD, SQ, promotion_eligible }]
```

Serverseitig berechnet, inklusive der Ligaordnung-Regeln (Punktequotient, Aufstiegssperren),
weil nur LeagueSphere die Ligaordnung und die Zuordnung Spieltag→Liga→Saison verlässlich kennt.
Das würde `standings.js` und die komplette manuelle Pflege von `league-config.json` in diesem
Repo überflüssig machen.

### 3.3 Liga/Saison als adressierbare, filterbare Ressourcen

```
GET /api/leagues/                       → Liste aller Ligen mit stabiler ID, Name, Ebene
GET /api/leagues/{id}/seasons/          → Saisons dieser Liga
GET /api/leagues/{id}/seasons/{s}/gamedays/   → Spieltage EINER Liga/Saison (funktionierender Filter!)
```

Der aktuell wirkungslose `?league=`-Parameter auf `/api/gamedays/` sollte entweder repariert
oder durch verschachtelte, garantiert korrekte Routen ersetzt werden.

### 3.4 Play-by-play als JSON mit CORS

```
GET /api/games/{id}/log/
→ { home_team, away_team, events: [{ type, minute, score_home, score_away, ... }] }
Access-Control-Allow-Origin: *   (oder zumindest für GET auf öffentliche Ligadaten)
```

Damit könnten Clients direkt aus dem Browser lesen, ohne einen serverseitigen Scraping-Proxy
betreiben zu müssen – reine Lesezugriffe auf öffentliche Sportdaten sind kein
Sicherheitsrisiko, das CORS-Sperren rechtfertigt.

### 3.5 Batch-/Expand-Parameter gegen N+1

Selbst mit Team-Endpoint bleibt das Grundproblem: Spieltag-Liste und zugehörige Spiele sind
getrennte Requests. Ein `expand`-Parameter würde das entschärfen:

```
GET /api/gamedays/?season=2026&expand=games
→ Spieltage inkl. eingebetteter Spiele in einem Response, statt 1 + N Requests
```

### 3.6 Normalisierte, dokumentierte Enums

- `status`: `draft | published` statt `""`/`"DRAFT"`/`"PUBLISHED"`
- `game.status`: sprachneutrales Enum (`scheduled | live | finished`) statt lokalisierter
  Strings wie `"beendet"`
- `format`: kanonischer Slug (z. B. `nrw_u13_g1_f2`) statt Freitext mit inkonsistenten
  Leerzeichen/Unterstrichen – zusätzlich ein separates, lesbares `format_display`-Feld

### 3.7 Ein echter Team-Suchindex statt HTML-Scrape

```
GET /api/teams/?search=Renegades
→ [{ id, full_name, club, active_leagues }]
```
ersetzt `/passcheck/team/all/list/` (HTML) als "eigentliche" Quelle für Teamnamen.

---

## 4. Priorisierung – was am meisten bringt

| Priorität | Maßnahme | Warum |
|---|---|---|
| 1 (höchster Hebel) | `GET /api/teams/{id}/games/` | Löst das N+1-Problem, macht tägliche Full-Crawls überflüssig |
| 1 | `GET /api/leagues/{id}/seasons/{s}/standings/` | Eliminiert komplette Client-Nachbildung der Ligaordnung |
| 2 | Funktionierender `league`/`season`-Filter auf Gamedays | Kleine Änderung, behebt einen dokumentierten Bug |
| 2 | JSON + CORS für Play-by-play | Erlaubt echte Client-seitige Live-Ansichten ohne Server-Proxy |
| 3 | `expand`-Parameter für Gamedays→Games | Reduziert Requestzahl deutlich, auch ohne Team-Endpoint |
| 3 | Normalisierte Status-/Format-Enums | Reduziert Parsing-Sonderfälle, keine Breaking-Change-Pflicht wenn zusätzlich zum Altfeld eingeführt |
| 4 | `/api/teams/`-Suchendpoint (JSON) | Ersetzt HTML-Scrape, geringer Aufwand für großen Robustheitsgewinn |

---

## 5. Fazit

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

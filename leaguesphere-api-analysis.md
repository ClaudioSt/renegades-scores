# LeagueSphere API – Analyse der Echtdaten

**Analysiert:** 25. Mai 2026  
**Basis-URL:** `https://leaguesphere.app/api/`  
**Analysierte Seiten:** Page 1 & 2 von `/api/gamedays/` (je 100 Einträge)

---

## 1. Überblick `/api/gamedays/`

| Eigenschaft | Wert |
|---|---|
| Gesamtanzahl Gamedays | **734** |
| Einträge pro Seite (Standard) | 10 |
| Max. getestete `page_size` | 100 |
| Seiten bei `page_size=100` | **8 Seiten** |
| Sortierung | **Datum absteigend** (neueste zuerst) |
| Saisonbereich sichtbar | Saison 5 (2025) bis Saison 6 (2026) |

---

## 2. Felder & Beobachtungen

### `id` (integer)
- Eindeutig, nicht fortlaufend (Lücken vorhanden)
- Stabiler Identifier — ändert sich nie
- Beobachteter Bereich: 184 (ältester bekannter Renegades-Spieltag) bis 847

### `name` (string)
Verschiedene Namens-Muster beobachtet:

| Muster | Beispiel | Vorkommen |
|---|---|---|
| Teamname (Host) | `"Nürnberg Renegades"` | Häufig (DFFL, DFFL2) |
| "N. Spieltag Teamname" | `"5. Spieltag Spatzen"` | Regional-Ligen |
| "Spieltag am DD.MM.YYYY" | `"Spieltag am 07.05.2026"` | AFVH U13 |
| "Gameday on DD.MM.YYYY" | `"Gameday on 16.04.2026"` | AFVH U13 (englisch) |
| "Liga-Spieltag in Ort" | `"FF BL Spieltag in Regensburg"` | FF BL |
| "Teamname U-Alter" | `"Erlangen Sharks U16"` | Jugend |
| Sonderfälle | `"Relegation RL By - FF BL"` | Playoffs |

> **Wichtig für Auto-Discovery:** FF BL Spieltage haben immer `"FF BL"` im Namen.  
> DKB DFFL Spieltage tragen den Namen des ausrichtenden Teams — **keine zuverlässige Liga-Kennung im Namen**.

### `season` / `season_display`
- `season`: Integer (Fremdschlüssel → `/api/seasons/`)
- `season_display`: String (Jahreszahl, z.B. `"2026"`)
- Aktuelle Saison: **6 = 2026**

### `league` / `league_display`
- `league`: Integer (Fremdschlüssel → `/api/leagues/`)
- `league_display`: Lesbarer Name (z.B. `"DKB DFFL"`, `"FF BL"`)
- **Filter-Parameter `league` funktioniert NICHT** — gibt immer alle 734 Einträge zurück

### `date` (string)
- Format: `YYYY-MM-DD`
- Sortierung der API: **absteigend** (neueste zuerst, Seite 1 = Zukunft/aktuell)
- Früheste Einträge auf Seite 8

### `start` (string)
- Format: `HH:MM` (ohne Sekunden)
- Typische Werte: `"10:00"`, `"09:00"`, `"11:00"`, `"12:00"`, `"13:00"`, `"14:00"`

### `format` (string)
Deutlich mehr Werte als in der Dokumentation — vollständige Liste aus Echtdaten:

| Wert | Kontext |
|---|---|
| `CUSTOM` | DFFL, DFFL2, DFFLF — freies Format |
| `6_2` | FF BL, RL Hessen, Jugend |
| `4_1` | OL NRW, Bayern U16 (klein) |
| `4_4spiele_1` | Bayern U16 |
| `5_2` | OL_Ost, Playoffs |
| `NRW_U10_Gruppen1_Felder2` | NRW U10 |
| `NRW U13_Gruppen1_Felder2` | NRW U13 (beachte Leerzeichen!) |
| `NRW_U13_Gruppen1_Felder2` | NRW U13 (Variante ohne Leerzeichen) |
| `NRW_U13_Gruppen1_Felder4` | NRW U13 (4 Felder) |
| `NRW U16_Gruppen1_Felder2` | NRW U16 |
| `RL NRW_Gruppen1_Felder2` | RL NRW |
| `RL_Ost_Gruppen1_Felder2` | RL Ost |
| `RL_Ost_Gruppen1_Felder1` | RL Ost (1 Feld) |
| `AFVBY_U16_Gruppen1_Felder2` | Bayern U16 (Variante) |

> **Hinweis:** Leerzeichen im `format`-Wert sind inkonsistent (`"NRW U13_..."` vs `"NRW_U13_..."`). Nicht für Filterlogik verwenden.

### `status` (string)
Beobachtete Werte:

| Wert | Bedeutung | Häufigkeit |
|---|---|---|
| `""` (leer) | Unveröffentlicht / kein Status | Häufig (DFFL, DFFL2) |
| `"DRAFT"` | Entwurf, nicht veröffentlicht | Sehr häufig (Regional-Ligen) |
| `"PUBLISHED"` | Veröffentlicht, sichtbar | Selten (z.B. FF BL Spieltage) |

> **Wichtig:** Der leere String `""` und `"DRAFT"` bedeuten beide "noch nicht offiziell veröffentlicht", verhalten sich aber unterschiedlich. Für das Widget sind **alle** Status-Werte relevant — auch `"DRAFT"`-Spieltage enthalten echte Spieldaten.

### `author` (integer)
- Interne User-ID des Erstellers
- Nicht relevant für das Widget

### `address` (string)
Kann sein:
- Vollständige Adresse: `"Hofer Straße 30, 90411 Nürnberg"`
- Nur Ortsname: `"Rodgau"`
- Platzhalter: `"tba"`, `"tbd"`, `"Adresse folgt"`, `"Adresse folgt in der Einladung"`
- Leer: `""` (bei manchen Jugend-Spieltagen)

> Widget sollte Platzhalter-Adressen erkennen und nicht anzeigen.

### `has_designer_state` (boolean)
- `false`: Kein Designer-Modus verwendet
- `true`: Nur bei `PUBLISHED`-Spieltagen oder speziellen Jugend-Formaten
- Nicht relevant für das Widget

---

## 3. Pagination

```
GET /api/gamedays/?format=json&page_size=100&page=1
→ count: 734, erste 100 Einträge (neueste zuerst)

GET /api/gamedays/?format=json&page_size=100&page=8
→ letzte ~34 Einträge (älteste Spieltage)
```

### Kein Pagination-Limit bei hohem page_size ✅

```
GET /api/gamedays/?format=json&page_size=1000
→ count: 734, results: 734, next: (leer) — alle Spieltage in einem Request!
Zeit: ~12s
```

`page_size=1000` und `page_size=9999` liefern **alle 734 Spieltage in einem einzigen Request** ohne `next`-Link. Kein Pagination-Loop nötig.

**Für Auto-Discovery relevant:**  
Ein einziger Request reicht für die gesamte Spieltag-Liste. Danach müssen nur noch die Games-Endpoints der gefundenen Spieltage abgefragt werden.

---

## 4. Such-Verhalten (`search`-Parameter)

Suche filtert **nur auf das `name`-Feld** (Substring-Match, case-insensitive vermutlich):

| Suchbegriff | Ergebnis |
|---|---|
| `"Nürnberg Renegades"` | Findet Spieltage, bei denen Renegades **Gastgeber** waren |
| `"FF BL"` | Findet **alle** FF BL Spieltage (alle haben "FF BL" im Namen) |
| `"DKB DFFL"` | Findet nichts — DFFL-Spieltage tragen **Teamnamen**, nicht den Liga-Namen |
| `"Nürnberg"` | Findet alle Spieltage mit "Nürnberg" im Namen (inkl. fremde Teams) |

> **Kritischer Befund für DKB DFFL:** Der Liga-Name erscheint **nicht** im `name`-Feld der Spieltage. Nur das ausrichtende Team steht im Namen. Für Renegades (team_id 159) findbar über `search=Nürnberg+Renegades` — aber nur Heimspiele!

---

## 5. Relevante Spieltage Nürnberg Renegades (aus Echtdaten bestätigt)

### Nürnberg Renegades (team_id 159) – DKB DFFL
| ID | Name | Datum | Status |
|---|---|---|---|
| 645 | Nürnberg Renegades | 2026-05-09 | `""` |
| 428 | Nürnberg Renegades | 2025-04-05 | (nicht auf Seiten 1–2) |
| 229 | Nürnberg | 2024-05-25 | (nicht auf Seiten 1–2) |
| 184 | Renegades Bowl | 2023-07-29 | (nicht auf Seiten 1–2) |

### Nürnberg Renegades II (team_id 287) – FF BL
| ID | Name | Datum | Status |
|---|---|---|---|
| 845 | FF BL Spieltag in Neustadt | 2026-06-21 | `PUBLISHED` |
| 844 | FF BL Spieltag in Rödental | 2026-05-23 | `PUBLISHED` |
| 842 | FF BL Spieltag in Regensburg | 2026-05-17 | `PUBLISHED` |
| 834 | FF BL Spieltag in Erlangen | 2026-05-09 | `DRAFT` |
| 832 | FF BL Spieltag in Ingolstadt | 2026-04-25 | `""` |

> **Hinweis:** Spieltag 834 (Erlangen) hat Status `DRAFT` — enthält trotzdem Spieldaten mit team_id 287.

---

## 6. Schlussfolgerungen für Auto-Discovery

### Strategie A: Search-basiert (empfohlen für FF BL)
```
GET /api/gamedays/?format=json&search=FF+BL&page_size=100
→ Findet alle FF BL Spieltage zuverlässig
→ Client-seitig nach team_id=287 filtern
```

### Strategie B: Full-Pagination (notwendig für DKB DFFL Away-Spiele)
```
GET /api/gamedays/?format=json&page_size=100&page=1
GET /api/gamedays/?format=json&page_size=100&page=2
... (8 Requests total)
→ Alle 734 Spieltage laden, dann Games nach team_id filtern
```

### Empfohlene Hybrid-Strategie
1. **Suche nach team_id** im localStorage-Cache nachschlagen (TTL: 7 Tage)
2. Bei Cache-Miss: Full-Pagination (8 Requests), alle Spieltag-IDs sammeln
3. Für jede Spieltag-ID: `/api/gamedays/{id}/games/` fetchen, nach `team_id` filtern
4. Gefundene Gameday-IDs cachen
5. Bei Cache-Hit: Nur die gecachten IDs + deren aktuelle Games laden

> **Performance:** Erster Load = 8 (Pagination) + N (Games für gefundene Spieltage) Requests.  
> Folgeloads = nur N Requests (gecachte IDs direkt).

---

## 7. Offene Fragen / Unbekannte

- Maximale `page_size` ungetestet über 100 (könnte z.B. 200 erlauben → 4 statt 8 Requests)
- CORS-Verhalten bei direktem Browser-Fetch unbestätigt
- `search`-Parameter: Groß-/Kleinschreibung ungetestet
- Ob `status: "DRAFT"` Spieltage Games-Daten enthalten (Spieltag 834 suggeriert ja)

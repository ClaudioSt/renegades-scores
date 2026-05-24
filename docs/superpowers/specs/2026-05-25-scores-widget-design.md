# Design: LeagueSphere Scores Widget

**Date:** 2026-05-25  
**Status:** Approved  

---

## Overview

A configurable, embeddable scoreboard widget for Flag Football clubs that displays past results, upcoming games, and live scores from the LeagueSphere API. Configured via URL parameters, hosted as a static file on GitHub Pages, and embedded into any website (e.g. Angular SPA) via a single `<iframe>` tag.

A companion generator page allows admins with no coding knowledge to produce the embed code by entering only team IDs.

---

## Architecture

```
GitHub Pages (static hosting, free)
├── widget.html      ← embeddable iframe
└── generator.html   ← admin tool to build embed code
```

**Embedding in Angular (or any site):**
```html
<iframe
  src="https://<org>.github.io/<repo>/widget.html?t=159&t=287&color=ff4500"
  width="100%" height="800" frameborder="0">
</iframe>
```

- No build step, no server, no backend
- Multiple iframes on one page supported (one per team or combined)
- Angular updates never affect the widget

---

## URL Parameters

| Parameter | Example | Required | Description |
|---|---|---|---|
| `t` | `159` | yes (repeat per team) | `team_id` — stable across seasons |
| `color` | `ff4500` | no | Accent color hex (default: `ff4500`) |

**Example (two teams):**
```
widget.html?t=159&t=287&color=ff4500
```

- No display name in URL — derived from API data
- No search terms in URL — widget discovers automatically
- URL stays the same forever; re-running the generator is only needed for color changes

---

## Auto-Discovery

The widget finds all gamedays for a given `team_id` via full pagination:

```
1. GET /api/gamedays/?format=json&page_size=1000
   → returns all 734 gamedays in one request (~12s)

2. For each gameday ID:
   GET /api/gamedays/{id}/games/?format=json
   → filter results where team_id matches
   → keep gameday if team participates

3. Split found gamedays into:
   past    = date < today AND all games status="beendet"
   active  = today OR future OR any game status="live"/"Geplant"
```

Parallelism: games requests run in batches of 50 concurrent (`Promise.all` with concurrency limiter). Batch size is a constant in `widget.html` (`BATCH_SIZE = 50`).

**Display name:** derived from the abbreviated `team_name` in game results (e.g. `"Nürn"`, `"Nürn2"`). No full name available via API. The widget contains a hardcoded name map in `widget.html` (e.g. `"Nürn" → "Nürnberg Renegades"`); unknown abbreviations are shown as-is.

---

## Cache Strategy

Cache stored in `localStorage`, keyed by `team_id`.

```json
{
  "version": 1,
  "scanned_at": "2026-05-25T10:00:00Z",
  "next_discovery": "2026-06-01T10:00:00Z",
  "past": [
    { "id": 184, "gd": { "name": "...", "date": "...", ... }, "games": [...] },
    { "id": 229, "gd": {...}, "games": [...] }
  ],
  "active_ids": [645, 845, 844]
}
```

| Data | Cache TTL | Rationale |
|---|---|---|
| `past` gamedays | **Permanent** | Finished results never change |
| `active` gamedays | **Never cached** | Re-fetched on every load |
| Full gameday list (discovery) | **7 days** (`next_discovery`) | New gamedays are added infrequently |

**Load sequence:**

```
On every page load:
  1. Show cached past gamedays immediately (instant)
  2. Fetch active_ids games → update live/upcoming sections
  3. If next_discovery ≤ now:
       → Re-fetch full gameday list (page_size=1000)
       → Find new IDs not in cache
       → Fetch games for new IDs only
       → Move completed past gamedays from active → past cache
       → Update next_discovery = now + 7 days
```

**First load (cold cache):** ~28s total — full scan (1 list request + 734 games requests)  
**Subsequent loads:** ~1–3s — only active gamedays re-fetched  
**Weekly rediscovery:** ~12s list + ~5 new games requests  
**Force refresh:** append `?refresh=1` to the iframe URL to bypass cache and trigger a full rescan

---

## Widget Display

Each team rendered in its own block:

```
[Team Name]
─────────────────────────────
🔴 LIVE (if any game currently live)
   [Live banner with score + Liveticker link]

▼ Vergangene Spieltage
   [Gameday card] → [Game rows with final scores, W/L coloring]
   ...

▲ Kommende Spieltage  
   [Gameday card] → [Game rows with scheduled time]
   ...
```

- Renegades team highlighted in orange in each game row
- Win = green score, Loss = red, Draw = orange
- Loading skeleton shown during first scan with progress indicator
- "Keine Daten" message when no gamedays found

---

## Generator Page (`generator.html`)

Single-page tool — no login, no backend, runs entirely in browser:

1. Admin enters one or more `team_id` values
2. Generator fetches a sample game to verify the ID exists and shows team abbreviation
3. Admin optionally picks accent color (color picker, default orange)
4. Generator outputs ready-to-paste `<iframe>` embed code
5. Copy button copies code to clipboard

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| API unreachable | Show cached data + "Keine aktuellen Daten verfügbar" banner |
| Invalid `team_id` | Show "Team nicht gefunden" in that block |
| Game request fails | Skip that gameday, continue with others |
| localStorage unavailable | Disable cache, run full scan on every load |
| CORS blocked | Show error with instructions to use a proxy |

---

## Out of Scope

- Authentication / admin login
- Server-side rendering
- Push notifications for live scores
- Historical statistics / standings tables
- Multi-language support (UI language: German)

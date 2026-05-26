# Renegades Scores — Embeddable Widget

An embeddable iframe widget that displays past results and upcoming fixtures for American Flag Football teams from the [LeagueSphere](https://leaguesphere.app) platform. Served via GitHub Pages, data is pre-fetched daily from the LeagueSphere API and stored in `snapshot.json` to avoid CORS issues and keep load times fast.

**Live URL:** `https://claudiost.github.io/renegades-scores/`

---

## Files Overview

| File | Purpose |
|---|---|
| `widget.html` | The embeddable iframe — fetches snapshot, renders scores |
| `generator.html` | Admin UI — search teams, configure options, generate embed code |
| `snapshot.json` | Pre-built data cache (updated daily via GitHub Actions) |
| `_gen_snapshot.js` | Node.js script that builds `snapshot.json` |
| `.github/workflows/update-snapshot.yml` | Daily auto-update at 3 AM UTC (5 AM CEST) |

---

## Embedding the Widget

### Step 1 — Add the auto-height listener (once per page)

This script makes every widget on the page automatically resize to fit its content. Add it **once** anywhere in your page, ideally in the `<head>` or just before `</body>`:

```html
<script>
window.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'iframeHeight') {
    var frames = document.getElementsByTagName('iframe');
    for (var i = 0; i < frames.length; i++) {
      try {
        if (frames[i].contentWindow === e.source) {
          frames[i].style.height = e.data.height + 'px';
          break;
        }
      } catch (ex) {}
    }
  }
});
</script>
```

This works for multiple widgets on the same page without any IDs or per-widget configuration.

### Step 2 — Embed the iframe

```html
<iframe
  src="https://claudiost.github.io/renegades-scores/widget.html?t=159&color=ff4500"
  width="100%"
  height="400"
  frameborder="0"
  allowtransparency="true"
  style="border:none;overflow:hidden"
></iframe>
```

Replace the `src` URL parameters to configure the widget (see [URL Parameters](#url-parameters) below).

The widget background is transparent by default — it adapts to whatever background color the embedding page uses.

---

## Using the Generator

The generator at `generator.html` provides a visual interface for building the embed code without manually constructing URLs.

1. **Open** `https://claudiost.github.io/renegades-scores/generator.html`
2. **Search for a team** — type a team name in the search box and select from the dropdown. Repeat to add multiple teams.
3. **Set the accent color** — pick a color that matches your website.
4. **Configure display options:**
   - How many past gamedays to show expanded (the rest collapse under a "show more" toggle)
   - Max upcoming gamedays to show (leave empty for all)
   - Toggle past results, upcoming fixtures, team title, compact layout
5. **Click "Embed-Code generieren"**
6. Copy **Schritt 1** (the listener script) and paste it once into your page
7. Copy **Schritt 2** (the `<iframe>` tag) and paste it where the widget should appear

A live preview renders directly on the generator page.

---

## URL Parameters

All parameters are optional. Multiple teams can be specified by repeating the `t` parameter.

| Parameter | Default | Description |
|---|---|---|
| `t` | — | **Team ID** (required). Repeat for multiple teams: `?t=159&t=287` |
| `color` | `ff4500` | Accent color as a hex value without `#`. Example: `color=1a73e8` |
| `past` | `3` | Number of past gamedays shown expanded before collapsing into "show more" |
| `future` | `0` (all) | Maximum number of upcoming gamedays to show. `0` shows all. |
| `show_past` | `1` | Set to `0` to hide the past results section entirely |
| `show_future` | `1` | Set to `0` to hide the upcoming fixtures section entirely |
| `title` | `1` | Set to `0` to hide the team name heading |
| `compact` | `0` | Set to `1` to enable a more compact layout (smaller text and spacing) |

### Example URLs

```
# Nürnberg Renegades, orange accent, 5 past gamedays visible
widget.html?t=159&color=ff4500&past=5

# Both Renegades teams, blue accent, compact layout
widget.html?t=159&t=287&color=1a73e8&compact=1

# Upcoming fixtures only, no past results, no title
widget.html?t=159&show_past=0&title=0

# Past results only, no upcoming section
widget.html?t=159&show_future=0
```

---

## Known Team IDs

Find any team ID by using the generator's search. Common teams:

| Team | ID |
|---|---|
| Nürnberg Renegades | `159` |
| Nürnberg Renegades II | `287` |
| Munich Spatzen | `20` |
| Augsburg Lions | `22` |

To look up any other team ID: open the generator, search for the team, and note the ID shown in the dropdown next to the team name.

---

## How the Widget Works

### Data loading

On first load the widget:
1. Fetches `snapshot.json` (~560 KB gzipped) — contains pre-built game data for all teams
2. Discovers which gamedays include the requested team(s)
3. Fetches live status for any currently active gamedays from the LeagueSphere API
4. Caches all discovered data in `localStorage` for 7 days

On subsequent loads within 7 days, the widget renders from cache immediately (no loading delay for past results). Active gamedays are always re-fetched for current scores.

### Snapshot vs. live API

| Data | Source |
|---|---|
| Past results | `snapshot.json` (updated daily) |
| Upcoming fixtures (known) | `snapshot.json` |
| New gamedays (not yet in snapshot) | Fetched live from LeagueSphere API |
| Current scores / live games | Always fetched live from LeagueSphere API |

### Auto-height

The widget measures its own content height via `ResizeObserver` and sends the value to the parent page via `window.parent.postMessage`. The listener script in Step 1 receives this message and updates the iframe height — no fixed height is needed once the content loads.

### Caching

- Past gamedays are cached in `localStorage` for **7 days** (`lsw_<teamId>`)
- Cache is invalidated automatically when `CACHE_VERSION` in `widget.html` is bumped
- Add `?refresh` to the widget URL to force a full re-discovery without clearing localStorage manually

---

## Snapshot Data

### Automatic updates

`snapshot.json` is regenerated automatically every day at **3 AM UTC (5 AM CEST)** via GitHub Actions (before matches typically start). The workflow runs `node _gen_snapshot.js`, commits the result, and pushes it — GitHub Pages then serves the updated file.

### Manual regeneration

```bash
# Full rebuild (~5 min): fetches all gamedays fresh from the API
node _gen_snapshot.js

# Rebuild mode (~15 min): preserves existing game data, re-fetches play-by-play logs and team names
node _gen_snapshot.js --rebuild
```

Use **full rebuild** when new gamedays have appeared and you want them in the snapshot immediately.

Use **`--rebuild`** when the play-by-play parsing logic has changed, or when you need to fill in logs for past games without re-fetching all game results.

### Triggering a manual GitHub Actions run

Go to the repository on GitHub → **Actions** → **Update snapshot** → **Run workflow**. This runs the same full rebuild that the daily schedule uses.

---

## Technical Notes

- **No build step** — pure HTML, CSS, and vanilla JavaScript. No npm, no frameworks, no bundler.
- **Security** — all API/user data is passed through `escapeHtml()` before insertion into `innerHTML`.
- **`pa` field** — in `snapshot.json`, `results[].pa` means *points against* (points the opponent scored, i.e. what this team conceded). A win means `me.pa < opponent.pa`.
- **`CACHE_VERSION`** — increment this constant in `widget.html` whenever the `localStorage` cache schema changes. Old caches are then silently discarded on the next load.

# Phase 3: League Config — Research Context

*Researched: 2026-05-27*

## What this phase does

Creates `league-config.json` — a manually maintained file that stores per-league, per-season metadata needed for the table view. Read by `_gen_snapshot.js` and potentially by `widget.html` for display logic.

## League Hierarchy (men's, Bavaria)

```
FF BL (Oberliga / Bayernliga)  →  RL Bayern  →  DFFL2  →  DKB DFFL
```

Promotion between levels goes via Aufstiegsrelegation (central playoff tournament).
The Ligaordnung groups "RL Bayern + Bayernliga (FF BL)" together when calculating promotion playoff slots — they are treated as one region's feeder pool.

## Standings Formula

**Wertungspunktequotient (SQ)** — source: Ligaordnung 2026, §19/§24/§32

```
SQ = (2 × W + 1 × D) / (2 × Sp)
```

Table columns (matches LeagueSphere display exactly):

| Column | Meaning |
|--------|---------|
| SQ | Siegquotient / win quotient |
| EP | Erzielte Punkte (points scored by team) |
| GP | Gegnerpunkte (points scored by opponents) |
| PD | Punktedifferenz (EP − GP) |
| S | Siege (wins) |
| U | Unentschieden (draws) |
| N | Niederlagen (losses) |
| Sp | Spiele (games played) |

All values computable from existing `snapshot.json` game results. No new API endpoint needed.

## Promotion Restriction Rule

**Source: Ligaordnung 2026**

- **§28.3** (Regionalliga → DFFL2): A team is not eligible for the Aufstiegsrelegation if another team *of the same Verein* is already qualified for DFFL2 next season.
- **§25.3** (DFFL2 → DFFL): Teams with "II" suffix can participate in Final6 but are not aufstiegsberechtigt; next-ranked teams promote instead.
- Rule applies to the **immediately next league** only. A parent team in DFFL (skipping RL) does NOT block the II team in FF BL.

**For the widget:** Blocked teams are shown grayed out in the table view. The list is per-season and manually maintained in `league-config.json`.

## FF BL 2026 — Confirmed Data

### Gamedays

| ID | Date | Location | Games |
|----|------|----------|-------|
| 832 | 2026-04-25 | Ingolstadt | 6 |
| 834 | 2026-05-09 | Erlangen | 6 |
| 842 | 2026-05-17 | Regensburg | 12 |
| 844 | 2026-05-23 | Rödental | 6 |
| 845 | 2026-06-21 | Neustadt | 12 |

### Teams

| ID | Full Name | Abbrev | Promotion blocked? | Reason |
|----|-----------|--------|--------------------|--------|
| 29 | Bamberg Phantoms | Bamb | No | — |
| 152 | Ingolstadt Guardians | Ingol | No | — |
| 221 | Ramsenthal RedWings | Ramsenthal | No | — |
| 223 | AFC Königsbrunn Ants | Königsbrunn | No | — |
| **254** | **Munich Spatzen 4** | Spatz4 | **Yes** | Spatz3 (66) in RL Bayern |
| 287 | Nürnberg Renegades II | Nürn2 | No | Nürn1 (159) in DKB DFFL — skips RL |
| 391 | Rödental Racoons | Rödental | No | — |
| 392 | Ingolstadt Guardians 2 | Ingol2 | No | Ingol (152) in FF BL (same level) |
| 393 | Erlangen Sharks 2 | Erlangen2 | No | No Erlangen in RL Bayern |
| **492** | **Erding Bulls II** | Erding2 | **Yes** | Erding Bulls (160) in RL Bayern |
| 500 | Neumarkt Wolves | Neumarkt | No | — |
| 501 | Ramsenthal RedWings II | Ramsenthal2 | No | Ramsenthal (221) in FF BL (same level) |
| 502 | Neustadt Falcons | Neustadt | No | — |
| **505** | **Regensburg Phoenix III** | Regen3 | **Yes** | Regen2 (288) in RL Bayern |

### Promotion-blocked team IDs for 2026
`[254, 492, 505]`

## RL Bayern 2026 — Reference

Teams in the next league up (for cross-referencing):

| ID | Name | Abbrev |
|----|------|--------|
| 66 | Munich Spatzen 3 | Spatz3 |
| 153 | Rosenheim Rebels | Rosen |
| 154 | Augsburg Lions II | Lions2 |
| 158 | Neu-Ulm Spartans | Neu-Ulm |
| 160 | Erding Bulls | Erding |
| 288 | Regensburg Phoenix II | Regen2 |
| 289 | München Rangers | Rangers |
| 388 | Fursty Razorbacks | Fursty |

## Proposed `league-config.json` Schema

```json
{
  "ff-bl": {
    "2026": {
      "name": "FF BL 2026",
      "gameday_ids": [832, 834, 842, 844, 845],
      "promotion_restricted": [254, 492, 505]
    }
  },
  "rl-bayern": {
    "2026": {
      "name": "RL Bayern 2026",
      "gameday_ids": [],
      "promotion_restricted": []
    }
  }
}
```

**Notes:**
- `promotion_restricted` must be manually reviewed each season (parent clubs move between leagues)
- `gameday_ids` will need to be updated as new gamedays are added during the season
- The "II suffix" heuristic is NOT reliable enough to automate this — always verify against the actual next-league roster

## Sources

- Ligaordnung 2026 (AFVD, v3.0, 02.12.2026): https://www.5erdffl.de/wp-content/uploads/2025/12/Ligaordnung-2026.pdf
- LeagueSphere API: `https://leaguesphere.app/api/leagues/?format=json` → FF BL = league ID 18
- Snapshot data: `snapshot.json` (cross-referenced FF BL and RL Bayern gamedays)

# 532 — Activity detail: the map hero and the Elevation card

Part of #525. Builds on #531's shell and replaces #407's Route section. Board B
of the prototype (https://claude.ai/artifact/3EKueKvLjDGy2Now8unv9m). #407's
fetch, cache, error words, tokens and `drawRoute` are kept. Only where the map
sits, and what floats on it, changes.

## When there's a hero

When `routeAvailable(workout)` is true (#407: a `track_ref`, not planned or
active, a Maps key, and an API URL or a demo track), **whatever the type**. A
walk with a track gets one, and so would a weight session if one ever had a
track. The rule is the track, never the type (owner, 2026-10-20).

When a track exists but `routeAvailable` is false only because there's no Maps
key, there's no hero. The Elevation card still shows in #531's layout,
because the track can be read without Maps.

## Layout

```
┌──────────────────────────┐  ← map, full width, hero height
│ (‹)              (✎)(⋯) │  ← #531's top bar, floating
│                          │
│        route             │
│               [+][⛶]    │  ← Google controls, bottom right
│ [Map|Sat]                │  ← map type, bottom left
╰──────────────────────────╯
╭──────────────────────────╮  ← sheet, overlaps the map by --space-lg
│ title block              │
│ stats card               │
│ Elevation card           │
│ note · provenance        │
```

- **Hero height:** `--detail-hero-height`, which is
  `clamp(320px, 62vh, 560px)`. At 375×812 that's 503px, near the prototype's
  540 of 844.
- **Behind the status bar:** the map starts at the top of the screen with no
  margin. Safe-area insets pad the floating bar, not the map
  (`env(safe-area-inset-top)`).
- **Floating bar:** #531's three buttons, positioned absolutely
  `--space-sm` + `--space-xs` (12) from the top and sides. Each gets a 44px
  round scrim: `color-mix(in srgb, var(--color-bg) 78%, transparent)`, with
  `--color-text` icons. On the light basemap in light theme that's a light
  scrim; in dark theme, a dark one. Both are measured against the icon, not the
  map, so they pass whatever is under them.
- **The sheet:** `--color-bg`, top corners `--radius-lg`,
  `margin-top: calc(-1 * var(--space-lg))`, stacked above the map
  (`position: relative; z-index` above the map's). Its first child is #531's
  title block, with `--space-md` top padding. There's no drag handle. The
  prototype's grab bar is left out because the sheet doesn't drag, and a handle
  would promise it does.
- **Scrolling:** the whole screen scrolls as one page. The map scrolls away
  under nothing; there's no sticky or parallax effect.

## Map options in the hero

`MAP_OPTIONS` (#407), with control positions set:

| Control | Position |
|---|---|
| zoom | `RIGHT_BOTTOM` |
| fullscreen | `RIGHT_BOTTOM` |
| map type | `LEFT_BOTTOM`, `HORIZONTAL_BAR` style |

With the sheet's `--space-lg` overlap, the controls get
`padding-bottom: var(--space-lg)` on the map container so the sheet doesn't
cover them. `gestureHandling: 'cooperative'` stays, so a one-finger swipe
scrolls the page. The route line, casing and dots are #407's tokens,
unchanged. The basemap stays light in both themes, as #407 decided.

## States, in the hero's area

| State | Hero shows |
|---|---|
| Loading (track or Maps script) | `--color-surface-raised` fill, "Loading route…" centred, `role="status"` `aria-busy="true"` |
| Error (any kind) | the same fill, "Couldn't load the route." and Try again (`btn btn-secondary`), `role="status"`. Try again refetches as #407 does |
| Too few points | the error state, as #407 |
| Ready | the map, `role="region"` `aria-label="Route map"` |

The floating bar is drawn over all four and stays usable. The sheet renders
straight away in every state. It doesn't wait for the map.

## Elevation card

In the sheet, after the stats card. `--color-surface`, `--radius-lg`, padding
`--space-md`.

- **Header row:**
  - left: `h2` "Elevation", `--text-base` 600, with a 16px mountain icon in
    `--chart-line`
  - right: "↑ 1,620 ft", `--text-sm` `--color-text-secondary`, from the
    workout's `ascent_m`, not computed from the track. COROS's number is the
    one shown everywhere else. It's left out when blank.
  - sub-line under the heading: "5,430 – 6,120 ft", the lowest and highest
    non-null `ele` in feet, grouped.
- **Chart:** an inline SVG, full card width, 96px tall.
  - x is the cumulative distance along the track in miles, from
    `@keel/geo`'s `computeElevationProfile` (cairn's profile; never a local
    copy). If it bridges null elevations rather than reporting them, extend it
    in `geo/` to keep the gaps, with a test, rather than working around it in
    Thrive.
  - y is `ele` in feet, scaled from the lowest to the highest point, with 8%
    headroom at the top.
  - **Area:** `--chart-band` fill under a `--chart-line` 2px line.
  - **Gaps:** a null `ele` breaks both the line and the area into separate
    segments. The suite rule is that blank breaks the line.
- **Axis:** four labels under the chart, `--text-xs` `--color-text-secondary`,
  `tabular-nums`, at 0 and at thirds of the total distance, rounded to whole
  miles ("0", "5 mi", "10 mi", "15 mi"). Under 3 mi they're to one decimal.
- **Accessible name:** the chart is `role="img"`, named "Elevation from 5,430
  to 6,120 ft over 15.0 mi".
- **When it shows:** at least two non-null `ele` points, and the track
  fetched. While the track loads there's no card and no placeholder, and the
  card appears when it arrives. It's left out on error.

## Removed

- The "Route" section heading and the `.detail-route` box.
- `--detail-map-height`, replaced by `--detail-hero-height`.

## New tokens

| Token | Value | For |
|---|---|---|
| `--detail-hero-height` | `clamp(320px, 62vh, 560px)` | the map hero's height |

## CLAUDE.md

`thrive/CLAUDE.md`, "Route map (#407)": the first paragraph says an activity
with a drawable track opens on a full-width map hero with an Elevation card in
the sheet below (#532). `--detail-map-height` is replaced by
`--detail-hero-height` in the tokens bullet.

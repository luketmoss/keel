# 80 — Trips as a filterable panel over the live map

Replaces the full-page list from [33-trips-list.md](33-trips-list.md); its row
anatomy, status pills and delete-confirmation behaviour carry over unchanged
except where restated. Shell from
[78-full-screen-shell.md](78-full-screen-shell.md), place list and filters from
[79-world-map-dots.md](79-world-map-dots.md). Tokens from
[design-language.md](design-language.md).

This completes that document's Navigation item 1 — *"the map is never
unmounted"* — which #78 started.

## Layout

```
┌──────────────────────────────────────────────────────────────┐
│  Cairn  World  Trips                                    (◯)  │
│  ┌────────────────────────┐                                  │
│  │ ⌕ Filter trips      ✕  │              ●                   │
│  │ All │Planned│Completed │                        ○         │
│  ├────────────────────────┤                                  │
│  │ Tongariro Crossing     │                   ②              │
│  │ Mar 2024 · completed   │                                  │
│  ├────────────────────────┤        ●                         │
│  │ Kungsleden            │                                   │
│  │ Jul 2026 · planned     │                                  │
│  └────────────────────────┘                                  │
└──────────────────────────────────────────────────────────────┘
```

A left-docked panel, `--space-4` inset from the left and below the nav panel,
`360px` wide, height capped at the viewport less its insets. L2: `--surface`,
`--radius-md`, `--shadow-lifted`, `blur(--blur)`. The map fills the viewport
behind it and stays interactive everywhere the panel does not cover.

Left rather than right because the account bubble owns the top-right corner and
a panel under it would box the map into a corridor.

The list scrolls inside the panel; the page never scrolls.

## Filters

The panel header holds the filter controls, and they are **the same filters the
map uses** — the status pills move here from the map's top-left when the panel
is open, rather than being duplicated. One set of controls driving one predicate
is what guarantees the list and the dots can never disagree.

- **Name field** — `⌕` leading glyph, `--text-base`, `--radius-sm`,
  `--surface-lift` fill. Case-insensitive substring match on the trip name.
  Filters as you type, no debounce — the set is in memory and small.
- **Status pills** — unchanged from #79.
- **Date range** — stays at the bottom of the map, where #79 put it. It is wider
  than the panel and belongs to the map's full width.
- **Clear** — an `✕` inside the name field, shown only when it has content.

The header is sticky; scrolling the list does not scroll the filters away.

### Designed to extend

Filtering is one predicate over the flat `Place` list. Adding a facet later —
tags, or metadata read from the KMLs inside a trip — means adding a clause and a
control, not a second filtering system. Nothing in this note should be built in
a way that assumes trip metadata is the only source of a filterable field.

## Rows

Row anatomy from #33: name in `--text-base`, date and status beneath in
`--text-xs` `--text-muted`, at least `--row-touch` tall, `--space-3` padding,
1px `--border` between rows.

| State | Treatment |
|---|---|
| Rest | transparent |
| Hover | `--hover` fill, **and this trip's dot on the map emphasises** |
| Pressed | `--pressed` fill |
| Focus | global 2px `--accent` outline |

## Row and dot are one object

Hovering a row emphasises its dot exactly as hovering the dot does (#79's 1.35
scale and name chip). Hovering a dot emphasises its row with the same `--hover`
fill. Activating either opens the trip.

If the hovered trip's dot is outside the current viewport, **the map does not
move.** A list hover is a glance, not a request to travel, and a camera that
jumps on mouse movement is unusable. The dot emphasises where it is; if that is
off-screen, nothing visible happens, which is correct.

A trip with no geometry has no dot to emphasise. Hovering its row does nothing
on the map, and that is the honest response.

## Main path

1. Activate `Trips`. The panel enters from the left over `--motion-base`; the
   map does not move, re-fit, or reload.
2. Filter by name, status, or date. Rows and dots update together on every
   keystroke.
3. Hover a row to find it on the map; activate it to open it.
4. Back from the trip returns here with filters and scroll position intact
   (#78).
5. Activate `World`, or the panel's close control, to dismiss it. The map's
   camera is untouched throughout.

## States

**Populated** — as above.

**No trips at all** — panel shows, centred:

> **No trips yet**
> Drop a KML anywhere to start one.

Filter controls do not render; there is nothing to filter.

**Filters match nothing** — filter controls stay, so the user can get back out:

> **No trips match**
> `Clear filters`

`Clear filters` is a button that resets name, status and date at once. An empty
result is the one place a single control to undo every filter is worth its
space — the alternative is hunting three controls to find which one did it.

**Loading** — rows render as they arrive, no spinner, same stance as #35.

**Map unavailable** — the panel renders and works normally over `--ground`. The
list does not depend on the map; losing tiles must not cost the user their
trips.

## Edge cases

- **Narrow viewport** (`< 640px`) — the panel goes full-width and full-height,
  covering the map. The hover-to-emphasise pairing is meaningless without a
  pointer and is simply absent. The bottom-sheet treatment with detents that
  `design-language.md` wants here is its own issue; this is the interim.
- **Very long trip name** — wraps to two lines, then truncates with an ellipsis.
  A name is the row's identity and deserves the second line before it is cut.
- **Many trips** — the list scrolls. No virtualisation until there is a scale
  that needs it, same stance #33 took.
- **Filtering to one trip** — no special case; the map does not auto-zoom to it.
  Auto-framing on a keystroke fights the user still typing.
- **Deleting a trip while filtered** — the row goes, the dot goes, the filters
  stay as they were.
- **A trip renamed elsewhere while the panel is open** — the row updates in
  place; if it no longer matches the active name filter, it leaves the list.
- **Reduced motion** — the panel cuts in rather than sliding.
- **Keyboard only** — tab reaches the name field, the pills, then each row in
  order. The panel is a dialog for nothing and does not trap focus; the map
  behind it stays reachable.

## Copy

| Context | Copy |
|---|---|
| Name filter placeholder | `Filter trips` |
| Empty (no trips) heading | `No trips yet` |
| Empty (no trips) detail | `Drop a KML anywhere to start one.` |
| Empty (filtered) heading | `No trips match` |
| Empty (filtered) action | `Clear filters` |
| Panel close control aria-label | `Close trips` |

## New tokens

| Token | Value | For |
|---|---|---|
| `--panel-width` | `360px` | the docked trips panel |

Wider than `--sidebar-width`'s `320px`, which this replaces: the sidebar was a
permanent tax on the map's width and was kept narrow for that reason. A panel
that is only present when asked for can afford the room, and two lines of trip
metadata sit badly at 320px.

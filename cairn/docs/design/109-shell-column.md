# 109 — the shell as one left column

Layout, slots, tokens and copy are normative in
[shell-and-content-model.md](shell-and-content-model.md). This note covers only
what that document leaves to the issue: the states this rebuild passes through,
the edge cases, and what happens to the things it deletes.

## The main path

1. App loads. The map draws first; the column animates in over `--motion-base`.
2. The panel is open on the list face, showing every trip.
3. Hovering a row emphasises its dot; hovering a dot emphasises its row.
4. Activating a row or a dot swaps the panel to the trip face. The search card's
   left slot becomes Back, the field is replaced by the trip's name, and the
   camera flies to the trip over `--motion-slow`. Nothing else moves.
5. Back returns to the list face with scroll position and filters intact.

## What is deleted, and what inherits its job

| Gone | Its job now |
|---|---|
| `TopBar` | Nothing — `World`/`Trips` were not destinations |
| The wordmark | The mark in the search card's left slot |
| `AccountBubble` as a floating element | The avatar slot in the same card |
| `TripsPanel`'s `×` close | The panel's edge tab, which collapses rather than closes |
| Each row's `×` | `⋮`, on hover and focus |
| `TripDetail` as a page | The panel's trip face |
| The bottom-centre date range | The `Years` row in the list header |
| `--sidebar-width` | `--panel-width`, now 380px |

**`AccountBubble` keeps its popover, its states and its reconnect flow** — only
its trigger's position changes. This issue must not become a rewrite of #32.

## States

| State | Panel | Map |
|---|---|---|
| Loading the index | List face, rows fade in as they arrive; no spinner | Basemap draws immediately |
| Signed out | `Sign in to see your map.` | Same, over the live basemap |
| No trips | `Nothing here yet` / `Drop a KML or a photo anywhere to start.` | Empty overlay, same copy |
| Filtered to nothing | `Nothing in this range` / `Clear filters` | Empty overlay |
| Collapsed | Off-screen left, edge tab visible | Full width; layers control at the left edge |
| Detail open | Trip face | Selected trip emphasised, others dimmed |

`Sign in to see your map.` replaces #95's `Sign in to see your trips.` — the
panel stops being only trips in #110, and changing the string twice is worse
than changing it once early.

## Edge cases

**A trip whose name is longer than the card.** The crumb ellipsises on one line;
the trip face's heading wraps with `text-wrap: balance` and does not truncate.
The name is the thing the user came for, so the heading gets the space.

**Back with no history** — a typed URL or a reload straight into `/trips/:id`.
Back still returns to the list face. #78's conditional (`navigate(-1)` when
`location.key !== 'default'`) is no longer needed, because the list is a panel
state rather than a page to go back to.

**A drop while a detail is open.** Unchanged from #81: the draft panel takes
over the column and the chips hide. Back is suppressed while a draft is open —
there is nothing to go back to that would not discard the draft.

**Collapsing while a detail is open.** Not possible: the edge tab is not
rendered on a detail. Collapse is a property of the list.

**The panel at short viewport heights.** The list scrolls internally; the
header, the `Years` row and the chips never scroll away. Below 640px this
issue keeps the existing full-bleed behaviour — the sheet is #112.

**Rapid chip changes.** Filtering is synchronous against already-loaded index
entries. No loading state, no debounce.

**A basemap change while the layers strip is open.** Selecting collapses the
strip. Clicking the already-selected one collapses it without a redraw.

## Transitions

| What | Duration | Notes |
|---|---|---|
| Panel collapse / expand | `--motion-base` | Transform only, never width |
| List ⇄ detail face | `--motion-base` | Cross-fade; the card's slots swap at the midpoint |
| Layers strip open | `--motion-fast` | |
| Layers control sliding to the map edge | `--motion-base` | Tracks the panel |
| Camera to a selected trip | `--motion-slow` | #5's bounds fitting, unchanged |

Transition named properties, never `all`. Everything collapses under
`prefers-reduced-motion: reduce`.

## Copy

| Where | String |
|---|---|
| Search field | `Search trips, tracks and photos` |
| List header | `Everything` |
| Count | numeric, monospace |
| New action | `New trip` |
| Range label | `Years` |
| Edge tab | `aria-label="Collapse panel"` / `"Show panel"` |
| Mark slot | `aria-label="Menu"` |
| Back slot | `aria-label="Back to the list"` |
| Row menu | `Rename trip` · `Mark as planned`/`completed` · `Export as KMZ` · `Delete trip…` |
| Layers | `Layers`, then `Map` · `Satellite` · `Hybrid` · `Terrain` |
| Zoom | `aria-label="Zoom in"` / `"Zoom out"` / `"Fit to everything"` |

The search field is a filter over the loaded index in this issue — it narrows
the list by name. It is worded for what it becomes in #110 rather than renamed
twice.

## New tokens

All of them are declared in the standing document's `## New tokens` table and
land in `src/index.css` here: `--search-height`, `--chip-height`,
`--marker-track`, `--sheet-peek`, `--sheet-half`, `--sheet-full`.

`--marker-track` and the three sheet detents are added now even though #110 and
#112 are what use them — splitting one token table across three issues is how
`index.css` ends up disagreeing with the document that defines it.

`--panel-width` changes from `360px` to `380px`. `--sidebar-width` is removed.

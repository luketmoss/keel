# 79 — The world map as home: a dot per place

Replaces the route rendering in [37-world-map.md](37-world-map.md); its nav,
filter row and empty-state reasoning still hold except where restated here.
Chrome sits in the shell from [78-full-screen-shell.md](78-full-screen-shell.md).
Tokens from [design-language.md](design-language.md). Marker sizing and
clustering follow [54-photo-markers.md](54-photo-markers.md), which already
solved the same geometry.

## The rule

> **a dot means it is a trip · a route means it is not saved yet**

Full geometry never appears on this map for a saved trip. That is what makes an
unsaved import (#81) legible without a badge: it is the only thing drawn as a
line. Worth holding to even where a route would be prettier.

## Layout

```
┌──────────────────────────────────────────────────────────────┐
│  Cairn  World  Trips                                    (◯)  │
│  ┌───────────────────────────────┐                           │
│  │ All │ Planned │ Completed     │                           │
│  └───────────────────────────────┘                           │
│                       ●        ○                             │
│                            ②                                 │
│           ●                                                  │
│                ┌──────────────────────────────┐              │
│                │ ●────────────────────────●   │              │
│                │ 2019                    2026 │              │
│                └──────────────────────────────┘              │
└──────────────────────────────────────────────────────────────┘
```

Status pills sit below the nav panel, top-left, `--space-2` beneath it, styling
unchanged from #37. The date range sits bottom-centre, inset `--space-6`, its
own L2 panel — a range slider needs horizontal room the top-left corner does not
have once nav is there, and the bottom edge is the only place wide enough that
is not already spoken for.

## The dot

`--marker-size` is the footprint clustering measures; the drawn circle is
`--dot-size`, so neighbouring dots read as separate at a glance. Rendered as an
`AdvancedMarker`, translated down half its height so it sits *on* its coordinate
rather than above it.

| Status | Treatment |
|---|---|
| Completed | `--accent` fill, `--dot-ring` `--text` ring at 90% opacity |
| Planned | `--ground` fill at 70%, `--dot-ring` `--text` ring at 85% |

Filled versus hollow, not merely dimmer. A muted fill has nothing to be muted
against when a planned trip is the only dot on screen, and status has to survive
that. The ring is what keeps a small dot legible over snow, cloud and desert
alike — a bare dot vanishes on satellite imagery often enough to matter.

**Hover** — scales to 1.35 over `--motion-fast`, and the trip's name appears as
an L2 chip to the dot's right, `--text-xs`, `--radius-sm`, `--space-1` by
`--space-2` padding, no wrapping. Labels are hidden at rest: a dozen always-on
names at world zoom overlap into an unreadable mat, and the dot is what is being
scanned.

**Focus** — the global 2px `--accent` outline. Dots are reachable by keyboard in
the order the trips are listed.

**Clusters** — `--marker-size` circle, `--surface`, `--dot-ring` `--text` ring at
85%, count in `--text-xs` at 700 in `--text`. Activating one zooms to fit its
members (`zoomToFitCluster`, already built for #54). Its accessible name lists
the member trips, so a cluster is identifiable without zooming.

## Filters

**Status pills** — `All` / `Planned` / `Completed`, `All` on load. Unchanged
from #37.

**Date range** — two handles spanning the earliest to the latest trip date, both
ends inclusive, each labelled with its year in `--text-xs` `--text-muted`.
Filtering is instant and client-side. The range resets to full span on load;
persisting it in URL state is not worth it until there are enough trips for the
setting to be worth keeping.

**Undated trips stay visible at every range setting.** A trip with no start date
falls back to `createdAt`, which is when it was *imported* — a date the user
never chose — and filtering it out on that basis hides a trip for a reason it
does not deserve. A deliberate asymmetry, and the one place the date filter is
not a pure predicate.

Both filters compose: the visible set is the intersection.

## Main path

1. Navigate to `/`. Trips load from the store; each with a stored origin draws
   its dot as it arrives.
2. Once the batch settles, the camera fits the union of visible dots, once — not
   once per arrival, which makes the camera lurch trip by trip.
3. Changing a filter re-fits immediately to the new visible set; that is
   synchronous, with nothing in flight to cancel.
4. Activating a dot opens `/trips/:id`.
5. Returning restores the camera exactly as left — see below.

## Camera persistence

The map's centre and zoom survive navigation away and back for the session. This
is the point of #78's persistent shell, and it is what makes the map browsable:
today every trip visit resets it.

The fit-to-bounds in step 2 runs **only when the map has no camera yet** — a
first load. A return from a trip restores; it does not re-fit, or the user's pan
is discarded every time they look at something.

Not persisted across a page reload. A fresh load fitting to the user's trips is
a better opening frame than wherever they happened to leave off yesterday.

## States

**Loading** — `--ground`, no spinner, consistent with #2 and #35. Filter controls
render but affect nothing yet.

**Populated** — dots drawn, camera fit.

**No trips** — centred on `--ground`, no filter controls:

> **No places yet**
> Drop a KML anywhere to start your first trip.

Copy points at #81's drop-anywhere import, which is how a first trip is now made.

**Filtered to nothing** — filter controls stay visible so the user can get back:

> **Nothing in this range**
> Widen the filters to see your trips.

One message for both filters rather than #37's status-specific copy: with two
filters composing, naming which one excluded everything is guesswork.

**Trips exist but none have geometry** — reads as *No places yet*. From the
user's seat it is the same situation, and neither is actionable.

**Map unavailable** — `MapUnavailable`, per #78. No filter controls.

## Edge cases

- **One trip** — bounds-fit to a single point centres and applies the
  `MAX_FIT_ZOOM` cap, which `fitTracksToBounds` already handles.
- **Two trips at the same coordinate** — a cluster of 2 whose zoom-to-fit is a
  no-op on degenerate bounds (`zoomToFitCluster` already declines). Reachable
  through the trips panel (#80); the map alone cannot separate them, and
  pretending otherwise with an arbitrary zoom jump is worse.
- **A trip whose overview fails to load** — its dot still draws, because the
  origin lives on the trip record rather than being derived from the overview.
  This is the whole reason for storing it.
- **A trip with no geometry at all** — no dot, absent from the map, still listed
  in the panel (#80). It is a trip; it just is not a place yet.
- **Reordering tracks in an open trip** — the origin is rewritten when the
  overview is saved, so the dot has already moved by the time the world map is
  next seen.
- **Antimeridian** — a dot is one coordinate and cannot straddle it, so no
  normalisation is needed, unlike #37's polylines.
- **Rapid filter toggling** — synchronous, no debounce, nothing in flight.
- **Reduced motion** — hover scale and label fade collapse, and the camera move
  is suppressed too, per the language's rule.
- **Hundreds of trips** — clustering is O(n²) pairwise, memoised on zoom, and
  fine at this scale. Real only when there is data to prove otherwise.

## Copy

| Context | Copy |
|---|---|
| Filter pills | `All` · `Planned` · `Completed` |
| Empty heading | `No places yet` |
| Empty detail | `Drop a KML anywhere to start your first trip.` |
| Filtered-empty heading | `Nothing in this range` |
| Filtered-empty detail | `Widen the filters to see your trips.` |
| Dot label | the trip's name, verbatim |

## New tokens

| Token | Value | For |
|---|---|---|
| `--dot-size` | `14px` | the drawn place dot |
| `--dot-ring` | `2px` | its ring |

`--marker-size` stays the clustering footprint — the space a dot needs before it
collides — while `--dot-size` is what is drawn inside it. They are different
quantities, and #54 conflated them only because a photo marker fills its own
footprint. `--marker-ring` is already `2px` and `--dot-ring` matches it; kept
separate so the map's own markers can change without moving photo markers.

# 37 — World map of every trip

Tokens and layout from [2-map-shell.md](2-map-shell.md). Route and shell
structure from [30-route-shell.md](30-route-shell.md) — this issue adds a
fourth route, `/world`, and its nav link, following the same pattern #33 used
to fill in `/trips`. Status pill styling matches
[35-trip-detail-view.md](35-trip-detail-view.md), so a trip's status reads the
same on the world map as it does everywhere else. `/` and its v1 flow are
untouched — nothing in this note changes anything #30 or earlier built there.

## Nav

`sidebar__header`'s nav row (#30) gains a third link, "World", after "Map" and
"Trips": `/` → `/trips` → `/world`, matching the order routes were introduced.
Same `NavLink` active-state rule as the other two — `--text-muted` inactive,
`--text` + 2px `--accent` underline active, no `end` prop (there's nothing
under `/world` to distinguish it from).

## Layout

```
┌──────────────────────────────────────┐
│  All ▾  ⬤ planned  ⬤ completed       │  filter row
├──────────────────────────────────────┤
│                                        │
│              [ world map ]            │
│                                        │
└──────────────────────────────────────┘
```

Same region `MapView` occupies on `/`: remaining width beside the sidebar,
full viewport height. The filter row sits as an overlay in the map's top-left
corner, same treatment as Google's own default controls (translucent
`--surface` panel, rounded corners, floating above the tiles) rather than a
fixed header — the map is the content here, not a document, so nothing above
it should compress its height the way #33's fixed create-form header does.

## Filter

A three-way segmented control: `All` / `Planned` / `Completed`, `All` selected
by default. Selecting a segment is instant and client-side — no request, no
loading state — and immediately re-fits the map bounds to whatever is now
visible (see Edge cases for the empty-result case).

Active segment: `--surface-solid` background, `--text`. Inactive: transparent,
`--text-muted`. 8px padding per segment, no icons — three words fit
comfortably and an icon would be decoration, not information.

## Route rendering

Each trip's route is one polyline sourced from its `overview.geojson`,
consistent with #5's existing polyline treatment (same stroke width, same
click target padding) with one addition: **stroke style carries status.**

- **Completed** — solid `--accent` stroke, 3px, matching #5's existing track
  polylines exactly. A completed trip is a record of what happened; it gets
  the same visual weight the app already gives a track.
- **Planned** — dashed `--text-muted` stroke (`stroke-dasharray`), 3px. Muted
  and dashed reads as "not yet real" without needing a legend — same instinct
  as construction-phase lines on a printed map.

No legend is rendered; the filter control's own labels (`Planned`,
`Completed`) double as the key, and #35's status pill already trains the same
color association (accent = planned, muted = completed) — reusing it here
keeps one vocabulary instead of two.

Hover: cursor becomes a pointer over any route (both statuses are clickable),
stroke width increases to 5px on hover as the only feedback — consistent with
not having a persistent legend, this is the affordance that says "this line is
a thing you can click."

Click: navigates to `/trips/:id` for that trip, same destination #33's row
click and #35's back-link both already use.

## Main path

1. Navigate to `/world`. View enters **Loading** (below).
2. Trip index loads (same local index #33 reads for `/trips`). For each trip,
   its `overview.geojson` is requested.
3. As each trip's geometry arrives, its route draws onto the map immediately
   — same "arrives, draws, no fixed order" behavior #35 already specifies for
   its own file list, for the same reason: waiting for the slowest trip to
   show any of them is a worse experience than a few extra polylines
   trickling in over a second.
4. Once the whole batch has settled (every trip's fetch either succeeded or
   failed), the map fits bounds to the union of all currently visible routes
   (respecting the active filter). One fit, not one per arrival — same
   deferred-fit rule #35 uses for its own file batch, and for the same reason:
   fitting on every arrival makes the camera visibly lurch trip by trip.
5. Changing the filter re-fits bounds immediately to the new visible set (this
   is a synchronous, already-loaded operation, unlike the initial batch fetch,
   so there's no reason to defer it).

## States

**Loading** — nothing has arrived yet. Map region shows `--surface-solid`, no
spinner — consistent with the map shell's stance elsewhere (#2, #35) that a
static placeholder beats a spinner that flashes and vanishes on a fast
connection. Filter row still renders (it doesn't depend on any trip data) but
is inert — segments are visually present, not disabled, since selecting one
early just does nothing yet.

**Populated** — routes rendered as above, bounds fit to the visible set.

**No trips exist** — trip index is empty. Centred on `--surface-solid`, same
pairing #33's own empty state uses:

> **No trips yet**
> Create one from Trips to see it here.

Filter row does not render in this state — there's nothing to filter.

**Filter excludes everything** — trips exist, but none match the active
filter (e.g. every trip is `completed` and `Planned` is selected). Filter row
stays visible (so the user can change it back). Map region shows, centred:

> **No planned trips**
> or: **No completed trips**

Copy substitutes the excluded status name; `All` can never produce this state
since it excludes nothing.

**Partial failure** — one or more trips' `overview.geojson` fails to load
(404, network error, malformed). Failed trips are silently absent from the
map — no error row, no toast, since there's no per-trip list here for an error
to attach to the way #35 attaches one to a file row. They don't count toward
the bounds fit and don't block other trips from loading or rendering. If
*every* trip fails, the view reads identically to **No trips exist** — no
separate "everything failed" state, since from the user's seat the two are
indistinguishable and neither is actionable.

## Copy

| Context | Copy |
|---|---|
| Nav link | `World` |
| Filter segments | `All` / `Planned` / `Completed` |
| Empty (no trips) heading | `No trips yet` |
| Empty (no trips) subtext | `Create one from Trips to see it here.` |
| Empty (filtered) heading | `No planned trips` / `No completed trips` |

## Edge cases

- **Single trip** — bounds-fit to one route's extent still works (Google Maps
  handles a degenerate single-feature bounds by padding to a reasonable
  zoom); no special-case needed.
- **Trip with an empty or missing `overview.geojson`** (valid trip, no
  geometry, e.g. a `planned` trip with no track yet attached) — treated the
  same as a load failure: absent from the map, doesn't affect bounds-fit for
  the rest.
- **All trips planned, or all completed** — `All` renders every route with
  its respective style; no different from the general case, just a
  uniform-looking result.
- **Very large trip count** — no clustering or decluttering (explicitly out
  of scope per the issue), so a few dozen overlapping routes render as-is.
  Real only once there's data to prove it a problem, same stance #33 takes on
  its own list scroll.
- **Rapid filter toggling** — each change is synchronous and client-side;
  toggling quickly just re-fits bounds repeatedly, no debounce needed since
  there's no request in flight to cancel.
- **Reduced motion** — bounds-fit is a camera move, not a decorative
  animation; Google Maps' own instant-pan behavior under `prefers-reduced-motion`
  is inherited as-is, consistent with #2's stance that only decorative motion
  gets suppressed.
- **Navigating away mid-load** — in-flight `overview.geojson` fetches are
  abandoned (no cancellation needed for correctness — results for an
  unmounted view are simply discarded), consistent with there being no
  loading state to get stuck in on return.

## Not decided here

Whether routes redraw from scratch on each visit to `/world` or a cached
result is reused across navigations is left to implementation — no
acceptance criterion depends on it, and #36's cache story may settle this
independently once it exists. Whether the filter selection persists across a
navigation away and back (e.g. in URL state) is also left open; `All` on
every fresh visit is the safe default until there's a reason to do more.

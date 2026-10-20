# 530 — Route thumbnails on activity cards

Part of #525. Fills #528's visual slot for activities with a GPS track. Board A
of the prototype (https://claude.ai/artifact/3EKueKvLjDGy2Now8unv9m). Reuses
#407's track fetch, cache rules and `--map-*` tokens.

## What draws

A card whose activity has a `track_ref` and can read tracks (demo mode, or a
build with `VITE_THRIVE_API_URL`). A Maps key isn't needed, because nothing here
uses Google Maps.

- **The tile:** the 92×80 slot, `--color-surface-raised`, `--radius-md` +
  `--space-xs`.
- **The line:** an inline SVG polyline of the track. It has a casing stroke in
  `--map-track-casing` at `--map-track-width-casing`, under a line in
  `--map-track` at `--map-track-width`, scaled down. Both are drawn at
  `vector-effect: non-scaling-stroke` with widths of 60% of the map's, so
  they read at thumbnail size (2.4 and 4.2 at today's values). The joins and
  caps are round.
- **The start dot:** a circle at the first point, `--map-dot-size` × 0.5, in
  #407's start-dot colours.
- **Fit:** the points go through `routePoints` (`@keel/geo`:
  `dropInvalidLatitudes`, `normalizeAntimeridian`), then are projected
  equirectangularly with longitude scaled by cos(mean latitude). They're
  fitted inside the tile with `--space-sm` padding, preserving aspect ratio and
  centring.
- **No map tiles:** no basemap and no request to `maps.googleapis.com`. This
  keeps #407's rule that opening the Activities list requests nothing from
  Google Maps.
- `aria-hidden="true"`. The card's name doesn't change.

The decision against a basemap is deliberate. A basemap would mean the Static
Maps API (a second paid API and key restriction) or one live map per card. The
line alone is what tells one ride from another.

## When it fetches

- **IntersectionObserver** on the card, with `rootMargin` of one viewport height
  above and below. The first time it intersects, the card asks for its track.
- **Queue:** at most two requests in flight. The rest wait in a FIFO and start
  as earlier ones settle. A card that scrolls out of range before its turn is
  dropped from the queue, and it asks again if it comes back.
- **Cache:** the session cache moves from `route-section.tsx` to a module
  (`src/maps/track-cache.ts`), keyed by workout id. The list and the detail
  screen read and fill the same cache. A cached track draws immediately, with
  no observer wait. Failures aren't cached, so a later visit tries again.
- **Demo mode** reads the bundled tracks and makes no call.

## States

| State | Slot shows |
|---|---|
| Not yet in range / queued / loading | #528's type-icon tile |
| Loaded, two or more usable points | the route thumbnail |
| Loaded, fewer than two usable points | the type-icon tile |
| Any failure (network, timeout, token, `no_track`) | the type-icon tile. `console.warn('route thumbnail:', kind)` once per card, the kind only, never a token, body or coordinate |
| No `track_ref` | the type-icon tile, and no request ever |

There's no spinner, no error text and no retry control. The tile is a complete
state on its own. The detail screen keeps its own Try again.

There's no fade when the line replaces the tile. It swaps in place, so it
doesn't flicker on fast scrolls.

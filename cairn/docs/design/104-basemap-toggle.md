# #104 — Basemap toggle

Tokens are [design-language.md](design-language.md). This note specifies one
new component, `BaseMapControl`, and the shared preference it drives.

## The control

A four-segment control, visually the same pattern as `WorldMap`'s
`StatusFilterRow` (a pill-shaped strip of ghost buttons in an L2 panel) but
built as its own component, `BaseMapControl`, so both `MapView` and
`WorldMap` can mount it without one importing internals from the other.

**Position: top-right on both surfaces**, docked below both `AccountBubble`
(top-right, `--space-4` from each edge, 40px tall in both its signed-out and
signed-in states — present on both routes) and `TopBar` (top-left, 72px
tall, world map only). `top: calc(var(--space-4) + 72px + var(--space-2))`
— the taller of the two, and the same offset `StatusFilterRow` already uses
below `TopBar`. Clearing only `AccountBubble`'s 40px was tried first and
looked right at desktop width, but at narrow viewports `TopBar` is wide
enough to reach under this control's left edge, producing a real overlap in
the vertical band between 40px and 72px — caught by measuring
`getBoundingClientRect()` at 320px and 375px widths, not by eye. `TopBar`
isn't rendered on the trip detail route, so this is extra clearance there
rather than a second case to handle. `DateRangeControl` sits bottom-center
and the zoom control docks bottom-right by default, so neither is affected.

Segments, left to right, each a single glyph-free text label (icons would
need a fifth thing decided — a set to draw from — for four items that don't
share a family):

| Segment | `mapTypeId` |
|---|---|
| Map | `roadmap` |
| Satellite | `satellite` |
| Hybrid | `hybrid` |
| Terrain | `terrain` |

```
.basemap-control {
  position: absolute;
  top: calc(var(--space-4) + 72px + var(--space-2));
  right: var(--space-4);
  z-index: 1;
  display: flex;
  gap: var(--space-1);
  padding: var(--space-1);
  border-radius: var(--radius-md);
  background: var(--surface);
  backdrop-filter: blur(var(--blur));
  box-shadow: var(--shadow-lifted);
}

.basemap-control__segment {
  border: none;
  border-radius: var(--radius-sm);
  padding: var(--space-2);
  font-size: var(--text-sm);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}

.basemap-control__segment:hover { color: var(--text); }
.basemap-control__segment:active { background: var(--pressed); }

.basemap-control__segment--active {
  background: var(--accent-soft);
  color: var(--accent);
}
.basemap-control__segment--active:active {
  background: color-mix(in srgb, var(--accent-soft) 80%, var(--accent) 12%);
}
```

This is the corrected Selected treatment from design-language.md
(`--accent-soft` fill, `--accent` text) rather than `StatusFilterRow`'s
`--ground`/`--text`, which predates the token migration and is tracked
separately under "Applying this" in design-language.md. New chrome uses the
current tokens; it does not copy the drift.

Hit target: `--space-2` padding on `--text-sm` is under the 40px minimum the
language calls for on its own — pad the segment to a 40px height explicitly
(`min-height: 40px; display: inline-flex; align-items: center;`), matching
the rule rather than `StatusFilterRow`'s current shortfall.

## State

**Shared, not per-surface.** One preference, read and written by both
`MapView` and `WorldMap` through a single hook:

```
useBaseMapType(): [google.maps.MapTypeId, (next) => void]
```

Backed by `localStorage`, same shape as `trackOverridesStore.ts` — a single
key (`cairn.baseMapType`), read once on mount, written on every change. No
`storage` event listener: the two maps are never mounted at once (one route
shows one or the other), so cross-tab sync during a single session isn't a
case that comes up.

**Default: `satellite`.** Nothing stored, or a stored value that isn't one
of the four valid strings (a future rename, a hand-edited value) — both
resolve to `satellite`, matching today's hardcoded behavior. Malformed
`localStorage` fails open to the current experience, not to `roadmap`.

## Interaction

- Tap/click a segment → that segment becomes active immediately, the map's
  `mapTypeId` prop updates in the same render, no transition or fade. Google
  redraws the base layer itself; nothing in the app animates it.
- The already-active segment is clickable but a no-op — same as
  `StatusFilterRow` today.
- Keyboard: each segment is a real `<button>`, so tab order and Enter/Space
  activation come for free. No roving tabindex — four items doesn't earn the
  extra complexity a `radiogroup` roving pattern would add, and disabled/
  active states already cover what the touch UI needs.

## Edge cases

- **Photos panel / photo markers**: unaffected. `PhotoLayer` positions
  against lat/lng, not against the base layer, so switching to `roadmap`
  with photos on screen just changes what's underneath the markers.
- **`hybrid` and `roadmap` label density at low zoom**: at world zoom
  (`INITIAL_ZOOM = 2`), `hybrid`/`roadmap` render very few labels until the
  user zooms in — this is Google's own behavior and not something the
  control needs to compensate for.
- **No Map ID** (`googleMapsMapId` unset): the toggle still works — `mapId`
  gates Advanced Markers (photos) only, per the existing comment in
  `MapView.tsx`, and is unrelated to `mapTypeId`.
- **Narrow viewport**: four `--text-sm` labels in one row fit comfortably
  within the padding already used elsewhere on mobile (`StatusFilterRow`
  ships three segments today at the same width class); no wrap behavior
  needed.

## Out of scope (per the issue)

No icons, no fifth "satellite + labels at low zoom, roadmap at high zoom"
smart mode, no per-surface preference.

# 55 — Photo list and lightbox

Tokens from [design-language.md](design-language.md). Sidebar shell and trip
header from [35-trip-detail-view.md](35-trip-detail-view.md); row anatomy from
[6-track-list.md](6-track-list.md). Markers and the shared selection from
[54-photo-markers.md](54-photo-markers.md). Images through #53's cache.

## New tokens

| Token | Value | For |
|---|---|---|
| `--photo-thumb` | `32px` | list row thumbnail |
| `--row-touch` | `44px` | minimum row height on touch |
| `--scrim` | `color-mix(in srgb, var(--ground) 70%, transparent)` | modal backdrop |

`--row-touch` names the 44px the design language's Interaction states section
already states in prose but never tokenised. `--scrim` is mixed rather than
hand-picked, following that document's rule that derived values are computed so
a palette change propagates. `--marker-size` and `--hit-target` come from
[54-photo-markers.md](54-photo-markers.md) and are not redefined here.

## The list

A section in the trip sidebar, beneath the track list — tracks are the trip's
shape and photos are what happened along it, so shape comes first.

```
┌──────────────────────────────┐
│  ● Day-3.kml    12.4 mi  👁  │  tracks (#6)
├──────────────────────────────┤
│  Photos                  48  │  section header
│  ▦  09:14   Sapporo…         │  row, recorded
│  ▦  09:41   ⟂ estimated      │  row, derived
│  ─────  No location  ──────  │  divider
│  ▦  —      IMG_4102.jpg      │  row, unlocated
└──────────────────────────────┘
```

**Rows** are `--row-touch` minimum. A `--photo-thumb` thumbnail at
`--radius-sm`, the capture time in `--text-sm` tabular numerals, and the
filename in `--text-muted` truncated with the full name in `title`.

Derived rows carry a small `--text-muted` marker after the time — the same
dashed vocabulary as #54's ring, in text form. Recorded rows carry nothing;
absence of a caveat is the signal, and marking the common case is noise.

**Order** is capture time ascending. A trip reads chronologically or it reads as
a shuffle.

**Photos with no capture time** sort last, under a `No date` divider, ordered by
filename so the order is at least stable run to run. They are never dropped —
a photo cairn stored and cannot show is worse than one it refused.

**Photos with no position** appear under a `No location` divider at the very
end. This is the whole reason the list exists: #54 cannot render them, and
without a home here they would be unreachable. The divider is a label, not a
collapsed group — hiding them behind a disclosure recreates the problem.

A photo can be both undated and unlocated. `No location` wins as the outer
grouping, since it is the one that affects whether the photo is reachable at
all.

## Selection

One selection, two views. Clicking a row selects that photo and its marker
(#54); clicking a marker selects the row and scrolls it into view with
`scrollIntoView({ block: 'nearest' })` — `nearest` rather than `center` so an
already-visible row does not make the list jump for no reason.

Selected row: `--accent-soft` fill, `--accent` text, per the design language's
selected state. No border, no transform.

Selecting an unlocated photo selects nothing on the map, and that is fine — it
has no marker. The map does not move.

## The lightbox

Opening a photo — clicking its row, or its already-selected marker — shows it at
full size over the map.

**Treatment** is elevation L2 exactly as #49 reclassified it: `--surface` at
`--radius-md`, `backdrop-filter: blur(var(--blur))`, `--shadow-lifted`, and no
border — it touches no edge, so it needs no seam. Over a `--scrim` backdrop.

It is not full-bleed; the map staying visible at the margins is what keeps it
feeling like a layer over a place rather than a separate page, and it is also
what makes the blur mean something. The design language's "blur only over the
map" rule is satisfied here for the same reason it is not on `/trips`.

**Contents**: the image, scaled to fit within the viewport with its aspect
preserved and never upscaled beyond its natural size. Beneath it, one
`--text-sm` `--text-muted` line — capture time, and `Position estimated from
track` when derived. The provenance the marker gave up while selected reappears
here.

**Controls**: previous and next affordances, a close button, all `--hit-target`
squares.

**Keyboard**: `←` and `→` move through the list in its displayed order. `Esc`
closes. Focus is trapped inside while open and returns to the control that
opened it — the row or the marker, whichever it was.

Arrows **do not wrap**. Stopping at the ends tells you where you are in the
trip; wrapping silently restarts it and there is no other cue that you have.

**Loading** — the frame renders immediately at the thumbnail's aspect ratio,
showing the thumbnail scaled up and blurred until the original arrives. The
thumbnail is already cached from the list, so this is free, and it means the
frame never resizes under the user when the full image lands.

## States

**No photos** — section header reads `Photos` with no count. Centred in the
section:

> **No photos yet**
> Drop photos onto this trip to see them here.

**Loading** — rows render as thumbnails resolve through #53, in list order.
A row whose thumbnail has not arrived shows a `--surface-lift` square in its
place; the time and name are already known from `photos.json` and render
immediately. Rows do not wait for the batch, matching #35 and #54.

**Thumbnail failed** — the `--surface-lift` square persists. The row stays
selectable and openable; a failed thumbnail says nothing about the original.

**Original failed in the lightbox** — the blurred thumbnail stays as the frame's
content, with a `--danger` line beneath: `Couldn't load this photo.` The viewer
does not close itself and the arrows still work — one unreachable photo should
not eject you from the trip.

## Copy

| Context | Copy |
|---|---|
| Section header | `Photos` |
| Empty heading | `No photos yet` |
| Empty subtext | `Drop photos onto this trip to see them here.` |
| Undated divider | `No date` |
| Unlocated divider | `No location` |
| Derived caveat | `Position estimated from track` |
| Original load failure | `Couldn't load this photo.` |
| Close button label | `Close photo` |
| Previous / next labels | `Previous photo` / `Next photo` |

## Edge cases

- **One photo in the trip** — both arrows render disabled at `opacity: 0.4`
  with no hover response, per the design language's disabled state. Rendering
  them disabled rather than hiding them keeps the frame from reflowing when a
  second photo is added.
- **Every photo unlocated** — the list is entirely under `No location` and the
  map has no markers. Correct and legible; nothing needs to say more.
- **A very tall panorama** — fits to viewport height, letterboxed left and
  right against the scrim. Never upscaled, never cropped.
- **Rapid arrow presses** — each keypress advances one photo; in-flight loads
  for skipped photos are abandoned. The frame shows whichever photo is current,
  not whichever request resolves last.
- **`Esc` while the original is still loading** — closes immediately. A pending
  fetch never blocks a close.
- **Photo removed from Drive while the viewer is open** — behaves as
  **Original failed** above.
- **A trip with tracks and no photos** — the photo section still renders with
  its empty state, so the way to add photos is discoverable from a trip that has
  none. This is the case #35 got wrong for tracks and worth not repeating.
- **List scrolled far from a newly selected marker** — `scrollIntoView` handles
  it; under `prefers-reduced-motion` the scroll is instant rather than smooth.
  This one needs an explicit `matchMedia` check in JS: `index.css`'s global
  reduced-motion block collapses CSS animations and transitions, and
  `scrollIntoView({ behavior: 'smooth' })` is neither, so it slips through.
- **Selecting a row while the lightbox is open** — the lightbox is modal and
  traps focus, so this cannot happen from the list. Arrow keys are the only way
  to change photo while open, which is the point of trapping.

## Not decided here

Whether the photo section is collapsible is left open — it matters at a few
hundred photos and cairn has not seen that yet, and a disclosure added early is
a click on every visit. Whether the lightbox uses the View Transitions API to
animate the thumbnail into the frame is a natural fit for the design language's
shared-element note but belongs to that migration, not to this issue.

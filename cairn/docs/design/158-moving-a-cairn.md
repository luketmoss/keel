# 158 — Moving a cairn by dragging its marker

Model in [cairns.md](cairns.md), standing and outranking this note. Marker
treatment from #155, interaction states from
[design-language.md](design-language.md), read-only stance from #73.

## The rule this issue ships

> **Every cairn can be moved. Moving it sets `positionSource` to `placed`,
> permanently — and interpolation may only ever write to a cairn whose source is
> still `interpolated`.**

Both halves matter. The first says EXIF is a starting value rather than a
verdict. The second is what makes the correction survive the next time a trip's
tracks change.

## The gesture

Press and drag a cairn's marker. There is no handle and no drag mode: the marker
is the target, at its full `--hit-target`.

**The marker follows the pointer directly during the drag, and the marker layer
is not re-rendered until it ends.** Re-rendering mid-drag destroys the node the
pointer is captured by and the drag dies silently halfway — which is not a
theoretical concern; it is what the prototype did before it was fixed, and it
reads as "the map is laggy" rather than as a bug.

Cursor is `grab` on a draggable marker and `grabbing` during. The marker holds
its hover scale of 1.35 for the duration, so it stays visible under the pointer.

## Click and drag are the same gesture until they aren't

A press that never moves is a click and opens the cairn. A press that moves is a
drag and does not.

The threshold is any movement at all once the pointer is down on a marker — not a
pixel budget. A user who moves a marker two pixels meant to move it two pixels,
and there is no harm in the resulting `placed`: the coordinate is what they left
it at.

What this must not do is fire the click *after* a drag. The marker carries a
one-frame flag on drop that suppresses the click that follows.

## What updates, and when

| Thing | When |
|---|---|
| Marker position | Continuously, during the drag |
| The cairn's row in the panel | On drop |
| The detail face's position sentence | On drop |
| `positionSource` | On drop, and only if the marker actually moved |
| Drive write | On drop, behind the local update |

The detail face stays open throughout. Dragging a cairn you are looking at is
the most likely case — you opened it to check where it was — and closing the
face on drop would punish exactly that.

## States

| State | Marker | Detail face |
|---|---|---|
| Rest, draggable | `grab` cursor | Source sentence for its current `positionSource` |
| Dragging | `grabbing`, scale 1.35, follows pointer | Unchanged |
| Dropped | Returns to rest at the new coordinate | Sentence switches to the `placed` copy |
| Write failed | Returns to the **previous** coordinate over `--motion-base` | Sentence returns to the previous source; `--danger` line beneath reads `Couldn't move it — put back where it was.` |
| Disconnected (#73) | `cursor: default`, Disabled treatment, no drag | One sentence per surface, per #73 — not a tooltip per marker |

The revert animates rather than snapping, because a marker that teleports back
looks like a rendering glitch and a marker that slides back looks like a refusal.

## Edge cases

- **Dragging onto another marker** — allowed. Two cairns may share a coordinate;
  clustering (#79) already treats overlap as a display question.
- **Dragging outside the viewport** — the map does not auto-pan in this issue.
  The drop lands at the edge, and the user pans and drags again. Auto-pan on
  drag-to-edge is a real improvement and deliberately not bundled here.
- **Dragging a cairn that is mid-upload from #155's import** — refused, the same
  `canChangeOwner` gate that already blocks an ownership move on an item whose
  files are still in flight.
- **A drag that starts on a marker and ends on the panel** — the drop is taken at
  the last coordinate over the map. The panel is not a drop target.
- **Rapid repeated drags** — each is its own write, serialised per cairn id by
  the store's existing queue, so the last drop wins rather than an earlier write
  landing after a later one.
- **Dragging during the #155 placement queue** — the queue owns the map click,
  and existing markers are not draggable while it is open.

## Trip and track markers do not drag

Their positions are derived — a trip's origin from its first track's first
coordinate, a track's from its geometry. Dragging one would either lie about the
geometry or silently rewrite it. They keep the default cursor and ignore the
gesture.

This asymmetry is the model made visible: **a cairn is the only thing in cairn
whose position is authored.**

## Copy

| Where | String |
|---|---|
| Detail, after a move | `You put this here. Interpolation will never move it again.` |
| Detail, before, `exif` | `Position came from the photo's EXIF GPS — a starting value, not a verdict. Drag its marker to correct it and this becomes placed.` |
| Detail, before, `interpolated` | `No GPS, so it was positioned by timestamp against this trip's tracks. Drag its marker to correct it and this becomes placed.` |
| Write failure | `Couldn't move it — put back where it was.` |
| Disconnected surface | `Sign in to move cairns.` |

## New tokens

None.

## Accessibility

- Dragging is pointer-only in this issue, and that is a gap rather than a
  decision — recorded in Out of Scope on the issue as keyboard nudging.
- The marker's accessible name is unchanged by a drag; its position is not
  announced, because a coordinate read aloud is not useful. The position
  *source* sentence in the detail face is the accessible account of what
  changed, and it lives in an `aria-live="polite"` region for this issue.
- `prefers-reduced-motion` removes the revert animation; the marker returns
  immediately.

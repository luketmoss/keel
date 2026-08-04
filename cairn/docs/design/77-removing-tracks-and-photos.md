# 77 — Removing tracks and photos from a trip

Destructive-action rules from [design-language.md](design-language.md)
("Danger cannot rely on colour"). The inline confirm this note reuses is
specified and shipped in [33-trips-list.md](33-trips-list.md). Track rows from
[46-track-file-editing.md](46-track-file-editing.md); photo list and lightbox
from [55-photo-list-lightbox.md](55-photo-list-lightbox.md).

## The rule

**A control that looks like delete deletes.** The track row's `×` currently
filters the row out of React state; the Drive file, its override, and its place
in the trip all survive, and the row returns on the next load. A photo has no
control at all. Both are fixed by the same pattern, and the pattern already
exists one screen away in the trips list.

## The confirm, once

Both surfaces use the trips-list confirm, unchanged in shape: activating the
remove control replaces the row's contents in place with a question and two
actions. No dialog, no overlay, no layout shift — the row is the same height it
was.

```
┌────────────────────────────────────────┐
│  Remove "Holy Cross Day 1.kml"?        │
│                     Remove    Cancel   │
└────────────────────────────────────────┘
```

- `Remove` carries `--danger`, and the word `Remove` is the signal — the colour
  is not permitted to be the only one.
- `Cancel` is `--text-muted`, and is what `Escape` and a pointer-down anywhere
  outside the row do, exactly as in #33.
- Only one row across the whole trip is ever in the confirming state — starting
  a second confirm cancels the first, tracks and photos sharing one slot, since
  they are one list to the user even though they are two components.

The word is **Remove**, not **Delete**. The file goes to Drive's trash and is
recoverable there; `Delete` would overclaim. The trips list keeps `Delete` for a
trip, which trashes a whole folder and is the heavier action.

## What removal does

**A track.** Trash the Drive file; drop its entry from `overrides.json`;
regenerate the trip's `overview.geojson` from the tracks that remain; drop the
row and its polyline. The remaining tracks keep their names, colours and
relative order — removing the second of five does not renumber the rest.

**A photo.** Trash the original and the thumbnail; rewrite `photos.json` without
the record; drop the row, the marker, and the cached image. Other photos'
positions are unaffected — interpolation is against tracks, not against
neighbouring photos.

Order matters on failure: Drive first, local state after. A row that disappears
and comes back is worse than one that never went.

## States

| State | Row |
|---|---|
| Rest | name, controls, stats — as today |
| Confirming | the confirm above, replacing the row's contents |
| Removing | row at `opacity: 0.4`, controls disabled, `Removing…` in `--text-muted` where the confirm was |
| Failed | row restored to rest, with the failure line below it |
| Disconnected | remove control disabled, per [73](73-disconnected-read-only.md) |

`Removing…` is a real state rather than an optimistic disappearance: the call is
two or three Drive round trips for a photo, and a row that vanishes before they
land will sometimes have to come back.

## Edge cases

**Removing the last track.** The trip stays; the track list shows its existing
empty state. The overview is regenerated as an empty `FeatureCollection`, so
`/world` stops drawing the trip — which is [76](76-route-scoped-chrome.md)'s
"trips exist, none has geometry" case, and reads correctly there.

**Removing the last photo.** The photo list returns to its empty state from
#55, which is deliberately still rendered for a trip with no photos.

**Removing the photo currently open in the lightbox.** The lightbox is not a
place to confirm a removal — the control is on the list row only. If a removal
completes while that photo is open (it cannot today, but the state is
reachable if the lightbox is left open), the lightbox closes and focus returns
to where it came from, per #55's focus-return contract.

**Removing a photo that is currently selected.** Selection clears. A selected id
naming nothing is how a stale marker highlight survives.

**Removing a track whose file is already missing from Drive.** It is rendered as
a `MissingTripFile` row, which has no remove control today and gains none here —
out of scope, and named as such in the issue.

**A removal that fails partway** — the original trashed, the thumbnail not. The
row returns with the failure line; a retry re-attempts both, and trashing an
already-trashed file is not an error worth surfacing.

**A removal in flight when the session expires.** Fails like any other Drive
call; the row comes back and the account row explains why (#72).

**Rapid repeat activation.** The remove control is disabled from the moment the
confirm is accepted, so a double activation cannot start two removals.

## Copy

| Where | String |
|---|---|
| Track/photo remove control | `aria-label`: `Remove <name>` |
| Confirm question | `Remove "<name>"?` |
| Confirm actions | `Remove` / `Cancel` |
| In flight | `Removing…` |
| Track failure | `Couldn't remove <name> — try again.` |
| Photo failure | `Couldn't remove <name> — try again.` |

## New tokens

None. `--danger` and the `Disabled` treatment are already defined, and the
confirm reuses the trips-list layout.

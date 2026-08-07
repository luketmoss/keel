# 110 — tracks and photos that don't belong to a trip

The model, the markers, the storage layout and the ownership rules are
normative in [shell-and-content-model.md](shell-and-content-model.md). This note
covers the states, the edge cases, and the copy that document does not fix.

## The main path

**Importing loose.** A file dropped on the map with no trip open imports loose:
a track lands in `/Cairn/loose/tracks/`, a photo in `/Cairn/loose/photos/`. The
draft flow from #81 is unchanged for a drop the user wants to become a trip —
what changes is that not becoming one is now a valid outcome.

**Adding to a trip.** `Add to a trip` on the detail, or from the row's `⋮`. The
picker lists existing trips with their counts, plus `New trip…`. Choosing moves
the item and opens the destination trip, so the result is visible rather than
asserted.

**Removing.** `Remove from trip` inside a trip returns the item to the top level
with everything about it intact. `Delete permanently…` is the neighbouring item
and destroys the file.

## Two exits, never one

Removing and deleting are separate menu items with the full phrases as labels.
This follows the design language's rule that a destructive action never relies
on colour: `--danger` and `--accent` are near-identical under red-green colour
blindness, so the words carry it.

`Delete permanently…` takes the ellipsis and the existing inline confirm.
`Remove from trip` takes neither — it is reversible by adding it back.

## States

| State | List row | Map |
|---|---|---|
| Loose track | `9 Mar 2024 · 14.2 km · 690 m` | Tile in the track's colour |
| Loose photo, located | `3 Nov 2024 · photo` | Circular thumbnail |
| Loose photo, no position | `1998 · no location` in `--danger` | No marker |
| Owned | Appears only inside its trip | No top-level marker |
| Moving | Row disabled at `opacity: 0.4` until the move settles | Marker stays until it settles |
| Move failed | Row returns with `Couldn't move — still on the map.` | Marker unchanged |

A move is two Drive operations and is not atomic. **The item stays where it was
until both succeed** — a half-moved item that belongs to nothing is worse than a
move that visibly did not happen.

## Edge cases

**A photo with no GPS and no trip.** It cannot be placed: #52's interpolation
needs tracks to interpolate against. It lists, it does not draw, and its detail
explains the way out. This is the one genuinely awkward state in the model and
it gets words rather than an error:

> **No location**
> It has no GPS and no trip to interpolate against, so it is in your list but
> not on the map. Adding it to a trip whose tracks cover its timestamp will
> place it.

**Adding that photo to a trip that does not cover its timestamp.** The move
succeeds; the photo is still unplaced. The same box shows inside the trip, with
its second sentence dropped — there is no longer a way out to describe.

**Deleting a trip that owns things.** The confirm names the count:
`Delete "Larapinta Trail" and its 4 tracks and 128 photos?` The alternative —
orphaning them back to the top level — turns one deliberate action into a mess
the user has to clean up. Deleting a trip deletes what it holds.

**A trip whose last item is removed.** It stays, empty. An empty trip is a
plan, not a mistake, and #4's empty state already covers it.

**Creating a new trip from the picker.** The trip is created with `planned`
status and no dates, and the item moves into it in one step. Creating an empty
trip is not a state the user passes through.

**A name collision.** Two trips may share a name. Trips are identified by id
and the picker shows counts to tell them apart.

**A loose track with no name** — a KML with an unnamed placemark. Falls back to
the filename, as #5 already does.

**Clustering.** All three kinds cluster into one pool. A cluster's label counts
things, not trips, and its `aria-label` names them.

## Transitions

Adding to a trip: the picker closes over `--motion-fast`, the panel swaps to the
trip face over `--motion-base`, and the item's marker leaves the map. No toast —
landing on the destination is the confirmation.

Removing: the panel stays on the trip, the row leaves the list, and the marker
appears at the top level. Here a toast is warranted, because the result is
off-screen: `Moved back to the map.`

## Copy

| Where | String |
|---|---|
| Kind line, loose track | `track · not in a trip` |
| Kind line, loose photo | `photo · not in a trip` |
| Chips | `All` · `Trips` · `Tracks` · `Photos` |
| List header per chip | `Everything` · `Trips` · `Loose tracks` · `Loose photos` |
| Primary action | `Add to a trip` |
| Picker heading | `Add to a trip` |
| Picker new option | `New trip…` |
| Picker name field | `Name the new trip` |
| Picker confirm | `Create` |
| Loose row menu | `Add to a trip…` · `Rename` · `Change colour` · `Export` · `Delete…` |
| Owned row menu | `Remove from trip` · `Rename` · `Change colour` · `Export` · `Delete permanently…` |
| Unplaced marker | `no location` |
| Remove toast | `Moved back to the map.` |
| Move failure | `Couldn't move — still on the map.` |

`Change colour` appears only for tracks.

## New tokens

None. `--marker-track` is declared in the standing document and added by #109.

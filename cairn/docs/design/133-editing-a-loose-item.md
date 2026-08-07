# 133 — renaming and recolouring a loose item

The two surfaces, the row's `⋮` and the detail face's header, are normative in
[shell-and-content-model.md](shell-and-content-model.md); the menu's contents
and their order are settled in
[110-loose-tracks-and-photos.md](110-loose-tracks-and-photos.md); the disabled
treatment while disconnected is #73's; tokens are in
[design-language.md](design-language.md).

Export is #140 and is not designed here.

This note decides where the edit happens, what the user sees while it is in
flight, and what they see when Drive says no.

## The menus

Both surfaces carry the same items in the same order — #110's table, minus the
one that is another issue.

| Kind | `⋮` |
|---|---|
| Loose track | `Add to a trip…` · `Rename` · `Change colour` · `Delete…` |
| Loose photo | `Add to a trip…` · `Rename` · `Delete…` |

`Change colour` appears for tracks only. A photo's marker is its thumbnail, not
a palette entry, so there is nothing to change.

Ellipses mark the items that open something further — a picker, a confirm.
`Rename` and `Change colour` take none: they act in place.

## Rename

**The name becomes an input where it already sits.** On the row that is the row
name; on the detail face it is the `--text-lg`/700 heading. No dialog, no
second surface — this is the same treatment a track inside a trip already gets,
and the row confirm and the picker have both already established that this
panel edits in place.

| Event | Result |
|---|---|
| `Enter` | Commits |
| Blur | Commits |
| `Escape` | Cancels, old name restored |
| Commit of an empty or whitespace-only value | Cancels — nothing is written |

Commit-on-blur rather than commit-on-`Enter`-only, matching `TrackList`. An
empty commit cancelling rather than saving is `LocalTripStore.updateTripSync`'s
existing rule for a trip's name: an empty name is an aborted edit, not a saved
one.

## Change colour

`ColorPopover` — the palette grid a track inside a trip already opens, with the
current colour ringed and every swatch named by its palette name for a screen
reader. It closes on selection, on `Escape`, and on a click outside.

On the detail face it opens from the existing `Colour` swatch in the stats list,
which becomes a button. On the row it opens from the `⋮` and anchors under it,
bounded by `--panel-width` like every other thing that opens inside the column.

Selecting a colour changes four things at once: the row's glyph, the map tile,
the route the track draws on hover and on selection, and the swatch on the
detail face. They all read `colorIndex` off one record, so there is no sequencing
to design — but the map is the one the user is most likely to be looking at, and
it must not lag the swatch they just clicked.

## States

| State | What it shows |
|---|---|
| Rest | The name as text; the colour as a swatch |
| Editing | Input with the current name selected; `--surface-lift` fill, `--radius-sm` |
| Saving | The new value, already committed. No spinner |
| Saved | The new value, with the brief `--field--saved` flash `TrackList` uses |
| Failed | The old value returns, and a line beneath in `--danger` |
| Stale | The value **Drive holds** appears, and the same line |
| Disconnected | Both items take the Disabled treatment in the `⋮` |
| Uploading / not on Drive | Both items disabled, like `Add to a trip…` |

**Optimistic, and no spinner.** The new name is on screen before the Drive write
resolves, because a rename is a local decision the network is only recording. A
progress indicator on a one-field write teaches the user that renaming is slow,
which it is not.

**An item still uploading, or one that failed to upload, cannot be edited.**
`canChangeOwner` already gates `Add to a trip…` for exactly this reason — there
is no record file in Drive yet to rewrite — and rename and colour use the same
gate. The row's meta line already says which state it is in (`uploading…` /
`not on Drive`), which is #73's one-sentence-per-surface rule rather than a
tooltip per control.

## Failure, and the two kinds of it

**An ordinary write failure** — network, quota, an expired token. The field
reverts to what it was before the edit, and says so. Nothing was written, so
what was there is still true.

**A stale write** — the record changed in Drive since this session read it,
which is the two-tabs case. Drive v3 has no conditional write; `writeJsonFile`
compares the file's `version` immediately before the PUT and throws
`DriveConflictError`, and every store's flush already goes through it, the loose
store included. What is new here is the *response*.

**The field reverts to what Drive holds, not to what it was before the edit.**
This is `DriveTripStore.resolveConflict`'s behaviour and the right one: the
user's edit did not land, and showing them the value they had a minute ago would
be a third state that is true nowhere. Re-reading the record also means the next
edit starts from real data instead of from a stale local copy that would fail
the same way.

Both failures show one line beneath the field, and the field is left at rest
rather than re-opened for editing. Re-opening would put the user back in an
input they did not ask for, on top of a message they have not read yet.

## Edge cases

**A rename to the same string.** Nothing is written and nothing flashes. The
store's update is a no-op when the patch changes nothing, the way
`savePhotoCount` already bails when the count matches.

**Renaming while the item is open and also visible in the list.** Both read the
same record and both change. There is no list-versus-detail copy to keep in
step.

**Renaming while the "Add to a trip" picker is open on the same item.** The
picker is a different control on the same face and both can be open; the picker
shows trips, not this item's name, so nothing there restates it.

**A very long name.** Unbounded in the record, truncated with an ellipsis and a
`title` wherever it renders — no length limit is imposed. A limit would be an
invented rule, and the row already handles long names from filenames.

**A name that is only whitespace.** Cancels, as above.

**The item is deleted from another tab mid-edit.** The write resolves `false`
against an id the store no longer holds; the face falls through to its existing
`Not found` state on the next hydration.

**A colour change on a track whose route is currently drawn** (hovered or
selected). The polyline's colour changes under the cursor, over
`--motion-fast`. The route is not redrawn — the draw-on animation is licensed
for a *newly imported* track only, and replaying it on a colour change would
claim something was imported.

**A loose track with no geometry.** It has a `colorIndex` and a swatch like any
other, and no route to change. Its glyph still changes.

## Transitions

The name-to-input swap is instant — a field that fades in is a field the user
starts typing into before it is ready. The `--field--saved` flash is
`--motion-fast`. The colour popover opens over `--motion-fast` and the marker's
colour transitions over the same, so the swatch and the map change together.

## Copy

| Where | String |
|---|---|
| Menu item, both kinds | `Rename` |
| Menu item, tracks only | `Change colour` |
| Colour popover, accessible name | `Colours for <name>` |
| Colour swatch, accessible name | the palette colour's name, as today |
| Rename failed | `Couldn't rename <name> — try again.` |
| Colour change failed | `Couldn't save the colour — try again.` |
| Changed elsewhere | `Changed somewhere else — showing the latest.` |

The stale-write line is deliberately not an error. Nothing is broken and nothing
is lost; another tab won, and the field in front of the user is now correct.
`try again` would be wrong advice — the correct action is to look at the value
that is there and decide again.

## New tokens

None. `--surface-lift`, `--radius-sm`, `--danger`, `--motion-fast` and the
Disabled treatment are all declared in
[design-language.md](design-language.md), and `ColorPopover` and the
`--field--saved` flash already exist in `TrackList`.

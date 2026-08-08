# 140 — exporting a loose item

The two surfaces, the list row's `⋮` and the detail face's `⋮`, are normative
in [shell-and-content-model.md](shell-and-content-model.md); the menu's
contents and order are settled in
[110-loose-tracks-and-photos.md](110-loose-tracks-and-photos.md) and
[133-editing-a-loose-item.md](133-editing-a-loose-item.md); tokens are in
[design-language.md](design-language.md).

This note decides what `Export` does, when it appears at all, and what the
user sees while a download is in flight or fails.

## The menus

Both surfaces gain one item, in #110's position:

| Kind | `⋮` |
|---|---|
| Loose track, source file present | `Add to a trip…` · `Rename` · `Change colour` · `Export` · `Delete…` |
| Loose photo, source file present | `Add to a trip…` · `Rename` · `Export` · `Delete…` |
| Either kind, source file missing | as above, **`Export` omitted** |

`Export` takes an ellipsis in none of the other items' sense — it opens
nothing further, it triggers the browser's own download UI directly, the same
class of action `Delete…`'s confirm aside. It is unmarked, matching `Rename`
and `Change colour`.

## Selecting Export

**Track.** Fetches the source KML by `driveFileId` and downloads it under the
record's `sourceName` — the filename the user dropped in, not the record's
(possibly since-edited) display `name`. A renamed track still exports under
its original filename; the app is handing back the file it was given, and
`sourceName` is already kept for exactly this (`loose-face__stats`' `Source`
row shows it today).

**Photo.** Fetches the original by `originalDriveFileId`, never
`thumbnailDriveFileId`, and downloads it under the record's `name` with the
original file's extension preserved (the fetch is by id; the extension comes
from the Drive file's `name` metadata, read alongside the bytes). The
thumbnail is a downscaled copy `PhotoImageCache` already holds a cached URL
for — reusing it would be faster and would also be wrong, handing back a
worse file than the one imported.

**No loading state.** `Rename`/`Change colour` set the precedent: no spinner
for something that finishes in about a second. Unlike those, Export is not
optimistic — there is nothing to show optimistically before the bytes exist —
so the menu item goes to the Disabled treatment (`opacity: 0.4`, no hover)
for the span of the fetch, then the browser's own download indicator (a
tab-bar icon, a downloads-shelf entry) takes over as the confirmation. No
toast on success, the same reasoning #110 gives `Add to a trip`: the
download appearing is the confirmation.

**Menu closes immediately on selection**, before the fetch resolves — unlike
`Rename`/`Change colour`, which stay open on the row as an input or a
popover, Export has no further surface to keep open. Re-selecting `Export`
while a prior one for the *same item* is still in flight is prevented by the
Disabled state above; a different item's `Export` is unaffected.

## Why omit rather than disable

`Change colour` already established the pattern this issue reuses: an action
that does not apply to a *kind* of item (colour, for a photo) is left out of
the menu, not shown disabled. A missing source file is the same shape of
fact — permanent, and true of the specific item rather than of a transient
upload state — so it gets the same treatment. This also sidesteps the
question 133 punted here: there is no meta-line string that describes "on
Drive, but nothing to export," because the menu never asks the question in
front of the user.

This is different from the `uploading`/`failed` gate `canChangeOwner`
already covers. Those are transient — the item will regain every action once
the upload settles or is retried — so they keep the existing Disabled
treatment and rely on the row's meta line (`uploading…` / `not on Drive`),
per #73's one-sentence-per-surface rule. A source-file-missing item is
`uploadState: 'ok'` and shows its ordinary stats; nothing on the row is
wrong, so nothing on the row should look disabled or broken. `Export`
disappearing from an otherwise-normal menu is the entire signal, and it is
consistent with how the app already treats "this action doesn't apply here."

## States

| State | `Export` |
|---|---|
| `uploadState: ok`, source file present | Enabled |
| `uploadState: ok`, source file missing | Not in the menu |
| `uploadState: uploading` | Disabled treatment (`canChangeOwner`) |
| `uploadState: failed` | Disabled treatment (`canChangeOwner`) |
| Fetch in flight (this item) | Disabled treatment, for the duration |
| Disconnected (#73) | Disabled treatment, same as every other mutating-looking action on the row — reading Drive still needs a token |

## Failure

A failed download — network error, an expired token, or the file having been
deleted from Drive behind the app's back — shows one toast, the same
mechanism #110's move-failure and remove-toast already use:

> `Couldn't export <name> — try again.`

Nothing about the record changes: no field to revert, no row state to leave
stale. An expired token additionally flips the account row to #72's expired
state, exactly as #120 describes for an upload failing mid-session — two
facts, two surfaces, neither pretending to be the other. `try again` is
imprecise for the deleted-file case (retrying will fail the same way), but
distinguishing it needs a dedicated "gone from Drive" check this issue does
not add — the generic message is accepted here the way #120 already accepts
one non-atomic edge case rather than building a queue to close it.

## Edge cases

**A very large photo.** No progress indicator, per the no-loading-state
decision above — the browser's own download progress is the one the user
watches, the same as any other same-tab download.

**Exporting while the item is open on the detail face and visible in the
list.** Both menus read the same record and gate identically; there is
nothing to keep in step because nothing about the record changes.

**Exporting a track with no geometry** (parse failure at import). Still has a
`driveFileId` if the upload succeeded — the KML bytes exist even though the
app could not read them. Export is not gated on parseable geometry, only on
the file being fetchable, so it stays enabled: handing back the original file
is the one thing this app can still do for a KML it couldn't parse.

**Two rapid clicks on the same item's `Export`.** The Disabled treatment
during the in-flight fetch (above) makes the second click a no-op rather than
a second download.

**The item is deleted from another tab mid-download.** The fetch either
completes (Drive already had the bytes in flight) or 404s into the generic
failure toast above; either way the record's own removal is handled by the
existing hydration path, unrelated to this issue.

## Copy

| Where | String |
|---|---|
| Menu item, both kinds | `Export` |
| Download failed | `Couldn't export <name> — try again.` |

## New tokens

None. The Disabled treatment, `--danger` (toast), and `--motion-fast` are all
already declared in [design-language.md](design-language.md), and
`ToastStack` already exists for #110's move-failure and remove-toast copy.

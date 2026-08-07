# 120 — loose tracks and photos in Drive

The model, the storage layout and the ownership rules are normative in
[shell-and-content-model.md](shell-and-content-model.md); the states, edge cases
and copy for loose items are in
[110-loose-tracks-and-photos.md](110-loose-tracks-and-photos.md); tokens are in
[design-language.md](design-language.md). Nothing here changes any of them.

This note covers the one thing none of them could: **a loose item now takes
time, and can fail.** Every state below exists because storing a thing in Drive
is a network call and storing it in `localStorage` was not.

**It supersedes one sentence in [75-trip-import-feedback.md](75-trip-import-feedback.md)** —
*"The `/` map page is unchanged. It is scratch space that does not survive a
reload."* That was true when a drop outside a trip produced something disposable.
It has not been true since #110 made the top level a list of real things, and
this issue is what finally makes it false in storage as well. **#75's rule now
covers the top level in full: every dropped file produces a visible outcome.**

## The main path

A file dropped on the map with no trip open, while signed in:

1. The row appears in the list immediately and its marker draws on the map
   immediately. Geometry and stats are computed locally and do not wait on
   Drive — the store writes its local cache first and flushes behind it, exactly
   as `DriveTripStore` does.
2. The row's meta line reads `uploading…` in place of its stats, in the
   monospace face at `--text-xs`, `--text-muted`.
3. The upload settles and the meta line becomes the real one —
   `9 Mar 2024 · 14.2 km · 690 m`, or `3 Nov 2024 · photo`.

No progress bar and no percentage. A trip import shows per-file progress rows
because a batch of fifty photos is a thing you wait on; one dropped file with
its row already on screen is not, and a determinate bar for a two-second upload
is more chrome than information.

No toast on success. The row is on screen, which is the confirmation — the same
reason #110 gives for `Add to a trip` having no toast.

## The row is honest about where the file is

Three meta lines, one per state the file can be in.

| File state | Meta line | Colour |
|---|---|---|
| Uploading, this session | `uploading…` | `--text-muted` |
| On Drive | its real stats (#110's table) | `--text-muted` |
| Not on Drive | `not on Drive` | `--danger` |

**`not on Drive` is not an error the user dismissed their way out of.** It is a
standing statement about that item, shown for as long as it is true, and it
clears by itself the moment a retry succeeds. Retries happen on the next
`connect()` — a reload, or reconnecting after a token expiry — with no control
to press, because there is nothing the user can do differently and a `Retry`
button that only re-runs the same failing call is a promise the app cannot keep.

This is the one state that earns `--danger` on a row that is not a destructive
action. It is warranted: the entire point of this issue is that an item nobody
told you about is an item you lose.

**Items uploaded by the one-time migration are silent while in flight.** A user
who has never touched this app's storage should not open it one morning to a
column of `uploading…`. They are not silent about *failing* — a migrated item
that does not reach Drive shows `not on Drive` like any other, because that
sentence is about the data, not about who triggered the write.

## A move needs the file to exist

`Add to a trip` is a file move. An item whose file is not in Drive yet has
nothing to move, so:

| Item state | `Add to a trip` |
|---|---|
| Uploading | Disabled treatment — `opacity: 0.4`, no hover response |
| Not on Drive | Disabled treatment |
| On Drive | Enabled |

No tooltip. The meta line directly under the name already says why, which is
#73's rule — one sentence per surface rather than a tooltip per control.

The same applies to the `⋮` row menu's `Add to a trip…`.

`Delete…` stays enabled in every one of those states. An item that failed to
upload is exactly the one a user most wants to get rid of, and deleting
something that reached Drive and something that did not are both things this
app can do.

## The move itself

#110 specified the move's states when it was a `localStorage` write. They are
unchanged; what changes is that they now last long enough to be seen.

| State | Row | Picker | Map |
|---|---|---|---|
| Moving | Disabled at `opacity: 0.4` | Stays open, every option disabled | Marker stays |
| Moved | Leaves the list | Closes over `--motion-fast` | Marker leaves |
| Failed | Returns to rest | Stays open, error above the list | Marker unchanged |

**The picker stays open until the move settles, and navigation happens after.**
Closing the picker and navigating optimistically would put the user inside a
trip that does not contain their item yet, and a failure would then have to
throw them back out of a screen they are already reading. Landing on the
destination is the confirmation #110 asked for; it has to be true when they land.

Failure copy is #110's, unchanged: `Couldn't move — still on the map.`

## Arriving in the trip

A moved track's file is now in the trip's folder, so it appears as **its own row
in the trip's track list**, alongside the tracks imported there directly. It is
not distinguished in any way — it is a track in a trip, and #110's model says a
loose track is not a different type from an owned one.

A moved photo appears in the trip's `Photos` tab and on the map, at its EXIF
position, or interpolated against the trip's tracks per #52. #110's edge case
stands unchanged: a photo whose timestamp the trip's tracks do not cover stays
unplaced, and shows the same box with its second sentence dropped.

**The trip's track and photo counts include it.** They are read from the trip's
folder, and the file is now in the trip's folder, so this costs nothing and
requires no cache to be told.

## Dropping while disconnected

Today a *photo* dropped at the top level while signed out imports to
`localStorage` and then #95 hides the result, so the file goes to a place the
user cannot see. That was survivable when the top level was scratch space. It is
not survivable now.

**The overlay still appears at the top level while signed out, and the draft is
untouched.** An earlier draft of this note extended #75's overlay rule to the
whole top level; that was wrong. A dropped track opens #81's draft, which is a
real, visible outcome with its own `Sign in to save` prompt and which survives
signing in — withdrawing the overlay would break a flow that was deliberately
designed to work signed out. #75's rule stands exactly where it stood: no
overlay *inside a trip* while disconnected.

What has nowhere to go is the **loose import** specifically — a photo dropped at
the top level, and the draft's `Keep loose`. Both are refused, with **one toast
for the batch**, not one per file, for the reason #75 gives:

> `Sign in to keep tracks and photos.`

Nothing is written locally. An item accepted into a store that cannot persist it
is the bug this whole issue exists to close, and re-opening it at the front door
would be absurd. `Keep loose` leaves the draft open, so the files are still
there to save or keep once the user signs in.

## States

| State | List face | Map |
|---|---|---|
| Signed in, hydrating | Rows fade in as the index arrives; no spinner | Markers appear with their rows |
| Hydration failed | Whatever was already cached stays, unchanged | Unchanged |
| Signed in, empty | `Nothing here yet` / `Drop a KML or a photo anywhere to start.` | Empty overlay, same copy |
| Disconnected | `Sign in to see your map.` | Same, over the live basemap |

Hydration failing is deliberately indistinguishable from having nothing new:
`DriveTripStore.connect` already swallows a failed list and leaves the cache
alone, and a banner saying "couldn't reach Drive" over a list that is showing
the right rows anyway is noise on every flaky connection.

## Edge cases

**A drop of ten files.** Ten rows appear at once, each with its own
`uploading…`, each settling independently. Uploads are not serialised behind one
another — `import/concurrency.ts` already bounds them, and the same bound
applies here.

**The session expires mid-upload.** The upload fails, the row shows
`not on Drive`, and the account row shows #72's expired state. Two facts, two
surfaces, neither pretending to be the other.

**The same file dropped twice at the top level.** Both import. #75's
already-in-this-trip check is scoped to a trip's contents and is not extended
here: the top level is not a trip, two loose copies of one KML are two rows the
user can delete, and the failure that check prevents — doubling a trip in Drive
— has no top-level equivalent.

**An item deleted on another device.** It disappears from this one on the next
connect. Drive wins over the local cache, same as a trip.

**An item created on another device while this one is offline.** It appears on
the next connect, fading in with the rest of the hydration.

**A photo whose thumbnail upload succeeds and whose original does not**, or the
reverse. The item is `not on Drive` — both files or neither. A half-uploaded
photo is the storage equivalent of the half-moved item #110 refused, and gets
the same answer.

**A move failing after the file has already moved but before the trip's
`photos.json` is written.** The photo is in the trip's folder and invisible in
its Photos tab. The write is retried on the next connect; until then the item is
gone from the top level and not yet in the trip. This is the one genuinely
non-atomic case left in the model — Drive moves a file in one call but cannot
move a file and rewrite a second file in one call — and it is accepted rather
than papered over, because the alternative is a local pending-operations queue
for a case that needs a network failure in a one-second window.

**Deleting a trip that owns moved items.** Unchanged from #110: the trip's
folder is trashed and what it holds goes with it. A track that used to be loose
is not special.

## Copy

| Where | String |
|---|---|
| Row, uploading | `uploading…` |
| Row, upload failed | `not on Drive` |
| Drop while disconnected | `Sign in to keep tracks and photos.` |
| Move failure (unchanged, #110) | `Couldn't move — still on the map.` |
| Remove toast (unchanged, #110) | `Moved back to the map.` |

`uploading…` takes the ellipsis character, matching `Importing…` in the trip
panel. `not on Drive` takes none — it is a state, not an action in progress.

## New tokens

None. `--danger`, `--text-muted`, `--text-xs`, `--motion-fast` and the Disabled
treatment are all already declared in
[design-language.md](design-language.md).

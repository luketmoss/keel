# 59 — Migrate trip metadata and track overrides to real Drive-backed storage

Tokens from [design-language.md](design-language.md). Reuses the trip-header
save-failure contract from [35-trip-detail-view.md](35-trip-detail-view.md)
(`TripMetadataHeader.tsx`) and the track-row save-failure contract from
[46-track-file-editing.md](46-track-file-editing.md) (`TrackList.tsx`) as-is —
this issue changes what's underneath those two error paths, not their copy or
behaviour. It also makes good on the `If-Match`/etag concurrency handling that
[33-trips-list.md](33-trips-list.md), #35, and
[51-photo-import.md](51-photo-import.md) all named and deferred to "the Drive
implementation" — that's this issue.

This is a storage swap, not a new surface. The main design question is what,
if anything, a person sees differently: on first load after this ships
(migration), on every load after that (Drive instead of instant `localStorage`
reads), and on a write conflict (new failure case the existing banners already
have copy for, just not a live cause yet).

## Main path (steady state, after migration)

Unchanged from the user's point of view. `/trips` still shows the list
immediately-feeling; a trip still opens, edits, reorders, and recolours the
same way. The difference is invisible: reads come from an in-memory cache
hydrated from Drive rather than straight from `localStorage`, and writes
flush to Drive in the background instead of synchronously to
`localStorage`. Nothing here licenses new chrome for that — see States below
for the one place it's allowed to show.

## States

**Cold load (app open, cache empty)** — this already exists today in a
different form (#35's **Fetching** state for a trip's file list) and this
issue extends the same stance to trip metadata itself, which used to be
synchronous. `/trips` and `/trips/:id`'s header both show their existing
placeholder treatment (`--border`-coloured static bars, no shimmer, per
#35) while the index and/or trip record load from Drive. No new spinner, no
new copy — this is #35's Fetching state gaining one more thing it covers,
not a new state.

**One-time migration** — the first cold load after this ships, for a trip
that has local data but no Drive file yet. Silent: the trip still renders
from its local copy immediately (nothing to wait for — the data's already
in memory), and the upload to Drive happens in the background exactly like
any other write. If it fails, it is retried on the *next* load rather than
surfaced as an error now — a user who has never seen a Drive-storage error
in this app before should not have their first one be about an upgrade they
didn't take any action to trigger. It is not silent forever: once the trip
has *any* real edit made after this ships (a rename, a reorder, a colour
change), that edit's own save-failure path applies normally, including the
banner.

**Save failure — conflict** (new cause, existing banner) — a Drive write is
rejected with `412` because the local copy's `etag` is stale (another tab or
device wrote first). This surfaces through the exact same paths as any other
save failure: `TripMetadataHeader`'s `Couldn't save — <field> reverted.` and
`TrackList`'s `Couldn't save name — reverted.` / `Couldn't save colour —
reverted.` / `Couldn't save order — reverted.` No new copy, no way for the
user to distinguish "conflict" from "offline" from "token expired" — #35
already made that call for save failures in general, and a conflict is not
special enough to break it. The revert is real, though: on a conflict, the
field reverts to whatever is now in Drive (fetched as part of handling the
`412`), not to whatever was on screen before the failed edit — so a second
attempt to save starts from the current truth instead of retrying against
data that's already stale.

**Drive list unreachable at cold load** (auth expired, network down, folder
missing) — reuses `useGoogleAccount`'s existing `token-expired` /
disconnected states (`32-google-sign-in.md`) rather than inventing a
cairn-storage-specific error: the whole app is already gated on a connected
Drive account before it does anything Drive-backed, so a Drive outage here
is the same "reconnect" prompt as anywhere else, not a new one scoped to
trips.

## Edge cases

- **Deleting a trip while its migration upload is still in flight** — the
  delete wins. `deleteTrip` cancels any pending migration write for that
  trip's files rather than uploading data that's about to be thrown away;
  if the upload already completed, the delete removes the Drive files too,
  same as any other delete.
- **Editing a trip during its own migration** — the edit is just the next
  write. It does not need to wait for the migration upload to finish first;
  if the migration upload and the edit race, the edit (newer) wins, since
  it's the same last-one-in-order-actually-sent semantics as any other two
  writes to the same file — the `etag` check only ever rejects a write
  that's older than what's already there, and the migration upload, being
  first, is what a subsequent real edit's `etag` was read against.
- **Two devices editing the same trip's *different* fields at once** (one
  renames, another changes status) — `trip.json` is one file, so the second
  write still etag-conflicts even though the fields don't overlap. This
  issue does not do field-level merging; the second save reverts and shows
  its banner like any other conflict, and the user re-applies their change
  once they see the (now current) state. Field-level merge is real future
  work but isn't needed to close the "we lose data on a storage wipe" gap
  this issue exists for.
- **Reconnecting after a token-expired banner mid-edit** — matches #32's
  existing reconnect flow; no new copy needed since #35's save-failure
  banner already covers "the write didn't happen," and reconnecting simply
  makes the next attempt succeed.

## Not decided here

Whether the trip list ever shows a distinct "syncing" affordance (e.g. a
subtle indicator that a background flush is in flight) is left out — nothing
in the acceptance criteria needs it, and #35's existing stance is that the
optimistic UI plus the 300ms saved-underline flash is confirmation enough.
Revisit only if real usage shows the silence is confusing.

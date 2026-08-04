# 73 — Disconnected is read-only

Tokens and the `Disabled` treatment from
[design-language.md](design-language.md). Account states from
[32-google-sign-in.md](32-google-sign-in.md) and
[72-drive-session-lifecycle.md](72-drive-session-lifecycle.md). Storage shape
from [59-drive-backed-trip-storage.md](59-drive-backed-trip-storage.md).

## The rule

**Without a Drive connection, trips are readable and not writable.** Today the
app pretends otherwise: it accepts an edit, applies it optimistically, fails
against a dead token, and reverts with `Couldn't save — name reverted.` — and
accepts a delete it cannot complete, which the next sign-in undoes.

One state, one rule, stated once. The app is *disconnected* whenever it holds no
usable token, and that covers three situations the user should not have to tell
apart:

- never signed in this session
- signed out
- `token-expired` (#72)

## Main path

1. The user opens `/trips` without a connection. Cached trips are listed
   normally — names, statuses, dates, all readable.
2. Every mutating affordance is in the language's `Disabled` treatment:
   `opacity: 0.4`, `cursor: default`, no hover response. Concretely: the trip
   create form and its `Create` button, each row's delete `×`, and on the detail
   page the name/status/dates/notes editors, the import control, and the track
   row's rename, recolour and reorder.
3. One explanation, once per surface, rather than a tooltip on each disabled
   thing:
   - `/trips`, under the create form: **`Sign in to add or remove trips.`**
   - `/trips/:id`, in the metadata header: **`Sign in to edit this trip.`**
   Both `--text-sm`, `--text-muted`. The import panel carries its own line,
   specified in [75](75-trip-import-feedback.md), rather than gaining a third
   here.
4. Signing in re-enables everything without a reload — the same
   `useSyncExternalStore` subscription that already drives the lists.

Clicking a trip still opens it, `/world` still draws whatever geometry is
cached, and the map still works. Nothing about reading changes.

## Why not clear the cache on sign-out

It is the tidier answer and it is rejected. Migration of a local-only trip to
Drive is best-effort and silent (`driveTripStore.ts`, `migrateTrip`), so a trip
created while Drive was unreachable exists **only** in `localStorage`. Clearing
on sign-out would destroy it with no warning and no recovery.

The consequence is accepted deliberately: after signing out, your trips stay on
screen. On a single-user personal app that is a smaller cost than a trip that
silently ceases to exist. If cairn ever gets a second user this decision gets
revisited, and that is the trigger to look for.

## States

**Connected.** Everything as specified in #33, #35 and #46. No change.

**Disconnected.** As Main path. Distinguished from `token-expired` only by the
account row above it, which already says which it is — the body of the page
reads identically, which is the point.

**Reconnecting.** Treated as disconnected until the connection actually settles.
A control that becomes live a moment before the token is usable is worse than
one that stays disabled a moment too long.

**Connected, Drive unreachable.** Not this state. A network failure with a live
token is the existing `Couldn't save` path from #35, unchanged — the app has a
token and a real reason to believe the write should have worked.

## Edge cases

**A trip is open and the session expires while it is on screen.** The editors go
disabled in place. Any editor already open commits nothing and closes — an open
input over a store that will refuse the write is a trap.

**An edit is in flight when the session expires.** It fails as it does today and
reverts. This issue does not add a queue; the revert is honest.

**A trip deleted while connected, then a sign-out and sign-in.** Stays deleted.
The Drive folder was trashed at the time of the delete, so hydration has nothing
to bring back — this is the resurrection the issue exists to close.

**A local-only trip that never reached Drive, and the user signs in.** Migrated
up by the existing `connect()` pass, unchanged. This is exactly the trip the
cache-clearing decision above protects.

**The `/Cairn/` folder has been moved in Drive.** Found anyway. The lookup drops
its `'root' in parents` constraint — under `drive.file` the query already only
returns folders this app created, so the parent filter never distinguished
anything and only broke on tidying. Nothing about this is visible to the user,
which is the intent: the folder they moved keeps working.

**Two `Cairn` folders already exist** from a previous occurrence of the above.
The oldest by `createdTime` continues to win, as `findOrCreateCairnFolder`
already does. Merging them is out of scope.

## Copy

| Where | String |
|---|---|
| `/trips`, under the create form | `Sign in to add or remove trips.` |
| `/trips/:id`, metadata header | `Sign in to edit this trip.` |
| Trip import panel | owned by [75](75-trip-import-feedback.md), not restated here |

No message is attached to an individual disabled control. The language's
`Disabled` treatment is the signal; one sentence per surface is the
explanation.

## New tokens

None.

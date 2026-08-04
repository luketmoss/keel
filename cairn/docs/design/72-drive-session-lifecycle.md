# 72 — Drive session lifecycle

Account row anatomy, copy and states from
[32-google-sign-in.md](32-google-sign-in.md) — this note extends that one and
does not restate it. Tokens from [design-language.md](design-language.md).

#32 specified five account states and shipped them. This issue adds the two
transitions that were left out: **a session that survives a reload**, and **an
expiry the app notices**.

## Main path — returning to the app

1. The user signed in at some point in this browser tab and has since reloaded,
   or navigated in and out of the app.
2. Before the first paint of the account row, the app reads the stored session
   from `sessionStorage`. It holds the access token and its absolute expiry.
3. Expiry is in the future. The row renders **`Reconnecting…`** in
   `--text-muted`, the same shape and height as `Setting up your Cairn folder…`
   from #32 — the folder id is not persisted and is re-established here.
4. The `/Cairn/` folder resolves. The row settles to the signed-in state: email
   left, `Sign out` right. No popup appeared and nothing was clicked.
5. The trip detail page's track and photo lists populate as they would after a
   fresh sign-in, because `accessToken` became non-null by the same path.

The whole of steps 2–4 is normally faster than the map's first tiles. The
`Reconnecting…` state exists because it sometimes is not, and a row that is
blank and then suddenly signed-in reads as a glitch.

## Main path — a session that dies while you are using it

1. The user has been in the app for an hour. The token is dead but nothing has
   needed it recently.
2. Any Drive call returns 401. `DriveAuthError` is already thrown at every
   `driveFetch`; it now also reaches the account.
3. The account moves to `token-expired`. The row shows the email, a
   **`Reconnect`** action, and #32's existing message:
   `Your Drive session expired — reconnect to keep using Drive`. This is the
   state that has been unreachable since #32 shipped.
4. Every Drive-dependent control on screen goes to the language's `Disabled`
   treatment — `opacity: 0.4`, no hover response — rather than staying live and
   failing on use. Concretely: the trip import button, the trip metadata
   editors, and the track row's rename/recolour/reorder affordances.
5. `Reconnect` opens Google's popup. On success the row returns to signed-in and
   the disabled controls come back. Nothing that failed is retried
   automatically; the failure rows from #34/#51 stay where they are, and their
   own `tap to reconnect` now routes here too.

## States

Extends #32's table; only the new or changed rows are given.

**Restoring.** Reading a stored session and re-resolving the folder.
`Reconnecting…`, `--text-muted`, no button. Distinct copy from #32's
`Setting up your Cairn folder…` because the user did not just do anything — the
message is about the app catching up, not about a step they started.

**Restore failed.** The stored session existed but the folder lookup failed for
a non-auth reason. Falls into #32's existing `folder-error` state with its
`Retry` and `×`, unchanged.

**Expired.** As step 3 above. This state is now reachable from ordinary use, not
only from a retried folder error.

**Expired, reconnecting.** `Reconnect` activated, Google's popup open. The
action is disabled and reads `Reconnecting…`; the expiry message stays, because
nothing is resolved yet.

**Expired, reconnect dismissed.** The user closed the popup without consenting.
Returns to `Expired` silently — the same stance #32 takes for a cancelled
sign-in. A cancellation is not an error.

## Edge cases

**Two tabs.** `sessionStorage` is per-tab, so each tab holds its own session and
they cannot fight. A second tab opened after signing in starts signed-out; this
is a real cost of the choice and is accepted below.

**The tab is closed and reopened.** Signed out. `sessionStorage` is gone.

**The stored session has already expired on load.** Not restored, and cleared.
The app loads signed-out with no message — a session that quietly lapsed
overnight is not an error worth announcing on arrival, and the sign-in button is
right there. This is different from expiring *during* use, which is announced,
because there the user is mid-task.

**A 401 arrives from a call that started before a successful reconnect.** The
account is signed-in with a newer token by the time the rejection lands. The
late 401 is ignored: expiry is only accepted for the token that is currently
held, so a slow request cannot knock a fresh session back down.

**Sign out.** Clears the stored session as well as the state. A reload after
signing out loads signed-out. What sign-out does to cached *trips* is #73's,
deliberately not decided here.

**No client ID.** Unchanged from #32 — the account row does not render, and
nothing is stored or restored.

## Why `sessionStorage`

A live Drive access token written to `localStorage` outlives the browser
session, sits on disk, and is readable by anything that achieves script
execution on the origin for up to an hour after the tab is gone.
`sessionStorage` fixes the reported problem completely — a refresh no longer
signs you out — and the residue dies with the tab.

The cost is the two-tab case above, and the case of closing the browser and
coming back ten minutes later. Both are a single click to resolve, which is what
the current state costs on *every* reload.

## Copy

| Where | String |
|---|---|
| Restoring a stored session | `Reconnecting…` |
| Expired, banner | `Your Drive session expired — reconnect to keep using Drive` |
| Expired, action | `Reconnect` |
| Expired, action in flight | `Reconnecting…` |
| Import failure row (unchanged, #34) | `signed out before this finished uploading, tap to reconnect` |

## New tokens

None.

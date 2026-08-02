# 32 — Google sign-in and the Cairn Drive folder

Tokens and layout from [2-map-shell.md](2-map-shell.md). Sidebar anatomy from
[6-track-list.md](6-track-list.md).

## Sidebar anatomy

A new account row sits directly under the header, above the Import tracks
button from #4. It is not part of the header itself — the header's job is the
collapse toggle, and account state changes shape too often to share a row with
it.

```
┌──────────────────────────────┐
│  Cairn                  Show │  header (#2)
├──────────────────────────────┤
│  Sign in with Google         │  account row — signed out
├──────────────────────────────┤
│  [ Import tracks ]           │  #4
│  ...
```

Signed in:

```
┌──────────────────────────────┐
│  Cairn                  Show │
├──────────────────────────────┤
│  jane@gmail.com     Sign out │  account row — signed in
├──────────────────────────────┤
│  [ Import tracks ]           │
```

## Main path

1. `VITE_GOOGLE_CLIENT_ID` is set. The account row renders **Sign in with
   Google**, styled as a plain text-and-icon button in `--text` on `--surface`
   — not Google's branded button asset, which is built for light chrome and
   would fight the dark panel from #2. The row is otherwise identical in
   height to the signed-in row so nothing shifts when state changes.
2. Click starts the Identity Services token client, requesting only the
   `drive.file` scope. The button becomes disabled and reads **Signing in…**
   while Google's popup is open.
3. User completes consent in the popup. The row switches to **Setting up your
   Cairn folder…**, `--text-muted`, no button — this is a background step, not
   a place for the user to intervene.
4. The app lists Drive for a folder named `Cairn` at the root; if none exists,
   it creates one. Either way it now holds the folder's file ID for the
   session.
5. Row settles to the signed-in state: the account email, 14px `--text`, left;
   **Sign out**, `--text-muted`, right, underline on hover. No separate
   indicator that the folder is ready — reaching this state *is* that
   indicator, the same way a track appearing on the map is its own
   confirmation in #4.
6. The rest of the app is unaffected. Import, the track list, and the map work
   exactly as before sign-in — this issue does not move anything onto Drive.

## States

**No client ID.** `VITE_GOOGLE_CLIENT_ID` unset or empty string — same
either-is-missing rule as the Maps key in #2. The account row does not render
at all: no space is reserved, no disabled button, nothing to explain. This is
a developer-facing gap on a fresh clone, not a state a real user reaches, and
an empty account row would look like a bug rather than an absence.

**Signed out.** As in Main path step 1. Sits above the Import button on every
load; there is no persisted session (see Edge cases).

**Signing in.** Button disabled, **Signing in…**. If the user closes Google's
popup without completing consent, the row returns silently to **Sign in with
Google** — same treatment as a cancelled file picker in #4, no error.

**Setting up folder.** As in Main path step 3. This is expected to be fast
(one Drive API call, occasionally two) but not instant; the copy says what's
happening rather than showing a bare spinner, because "Signing in…" and
"Setting up…" are different waits and collapsing them into one spinner would
hide which one is slow if either ever is.

**Signed in.** As in Main path step 5.

**Sign-in failed.** Google's popup reports an error (not a user cancel — a
real failure, e.g. the OAuth client is misconfigured). Row returns to **Sign
in with Google**, with a second line beneath it, 12px `--danger`:

> Couldn't sign in — try again

**Popup blocked.** Distinguished from a generic failure because the fix is
different. Same row layout, danger line reads:

> Sign-in popup was blocked — allow popups for this site and try again

**Folder setup failed.** Authentication succeeded — the user has a token —
but the list-or-create call failed (network error, API not enabled, etc.).
The user stays signed in rather than being bounced back to signed-out, because
they did successfully authenticate and re-running the whole popup flow to
retry one Drive call is a worse experience than retrying the call. Row shows
the account email (left, as signed-in) and, in place of Sign out on the right:

> Retry

with a danger line beneath the row:

> Couldn't set up the Cairn folder — try again

Clicking **Retry** repeats folder lookup/creation only, not the auth flow.
Sign-out remains reachable — long-press is out of scope for v1, so it moves to
a small `×` beside Retry rather than being dropped:

```
  jane@gmail.com          Retry  ×
  Couldn't set up the Cairn folder — try again
```

**Token expired.** A later Drive call (folder retry, or work from a future
issue) fails with an auth error mid-session. The signed-in row's right side
swaps **Sign out** for **Reconnect**, and a line appears beneath:

> Your Drive session expired — reconnect to keep using Drive

Clicking **Reconnect** re-runs the token request (Main path step 2 onward).
This is the "unremarkable" re-auth the seven-day Testing-mode limit demands —
it reuses the existing row rather than a modal or a toast, because losing
Drive access mid-session is expected behaviour here, not exceptional.

## Edge cases

- **Reload while signed in.** The token is held in memory only; nothing is
  written to `localStorage` for this issue. A reload always returns to
  signed-out, and the user signs in again. Persisting the session is
  deliberately deferred — it would mean deciding how to store a live access
  token safely, which is a real question and not one this issue needs to
  answer to satisfy "signed out, the app keeps working."
- **A `/Cairn/` folder already exists from a previous session or account
  switch.** Reused, never duplicated. If more than one somehow exists (created
  by hand outside the app), the oldest by `createdTime` is used and the rest
  are left alone — picking one deterministically matters more than which one.
- **Rapid repeated clicks on Sign in.** Button is disabled for the whole flow
  (steps 2–4), so a second click during that window is a no-op.
- **Switching Google accounts.** Sign out, then sign in as a different
  account: folder lookup runs fresh for that account, since Drive is
  account-scoped. No special-casing needed.
- **Sign out.** Clears the in-memory token and folder ID immediately, no
  confirmation dialog. Tracks currently loaded in the session are untouched —
  they were never Drive-backed to begin with (see Out of Scope on the issue).
- **Folder deleted from Drive after this app created it.** Not detected here.
  The first write that finds it missing is a future issue's problem — this
  issue only has to get sign-in and initial folder setup right, not police the
  folder's continued existence.

## Copy

| Situation | Copy |
|---|---|
| Signed out | `Sign in with Google` |
| Signing in | `Signing in…` |
| Folder setup | `Setting up your Cairn folder…` |
| Signed in | `<email>` · `Sign out` |
| Sign-in error | `Couldn't sign in — try again` |
| Popup blocked | `Sign-in popup was blocked — allow popups for this site and try again` |
| Folder setup failed | `Couldn't set up the Cairn folder — try again` (row: `<email>` · `Retry` · `×`) |
| Token expired | `Your Drive session expired — reconnect to keep using Drive` (row: `<email>` · `Reconnect`) |

## Not decided here

Persisting sign-in across a reload, and what silent refresh would look like if
the app ever moves off Testing mode — both depend on decisions a future issue
should make deliberately, not inherit from this one by accident.

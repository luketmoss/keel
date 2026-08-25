# 327 — returned home by an expiry

A session that ends on its own should say so, move the user somewhere that still
works, and put them back when they return.

Standing documents: [design-language.md](design-language.md) (the toast's
elevation, tokens and motion), [shell-and-content-model.md](shell-and-content-model.md)
(the shell, its routes and the sheet), [cairns.md](cairns.md) (what a cairn
route opens). Prior notes:
[32-google-sign-in.md](32-google-sign-in.md) (the account states and their
copy), [72-drive-session-lifecycle.md](72-drive-session-lifecycle.md) (the
`token-expired` transition this note reacts to),
[73-disconnected-read-only.md](73-disconnected-read-only.md) (**unchanged** —
cached trips stay readable), [304-the-home-view.md](304-the-home-view.md) (what
`/` is), [81-drop-to-draft.md](81-drop-to-draft.md) (the toast surface).

## Why

> *"When a user is logged out, it shouldn't continue to show whatever page they
> were on. It should take them back to the home page, with maybe a message that
> they need to log back in. When logging back in, it should resume where they
> were."*

#72 made the expiry *reachable*; it did not make it *legible*. The only signal
today is inside the account bubble, which is a popover — the expiry message and
the `Reconnect` button are both behind a click the user has no reason to make.
So the app sits on an open trip, quietly disconnected, until an edit fails.

## The main path

1. The user is on `/trips/:id`, `/tracks/:id` or `/cairns/:id`. A Drive call
   fails with an auth error and the account moves to `token-expired`.
2. The route the user was on is remembered.
3. The app navigates to `/`. The detail face closes; the shell returns to its
   list face, at whatever detent the sheet was already at on a phone. **The
   camera is not touched** — no home-view fit, no reveal. The user was looking
   at somewhere real and the logout is not a reason to take that away.
4. A message appears over the map: **`Your Drive session ended — sign in again
   to pick up where you left off.`** It carries a **`Sign in`** action and it
   does **not** auto-dismiss.
5. `Sign in` runs the same reconnect the account bubble's button runs. On
   success, the message goes and the app navigates back to the remembered route.
6. The detail face opens on the item the user left, populated from Drive as it
   would be after any sign-in.

## The message

Reusing the toast from #81 rather than inventing a banner: it is already the
app's L2 lifted chrome over the map, already `role="alert"`, and already stacks.
Two things about this one differ from a rejected-file toast, and both follow
from it announcing a state rather than an event:

| Property | Rejected file (#81) | This message |
|---|---|---|
| Dismissal | Auto, after 6s | **Never automatically.** Cleared by reconnecting, or by the `×` |
| Colour | `--danger` | `--text` — an expected expiry is not a failure |
| Action | None | `Sign in`, `--accent`, `--text-sm` |

An auto-dismissing message for something that just moved the user is the same
mistake as hiding it in the bubble: it would be gone by the time they looked up
from the map.

**Only one exists at a time.** A second auth failure while the message is up
changes nothing on screen.

## States

| State | What is shown |
|---|---|
| Expired, on a detail route | Home; the message with its `Sign in` action |
| Expired, already on `/` | The message. No navigation — there is nowhere to go |
| Expired, message dismissed | Nothing over the map. The account bubble still reads `token-expired`, per #32, and is the way back |
| Reconnecting | The action is disabled and reads **`Signing in…`**, matching #32's in-flight treatment. The message text stays |
| Reconnect dismissed by the user | Back to the message with a live `Sign in`. A cancel is not an error, per #32 |
| Reconnect failed | The message is replaced by #32's own `Couldn't sign in — try again`, in `--danger`, keeping the `Sign in` action. The remembered route survives |
| Reconnected | Message gone; the remembered route restored |
| Signed out deliberately | **Nothing happens.** No navigation, no message |

## Edge cases

- **The user navigates somewhere themselves after being returned home.** The
  remembered route is discarded at that moment. Reconnecting later leaves them
  where they are. The app gets one chance to put them back, and it loses it as
  soon as the user makes a choice of their own.
- **The user dismisses the message.** The route is still remembered — dismissing
  a message is not a navigation. Reconnecting through the account bubble still
  restores it.
- **The remembered item no longer exists on reconnect** (deleted from Drive
  elsewhere). The app navigates to it and the route's existing not-found
  treatment handles it, unchanged. Guessing a different destination would be
  worse than showing the honest one.
- **The user navigates back into the trip they were bounced out of.** It opens,
  read-only, exactly as #73 specifies. The redirect announces the logout; it
  does not gate the cache.
- **A session that had already lapsed before the app loaded.** Signed-out on `/`
  with no message, unchanged from #72. Nothing was interrupted, so nothing is
  announced.
- **The expiry lands while a decision owns the map** — an import draft, the
  placement queue, the create gesture. The navigation still happens and the
  decision is abandoned with it; a draft that cannot be saved is not worth
  keeping the user on the page for.
- **A phone.** The message sits above the sheet, offset by `--sheet-current`, and
  moves with it. A message hidden behind the sheet is not a message. Everything
  else is identical — the detents and the sheet's own state are untouched by the
  navigation.
- **A late auth failure from a call that started before a successful reconnect.**
  Ignored, per #72's own rule: expiry is only accepted for the token currently
  held. No navigation and no message.
- **The window is reloaded while the message is up.** The message and the
  remembered route are both gone. The route lives in memory for the life of the
  page, alongside the session it belongs to; persisting it would mean deciding
  what a stale route means days later, which is not worth the two clicks it
  saves.

## Copy

| Where | String |
|---|---|
| Message | `Your Drive session ended — sign in again to pick up where you left off.` |
| Message action | `Sign in` |
| Message action, in flight | `Signing in…` |
| Message, after a failed reconnect | `Couldn't sign in — try again` (#32, unchanged) |
| Message dismiss control | `Dismiss` as its `aria-label`, `×` as its glyph (#81, unchanged) |
| Account bubble, expired | `Your Drive session expired — reconnect to keep using Drive` (#32, unchanged) |

"Ended" rather than "expired" in the message, and "sign in" rather than
"reconnect": the bubble is describing a *connection* the user can repair, and
this is describing a *session* that stopped and a place they were taken from.
Two surfaces about the same fact should not read as one instruction repeated.

## New tokens

None.

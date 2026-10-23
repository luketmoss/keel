# 609 — Hive's sign-in screen remembers who you were

When Hive's Google token runs out, Hive currently forgets the user and shows a bare "Sign in with Google" screen. With this change it remembers the user and offers "Continue as <email>": one tap, no account chooser. Renewal while signed in becomes invisible. It happens on the next tap, never on a timer or a page load. Thrive has worked this way since luketmoss/thrive#353. Thrive's `login-screen.tsx` is the reference, and the decisions that differ from it are marked **Differs from Thrive**.

This note answers to the Keel-wide rules ([`keel-wide-rules.md`](../../../ui/docs/design/keel-wide-rules.md)) and the suite language ([`suite-language.md`](../../../ui/docs/design/suite-language.md)), both standing documents. Hive has no standing documents of its own. Tokens come from `ui/tokens/suite.css` through Hive's `global.css`.

## What changes for the person

| Today | After |
|---|---|
| Open Hive with an expired token: "Signing in..." spinner for up to 5 s, then usually the bare Sign in screen (the silent popup was blocked) | Opens straight on "Continue as <email>". One tap. |
| Token renewed by a timer 5 min before expiry; often blocked, so it fails | Renewed by the first tap within 10 min of expiry, or the first tap after returning to the app. Nothing visible happens. |
| A failed renewal or 401: toast "Session expired — please sign in again", then the bare Sign in screen | The Continue screen. No toast. |
| Sign-in failure (luketmoss/hive#289): toast "Couldn't finish signing in — please try again" | The same failure line as the Continue screen, inside the card. No toast. |

## States

All states use the existing `.login-screen` and `.login-card`, with `HiveLogo` at 64 and the `h1` "Hive". Only what is below the title changes.

### 1. Plain: nobody remembered

Shown on first visit, after Sign out, and when no `hive_user` or `hive_prior_user` exists.

- Tagline `p`: **Plan. Track. Do.** (unchanged)
- Primary `.login-btn`: **Sign in with Google**, which calls `login()` and opens the account chooser
- The status line (below) is present but empty

### 2. Plain, failed

After a fresh sign-in whose popup was closed, failed to open, or whose userinfo call failed or had no email.

- Same as 1, with the status line reading **Could not sign you in. Try again, or use a different account.**
- The button stays enabled; a tap retries.
- **Differs from Thrive:** Thrive's plain screen gains this line in #608. Hive moves it here from a toast, so the message stays next to the button that fixes it rather than vanishing after a few seconds.

### 3. Continue: someone remembered

Shown when the token is missing or expired and a user is remembered.

- Tagline `p`: **Welcome back, <name>.** If the remembered user has no name: **Welcome back.** The name is the stored `hive_user.name`, so a name edited in Hive shows here.
- Primary `.login-btn`: **Continue as <email>**, which calls `continueAs()`: renew with the account hint and no chooser.
- Status line, empty.
- Secondary `.login-link`: **Use a different account**, which calls `login()` and opens the chooser.
- **Focus** goes to Continue when this state mounts. It is the screen's one action.

### 4. Continue, busy

From the Continue tap until GIS answers.

- Continue is `disabled` with `aria-busy="true"`, and its label is unchanged. Hive's existing disabled style applies. There is no spinner: the GIS popup is the feedback.
- "Use a different account" stays enabled. Choosing it abandons the Continue attempt.

### 5. Continue, failed

Popup closed or blocked, a GIS error, offline, or userinfo failed on a Continue.

- Same as 3, with the status line reading **Could not sign you in. Try again, or use a different account.**
- Continue is enabled again; a tap retries. Focus stays where it was (the person just tapped Continue).

### 6. Not ready

The GIS script has not loaded yet: page just opened, slow network.

- Continue and "Use a different account" are `disabled`. Plain "Sign in with Google" keeps Hive's current behaviour (enabled; a tap before GIS is ready does nothing). That matches Thrive.
- Once GIS is ready the buttons enable without a re-render of the card. Nothing else changes.

### 7. Signed in

The board, as today. Renewal is invisible: no toast, no banner, no spinner. If a quiet renewal fails, nothing is shown. The old token keeps working until it expires, and the next 401 or foreground return deals with it (it ends on state 3).

## The status line

- A `<p class="login-error" role="status" aria-live="polite">`, always in the DOM, so screen readers hear a failure and the layout does not jump.
- Empty in every state except 2 and 5.
- **Never colour alone** (suite language, Status): the line is a full sentence that says what happened and what to do. It needs no icon, because it is text, not a chip.

## Transitions

- **Expired token on load:** the Continue screen renders on the first frame. There is no "Signing in..." screen any more, and `.loading-screen` for auth goes.
- **A 401 whose reauth fails:** the board unmounts, then the Continue screen (state 3, empty status line). Unsaved work behaves as it does for any 401 today. Hive's optimistic writes and their rollback are unchanged by this issue.
- **Continue succeeds:** the board renders with the user known from the first frame (luketmoss/hive#287), so an owner's Board Settings is present at once.
- **Sign out:** clears the token, `hive_user` and `hive_prior_user`, then shows state 1. Sign out deliberately forgets the user, because on a shared device it is how the other person gets the plain screen.
- **Use a different account and pick someone else:** that person becomes the remembered user from then on.

## Edge cases

- **Long email:** Continue wraps onto two lines inside the button, with `overflow-wrap: anywhere` on `.login-btn`. The button grows taller; it does not truncate. The email is the one thing the person needs to read here.
- **Rapid taps on Continue:** after the first tap, the button is disabled until GIS answers (state 4), so only one popup opens.
- **Two Hive users on one device:** the screen shows whoever signed in last. The other person taps "Use a different account". No account switcher is added.
- **Thrive open in another tab:** it has no effect. Hive's keys are `hive_*` and Thrive's are `gw_*`.
- **`hive_prior_user` left by the old code:** read once as the remembered user if `hive_user` is absent, then removed.
- **Demo (`?demo`):** none of these states appear; demo never shows the login screen.

## Copy

| Where | String |
|---|---|
| Plain tagline | Plan. Track. Do. |
| Plain button | Sign in with Google |
| Continue tagline | Welcome back, {name}. / Welcome back. |
| Continue button | Continue as {email} |
| Secondary | Use a different account |
| Failure line | Could not sign you in. Try again, or use a different account. |

The failure string is the one `@keel/auth` reports in `renewError`, which Thrive already shows. Both apps say the same thing.

Removed: the toast strings "Session expired — please sign in again" and "Couldn't finish signing in — please try again", and the screen text "Signing in...".

## Styles

Hive's `.login-card p` sets `margin-bottom: 32px` for the tagline. The two new elements override it.

```css
.login-card p.login-error {
  min-height: 1.5em;               /* holds the line's space when empty */
  margin: var(--space-sm) 0;
  font-size: var(--text-sm);
  color: var(--color-danger-text);
}

.login-link {
  min-height: var(--touch-target);
  padding: 0 var(--space-md);
  background: none;
  border: none;
  color: var(--color-text-secondary);
  font-size: var(--text-sm);
  text-decoration: underline;
  cursor: pointer;
}
```

- `.login-link` joins Hive's existing hover, active and `:focus-visible` rule lists, as `.login-btn` does, and uses `--focus-ring`.
- `.login-btn` gains `overflow-wrap: anywhere`.
- **Differs from Thrive:** Thrive writes `min-height: 44px` for `.login-link`. Hive uses `--touch-target`, which is what its other controls use (#453).

No new tokens.

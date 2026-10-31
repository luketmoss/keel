# 704 — Forage app shell

Specifies [#704](https://github.com/luketmoss/keel/issues/704). Tokens, spacing and the tab bar come from
[`suite-language.md`](../../../ui/docs/design/suite-language.md); Forage's accent values from the registry in
[`keel-wide-rules.md`](../../../ui/docs/design/keel-wide-rules.md); the artwork from
[`702-forage-identity.md`](702-forage-identity.md). Nothing here restates them. Layout reference is the
approved prototype (https://claude.ai/artifact/JYyHpvdbgohjmzZZsN7jY1), which fixes the tab order and the
bar's look. There are no standing documents in `forage/docs/design/` yet.

## Main path

1. Open the app. While the session is restoring, show the Forage mark centred on `--color-bg` and nothing else.
2. Signed out: the sign-in screen. Signed in: the shell on the tab in the URL hash, else Plan.
3. Tap a tab: the hash becomes `#/plan`, `#/shop`, `#/eaten` or `#/library`; the tab becomes current and the
   body swaps. Back and reload return to the same tab. Unknown hash: Plan, hash rewritten.
4. Until a settings issue exists, the
   header on every tab carries a small account button (initial of the user, 44px target) that opens a menu with
   the email and "Sign out". Sign out returns to the sign-in screen.

## Sign-in screen

Mirrors Hive's: a centred card on `--color-surface` (`--radius-lg`, padding `--space-lg`), the mark at 64 wide,
"Forage" in `--text-2xl`, the line "Plan meals. Shop once. Log what you eat." in `--color-text-secondary`, and one
primary button.

| State | Shows |
|---|---|
| Fresh | Button "Sign in with Google" |
| Remembered user | "Welcome back, <name>." Primary button "Continue as <email>" (focused); link "Use a different account" |
| Renewing | Continue button disabled, `aria-busy` |
| Error | `role="status"` line under the button in `--color-danger-text`: the session's `renewError`, e.g. "Couldn't sign you in. Try again." The line is always in the DOM so the card doesn't jump |
| Google script not ready | Buttons disabled |

## Shell

- Header per tab: the tab's name in `--text-xl`, left; the account button right. Padding `--space-md`.
- Content scrolls; bottom padding is `--nav-height` plus the safe-area inset so the last row clears the bar.
- Tab bar: four equal buttons, each a 24px icon above a `--text-xs` label, height `--nav-height` (≥ 44px).
  Current: `--color-primary`, `aria-current="page"`. Others: `--color-text-secondary`. Bar background
  `--color-surface`, top border `--color-border-light`. `<nav aria-label="Forage">`. On wide screens the bar and
  content centre in a column no wider than the prototype's.
- Icons are the prototype's calendar (Plan), cart (Shop), check-list (Eaten) and book (Library), redrawn
  at 24px in `currentColor`, kept in one `nav-icons.tsx` as in Hive.

## States

A tab has only an empty state in this issue. There is no loading, error or offline state yet: nothing is fetched.
Each feature issue adds its own and must keep the empty state for a signed-in user with no data.

## Empty-state copy

Each is an icon (`currentColor`, `--color-text-muted`), a heading in `--text-lg`, and one sentence in
`--color-text-secondary`. No button, because no add flow exists yet; the sentence says what will appear and
where it comes from, and later issues replace it with the real control.

| Tab | Heading | Sentence |
|---|---|---|
| Plan | Nothing planned yet | Meals you plan for the week will show here, by day. Add one from a recipe. |
| Shop | No shopping list | When you plan meals, the groceries you need will collect here, grouped by store. |
| Eaten | Nothing logged | What you eat will show here by day, with its calories and macros. |
| Library | No foods yet | Foods you use in recipes and logs will be kept here, with their nutrition. |

## Demo mode

Gate: `VITE_DEMO_MODE === 'true'` at build and `?demo=true` at runtime, cached once per load. A banner under the
header says "Demo — sample data, nothing is saved" in `--color-warning-light` with `--color-warning` text and an
"Exit demo" button (drops the query). Signed in as "Demo User", `demo@forage.local`. The tab hash and the
`demo` query coexist: switching tabs keeps `?demo=true`. A build without the env var treats `?demo=true` as
absent and shows the sign-in screen.

## Edge cases

- Hash changes by hand or via back: the tab follows it; no history entry added when rewriting an unknown hash.
- Tapping the current tab: nothing happens, scroll resets to top.
- Rapid taps: last tap wins; no animation to queue.
- No `localStorage` (private mode): sign-in works for the session and says nothing.
- 375px: four tabs at ~94px each; the longest label, "Library", fits at `--text-xs`.
- 200% text zoom: labels may wrap to two lines inside the bar's height; icons stay.

## Measurements

Nothing here is measured yet: there is no running Forage app to measure (it is created by #701 and this issue).
The 375px, 44px and clearance criteria are verified at `/test` by `getBoundingClientRect()`, per stack-web.

## New tokens

None. If `/develop` needs a token the suite file lacks, it is named here when added.

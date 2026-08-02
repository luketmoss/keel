# 48 — Fill in missing interaction states and larger touch targets

States and sizes are [design-language.md](design-language.md)'s Interaction
states table, applied exactly. This note is the per-component mapping the
table doesn't spell out on its own, plus the two genuine judgment calls the
issue body raised without resolving.

## Main path

No new main path — every control listed still does exactly what it does
today. What changes is what it looks like while being interacted with, and how
large a target it presents.

## States, per component

Six states — rest, hover, pressed, focus, selected, disabled — mapped onto
each control family named in the issue:

| Control | Rest | Hover | Pressed | Focus | Selected | Disabled |
|---|---|---|---|---|---|---|
| Track eye / remove, trip remove, back, collapse | `--muted` icon | `--text` icon, `--hover` fill | `--pressed` fill | 2px accent outline | — | n/a |
| Trip-create submit | `--accent` fill | `filter: brightness(1.1)` | `--pressed`-toned fill | 2px accent outline | — | `opacity: .4`, no hover/pressed |
| Confirm-delete / confirm-cancel | text only | `--danger`/`--text` | `--pressed` fill behind text | 2px accent outline | — | n/a |
| World-map filter segment | `--muted` text | `--text`, no fill | `--pressed` fill, segment being pressed only | 2px accent outline, inset | `--surface-solid` fill + `--text`, independent of pointer | n/a |
| Status pill toggle | per status colour | `--hover` fill | `--pressed` fill | 2px accent outline | n/a (it's the control, not a member of a set) | `opacity: .4` while saving |
| Show-more, dismiss, retryable-failure links | `--muted`/`--danger` text | `--text` or brighter `--danger`, underline | no separate pressed — text controls don't need one | 2px accent outline | — | n/a |

## Two judgment calls

**Trip-create submit disables on empty name, not just on invalid.** The issue
proposal says "disabled when the name is empty, not only when the request is
in flight" — the existing `trip-create__input--invalid` class already fires
on empty/whitespace submission attempts, but as a post-hoc error state, not a
pre-emptive disable. Alpenglow's bias toward generous, forgiving controls
argues for disabling rather than letting the click happen and immediately
erroring: a disabled button answers "why can't I do this" before the user
asks, an error message answers it after. Whitespace-only counts as empty for
this purpose — `"   "` is not a trip name.

**Filter segment's pressed and selected must read as visibly different
things**, because they can co-occur (pressing the already-selected segment).
Selected is `--surface-solid` fill regardless of pointer state — it is a fact
about which filter is active. Pressed adds `--pressed` on top of whatever the
segment's selected state already is, so pressing the active segment darkens
it slightly rather than doing nothing visually.

## Edge cases

- **Disabled trip-create submit + Enter key** — the form's `onSubmit` already
  guards on the same condition the disabled state now expresses; disabling the
  button doesn't need a second, separate keyboard guard, since submitting a
  disabled button's form via Enter still fires the handler in every browser
  that matters here, and the handler's existing validation already rejects it.
- **Status pill double-click during save** — this is the entire reason it
  gets a disabled state: today a second click before the first save resolves
  can race it. Disabled removes the race rather than debouncing it.
- **Touch target growing past its visual container** — for the 24px icon
  buttons that sit inside a row with little horizontal room (`TrackList`'s
  eye/remove pair), the 40px target expands via padding and a transparent hit
  area, not by enlarging the row itself; two 40px targets side by side still
  fit inside the existing row height because they overlap the row's own
  vertical padding rather than adding to it.

## Not decided here

Whether any *other* control not named in the issue also needs these states is
explicitly out of scope, per the issue body — this note doesn't expand the
list.

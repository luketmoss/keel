# 78 — Full-screen map shell: top bar and account bubble

Supersedes the sidebar layout from [2-map-shell.md](2-map-shell.md) and the nav
row from [30-route-shell.md](30-route-shell.md). Tokens and elevation from
[design-language.md](design-language.md), which is standing and outranks this
note. This is the first half of that document's Navigation target — *"the map is
never unmounted"* — the second half being the trips panel (#80).

## Layout

```
┌──────────────────────────────────────────────────────────────┐
│  ┌─────────────────────────┐                          ┌───┐  │
│  │ Cairn   World   Trips   │                          │ ◯ │  │
│  └─────────────────────────┘                          └───┘  │
│                                                              │
│                      the map, full bleed                     │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

Two separate L2 panels, not one bar spanning the width. A single full-width bar
would put a translucent band across the top of the map for no reason — the
middle carries nothing. Each panel is `--surface` at `--radius-md`,
`backdrop-filter: blur(--blur)`, `--shadow-lifted`, no border (L2 touches no
edge). Both inset `--space-4` from the top and their respective sides.

The map region is the whole viewport. Nothing reserves layout space from it;
both panels are absolutely positioned above it, same as the existing filter row.

### Nav panel

Wordmark then links, in one row, `--space-2` gap, `--space-2` padding.

- **Wordmark** — `Cairn`, `--text-lg` (700). Not a link; it is the brand, and
  `World` beside it already goes home. Spending the accent on it is forbidden by
  the language's one-accent rule.
- **Links** — `--text-sm`, `--radius-sm`, padding `--space-2` `--space-3`, hit
  target at least `--hit-target` in both dimensions.

| State | Treatment |
|---|---|
| Rest, inactive | `--text-muted` |
| Rest, active | `--text`, `--accent-soft` fill |
| Hover | `--hover` fill, `--text` |
| Pressed | `--pressed` fill |
| Focus | global 2px `--accent` outline at 2px offset |

Active uses a fill rather than #30's 2px underline: the underline was legible
against the sidebar's flat `--surface`, and over satellite imagery a 2px rule
disappears. The fill is also what the language already specifies for Selected.

`World` matches `/` exactly (`end`); `Trips` matches `/trips` and anything
under it, so a trip's detail view keeps `Trips` lit rather than lighting nothing.

## Account bubble

Top right, its own L2 panel, `--radius-full`, padding `--space-1`.

**Signed in** — the Google account's picture at `--avatar-size`, `--radius-full`.
**Signed out** — a text button reading `Sign in`, `--text-sm`, padding
`--space-2` `--space-3`.
**No client id configured** — nothing renders at all, and the map is unaffected.
Same either-is-missing rule `env.ts` already applies.

### Popover

Opens below the bubble, right-aligned to it, `--space-2` gap. L2, `--radius-md`,
`--surface`, min-width `220px`, padding `--space-4`. Opens over
`--motion-fast`, fading and rising `4px`; collapses to a cut under
`prefers-reduced-motion`.

```
┌──────────────────────┐
│  ◯  Luke Moss        │
│     luke@example.com │
│  ──────────────────  │
│  Sign out            │
└──────────────────────┘
```

Name `--text-base`, email `--text-xs` `--text-muted` truncated with an ellipsis
at the panel's width — a long address wraps to three lines and turns a menu into
a paragraph. Divider is 1px `--border`. `Sign out` is a full-width row,
`--text-sm`, `--hover` on hover, at least `--row-touch` tall.

Sign out is **not** destructive styling. It takes nothing away that cannot be
had back by signing in again, and `--danger` is reserved for what Drive cannot
return.

**Dismissal** — Escape, a click outside, or choosing Sign out. Focus returns to
the bubble on close. Focus is trapped inside while open, and the bubble carries
`aria-expanded`.

## Back navigation

The trip detail view's back control returns to wherever the trip was opened
from. Implemented as history back when the previous entry is in-app; a trip
opened by typed URL or a fresh tab has no such entry and goes to `/`.

| Opened from | Back goes to |
|---|---|
| A dot on the world map | `/`, camera unchanged |
| A row in the trips panel | `/trips`, filters and scroll intact |
| A typed URL or reload | `/` |

The control's label becomes `Back`, with `aria-label="Back"`, replacing
today's `Back to trips`. The destination is conditional now, so naming it in the
label would be wrong in two of the three cases above.

## States

**Map unavailable** — no Maps key, or a rejected key. `MapUnavailable` fills the
viewport as it does today. **The top bar and account bubble still render**, over
`--ground` rather than tiles: losing the map must not cost the user navigation
or the ability to sign in.

**Signed out** — as above; every route still renders, trips read from the local
cache.

**Avatar image fails to load** — falls back to a `--surface-lift` circle holding
the account's first initial in `--text`. A broken-image glyph in the corner of
the map reads as a broken app.

**Narrow viewport** (`< 640px`) — the nav panel stays top-left and the account
bubble top-right; if the wordmark and both links cannot fit beside the bubble,
the wordmark drops and the links remain. Navigation survives; branding does not
need to.

## Copy

| Context | Copy |
|---|---|
| Wordmark | `Cairn` |
| Nav links | `World` · `Trips` |
| Signed-out account control | `Sign in` |
| Popover action | `Sign out` |
| Back control aria-label | `Back` |

## Edge cases

- **Popover open while navigating** — closes on route change; a menu describing
  the account should not outlive the view it was opened over.
- **Sign-in fails or is cancelled** — the bubble returns to `Sign in`; the
  existing failure copy is unchanged by this issue.
- **Token expires while the popover is open** — the popover reflects the signed
  out state on its next render rather than showing a stale identity.
- **Very long account name** — truncates with an ellipsis on one line; the email
  below is the disambiguator.
- **Keyboard only** — tab reaches wordmark-less nav links, then the bubble.
  Enter or Space opens the popover, arrow keys move within it, Escape closes.
- **Two rapid clicks on the bubble** — toggles open then closed, no flicker; the
  second click is a dismissal, not a re-open.

## New tokens

| Token | Value | For |
|---|---|---|
| `--avatar-size` | `32px` | the account bubble's picture |

`32px` rather than the `--marker-size` 28px it sits near: the avatar is chrome
at the screen's edge, not a marker in the map's coordinate space, and at 28px a
face is not recognisable. The surrounding `--space-1` padding brings the bubble
itself to 40px, satisfying `--hit-target` without a separate rule.

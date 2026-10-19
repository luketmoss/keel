# 447 — Hive's light-mode primary passes AA, keeping the gold hue

Hive's light-mode interactive gold, `#C49200`, is 2.82:1 on white. That fails
AA for the text and borders it draws, and it fails even the 3:1 a focus ring
needs. This note darkens that one tone, along the same hue, until every place
it is drawn passes. Nothing else about Hive's colour changes.

Standing documents this answers to: the Keel-wide rules
([`keel-wide-rules.md`](../../../ui/docs/design/keel-wide-rules.md)) — one
colour per app, and contrast meets AA with focus rings at 3:1 — and the suite
language ([`suite-language.md`](../../../ui/docs/design/suite-language.md)),
whose Accent section splits the brand (`--color-accent`) from everything
interactive (`--color-primary`). Only the second moves. The user has ruled out
any colour change other than this tone fix, and that bounds the note.

## How this was measured

From source: the tokens in Hive's `global.css` (`:root`, `[data-theme="dark"]`),
every rule that reads the primary family listed by selector and property (65
reads of `--color-primary`), and contrast by the WCAG relative-luminance
formula over hex values. Translucent tints were composited onto the surface
under them before measuring. No running app. The candidate tones were stepped
along Hive's own hue (HSL hue 44.7°, saturation 100%) in half-point lightness
steps, and the lightest one whose worst case reaches 4.5 was taken.

## The decision

| Token (light) | Today | Becomes |
|---|---|---|
| `--color-primary` | `#C49200` | `#805F00` |
| `--color-primary-hover` | `#A67B00` | `#6B5000` |
| `--color-primary-rgb` | `196, 146, 0` | `128, 95, 0` |
| `--color-focus` | `#C49200` | `#805F00` |
| `--color-primary-light` | derived (8% of primary) | follows `--color-primary` |
| `--color-accent` | `#F5B700` | unchanged: the logo, and nothing interactive |
| every dark value | | unchanged |

Hue is 44.5° against 44.7° today (and 44.8° for the logo's `#F5B700`): the
same gold, darker. `#805F00` is a deep, brownish gold; that is what 4.5:1 on a
cream tint costs, and it is the lightest tone along that hue that gets there.

**One tone for text, borders, rings and fills, not two.** Thrive splits a
brighter fill from a darker text step (`--color-primary-text`). Hive could, and
keep brighter gold buttons, but the bright fill takes dark text and its hover
(`#A67B00`) already misses 4.5 with it (4.28 today), so the split would need a
new hover treatment as well as a new token, and the issue asks for the family
to darken. One tone, then, with white text on every light-mode fill.

### The worst case sets the tone

Primary is drawn as text, as a border or ring, and as a fill. As text it is
tested on every surface it sits on in the stylesheet, including the translucent
tints of itself:

| Surface it is drawn on (light) | Today `#C49200` | `#805F00` |
|---|---|---|
| `--color-surface` white (panels, menus, the control bar) | 2.82 | 5.91 |
| `--color-bg` (the page) | 2.51 | 5.27 |
| 8% tint on the control bar (`.control-bar-chip`) | – | 5.29 |
| 8% tint on the page | – | 4.74 |
| 10% tint (`.subtask-date-inline`) | – | 5.14 |
| 12% tint (`.quick-date-chip-active`) | – | 4.99 |
| **18% tint, the hover of both** | – | **4.57** |
| the eight column pastels (`.column-sort-active`, `.column-archive-link:hover`) | 2.32 at lowest | 4.88 – 5.56 (purple 4.88) |
| the four Upcoming bucket pastels | – | 4.88 – 5.56 |

The tightest pair is the 18% hover tint, **4.57:1**. The next half-point
lighter, `#826100`, is 4.46 there and fails.

As a border or ring it needs 3:1 on the surface beside it, and clears that on
every row above (the lowest is 4.74 on the 8% tint over the page), on
`--color-border` `#dadce0` (4.30) and on the suite's hairline `--color-border-light`
(4.90).

As a fill, its text is white: **5.91:1** on `#805F00`, **7.57:1** on the hover
`#6B5000`. The hover is 1.28:1 against the rest tone, which is enough to read as
darker.

### Dark does not move

`#F5B700` as text, ring and fill boundary is 9.63 on the dark card, 8.48 on the
raised surface, and 7.21 at its lowest, on the dark `--color-bucket-this-week`.
Nothing in dark changes, and a test says so.

## Where the tone is read

Everything that reads `--color-primary`, `-hover`, `-rgb`, `-light` or
`--color-focus` follows the tokens, so nothing in the 65 reads needs touching
except these three:

1. **`.column-sort-active`'s dropdown arrow is a literal.** Its `background-image`
   is an inline SVG with `fill='%23C49200'`. It becomes `%23805F00`. The dark
   twin (`%23F5B700`) stays.
2. **`.btn-primary` and `.login-btn` carry dark text (`#1f1f1f`) on the fill.**
   On `#805F00` that is 2.79:1. Their text becomes a new token,
   `--color-on-primary`, `#ffffff` in light. In dark it is `#1f1f1f`, which is
   what they carry today, so dark does not change. (The suite's
   `--color-on-fill` would also do in light, but its dark value is `#121212`,
   and it would nudge dark by a shade for no reason.)
3. **The tints** (`rgba(var(--color-primary-rgb), 0.1)` and the 8% / 12% / 18%
   family) follow the new `-rgb`. They get a little duller and browner, and are
   already counted in the table above.

The five fills that already carry `white` (`.fab`, `.user-avatar-placeholder`,
`.filter-badge`, `.view-toggle-active`, `.filter-chip-due.filter-chip-active`) go
from 2.82 to **5.91** with no edit.

## What a person sees

Light only. Gold text, borders and rings (the selected view tab, active
filters and chips, the sort control, focus outlines) are a deep bronze gold
where they were mustard. Filled buttons, the add button, the user avatar and
the filter badge are the same bronze with white text; Create, Save and Sign in
swap their near-black text for white. The logo, the app icon and every dark
surface are untouched.

## Known and not done here

**Dark mode has white text on gold fills.** `.fab`, `.user-avatar-placeholder`,
`.filter-badge`, `.view-toggle-active` and `.filter-chip-due.filter-chip-active`
draw `white` on `#F5B700` in dark: **1.80:1**, and 1.41 on the hover. This is
not in this issue and is a visible dark-mode change, so it is recorded rather
than fixed here. The user has since decided it is fixed in #452 (the interaction
states), as one line each: `color: var(--color-on-primary)`, which is `#1f1f1f` in
dark and is 9.15 on the fill.

## Tests

- `design-tokens.test.ts` asserts the old values in three places and changes
  with them, deliberately: AC1 of #190 (light tokens), AC4 (`.btn-primary` uses
  `#1f1f1f`, which becomes `var(--color-on-primary)`), and AC5 (the arrow fill).
  Each is edited to the new value, none is deleted or loosened.
- A contrast test reads the stylesheet and checks every row of the table above:
  text 4.5, rings and borders 3, white on both fills 4.5, in light; and that
  the dark primary family equals what it is today.

## Registry

`keel-wide-rules.md`'s Hive rows are updated with this note: interactive light
`#805F00`, and the measured row reads 5.91 on white, 5.27 on the page, 4.57 on
the tightest tint, passing as text and as a fill or ring. This note's
tightest-pair table is the evidence; the stylesheet still holds `#C49200` until
this ships.

## States to check by eye

In demo mode, light, at 375px and 1280px: Create (rest, hover, focus), the
add button, the user avatar, the filter badge, the active view tab, an active
filter chip and its hover, the sub-task date chip and its hover, the sort
control in a pastel column, Tab through the control bar (the ring is visible on
white and on the page).

## Copy

None.

## New tokens

| Token | Light | Dark | For |
|---|---|---|---|
| `--color-on-primary` | `#ffffff` | `#1f1f1f` | text and icons on a primary fill (`.btn-primary`, `.login-btn`); 5.91 on `#805F00`, 9.15 on `#F5B700`. The suite language names this role; it is Hive's, since the suite file holds no accent value |

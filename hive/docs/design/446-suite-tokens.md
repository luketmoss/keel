# 446 — Hive consumes the suite token stylesheet

Hive stops defining the tokens the suite already defines, and imports them
from `ui/tokens/suite.css` as Thrive does (#402). Where Hive's values differ,
the suite's win, and this note lists every place that moves, so that the test
which guards the change has an exact list to check against.

Standing documents this answers to: the suite language
([`suite-language.md`](../../../ui/docs/design/suite-language.md)), whose
neutral table is the target, and the Keel-wide rules
([`keel-wide-rules.md`](../../../ui/docs/design/keel-wide-rules.md)). The
precedent is Thrive's #402, which this follows except where Hive's values
differ from the suite, as Thrive's never did. Specified against Hive's code as
it stands in `luketmoss/hive` today; the move into Keel (#439) is
behaviour-identical, so the paths below read `hive/frontend/src/…` afterwards.

## How this was measured

From source, no running app. Hive's `global.css` (4,615 lines) was parsed into
rules; its `:root` and `[data-theme="dark"]` token blocks were compared
declaration by declaration with `ui/tokens/suite.css`; every `var(--…)` use of
a drifted token was listed by selector and property; contrast ratios are the
WCAG relative-luminance formula over the hex values, against each surface the
token is drawn on in the stylesheet. Figures below say which.

## What changes in `global.css`

1. **It imports the suite file first**, by relative path, and the build inlines
   it: `@import '../../../ui/tokens/suite.css';` at the top, as Thrive's does.
   Vite's dev server is allowed to read `ui/tokens` (`server.fs.allow`, as in
   Thrive's `vite.config.ts`). `hive.yml`'s path filter gains `ui/tokens/**`.
2. **It deletes every definition the suite now supplies**: the spacing,
   radius, font, type and transition scales; `--color-bg`, `--color-surface`,
   `--color-surface-raised`, `--color-border`, `--color-border-light`,
   `--color-text`, `--color-text-secondary`, `--color-text-muted`;
   `--color-danger`, `--color-danger-hover`, `--color-success`,
   `--color-warning`; and `--overlay-xs` to `--overlay-4xl`, in both themes.
3. **It keeps what is Hive's own**, and the light half of that moves out of
   `:root` into its own `[data-theme="light"]` block, which is what the suite's
   selectors and the issue ask for:

   | Block | Hive keeps |
   |---|---|
   | `:root` (theme-independent) | `--color-accent`, `--focus-ring`, `--column-width`, `--header-height`, `--control-bar-height` |
   | `[data-theme="light"]` | the primary family (`--color-primary`, `-hover`, `-rgb`, `-light`), `--color-focus`, the column pastels, the Upcoming bucket pastels, `--color-overdue`, the demo banner colours |
   | `[data-theme="dark"]` | the same list, with Hive's existing dark values; and Hive's two dark shadow strengths (`--shadow`, `--shadow-lg`), which the suite file says each app overrides for dark |

   `--color-accent` stays in `:root` because it is identical in both themes.
   The two Hive-only overlays, `--overlay-badge` and `--overlay-view-toggle`,
   are retired: their values are the suite's `--overlay-lg` (0.16 against
   0.15) and `--overlay-xs` (0.04, identical).
4. **Nothing else changes in this issue.** The primary family keeps its present
   values (#447 darkens the light tone); the interaction states are #449's.

### The data-theme fallback

Today the light theme is `:root`, so Hive is themed even if nothing sets
`data-theme`. After this it is not: the suite's neutrals exist only under
`[data-theme="light"]` and `[data-theme="dark"]`. `index.html` already sets the
attribute before first paint, but its `catch` leaves it unset when
`localStorage` throws (a blocked-storage browser), and the page would then
render with no neutrals until `applyTheme` runs. The inline script resolves the
OS preference outside the `try`, so `data-theme` is always set before paint.

## The places that move

Every other token is equal, value for value (spacing, radius, fonts, type,
transitions, danger, danger-hover, success, warning, text, text-secondary,
border, bg, light surface). What differs:

### Neutrals

| Token | Theme | Hive today | Suite | Where it is drawn |
|---|---|---|---|---|
| `--color-surface` | dark | `#1e1e1e` | `#1a1a1e` | cards, panels, header, modals |
| `--color-surface-raised` | light | `#f8f9fa` | `#ffffff` | `.status-pipeline`, form inputs (`.form-field …`), label-settings forms and delete confirm, `.quick-date-chip` — 5 rules |
| `--color-surface-raised` | dark | `#2a2a2a` | `#252528` | the same |
| `--color-text-muted` | light | `#767676` | `#606b76` | 15 rules (see below) |
| `--color-text-muted` | dark | `#8b8b8b` | `#868e98` | the same |
| `--color-border-light` | both | `#969696` / `#787878` | `#e8eaed` / `#25252b` | see below: **not adopted as is** |

Two things in that table are not a plain swap.

**`--color-border-light` has meant something different in Hive.** The suite's
is a hairline (1.21:1 on white); Hive's is the outline of a control, and the
suite has a token for that, `--color-border-strong`. Its two uses are the
sub-task checkbox outline (`.check-box`) and `.share-archive-board-btn`. Both
move to `--color-border-strong`, which is `#7d838a` light and `#74797f` dark:
the checkbox outline goes from 2.96:1 to 3.83:1 on white in light (2.64 to 3.41
on the page), and from 3.78 to 3.95 in dark. Swapping the name instead would
have left a checkbox with a 1.21:1 outline.

**Muted text improves everywhere but lands under 4.5 on two column pastels.**
Measured against the surfaces Hive draws it on:

| Surface | Hive today | Suite value |
|---|---|---|
| light: surface / page / raised | 4.54 / 4.05 / 4.31 | 5.44 / 4.85 / 5.44 |
| light: the eight column pastels | 3.75 – 4.28 | 4.49 – 5.12 (purple 4.489, pink 4.518) |
| dark: surface / page / raised | 4.89 / 5.50 / 4.21 | 5.23 / 5.65 / 4.61 |
| dark: the eight column pastels | 4.29 – 4.79 | 4.41 – 4.93 (todo 4.412) |

Today it fails on the page (4.05) and on most pastels. After, it fails on two
pastels by a hair, and only where it is drawn on a column, which is two rules:
`.column-add-row` (the 13px "Add item" text) and `.column-add-btn` (the "+"
glyph). The glyph needs 3:1, which it has. The text moves to
`--color-text-secondary`: 4.99 on the light purple column, 5.54 on the dark todo
column. That is the one colour that changes beyond the table above.

### Overlays

Hive's `--overlay-xs…3xl` are about a third as strong as the suite's
(`0.02 … 0.15` against `0.04 … 0.40`), in both themes. Taking the suite's values
by name would make every hover tint two to three times stronger, which is a
look change this issue does not exist to make, and #449 redefines hover and
pressed anyway. So each use is re-pointed at the suite step nearest its present
alpha, and the guard test checks that no alpha moves by more than 0.02.

| Hive token (alpha) | Becomes | Why |
|---|---|---|
| `--overlay-xs` (0.02), `-sm` (0.03), `-md` (0.05) | `--overlay-xs` (0.04) | nearest |
| `--overlay-xl` (0.08) | `--overlay-sm` (0.08) | identical |
| `--overlay-2xl` (0.10) | `--overlay-md` (0.12) | nearest, and above `-xl`, which the status chevron relies on for hover over reached |
| `--overlay-3xl` (0.15) | `--overlay-lg` (0.16) | nearest |
| `--overlay-badge`, `--overlay-view-toggle` | `--overlay-lg`, `--overlay-xs` | retired, above |

Four uses are not hover tints and are re-pointed by role instead:

| Use | Was | Becomes | Visible? |
|---|---|---|---|
| backdrops: `.modal-overlay`, `.detail-overlay`, `.column-date-sort-overlay` | `--overlay-4xl` (0.4 light, 0.6 dark) | `--color-overlay` (0.4, 0.6) | no — identical |
| `.detail-panel` shadow | `--overlay-3xl` | `--color-shadow-strong` | light: no (0.15). **Dark: a white 0.15 glow becomes a black 0.40 shadow** |
| `.theme-toggle-active` shadow | `--overlay-3xl` | `--color-shadow-strong` | as above |
| `.view-tab-active` shadow | `--overlay-md` | `--color-shadow` (0.08) | light: 0.05 to 0.08. Dark: white to black |

The dark-mode white shadows were a bug (a shadow that lightens), not a design,
which is why these are taken as the fix rather than preserved. The light-mode
`--shadow` and `--shadow-lg` composites come out identical: the suite's literal
0.15 and 0.05 are what Hive's resolved to. Hive keeps its own dark overrides for
both.

`.column-add-btn:hover` and `.column-add-row:hover` read `--overlay-hover`,
which Hive never defined, so those two hovers have no background today. This
issue leaves that as it is and the guard test lists it as the one allowed
undefined token; #449 gives them a hover.

## What a person sees

In light, near nothing: muted text is a little darker and bluer, the sub-task
checkbox outline and the Archive board button's outline are firmer, five
off-white fills (inputs, the status pipeline, label forms, quick-date chips)
become white, and "Add item" on a column is slightly darker. In dark, the card,
panel and header surfaces shift from `#1e1e1e` to a very slightly bluer
`#1a1a1e`, raised fills darken a step, muted text is a touch bluer, and the
detail panel and the active theme/view toggles get a real shadow where they had
a white glow.

## Edge cases

- **Storage blocked, no JS yet.** Covered above.
- **Print or forced colours.** Not used by Hive today; unchanged.
- **A token the stylesheet reads but nobody defines.** The guard test fails on
  it, with `--overlay-hover` as the one named exception until #449.
- **A future suite change.** Hive's snapshot test pins its own resolved values,
  so a change to `ui/tokens/suite.css` fails Hive's suite until the snapshot is
  updated deliberately, in the same PR. That is the point of the file being
  tested by its consumers.

## Copy

None.

## New tokens

None. This note retires two (`--overlay-badge`, `--overlay-view-toggle`) and
moves the rest. The suite tokens Hive does not yet read (`--color-on-fill`,
`--color-danger-text` and the rest) arrive unused.

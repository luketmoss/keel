# The suite language

Standing reference, not an issue note. It covers every issue, which is why it
has no number, and it outranks any single note. Per-issue notes reference tokens
from here by name instead of restating values.

It was salvaged from the design language written for almanac, a retired app, and
reconciled against the values Thrive ships as of 2026-10-13. Thrive is the
reference app: it is the one with the contrast work behind every value.

## The idea

**One family, told apart by its colour.** Thrive, Hive and Forage share the same
neutrals, scales, card shapes and bottom navigation, so moving between them on a
phone feels like one app. The accent is the only thing that says which one you
are in.

Light is the base theme. Dark is designed, not inverted. Both follow the system
setting.

### Where this sits

There are two design languages in Keel: Alpenglow for cairn, written in
[`cairn/docs/design/design-language.md`](../../../cairn/docs/design/design-language.md),
and this one for everything else. They share only the Keel-wide rules (#401) and
framework-free documents, CSS and logic. Neither borrows tokens from the other.

Per-app accent values are not in this document. They live in the colour registry
in [`keel-wide-rules.md`](keel-wide-rules.md), so a new app changes one file.

## Colour

### Accent

Two tiers. `--color-accent` is the brand mark and nothing else. `--color-primary`
is everything interactive, and it is tuned per theme for contrast.

| Token | Role |
|---|---|
| `--color-accent` | the brand: the app's mark and icon. Identical in both themes. Never used for text, controls or states |
| `--color-primary` | links, selected states, focus rings, primary fills and chart lines. Tuned per theme so it passes AA on the surfaces it sits on |
| `--color-primary-hover` | hover on primary fills and text |
| `--color-primary-light` | selected-chip fill and other soft primary backgrounds |
| `--color-on-primary` | text and icons on a primary fill |

An app's accent values are chosen against its neutrals, not borrowed from a
neighbour. The values live in the colour registry in [`keel-wide-rules.md`](keel-wide-rules.md).

### Neutrals

Thrive's values, from its `frontend/src/global.css` as of 2026-10-13.

| Token | Light | Dark |
|---|---|---|
| `--color-bg` | `#f0f2f5` | `#121212` |
| `--color-surface` | `#ffffff` | `#1a1a1e` |
| `--color-surface-raised` | `#ffffff` | `#252528` |
| `--color-border` | `#dadce0` | `#3c3c3c` |
| `--color-border-light` | `#e8eaed` | `#25252b` |
| `--color-border-strong` | `#7d838a` | `#74797f` |
| `--color-text` | `#1f1f1f` | `#e8eaed` |
| `--color-text-secondary` | `#5f6368` | `#9aa0a6` |
| `--color-text-muted` | `#606b76` | `#868e98` |

Muted text, measured with the WCAG relative-luminance formula, passes AA at every
place it is drawn:

- light: 5.44 on `--color-surface`, 4.85 on `--color-bg`, and 4.51 on
  `--color-border-light`, the tightest place Thrive draws it
- dark: 5.23 on `--color-surface`, and 4.61 on `--color-surface-raised`

An app whose muted text falls below 4.5 on any of those is wrong and migrates to
these values.

### Status

Status colours mean good, warning or bad, and never identify a series.

| Token | Means |
|---|---|
| `--color-success` | goal met, normal, done |
| `--color-warning` | outside the usual range in the unwelcome direction, needs a look |
| `--color-danger` | failed, destructive, out of bounds |

Each has a `-tint` companion for chip and banner backgrounds, and Thrive also
names text and fill variants; the tokens file (#402) reads those names from
Thrive's stylesheet rather than this document restating them.

**Never colour alone.** A status always ships with an icon and a word.

### Data colours

Data is not chrome, so it may carry its own hues, with two rules:

- It always carries its word. A coloured series is named beside its mark.
- It is never bare dots that need colour to tell them apart. Where two hues
  would be close for a colour-blind reader, use an icon or a label instead.

### Charts

- **One axis per chart.** A group of charts is small multiples on one shared date
  axis, never a second y-scale.
- **Blank days break the line.** A missing day is a gap, not a zero and not an
  interpolation.

## Scale

- **Spacing:** `--space-xs` 4 · `sm` 8 · `md` 16 · `lg` 24 · `xl` 32 · `2xl` 48
- **Radius:** `--radius-sm` 4 · `md` 8 · `lg` 16 · `full`
- **Type:** `--text-xs` 12 · `sm` 14 · `base` 16 · `lg` 18 · `xl` 20 · `2xl` 24
- **Fonts:** two stacks, a system sans for text and a monospace for code and
  fixed-width figures
- **Transitions:** two, a fast one for state changes and a slower one for
  movement
- **`--nav-height`:** the bottom tab bar's height, so content can clear it

Columns of numbers use `tabular-nums`; a lone large number does not.

## Layout

- **Phone first.** Design at 375px and widen from there.
- **A bottom tab bar** is the primary navigation.
- **Cards are for sources**, one per source, with hairline rows inside. Rows are
  separated by hairlines, never by nested cards.
  A summary screen may give each metric its own card when the card is a chart
  carrying the metric's word and value (Thrive's Day screen, #484). Lists of
  rows still group by source. The split is for reading at a glance: one card
  per chart keeps each metric's word, value and marks together, which a
  source card of hairline rows cannot do once the rows become charts.
- **Touch targets are at least 44px.**

## Showing data

- **Blank is not zero.** A missing value shows as `—` with words saying why, such
  as "No reading". An unset field shows as unselected, never as a middle option.
- **Freshness is in words.** Data that has not arrived yet says so. It never shows
  a stand-in value, and a total that is still growing says "so far".

## Words

Write from the reader's side, in sentence case. Say what happened and what to do
next, not what the system did.

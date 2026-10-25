# 644 — Desktop: wrap the sideways rows, bind the tab bar and FAB to the column

Thrive stays a phone app with one 600px column. This note fixes the three things
that break with a mouse in a wide window, and nothing else. CSS only, in
`frontend/src/global.css`. No new copy: no string is added or changed.

## Measured on `main` (demo mode, 1440×900, mouse)

Read with `getBoundingClientRect()` / `scrollWidth` in the preview on 2026-10-25:

| What | Measured | Meaning |
|---|---|---|
| `.screen` | 600 wide, left 413 | the column |
| `.activities-chips` | 8 chips, `scrollWidth` 655 vs `clientWidth` 576 | Walk and later cut off |
| `.up-next-row` | 5 cards of 150, `scrollWidth` 814 vs 600 | cards 4 and 5 cut off |
| `.trends-group-scroll` | 8 tabs, `scrollWidth` 685 vs 568 | Intake and Custom cut off |
| `.bottom-nav-tab` | lefts 106, 383, 680, 960, 1243; each 52 tall | spread over 1425 |
| `.fab` | right edge 1409 (16 from the window), bottom 80 from the window | far from the column |
| `.calendar-shade-toggle`, `.trend-table-scroll` | not rendered in the demo's default Trends view | checked by the criteria, not restyled |

The window's `clientWidth` is 1425, not 1440: the page scrollbar takes 15px.
Centre anything against the same box `.screen` centres in (the fixed element's
own width, `100%`), never `100vw`, or it lands 7–8px off the column.

## Which devices get what

- **Pointer rules** (rows wrap): `@media (hover: hover) and (pointer: fine)`, at
  any width. It's the input that's the problem, not the width. A narrow desktop
  window wraps too, and a touch tablet keeps swiping.
- **Column rules** (tab bar, FAB): unconditional. In a viewport no wider than
  `--content-max`, the band is the window, so a phone computes the same
  positions it does today.

## Activities

### Type chips

Under the pointer query, `.activities-chips` gets `flex-wrap: wrap`. The row
gap stays `--space-xs` and the line gap is also `--space-xs`. Chip size, order,
selected state and the 44px row hit height are unchanged. At 576px the eight
chips take two lines (measured overflow 79px). Wrapping also drops the
`overflow-x`, so no focus ring can be clipped.

### Up next

Under the pointer query, `.up-next-row` becomes
`display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr))`
with gap `--space-sm`:

- Cards keep the 150px figure as their minimum and stretch to share the row. At
  the 600px column (568 inside the padding) that's 3 per row, so 5 planned
  cards make rows of 3 and 2.
- Order is today's (date order), left to right, then down.
- Drop `scroll-snap-*` and the negative side margin with its matching padding,
  so the grid lines up with the cards below it.
- A long name ("3 - Legs A - Rebuild") wraps or ellipsizes exactly as it does
  in a 150px card today. No new truncation rule.
- **Zero planned:** the section isn't rendered, as today. **One planned:** a
  single card in the first track, not stretched across the row
  (`auto-fill`, not `auto-fit`, so an empty track keeps its width).

## Trends: group switcher

Under the pointer query, `.trends-group-btn` padding drops from `--space-md`
to `--space-sm` on each side. Measured: that brings the row from 685 to about
557, inside 568. As a fallback for other fonts and zoom, `.trends-group-row`
also gets `flex-wrap: wrap` and `width: auto` there. If it does wrap, the 1px
rule stays under the whole block, and each tab's 2px underline stays under its
own label. The 44px tab height is unchanged.

## Tab bar

`.bottom-nav` keeps `left: 0; right: 0`, its `--color-surface` background and
its top border, so the bar still reads as full width. Its tabs are laid out in a
centred band `min(100%, --content-max)` wide: side padding of
`max(0px, (100% - --content-max) / 2)`, still `justify-content: space-around`.
Tab sizes (52 tall), the active top bar, bold label and colours are unchanged.
At 1440 the five tabs fall within the column's 413–1013.

## FAB

The right offset becomes `max(16px, (100% - --content-max) / 2 + 16px)`,
measured from the same box. Its right edge then lines up with the cards' right
edge in the column, the same relationship it has on a phone. The bottom offset
is unchanged (80 from the window). Other fixed overlays (toasts, the undo bar,
modals) are already capped at 400–480px and centred, so they're left alone.

## States and edge cases

- **Window resized across a breakpoint:** pure CSS, so it reflows live. Nothing
  is remembered.
- **Hybrid laptop with a touchscreen:** the browser reports its primary pointer.
  A mouse-primary laptop wraps, and a tap on a wrapped chip still works. No
  special case.
- **Forced colours:** no new colour is drawn. The chips' and tabs' forced-colour
  rules apply unchanged, and the one `@media (forced-colors: active)` block
  stays one block.
- **Lift Mode:** the tab bar isn't rendered there, and its compact
  `@media (max-height: 560px)` block is untouched.

## New tokens

- `--content-max: 600px`: the width of the app's content column. It goes in
  Thrive's own `:root` in `global.css`, **not** `ui/tokens/suite.css` (a shared
  token file, and a human-reviewed path). `.screen`, `.template-editor`,
  `.simple-workout-form` and `.workout-detail-screen` replace their literal
  `600px` with it, and the tab bar and FAB use it. A change to it then moves the
  column and the fixed controls together.

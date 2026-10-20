# 503 — Trends: a compact icon toolbar for range, average and view

The Trends screen's three labelled rows of text buttons (Range, Average, View)
become one row of three compact controls beside the heading, and the group
switcher becomes underlined tabs. The charts move up the page.

Chosen direction: option A, "Icon toolbar", from the prototype canvas "Thrive
Trends — modern controls prototype" (`Main.dc.html`). Options B (floating dock)
and C (one tune button and a bottom sheet) were considered and not picked.

Standing documents this answers to: `ui/docs/design/keel-wide-rules.md` (all
six interaction states, a visible focus ring, 44px-class touch targets, colour
never the only cue, reduced motion) and `ui/docs/design/suite-language.md` for
tokens. The prototype's hex values are mock-up colours; this note names tokens.

## Measured first

From the running app in demo mode (`/?demo=true#/trends`), `getBoundingClientRect()`:

| | 320 × 700 | 375 × 812 |
|---|---|---|
| Content column | 288 | 343 |
| Top of the first chart card | 481 | 460 |
| Controls block (3 labelled rows) | 223 tall | 223 tall |
| Group switcher | 48 tall | 48 tall |
| `h1` "Trends" | 20px, text 62 wide | same |
| `.sub-type-btn` | 44 × 44 | 44 × 44 |

The prototype's controls are **40px chips and 36px switch buttons**. The suite
language floor is 44px for everything, and Thrive's controls are already 44, so
the prototype's sizes are not used. At 44px the toolbar is, by measured text
widths (`14px/600`: "1W" 19, "3M" 21, "All" 17, "Off" 20, "7d" 16, "14d" 22,
"30d" 24):

- range chip: 12 + 20 icon + 4 + ≤24 text + 12 = **≤ 72**
- average chip: same, **≤ 72**
- chart/table switch: 2 × 44 + 2 × 2 padding + 2 gap = **94**
- two 6px gaps = **12**
- toolbar **≤ 250**, plus the heading's 62 and an 8px gap = **≤ 320**

So the heading and toolbar share a row at 375 (343 available) and **do not at
320 (288 available)**. The decision: the toolbar sits on the heading's row when
it fits and wraps onto its own row beneath it when it does not. It wraps by
content (flex wrap), not by a breakpoint, so no width in between is left
cramped. The wrapped toolbar is right-aligned to match the unwrapped one.

## The main path

1. The heading row reads `Trends` on the left and, on the right, three
   controls in this order: **range chip**, **average chip**, **view switch**.
2. Under it, the group tabs. Under those, the caption and the charts, as today.
3. Tap the range chip: a menu opens under it listing the six ranges. Tap one:
   the menu closes, the chip shows the new value, the charts redraw from the
   rows already in memory. No sheet read.
4. The average chip does the same with the four averages.
5. The view switch is two icon buttons side by side; the pressed one is the
   current view. Tapping the other swaps charts for the table, as today.
6. Tapping a tab swaps the group, as today, and closes any open menu.

Everything remembered today stays remembered the same way (`prefs.ts`: range,
average, view, group). Which controls clear the selected day is unchanged:
range, view and group clear it, average does not.

## The controls

| Control | Shows | Icon | Accessible name | Opens |
|---|---|---|---|---|
| Range chip | the current key: `1W` `1M` `3M` `6M` `1Y` `All` | calendar | `Range: 3M` | the range menu |
| Average chip | `Off` `7d` `14d` `30d` | wave | `Average: 7-day` (`Average: off` for Off) | the average menu |
| View switch | — (icons only) | chart line, table grid | `Chart`, `Table` in a group named `View`, each `aria-pressed` | — |

The visible text of each chip (`3M`) is inside its accessible name (`Range:
3M`), so a voice-control user can say what they see.

Icons are drawn inline in `shared/icons.tsx`, per #405's style (24 box, 2px
stroke, round caps and joins, `fill="none"`, `currentColor`,
`aria-hidden="true"`, `focusable="false"`): `CalendarIcon` already exists in
`day/day-header.tsx` and is reused or moved there; new are `WaveIcon` (one
sine-like stroke), `ChartLineIcon` and `TableIcon`.

### The menus

An in-page popover under its chip, `role="menu"` with `role="menuitemradio"`
items and `aria-checked` on the current one. The chip has `aria-haspopup="menu"`
and `aria-expanded`.

| Range menu | Average menu |
|---|---|
| Last 7 days | No average |
| Last 30 days | 7-day average |
| Last 3 months | 14-day average |
| Last 6 months | 30-day average |
| Last year | |
| All time | |

The range words are `RANGE_PHRASE` from `series.ts`, capitalised, so the menu
and the chart's own label ("Resting HR, last 3 months") never disagree. (The
prototype said "Last week" and "Last month", which are not what 1W and 1M
mean.) The current item carries a `✓` and a tint; the tick is the non-colour
cue.

- Each item is at least 44px tall. The menu is at least as wide as its widest
  item and **never wider than the content column**; at 320 it is right-aligned
  to the column edge and clamped so it does not leave the screen.
- Only one menu is open at a time. Opening one closes the other.
- **Closes on:** choosing an item, a press outside it, `Escape`, `Tab`, a
  group-tab press, leaving the screen.
- **Keyboard:** `Enter`/`Space` on the chip opens it with focus on the current
  item; `ArrowDown`/`ArrowUp` move (wrapping), `Home`/`End` jump, `Enter`/`Space`
  chooses, `Escape` closes and returns focus to the chip. Choosing returns
  focus to the chip as well.
- No animation. (Reduced motion is satisfied by having none; nothing here
  needs a transition.)

### Chip states (all six, per #404)

| State | Range chip | Average chip |
|---|---|---|
| Rest | `--color-surface` fill, `--color-border` outline, `--color-text` | the same when `Off` |
| Selected | — (a range is always chosen; it never reads as "on") | with an average chosen, `--color-primary-light` fill and `--color-primary-on-light` text; the value text `7d` is the non-colour cue |
| Open | `--color-primary-light` fill and a 2px `--color-primary-text` outline | same |
| Hover | `--state-hover` laid over, under `@media (hover: hover)` | same |
| Pressed | `--state-pressed` laid over | same |
| Focus | the global ring | same |
| Disabled | not reachable | not reachable |

The chips are placed in #404's **Chips and toggles** family, and the view switch
buttons too: `interaction-states.test.ts` reads that table, so the classes
this issue adds are added to it in the same change.

### The view switch

A two-button segmented group, 44 × 44 per button. The pressed button gets
`--color-primary-light` and `--color-primary-on-light`; the icon alone cannot
carry the state, so the pressed button also has a 2px `--color-primary-text`
inset outline. Hover/pressed/focus as the chips.

## The group tabs

The group switcher keeps its job and its semantics (a row of `aria-pressed`
buttons in a scrolling region named `Metric group`), and changes its look: no
boxes; text on the page background with a 2px underline under the current one.

| State | Treatment |
|---|---|
| Rest | `--color-text-secondary`, `--text-sm`, weight 600, 44px tall, no underline |
| Selected | `--color-primary-text` text, **weight 700** and a 2px `--color-primary-text` underline. Bold plus underline is the non-colour cue |
| Hover / pressed / focus | overlay and ring as #404 |

A 1px `--color-border` rule runs under the whole row; the selected underline
sits on top of it.

All **seven** groups stay (Recovery, Sleep, Fitness, Body, Blood Pressure,
Activity, Custom) — the prototype drew four. They do not fit 288px, so the row
scrolls sideways inside its own region as it does today, never the page. New:
**the selected tab is scrolled fully into view on arrival and on selection**,
so a remembered `Custom` is not off-screen to the right.

With Custom selected, `Edit metrics` stays where it is, directly under the
tabs.

## States

Unchanged and not re-specified: loading, error with "Try again", the empty
custom set, "Nothing recorded yet", the table. The toolbar and tabs render in
all of them — they are the way out of an empty range. Two cases:

- **While loading or in error** the chips still open and still change the
  remembered value; the charts catch up when the data lands.
- **Nothing to switch**: with fewer than two groups the tabs render nothing, as
  today.

## Copy

All strings above. The caption under the tabs is unchanged
(`Dots are each day · line is the 7-day average · …`). The old visible labels
"Range", "Average" and "View" are gone from the screen; they survive as the
accessible names above and as the `View` group label.

## New tokens

None. Every colour is an existing `--color-*` token; spacing and radii use
`--space-*` and `--radius-*`.

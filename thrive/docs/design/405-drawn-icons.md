# 405 — Drawn icons instead of emoji

The bottom navigation and the two workout pickers stop using emoji. Each gets
a drawn line icon in the style Thrive's three existing icons already use.

Standing documents this answers to: the Keel-wide rules
(`ui/docs/design/keel-wide-rules.md`, #401) — all six interaction states, and
colour never the only cue — and the suite language
(`ui/docs/design/suite-language.md`, #400) for tokens. Cited as paths because
neither exists until its issue merges.

## What is there today

Read from `frontend/src` (every `.tsx`, tests excluded, searched for
characters in the emoji blocks). The issue's original list was out of date:
there is no 📝, and 📈, 📚, 🗓️, 🏃 and 🚶 were missing.

| Where | Emoji | Label |
|---|---|---|
| `shared/bottom-nav.tsx` | 🗓️ 📋 📈 📚 ⚙️ | Day, Activities, Trends, Library, Settings |
| `workout/type-selector.tsx` | 🏋️ 🤸 🚴 🥾 🏃 🚶 | Weight, Stretch, Bike, Hike, Run, Walk |
| `workout/intent-selector.tsx` | 💪 📋 | Track Now, Plan for Later |

Thirteen uses, twelve distinct glyphs. The nav's emoji are not announced — each
tab carries an `aria-label` — but the picker cards have none, so a screen
reader reads "weight lifter, Weight".

The text symbols elsewhere (`←` Back, `✕`, `✓`, `↑`, `↓`) are not emoji: they
take `color` and render alike everywhere. They stay.

## The style

Thrive already draws three icons inline — `CalendarIcon`
(`day/day-header.tsx`), `SyncIcon` (`day/day-sync-line.tsx`) and the
last-time icon (`workout/exercise-row.tsx`). The new ones match them:

- inline `<svg>`, `viewBox="0 0 24 24"`, `fill="none"`;
- `stroke="currentColor"`, `stroke-width="2"`, round caps and joins — the
  last-time icon's weight, and the same as the other two's 1.6–1.7 on a 20 box;
- `aria-hidden="true"` and `focusable="false"` on every one, because the
  control's own text or `aria-label` is its name;
- drawn in outline, never filled shapes, so a selected and an unselected icon
  differ by colour plus the control's own cue, not by a second drawing.

They live in one module, `frontend/src/components/shared/icons.tsx`, one
exported component per icon, so the picker and nav import by name. Hand-drawn,
or adapted from an MIT- or ISC-licensed set with its licence notice kept at the
top of that file; either way inline, with no icon package at runtime. The three
existing icons stay where they are.

## The icons

Each is described by what it draws, so two people would draw the same thing.

| Control | Icon | Drawing |
|---|---|---|
| Day | `SunIcon` | a circle with eight short rays — *today*. Not a calendar: the Day header's calendar button already uses `CalendarIcon`, and two calendars side by side would mean the same thing. |
| Activities | `ClipboardIcon` | a clipboard with a clip at the top and two lines |
| Trends | `TrendIcon` | a rising polyline of four points over an L-shaped axis |
| Library | `BooksIcon` | three book spines standing on a shelf line, one leaning |
| Settings | `GearIcon` | a six- or eight-toothed gear with a centre hole |
| Weight | `DumbbellIcon` | a horizontal bar with two plates each end — the barbell of Thrive's mark, simplified |
| Stretch | `StretchIcon` | a stick figure, arms raised in a V, legs apart |
| Bike | `BikeIcon` | two wheels and a diamond frame with a seat and bars |
| Hike | `MountainIcon` | two peaks, the taller behind |
| Run | `RunIcon` | a stick figure mid-stride, leaning forward, one arm bent |
| Walk | `FootprintsIcon` | two offset footprints |
| Track Now | `StopwatchIcon` | a round watch face with a crown and one hand |
| Plan for Later | `CalendarPlusIcon` | a calendar page with a plus in its body |

Run and Walk are told apart by shape — a figure and footprints — and both
always carry their label, so the icon is never the only way to tell.

## Size and colour

| Where | Size | Colour |
|---|---|---|
| Bottom nav | `--icon-md` (24px) | `currentColor` — the tab's `--color-text-muted` at rest, `--color-primary-text` when active |
| Picker cards | `--icon-lg` (40px) | `--color-primary-text` |

**24px in the nav, where the emoji drew at `1.25rem` (20px):** an emoji fills
its box edge to edge; a 2px line icon at the same box reads smaller, so 24px
matches its optical weight. It fits: from `global.css`, the tab is `--space-xs`
padding top and bottom (8px) + 24px icon + 2px gap + a 12px label at line
height 1.5 (18px) = 52px, inside `--nav-height` (64px).

**40px on the cards**, the emoji's `2.5rem` exactly; the card is
`min-height: 120px` and has room.

**The active tab now changes its icon's colour too.** `global.css`'s comment
on `.bottom-nav-tab.active` says the bar and bold label exist because "the
icons are emoji and ignore `color`". The bar and bold stay — colour is still
never the only cue — and that comment is updated to say why they stay.

The picker icons are not the workout-type badge colours. Those are data
colours for a list; here every card is the same kind of choice, and one colour
keeps the grid calm.

## States

The icon has no states of its own; it takes the control's colour in every one
(#404). Disabled dims it with the control. In forced-colours mode
`currentColor` follows the system's text colour, which the emoji never did.

## Copy

No strings change. The type cards' accessible names become exactly their
labels — "Weight", "Track Now" — because the icon is hidden.

## Edge cases

- **No SVG support** is not a real case for this app; nothing degrades.
- **Zoomed text**: the icons are sized in px tokens and do not grow with text
  zoom, as the emoji did not (their `rem` sizes followed the root, which Thrive
  pins at 16px).

## New tokens

| Token | Value | For |
|---|---|---|
| `--icon-md` | `24px` | a drawn icon beside or above a short label: the bottom nav |
| `--icon-lg` | `40px` | a drawn icon that is the main figure of a large choice card |

Thrive has no icon size tokens yet; the existing three icons set `width` and
`height` as attributes (18 and 20). Those stay; giving them tokens is not this
issue.

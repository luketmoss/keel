# 623 — Today · Boards · Settings: tab bar, rail and Settings screen

Hive's header (logo, Upcoming / Boards text tabs, user dropdown) gives way to the
suite's shell: a bottom tab bar on phones and a left rail on desktop, with the
same three destinations. This note is the shell for the epic #622; its siblings
fill the destinations.

Standing documents: none in `hive/docs/design/`. The suite language
([`suite-language.md`](../../../ui/docs/design/suite-language.md)) and the
Keel-wide rules ([`keel-wide-rules.md`](../../../ui/docs/design/keel-wide-rules.md))
apply, as do the touch-target and interaction-state notes
([#453](453-touch-targets.md), [#452](452-interaction-states.md)). Thrive is the
reference app: its `.bottom-nav` and `.bottom-nav-tab` in
`thrive/frontend/src/global.css` are the pattern copied here. A clickable
prototype of the whole epic is linked from #622; this note is the authority.

## Destinations

| Destination | URL | Shows | Document title |
|---|---|---|---|
| Today | `?view=today` (also no `view`) | Today (#624); until it lands, the existing Upcoming view | `Hive — Today` |
| Boards | `?view=boards` | the Boards list (#625); until it lands, the active board | `Hive — Boards` |
| a board | `?board=<id>` | that board, Boards marked active | `Hive — <board name>` |
| Settings | `?view=settings` | the Settings screen below | `Hive — Settings` |

- `?view=upcoming` is an old link: it opens Today and rewrites the URL to
  `?view=today` with `history.replaceState`, keeping any other parameters.
- `?item=<id>` opens the item over whatever destination it is combined with, as
  now. On its own it opens over its board.
- Until #625 lands, `?view=boards` with no board shows the active board, exactly
  as the Boards tab does today, so this issue ships alone.
- Navigation uses `history.pushState`, so the browser's back button steps back
  through destinations. Switching between filters inside a destination does not
  push.

## Phone: the tab bar (below 768px)

Fixed to the bottom of the viewport, `--nav-height` tall, `--color-surface`, a
1px `--color-border` top edge, `env(safe-area-inset-bottom)` padding. Three
equal tabs, each a link:

| Tab | Icon (drawn, 24 × 24, 2px stroke, `currentColor`) |
|---|---|
| Today | a sun: a circle and eight rays |
| Boards | three rounded columns of different heights |
| Settings | a gear |

Each tab stacks the icon over its label (`--text-xs`, 500). At rest,
`--color-text-muted`. Active: `--color-primary`, label 700, and a 2px
`--color-primary` bar on its top edge (`box-shadow: inset 0 2px 0`), plus
`aria-current="page"`. Colour is never the only cue: weight and the bar carry
it, as Thrive's #182 requires.

The page's scroll container gets bottom padding of `--nav-height` plus
`--space-lg`, so the last row clears the bar. Floating action buttons sit
`--space-md` above the bar.

## Desktop: the rail (768px and up)

A column on the left, full height, `--color-surface`, a 1px `--color-border`
right edge. The page content fills the rest.

**From 1024px — full rail, `--rail-width`.** Top to bottom:

1. The Hive mark (the existing `HiveLogo`, 28px) and "Hive" at `--text-xl` 700
2. **Today** — sun icon, label, and on the right in `--color-text-muted` the
   number left today ("3 left") once #624 lands; until then nothing
3. **BOARDS** — a section heading, `--text-xs` 700, letter-spaced, muted. A
   heading only in this issue; #625 makes it a link to the list
4. One row per accessible non-archived board, in `accessibleBoards` order: a
   20px tile in the board's colour with its icon or first letter, the name, and
   its open count on the right
5. **New board** — plus icon, `--color-primary` text, 600; opens the existing
   create-board modal
6. A flexible gap
7. **Settings** — gear icon
8. The signed-in person — initials avatar and their Owners name (or Google
   name), a link to Settings

Rows are `--touch-target` tall, `--space-md` side padding, `--radius-md`. At
rest `--color-text-secondary`; hover `--state-hover` fill and `--color-text`;
pressed `--state-pressed`. Active (current destination or open board):
`--color-primary-light` fill, `--color-primary` text, 700, `aria-current="page"`.

**768px to 1023px — compact rail, `--rail-width-compact`.** Measured: the
board's columns are `--column-width` (320px); at 768px a full rail would leave
528px, one column. The compact rail shows only the Hive mark, Today, Boards and
Settings as icon-over-label buttons, the same as the tab bar turned on its side,
and no board list. Boards goes to the active board (the list, once #625 lands).

## Settings screen

A Thrive-style page: date-line-sized muted subline with the signed-in email,
big title "Settings" at `--figure-lg` 700, then cards (`--color-surface`,
`--radius-lg`) of hairline-separated rows, each `--touch-target` or taller.

| Card | Row | Behaviour |
|---|---|---|
| Appearance | Theme: Light · Dark · System | a three-segment radiogroup; selecting applies at once, as the user-dropdown toggle does (`setTheme`) |
| You | Edit profile › | opens the existing profile dialog. Absent in demo mode, as now |
| Boards | Archived boards › | opens the existing archived-boards dialog; the count of archived boards on the right |
| Help | Keyboard shortcuts › | opens the existing shortcuts help. Only at 768px and up |
| — | Sign out | its own card; `--color-danger-text`, with a sign-out icon and the word; signs out as now |

No confirm on Sign out: it destroys nothing, as today.

## What goes

- The header bar (`.app-header`), its Upcoming / Boards tabs, and the user
  dropdown component
- `activeView` becomes `'today' | 'boards' | 'settings'`; `switchToUpcoming`
  and `switchToBoard` become one `navigate(view, boardId?)`

The control bar stays on the board for now (board select, search, filters,
⋮); #625 and #626 take it apart.

## States

| State | Shows |
|---|---|
| Loading | the existing loading screen; no tab bar or rail until loaded |
| Signed out | the login screen; no shell |
| No accessible boards | rail shows Today, the BOARDS heading, New board; Boards shows the existing no-boards state |
| Demo mode | the demo banner above everything, as now; the shell beneath it |
| Item open on phone | the item screen covers the page; the tab bar is hidden while it is open, and returns on close |
| A modal open | modals sit above the tab bar and rail |

## Edge cases

- **The board in `?board=` is archived or not permitted.** As now: the
  "That board is not available" toast and the first accessible board.
- **Many boards.** The rail's board list scrolls inside the rail; Settings and
  the person stay pinned to the bottom.
- **Long board names.** Ellipsis on one line in the rail; full name in `title`.
- **Keyboard shortcuts.** `N`, `A`, `T` and `?` behave as now on a board. On
  Today and Settings, `T` still cycles the theme and `?` opens help; `N` and `A`
  do nothing until #624 gives Today a create action.
- **Resizing across 768px** swaps tab bar and rail without losing the
  destination, selection or scroll position of the content.

## Copy

Tabs and rail: "Today", "Boards", "Settings", "New board", section heading
"BOARDS". Settings: "Appearance", "Theme", "Light", "Dark", "System", "You",
"Edit profile", "Boards", "Archived boards", "Help", "Keyboard shortcuts",
"Sign out". Subline: the email address.

## UX Design Decisions entry

Replace "Desktop-first Kanban" in `hive/CLAUDE.md` with:

> **Today is home; a board is reached from Boards** (#622) — the daily question
> is "what's due", asked on a phone, so the app opens on Today. A board is the
> planning surface, reached from Boards, and still built to work well on desktop.

## New tokens

In `hive/frontend/src/global.css`, Hive's own (not `ui/tokens/suite.css`):

| Token | Value | For |
|---|---|---|
| `--rail-width` | 240px | the full desktop rail, from 1024px |
| `--rail-width-compact` | 72px | the icon rail, 768–1023px; 44px targets plus padding |
| `--icon-md` | 24px | tab and rail icons; Thrive's value |
| `--figure-lg` | 2.25rem | page titles (Today, Boards, a board, Settings); Thrive's `--figure-lg` |
| `--figure-md` | 1.75rem | glance figures (#624); Thrive's value |

`--nav-height` (64px) already comes from `suite.css`.

## Contrast

Measured with the WCAG formula against Hive's tokens.

| Pair | Light | Dark |
|---|---|---|
| muted tab label on `--color-surface` | 5.44 | 5.23 |
| active tab / rail text `--color-primary` on `--color-surface` | 5.91 | 9.63 |
| active rail text on `--color-primary-light` (8% over the surface it sits on, ≈ `#f6f4ee` / `#2a2410`) | 4.73 (tightest, measured over `--color-bg`) | 9.11 |
| `--color-danger-text` Sign out on `--color-surface` | 6.57 | 5.85 |

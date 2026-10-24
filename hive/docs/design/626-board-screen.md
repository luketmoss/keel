# 626 — The board in Thrive's look

The board keeps every behaviour it has — per-board columns, drag and drop on
desktop, sort modes, grouping, the card ⋮ menu, the Done column's "View all" —
and changes its look and its phone navigation. Cards on the page grey instead of
pastel slabs; outlined chips instead of colour-outlined pills; drawn icons
instead of emoji; column tabs instead of a dot pager.

Standing documents: none in `hive/docs/design/`. The suite language and the
Keel-wide rules apply. The shell is [#623](623-tab-bar-and-rail.md), "‹ Boards"
is [#625](625-boards-list.md), and the overdue pill, avatars and definitions are
[#624](624-today.md)'s. Built on [#452](452-interaction-states.md) and
[#453](453-touch-targets.md); [#466](466-column-sort-options.md) decides which
columns have a sort control, unchanged here.

## Header

Replaces the control bar's board section and search.

- "‹ Boards" (from #625), then the subline: shared-with and open count, "You,
  Mom and Dad · 8 open" (`--text-sm` secondary).
- Title row: the board's 14px colour tile, the board name at `--figure-lg` 700
  (one line, ellipsis), then on the right:
  - **Search** — from 768px a pill field (`--radius-full`, 1px
    `--color-border-strong`, 260px, search icon, placeholder "Search this
    board"). Below 768px a round 44px icon button that, pressed, replaces the
    title row with that field and a Cancel text button; Cancel or Escape clears
    the search and restores the title.
  - **Share** — owners only, from 768px: a secondary button with a people icon
    and "Share". Below 768px it is in ⋮.
  - **⋮ Board options** — the existing overflow menu, unchanged in content
    (Grouping: None / By status / By label; owner Settings), restyled as a
    `--color-surface` popover, `--radius-lg`, `--shadow-lg`, 44px rows.

## Filter chips

One row under the header, `--space-sm` apart: **All**, **Mine**, **Due today**,
**This week**, then one chip per label used by a root item on this board, in the
board's label order.

- Thrive's `.filter-chip`: 36px visible height with an invisible 44px hit area,
  `--radius-full`, `--text-sm` 600. Rest: `--color-surface`, 1px
  `--color-border-strong`, `--color-text`. Hover: border `--color-text-muted`.
  On: fill and border `--color-text`, text `--color-bg`, `aria-pressed="true"`.
- A label chip starts with an 8px dot in the label's colour, then its name. The
  label's colour never outlines or fills the chip.
- **All** is on exactly when no other chip is. Pressing All clears the rest.
- **Mine** sets `filterOwner` to Me (#624's definition); hidden when Me is
  unknown. **Due today** / **This week** set `filterDue` and exclude each other.
  A label chip sets `filterLabel` (one at a time; pressing another moves it).
  Pressing an on chip turns it off. They combine as the signals already do.
- From 768px the row wraps; a **Group: \<mode\> ▾** chip at its end opens the
  grouping choices (the same three as ⋮). Below 768px the row is one line that
  scrolls sideways, edge to edge, and the Filters button, its badge and popup
  are removed.
- The live region still announces "\<n\> cards shown" when any filter is on.

## Columns

- No tinted backgrounds: `--color-todo`, `--color-inprogress`, `--color-done`
  and `--column-color` are retired, and the per-column colour from the
  Statuses sheet is no longer drawn on the board. Cards sit on `--color-bg`.
- **Header** — the column's name as the board spells it, `--text-base` 700, not
  upper case; a count badge (`--color-border-light` fill, `--text-xs` 700,
  secondary, tabular); then right-aligned, flat 44px icon buttons: **Sort**
  (lines icon) and **Add** (plus). Sort opens a menu of the column's existing
  options ("Custom", "Due date", "Created") as `menuitemradio`, the current one
  checked; the terminal column keeps its fixed "Completion date" and shows no
  Sort button. The per-column `<select>` goes.
- The Done column keeps "View all \<n\> completed" as a text link under its
  header.
- Drop target (from 768px, while dragging): the column's body gets a 2px dashed
  `--color-primary` outline (inset) and `--color-primary-light` fill.
- An empty column shows a dashed `--color-border-strong` box, `--radius-lg`:
  "Nothing here yet" — or "Nothing matches" when a filter is on, or "Drop here"
  while dragging.

## Cards

`--color-surface`, `--radius-lg`, padding `--space-sm` `--space-sm`
`--space-sm` `--space-md`, `--space-sm` apart. A 1px transparent border that is
`--color-border` on hover; `--state-pressed` when pressed; dragging dims to
`--opacity-disabled`.

Left, a stack:

1. **Title** — `--text-base` 600, up to 3 lines then ellipsis. Done items:
   struck through in `--color-text-muted`.
2. **Meta row** — `--text-sm` secondary, wrapping, `--space-sm` × `--space-md`
   gaps:
   - Due, open item, not overdue: a 14px drawn calendar icon and "Today",
     "Tomorrow", or "Sat, Oct 31".
   - Overdue: the pill from #624 reading "OVERDUE · Oct 22".
   - Done item: calendar icon and "Done Oct 23" (its `completed_at`).
   - Subtasks: a 14px checklist icon and "2/3".
   - No owner: "Unassigned" in italics, `--color-text-muted`.
3. **Labels** — each an 8px dot in the label's colour and its name,
   `--text-sm` secondary, wrapping.

Right: the owner's initials in a 28px (`--avatar-sm`) circle in their owner
colour, `title` the full name; beneath it the existing ⋮ (44px, flat). The ⋮
menu keeps Move to top, Move to bottom, Copy, Delete.

Gone from the card: the description excerpt, the subtask progress bar, the ⏰
emoji and the "Due:" prefix.

## Phone (below 768px): column tabs

Below the chips, a tab list (`role="tablist"`) with one tab per column: the
column's name and its count badge, equal widths, 48px tall, a 1px
`--color-border` bottom edge. Selected: `--color-text`, 700, a 3px
`--color-primary` underline (`box-shadow: inset 0 -3px 0`), the badge in
`--color-primary-light` with `--color-primary` text, `aria-selected="true"`.
Others: `--color-text-muted`, 600. More than three columns: the tabs scroll
sideways and the selected one scrolls into view.

The columns stay a horizontal scroll-snap row as now. Tapping a tab scrolls to
its column; swiping to a column selects its tab. The column indicator ("To Do •
• •") is removed. Each column's own header is not shown below 768px — the tab is
the header — and its Sort and Add move to a row under the tabs: "6 items" muted
on the left, the Sort menu button (lines icon and the current mode's name) on
the right. The FAB adds to the selected column.

## Grouping

Swimlane (By status / By label) section headings take the column heading style:
sentence case, `--text-base` 700, count badge. Nothing else about grouping
changes.

## States

| State | Shows |
|---|---|
| Loading, error, no access | unchanged |
| Filter matches nothing | each column's empty box reads "Nothing matches"; the chips stay so it can be cleared |
| Board with one column | one tab on phone; one column on desktop |
| Read-only role | no Add, no drag, no Sort writes (as now); chips and search work |
| Demo mode | as now |

## Edge cases

- **A label renamed or deleted** while its chip is on: the filter clears, as the
  signal does today.
- **Many labels** — the row scrolls (phone) or wraps (desktop); there is no
  "more" overflow.
- **Search on phone with a long query** keeps the field; the chips and tabs
  stay visible beneath it.
- **Owner colour.** `OWNER_COLORS[0]` (`#e65100`) carries white initials at
  3.79:1, below AA for this size; it becomes `#c43e00` (5.20:1). The other
  seven pass (lowest `#00838f` 4.52).

## Copy

"Boards", "Search this board", "Cancel", "Share", "Board options", "All",
"Mine", "Due today", "This week", "Group: None", "Sort", "Custom", "Due date",
"Created", "Completion date", "Add to \<column\>", "View all 3 completed",
"Nothing here yet", "Nothing matches", "Drop here", "Today", "Tomorrow",
"OVERDUE · Oct 22", "Done Oct 23", "Unassigned", "6 items", "\<n\> cards shown".

## New tokens

None beyond #623 and #624's. Retired: `--column-color`. `--color-todo`,
`--color-inprogress`, `--color-done` and `--color-col-*` stay for now: the item
screen's column picker (`card-detail.tsx`, #627), the icon picker's selected
swatch and the column settings' terminal toggle still read them. They go with
#627, once no rule reads them.

The header's colour tile is `--color-primary`: a board has no colour of its own
in the frontend's model (the Boards tab's Color column is not read, and the
schema is frozen).

## Contrast

Measured from the tokens by `board-screen.test.ts`, which fails if this table and the stylesheet disagree.

| Pair | Light | Dark |
|---|---|---|
| title `--color-text` on `--color-surface` | 16.48 | 14.39 |
| meta and labels `--color-text-secondary` on surface | 6.05 | 6.57 |
| "Unassigned" `--color-text-muted` on surface | 5.44 | 5.23 |
| column heading `--color-text` on `--color-bg` | 14.70 | 15.54 |
| count badge `--color-text-secondary` on `--color-border-light` | 5.02 | 5.77 |
| selected tab badge `--color-primary` on `--color-primary-light` | 4.74 | 9.10 |
| chip on `--color-bg` on `--color-text` | 14.70 | 15.54 |
| chip outline `--color-border-strong` (3:1) | 3.83 on surface, 3.41 on page | 3.95 |
| overdue pill `--color-danger-text` on surface | 6.57 | 5.85 |
| drop outline `--color-primary` on `--color-bg` (3:1) | 5.27 | 10.40 |
| initials, white on the owner colours | 4.52 lowest, after `#e65100` → `#c43e00` | same colours |

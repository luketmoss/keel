# 655 — Search and filter completed items

The Completed Items dialog becomes a list you can narrow by text, completion
date and label, grouped by month, in the suite look. It is still one board's
archive, opened the same two ways: the Done column's **View all \<n\>
completed** link and the `A` shortcut.

Standing documents: none in `hive/docs/design/`. The suite language and the
Keel-wide rules apply. Chips are [#626](626-board-screen.md)'s `.filter-chip`;
the full-screen phone page and its Back button follow
[#627](627-item-screen.md). Built on [#452](452-interaction-states.md) and
[#453](453-touch-targets.md).

A clickable prototype of this note, with example data, is at
<https://claude.ai/artifact/SgXixKsxgWpb2972d7opoK> (private to the owner). It
is a sketch of the behaviour; where it and this note differ, the note wins.

## Where it opens

- **Below 768px:** a full-screen page over the board, `--color-bg`, the tab bar
  hidden while it is open (as the item screen does). Top bar: a round 44px
  **Back** button (arrow-left, `--color-surface`, 1px `--color-border`,
  `aria-label="Back to <board name>"`), then "Completed" at `--text-xl` 700.
- **768px and up:** a centred modal as now, 560px wide, max height 85vh,
  `--color-bg` body, `--radius-lg`, `--shadow-strong`, over `--color-overlay`.
  Header: "Completed" at `--text-xl` 700 and a round 44px **Close** button (×
  icon, `aria-label="Close"`). Clicking the overlay closes it.
- The dialog keeps `role="dialog"`, `aria-modal="true"`, its focus trap, and
  Escape to close. Its accessible name becomes "Completed items on \<board
  name\>". Focus starts in the search field on desktop; on phone it starts on
  Back, so the keyboard does not cover the list on open.

The header, search and filters stay put; only the result list scrolls.

## Search

A pill field, the same as the board's search from 768px (#626):
`--radius-full`, 1px `--color-border-strong`, `--color-surface`, full width,
44px tall, search icon at the start. Placeholder **"Search titles and
notes"**. `aria-label="Search completed items"`.

- Matches an item when its title **or** description contains the trimmed text,
  case-insensitively. Typing filters on every keystroke; there is no debounce
  (a board's archive is hundreds of rows at most, all already in memory).
- When it has text, a round 44px clear button (× icon,
  `aria-label="Clear search"`) sits at its end. Clearing returns focus to the
  field.
- Escape in a non-empty field clears it; Escape in an empty field closes the
  dialog.

## Filters

Two rows of chips under the search, `--space-sm` apart, each with a small
heading at its start: `--text-xs` 600, `--color-text-secondary`, upper case
letter-spaced the way #624 heads its sections. Below 768px each row is one line
that scrolls sideways, edge to edge; from 768px they wrap.

**Completed** — Any time · Last 7 days · Last 30 days · This year · Custom

- Exactly one is on; Any time is on when the dialog opens. They are a
  single-choice group of `aria-pressed` buttons, as the board's due chips are.
- Dates are compared as **local calendar dates** of `completed_at`
  (`localYmdOf` in `utils/completed-date.ts`). Last 7 days is today and the six
  before it; Last 30 days, today and the 29 before it; This year, 1 January of
  the current local year to today.
- **Custom** shows a row beneath the chips: **From** and **To**, two native
  `type="date"` fields (44px tall, `--radius-md`, 1px `--color-border-strong`,
  labelled), side by side, `--space-sm` apart. Both start empty. Each is
  optional and inclusive: From alone is "on or after", To alone is "on or
  before", both blank filters nothing. Leaving Custom for another chip hides the
  fields and forgets their values.
- If To is before From, the fields keep their values, the To field gets
  `aria-invalid="true"` and a 1px `--color-danger` border, and a line under
  them reads **"To is before From"** (`--text-sm`, `--color-danger-text`,
  linked by `aria-describedby`). The date filter is ignored until it is fixed;
  the search and label filters still apply.

**Label** — one chip per label carried by at least one completed root item on
this board, in the board's label order (`boardLabels`), each starting with its
8px colour dot, as on the board.

- One at a time: pressing a chip turns it on, pressing another moves it,
  pressing the on chip turns it off. There is no "All" chip here — none on
  means every label.
- The row is computed from the **unfiltered** archive, so a chip never vanishes
  because another filter hid its items. A label deleted from the board but still
  on old items shows as a chip with the neutral dot `LabelBadge` already gives
  an unknown label.
- No completed item has a label: the Label row is not drawn.

## The count line

Under the filters, `--text-sm`, `--color-text-secondary`, `aria-live="polite"`:

- No filter on: **"148 completed"** ("1 completed" for one).
- Any filter on (search text, a date chip other than Any time, or a label):
  **"12 of 148 completed"**, then a text button **Clear filters**
  (`--color-primary`, 600, 44px hit area). It empties the search, sets Any
  time, clears Custom's fields and the label, and moves focus to the search
  field.

## Results

Grouped by the local month of `completed_at`, newest month first. Each group:

- A heading row: the month and year, **"October 2026"** (`--text-sm` 700,
  `--color-text-secondary`), and its count after it, **"· 9"**, in the same
  style. Headings are `<h3>`s; within the current year the year is still shown,
  so a heading never needs a second read.
- One `--color-surface` card, `--radius-lg`, rows separated by 1px
  `--color-border-light` hairlines (the #627 card pattern), `--space-md`
  between groups.

A row is a button, 44px minimum, padding `--space-sm` `--space-md`:

- Title, `--text-base` 600, up to two lines then ellipsis.
- Under it, one line: the completed date, absolute — **"Oct 14"**, or
  **"Oct 14, 2025"** outside the current year — in `--text-sm`
  `--color-text-secondary`, then the item's labels as `LabelBadge`s.
- Hover: `--state-hover` over the row. Focus: the standard ring, inset.
- `aria-label="<title>, completed <Oct 14>. Open item."`
- Pressing it opens the item (`selectItem`), as today. The dialog stays open
  beneath it with its filters intact, so Back / Close on the item returns to
  the same list.

Order within a group is `completed_at` newest first. An item with no
`completed_at` (old data) goes in a final group headed **"No completion
date"**; it passes Any time and fails every other date chip and any Custom
range with a bound.

The relative wording ("Completed 3 days ago") goes: this list is about months,
and "3 days ago" is not something it can contain beyond the first week.

## States

| State | Shows |
|---|---|
| Board has no completed items | No search or filters; the body says **"No completed items yet"** (`--text-base`, `--color-text-secondary`, centred, `--space-2xl` top padding) |
| Items, no filter on | Count "\<n\> completed", every group |
| Filtered, some match | "\<m\> of \<n\> completed · Clear filters", matching groups only; a month with no matches is not drawn |
| Filtered, none match | Count "0 of \<n\> completed · Clear filters"; body **"No completed items match"** and a secondary button **Clear filters** under it |
| Custom, To before From | Inline "To is before From", date filter ignored |

There is no loading or error state of its own: the dialog reads items already in
memory, and the 30-second poll updates it in place. An item completed or
reopened by the other person while the dialog is open appears or disappears on
the next poll; the filters stay as set.

## Lifetime of the filters

Held in component state, not signals or the URL. They survive opening an item
from the list and coming back; closing the dialog drops them, so it always
reopens on Any time, no label, empty search. Switching boards with Ctrl+1–9
while it is open closes it, as now.

## Implementation notes

- Put the filtering in a pure function, e.g. `filterCompleted(items, { text,
  range, label }, today)` in `utils/`, returning the grouped result. Passing
  `today` in is what makes the date boundaries unit-testable.
- The existing `.archive-*` rules are replaced, not layered on. Reuse
  `.filter-chip` / `.filter-chip-active` and the board search field's styles
  rather than copying them.

## New tokens

None.

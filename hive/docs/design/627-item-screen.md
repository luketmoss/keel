# 627 — The item screen in Thrive's look

The item detail (`components/board/card-detail.tsx`) keeps every capability and
regroups them the way Thrive's detail screens are built: a short header, the
status as a switch, one card of field rows separated by hairlines, a card for
subtasks, and a quiet footer.

Standing documents: none in `hive/docs/design/`. The suite language and the
Keel-wide rules apply. Chips, avatars and the overdue treatment are
[#624](624-today.md)'s and [#626](626-board-screen.md)'s; the shell is
[#623](623-tab-bar-and-rail.md). The subtask delete confirm is
[#448](448-subtask-delete-confirm.md), unchanged. Built on
[#452](452-interaction-states.md) and [#453](453-touch-targets.md).

## Where it opens

- **Below 768px:** a full-screen page over the current destination, the tab bar
  hidden while it is open (#623). Back returns to where it was opened from —
  Today with its day still selected, or the board with its column tab and
  scroll — and removes `?item=`.
- **768px and up:** the side panel as now, `--color-bg` behind its cards, with
  its expand / collapse control (expanded by default, as #233 decided) and a
  scrim over the page.

## Top bar

A row, `--space-sm` gap:

- **Back** (phone, arrow-left) or **Close** (desktop, ×): round 44px,
  `--color-surface`, 1px `--color-border`. Names "Back to \<Today | board
  name\>" / "Close".
- The board's 10px colour tile and "\<board name\> board", `--text-sm`
  secondary, filling the row.
- **Expand / Collapse** (desktop only), round 44px, as now.
- **⋮ Item options**, round 44px: a menu with **Move to board…** (the existing
  modal), **Copy** (the card's existing copy action), **Delete item…** (scrolls
  to and opens the delete confirm below).

## Title and description

- Title: `--figure-md` 700, editable in place exactly as now (click or Enter to
  edit, Escape cancels, blur saves).
- Description: `--text-base`, `--color-text-secondary`, editable as now; when
  empty, "Add a description" in `--color-text-muted`.

## Status switch

Replaces the arrow strip (`.status-pipeline`). A `role="radiogroup"` labelled
"Column": a track (`--color-border-light`, `--radius-lg`, 4px inset) holding one
segment per board column, in board order, each the column's name as spelled.

- Segment: 44px tall, `--radius-md`, `--text-sm` 600, `--color-text-secondary`.
  Hover: `--color-text`. Selected: `--color-surface` fill, `--shadow`, a 1px
  `--color-border` outline, `--color-text` 700, `aria-checked="true"`.
- Up to 4 columns share the width equally. More: segments size to their text and
  the track scrolls sideways; the selected one scrolls into view on open.
- Arrow keys move the selection (and the item), as a radiogroup does; choosing a
  segment moves the item with `moveItem`, so `completed_at` and the children
  cascade behave as they do now.

## Details card

`--color-surface`, `--radius-lg`, `--space-md` side padding. Rows separated by
1px `--color-border-light` hairlines, each at least 52px, label on the left in
`--text-sm` 600 `--color-text-secondary`, the current value in words on the
right in `--text-sm` 600 `--color-text`.

| Row | Value in words | Control |
|---|---|---|
| Owner | the owner's name, or "Unassigned" | below the label, a row of 44px avatar buttons (36px circles with initials, owner colours) for each owner, then "None" (a `--color-border-light` circle with a dash); the chosen one has a 2px `--color-primary` inner ring and `aria-pressed="true"`; each named "Owner: \<name\>" |
| Due | "Sun, Oct 25 · tomorrow", "Today", "Oct 22 · overdue" (in `--color-danger-text`), or "No date" | below, the existing quick chips restyled as filter chips: **Today**, **Tomorrow**, **Next week**, **No date**, then **Pick a date** (calendar icon) which opens the existing date input. The chip matching the current date is on |
| Labels | the applied labels' names joined with commas, or "None" | below, one chip per board label: dot + name, on when applied (fill `--color-text`, text `--color-bg`); pressing toggles it. Then the existing manage-labels control as a 44px gear button "Manage labels" |
| Completed | terminal items only: "Oct 24, 2026" in `--color-success` with a check icon | the existing completed-date editing, unchanged |
| Board | "Family" | a chevron; opens Move to board |

## Subtasks card

`--color-surface`, `--radius-lg`, `--space-md` padding.

- Heading row: "Subtasks" (`--text-lg` 700) and "2 of 3 done"
  (`--text-sm` muted). Beneath, a 6px bar, `--radius-full`, track
  `--color-border-light`, fill `--color-primary` to the done fraction.
- Rows, hairline-separated, at least 52px: the round check button from #624
  (named "Mark done: \<title\>"), the title (editable as now; done ones struck
  through in `--color-text-muted`), the subtask's date if it has one (calendar
  icon, `--text-sm`), the existing drag handle (desktop) and ⋮.
- The last row adds: a plus icon in `--color-primary` and a borderless field
  "Add a subtask" (visible label for screen readers: "Add a subtask"). Enter adds
  and keeps the field focused for the next; the existing date option stays.
- No subtasks: the heading reads "Subtasks" and "None yet", no bar, only the add
  row.
- Completed subtasks stay in order with the others, struck through; the
  "COMPLETED" divider goes.

## Footer

- "Added by Mom on Oct 18 · changed today" in `--text-xs` muted — `created_by`
  mapped to an Owners name (the email when none; "Unknown" when blank),
  `created_at`, `updated_at` as "today", "yesterday", or a date.
- **Delete item** — full-width secondary button: `--color-surface`, 1px
  `--color-danger` border, `--color-danger-text` text, trash icon and the words.
  Pressing it replaces the button, in place, with a confirm card: a 1px
  `--color-danger` border, `--radius-lg`, a trash icon and **Delete “Grocery
  shopping”?** in `--color-danger-text` 700, then "It comes off the Family board
  for everyone who shares it, and its 3 subtasks go with it." (the subtask
  clause only when there are some), then **Keep it** (secondary) and **Delete
  item** (fill `--color-danger-fill`, text `--color-on-fill`). Focus moves to Keep
  it. Escape or Keep it closes the confirm and returns focus to the Delete item
  button.
- The footer bar with "Move to board" and the red filled "Delete" goes.

## States

| State | Shows |
|---|---|
| Read-only role | no edit affordances (as now): status shows as text, chips not pressable, no add row, no Delete |
| Item deleted elsewhere while open | the existing "That item is no longer available" toast and close |
| Saving | optimistic, as now; on failure the value reverts with the existing error toast |
| Subtask open as the item | the same screen; the top bar's board line reads "\<board\> board · in \<parent title\>", a link to the parent |
| Demo mode | as now |

## Edge cases

- **A board with 6+ columns** — the status track scrolls; nothing wraps.
- **An owner no longer in Owners** — the Owner row's value shows the stored
  name; no avatar is selected; choosing one replaces it.
- **Rapid status taps** — each is a move; the last wins, as the arrow strip
  behaves now.
- **Long label sets** — the chip row wraps.

## Copy

"Back to Today", "Back to Family", "Close", "Expand panel", "Collapse panel",
"Item options", "Move to board…", "Copy", "Delete item…", "Add a description",
"Column", "Owner", "Unassigned", "None", "Due", "Today", "Tomorrow", "Next
week", "No date", "Pick a date", "overdue", "Labels", "Manage labels",
"Completed", "Board", "Subtasks", "2 of 3 done", "None yet", "Add a subtask",
"Added by Mom on Oct 18 · changed today", "Delete item", "Delete “\<title\>”?",
"It comes off the \<board\> board for everyone who shares it, and its \<n\>
subtasks go with it.", "Keep it".

## New tokens

| Token | Value | For |
|---|---|---|
| `--avatar-md` | 36px | owner choice circles (inside a 44px button) |

## Contrast

| Pair | Light | Dark |
|---|---|---|
| row labels `--color-text-secondary` on surface | 6.05 | 6.57 |
| segment text `--color-text-secondary` on the track `--color-border-light` | 5.02 | 5.77 |
| selected segment `--color-text` on `--color-surface` (raised in dark: `--color-surface-raised`) | 16.48 | 12.68 |
| "overdue" and the confirm heading `--color-danger-text` on surface | 6.57 | 5.85 |
| Delete item fill: `--color-on-fill` on `--color-danger-fill` (white on `#d32f2f`; `#121212` on `#ef5350`) | 4.98 | 5.37 |
| owner ring `--color-primary` on surface (3:1) | 5.91 | 9.63 |
| Completed `--color-success` on surface | 5.13 | 7.34 |
| muted footer on `--color-bg` (side panel) | 4.85 | 5.65 |

## As built

Decisions the build made where the note was silent or the codebase differed, and the
contrast it measured (`--color-*` resolved from `ui/tokens/suite.css` and `global.css`).

- **Next week** is the Monday after this one, the week boundary Today already uses.
- **Board tile** is `--color-primary`: a board has no colour of its own in the sheet.
- **Selected segment, dark:** `--color-surface-raised` is not a defined token, so the
  raised segment is `--color-surface` with `--shadow` and its 1px border.
- **Completed subtasks** keep their place in the one list: the "completed" divider is
  gone, so reorder (handle and touch) works across all rows, done ones included.
- **Add subtask** is always the last row. Enter adds and keeps the field focused; the
  check button adds too; Escape clears a draft, and with nothing typed closes the screen
  as it always did. Leaving the row with a title typed adds it, as before.
- **Escape** in the Item options menu closes the menu only.
- **Board row** shows only when there is another board to move to (as Move to board did).
- **Copy** is not offered for a subtask (it never was: only top-level cards had it).
- **Chips** reuse the board's `.filter-chip` for Due; label chips are `.label-toggle`
  restyled the same way, which also changes the create-item form's label picker.

### Contrast, measured

| Pair | Light | Dark |
|---|---|---|
| row labels `--color-text-secondary` on surface | 6.05 | 6.57 |
| segment text `--color-text-secondary` on the track `--color-border-light` | 5.02 | 5.77 |
| selected segment `--color-text` on `--color-surface` | 16.48 | 14.39 |
| "overdue" and the confirm heading `--color-danger-text` on surface | 6.57 | 5.85 |
| Delete item fill: `--color-on-fill` on `--color-danger-fill` | 4.98 | 5.37 |
| owner ring `--color-primary` on surface (3:1) | 5.91 | 9.63 |
| Completed `--color-success` on surface | 5.13 | 7.34 |
| footer muted `--color-text-muted` on `--color-bg` | 4.85 | 5.65 |
| applied chip `--color-bg` on `--color-text` | 14.70 | 15.54 |
| "None" avatar `--color-text-secondary` on `--color-border-light` | 5.02 | 5.77 |
| initials, white on the owner colours | 4.52 to 11.32 | (same colours) |

All pass 4.5:1 for text and 3:1 for the ring.

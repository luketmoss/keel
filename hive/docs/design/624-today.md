# 624 — Today: what's due, across boards

Today replaces Upcoming as Hive's home (#623 gives it the Today destination). It
answers one question, "what do I need to do?", across every board, by date, and
lets the answer be acted on in place: check off, move to today, add.

Standing documents: none in `hive/docs/design/`. The suite language and the
Keel-wide rules apply ([`suite-language.md`](../../../ui/docs/design/suite-language.md),
[`keel-wide-rules.md`](../../../ui/docs/design/keel-wide-rules.md)). The shell,
its tokens and its breakpoints are [#623](623-tab-bar-and-rail.md). Thrive's Day
screen (#485–#492) is the reference: its header, week strip, glance row and
cards are the shapes copied here.

## Definitions

Shared with the board and the Boards list (#625), computed once in
`state/board-store.ts` from `state/rules.ts`, never re-derived per component.

- **In scope** — items on accessible, non-archived boards that have a
  `due_date`: root items and subtasks alike.
- **Done** — in a column with `is_terminal`. **Open** — not done.
- **Started** — open, and not in its board's first column (lowest `sort_order`).
- **Me** — the Owners-sheet `name` whose `google_account` matches the signed-in
  email, the lookup the header uses for the display name today.
- **Today** — the local calendar date, as `todayStr()` gives it. The week starts
  Monday (`mondayOfWeek`), as Upcoming's did.
- **Selected day** — today on load; changes when a day in the strip is chosen.
  Not persisted.
- **Horizon** — the later of the selected day and today.

**Why subtasks appear as themselves.** A subtask with a date is the thing to
check off; showing its parent instead (Upcoming's rule) puts a row on Today that
cannot be completed from there. A subtask row says which item it belongs to.

## Layout, top to bottom

Phone: one column, `--space-md` page padding, the tab bar beneath. From 1024px:
the header, week strip and glance row span the width, then two columns: the
left (`flex: 3`) holds Overdue and Due, the right (`flex: 2`) In progress and Up
next. Between 768 and 1023px, one column with the rail.

### 1. Header

- Subline, `--text-sm` `--color-text-secondary`: "Sat, Oct 24 · Your items on
  3 boards" (Mine) or "· Everyone on 3 boards" (Everyone).
- Title, `--figure-lg` 700: "Today" when the selected day is today, otherwise the
  day ("Tue 20" on phone, "Tue, Oct 20" from 1024px).
- Right of the title: previous week and next week, round 44px icon buttons
  (`--color-surface`, 1px `--color-border`), chevron icons, labelled "Previous
  week" / "Next week". From 1024px a primary **New item** button follows them.
- Below: two filter chips, **Mine** and **Everyone** (Thrive's `.filter-chip`:
  outlined in `--color-border-strong`; on = filled `--color-text`, text
  `--color-bg`, `aria-pressed`). Absent when Me is unknown.

### 2. Week strip

Seven equal buttons, Monday to Sunday of the week shown. Each, on phone: the
weekday letter (`--text-sm`, secondary), the date (`--text-xl` 600, tabular),
and a row of up to 3 dots, one per in-scope item due that day: filled
`currentColor` for open, a 1.5px ring for done, open ones first. From 1024px each
is a card-like tile with "Mon", the date, and "2 open" / "all done" / "nothing
due" in words instead of dots.

- Today, not selected: the date in `--color-primary`.
- Selected: `--color-primary` fill, `--color-on-primary` text, `--radius-lg`,
  `aria-pressed="true"`.
- Accessible name: "Sat, Oct 24, 3 due" or "…, nothing due".
- Previous / next week move the strip by seven days and keep the selected day
  unchanged, even if it is now off-strip; tapping a day selects it.

### 3. Glance row

Three figures, centred, on the page (no card) on phone; one card from 1024px.

- **Centre** — a ring, `--ring-lg` across on phone (`--ring-md` from 1024px),
  12px track in `--color-border-light`, arc in `--color-primary` from 12 o'clock
  clockwise, proportional to done ÷ due on the selected day. Inside: the number of
  **open** items due on the selected day at `--figure-xl` 700, then "left today"
  / "left Tue 20" (`--text-sm` 600), then "1 of 4 done" (`--text-xs`, secondary).
  - All due items done: a `--color-success` check replaces the number; "All
    done"; "4 of 4 done".
  - Nothing due: the track only; "Nothing due"; the day ("today").
- **Left** — a warning-triangle icon over the **overdue** count (open, due before
  today, regardless of selected day) at `--figure-md` 700 in
  `--color-danger-text`, word "overdue". Zero shows "0", in `--color-text`: a
  real zero, not a missing value.
- **Right** — a clock icon (`--color-primary`) over the count of open items due
  after the horizon through Sunday of the **current** week, word "more this
  week".

No percentage anywhere. The ring is the only proportion and carries no number
of its own.

### 4. Overdue card

Shown only when the overdue count is above 0. `--color-surface`, `--radius-lg`,
`--space-md` padding. Heading row: warning icon in `--color-danger-text`,
"Overdue" (`--text-lg` 700), "2 items" muted.

One block per overdue item, oldest due first, each in a dashed 1px
`--color-border-strong` box (`--radius-md`) — Thrive's treatment for a planned
item that slipped:

- Left: the due weekday in `--color-primary` (`--text-xs` 700, upper case) over
  the day number (`--text-xl` 700).
- Middle: title (`--text-base` 600, a link to the item), meta (`--text-sm`
  secondary): "Kiddo · Family" — owner, board; "in Grocery shopping" for a
  subtask; "Unassigned" when no owner.
- Right: an **OVERDUE** pill — `--text-xs` 700, letter-spaced,
  `--color-danger-text` on `--color-surface`, dashed 1px `--color-danger` border,
  `--radius-full`.
- Below: two buttons (Thrive's secondary: `--color-surface`, 1px
  `--color-border-strong`, `--radius-md`, 600, 44px tall): **Move to today** and
  **Mark done** (check icon).

### 5. Due card

Heading: calendar icon (`--color-primary`), "Due today" or "Due Tue 20", meta "1
done · 3 open". Rows separated by hairlines (`--color-border-light`), each at
least 56px:

- A check button, 44px target around a 24px circle: open = 2px
  `--color-border-strong` ring; done = `--color-success` fill with a
  `--color-surface` check. Name: "Mark done: <title>" / "Mark not done: <title>",
  `aria-pressed`.
- Title (600) and meta as above, both a link to the item. Done: title struck
  through in `--color-text-muted`.
- The owner's initials avatar, 28px (`--avatar-sm`), in their owner colour.

Order: open first, by board order then `sort_order`; done after, by completion.
Empty: "Nothing due Tue, Oct 20." in `--text-sm` muted, no rows.

### 6. In progress card

Shown when any started item is due after the horizon. Heading: arrow icon, "In
progress", meta "2 started · due later". Rows as the Due card's but without a
check button (starting and finishing happen on the board or the item), meta adds
the due date: "Dad · Family · due Oct 31". Soonest due first, up to 5.

### 7. Up next

Heading on the page, `--text-base` 600 secondary, "Up next", meta "5 coming up".

- Phone: a horizontal scroller of dashed cards (`--color-surface`, 1px dashed
  `--color-border-strong`, `--radius-md`), 168px wide, `--space-sm` apart, the
  row bleeding to the screen edges. Each: when (`--text-xs` 700 `--color-primary`:
  "TOMORROW", "TUE 27", "SUN, NOV 2" past this week), title (600), owner · board.
- From 1024px: a card with the items as a list grouped under those same when
  headings.

The next 5 open in-scope items due after the horizon, soonest first. None: the
heading's meta reads "Nothing dated after today" and nothing else shows.

### 8. Add

Phone: Thrive's FAB (56px circle, `--color-primary` fill, `--color-on-primary`
plus) `--space-md` above the tab bar, labelled "New item". From 1024px: the
header's **New item** button. `N` opens it too.

Opens the existing create form with `createModalInitialDueDate` set to the
selected day and a new **Board** field: one chip per accessible board (colour
square and name), defaulting to the most recently opened board. The created
item goes into that board's first column. If its date is in the shown week it
appears at once.

## Actions and feedback

All moves use the existing `moveItem` (which applies `applyStatusSideEffects`, so
`completed_at` is stamped and cleared as on the board) and `updateItem`.

| Action | Change | Toast |
|---|---|---|
| Check (open) / Mark done | to the item's board's first terminal column | "“<title>” marked done" · Undo |
| Uncheck (done) | to the item's board's first column | "“<title>” reopened" · Undo |
| Move to today | `due_date` = today | "“<title>” moved to today" · Undo |

Undo puts back the previous column (or date) exactly, through the same calls. The
row updates at once, optimistically, as the board does; on a failed write the
change reverts and the existing error toast shows. A rapid second tap on the
same check acts on the new state; each tap is its own change and its own toast,
and Undo undoes only the last.

## States

| State | Shows |
|---|---|
| Loading | the app's loading screen (#623) |
| No boards | header and strip; glance shows "Nothing due"; a muted line "No boards yet." and a New board button (the create-board flow) in place of the cards |
| Nothing dated at all | as above but "Nothing has a due date yet. Dates you add appear here." |
| Mine with nothing of mine | the same empty states, worded for you: "Nothing of yours due today." |
| A poll brings changes | lists update in place; the selected day and scroll position stay |
| Item open | the item screen; closing returns to Today with the same day selected |
| Demo mode | demo data, which already uses relative dates: at least one overdue, one due today, one started and due later, and Up next items (adjust `mock-data.ts` if not) |

## Edge cases

- **A selected day in the past.** The Due card lists that day's items; open ones
  there are also in Overdue, which is expected — Overdue is about now.
- **An item due today in a started column.** It is in Due, not In progress (In
  progress only covers after the horizon), so nothing appears twice except an
  overdue item viewed on its past day.
- **A board with no terminal column.** Its items show no check button and no
  Mark done; Move to today still works.
- **Undo after a poll replaced the item.** Undo applies to the current row by id;
  if the item is gone, the toast's Undo does nothing and an error toast says
  "That item is no longer available".
- **Very long titles.** Wrap to two lines, then ellipsis.
- **Mine/Everyone** is stored in `localStorage` as `hive-today-who`; unavailable
  storage means Mine every load.

## Copy

"Today", "Mine", "Everyone", "Previous week", "Next week", "New item", "left
today", "left Tue 20", "1 of 4 done", "All done", "Nothing due", "overdue", "more
this week", "Overdue", "2 items", "OVERDUE", "Move to today", "Mark done", "Due
today", "Due Tue 20", "1 done · 3 open", "Nothing due Tue, Oct 20.", "In
progress", "2 started · due later", "Up next", "5 coming up", "TOMORROW",
"Unassigned", "in Grocery shopping", "Board", toasts as in the table.

## What goes

`components/upcoming/` (view and board badge), `upcomingBuckets`,
`upcomingFilterSearch`, `upcomingFilterLabel`, `upcomingFilterBoards` and their
tests, and the `--color-bucket-*` tokens.

## New tokens

In `hive/frontend/src/global.css`:

| Token | Value | For |
|---|---|---|
| `--figure-xl` | 2.75rem | the glance centre number; Thrive's value |
| `--ring-lg` | 140px | the glance ring on phone |
| `--ring-md` | 96px | the glance ring from 1024px |
| `--avatar-sm` | 28px | row avatars here and on cards (#626) |

`--figure-md`, `--figure-lg` and `--icon-md` come from #623.

## Contrast

| Pair | Light | Dark |
|---|---|---|
| muted meta on `--color-surface` | 5.44 | 5.23 |
| muted heading meta on `--color-bg` | 4.85 | 5.65 |
| overdue figure and pill `--color-danger-text` on `--color-surface` | 6.57 | 5.85 |
| the same on `--color-bg` (glance row) | 5.86 | 6.31 |
| selected day `--color-on-primary` on `--color-primary` | 5.91 | 9.15 |
| primary weekday / when labels on `--color-surface` | 5.91 | 9.63 |
| chip on: `--color-bg` on `--color-text` | 14.70 | 15.54 |
| chip and check outline `--color-border-strong` (3:1 needed) | 3.83 surface, 3.41 page | 3.95 surface |
| ring arc `--color-primary` on `--color-bg` (3:1) | 5.27 | 10.40 |
| done check `--color-success` on `--color-surface` (3:1) | 5.13 | 7.34 |

# 466 — Every column offers sort-by options

The sort-by select (Custom, Due date, Created) is built and styled, but a column
renders it only when it has a stored sort mode, so on a fresh browser no open
column shows it. This note makes it a property of the column, not of the
storage: every open column of the board view has it.

Standing documents: none in `hive/docs/design/` yet. The Keel-wide rules
([`keel-wide-rules.md`](../../../ui/docs/design/keel-wide-rules.md)) and the
touch-target and interaction-state notes ([#453](453-touch-targets.md),
[#452](452-interaction-states.md)) apply to the control; they are built.
Specified against Hive's code as it stands on `main`.

## Why it is missing

`Column` renders the select when `sortMode !== undefined`. `columnSortModes` is
filled once, by `loadColumnSortModes()` at import, while `statuses` is empty, so
only a column with a value already in `localStorage` gets a mode. A column the
user has never sorted has none, so it has no control, so it can never be sorted.
The board itself treats a missing mode as Custom (`columns` uses `|| 'custom'`),
so the control and the board disagree about what "no mode" means. This note
settles it: no mode is Custom.

## The main path

1. The board loads. Each open column's header shows, after its count and the
   add button, a select reading **Custom**.
2. The person picks **Due date** or **Created**. The column re-sorts at once,
   the select takes the active style it already has for those modes, and the
   choice is stored for that column, as today.
3. After a reload the column is still in that order, and the select shows it.
4. Picking **Custom** returns to manual order, as today.

## States

| Column | Control |
|---|---|
| Open, no stored choice | the select, on **Custom** |
| Open, stored Due date or Created | the select on that value, in its active style, as today |
| Open, added after the page loaded | the select, on **Custom** |
| The terminal column | the disabled "Completion date" select, unchanged |
| Compact (swimlane) view | no control, unchanged |
| Storage unavailable | the select works for the session and the choice is lost on reload, as today |

## Edge cases

- **A board with one column or many.** Every open column gets its own control
  and its own stored choice, keyed by the column's name as now.
- **A column renamed.** Its stored choice was keyed by the old name, so it reads
  as no choice, on Custom. That is the existing behaviour and is not changed
  here.
- **Dragging an item into a date-sorted column** still offers to switch that
  column to Custom, as it does today.
- **Narrow screens.** The header already holds the select for the columns that
  had one; at 375px the header wraps the way it does for them. The control keeps
  its 44px box (#453).

## Copy

Unchanged: the options are "Custom", "Due date" and "Created"; the accessible
name is "Sort <column> column"; the announcement after a change is
"<column> column: sorted by <mode>".

## New tokens

None.

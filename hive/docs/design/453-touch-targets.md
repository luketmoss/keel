# 453 — 44px touch targets, on every viewport

Every control in Hive is a box at least 44px wide and 44px tall, on a mouse as
well as a finger. Hive's own CLAUDE.md already says "touch targets 44 x 44px";
the stylesheet mostly keeps it at 768px and under and not above, and a lot of it
not at all.

Standing documents this answers to: the Keel-wide rules
([`keel-wide-rules.md`](../../../ui/docs/design/keel-wide-rules.md)) — the floor
is 40px for controls and 44px for rows, and a language may raise it, which the
suite language does ("touch targets are at least 44px for everything",
[`suite-language.md`](../../../ui/docs/design/suite-language.md)). The rule's
check is the one used here: the rendered size of the control, "not the size of
its glyph", with padding to make up the difference. It builds after #452, whose
families table it reuses, and is specified against Hive's code as it stands today;
the move into Keel is behaviour-identical.

## Decisions

- **Desktop pointers too.** The user decided it; hive#281 also measured the
  failures at 1280px. There is no `(pointer: coarse)` or `max-width: 768px`
  carve-out for the floor. Media queries may still size things *larger* on
  phones.
- **The box is the target.** A control passes when its own
  `getBoundingClientRect()` is at least 44 x 44 (rows: at least 44 tall, as wide
  as the content). A pseudo-element hit area does not count, because it cannot be
  measured and because the Keel-wide check is the rendered size.
- **A small glyph stays small.** A 24px kebab keeps its 16px dots; a 28px swatch
  keeps its 28px circle. The box grows around it with padding, and for a control
  that *is* its drawn shape (swatches, dots) the shape is drawn inside the
  box with `background-clip: content-box` or an inner element.
- **No two targets overlap.** Neighbouring 44px boxes touch at most; the one
  pattern Hive already uses on purpose (`.check-icon`'s `margin: -8px 0`) is the
  model.
- **One recorded exception, the pager dots.** See below.

## What is wrong today

From source: for each interactive class the TSX renders, the rule that sets its
size (`width`, `height`, `min-*`, `padding`, `font-size`, and the 1.5 line height
inherited from `body`), with the phone rules at 768px and under read separately.
"About" means computed from padding plus line height, not declared. The browser
has not been run; `/test` measures the real boxes with `getBoundingClientRect()`
in demo mode at 375px and 1280px, as the web stack skill says.

**#119's premise is stale.** Its 13 x 13px sub-task checkbox is already fixed:
`.check-icon` is a 44 x 44 button around the 22px box. It is in the table as
passing.

### Under 44 on a desktop pointer

| Class | Desktop | At 768px and under | Fix |
|---|---|---|---|
| `.btn-sm` (20 uses) | 28 tall (the later rule beats the first) | 28 | 44 tall, min-width 44 |
| `.btn-icon` | 24 x 24 (`.column-settings-row`: about 20 x 20) | 24 | 44 x 44, glyph unchanged |
| `.kebab-trigger` | 24 x 24 | 24 | 44 x 44, below |
| `.subtask-action-btn`, `.date-clear-btn` | 28; about 24 | 44 | 44 |
| `.staged-subtask-remove` | 28 x 28 | 28 | 44 x 44 |
| `.subtask-kebab-btn` | 32 x 32 | 44 | 44 x 44 |
| `.subtask-date-inline`, `.subtask-date-add-inline` | 24 tall | 24 | 44 tall, below |
| `.subtask-handle` | 32 x 32 | 44 | 44 x 44 |
| `.due-clear-btn`, `.label-gear-btn` | 32 x 32 | 32 | 44 x 44 |
| `.archive-search-clear`, `.filter-search-clear` | 24 x 24; 20 x 20 | same | 44 x 44, inside the field, below |
| `.column-add-btn` | 28 x 28 | 28 | 44 x 44 |
| `.control-bar-chip-remove` | 16 x 16 | 16 | 44 x 44, below |
| `.column-settings-swatch`, `.column-color-swatch` | 20; 24 | 20; 24 | 44 box, shape unchanged |
| `.color-swatch`, `.icon-swatch` | 28, 32; 36 | same | 44 box, shape unchanged |
| `.share-remove-btn` | 32 x 32 | 32 | 44 x 44 |
| `.column-settings-delete-btn` | about 22 x 22 | same | 44 x 44 |
| `.column-sort-select` | 24 tall | 24 | 44 tall |
| `.board-switcher-select` | 36 tall | 44 | 44 |
| `.user-dropdown-trigger` | 36 tall | 44 x 44 | 44 |
| `.filter-chip` (all three) | about 28 tall | 44 | 44 |
| `.label-toggle` | about 32 tall | about 32 | 44 |
| `.label-new-pill` | 32 tall | 32 | 44 |
| `.view-toggle-btn` | about 33 tall | about 33 | 44 |
| `.view-tab` | about 28 tall (inside a 44px header) | same | 44, below |
| `.status-chevron` | 40 tall | 40 | 44 |
| `.editable-value` | 38 tall | 38 | 44 |
| `.overflow-menu-item`, `.user-dropdown-edit-profile`, `.user-dropdown-signout`, `.subtask-context-menu button`, `.kebab-item` | about 37; about 37; about 37; about 37; about 31 | 44 for the two user-menu items only | 44 tall each |
| `.column-add-row` | about 38 | same | 44 |
| `.column-archive-link` | about 18 | same | 44 |
| `.toast-action` | about 26 | same | 44 |
| `.settings-tab` | about 36 | same | 44 |
| `.subtask-title` (the click-to-edit text) | about 20 | same | the row is the target: 44 |
| `.theme-toggle-btn` | 32 | 44 tall, 27 to 35 wide | 44 x 44 (hive#290) |
| `.due-date-btn` | 40 tall | 40 | 44 (hive#281) |
| the form fields: `.filter-search-input`, `.subtask-add-input`, `.subtask-add-date`, `.label-form-input`, `.column-settings-*-input`, `.archive-search-input`, `.profile-email-input` | about 28 to 42 | some 44 | 44 tall |
| `.column-indicator-dot` | 8 x 8 (phone only) | 8 x 8 | 44 x 44, below |

### Already 44 or more

`.btn` (48 x 44), `.login-btn`, `.fab` (56), `.check-icon` (44 x 44),
`.subtask-add-circle` (44), `.share-btn` (44),
`.filter-toggle`, `.filter-popup-close`, `.filter-popup-reset`,
`.filter-popup-apply`, `.label-settings-action-btn`, `.archive-item` and the
form-field inputs in the create modal (48). The test passes these and keeps them
passing.

## What hive#281 and #290 will have fixed

Both are open in `luketmoss/hive` and are done before the move (the plan's P1).
This issue does not redo them and its test asserts the result:

- **hive#281:** the detail panel's due-date button at least 44 tall with an
  accessible name containing "Due date", and the hidden `input[type=date]` out of
  the tab order (`tabindex="-1"`, `aria-hidden="true"`). The row above lists
  `.due-date-btn` for that reason; if #281 has not shipped when this is built, it
  falls into this issue.
- **hive#290:** the three theme buttons at least 44 x 44 at every breakpoint,
  without the dropdown overflowing 375px. Its open question, icons with tooltips
  or labels, is decided there.

**Not covered by either, and in scope here: the sub-task date buttons.**
hive#281's refinement found `.subtask-date-inline` and `.subtask-date-add-inline`
are 24px tall and left them for this epic, because fixing them reflows the whole
sub-task row. #281 also left open whether the sub-task's hidden date input
(`SubtaskDateInline`) gets the same tab-order fix; this issue gives it one if #281
did not, since the pattern is the same.

## The sub-task row

Today a row is a 48px minimum (`min-height: 48px`, `padding: 10px 4px`) holding,
left to right: the 32px grab handle, the 44px checkbox button, a content column
(the title, with the date button under it), and the 32px options button. The date
buttons sit under the title, `align-self: flex-start`, 24px tall.

At 44px the date button is taller than the gap it sits in. The decision: **the
date button grows to 44px tall and stays under the title**, so a row with a date is
the title's height plus 44 plus its padding, about 92px for a one-line title,
where it is about 60 today. A row without a date shows the dashed "add date"
button, also 44, so rows do not jump when a date is added. The alternative
(moving the date to the right of the title, beside the options button) was
rejected: at 375px the title would lose about 100px of width.

To keep the row from feeling twice as tall, the visible chip stays the size it is
(a 12px label in a 24px pill) and the extra height is padding inside the 44px
box, with the box's vertical margin pulled in by the same amount as
`.check-icon` does (`margin: -8px 0`), so its neighbours are not pushed apart.

The same applies to the handle (44 wide x 44 tall, 16px grip), the checkbox
(already so) and the options button (44).

## The card

The card's kebab sits at the card's top-right, `top: 8px; right: 8px`, 24px. At
44 it moves to `top: 0; right: 0`, so its centre is 22px from each edge instead
of 20, and it does not extend past the card. The card title is a block spanning
the card's width, so it would run under the button: the title gets right padding
of the box's overlap (32px), always, whether or not the kebab is showing, so
titles do not rewrap when a card is hovered. **This visibly rewraps card titles**
(each loses about 32px of line width); that is the cost of a 44px target in a
12px-padded card.

## Controls inside other controls

- **The clear (x) buttons inside search fields** are 44 x 44, and sit inside a
  field that is itself 44 tall, so the button fills the field's right end. The
  field's right padding becomes 44 so the text stops before it.
- **The remove (x) on a filter chip** (`.control-bar-chip-remove`, 16px) is 44 x
  44 and extends the chip: the chip becomes 44 tall with the x as a full-height
  end. Chips in the active-filters bar get taller (about 24 to 44), and the bar
  grows with them.
- **The view tabs** sit in the 44px board header, in a strip with 2px padding. The
  strip's padding goes, so each tab is 44 in a 44 header; the strip's visible
  background stays.

## Menus

Menu rows (`.overflow-menu-item`, the user menu's two items, the sub-task context
menu, `.kebab-item`) are 44 tall, as wide as the menu. The menus lengthen; nothing
else changes. Where a menu now runs off the viewport, its existing placement
rules apply.

## The pager dots: the one exception

`.column-indicator-dot` is an 8px dot, the phone's "which column am I on"
indicator, a `<button>` per column in a row that shares its line with the column's
name. Forty-four-wide boxes do not fit when a board has many columns: a board with
more than six columns at 375px overflows the line.

Decision: the dots are **44 tall always, and 44 wide when the row has room**. When
it does not, their width shrinks evenly, but never below 24px (the WCAG 2.5.8
floor), with the 8px dot centred in each. The default board has three columns, so
it is 44 x 44 in the usual case. This is the only control allowed under 44, and
the test names it and its floor.

## What building it added

Measuring the running app, in demo mode at 375px and 1280px, found controls the
tables above missed. Each is decided here:

- **`.card-title`** is a `<button>` 21px tall. It is a 44px box now, with its margins
  pulled in (`-12px` above, `-4px` below) so a card does not grow, and its text
  centred in the box.
- **Native checkboxes and radios** (Sharing's "Share with all Owners", the delete-board
  and move-to-board choices) were 18px. They are drawn by Hive now, a 20px box inside
  the 44px input (`appearance: none` and a pseudo-element), in the primary colour
  when checked.
- **`.label-new-pill`** (a 41px-wide round "+"), **`.column-settings-name`** (short
  names were under 44 wide) and **`.column-settings-terminal-toggle`** (a 20px label
  around a hidden checkbox) are 44 wide and tall.
- **`.subtask-title`** (the click-to-edit text) is a 44px row, which is what makes a
  sub-task with a date about 116px tall rather than the 92 estimated above; the
  estimate counted the title at one line of text.

The measured smallest box on every screen at both widths is 44 x 44. The exception
is the pager dots, 44 x 44 with three columns.

## Fields

Text inputs, selects and date inputs are 44 tall (`min-height: 44px`), as the
create modal's already are (48) and the phone rules already do for several. The
font stays 16px on phones, which stops iOS zooming on focus, and stays 12 to 14px
on desktop.

## Edge cases

- **Rows with a long title** grow, never shrink below 44.
- **A control that is `display: none`** at some widths (`.filter-toggle` above
  768px, `.detail-expand-btn` below) is not measured there.
- **Disabled controls** keep their size.
- **Zoom and large text:** `min-height` and `min-width`, never fixed `height`, so
  text that grows pushes the box and the box never clips it.
- **Overlap:** the test checks that no two sibling controls' boxes intersect.
- **Hidden-until-hover** (`.kebab-trigger`): measured when shown; its box is its
  size whether or not it is visible, so the title padding above holds.
- **Drag and drop:** the grab handle's larger box does not change what starts a
  drag; the whole row stays a drop target.

## Tests

- A CSS test reads the stylesheet and, for each class in the tables above, checks
  that the declared `min-width`/`min-height` (or `width`/`height`) at the base rule,
  and at each media rule that changes it, is at least 44, except the named pager
  dot floor of 24 wide. A class the TSX renders that is in neither table fails.
- `/test` measures `getBoundingClientRect()` for every control on the board, the
  detail panel (with a sub-task and a dated sub-task), the menus, the create modal
  and the settings, at 375px and 1280px in demo mode, and records the smallest.
- The existing `btn-touch-target.test.ts` and `filter-toggle-touch-target.test.ts`
  keep passing and are folded into the new one.

## Copy

None.

## New tokens

| Token | Value | For |
|---|---|---|
| `--touch-target` | `44px` | the floor, used by every `min-width` and `min-height` above, so it is one number that can be changed in one place |

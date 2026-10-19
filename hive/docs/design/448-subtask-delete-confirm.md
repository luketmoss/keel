# 448 — Deleting a sub-task asks in the app, not in the browser

The last `confirm()` in Hive is in `card-detail.tsx`'s `handleDeleteSubtask`:
`confirm("Delete sub-task '<title>'?")`. It becomes an inline confirm that
replaces the sub-task's row, in the way Hive's other confirms replace theirs.

Standing documents this answers to: the Keel-wide rules
([`keel-wide-rules.md`](../../../ui/docs/design/keel-wide-rules.md)) — a
destructive action asks first, names the thing, and its confirming control is a
verb phrase; never the browser's `confirm()` — and the suite language
([`suite-language.md`](../../../ui/docs/design/suite-language.md)) for words and
tokens. Thrive's equivalent is #403; the decisions that differ from it are
marked. Specified against Hive's code today (`luketmoss/hive`); the move into
Keel is behaviour-identical.

## What Hive's other delete flows do

Read from source:

| Flow | Confirms with | Undo |
|---|---|---|
| Delete an item (detail footer) | inline in the footer: "Are you sure?", Cancel, Delete | none |
| Delete a label (settings) | the row is replaced by a message and Cancel / Delete; the message counts the items using it | none |
| Delete a label (picker) | the chip is replaced by "Remove label from all items?" | none |
| Delete a column | the row is replaced by a prompt naming it | none |
| Delete a board | a modal naming the board | none |
| Delete an item (card kebab) | **none** — optimistic removal and a 10 s "Item deleted" toast with Undo (and the `U` key), committed afterwards (hive#277 keeps the poll from bringing it back) | yes |

Hive's idiom is therefore **replace in place, with Cancel first**; undo is used
where there is no confirm, never alongside one. The sub-task follows the
first. Putting an undo window behind a confirm would ask twice and promise "can't
be undone" and "Undo" about the same click, so it is not added; the existing
"Sub-task deleted" toast stays. (This is the decision most likely to be
reversed: adding the kebab's undo here would be the alternative.)

Two things in those flows do not meet the Keel-wide rule: their buttons say a
bare "Delete" or "Remove", and "Are you sure?" names nothing. They are not
changed here; this confirm is written to the rule, and the others are a
follow-up.

## The main path

1. In a sub-task row, the person opens its options menu (the ⋮ button) and
   taps **Delete**. The menu closes.
2. The row is replaced by the confirm. **Focus moves to Cancel**, the safe
   choice.
3. They tap **Delete sub-task**. The confirm goes, the row is removed
   optimistically as `deleteSubtask` does today, and the toast reads
   "Sub-task deleted".
4. Focus goes to the "Add sub-task" button, which always exists in the panel.

"Turn into item" in the same menu is not destructive (the item is created
first) and does not confirm. It is unchanged.

## The confirm

Replaces the whole `<li class="subtask-item">` content, so there is nothing to
tap on the row except its two buttons:

```
Delete sub-task "Buy milk"?
This cannot be undone.
                         [ Cancel ]  [ Delete sub-task ]
```

| Part | Spec |
|---|---|
| Title | `Delete sub-task "<title>"?` — straight double quotes, as the board delete does. `--text-sm`, weight 600, `--color-text`. Wraps; an unbroken title breaks anywhere (`overflow-wrap: anywhere`). The title is the point, so it is never truncated |
| Message | `This cannot be undone.` — Hive says "cannot". `--text-sm`, `--color-text-secondary` |
| Cancel | `.btn .btn-ghost`, label **Cancel**, first in order and in focus order |
| Confirm | `.btn .btn-danger`, label **Delete sub-task**: a verb phrase naming the thing, in Hive's sentence case. Not "Delete", not "OK" |
| Container | the look of `.label-settings-delete-confirm`: `--color-surface-raised`, a 1px `--color-border`, `--radius`, `--space-md` padding |
| Actions | one row, right-aligned, `--space-sm` apart; they wrap onto two lines rather than shrink |

The buttons are plain `.btn` (48px tall, 44px wide at least), not `.btn-sm`,
which Hive renders at 28px. A title that is blank shows "Delete this sub-task?"
instead. Colour is not the only signal: the title and the button both say Delete.

## States

| State | What is shown |
|---|---|
| Closed | the normal row |
| Confirming | the confirm above, and the rest of the list unchanged |
| Confirmed | the row gone at once; "Sub-task deleted" toast, 4 s |
| Cancelled | the normal row; focus back on that row's ⋮ button |
| The delete fails | as today: the row returns and the toast says "Failed to delete sub-task: …"; the confirm does not reopen |

## Edge cases

- **One at a time.** The state is the id of the sub-task being confirmed, held
  by the detail panel, so opening another sub-task's confirm replaces the first.
- **Escape** cancels the confirm and nothing else. It stops propagating, as the
  item delete's inline confirm does, so the panel stays open. Tab stays in the
  panel as it does now.
- **Tapping elsewhere** does not cancel; only Cancel and Escape do.
- **The sub-task disappears while confirming** (the 30 s poll sees it deleted
  elsewhere): the row and its confirm vanish with it.
- **The title changes while confirming** (edited elsewhere): the prompt shows
  the current title.
- **The panel closes or shows another item**: the confirm state is dropped.
- **Rapid double tap on Delete sub-task:** the first tap removes the row; the
  second has no target.
- **Offline or an expired session:** unchanged — the same toast as today.
- **A done sub-task** confirms identically. The context menu, long-press and
  right-click all reach the same Delete.
- **No token** (`!token`): the handler returns first, as now; nothing opens.

## Transitions

None new. The row swaps for the confirm without animation.

## Tests

- No `confirm` stub is needed in the existing suite: nothing stubs it for
  sub-tasks today (the item delete's test only spies that it is *not* called).
- New: Delete in the menu shows the confirm with the title and copy above and
  Cancel focused; Cancel, Escape and a second row's confirm behave per the
  table; confirming calls `deleteSubtask` once; `window.confirm` is never
  called; and a scan fails if `confirm(` appears in any non-test file under
  `frontend/src`.

## Copy

All strings are in the table above, plus the existing toasts "Sub-task deleted"
and "Failed to delete sub-task: …".

## New tokens

None. A `.subtask-delete-confirm` class is added to `global.css` using existing
tokens.

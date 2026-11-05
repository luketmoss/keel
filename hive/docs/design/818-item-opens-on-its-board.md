# 818 — An item opens on its own board

Opening an item makes its board the active one, wherever it was opened from. The
item screen ([#627](627-item-screen.md)) then shows that board's labels, columns
and done state, and writes to that board. Nothing on screen is new: no layout,
copy or token changes. This note covers when the active board changes, and what
follows from that.

Standing documents: none in `hive/docs/design/`. Today is
[#624](624-today.md), Boards and its remembered board is
[#625](625-boards-list.md), and the deep-link rule this copies is
luketmoss/hive#240 AC5.

## The main path

1. Today is showing. The active board is A, the last board opened.
2. The person taps an item on board B.
3. B becomes the active board. Today stays the destination: the address is
   `?view=today&item=<id>`, with no `board` parameter. On a phone the item screen
   opens full-screen over Today; from 768px it opens as the side panel over
   Today. Both are unchanged.
4. Every part of the item screen reads B: the label chips, the label manager,
   the column switch, the Completed row, subtask ticks, Add a subtask, Promote to
   item, and Move to board's list.
5. Back or Close returns to Today with its day still selected. B stays the
   active board.

## When the active board changes

- **The item is on another board:** the active board becomes the item's board,
  as state only. The view, the destination and Today's selected day stay as
  they are. This is exactly what an `?item=` link already does on load.
- **The item is already on the active board:** nothing changes. Filters,
  grouping and the column tab are left alone. This is every item opened from a
  board.
- **Boards is showing a board and the item is on another one:** the board
  showing and the `board` parameter follow the item, as the deep link does.
  Nothing on a board opens an item from another board, so this is a safeguard,
  not a path anyone takes.
- **The item is not in the loaded items** (deleted by the other person since the
  last poll): the active board is left as it was, and selection behaves as it
  does now.

## Decisions

**Returning to Boards resets the remembered board's filters.** After an item on
B is opened from Today, the Boards tab restores what Boards last showed, board A.
Because A is no longer the active board, it is entered fresh: its label chip,
search, Due chip, grouping and column tab reset, as they do whenever someone
switches boards. The alternative was putting A back when the item closes. That
was rejected because an item closes in several ways (Back, Close, Escape, the
browser's back, Delete, navigating away), and missing one leaves the screens
disagreeing again, which is this bug. Filters set on a board, then a trip to
Today and into another board's item, then a return to the board is a rare path,
and losing the filters there costs one tap.

**Today's + defaults to the last item's board.** The create modal starts on the
active board, so after an item on B is opened from Today, + on Today offers B. It
already does this after an `?item=` link, and when a board is picked in the
modal itself. The board picker in the modal changes it in one tap.

## Edge cases

- **Two items in a row from Today on different boards:** the active board follows
  each one. The second item screen shows only its own board's labels and
  columns.
- **A subtask's parent link** (the "in \<parent\>" line): the parent is on the
  same board, so the active board does not change.
- **Copy:** the copy is on the item's board and opens in place. The active board
  is already that board.
- **Move to board from an item opened on Today:** the list is every accessible
  board except the item's own, including the one last opened. After the move,
  behaviour is unchanged from a move started on a board.
- **The 30-second poll** does not change the active board, so an open item screen
  keeps its board between polls.
- **Archived boards:** Today lists only items on accessible, unarchived boards,
  so an item from Today is never on an archived board.

## States

No new states. Loading, error and empty are the item screen's own (#627). Before
the first load, `items` is empty, nothing can be tapped, and the active board is
whatever load resolved.

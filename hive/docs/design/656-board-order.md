# 656 — Reorder boards in the desktop rail

The full desktop rail ([#623](623-tab-bar-and-rail.md)) lists boards under
BOARDS. This makes that list reorderable, and makes its order *the* board
order: the Boards list ([#625](625-boards-list.md)), Ctrl+1–9 and Today's
tie-break all read it.

Standing documents: none in `hive/docs/design/`. Suite language and the
Keel-wide rules apply. Drag and drop is native HTML5, per the project's UX
decisions; no library.

## Where it lives

- Surface: `.rail-board-list` rows in the full rail, 1024px and up. The compact
  rail (768–1023px) has no board list and gains nothing. The phone gains
  nothing.
- Storage: `localStorage['hive-board-order:<email lowercased>']`, a JSON array
  of board ids. Per person, per browser. Chosen over a sheet column because the
  order is a personal preference and a column would change three doors at once
  for it.
- `accessibleBoards` returns boards sorted by that list; unlisted boards follow
  in sheet order. A store function `moveBoard(id, toIndex)` reorders, saves and
  updates a signal, so every reader re-renders.

## Drag (mouse)

1. Each rail board row (`<li>`) is `draggable`. No visible handle: the whole
   row drags, like cards on the board.
2. **dragstart** — `effectAllowed = 'move'`, the dragged row drops to 50%
   opacity (the same treatment as a dragged card on the board).
3. **dragover** another row — the pointer's half of that row decides: top half
   means "before", bottom half "after". A 2px `--color-primary` line,
   `--radius-full`, is drawn across the row's width at that edge (inside the
   2px gap between rows). Only one line at a time. Over the dragged row itself,
   or a position that would not change the order, no line.
4. **drop** — the board moves there; the line and the opacity clear; the new
   order is saved. No toast: the result is visible where the pointer is.
5. **dragend without a drop** (Escape, outside the list) — nothing changes.
6. A drag that ends does not navigate. A plain click (no drag) opens the board
   as today.

Dropping outside `.rail-board-list` (on New board, Today, Settings) is not a
target.

## Keyboard

With a rail board link focused:

- **Alt+ArrowUp** — moves it up one place. **Alt+ArrowDown** — down one place.
- Focus stays on the moved board's link after the re-render.
- A visually hidden `aria-live="polite"` region in the rail announces
  "Family moved to position 2 of 4".
- At the first (or last) place the key is a no-op and announces nothing.
- The rail's board list carries `aria-describedby` pointing at visually hidden
  text: "Drag, or press Alt+Up or Alt+Down, to reorder."

Alt+Arrow is chosen over a per-row menu because the rail rows have no menu
today and the keys collide with nothing Hive binds (Ctrl+1–9 is the only board
shortcut).

## States and edge cases

| Situation | Behaviour |
|---|---|
| No saved order | sheet order, as today |
| One board | draggable, but no drop position changes anything: no line |
| New board created | appears last |
| Board shared with me by the other person | appears last |
| Board archived / access removed | disappears; the rest keep their relative order |
| Board unarchived | appears last |
| Saved id no longer accessible | ignored; pruned the next time order is saved |
| `localStorage` throws | sheet order on load; moves work for the session, nothing saved, no error shown |
| Different user signs in on this browser | their own key; sheet order if none |
| 30-second poll | re-sorts with the saved order; a drag in progress is not interrupted (the poll replaces `boards`, the order list is untouched) |
| Demo mode | same behaviour; the key uses the demo user's email |

## Copy

"Family moved to position 2 of 4" · "Drag, or press Alt+Up or Alt+Down, to
reorder."

## Tokens

Existing only: `--color-primary` (drop line), `--radius-full`. No new tokens.
The drop line is non-text UI; `--color-primary` on the rail background is above
3:1 in both themes (#625's contrast table: 5.27 light, 10.40 dark on
`--color-bg`).

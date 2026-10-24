# 625 — Boards: every board at a glance

The Boards destination (#623) becomes a list of boards; a board is opened from
it and returns to it with "‹ Boards". This retires the control bar's board
`<select>` and its "+ New Board…" option.

Standing documents: none in `hive/docs/design/`. The suite language and the
Keel-wide rules apply. The shell is [#623](623-tab-bar-and-rail.md); the
definitions of done, open, started and overdue are [#624](624-today.md)'s and are
read from the same store values. Thrive's Activities list cards (#527, #528)
are the reference: a summary card with figures and a proportional bar whose
segments are named in words.

## Layout

Phone: one column, `--space-md` padding, cards `--space-md` apart. From 768px:
the same column, max width 720px, beside the rail. From 1024px: cards in a
grid, `repeat(auto-fill, minmax(340px, 1fr))`, `--space-md` gaps.

### Header

- Subline: "3 boards · 12 open" (`--text-sm` secondary). Open counts open root
  items across accessible boards.
- Title "Boards", `--figure-lg` 700.
- Right: Search and New board, round 44px icon buttons. Search is out of scope
  for this issue and renders no button; New board opens the existing
  create-board modal.

### A board card

A link (`<a href="?board=<id>">`), `--color-surface`, `--radius-lg`,
`--space-md` padding, a 1px transparent border that becomes `--color-border` on
hover; pressed `--state-pressed`; the global focus ring.

1. **Top row**
   - Tile: 40px, `--radius-md`, the board's colour; its icon centred if it has
     one, otherwise its first letter in `--color-on-fill` 700. The board's own
     colour is data: it always sits beside the name.
   - Name (`--text-lg` 700) over the shared-with line (`--text-sm` secondary):
     "You, Mom and Dad" from the Permissions rows mapped to Owners names (an
     email with no Owners row shows the part before `@`); "Everyone" when a
     row is `*`; "Just you" when only the signed-in person has access.
   - When it has overdue items: "1 OVERDUE", the pill from #624
     (`--color-danger-text`, dashed `--color-danger` border).
   - A chevron in `--color-text-muted`.
2. **Bar** — 8px tall, `--radius-full`, `--color-border-light` track, 2px gaps;
   three segments in proportion: not started `--color-border-strong`, started
   `--color-primary`, done `--color-success`. A zero segment is omitted. No bar
   when the board has no items.
3. **Legend** — one entry per segment, even at zero: a small square in its
   colour, the count (`--text-base` 700, tabular) and the word: "6 not started",
   "2 started", "1 done". The words make the colours redundant.
4. **Next** — a hairline, then a calendar icon and "Next: Book dentist
   appointments · today", or "Nothing dated", one line with ellipsis.

Done counts terminal items completed in the last 30 days — the same set the
board's Done column shows before "View all" (`recentDoneItems`' rule) — so the
card agrees with the board.

The card's accessible name: "Family, 8 open, 1 overdue".

### After the cards

- **New board** — a dashed 1px `--color-border-strong` card, 64px tall, plus
  icon and "New board" in `--color-primary` 600. Opens create-board.
- **Archived boards** — a `--color-surface` row card: archive icon, "Archived
  boards", the count, chevron. Opens the existing archived-boards dialog. Hidden
  when there are none.

## Into a board and back

- Tapping a card: `?board=<id>` (pushState), Boards stays the active tab. The
  board's header gains, above the subline, a **‹ Boards** link (chevron and
  word, `--color-primary` 600, 44px tall) back to `?view=boards`.
- The control bar's board `<select>` is removed, with the "+ New Board…" option;
  the hint text that went with it goes too.
- **Tab memory.** Boards remembers, for the session, whether it last showed the
  list or a board (and which). Going Today → Boards restores it. Tapping Boards
  while already on a board returns to the list.
- **Desktop rail** (#623): the BOARDS heading becomes a link to the list, active
  (`--color-primary-light` fill) when the list is shown. A board row in the rail
  opens that board directly, as before, and is the active row while it is open.
  The compact rail's Boards button goes to the list.
- After **creating** a board, Hive opens it. After **archiving** or **deleting**
  the open board, Hive shows the list (today it falls back to another board).

## States

| State | Shows |
|---|---|
| No boards | header; "No boards yet." muted and the New board card |
| One board | its card; no special casing — the list still shows |
| A board with no items | tile, name, shared line; "No items yet" in place of bar and legend; "Nothing dated" |
| Poll changes a count | the card updates in place |
| A board archived by someone else | its card disappears on the next poll; if it was open, the "That board is not available" toast and the list |

## Edge cases

- **Long names** wrap to two lines then ellipsis; the pill and chevron never
  wrap under the name.
- **Many people sharing** — the line lists names up to three, then "and 2
  others".
- **A board whose icon is an emoji** shows it as the board's chosen icon; the
  "no emoji" rule is about Hive's own chrome, not a person's data.

## Copy

"Boards", "3 boards · 12 open", "You, Mom and Dad", "Everyone", "Just you", "and
2 others", "1 OVERDUE", "6 not started", "2 started", "1 done", "Next:", "today",
"tomorrow", "Nothing dated", "No items yet", "New board", "Archived boards", "No
boards yet.", "‹ Boards" (the chevron is an icon; the link's text is "Boards").

## Contrast

| Pair | Light | Dark |
|---|---|---|
| shared-with and next lines, `--color-text-secondary` on surface | 6.05 | 6.57 |
| overdue pill, `--color-danger-text` on surface | 6.57 | 5.85 |
| ‹ Boards `--color-primary` on `--color-bg` | 5.27 | 10.40 |
| bar segments on the card surface (3:1 for non-text) | not started 3.83, started 5.91, done 5.13 | 3.95, 9.63, 7.34 |
| tile letter `--color-on-fill` on a board colour | depends on the colour the owner picked; not changed here |

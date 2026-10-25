# #647 — Remove the owner / Mine / Everyone code

Keel-wide rules apply. This is a **removal**: no new surface, no new tokens.
It overrides the owner parts of [#624](624-today.md), [#626](626-board-screen.md)
and [#627](627-item-screen.md), and nothing else in them. The Items `owner`
column and the Owners tab stay in the sheet and are never shown or set.

## What goes, surface by surface

| Surface | Today | After |
|---|---|---|
| Today, below the glance | **Mine** / **Everyone** chips | Gone. The row of filter chips is not drawn, and the space closes up (the week strip is followed directly by the glance card) |
| Today, glance sentence | "· Mine on 3 boards" / "· Everyone on 3 boards" | "· 3 boards". "1 board" for one |
| Today, empty states | worded for Mine ("Nothing of yours due today.") | one wording only: "Nothing due today." / "Nothing due Tue, Oct 20." |
| Today, overdue block meta | "Kiddo · Family" or "Unassigned · Family" | the board only: "Family"; "Family · in Grocery shopping" for a subtask |
| Today, due rows, started and up-next rows | the owner's initials avatar (`--avatar-sm`), and "owner · board" meta | no avatar; meta is the board, plus "in <parent>" for a subtask |
| Board header | **Mine** chip | Gone. Chips are All, Due today, This week, then labels (and Group from 768px). **All** is still the cleared state |
| Board card, meta | "Unassigned" in italics when no owner | Gone. A card with no date, subtasks or labels has no meta row |
| Board card, right side | owner initials (`--avatar-sm`) over the ⋮ | the ⋮ alone, 44px, flat, top-right |
| Item screen | an **Owner** row with avatar buttons and "None" | Gone. The details card is Due, Labels, Completed (when done), Board, in that order |
| Create-item modal | an **Owner** select defaulting to Me | Gone. The Due field follows Status |
| Archive dialog row | the owner's name | Gone |

## Decisions

- **"Unassigned" is not replaced by anything.** There is nobody to be unassigned
  to, so the word disappears with the avatar rather than moving.
- **The glance sentence keeps its board count** because it is how Today says
  what it is looking across; only the who-clause is cut.
- **A hairline never doubles.** The Owner row was the first row of the item
  screen's details card; removing it leaves the Due row first with no top rule,
  and the create modal closes its gap with no empty field-height.
- **The Mine filter's stored state is ignored, not migrated.** `hive-today-who`
  may exist in the browser; nothing reads it, nothing deletes it.
- **Profile display name still saves** (it names people in "Shared with"), but
  the toast and dialog say nothing about items. It is **"Display name updated"**
  as today.

## States

Nothing new. Each state a surface had is kept; only the owner-dependent copy in
the table changes. Dark and light both follow, as there are no colours here.

## Tokens

`--avatar-sm` (28px) and `--avatar-md` (36px) lose their owner readers. Verify
in the diff whether `global.css:4947` (the third reader) is an owner avatar; if
no reader is left, delete the token, and if one is, keep it. `OWNER_COLORS` and
`ownerColor()` go with the avatars.

## Copy

Cut: "Mine", "Everyone", "Unassigned", "None" (the owner one), "Owner",
"Owner: <name>", "Nothing of yours due today.", "· Mine on N boards",
"· Everyone on N boards".
Kept: "Nothing due today.", "Nothing due <day>.", "Display name updated".
Added: none.

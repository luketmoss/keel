# 888 — Combos in the Add sheet and in Library

Specifies [#888](https://github.com/luketmoss/keel/issues/888), part of epic [#876](https://github.com/luketmoss/keel/issues/876).
The detection and its answer are #879; the Add sheet's Usuals section and groups are
[`885-usual-as-a-group.md`](885-usual-as-a-group.md); the Usuals list is [`887-library-usuals.md`](887-library-usuals.md).
Tokens from [`suite-language.md`](../../../ui/docs/design/suite-language.md). Layout reference: the prototype at
`876-usuals-prototype.html` (tab 4, and tab 2's Add sheet). Nothing here introduces a token.

## In the Add sheet

Before any search, under **Usuals**, a section **Combos you've logged** with the top 3 from `getCombos({ slot })` for
the meal being added to. Row: the combo's name (bold; `Bread + Turkey + Cheddar / Swiss cheese`), sub-line
`In 7 meals · last yesterday`, kcal at the right (from the combo's lines, the pick-one at its default). With a search,
every combo whose name matches shows, not only three.

Tap: `logGroup` with the combo's name and its lines (a pick-one logs its default). The entries arrive as a group with no
`Usual` chip. Toast `Added <name>` with **Undo**. The group's ⋯ offers **Save as a usual** (#886).

Hidden while loading, on failure, and when there are none.

## In Library → Usuals

Below the usuals list: a section label **Combos you've logged**, then `Foods you've had together in 3 or more meals in
the last 60 days.` in `--text-sm` `--color-text-secondary`, then every combo as a row (same as above, sub-line
`9 breakfasts · last 4 days ago`). With none: `Nothing new. Combos your usuals already cover don't show here.` When some
are hidden: a text button **Show 2 hidden** after the list (unhides them all).

Tap a combo: the **Combo sheet**:

1. Title: the combo's name. **Close**.
2. `In 7 lunch meals over the last 60 days · last yesterday`.
3. When it was joined from sets that differ by one food: `2 combos that differ only by Cheddar or Swiss cheese were
   joined, so that's a pick-one.`
4. **Typical amounts**: one row per line: the food (or a `Pick one` chip and `Cheddar / Swiss cheese`) and its median
   amount at the right.
5. **Meals it came from**: one line per meal, newest first, `Fri 13 Nov · Sourdough bread, Deli turkey, Cheddar, Spring
   mix`, at most 10, then `and <n> more`.
6. **Save as a usual**: a name field (prefilled with the combo's name when it has no pick-one, else empty, placeholder
   `Name it`), then the primary button **Save as a usual** (disabled while the name is blank). Saves `upsertUsual` with
   the combo's lines and slot. Sheet closes; the usual appears at the top of the list; the combo leaves the list (now
   covered); toast `Saved <name> to your usuals`.
7. **Hide this combo**, secondary. `hideCombo`; sheet closes; toast `Hidden. It won't be suggested again.` with **Undo**
   (`unhideCombos` with that key).

| State | Shows |
|---|---|
| Combos loading | No section yet (no placeholder) |
| Combos failed | No section in the Add sheet; in Library, `Couldn't look for combos.` with **Retry** |
| Saving / hiding | That button disabled with `aria-busy` |
| Save or hide failed | `role="status"` line in the sheet: `Couldn't save. Try again.` / `Couldn't hide it. Try again.` |

## Edge cases

- Saving a usual elsewhere (Eaten) that covers a combo removes it the next time combos load (on returning to Library or
  opening the Add sheet).
- A combo food deleted since: the combo isn't returned (#879 reads the log, and the API refuses unknown foods on save).
- 375px: names wrap; the kcal stays on the first line's right.

## Copy

`Combos you've logged` · `In <n> meals · last <when>` · `<n> <meal plural> · last <when>` · `Added <name>` · `Undo` ·
`Foods you've had together in 3 or more meals in the last 60 days.` ·
`Nothing new. Combos your usuals already cover don't show here.` · `Show <n> hidden` ·
`In <n> <meal> meals over the last 60 days · last <when>` ·
`<n> combos that differ only by <a> or <b> were joined, so that's a pick-one.` · `Typical amounts` · `Pick one` ·
`Meals it came from` · `and <n> more` · `Save as a usual` · `Name it` · `Saved <name> to your usuals` ·
`Hide this combo` · `Hidden. It won't be suggested again.` · `Couldn't look for combos.` · `Retry` ·
`Couldn't save. Try again.` · `Couldn't hide it. Try again.`

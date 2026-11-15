# 933 — Add to a meal through a tray

Specifies [#933](https://github.com/luketmoss/keel/issues/933), part of epic [#928](https://github.com/luketmoss/keel/issues/928).
It replaces [`786-quick-multi-add.md`](786-quick-multi-add.md)'s pass, where each item was saved as it was picked, and
the Add sheet's layout from [`712-food-log.md`](712-food-log.md), [`885-usual-as-a-group.md`](885-usual-as-a-group.md)
and [`888-combos.md`](888-combos.md). Entry rows and meal cards stay #712's; groups on the day stay #885's; the
pick-one buttons and list are #885's rule, reused in the tray. Tokens from
[`suite-language.md`](../../../ui/docs/design/suite-language.md). There are no standing documents in
`forage/docs/design/`. Nothing here introduces a token.

The clickable mock is https://claude.ai/artifact/3SkjYZdWFnxQgtw98WpPVG (source: `933-add-tray-prototype.html`).
Its foods and figures are made up. It runs the main path, a usual with a pick-one, inline amounts, the close prompt and
the optimistic close.

It depends on [#929](https://github.com/luketmoss/keel/issues/929) (figures worked out in the app, so the tray never
waits on the network) and [#930](https://github.com/luketmoss/keel/issues/930) (`logMeal`, one write for the tray).
[#931](https://github.com/luketmoss/keel/issues/931) makes the sheet open instantly but is not required.

## The idea

Nothing is saved while the owner picks. Each tap puts an item in a **tray** at the top of the sheet, at the amount
they had last time; the tray is edited in place; one button saves the whole meal in one write and the sheet closes at
once.

## Main path

1. Tap **Add to breakfast** on the day. The Add sheet opens titled `Add to breakfast`, with the search field focused.
   The tray is empty and not shown. Below the field: **Usuals for breakfast**, then **Recent**, then a collapsed
   **Often eaten together** row, then **Not here? Add a food**. The footer button reads `Tap foods to add them`,
   disabled.
2. Tap **Coffee with milk** in Recent. It goes into the tray at `1 mug`, the amount the last breakfast entry of it
   had. The tray appears between the search field and Usuals, labelled `Going into breakfast`, with `1 · 18 kcal` at
   the right of the label. The new tray row starts on `--color-primary` at low opacity and fades out over
   `--transition-normal`. The Recent row's **+** becomes a filled check. The footer reads `Add 1 to breakfast · 18 kcal`.
3. Tap **Yogurt bowl** in Usuals. Its three foods go into the tray under a group heading `Yogurt bowl`, each at the
   usual's amount; the pick-one line at its `last_pick`. The footer reads `Add 4 to breakfast · 312 kcal`.
4. Tap **Blueberries** in the tray. Its editor opens under the row: the pick-one buttons (`Blueberries`,
   `Strawberries`), the stepper with the amount, the unit chips, the macros, and **Remove**. Tap **Strawberries**: the
   line swaps to strawberries at the usual's amount for that option. Tap **+**: the amount steps up; kcal and macros
   change on the same tap. Tap the row again to close the editor.
5. Type `egg`. Results replace the lists: **Foods** first, then **Usuals with egg**. The tray stays where it is,
   above the results. Tap **Egg**: it goes into the tray at `2 large`; the search clears and focus stays in the field.
6. Tap **Add 5 to breakfast · 455 kcal**. In one update the sheet closes and Breakfast on the day lists the five new
   entries, the group under its heading, each muted with `Saving…` in place of its kcal. Focus returns to the
   **Add to breakfast** row.
7. `logMeal` answers. The five rows take the stored entries (their kcal, their chips) and lose `Saving…`. The toast
   reads `Added 5 to breakfast` with **Undo**, which deletes exactly those entries. The day card's totals catch up
   quietly (#785).

## Layout, top to bottom

| Part | With no search text | With search text |
|---|---|---|
| Header | `Add to breakfast`, close button | same |
| Search field | `Search foods, recipes, usuals` | same, with a clear button |
| Status line | empty, `role="status"` | same |
| Tray | when it has items | same |
| Lists | Usuals for breakfast, Recent, Often eaten together (collapsed) | Foods (foods and recipes), then Usuals with `<text>` |
| Not here? Add a food | as today | as today |
| Footer | the save button, pinned | same |

The tray sits above every list in both states, so what the owner has picked never moves when a list loads or a search
changes. The footer is pinned to the bottom of the sheet, above the keyboard, and is the sheet's only primary button.

**Usuals for breakfast.** #885's rows (name, foods in short, kcal as it starts), those usually for this meal first,
then by last used. No limit. Hidden when there are none.

**Recent.** #712's rows, one per food or recipe most recently logged in the last 60 days, at most 10. Line two is the
amount it will go in at and its kcal: `1 mug · 18 kcal`, `1½ servings · 240 kcal`. Right: **+** (`--color-primary` on
`--color-primary-light`, `--radius-full`), or a filled check when the item is already in the tray. A food without
nutrition keeps #712's muted name and **Add nutrition** action. Recent is not reordered while the sheet is open.

**Often eaten together.** One row, 44px or more, `Often eaten together (3)`, with a chevron, `aria-expanded`.
Collapsed every time the sheet opens. Open, it lists #888's combos for this meal: name, `6 times · last Thursday`,
kcal, **+**. Hidden when there are none. Combos load once per open and fill in under the collapsed row, so their
arrival moves nothing above it.

**Search results.** **Foods** lists foods then recipes whose name, brand or short name contains the text, at most 20,
with Recent's row content. **Usuals with egg** lists usuals whose name or any food contains the text. Combos are not
searched. With no match in either: `Nothing matches "egg".` above **Not here? Add a food**.

## The tray

A block in `--color-primary-light` with `--radius-md`, inner padding `--space-sm` `--space-md`.

- **Label row**: `Going into breakfast` (`card-label`, in `--color-primary`), and at the right `5 · 455 kcal`
  (count, then the sum of the items' kcal, `tabular-nums`, `--text-sm`, `--color-text-secondary`).
- **Items**, in the order added. Loose items and groups keep that order; a group's items sit together under its
  heading, in the usual's line order or the combo's food order.
- **Group heading**: the group's name (`--text-sm`, bold, `--color-primary`) and, at the right, **Remove all**
  (text button, `--color-text-secondary`, 44px tall).
- **Item row**, a button 56px or more, `aria-expanded`: line one the food (brand then name, #781) or recipe; line two
  its kcal (`18 kcal`); at the right an amount pill (`1 mug ▾`, `2 large ▾`, `1½ servings ▾`) in `--color-surface` with
  a `--color-border` outline, `--radius-full`.
- **Editor**, under the row while it is open (one at a time; opening one closes the other):
  - for a pick-one line, #885's pick-one buttons or `Pick one · 1 of 5 ▾` list, by #885's rule;
  - the stepper (**−**, amount, **+**, 44px each) and the unit chips (#712's: each serving name, then `g`); a recipe
    shows `servings` in place of the chips;
  - a row with the macros (`P 12 g`, `C 18 g`, `F 4 g`, in the macro colours) and, at the right, **Remove**;
  - figures from #929's preview, updated on every tap. Changing the unit keeps the weight, as #883's switch does.
- An item from a usual or combo can be edited like any other; the group keeps its heading.

## Adding to the tray

| Tapped | Goes into the tray |
|---|---|
| A food | One item at the qty and unit of its most recent entry in the 60-day log, when that unit is still one of its servings or `g`; otherwise #712's default amount of its first unit |
| A recipe | One item at the servings of its most recent entry, else `1 serving` |
| A usual | Its lines as a group named for the usual, each at the line's amount; a pick-one at its `last_pick`, else its first option |
| A combo | Its foods as a group named for the combo, at #888's amounts; a pick-one at its `default` |
| A row already in the tray | Nothing new: that item's editor opens and the item fades in as on add |
| Not here? Add a food, saved with nutrition | The new food, at its first serving's default amount, back on the sheet |
| A food or recipe given nutrition from **Add nutrition** | The same, back on the sheet |
| A starter-list add | Nothing: back on the sheet with the search set to its name, as today |

A second helping of the same food is the same item with a larger amount, not a second item. Adding a usual whose food
is already in the tray adds the group anyway: the usual is a set.

After an add from search results the search clears and the field keeps focus. After an add from the lists the scroll
position is kept.

## Saving

The footer button reads `Add 5 to breakfast · 455 kcal` (`Add 1 to breakfast · 18 kcal` for one) and is disabled with
`Tap foods to add them` while the tray is empty. When any item's kcal is unknown (a partial recipe), the total reads
`455+ kcal`.

Tapping it sends one `logMeal` for the day the sheet was opened for and its slot: every item in tray order, each with
an id fixed when it entered the tray, loose items with no group, each group with its own key, its name, and for a
usual its `usual_id` and each line's `usual_line_id`.

**The sheet closes at once, without waiting for the answer.** This is the one deliberate exception to #785's rule
that a sheet closes only after its write answers: the figures the day shows meanwhile are #929's, from the same math
the server runs, so the wait buys nothing. The new entries show on the day immediately, muted (`opacity` as the
day's disabled rows), with `Saving…` (`--text-xs`, `--color-text-muted`) where the kcal goes, not tappable, and the
meal card's total excludes them until they land.

| Answer | The day |
|---|---|
| Saved | The pending rows are replaced by the stored entries in place. Toast `Added 5 to breakfast` with **Undo** (deletes exactly those entries; toast `Removed 5 from breakfast`). The day card refreshes quietly |
| Failed | The pending rows stay, without `Saving…`, under one line in the meal card: `Couldn't save 5 items.` (`--color-danger-text`), with **Try again** and **Discard** text buttons. **Try again** resends the same call with the same ids, so a write that landed but lost its answer is not doubled. **Discard** removes the pending rows |

## Closing with items in the tray

Close, Escape and the backdrop, with the tray not empty, open a prompt over the sheet (the suite's confirm dialog,
`role="alertdialog"`):

- Title: `Add 5 items to breakfast?` (`Add 1 item to breakfast?`)
- Message: `They're in the tray but not saved yet.`
- Buttons: **Discard**, **Keep adding**, **Add 5** (primary). **Add** does exactly what the footer button does.
  **Keep adding** and Escape close the prompt. **Discard** closes the sheet and drops the tray.

With an empty tray, close works as today.

## States

| State | Shows |
|---|---|
| Lists loading, nothing held (#931) | #712's three skeleton rows below the search field; the tray and footer work as soon as anything is tappable |
| Lists failed | #712's `Couldn't load your foods.` with **Try again** |
| Empty tray | No tray block; footer disabled, `Tap foods to add them` |
| Tray with items, editor closed | As above |
| Editor open | Under its row; the rest of the tray and lists below move down |
| Tray full (30 items) | Every **+** in the lists and results disabled; status line `A meal can hold 30 items at a time.` Removing one enables them |
| Saving (sheet closed) | Pending rows on the day, `Saving…` |
| Save failed | `Couldn't save 5 items.` with **Try again** and **Discard** in the meal card |
| Library empty | `No foods in your library yet.` and **Not here? Add a food**, as today |

## Edge cases

- **Rapid taps on a list row.** The first tap adds; a second on the same row opens the item (it is in the tray now). No
  duplicate.
- **Rapid taps on the footer.** The sheet is gone after the first tap; one `logMeal` goes out.
- **Amount at the minimum.** **−** stops at one step (#712's step for the unit) and stays focusable (#870,
  `aria-disabled`).
- **A pick-one swapped to a food that is not one of the line's options.** Not possible in the tray: the editor offers
  only the line's options.
- **Removing every item of a group.** The heading goes with the last one.
- **Removing every item.** The tray block goes; the footer disables.
- **The day changes while the sheet is open (midnight).** Everything is logged to the day the sheet was opened for, as
  #786.
- **Leaving the Eaten tab or the app while pending.** The write carries on; whatever it answers is on the day on
  return. A tray that was never saved is dropped when the sheet closes and is not kept across reloads.
- **A food edited elsewhere after it went into the tray.** The tray's figure is the food as loaded; the stored entry is
  the server's, from the food as it is when written. The two can differ by that edit; the stored one wins.
- **Offline.** The save fails as above, and **Try again** works once the network is back.
- **Demo mode.** Works the same against the demo API.

## Copy

- Header: `Add to breakfast` (the meal as #826 names it)
- Search placeholder: `Search foods, recipes, usuals`
- Tray label: `Going into breakfast`; count and total `5 · 455 kcal`
- Sections: `Usuals for breakfast`, `Recent`, `Often eaten together (3)`, `Foods`, `Usuals with egg`
- No match: `Nothing matches "egg".`
- Group heading action: `Remove all`; item action: `Remove`
- Footer: `Add 5 to breakfast · 455 kcal`, `Add 1 to breakfast · 18 kcal`, `Tap foods to add them`
- Full tray: `A meal can hold 30 items at a time.`
- Pending: `Saving…`
- Saved toast: `Added 5 to breakfast`, `Added Coffee with milk to breakfast` for one, with `Undo`; after Undo,
  `Removed 5 from breakfast`
- Failed: `Couldn't save 5 items.` (`Couldn't save 1 item.`), `Try again`, `Discard`
- Close prompt: `Add 5 items to breakfast?`, `They're in the tray but not saved yet.`, `Discard`, `Keep adding`, `Add 5`

## Accessibility

- The tray is a list labelled by its label row (`aria-labelledby`); each group is a nested list labelled by its
  heading.
- Each list row's accessible name says what a tap does: `Coffee with milk, 1 mug, 18 kcal, add` or `Coffee with milk,
  in the tray, edit`.
- Each add or remove announces in the status line: `Added Coffee with milk`, `Removed Egg`, `Added Yogurt bowl, 3 items`.
- An item row is a button with `aria-expanded`; its editor follows it in the DOM, and focus moves to the stepper's
  amount when it opens.
- The footer button's accessible name is its text.
- Focus after save or close: the **Add to breakfast** row on the day. The prompt traps focus, starting on **Add**.
- Reduced motion: no fade on new tray items.

## Measured

No criterion here asserts a new quantity beyond the floors already checked by `/test` with `getBoundingClientRect()`
per `stack-web`: list rows and tray item rows 56px or more (#712's `log-row`), the stepper, chips, **Remove**,
**Remove all**, the collapsed **Often eaten together** row and the footer button 44px or more.

## What this retires

- The amount sheet inside the Add flow (it stays for any other caller), and its meal-chip hiding during a pass.
- The **Added to breakfast** list and the header's **Done**.
- Logging a usual or a combo straight from the Add sheet (#885 step 3, #888): both now go through the tray.
- The per-item status lines `Logged <name>` inside the sheet.

## New tokens

None.

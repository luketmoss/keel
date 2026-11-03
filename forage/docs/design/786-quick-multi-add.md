# 786 — Add several foods to a meal in one pass

Specifies [#786](https://github.com/luketmoss/keel/issues/786). It changes only the Eaten tab's Add flow from
[`712-food-log.md`](712-food-log.md): the Add sheet, the amount sheet and the day view are #712's, and nothing here
restates them. Tokens, spacing and touch targets come from
[`suite-language.md`](../../../ui/docs/design/suite-language.md); sheets from [`706-recipe-import.md`](706-recipe-import.md);
the Add a food sheet from [`707-food-library.md`](707-food-library.md). It builds on
[`785-instant-saves.md`](785-instant-saves.md): each save patches the day from the write's reply, so the day behind the
sheet is right when the pass ends. There are no standing documents in `forage/docs/design/`. Every length is a token;
nothing here introduces one.

The clickable mock is https://claude.ai/artifact/BzxrQDW3F4ehVRm5z3Kc3y. It runs the main path, edits from the Added
list, a failed save and **Done**, with a simulated save delay. Its figures are made up, and it adds the
day's totals itself, which the app never does.

## The pass

A **pass** starts when an Add row on the day is tapped (**Add to dinner**) and ends when the Add sheet closes. It
belongs to that meal (the pass's slot) and that day. The Eaten screen holds it, not the Add sheet, because the Add
sheet unmounts while the amount sheet is open:

- the slot and the date
- the ids of the entries logged in the pass, in the order logged
- the Add sheet's loaded lists (foods, recipes and the 60-day log behind Recent)
- the search text, kept while the amount sheet is open

## Main path

1. Tap **Add to dinner**. The Add sheet opens as #712 specifies: it loads foods, recipes and the log once, with its
   skeleton.
2. Tap **Potato gnocchi**. The amount sheet opens on one serving, as today.
3. Tap **Log it**. The button is busy (`aria-busy`, disabled) until the write answers (#785).
4. The amount sheet gives way to the Add sheet, not the day. The search field is empty and focused. Above Recent, a
   new **Added to dinner** list holds one row: `Trader Joe's Potato gnocchi`, `1 cup · 140 g`, `224 kcal`. The new row
   starts on `--color-primary` at low opacity and fades into the list's background over `--transition-normal` (no fade
   under reduced motion), so the eye finds it. A `role="status"` region inside the sheet says "Logged Trader Joe's Potato gnocchi".
5. The header's close button is now **Done**.
6. Repeat for vodka sauce, mixed greens, onion and the rest. Each new row is added at the bottom of the list.
7. Tap **Done**. The sheet closes on the day, where Dinner already lists every entry (#785 patched each one as it
   saved). One toast: "Logged 7 items to dinner". The day card's totals catch up in the background as #785 specifies.

## Add sheet during a pass

Order, top to bottom: the search field, then **with no search text** the Added list (when the pass has logged
anything), then #712's Recent or Your recipes list; **with search text** only #712's results. Then **Not here? Add a
food**, as today.

The Added list hides while there is search text, so results sit right under the field while the keyboard is up, and
comes back when the field is cleared.

**Added list.** A label `Added to dinner` (`card-label`, the meal as the sheet's title names it), then a group in
`--color-primary-light` with `--radius-md`, holding one row per entry of the pass that still exists, in the order
logged. Each row is a button, 56px or more, with #712's entry-row content: line one the food (brand then name) or
recipe; line two the amount as the day shows it (`1 cup · 140 g`, `2 servings`); right, the stored kcal with `kcal` in `--text-sm`, or #712's `—` chip and "No
nutrition" for an entry without it. Tapping a row opens that entry's amount sheet in edit mode. There is no total for
the list: the day card is the only sum (#712).

**No reload.** Coming back to the Add sheet within a pass shows the lists loaded when the pass began, with no skeleton
and no `getFoods`, `getRecipes` or `getFoodLog` call. Recent is not reordered during a pass, so rows do not move under
the finger; a food just logged stays where it was in Recent and also appears in the Added list. A food created through
**Not here? Add a food** is added to the loaded foods (`keepFood`, as today), so a later search in the same pass finds
it. The next pass loads afresh.

**Header.** The title is `Add to dinner` throughout. Before the first entry the header has #712's close button. Once
the pass has at least one entry, the close button is replaced by **Done**, a secondary button (44px) in `headerEnd`, as
#780 places header buttons. If every entry of the pass is deleted again, **Done** stays: what the header says follows
what was done in the pass, not what is left.

**Ending the pass.** **Done**, the close button, Escape and a tap on the backdrop all end the pass the same way: the
sheet closes, focus returns to the Add row that opened it, and one toast reports what the pass left on the day:

| Entries of the pass still on the day | Toast |
|---|---|
| 0 | none (a pass that logged nothing, or whose entries were all deleted: each delete had its own status line) |
| 1 | "Logged Trader Joe's Potato gnocchi" (#712's wording) |
| 2 or more | "Logged 7 items to dinner" |

## Amount sheet during a pass

The sheet is #712's. What changes is where it goes:

| From the amount sheet | Today | During a pass |
|---|---|---|
| **Log it** answers | the day | the Add sheet, search cleared and focused, the new row in the Added list |
| Close, Escape, backdrop (nothing logged) | the day | the Add sheet, with the search text it had and focus in the field |
| A failed **Log it** | stays open with its error | the same; nothing is added to the list |

**No meal chips.** During a pass the amount sheet leaves out #712's Meal label and chips, for a new item and for one
edited from the Added list. Every entry the pass logs goes to the meal its Add row named, which is what the sheet
under it says (`Add to dinner`); offering Lunch there would contradict it. Moving an entry to another meal is done
from the day, where the chips stay (below).

**Edit from the Added list.** The amount sheet in edit mode, as #712 specifies (stored numbers first, **Save**,
**Delete entry**), without the chips. **Save** answers → back to the Add sheet, the row showing the new amount and kcal, with the
same fade; the search text is kept, not cleared, since nothing new was picked. **Delete entry** → #712's confirmation
→ on success back to the Add sheet with the row gone and a status line "Deleted Trader Joe's Potato gnocchi". Close
without saving → back to the Add sheet unchanged.

**Editing from the day** (tapping an entry row on the day, outside a pass) is unchanged: the meal chips are there,
and Save, Delete and close all return to the day.

## Not here? Add a food

#712's return paths, now inside the pass, with the Added list kept:

- Saved from the label or by barcode, or **Open it** on "Already yours": the amount sheet for that food. **Log it**
  then returns to the Add sheet as above.
- A starter-list add: back to the Add sheet with the search set to the added food's name, as today. The Added list is
  hidden while that text is in the field.
- Cancelled: back to the Add sheet unchanged.
- A food or recipe with no nutrition (a row's **Add nutrition**): #712's food form or Nutrition sheet, back to the Add
  sheet, pass kept.

## States

| State | Shows |
|---|---|
| First open of a pass, loading | #712's three skeleton rows |
| First open failed | #712's "Couldn't load your foods." and **Try again**. **Try again** is the only reload a pass makes |
| Pass with entries, no search text | Added list, then Recent |
| Pass with entries, search text | Results only |
| Saving an item | The amount sheet's button busy; the Add sheet is not shown until the write answers |
| Save failed | The amount sheet stays open with #712's error; the pass and its list are unchanged |

## Edge cases

- **Rapid repeat.** **Log it** is disabled while in flight, and the entry id is fixed per amount-sheet open (#712), so a
  double tap or a retry after a lost answer leaves one entry and one Added row.
- **The same food twice.** Allowed (a second helping): two entries, two rows.
- **Midnight during a pass.** Every entry is logged to the day the pass began for, as #712 does per sheet.
- **A long pass.** The Added list grows without limit; the sheet scrolls. At around 8 rows Recent starts below the
  fold at 375px, which is acceptable: once the keyboard is up the person is searching, and the list hides.
- **Planned meals.** A planned row's **Log 1 serving** on the day is not part of a pass and is unchanged. Logging the
  planned recipe inside a pass hides its planned row on the day by #712's rule, once the pass ends.
- **Offline or the write fails.** As a failed save: the item is not logged and the sheet says so. No queue.
- **Demo mode.** The pass works the same against the demo API.

## Copy

- Added list label: `Added to dinner` (`Added to breakfast`, `Added to lunch`, `Added to snacks`)
- Header button: `Done`
- In-sheet status after each save: "Logged <name>", "Saved <name>", "Deleted <name>"
- Toast on ending the pass: "Logged <name>" for one entry, "Logged <n> items to <meal>" for several

## Accessibility

- The Added list is a list labelled by its heading (`aria-labelledby`), each row a button with #712's label.
- The in-sheet status after each save is `role="status"`, so a screen reader hears it while focus moves to the search
  field.
- **Done** is a real button with that text, 44px or more, reached first after the title in tab order.
- Focus: back in the search field after each Log it or close; back on the Add row of the day when the pass ends.
- Reduced motion: no fade on new rows; sheets appear without sliding (#712).

## Measured

Nothing new to measure: the rows, header button and chips reuse #712's classes and their 44px and 56px floors, which
`/test` checks with `getBoundingClientRect()` per `stack-web`.

## New tokens

None.

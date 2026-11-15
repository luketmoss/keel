# 942 — Optional usual lines

Specifies [#942](https://github.com/luketmoss/keel/issues/942). Builds on
[`887-library-usuals.md`](887-library-usuals.md) (the usual editor and the Usuals list),
[`933-add-tray.md`](933-add-tray.md) (the Add sheet's tray),
[`885-usual-as-a-group.md`](885-usual-as-a-group.md) (pick-one buttons and list) and
[`886-swap-and-save-usual.md`](886-swap-and-save-usual.md) (a group compared with its usual, **Update the usual**).
Tokens from [`suite-language.md`](../../../ui/docs/design/suite-language.md). There are no standing documents in
`forage/docs/design/`. Nothing here introduces a token.

## The idea

A usual's line says how often it's eaten: **every time** (as every line is today), **usually** (in by default, can be
left out) or **sometimes** (out by default, can be added). The editor sets it; the tray shows each optional line as a
chip that turns it on or off. A line left out is not a change from the usual.

| Editor pill | `optional` | In the tray when the usual is added |
|---|---|---|
| Every time | `''` | An item, as today. No chip |
| Usually | `in` | An item, and its chip on |
| Sometimes | `out` | No item, and its chip off |

## The editor (#887)

Each line block gains one row, the last in the block, under the **Pick each time** switch (Always line) or under the
"how it shows on a day" line (pick-one):

- Label `How often` (`--text-sm`, `--color-text-secondary`), then three pills, single-select, the same pill style as
  **Usually for**: `Every time`, `Usually`, `Sometimes`. A `role="radiogroup"` labelled `How often <food>` (the
  pick-one's label is `How often <last pick's label> or another`).
- A new line (from **＋ Add a food**, or a usual saved from a meal, #886) starts on `Every time`.
- Changing it saves like any other change: the whole usual, debounced 600ms, `Saving…` then `Saved`.
- Switching **Pick each time** on or off keeps the line's `How often`.
- The numbers card (`as it starts`) follows `start`, so moving a line to `Sometimes` takes it out of the kcal there.

### The Usuals list row

Line 2 lists the every-time and usually lines as today, in line order, then the sometimes lines after
` · sometimes `, comma-separated: `Romaine · Carrot · Ranch / Balsamic · sometimes Feta, Cucumber`. A sometimes
pick-one is shown by its line-2 rule (`A / B` or `<label> or <n> more`). The kcal at the right is `start`, so it leaves
sometimes lines out.

## The tray (#933)

A usual with optional lines is added as today: its group heading, then its items. Under the group's last item, a
**chip row**:

- One chip per optional line, `usually` and `sometimes` alike, in line order. A `role="group"` with
  `aria-label` `Optional in <usual>`.
- Chip: `--radius-full`, 44px or more tall, padding `--space-xs` `--space-md`, `--text-sm`, the food's label (short
  name, else name, #880). A pick-one's chip shows the label of its item's current food when on, and of its
  `last_pick` (else first option) when off.
  - **On**: `--color-primary` background, `--color-text-inverse` text, a leading check. `aria-pressed="true"`.
  - **Off**: `--color-surface` background, `--color-border` outline, `--color-text-secondary` text, a leading `+`.
    `aria-pressed="false"`.
- Chips wrap onto more lines; nothing scrolls sideways at 375px.

**Tapping an off chip** adds that line's item to the group, placed by line order among the group's items, at the line's
amount (a pick-one at its `last_pick`, else its first option). It fades in as #933's adds do. The chip turns on; the
label row's count and kcal, and the footer, update on the same tap. Status line: `Added Feta`.

**Tapping an on chip** removes that item (and closes its editor if open). The chip turns off; totals update. Status
line: `Removed Feta`.

**Remove** in an optional item's editor does the same as tapping its on chip: the item goes and the chip turns off. An
every-time item's **Remove** works as today and has no chip.

**Remove all** removes the group's items and its chip row.

A group whose items are all off still shows its heading and chip row, and counts as 0 items. With nothing else in the
tray, the footer is disabled with `Tap foods to add them`.

**Saving** sends only the items in the tray (#930's `logMeal`, each with its `usual_line_id`). A chip that is off sends
nothing. A group with no items is not sent.

### The same usual twice

Each add of a usual is its own group with its own chips (#933: a usual is a set), so two salads are two groups, each
toggled on its own.

## A group on the day (#885, #886)

The day's group view compares a logged group with its usual (`usual-group.ts`). With this change:

- An optional line with no entry is not a difference. A sometimes line that was logged is not a difference either.
- An every-time line with no entry is still `<food> left out`, as today.
- **The second option.** When a pick-one line already has its entry and another entry in the group is a food from
  that line's options, the second one is not `added <food>`. Apple *and* pear reads as matching on that account.
- **Update the usual** keeps every optional line that wasn't logged (its options, amounts, `last_pick` and
  `How often`), keeps each logged line's `How often`, and creates no line for a second option. An every-time line with
  no entry is still dropped, as today.

So oatmeal logged without its usually-in fruit shows no difference, and **Update the usual** has nothing to change.

## States

| State | Shows |
|---|---|
| A usual with no optional lines | Exactly as today: no chip row |
| Some chips on, some off | Items for the on ones, chips for all |
| Every chip off, every line optional | Heading and chip row, no items, `0` in the count |
| Tray full (30 items) | Off chips disabled (`aria-disabled`, 50% opacity), as #933 disables **+**; status line `A meal can hold 30 items at a time.` On chips still work |
| Editor save failed | #887's `Couldn't save. Your changes are kept here.`; the pill stays where the owner put it |

## Edge cases

- **Rapid taps on a chip.** Each tap toggles; the final state is what's in the tray. No duplicate item.
- **An optional line's food added again from search.** #933's rule holds: a food already in the tray opens that item
  rather than adding another. The chip stays on.
- **An optional pick-one switched to another option, then off, then on.** It comes back at its `last_pick`, not the
  option chosen before it went off. The tray doesn't remember within an open.
- **A usual where every line is optional and the owner turns all off, with other items in the tray.** Those items save;
  the empty group is not sent.
- **MCP logs a usual leaving lines out.** The group shows on the day with the lines that were logged, compared by the
  rules above.
- **Demo mode.** The demo has a usual `Side salad` (lunch): Romaine every time; Carrot usually; Feta sometimes;
  Cucumber sometimes; a dressing pick-one of two, usually. Foods it needs that the demo lacks are added to the demo data.

## Copy

`How often` · `Every time` · `Usually` · `Sometimes` · `How often <food>` · ` · sometimes ` (Usuals list line 2) ·
`Optional in <usual>` · `Added <food>` · `Removed <food>` · `A meal can hold 30 items at a time.` (#933's)

## Accessibility

- The editor's pills are a radiogroup; arrow keys move between them, and the selected one has `aria-checked`.
- Chips are toggle buttons (`aria-pressed`), named by the food label: `Feta`. The group's label gives the context.
- Adding or removing by chip announces in #933's status line.
- Reduced motion: no fade on an item a chip adds.

## Measured

No criterion here asserts a new quantity. The chips and pills take #933's and #887's existing 44px touch floor, which
`/test` checks with `getBoundingClientRect()` per `stack-web`.

## New tokens

None.

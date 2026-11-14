# 883 — Eaten: add or fix a serving from the amount editor

Specifies [#883](https://github.com/luketmoss/keel/issues/883), part of epic [#876](https://github.com/luketmoss/keel/issues/876).
Builds on the inline editor in [`882-inline-amounts.md`](882-inline-amounts.md); food servings and the food form are
[`707-food-library.md`](707-food-library.md); barcode servings are #775 (`forage/CLAUDE.md` §Foods). Tokens from
[`suite-language.md`](../../../ui/docs/design/suite-language.md). Layout reference: the prototype at
`876-usuals-prototype.html` (tab 2, Almond butter's amount, **Say what it is**). Nothing here introduces a token.

## Why

Foods imported without checking end up with a serving called `serving`, which means nothing when logging. Fixing it
today means leaving Eaten for Library, adding a serving to the food, and coming back.

## Where it lives

In #882's inline editor, after the unit pills: a dashed pill **＋ Serving** (`--color-primary` text, dashed
`--color-border`), `aria-expanded`. It opens a panel inside the editor, under a hairline.

When the food's first serving is named exactly `serving` (any case) and the panel is closed, a line under the pills in
`--text-sm` `--color-text-secondary`: `“serving” isn't a real amount.` followed by a text button **Say what it is**, which
opens the same panel.

## The panel, for a food with a vague `serving`

1. Heading (`--text-sm` bold): `What is 1 serving (32 g) on the label?`
2. Two fields side by side: a number (`inputmode="decimal"`, prefilled `2`) and a unit (text, prefilled `tbsp`,
   `autocomplete="off"`, at most 20 characters).
3. A live line in `--color-text-secondary`: `Adds 1 tbsp = 16 g, and renames the serving “2 tbsp”.` While a field is
   blank or the number isn't above 0: `Type the label's serving, like 2 tbsp.`
4. Primary button **Add tbsp** (the unit typed), full width; **Add it** and disabled while the fields aren't valid.
5. A small divider label `or weigh your own`, then the panel below.

**Add tbsp** saves the food with `upsertFood`:
- appends `{ name: "tbsp", g: 32 ÷ 2 }` (one decimal) to `servings_json`;
- renames the `serving` entry to `2 tbsp` (the quantity as typed, then the unit).

Then the entry being edited switches to the new unit with the same weight (½ serving, 16 g, becomes 1 tbsp), saved with
`updateLogEntry`. Past entries keep `serving` as stored; #880 keeps them editable.

## The panel, for any food (weigh your own)

1. Heading: `New serving for <food name>` (or, under the vague-serving block, no heading).
2. Two fields: a name (text, placeholder `bowl`, at most 40 characters) and grams (`inputmode="decimal"`, placeholder
   `grams`).
3. A live line: `1 bowl = 60 g · 234 kcal` (calories from the food's per-100 g figures, rounded; omitted for a food with
   no nutrition). While invalid: `Weigh it once, name it, and it's a serving from now on.`
4. Button **Add serving**; secondary style when it sits under the vague-serving block, primary otherwise. Disabled while
   invalid.
5. A footnote in `--text-xs` `--color-text-secondary`: `Saved to <food name>, so it's there next time. Past days don't
   change.`

**Add serving** appends `{ name, g }` to `servings_json` with `upsertFood`, then switches the entry to it with the same
weight, saved with `updateLogEntry`.

## After either save

In one update: the panel closes, the new serving is a pill and selected, the entry shows its new amount, and the toast
reads `Added tbsp (16 g) to Almond butter`. The food in the Library store is replaced with the reply (#785).

## Validation and states

| Case | Shows |
|---|---|
| Name already a serving of this food (case-insensitive) | Under the fields, `--color-danger-text`: `Almond butter already has a “tbsp”.` Button disabled |
| Name is `g` or `grams` | `Grams are always there. Name a portion instead.` Button disabled |
| Grams ≤ 0 or over 5000 | Button disabled, live line shows the hint |
| Saving | Button `Saving…`, `aria-busy`, fields disabled |
| Food save failed | `role="status"` line `Couldn't save the serving. Try again.`; panel stays with what was typed |
| Food saved, entry update failed | The serving stays added (pill present); #882's `Couldn't save. Try again.` for the entry |

## Edge cases

- The food has several servings and none is `serving`: no hint line; only **＋ Serving**.
- Several entries of the same food in the day: only the entry being edited switches; the others keep their unit.
- The panel is open and the editor closes (Done, another chip): what was typed is dropped. No confirmation.
- 375px: fields keep their two-column layout (number 4 characters wide, unit takes the rest); helper lines wrap.

## Copy

`＋ Serving` · `“serving” isn't a real amount.` · `Say what it is` · `What is 1 serving (<g> g) on the label?` ·
`Adds 1 <unit> = <g> g, and renames the serving “<qty> <unit>”.` · `Type the label's serving, like 2 tbsp.` ·
`Add <unit>` · `Add it` · `or weigh your own` · `New serving for <food>` · `1 <name> = <g> g · <kcal> kcal` ·
`Weigh it once, name it, and it's a serving from now on.` · `Add serving` ·
`Saved to <food>, so it's there next time. Past days don't change.` · `Added <name> (<g> g) to <food>` ·
`<food> already has a “<name>”.` · `Grams are always there. Name a portion instead.` ·
`Couldn't save the serving. Try again.`

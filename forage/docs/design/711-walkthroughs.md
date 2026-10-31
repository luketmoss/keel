# 711 — Forage walkthroughs

Specifies [#711](https://github.com/luketmoss/keel/issues/711). Tokens, spacing and touch targets come from
[`suite-language.md`](../../../ui/docs/design/suite-language.md); the shell and account button from
[`704-app-shell.md`](704-app-shell.md); the recipe sheet and the Cook choice sheet from #708, which owns the cook route and
its frame. There are no standing documents in `forage/docs/design/` beyond #702 and #704. The layout reference is the
approved prototype (https://claude.ai/artifact/JYyHpvdbgohjmzZZsN7jY1), `cookScreen`, `prepCard`, `usesHTML` and
`timersHTML`. The pattern for timers is Thrive's Lift Mode ([`577-lift-mode.md`](../../../thrive/docs/design/577-lift-mode.md)):
clocks never stop themselves, **nothing advances without a tap**, one primary button fixed at the bottom.

## Who owns what

| #708 (cook frame and log mode) | #711 (this note) |
|---|---|
| The Cook choice sheet, enabling Walkthrough only when `has_walkthrough` and `walkthrough_ok` | The Before you start, Prep and Cooking stages |
| The cook route, sticky header with elapsed clock, the timers bar and its timer component, the fixed action bar | The "Start N min timer" button on a step, which adds a timer to #708's bar |
| Leaving, the Done screen, the Cooks row, "Log 1 serving to Eaten" | The format, the validator, the API fields and the MCP tools |
| Log mode | Amount formatting and scaling for walkthrough text |

If #708's names for the frame differ from the ones used here, #708 wins and this note is read with its names. The cook
session's `servings`, `stage`, `step`, `done` (tick map) and `timers` are #708's state; walkthrough mode adds no other.

## Format v1

One JSON document per recipe, stored whole in the `Walkthroughs` tab (`format` = 1). Reference, as written for the
`forage_set_walkthrough` description:

```
{
  "format": 1,
  "recipe": "<the recipe id>",
  "note": "optional, one short paragraph shown on Before you start",
  "equipment": ["optional", "strings"],
  "prep": [ { "id", "title", "when", "uses": [..], "tasks": ["at least one"], "makes" } ],
  "cook": [ { "id", "title", "do", "uses": [..], "heat?", "lookFor?",
              "timer?": {"min", "label"}, "wait?": {"min", "label"}, "meanwhile?": ["prep ids"] } ]
}
```

- A `uses` entry is `{"line": "L3", "share": 0.6667}` (share optional, default 1) or `{"prep": "beef"}`.
- `when` is `start` (done before the stove is on) or the id of the cook step with a `wait` during which it is done.
- **No quantities anywhere**: lines and shares only. Where one recipe line is used in two places, the shares add up to 1
  (½ and ½, or ⅔ and ⅓).
- `timer` is an active countdown at the stove; `wait` is time away from it (simmering) and is the only step that can have `meanwhile`.
- Ids are lowercase words (`brown`, `veg-in`), unique across prep and cook.
- Use only the fields above.

## Validator

`validateWalkthrough(recipeLines, document)` returns `{ok, problems[], warnings[], summary}`. A save with `ok` false stores
nothing. Problems are collected whole, in document order, and at most 20 are returned, then `and 3 more`.

Every message starts with the part at fault: `cook <id> "<title>"`, `prep <id> "<title>"`, or `line <id> (<name>)`, then the
fix. Fixed text, no stack trace.

| Check | Message |
|---|---|
| `format` not 1 | `format: expected 1, got 2` |
| `recipe` not this recipe | `recipe: this walkthrough is for "rc_1", not "rc_2"` |
| Field not in the format | `cook brown: unknown field "lookfor"` (path as `prep beef.tasks[0]` for nested) |
| Missing or wrong type | `cook brown: "do" must be text` |
| Id missing or repeated | `cook brown: id is used twice` / `prep: a group has no id` |
| Line shares ≠ 1 (±0.02) | `line L2 (salt): shares add up to 0.5, not 1 (used in prep beef 0.5)` — and over 1 reads `…add up to 1.5, not 1 (used in prep beef 0.5, cook brown 1)` |
| Share out of range | `prep beef: share of L2 must be above 0 and at most 1` |
| Unknown line | `prep beef: no ingredient line L99` |
| Non-optional line never used | `line L5 (canola oil): never used in any prep group or cook step` |
| Unknown prep id | `cook brown: no prep group "beff"` |
| Prep group used before made | `cook veg-in "Add the vegetables": uses prep veg, which is only made during simmer, a later step` |
| Prep group used twice | `cook finish "Thicken and finish": prep beef was already used in cook brown` |
| Prep made, never used | `prep wine "Measure the wine": made but never used in a cook step` |
| Waiting group not listed | `prep thicken "Mix the thickener": its wait step veg-in doesn't list it under meanwhile` |
| `meanwhile` lists a group with another `when` | `cook simmer: meanwhile lists veg, whose when is "start"` |
| `meanwhile` on a non-wait step | `cook brown: meanwhile is only for steps with a wait` |
| `when` names a step with no wait | `prep veg: when must be "start" or the id of a cook step with a wait, not "brown"` |
| Both timer and wait | `cook simmer: a step has a timer or a wait, not both` |
| Minutes not above 0 | `cook brown: timer minutes must be above 0` |
| Prep group with no tasks | `prep beef: needs at least one task` |
| Cook step with no `do` | `cook brown: needs "do" text` |

Warnings (saved anyway, listed in the answer): `no step says what to look for`; `cook brown: "do" seems to give an amount
("2 tbsp"); amounts come from the recipe lines and would not scale`. The amount test is a number followed by cup, tbsp,
tsp, oz, lb, g, ml, clove or their plurals and spelled-out forms. "90 minutes", "1-inch" and "medium heat" do not match.

**Summary** (also what Before you start reads): prep group count and task count, cook step count, minutes of `timer`
(`active`) and minutes of `wait` (`waited`).

**Stale.** `getRecipe` and `getRecipes` run the validator on the stored document against the current lines. Failing gives
`walkthrough_ok: false` and `walkthrough_check.problems`. The edit that caused it is not refused.

## Walkthrough stages

All three sit in #708's frame: header and timers above, action bar below. The action bar has "Back" (secondary, left) and
the primary button, `--color-primary-fill` text `--color-on-fill`, at least 52px tall, as in Lift Mode.

### Amounts

An amount is the recipe line's `qty` × the entry's `share` (default 1) × cook servings ÷ recipe servings. Shown as
`<amount> <unit> <name>` with the name being the line's text up to its first comma or parenthesis, in the recipe's own unit
(no grams). Quantities round to the nearest ⅛ below 4, ½ from 4 to 10, and whole from 10; ⅓ and ⅔ are recognised. Nothing
under ⅛ shows a number: it reads `A little`. Units pluralise (`1 cup`, `1½ cups`, `2 cloves`) and a bare count (bay leaves)
has none. A line with no `qty` ("salt to taste", the optional rosemary) shows `Some`; an optional line adds `(optional)`.
Times never scale.

### 1. Before you start

Label "Walkthrough", title "Before you start" (`--text-2xl`). One card of three rows:

- **Servings** — "Amounts scale. Times don't." Stepper − / count / +, each 44px, from 1 to 24.
- **The plan** — "{p} prep groups first, then {n} cooking steps: about {active} min at the stove and {waited} of
  waiting. {m} more prep groups ({titles, lowercase}) happen during the waiting." The last sentence is omitted when m is 0, and
  durations over 60 min read `1 h 30 min`.
- **You'll need** — the equipment joined with ` · `, omitted with no equipment.

The document's `note` follows as muted text. Primary button: **Start prep**. With no `when: start` groups, the button reads
**Start cooking** and goes straight to Cooking.

### 2. Prep

Label "Prep · {done} of {tasks} done", title "Get these ready". One card per `when: start` group, in document order:

- Header: the title, and `{done}/{n}` tasks on the right.
- Uses rows: amount left, name right, as above; `From prep` for a `{prep}` entry (never present in a prep group).
- Task rows are full-width buttons, at least 56px: a check circle, then the text. `aria-pressed` follows the tick. Ticked: circle
  filled `--color-primary`, text `--color-text-muted` and struck through.
- Footer: "Makes: {makes}" on `--overlay-sm`.

Primary button **Start cooking**, or **Start cooking anyway** while tasks remain. Never disabled.

### 3. Cooking

Label "Cooking · step {i} of {n}". All steps are listed in one full-width card. Each header is a button
(`aria-expanded`): a 28px number circle, the title, and a duration chip (`10 min`) when it has a timer or wait.

- **Past** steps show a ✓ in the circle (`--color-primary`) and a secondary title; **future** steps a plain number and a
  secondary title; **now** is open, with a 3px `--color-primary` inset bar and the title at `--text-lg` 700.
- Tapping any header opens that step and makes it the current one. Only one is open.
- The open step shows, in order:
  1. **Heat** chip: `Heat: Medium` (omitted when absent).
  2. **`do`** at `--text-lg`.
  3. **Uses** card: amount/name rows, and `From prep` + `makes` for a prep group. A prep group with unticked tasks adds
     "{k} of {n} tasks not ticked" in `--color-warning` under its row.
  4. **Look for:** cue on `--overlay-sm` (omitted when absent).
  5. **Timer** (see below).
  6. **Meanwhile** (wait steps only): one dashed-border card per listed group, labelled "Meanwhile", containing the same
     prep card as Prep with live ticks. A tick here is the same tick as in Prep.
- Action bar: **Back** (to the previous step; on step 1 it reads **Prep** and returns to Prep, or **Before you start** when
  there are no prep groups) and **Next: {next title}**. On the last step the primary button reads **Finish** and hands to
  #708's Done screen. Next is always enabled.

### Timers

A step's `timer` or `wait` shows a block button, 52px, **Start 10 min timer** (or **Start 90 min wait**). Tapping adds a chip to
#708's timer bar: `{label}  {m:ss}` and a ✕ (`Remove the {label} timer`). Then the button is replaced by "{Timer|Wait} running
above. It doesn't move you on; tap Next when it's ready."

- A timer stores its end time, so it is right after the screen sleeps or the tab is backgrounded. It does not depend on a tick.
- At zero the chip turns `--color-warning-light` with `--color-warning` text and reads `Done`; a `role="status"` region says
  "{label} timer is up"; the device vibrates once if `navigator.vibrate` exists. The chip stays until removed.
- Timers survive moving between steps, tabs of the cook and stages. Two timers of one step cannot exist; removing a
  timer brings the button back.
- Nothing about a timer, a tick or a stage change moves the current step.

## States

| State | What shows |
|---|---|
| Opening | #708's frame, with skeleton rows in the card while `getRecipe` is in flight |
| Walkthrough ok | The stages above |
| Stale | The Cook choice sheet (#708) shows Walkthrough disabled: "Needs an update. Ask Claude to fix it with the Forage connector." Log mode is selectable |
| No walkthrough | Walkthrough disabled: "No walkthrough yet." |
| Failed to load | #708's error state |

## Edge cases

- A line cited by a share but removed from the recipe: stale as above; if the page is already open, it shows the amount as
  `Some` rather than crash.
- Servings 1: ⅛ thresholds apply, so a tiny share can read "A little".
- A prep group with `when` equal to a wait step that sits before every use: valid.
- A recipe with a walkthrough that is deleted while the cook is open: the cook continues from the loaded document.
- A very long `do` or task wraps; step titles wrap to two lines rather than truncate.
- A step with both a `lookFor` and no `uses` shows neither card empty.
- Rapid taps on Next: each moves one step; the last step cannot overshoot.
- Demo mode: the sample recipe list includes Beef Stew with its walkthrough (the fixture), so the stages can be walked in
  the demo. The "Demo — sample data" banner stays above the cook header.

## Demo mode

Gate as #704. Beef Stew (the fixture) with its walkthrough is in the demo data (#708 shares the recipe).

## Accessibility and layout

- 375px: no horizontal scroll; the timers bar scrolls inside itself; the action bar's two buttons share the width.
- Every control, including ✕ on a timer chip, is at least 44px.
- Step headers are buttons with `aria-expanded`; tasks `aria-pressed`; the current step's number carries `aria-current="step"`.
- Timer state is never colour alone: the chip reads `Done`.
- Reduced motion: nothing animates beyond a step opening.

## MCP tools (registered by #713's mechanism)

| Tool | Inputs | Calls | Result |
|---|---|---|---|
| `forage_set_walkthrough` (write) | `recipe_id`, `walkthrough` (object) | `setWalkthrough` | Saved summary, or the refusal |
| `forage_delete_walkthrough` (write) | `recipe_id` | `deleteWalkthrough` | Confirmation |
| `forage_get_recipe` (read, registered by #708) | `id` | `getRecipe` | Adds `walkthrough` and `walkthrough_check` |

**Saved:**
```
Saved the walkthrough for "Beef Stew" (rc_5d6e7f8a): 6 prep groups (15 tasks), 7 cook steps, 19 min of timed cooking, 120 min of waiting.
Warnings: cook brown: "do" seems to give an amount ("2 tbsp"); amounts come from the recipe lines and would not scale.
Undo with forage_undo, call 7c1e…
```
The Warnings line is omitted when there are none, and the reminder follows (#713).

**Refused** (no reminder):
```
Nothing saved. 2 problems:
- line L2 (salt): shares add up to 0.5, not 1 (used in prep beef 0.5)
- cook finish "Thicken and finish": prep beef was already used in cook brown
Fix these and call again.
```
A recipe that does not exist: `Nothing saved. There is no recipe rc_5d6e7f8a.` The format reference is the
`walkthrough` input's description, so the tool needs no other guide, and it adds: "Get the recipe with forage_get_recipe
first: use its line ids (L1, L2…), and write no quantities."

`forage_get_recipe` for a stale walkthrough ends with `Walkthrough needs an update: <problems>`.

## Measured

Nothing is measurable yet: there is no running Forage app. The 44px and 375px criteria are checked in `/test` with
`getBoundingClientRect()`, per `stack-web`. The prototype's `validate.mjs` was run on the Beef Stew fixture (accepted: 6 prep groups, 15 tasks, 7 cook steps, 19 min
timed, 120 min waits) and on four broken copies, one per mistake; each was refused. The "used before made" copy was refused
twice, because a group used early is also then used twice: the new messages must keep both.

## New tokens

None. `--color-primary`, `--color-primary-light`, `--color-primary-fill` and `--color-on-fill` are the app's primary family
as #704 lands it.

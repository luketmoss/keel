# 638 — Library header, pill switch and template cards

Part of #637. Prototype board "Library · Templates"
(https://claude.ai/artifact/2jw8SJaaHJ15fcXxL3Gc8B). This note replaces the
Library's `h1` and segmented switch on both tabs, and the template rows on the
Templates tab. #639 reuses its summary; #642 sits under its header.

Standing documents this answers to: `ui/docs/design/suite-language.md` and
`ui/docs/design/keel-wide-rules.md`. Earlier notes kept: #485's card and figures,
#527's Activities header, #528's card duration rule and week headings, #404's
interaction states, the focus handoff (`data-focus-key`).

## Header (both tabs)

The Activities header (`.activities-header`), with a plain meta line where
Activities has its month button:

```
3 templates · 19 exercises
Library
[Templates] (Exercises)
```

- **Meta line:** `--text-sm`, 500, `--color-text-secondary`. It reads "3
  templates · 19 exercises", singular for one ("1 template"). With nothing
  loaded yet it is left out, never "0 templates". It is a `p`, not part of the
  heading.
- **Title:** `h1.day-title`, "Library".
- **Switch:** a `nav` named "Library" holding two buttons in the
  `.filter-chip` family (with `.filter-chip.active` for the current one),
  `--space-sm` apart, `--space-sm` below the title. The current one has
  `aria-current="page"`. `data-focus-key="library-switch:templates"` and
  `library-switch:exercises` are kept, and so is today's `navigate`. It has no
  icons. The switch is a place, not a filter, but the pill is the one control
  family this app uses for "pick one of these", and a second family would be
  worse.

`.library-switch` and `.library-switch-btn` are removed.

## Template card

One `button` per template, full width, `--color-surface`, `--radius-lg`, no
border, padding `--space-md`, cards `--space-sm` + `--space-xs` (12) apart. It
opens `#/templates/<id>`, and keeps `data-focus-key="template:<id>"`.

```
[dumbbell] Upper Push A
8           20             1:02 h
exercises   working sets   last took
[=== warm-up ==|===== primary =====|== SS ==|= burnout =]
■ 2 warm-up  ■ 1 primary  ■ 2 supersets  ■ 1 burnout
─────────────────────────────────────────────
Last done Thu, Oct 22                     View ›
```

- **Name row:** the weight icon (#405, 18px, `--type-weight`, `aria-hidden`),
  then the name, `--text-lg` 700, wrapping.
- **Figures:** a three-column grid (`TemplateSummary`, shared with #639),
  `tabular-nums`. Each figure is `--figure-md` 700 with `line-height: 1`, and
  its word sits under it in `--text-xs` `--color-text-secondary`:
  - **exercises:** the number of rows in the template
  - **working sets:** the sum of Sets over rows whose section is not
    `warmup` or `cooldown`. A blank Sets counts as 1, as saving already
    treats it
  - **last took:** the Elapsed (`elapsed_seconds`) of the most recent
    finished workout whose `template_id` is this template, picked by date
    then time. "Finished" means `status` blank (not `planned`) and not the
    workout in progress (`activeWorkoutId`). It is
    formatted by #528's duration rule: "58" + unit "min" under an hour,
    "1:02" + unit "h" from an hour. The unit is `--text-sm`, 400,
    `--color-text-secondary`, on the figure's baseline. With no such
    workout, or with Elapsed blank on it, the figure is "—" in
    `--color-text-muted`. Never "0"
- **Section-mix bar:** a 6px flex row, `--space-xs` - 1 (3) gap,
  `--radius-full` segments, each `flex-grow` equal to the section's total
  sets (warm-up and cool-down included). Segments go in the order sections
  first appear. `aria-hidden="true"`: the legend carries it.

  | Section | Colour |
  |---|---|
  | warmup | `--sec-warmup` |
  | primary | `--sec-primary` |
  | SS1, SS2, SS3 | `--sec-ss` (one segment each) |
  | burnout | `--sec-burnout` |
  | cooldown | `--color-border-strong` |
- **Legend:** a wrapping row, `--text-xs`, `--color-text-secondary`, gap
  `--space-xs` × `--space-sm` + `--space-xs`. Each item is an 8px
  `--radius-sm` swatch, then the words. The counts are exercises per kind,
  with supersets counted as groups: "2 warm-up", "1 primary", "2 supersets"
  (or "1 superset"), "1 burnout", "1 cool-down".
- **Footer:** a hairline (`--color-border-light`) above, `--space-sm` +
  `--space-xs` padding on top, `--text-sm`. "Last done …" is on the left in
  `--color-text-secondary`. On the right, "View" and a 16px chevron are in
  `--color-primary-text`. Both are inside the one button: the chevron is the
  affordance, not a second target.

### Last done words

From the same workout as last took:

| When | Words |
|---|---|
| today (Denver) | Last done today |
| yesterday | Last done yesterday |
| this year | Last done Thu, Oct 22 |
| earlier years | Last done Oct 22, 2025 |
| none | Not done yet |

### Accessible name

One name on the button: name, "8 exercises", "20 working sets", "last took 1
hour 2 minutes" (or "58 minutes"), and the last-done words spoken in full
("last done Thursday October 22", or "not done yet"). A blank figure's part is
left out. The legend is not spoken: the counts are in the name already.

## Order

The most recently done template comes first. Templates never done come after
those, by name (`localeCompare`). A template done twice in a day sorts by the
later time.

## States

- **Loading:** today's loading treatment for templates, unchanged.
- **Empty:** "No templates yet. Tap + to build one." in `--text-sm`
  `--color-text-secondary`, centred, with `--space-xl` padding.
- **Workouts not loaded yet:** the cards render with "—" for last took and
  "Not done yet" for last done, in name order. They re-sort when workouts
  arrive. Focus stays on the focused card, by its focus key.
- **FAB:** unchanged.

## Interaction states

The card is #404's surface button: hover `--state-hover` overlay, pressed
`--state-pressed`, and a `:focus-visible` 2px `--color-primary` ring at 2px
offset. It has no selected or disabled state. The pills keep `.filter-chip`'s
states.

## Contrast

All the text uses existing pairs: `--color-text`, `--color-text-secondary`
and `--color-text-muted` on `--color-surface`, and `--color-primary-text` on
`--color-surface`, all measured in `suite-language.md` and the keel-wide
registry. The swatches and segments are data colours beside their words, not
text.

## Removed

`sectionSummary` and the `.template-card-body` / `.template-name` /
`.template-summary` / `.template-count` rules, with their tests rewritten for
the new card.

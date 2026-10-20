# 528 — Activity cards, week groups and the Up next row

Part of #525. Uses #526's `--type-*` tokens and tinted tile. Board A of the
prototype (https://claude.ai/artifact/3EKueKvLjDGy2Now8unv9m). Replaces the
completed-workout card, the "This Week / Last Week / Earlier" grouping and the
Planned section on the Activities screen. #529 and #530 fill the card's visual
slot later; until then every card uses the type-icon tile.

Earlier notes kept: #405's drawn icons, #404's interaction states, #347's rule
for what is overdue, #362's In progress card, the focus handoff
(`data-focus-key`).

## The card

One `button` (as today; it navigates to `#/history/<id>`), full width,
`--color-surface`, `--radius-lg`, no border, padding `--space-sm` +
`--space-xs` (12) on the right, top and bottom, and `--space-md` on the left.
Cards are `--space-sm` apart.

```
[icon] 15.0 mi                      [ visual ]
1:47:53 · 8.4 mph · ↑1,620 ft        [  slot  ]
Sun · Mountain Bike
```

- **Line 1:** the type's #405 icon at 18px in `--type-<type>`, then the big
  figure at `--figure-md`, 700, `line-height: 1`, then its unit in `--text-sm`
  `--color-text-secondary` on the same baseline.
- **Line 2, the stats line:** `--text-sm`, `--color-text`, with
  `tabular-nums`. Parts are separated by
  " · ". It's a single line, truncated with an ellipsis.
- **Line 3:** `--text-sm`, `--color-text-secondary`: "Sun · Mountain Bike", a
  single line truncated with an ellipsis. The name falls back to the type's
  word when blank, as today.
- **Visual slot:** 92×80, `--radius-md` + `--space-xs` (12), on the right,
  vertically centred. Its default is the **type-icon tile**: the #526 tint as
  background, with the type's #405 icon at 40px (`--icon-lg`) in
  `--type-<type>`, centred. `aria-hidden="true"`.

### The big figure

| Activity | Figure | Unit |
|---|---|---|
| bike, hike, run, walk with `distance_m` | miles, one decimal | "mi" |
| anything else with `elapsed_seconds` | under 60 min: minutes | "min" |
| | 60 min and over: h:mm ("1:48") | "h" |
| no distance, no duration | "—" in `--color-text-muted` | none |

### The stats line

Each part is left out when its source is blank. None is ever "0" or "—". With
no parts at all the line is left out and the card is two lines.

| Type | Parts, in order |
|---|---|
| bike | elapsed as h:mm:ss (only when the figure is distance) · speed "8.4 mph" · ascent "↑1,620 ft" |
| hike, run, walk | elapsed (as bike) · pace "12:40 /mi" · ascent |
| weight | avg heart rate "89 bpm" · effort word |
| stretch | effort word · the note's first line |

- **Speed** is distance over **elapsed** time, one decimal. COROS's list does the
  same: 15.04 mi in 1:47:53 shows 8.4. **Pace** is elapsed over distance, as
  m:ss per mile. Both need both values.
- **The effort word** is drawn in `--effort-easy`, `--effort-medium` or
  `--effort-hard` (#526), with no pill background, at 600.
- **The note's first line** is the text up to the first line break. The line
  ellipsis truncates it.

### The day

"Today" or "Yesterday" where they apply. Otherwise the three-letter weekday
("Sun"), because the week heading above gives the dates.

### Accessible name

One name on the button, in this order: name, type word, day spelled out ("Sunday
October 18"), the figure with its unit spelled out ("15.0 miles", "33
minutes"), each stats part spelled out ("1 hour 47 minutes", "8.4 miles per
hour", "1,620 feet climbed", "average 89 beats per minute", "easy"), the
note's first line, and #157's provenance speech. Parts with no value are left
out. #529 appends "worked …" to it.

## Week groups

Monday-to-Sunday weeks, newest first, inside the shown month (#527). Without
#527 (shipped out of order), it's the whole history.

- **Heading row:** `h2` on the left, `--text-sm` 600 `--color-text-secondary`;
  totals on the right, `--text-xs` `--color-text-muted`, `tabular-nums`.
  Padding 0 `--space-xs`, `--space-sm` below.
- **Heading words:**
  - "This week": the week holding today
  - "Last week": the one before it
  - otherwise the range: "Oct 5 – 11", or "Sep 29 – Oct 5" when the week
    crosses a month, or "Dec 29, 2025 – Jan 4" across a year
- **Totals:** "7 · 6 h 40 · 23.2 mi". That is the count, then the sum of
  durations ("45 min" under an hour), then the sum of distances in miles. A
  part with nothing to sum is left out.
- **First week in a month:** a week that started in the previous month still
  shows its full range, but counts only the shown month's activities.
- **Spacing:** `--space-lg` above each group.

## In progress

Unchanged from today (#362): the In progress card stays first, above Up next.
It's shown only on the current month.

## Up next

Shown only when the current month is chosen and at least one workout is planned
for today or later, or is overdue (#347's rule).

- **Heading row**, the same style as a week heading: "Up next" on the left,
  "3 planned" on the right.
- **Row:** cards scroll horizontally, `--space-sm` apart. There's no visible
  scrollbar, and the row bleeds to the screen edge so a cut-off card shows
  there's more. Scroll snapping is on (`scroll-snap-type: x proximity`).
- **Order:** overdue first (oldest first), then by date, then sheet order.
- **Card:** a `button` opening `#/history/<id>`, 150px wide (the prototype's
  size; it fits two and a half at 375px), transparent, `1px dashed
  --color-border`, `--radius-md` + `--space-xs`, padding `--space-sm` +
  `--space-xs` (12). It holds three lines:
  1. The date label: `--text-xs`, 700, upper case, in `--color-primary-text`.
     It's "TODAY" or "TUE 21". An overdue card instead shows today's
     `.badge-overdue` badge ("Overdue") followed by "OCT 18" in
     `--color-text-secondary`, so the status keeps its word and its existing
     measured colours.
  2. The name: `--text-sm` 600, one line with an ellipsis.
  3. Meta: `--text-xs` `--color-text-secondary`. It's "12 exercises · 26
     sets" for weight, else the estimate "~25 min", whichever are present. With
     neither, it's the type word.
- **Accessible name:** "<name>, planned for <weekday month day>" or "<name>,
  overdue, was planned for …", plus the meta spoken.
- Overdue actions (Move to today, Reschedule, Start now) stay on the Day screen
  and the detail screen. The Up next card doesn't carry them.

## Empty and filtered

- **Current month, nothing completed:** under the summary card it reads
  "Nothing logged yet. Tap + to start a workout." (`--text-sm`,
  `--color-text-secondary`, centred, `--space-xl` padding). Up next still shows
  above it when there are plans.
- **A type chip leaves nothing:** "No bike activities in October." (lower-case
  type word).
- **Loading:** the existing loading treatment, unchanged.

## Removed

- `TYPE_COLORS` and the inset `--type-accent` box-shadow on cards (the icon
  carries the type now).
- The type badge and the date/time column on completed cards.
- The "Planned" section of full-width cards. Its cards move into Up next.
- `groupWorkoutsByDate`'s three fixed labels, replaced by a week grouper; its
  tests are rewritten for the new labels.

## CLAUDE.md

`thrive/CLAUDE.md`, UX Design Decisions: the "Activity cards" line becomes
"**Activity cards**: one big figure (distance, else duration), a stats line, day ·
name, and a visual on the right (route, muscle figure, or type tile); no type
badge (decided 2026-10-20, #525). Tap to view details".

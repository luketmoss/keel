# 489 — The Training card: sets ring, Up next, 7-day load

Part of #484; uses #485's tokens. Redraws #238's Training panel and #347's
carried-over cards. What the panel lists and in what order (`trainingOrder`,
shared with the Calendar's day summary, and `overdueForToday`) does not change;
this adds one card (Up next) and one block (7-day load).

## Card title

"Training", icon a drawn barbell in `--color-primary`. Right of the title,
`--text-xs` `--color-text-muted`: "1 done", "2 done · 1 planned",
"1 planned" — counts of what is listed below, omitted when nothing is.

## Done card

One link, as now (`#/history/<id>`, or `#/workout/<id>` when active):

`[ring] Name                      [TYPE badge]`
`       33 min · 22/26 sets       [Easy chip]`

- Background `--color-surface-raised`, `--radius-md` + `--space-xs` (12),
  padding `--space-sm` `--space-md`, no border.
- **Ring**, 52px: a full circle track in `--color-border-light`, the value arc
  in `--color-primary` from 12 o'clock, its share = logged sets / planned sets
  for a `weight` workout; the logged count in the middle at `--text-base` 700.
  Logged = the workout's set rows with reps or weight entered (the MCP
  server's `isSetLogged` rule for a non-planned workout, `mcp/src/thrive/domain.js`;
  the frontend has no copy yet, so this issue adds one in `src/api/` with a
  comment naming the other); planned = all its set rows. With no set rows the
  ring is omitted and the type icon is drawn instead.
- Not `weight`: the ring is replaced by the type's #405 icon on a 52px
  `--color-primary-light` circle.
- Meta line: duration as now (moving, else elapsed), then for weight
  "22/26 sets", for distance types the distance. `--text-sm`
  `--color-text-secondary`, the figures in `--color-text` 600.
- Type badge and effort chip as today (`.type-badge`, `.workout-effort-*`).
- In progress: the chip "Active" as today, and the name reads
  "<name>, in progress. Resume workout." (#362).

## Planned card (today's plans, overdue, Up next)

`[WED]  Name                            ›`
`[ 21]  Up next · 12 exercises · 26 sets`

- Transparent background, `1px dashed --color-border`, same radius and padding.
- **Date block**, 36px wide: weekday abbreviation (`--text-xs`, 600,
  `--color-primary-text`, upper case) over the day number (`--text-lg`, 700).
  On today's own plans it reads "TODAY" over the number.
- Meta: `[Up next · ]` + counts (as today: "N exercises · N sets" for weight)
  + estimate ("~45 min") — whichever are present.
- A chevron (`--color-text-muted`) at the right; no badge for a plan dated
  today, **"Overdue"** badge (`.badge-overdue`, unchanged) for a carried card.
- Overdue cards keep their actions row (Move to today · Reschedule · Start now)
  below and outside the link, with #347's focus rules unchanged.

## Up next

Today only. The first workout with `status = planned` and `date > today`, by
date then sheet order. One card, after today's own cards and before the load
block. Not shown on past or future days, nor when nothing is planned after
today. Its link opens the workout's detail view, like any planned card. Its
accessible name: "Up next, Wednesday October 21: Upper Push B, planned".

## 7-day load

Under the cards, separated by `--space-md`:

`7-day load            ▂ ▂ ▁ ▅ ▄ ▆ ▅`
`460                   T W T F S S M`

- Left: the label (`--text-xs` `--color-text-secondary`; "7-day load so far"
  on today) over the total at `--figure-lg`.
- Right: seven columns, oldest left, ending on the viewed day. Each a 14px-wide
  track (`--range-track`, `--radius-sm`) 54px tall, holding a bar in
  `--color-primary` at 45% opacity, the viewed day's at full opacity. Height is
  value / the week's maximum. Day letters under each in `--text-xs`
  `--color-text-muted`; the viewed day's in `--color-text` 700.
- The total sums the non-blank `training_load` values. A blank day has an empty
  track (no bar) and counts nothing. All seven blank: the block is not drawn.
- `role="img"`, name "Training load, Tue to Mon: 50, 44, no data, 81, 70, 94,
  81. Total 380."
- Shown on today and past days; never on a future day (no DailyHealth exists).
- While `dailyHealth` is loading or failed, the block is omitted; the cards
  still show (they read `workouts`, which loads separately).

## Empty states (unchanged words)

The panel's existing notes stay: today with nothing planned or done, a past day
with nothing, a future day with nothing planned. If the 7-day load block draws,
it draws under the note.

## Removed

The old card's left-edge type accent and its bordered style, on the Day screen
only. Activities cards are untouched.

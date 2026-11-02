# 771: The indoor ride detail (Spin rides)

Part of #764. This is the activity detail of a `source = spin` row. The prototype's "Thrive · Indoor ride detail" artboard
(https://claude.ai/artifact/EXun1UbyRcgj1PfnhS7kq2) shows what the screen is for; this note, not the prototype, sets
its layout. It builds on #531's shell ([531-detail-shell.md](531-detail-shell.md)) and #532's hero and sheet
([532-detail-map-hero.md](532-detail-map-hero.md)). Its data comes from #765: the ride fields AE:AM in the
frontend mirror, and `getWorkoutStreams`, which returns the `thrive-spin-streams` v1 file. The zones and their colours
are #767's ([767-spin-library.md](767-spin-library.md) §Workout maths, §New tokens). The Spin workout's name is read
the way #772 reads it ([772-ftp-trends-spin-plans.md](772-ftp-trends-spin-plans.md) §Reading it on the detail screen).

Standing documents this answers to: `ui/docs/design/suite-language.md` and `ui/docs/design/keel-wide-rules.md`. The
rules that shape it are: one axis per chart, blank breaks the line, blank is not zero, never colour alone, 44px
targets, and all six interaction states. `thrive/docs/design/` has no standing document of its own.

**Trainer rides are ordinary activities** (epic decision). Nothing here adds a card, a route or a screen of its own.
Everything below is conditional on the row's data, so a ride that lacks some of it degrades to #531's screen.

## Not carried from the prototype

| Prototype | Why not |
|---|---|
| Heart rate overlaid on the power plot, on its own scale | The suite allows one axis per chart. Heart rate gets its own panel under power, on the same time axis (small multiples) |
| A dark header holding the title | The title block stays in the sheet, as on every detail screen (#531). The hero follows the theme (`--color-surface`), so every text and line token keeps the contrast it was measured at. A dark-in-both-themes hero would need its own palette and new measurements |
| Navy target blocks | Blocks take their zone's colour, the same colours as the zones card and Spin's profile (#767) |
| The Effort tile | Effort is the title block's chip (#531) |
| "Recorded by … KICKR (ERG)" and "Heart rate: Garmin HRM chest strap" | Neither the row nor streams v1 records the trainer, the mode or the heart rate monitor. The provenance row says Thrive Spin |
| Notes in the details list | The Note card (#531) already shows them |
| "Download FIT file" | Not built. The SPA cannot read Drive, so a download needs a new token API action that streams up to 5 MB of base64, plus an Apps Script deploy. Nothing in the epic consumes the file. See the issue's Proposal |

## Measured first

Measured in the running app in demo mode (`/?demo=true`, root `.claude/launch.json` entry `thrive`) on the demo indoor
bike "Evening Ride" (`#/history/w_demo003`, no track and no distance, which is the shape of a Spin row today), with
`getBoundingClientRect()` and canvas `measureText` in the app's own font stack. Sizes are width × height in px.

| Target | 375 × 812 | 320 × 700 |
|---|---|---|
| Page `scrollWidth` | 375 | 320 |
| `.detail-stats-card` | 343 × 81, padding 16, so 311 inside | 288 × 81, so 256 inside |
| `.detail-top-bar` (no hero) | 375 × 52; Back at x 12, y 8, 44 × 44 | not measured |
| `.detail-note-card` | 343 × 73 | not measured |

`.has-hero .detail-top-bar` (from `global.css`, not rendered: demo has no Maps key) pads its top by
`--space-sm` + `--space-xs` (12) over 44px buttons, so a hero's content must start below 56 + safe area. That fixes
`--detail-bar-clearance` (below) at 64, which leaves `--space-sm` under the buttons.

Text widths at `--text-sm` (14px) and `--text-xs` (12px), for the Intervals columns at the narrowest card (256 inside):

| String | Width |
|---|---|
| "125–175 W" (semibold) | 66 |
| "Resistance" | 64 |
| "225 W" (bold) | 42 |
| "151" | 23 |
| "Sweet spot" (semibold) | 70 |
| "Target" / "Avg" / "HR" headers (`--text-xs` bold, upper bound) | 44 / 24 / 17 |
| "Z4 · Threshold" | 87 |
| "1:02:03" (bold) | 48 |
| "FTP 250 W" (`--text-xs` semibold) | 58 |

With columns Target 72, Avg 48, HR 32 and three `--space-sm` gaps (24), Step keeps 80 at 320, so "Sweet spot" fits
on one line and a longer label wraps. Nothing scrolls sideways. This backs the criterion "`scrollWidth` 320 at
320 × 700".

## When each part shows

| Row | Hero | Power cells | Intervals, zones | Ride card | Avg cadence |
|---|---|---|---|---|---|
| `source = spin`, completed, `streams_ref` set, API URL or demo | **ride hero** | yes | yes, once streams arrive | yes | once streams arrive |
| `source = spin`, `streams_ref` blank | none (#531, no hero) | yes | no | yes | no |
| `source = spin` with a `track_ref` too (a #773 merge keeps one) | **ride hero**: streams win indoors | yes | yes | yes | yes |
| COROS indoor bike, hand-logged indoor bike | as today | only if AE:AI hold values (they never do outside Spin) | no | no | no |
| Build with no `VITE_THRIVE_API_URL` | none | yes | no | yes | no |

"Power cells" and the Ride card read the row alone, so they never wait on the network.

## Layout

```
┌──────────────────────────┐  ← ride hero, --color-surface, --detail-ride-hero-height
│ (‹)              (✎)(⋯) │  ← #531's bar, floating, #532's scrims
│                FTP 250 W │
│ ▅▅▅ ▂▂ ▆▆▆ ▂▂ ▆▆▆ ▂▂ ▃▃ │  ← power panel: zone blocks, power line, FTP line, ¦ pause marks
│                98–171 bpm│
│ ～～～～～～～～～～～～ │  ← heart-rate panel
│ 0:00   20:00  40:00 1:00:00│ ← shared time axis
│ — Power  ▬ Target  — Heart rate  ¦ Pause │
╰──────────────────────────╯
╭──────────────────────────╮  ← #532's sheet, overlapping by --space-lg
│ title block (#531)       │
│ stats card + power cells │
│ Intervals                │
│ Time in power zones      │
│ Ride                     │
│ Note (#531)              │
│ provenance row           │
```

Order in the sheet: title block, stats card, **Intervals**, **Time in power zones**, **Ride**, Note, provenance. These
take the Elevation and Trails cards' place. A Spin ride has no track to give them.

## The ride hero

- **Box.** `.detail-hero.detail-ride-hero`: full width, height `--detail-ride-hero-height`, ground `--color-surface`.
  The screen takes `has-hero`, so #532's floating bar, its scrims and the sheet's `--space-lg` overlap and radius
  apply unchanged. Padding: top `--detail-bar-clearance` plus `env(safe-area-inset-top)`, sides `--space-md`,
  bottom `--space-lg` + `--space-sm` (clear of the sheet).
- **Inside**, a flex column with `--space-sm` gaps: the power panel (`flex: 1`), the heart-rate panel (height
  `--ride-hr-plot-height`), the time axis, the legend. When the heart-rate panel is absent the power panel takes its
  space, so **the hero's height never changes** between loading, error and ready, with or without heart rate.
- **One `<figure>`**, `role="img"`. Its accessible name: "Power against target over 1:00:00" + ", heart rate 98 to
  171 bpm" (when there is heart rate) + ", 1 pause" / ", <n> pauses" (when any). The Intervals table is the data
  alternative and is announced normally.

### Buckets (downsampling)

Charts come from buckets, never from raw seconds, so a 12-hour ride draws as cheaply as a 20-minute one.

- `B = min(n, 300)` buckets for n samples. Bucket `k` covers samples `floor(k·n/B)` to `floor((k+1)·n/B) − 1`.
- A bucket's **power**, **heart rate** and **target** are each the mean of that array's non-null samples in it,
  unrounded. A bucket with no non-null sample is `null` for that series.
- `x` of bucket `k` is its middle second. The x scale runs from 0 to n, which is ride time. Pauses take no width,
  because the file omits paused seconds.
- Fewer than 2 samples: the hero shows "This ride is too short to draw." (`--text-sm`, `--color-text-secondary`,
  centred) in place of the panels. Intervals and zones still show.

A bucket mean smooths short spikes. That is deliberate: at about 340 drawable px, a 1 s spike would be one pixel
anyway. The Intervals table carries the exact averages.

### Power panel

- **y scale**: 0 at the bottom. The top is 110% of the largest of: the highest bucket power, the highest bucket
  target, and FTP. Nothing clips, and the FTP line always sits below the top.
- **Target blocks**: one rect per bucket with a non-null target, from 0 to the target, `fill` the zone token of
  target × 100 ÷ FTP (§Zones), at `--ride-target-opacity`, and no stroke. Neighbouring rects of one zone touch,
  so a steady step reads as a block and a ramp reads as a staircase. Without an FTP, every block is
  `--color-border`.
- **FTP line**: 1px dashed `--color-border-strong`, full width, labelled at its right end "FTP 250 W" (`--text-xs`
  semibold, `--color-text-secondary`, above the line). No FTP: no line.
- **Power line**: `--color-text`, 1.5px (`vector-effect: non-scaling-stroke`), round joins, through bucket powers.
  **A null bucket breaks the line.** It is drawn as separate segments, never bridged and never drawn at 0. A lone
  non-null bucket between gaps is a dot of the line's width.
- **Pause marks**: for each `pauses[]` entry, a 1px dashed vertical line in `--color-border-strong` at `x = at_s`,
  across the power and heart-rate panels.

### Heart-rate panel

- Shown only when at least one `hr_bpm` sample is non-null.
- Height `--ride-hr-plot-height`. The y scale runs from the lowest bucket heart rate − 5 to the highest + 5.
- A line in `--metric-heart`, 1.5px, broken at null buckets exactly as power is.
- Label at the top right: "98–171 bpm" (the lowest and highest bucket means, rounded; `--text-xs`,
  `--color-text-secondary`).

### Time axis and legend

- **Axis**: four labels under the panels (`--text-xs`, `--color-text-secondary`, `tabular-nums`), at 0 and at
  thirds of n, rounded to the minute, formatted as `formatClock` (#531): "0:00", "20:00", "40:00", "1:00:00". The
  first is left-aligned, the last right-aligned, the middle two centred on their x.
- **Legend**: one line, `--text-xs`, `--color-text-secondary`, items `--space-md` apart, each a swatch and a word:
  - "Power": a 14 × 2 bar in `--color-text`
  - "Target": a 14 × 8 block in `--zone-4` at `--ride-target-opacity`, `--radius-sm`
  - "Heart rate": a 14 × 2 bar in `--metric-heart`, only when the heart-rate panel shows
  - "Pause": a 1 × 10 dashed mark in `--color-border-strong`, only when there are pauses

  Swatches are `aria-hidden`. The words carry the meaning (never colour alone).

### States in the hero's area

Every state fills the same box, as #532's do, so nothing below moves. The bar floats over each and stays usable.

| State | Hero shows |
|---|---|
| Loading | "Loading ride…" centred, `--text-sm` `--color-text-secondary`, `role="status"` `aria-busy="true"` |
| Error (network, timeout, token refused, file refused by the API, response failing the boundary check) | "Couldn't load the ride's power data." and **Try again** (`btn btn-secondary`), `role="status"`. Try again refetches |
| Too short (n < 2) | "This ride is too short to draw." |
| Ready | the figure above |

The sheet renders at once in every state. While loading or after an error, the sheet has the title, the stats card
without Avg cadence, the Ride card, the Note and provenance. Intervals and the zones card are absent (no
placeholders), and appear when the streams arrive, as #532's Elevation card does. The reason for a failure goes to
the console once, as a kind only (`console.warn('ride streams:', kind)`). It never includes the token or any part of
the file.

## Fetching and the boundary check

- `getWorkoutStreams` through `callAction` (`fields: {id}`) with the user's token, the way `getWorkoutTrack`
  is called. Demo mode reads bundled streams instead, and an unset API URL makes no call (no hero at all, per the
  table above).
- **Boundary check** (failure = error state): `format === "thrive-spin-streams"`, `v === 1`; `power_w`,
  `target_w`, `hr_bpm` and `cadence_rpm` are arrays of one length n, 1 ≤ n ≤ 43200, every entry an integer or
  `null`; `steps` is an array of `{start_s, end_s, label, mode}` with `0 ≤ start_s ≤ end_s ≤ n`; `pauses` is an array
  of `{at_s, duration_s}` with integer `0 ≤ at_s ≤ n` and `duration_s ≥ 0`. `ftp_w` is a positive integer or
  absent/null.
- **Session cache**, keyed by workout id. It keeps the **derived** result (buckets, interval rows, zone seconds,
  average cadence, pauses, heart-rate range), not the raw arrays. A second visit renders from it at once, with no
  loading state. Failures are not cached. At most one request per workout is in flight, and a response for a screen
  that is no longer showing is dropped (the track hook's `alive` rule).

## Stats card: the power cells

#531's card and rules (a blank source leaves its cell out; never "0" or "—"; units spelled in `aria-label`). A row
with any of AE:AI gets these cells, in this order, after any Activity time or Avg speed cell:

| Label | Value | Spoken |
|---|---|---|
| Avg power | `avg_power_w` "W" | "190 watts" |
| Norm. power | `np_w` "W" | "215 watts normalized" |
| IF | `intensity_factor`, two decimals, no unit | "intensity factor 0.86" |
| TSS | `tss`, no unit | "training stress score 74" |
| Work | `work_kj` "kJ", grouped | "683 kilojoules" |

Then #531's Avg heart rate, Elev gain/loss, Calories and Moving time, unchanged. **Avg cadence** "<n>" "rpm"
("90 revolutions per minute") comes **last**: the mean of the non-null, non-zero `cadence_rpm` samples, rounded half
up. Zero is excluded because 0 rpm is coasting, not a cadence, and every trainer app averages it that way. It
appears when the streams arrive, and being last, it moves no other cell. The headline stays #531's: the duration
from `elapsed_seconds` (Spin sends no distance). A one-hour ride with every field has 9 cells, 3 full rows.

## Intervals

A card (`--color-surface`, `--radius-lg`, padding `--space-md`), `h2` "Intervals" (`--text-base` 600). It holds a
real `<table>` with the `h2` as its caption (`aria-labelledby`).

- **Rows**: one per `steps[]` entry with `end_s − start_s ≥ 1`, in file order. Repeats are unrolled, because
  the file records them that way. A skipped step shows the time it actually ran.
- **Hidden** when fewer than two rows remain and none has a non-null target. A free ride is one long step with no
  target, which says nothing a table would add.
- **Columns** (header row `--text-xs` 600 `--color-text-secondary`; the numeric columns right-aligned and
  `tabular-nums`):

| Header | Cell | Style |
|---|---|---|
| "Step" | a `--space-sm` square in the step's zone colour, `--radius-sm` (`--color-border` for a step with no target); the label (`--text-sm` 600, wraps); under it the duration `m:ss` / `h:mm:ss` (`--text-xs` `--color-text-secondary`) | |
| "Target" | every non-null `target_w` in the step equal: "225 W". Otherwise "<first>–<last> W" (a ramp, or intensity changed mid-step). All null: the mode word, "Resistance", "Slope" or "Free" | `--text-sm` `--color-text-secondary` |
| "Avg" | mean non-null `power_w`, rounded half up, "<n> W"; none: "—" | `--text-sm` 700 |
| "HR" (`abbr="Heart rate, bpm"`) | mean non-null `hr_bpm`, rounded, no unit; none: "—" | `--text-sm` `--color-text-secondary` |

- The step's zone (square colour) is the zone of its mean non-null target × 100 ÷ FTP.
- The HR column is left out entirely when the ride has no heart rate at all.
- Rows are at least 44px tall, separated by `--color-border-light` hairlines, with `--space-sm` column gaps. They
  are not interactive: no hover, no focus.
- "—" here means no reading. The card's own text says nothing more, because the chart's gap already shows where
  it happened.

## Time in power zones

A card, `h2` "Time in power zones". A `<ul>` of six rows, Z1 to Z6, always all six:

```
Z1 Active recovery   ▇▇▇▇▇            4:10   7%
< 140 W
Z2 Endurance         ▇▇▇▇▇▇▇▇▇▇▇▇    12:02  20%
140–189 W
```

- **Zone of a second**: `pct = power_w × 100 ÷ FTP`. Z1 if pct < 56, Z2 < 76, Z3 < 91, Z4 < 106, Z5 < 121, else
  Z6. These are #767's whole-number bands, extended to fractions without changing any integer's zone. A 0 W second
  is a reading and counts (Z1). A null second counts nowhere.
- **FTP** is the row's `ftp_w`, else the streams' `ftp_w`. The same value draws the FTP line and the zone colours.
- **Names**: "Active recovery", "Endurance", "Tempo", "Threshold", "VO2 max", "Anaerobic".
- **Range line** (`--text-xs` `--color-text-secondary`), with `c(p) = ceil(FTP × p ÷ 100)`: Z1 "< c(56) W"; Zk
  "c(lo)–(c(hi) − 1) W"; Z6 "≥ c(121) W". At FTP 250: "< 140 W", "140–189 W", "190–227 W", "228–264 W",
  "265–302 W", "≥ 303 W".
- **Row**: the label column (zone `--text-sm` 600, the range under it), a bar (track `--color-border-light`, fill the
  zone token, height `--space-sm`, `--radius-full`, width ∝ seconds ÷ the largest zone's seconds), then the time
  (`--text-sm` 700, `formatClock`: "4:10", "1:02:03", "0:00") and the share ("7%", `--text-xs`
  `--color-text-secondary`, whole percent of seconds with a power reading, half up). A zone with 0 s shows "0:00"
  and "0%" and an empty track: it is a measured zero.
- Rows are at least 44px, with `--color-border-light` hairlines. Each `<li>` is read as "Z2 Endurance, 140 to 189
  watts, 12 minutes 2 seconds, 20 percent".
- **No FTP** (neither source has one): in place of the list, "No FTP for this ride, so there are no zones."
  **No power** (every `power_w` null): "No power was recorded on this ride." Both are `--text-sm`
  `--color-text-secondary`.

## Ride card

A card of label and value rows, the label `--text-sm` `--color-text-secondary` and the value `--text-sm` 600, with
`--color-border-light` hairlines and rows at least 44px tall. It has no heading, and its `aria-label` is "Ride". A
row whose source is blank is left out, and the card is hidden when every row is.

| Label | Value |
|---|---|
| FTP for this ride | `ftp_w` "W" (row, else streams) |
| Intensity | 100: "100% · as written". Otherwise "<n>%" |
| Spin workout | from `ride_workout_id` with #772's library read: the workout's name; "Removed from your library" when the id isn't in it; "Couldn't load it" when the read fails; no row while loading (it appears without moving anything above it) or when the id is blank |
| Pauses | "1 pause · 0:45", or "<n> pauses · <total>", where total is the sum of `duration_s` as `formatClock`. Only when streams are in and `pauses[]` is non-empty |

The label "Spin workout" is #772's word for the same link.

## Provenance

`sourceName('spin')` is "Thrive Spin". For a `source = spin` row, `provenanceDetail` reads "Recorded with Thrive Spin
· uploaded <formatLocalStamp(synced_at)>", or "Recorded with Thrive Spin" without a stamp. `provenanceSpeech` reads
"recorded with Thrive Spin". The verb is "Recorded" because Spin is not a sync. The View on COROS link stays as
it is: `corosActivityUrl` gives none for a Spin row, and showing `coros_activity_id` is a later issue (#773).

## Edge cases

| Case | What happens |
|---|---|
| A 12-hour ride (n = 43200) | 300 buckets of 144 s, axis "0:00, 4:00:00, 8:00:00, 12:00:00"; Intervals lists every step |
| A 30-second ride | 30 buckets of 1 s; axis "0:00, 0:10, 0:20, 0:30" (`formatClock`, rounded to the second under a minute) |
| Trainer dropped out for 5 min | power line gap over those buckets; targets still drawn; that step's Avg from the readings it has |
| Heart rate partly missing | heart-rate line gaps; Intervals HR "—" for steps with none |
| No heart rate at all | no panel, legend item or HR column; row `avg_hr` cell still shows if the row has one |
| Every `power_w` null | targets only, no power line; zones "No power was recorded on this ride."; Avg "—" in every row |
| No `target_w` anywhere (free ride) | no blocks; Intervals hidden if it has one step; zones still computed from power |
| `ftp_w` missing in both row and streams | grey blocks, no FTP line, zone squares `--color-border`, zones card's no-FTP text |
| Intensity changed mid-ride | `target_w` already carries it; blocks step with it; the Ride card shows the row's time-weighted `intensity_pct` |
| Many steps (a 20× repeat) | 40+ rows; the table grows; no truncation |
| A step label of 40 characters | wraps in the Step column; the row grows |
| Streams `ride_id` differs from the row's | the API already refuses that file (#765); it reaches the screen as the error state |
| Rapid back and forward | the session cache answers the second visit; a late response for a left screen is dropped |
| Offline | the error state; the row's cells and Ride card still show (Sheets data is already loaded) |

## Demo mode

Two Spin rows join the demo data, with bundled streams in `api/demo-spin.ts`, made by a seeded generator. They are
fixed, not random, so tests can assert numbers:

1. **"Sweet Spot 3×12"**, FTP 250, intensity 100, 1:00:00 of ride time. It has steps Warm-up 10:00 (ramp
   125→175 W), three passes of Sweet spot 12:00 at 225 W and Recover 4:00 at 138 W, then Cool-down 2:00 free. Heart
   rate runs throughout, with a 20 s dropout in the second recovery. There is one pause of 45 s at 30:00. The row
   has all of AE:AM, `effort = Hard` and a note, and `ride_workout_id` is the demo library's "Sweet Spot 3×12" (#772's
   demo set; if #772 has not merged, this issue adds that one demo `RideWorkouts` row).
2. **"Free ride"**, 40:00, FTP 250, no workout (`ride_workout_id` blank, one step "Free ride" with null targets),
   no heart rate (every `hr_bpm` null, row `avg_hr` blank), cadence present.

The existing demo indoor ride (`ACTIVITY_INDOOR_ONLY`, no `source`) stays as it is: it is the "no streams" case.

## Interaction states (per #404)

The only new control is the hero's **Try again**, an existing `btn btn-secondary`. Everything else is static. Tables
and lists have no hover, pressed or focus state, and are not in the focus order. The floating bar's buttons keep
#532's scrims and #404's states. No addition to `interaction-states.test.ts`.

## Copy

"Loading ride…", "Couldn't load the ride's power data.", "Try again", "This ride is too short to draw.",
"Power against target over <time>", ", heart rate <a> to <b> bpm", ", 1 pause", ", <n> pauses", "FTP <n> W",
"<a>–<b> bpm", "Power", "Target", "Heart rate", "Pause", "Avg power", "Norm. power", "IF", "TSS", "Work",
"Avg cadence", "rpm", "Intervals", "Step", "Target", "Avg", "HR", "Resistance", "Slope", "Free", "Time in power
zones", "Active recovery", "Endurance", "Tempo", "Threshold", "VO2 max", "Anaerobic", "< <n> W", "<a>–<b> W",
"≥ <n> W", "No FTP for this ride, so there are no zones.", "No power was recorded on this ride.", "Ride", "FTP for
this ride", "Intensity", "<n>% · as written", "Spin workout", "Removed from your library", "Couldn't load it",
"Pauses", "1 pause · <time>", "<n> pauses · <time>", "Thrive Spin", "Recorded with Thrive Spin · uploaded
<stamp>", "recorded with Thrive Spin".

## For development

- `api/spin-streams.ts`: the call (through `callAction`), the boundary check, and the derivation (buckets,
  interval rows, zone seconds, cadence, heart-rate range). Pure functions with unit tests at n = 1, 2, 30, 120, 3600
  and 43200.
- `spin/streams-cache.ts`: the session cache and a `useRideStreams(id)` hook in the shape of `useWorkoutTrack`.
- `components/activities/ride-hero.tsx`, `ride-intervals.tsx`, `ride-zones.tsx`, `ride-card.tsx`. `detail-stats.tsx`
  gains the power cells and the cadence cell. `workout-detail.tsx` chooses the ride hero over `RouteHero` when
  `rideStreamsAvailable(workout)` holds.
- The zone tokens (below) go in `global.css` beside the `--type-*` tokens, with their dark values in the dark block.
  The zone band function is one shared helper (`spin/zones.ts`), used by the hero, Intervals and the zones card.
- `thrive/CLAUDE.md` gains a short "Indoor ride detail (#771)" paragraph after "Route map": the hero rule (a Spin
  row with `streams_ref` gets the ride hero, and streams win over a track), where the streams come from, and that
  the FIT file is not downloadable from the app.

## New tokens

The zone colours are #767's, now in CSS for the first time. The values are copied, not invented, so Spin and
Thrive draw the same zones in the same colours. They are graphics beside text that states the same thing (the
zone row's words, the step's target), so, as #767 decided, they are not held to 3:1.

| Token | Light | Dark | For |
|---|---|---|---|
| `--zone-1` | `#8a93a8` | `#9aa3b5` | Z1, active recovery |
| `--zone-2` | `#4f86f7` | `#6e97ff` | Z2, endurance |
| `--zone-3` | `#14a098` | `#2cc2b8` | Z3, tempo |
| `--zone-4` | `#e8a317` | `#f2b84b` | Z4, threshold |
| `--zone-5` | `#ee6a1f` | `#f58a4f` | Z5, VO2 max |
| `--zone-6` | `#cf3a3a` | `#ef6b6b` | Z6, anaerobic |

Sizes, in `global.css` `:root`, not overridden in dark:

| Token | Value | For |
|---|---|---|
| `--detail-ride-hero-height` | `376px` | The ride hero: 64 clearance + about 160 power + 8 + 56 heart rate + 8 + 20 axis + 8 + 20 legend + 32 bottom. Fixed, so no state changes its height |
| `--detail-bar-clearance` | `64px` | The space a hero keeps free under #531's floating bar: its 12 top padding, its 44 buttons and `--space-sm` |
| `--ride-hr-plot-height` | `56px` | The heart-rate panel |
| `--ride-target-opacity` | `0.35` | Target blocks under the power line: light enough that `--color-text` reads over every zone colour in both themes (the "Needs eyes" criterion) |

`--detail-ride-hero-height` is a fixed height, not `--detail-hero-height`'s `clamp(…62vh…)`. A map earns most of
the screen. A two-panel chart does not, and at 62vh (503 at 375 × 812) it would push the stats card below the fold.

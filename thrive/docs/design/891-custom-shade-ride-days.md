# 891 — Custom: shade ride days behind the stacked charts

Part of #889. One toggle on Trends' Custom group that draws the days with a ride as light bands behind every card, so a stack of food (#890), Training Load, HRV and weight can be read down a column. Mock: the epic's prototype (`forage/docs/design/889-trends-prototype.html`, "Thrive: side by side", its "Shade ride days" row); this note differs from it where it says so. It shows a pattern and concludes nothing.

Standing documents: `ui/docs/design/keel-wide-rules.md` (contrast, touch targets, interaction states, colour never the only cue) and `ui/docs/design/suite-language.md` (one shared axis, blank is not zero). Builds on `246`'s Custom group and `503-trends-icon-toolbar.md`, and on `890-trends-food-group.md` for the Food cards it is made for. It works for any Custom set.

## What a ride day is

A day whose `DailySummary` row has a bike activity: `activity_types` (column C, a sorted comma list of `type` or `type:sub_type`, e.g. `bike:mountain,weight`) holds a label that is `bike` or starts `bike:`. Any sub type counts, indoor and Spin included. `weight`, `run`, `hike`, `walk` and `stretch` days are not ride days. A planned ride is not: `DailySummary` leaves planned workouts out of its rollup. The match is on whole labels, so a label that merely contains "bike" is not a ride.

**Decided: `DailySummary`, not `Workouts`.** Trends reads daily rollups from `DailySummary` for Activity and never re-sums `Workouts` (#245); the screen already loads it, and one more read for ride days would put a second source for the same fact in one view. Its cost is the sheet's: it is derived and can lag the sync, so a ride from this morning may not shade until the next sync. The toggle claims nothing about the days it does not shade: a day with no row is unknown, not "no ride".

The helper is `ride-days.ts` beside `series.ts`: `rideDays(rows) → Set<date>`, pure, tested on its own. #892 reuses it and adds lift and rest.

## The toggle

- **Where:** the Custom group's head row (`.trends-custom-head`), after **Edit metrics**, with `--space-sm` between them. Label **"Shade ride days"**.
- **What it is:** a toggle chip, `.trends-chip` (already in the Chips and toggles row of `404-interaction-states.md`), a button with `aria-pressed`. **Decided: a chip with a tick, not a new switch component.** Thrive has no switch, the chip's pressed look and `.chip-check` tick (#183) already exist and are tested, and a switch would need its own six states for one control.
- **Off:** the chip at rest, the label only. **On:** `.trends-chip.on`, the primary tint, and a leading tick (`.chip-check`, "✓", `aria-hidden`) so the state is not the tint alone. `aria-pressed="true"` exposes it.
- **States (#404):** rest, hover under `@media (hover: hover)`, pressed, the global focus ring, selected (on). No disabled state: it is hidden, not disabled, where it cannot apply (below). At least `--touch-target` square.
- **Default Off, remembered.** `thrive-trends-shade` in `localStorage`, `on` or `off`, read and written through `prefs.ts` with the same guards as range and average (a missing or blocked store gives Off and never breaks the screen). **Decided: Off by default**, so Custom is exactly what it was until the owner turns it on, and then it stays on. The prototype shows it on to demonstrate it.
- **Where it does not appear:** in any group but Custom; in Custom's Table view (the table has no plot to shade); in a Custom set with no metrics ("Pick up to 4 metrics to see them here.", nothing to shade). The stored choice is kept meanwhile and applies when it returns.
- It is not a control that clears the selected day, and clearing is not affected by it: toggling keeps the day selected.

## The bands

- **What:** for each ride day in the range, a rectangle the width of that day's slot (`plotW / dates.length`, centred on the day's x as the bars are) and the full plot height, in the new token `--trend-ride-shade` (below). A run of ride days is a run of touching slots and reads as one wider band; at 1Y or All a band can be under a pixel wide and is still drawn.
- **Layer:** behind the gridlines, the reference line and every mark. Order in the plot: bands, grid, axis labels, bars, reference, dots, lines, selection marker. So the bands never cover a bar, a dot or the average line, and the gridlines stay visible across them.
- **Every card, same x.** All cards of a group share one `dates` array and the same width, so the same slot lands at the same x on every card; the cards take the group's ride-day set as one prop and draw their own band rectangles. Held-value cards (FTP) draw them too.
- **Nothing else changes:** no band on a day that is not a ride day, on a day with no `DailySummary` row or outside the range; no tooltip or hover state on a band; it takes no pointer events, so tapping a band still selects the day under the pointer.
- **Never colour alone.** The caption and the readouts say it in words (below). The band's job is to help the eye; the words are how a person who cannot see it gets the same fact.

### Words

| Where | Text |
|---|---|
| Caption, toggle on, range has a ride | the existing caption, then **"Shaded days had a ride."** |
| Caption, toggle on, no ride in the range | the existing caption, then **"No rides in this range."** |
| Each card's readout, date line, a ride day selected | `Sat, Sep 26 · ride day` (the date line is `aria-hidden`; the status line below is what a screen reader hears) |
| Keyboard status line, a ride day | `Sat, Sep 26. Ride day. HRV 62 ms. ...` (the sentence's second clause) |
| A day that is not a ride day | nothing extra |

With the toggle off, none of these words appear, and a selected day reads exactly as before. The readout's date and "Open day ›" share a row, and "Sat, Sep 26 · ride day" is about 20 characters in `--text-sm`, which leaves the row as it was at 320 px (the date line was already the shorter side; `/develop` checks it at 320 px as #303 did).

## Reading the data

`DailySummary` is already read in the screen's one load (`loadHealth`), so there is no new request and no new tab. What changes is whether Custom **waits** on it. A Custom set whose metrics read it (Activity's) already does. When the toggle is on and none does, the group adds `dailySummary` to the sources it waits on and reports errors from (`sources` in `trends-screen.tsx`), so a band is never drawn from rows that have not arrived and a failure is the group's existing "Couldn't load your health data." With the toggle off such a set does not wait on it, as before.

| Case | Shows |
|---|---|
| Toggle on, `DailySummary` loading | the group's `Loading…` |
| Toggle on, `DailySummary` failed | the group's `Couldn't load your health data.` with Try again |
| Toggle on, loaded, rides in range | the bands |
| Toggle on, loaded, no ride in range | no bands, "No rides in this range." |
| Toggle on, a ride logged today, not yet in the sheet | no band for today; no claim |
| Toggle off | the group as it was |
| Demo mode | demo `DailySummary` already has bike days (`demo-data.ts`); the bands follow it |

## Edge cases

- **A day with both a ride and a lift:** shaded, it had a ride.
- **A Custom set with one card:** shaded the same; "every card" is one.
- **Range change, average change, picking metrics, selecting a day:** the toggle keeps its state and the bands redraw from the rows held. No request.
- **Midnight rollover:** the range's days move with `today`; the bands follow the dates.
- **Reduced motion:** nothing moves; the bands appear with the chart.
- **Storage blocked:** the toggle works for the visit and resets to Off next time.

## Copy

"Shade ride days", "Shaded days had a ride.", "No rides in this range.", "ride day", "Ride day."

## Measured

The shade has to leave every mark readable on a ride day. WCAG contrast computed from `global.css` for the chosen values, against 3:1 for a mark:

| | shade vs the card surface | tightest marks on the shade |
|---|---|---|
| Light, `#f1ece3` on `#ffffff` | 1.18:1 (a light band, as asked) | `--metric-sleep-light` 2.75, `--chart-dot` 3.39, then every other metric colour 3.9 or more |
| Dark, `#2b2823` on `#1a1a1e` | 1.18:1 | `--metric-sleep-deep` 3.22, `--metric-sleep-light` 4.25, `--chart-dot` 4.32, every other 5.2 or more |

**One mark falls under 3:1 on a shaded day: `--metric-sleep-light`, 2.75 on the band in light.** It is 3.23 on the plain card, the tightest metric colour already, so any visible band takes it below 3. It is accepted rather than darkening a colour that is also used on Day: Light Sleep is only in the Custom picker, its line is also carried by dots and the readout, and the band is a help, not data. The contrast test names the exception so it cannot spread. The shade is also deliberately a warm neutral and not the blue of `--chart-band` ("your range", a horizontal band): a vertical blue band would read as the same thing.

The band's own strength against the card is low on purpose (1.18:1) and is the value to judge by eye in demo mode, in both themes, behind bars and dots. It is not a contrast criterion: a band is not text and not a state, and its fact is in words too.

## New tokens

In `global.css`, light and dark, and added to `metric-contrast.test.ts`:

- `--trend-ride-shade` — the band behind a ride day's slot. Light `#f1ece3`, dark `#2b2823`. Not `--chart-band`.

## Not here

Shading by lift, rest or other kinds; shading outside Custom or in the Table view; planned rides; any statement about what a pattern means.

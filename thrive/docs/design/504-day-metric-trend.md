# 504 — Day: a card opens its Trends group

Tapping a metric card on the Day screen opens Trends on the group that holds
it, with the day you were looking at selected on the chart. Resting HR, HRV and
Average stress open Recovery; Sleep opens Sleep; Steps opens Activity; the Body
tile's weight opens Body and its blood pressure opens Blood Pressure.

**This replaces the first version of this note**, which designed a new
single-metric trend screen over the `.health-row` list. That list was gone
before the note merged: #488 (glance row), #490 (Sleep card), #491 (metric
tiles) and #492 (Body tile) had already replaced it, and the single-metric
screen duplicated what Trends' groups already draw. A group is also the better
destination: the cards on Day are already grouped the way Trends groups them.

Prototype reference: the "Day tile → metric trend" artboard (`DayToTrend.dc.html`)
on the canvas "Thrive Trends — modern controls prototype". Only its idea (tap
a tile, land on the trend) is carried; its tile layout is already built (#491)
and its single-metric view is dropped.

Standing documents this answers to: `ui/docs/design/keel-wide-rules.md` and
`ui/docs/design/suite-language.md`. Notes this builds on: `491-day-metric-tiles.md`,
`490-day-sleep-card.md`, `488-day-glance-row.md`, `492-day-body-and-note.md`,
`404-interaction-states.md` (the states a card-as-link needs) and
`503-trends-icon-toolbar.md` (the group tabs Trends opens on).

## Measured first

From the running app in demo mode (today), Day at 375 × 812,
`getBoundingClientRect()` (width × height, px):

| Target | Size |
|---|---|
| Steps (`.glance-stat`) | 72 × 75 |
| Resting HR, HRV tile | 166 × 175 |
| Average stress, Body tile | 166 × 178 |
| Body tile, weight half (`.body-weight`) | 142 × 62 |
| Body tile, blood pressure half (`.body-bp`) | 142 × 55 |
| Sleep card | 343 × 285 |

Every target is over the 44px floor in both directions, so **no card grows**.
The first version of this note found two 24px rows to fix; there are none now.
The Body halves are the smallest (55px tall) and are still comfortably tappable.

## Which cards open what

| Day card | Opens | Notes |
|---|---|---|
| Resting HR tile | Recovery | |
| HRV tile | Recovery | |
| Average stress tile | Recovery | |
| Sleep card | Sleep | |
| Steps (glance row) | Activity | needs Steps added to Activity, below |
| Body tile, weight half | Body | |
| Body tile, blood pressure half | Blood Pressure | |
| Recovery ring, Calories (glance row) | nothing | no Trends group holds either |
| Training card, Note card | nothing | not metrics |

A card is a link whether or not it has a value today ("None yet today.", "No
reading this day."): the history is still there. A card that is only a note or a
loading/error status ("Health" with Try again, "No watch data for this day")
has no link, so Try again stays the one control in it. Future days mount none of
these cards (unchanged).

## Trends change this needs: Steps joins Activity

Steps today is in no Trends group, only the Custom picker (#246), so a Steps tap
would have nowhere to go. **`STEPS` is added to `ACTIVITY_METRICS`, first**, so
it is the card you land on: it is the daily headline, the others are per-session.
It stays in the Custom picker as it is. Activity then mixes DailyHealth and
DailySummary metrics; Trends already handles groups that read more than one tab
(it loads the union of the group's sources, `trends-screen.tsx`), and Steps'
`excludesToday` (today is a partial day and is not plotted) is per-metric, so
the other cards are unchanged. This is the one change to Trends' own behaviour
in this issue.

## The main path

1. On Day, the cards in the table above are tappable. Each shows a small `›`
   at the right of its title row (the Steps stat shows none: there is no title
   row, and its figure and word stay as drawn). The `›` is `aria-hidden`.
2. Tap anywhere on the card (Body: anywhere on that half): the app goes to
   `#/trends/<group-id>?date=<the day shown>`, with group ids exactly as the
   Trends registry has them: `recovery`, `sleep`, `activity`, `body`,
   `blood_pressure`.
3. Trends opens on that group, in the remembered range, average and view. The
   Trends tab in the bottom nav shows as current. Opening this way also
   **stores that group as the remembered one**, exactly as choosing its tab
   would, so leaving and coming back to Trends finds the same group.
4. The tapped day is selected on the charts, as a tap on a chart would select
   it, with the same readout and "Open day ›" link. If the day is outside the
   plotted range (a day 6 months back under a 3M range), or is today and the
   metric does not plot today (Steps), nothing is selected and the group simply
   shows. The URL is not rewritten.
5. Back (the system back, or the browser's) returns to the Day screen on the
   date it left, because the tap pushed a history entry. Day gets no new Back
   arrow, and Trends gets none: Trends is a tab, and #264's back arrows are for
   screens that are not.

Switching group tabs inside Trends does not change the URL (it is the stored
choice, as today); the route only matters on arrival.

## States and edge cases

| Case | What happens |
|---|---|
| Unknown or Custom group id in the URL (`#/trends/nonsense`, `#/trends/custom`) | the URL is replaced with `#/trends`; Trends shows its remembered group, as a bad `#/day/…` date is replaced |
| Bad or missing `?date=` | no day is selected; the group shows |
| `?date=` in the future | no day is selected |
| Health data not loaded yet (a reload on the URL) | Trends loads it as it does today, shows `Loading…`, then selects the day when the series exists |
| Load error | Trends' own `Couldn't load your health data.` with Try again; nothing new |
| A card with no value for the day | still a link; Trends shows its own empty state for the range |
| Rapid double tap | one navigation; the second tap lands on Trends, which is not a link target there |
| `prefers-reduced-motion` | nothing here moves |

The selected day is cleared by every control that clears it today (range,
view, group), as #503 specified; this issue adds no way to clear it.

## Interaction states (per #404)

Each target is a **Rows and cards** control: an `<a>` with the card's title row
as its link text (so the card keeps its `h2`) whose `::after` is stretched over
the card, the card being `position: relative`. Rest as today; the hover overlay
under `@media (hover: hover)`; pressed overlay; the global focus ring, inset
(`-2px`) because the card clips an outside ring; no selected state; no disabled
state. The Body tile has two links, one stretched over each half; the Steps
stat's link wraps the stat. The class (`.day-card-link`) is added to the Rows
and cards table in `404-interaction-states.md` in the same change, which
`interaction-states.test.ts` enforces.

Why a stretched link and not a link around the whole card: the card's `h2` and
`section` labelling stay as they are (#485), and a link containing the Sleep
card's legend and bar would read all of it as the link's name.

## Accessible names

The link text is the title plus the value, then the destination, built from the
text already on the card so the two cannot disagree:

- `Resting HR 53 bpm. Open Recovery trends`
- `Sleep 7h 12m. Open Sleep trends`
- `Steps 3,035 so far. Open Activity trends`
- `Weight 181.7 lb. Open Body trends` and `Blood pressure 118/76 mmHg. Open Blood Pressure trends`

With no value, the name is `Resting HR, no reading. Open Recovery trends`. The
card's `h2` keeps its text unchanged.

## Document title

Trends' own, `Trends — Thrive`: the group is not part of the title.

## Copy

`Open <Group> trends` (accessible-name suffix; `<Group>` is the registry label:
Recovery, Sleep, Activity, Body, Blood Pressure). No visible text is added: the
`›` is the only mark.

## New tokens

None. The `›` is `--color-text-muted`; the overlays and ring are #404's.

## Out of scope for this note

Scrolling to or highlighting the tapped metric's card in the group. The group
is short (two to four cards) and the selected day is already marked; it can be
added if landing feels lost. The Recovery ring and Calories get no link.

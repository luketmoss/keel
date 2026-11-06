# 829 — The nightly brief page

Specifies [#829](https://github.com/luketmoss/keel/issues/829), part of epic
[#834](https://github.com/luketmoss/keel/issues/834). The layout reference is the epic's private prototype
(https://claude.ai/artifact/HHWUAi5byhx481CCArSke5). Take its layout and behaviour, never its numbers: every figure in
this note is made up. The page is a new template beside the morning and weekly ones in
`thrive/.claude/skills/brief/`, with the same fixed-page-plus-JSON model: everything is fixed except the JSON, which the
run fills. Its tokens are the prototype's, which are the other two templates' plus a small night palette for the lead
card. There are no standing documents in `thrive/docs/design/`, and the brief templates own their tokens, so there is no
`## New tokens` section.

Not on this page until later issues: *What your data says*, each day's morning outlook, and suggestions that rest on a
graded finding (#830), and the trial card (#831).

## The run

`/brief nightly`, by hand or with `scheduled` (#836 schedules it). It reads, in parallel, and keeps going when one fails:

| What | Call |
|---|---|
| Nights for the bed-by and the tiles | `thrive_daily_health`, the 60 days ending today |
| Daily rows for the tiles and water timing | `thrive_daily_summary`, the 14 days ending today |
| Today's drinks, with times | `thrive_drinks`, today |
| Today's sessions | `thrive_list_workouts`, today, `completed` |
| Planned sessions | `thrive_list_workouts`, today to today + 5, `planned` |
| Today's note | `thrive_journal`, today |
| Body | `thrive_body_measurements`, 14 days |
| Food, today and yesterday | `forage_food_log`, yesterday to today |
| The food week | `forage_food_log`, the 7 days ending yesterday |
| Meals planned | `forage_list_plan`, tomorrow to today + 5 |
| Board | Hive, as the morning brief does (To Do and In Progress, no due filters), filed over today + 5 |
| Calendar | both calendars, today to today + 5 |
| Weather | Open-Meteo, home and trails, `forecast_days=6`, read over waking hours as the skill already says |
| Goals and the plan's why | the wiki's `training-goals` page (food goals) and the active block page, through the `wiki:` path |

Every number on the page comes from a tool result. Blank is unknown, never zero.

## Page order

1. Header: `Tonight` as the h1, and the meta line `Wed, Nov 4 · 9:17 PM`.
2. The notice, when there is one (§Freshness).
3. **Tonight**: the lead card, the page's only dark card.
4. **Today**, with the aside `closed out · trends are the last 14 days`.
5. **Next 5 days**.
6. The foot.

## Tonight

```
☾ TONIGHT
Lights out by  10:15 PM          Up at 6:00 for  [🏋 4 - Upper Push B at 7:00]
Last night: 6:10 slept, score 71, an hour under your 7:15 average. Your 7:30-plus nights started by 10:30.
[ timeline, 8 PM to 7:30 AM ]
[ move ] [ move ] [ move ]
```

- **Lights out by** is tonight's bed-by (§Bed-by). With too few nights for one, the hero says
  `Not enough nights yet for a bed-by` and the timeline drops its tonight bars.
- **Up at … for …** names tomorrow's first commitment and its wake-by. With none, `No early start tomorrow`.
- **The why line** gives last night's figures against the 14-night average, and what the bed-by rests on. When the
  commitment set it, it names that instead: `Your 7:00 lift means up by 6:00.`
- **The timeline**, 8 PM to 7:30 AM:
  - last night's sleep, as a ghost bar
  - tonight's wind-down (bed-by − 30 min to bed-by)
  - tonight in bed (bed-by to wake-by, or to the usual wake time)
  - tomorrow's commitment
  - a key under it: `Wind down from 9:45 · Tonight, 7:45 in bed · Lift at 7:00 · Last night`
- **Moves**: up to three, each an icon, a bold action and one line with its figure (§Moves). With none, the row is
  left out. It never says "nothing to do".

## Bed-by

Worked out from the owner's own nights, the last 60 with a sleep record:

1. **Good nights** are those with 7:30 or more slept (total minus awake), the threshold the morning brief already uses.
   A night with no awake figure can't be judged and doesn't count (#849): blank is unknown, never zero. Fewer than 5: no
   bed-by anywhere on the page.
2. **The usual bed-by** is the median `bed_time` of the good nights, rounded **down** to the quarter hour.
3. **Time in bed** is the median of `wake_time − bed_time` over the good nights.
4. **The wake-by** for a morning is its first commitment minus 60 minutes. The first commitment is:
   - a planned `weight`, `stretch` or indoor session, at the training slot (7:00)
   - otherwise the first timed calendar event starting before 10:00
   - otherwise none
5. **The bed-by** is the earlier of the usual bed-by and wake-by minus time in bed, rounded down to the quarter hour.
   With no commitment, it is the usual bed-by.

Each night of the next five gets the same rule, from its own next morning. The reason shown is the commitment
(`Legs B at 7:00 Thursday`) or `your usual`. An outdoor session with no time sets nothing.

Chosen over the morning brief's "latest bed time of a good night": over 60 nights one late weekend night would set it.
A median of good nights is what the owner actually does when it works.

## Moves

Tonight's suggestions, at most three, in this order. Each one needs its trigger, names the figure behind it and an
action for tonight, and serves a goal on the `training-goals` page. They never use a word of diagnosis.

| Move | Trigger | Example |
|---|---|---|
| **Water** | Today's water below Thrive's goal | **8 oz now, then stop by 9:15** · *40 oz today, 63% of your 64 oz goal.* The amount is the gap, at most 16 oz, rounded to 4 oz. The stop is bed-by − 60 min. A run after the stop leaves the move out (#849): drinking right before bed is what the stop prevents |
| **Drink** | Alcohol logged today, and a commitment before 9:00 tomorrow | **Stop at one tonight** · *One is logged, and you're up at 6:00 for the lift.* |
| **Food** | The week's average over complete days is off a food goal: protein under when a lift is tomorrow, or sodium over | **Protein after dinner** · *Your week averages 150 g against 180, and you lift at 7:00.* / **Keep tonight's snack low in salt** · *Your week averages 3,100 mg against 2,300.* |
| **Cuff** | No BP reading in the last 7 days | **Put the cuff by the bed** · *No blood pressure since Oct 28.* |

Food moves read the **week**, never today alone, because the goals page judges food as weekly averages over complete
days. A week with fewer than 3 complete days raises no food move. Suggestions that rest on a graded finding come with
#830.

## Today

### Your day in one line

A ribbon from 5 AM to 11 PM, as in the prototype:
- **Lane one:** the end of last night's sleep, today's sessions in their type colours, and timed calendar events
  labelled where they fit.
- **Lane two:** water dots (4 oz a dot) and coffee marks at their logged times.
- **A `now` line** at the run time, and a dashed **`bed`** line at tonight's bed-by.
- **The longest daytime dry stretch** (#827's `water_gap_max_s`, between 9 AM and 8 PM) is bracketed and labelled
  `5 h 10 min, no water` when it is 3 hours or more. A shorter gap is noise at this scale.
- The key under the ribbon names only what the ribbon holds.

### Tiles

Eight tiles, two columns on a phone and four from 720px:

| Tile | Value | Trend group |
|---|---|---|
| Slept | last night, `h:mm` | sleep |
| Sleep score | last night | sleep |
| HRV | last night, ms | recovery |
| Resting HR | today, bpm | recovery |
| Asleep at | last night's `bed_time` | sleep |
| Steps | today so far | activity |
| Water | today, oz, the goal drawn as a line | intake |
| Training load | today | fitness |

- **Each tile** has a 14-day spark (oldest first, today last, a gap for a missing day), a dashed average, and one
  line: `1:05 under your 7:15 average`.
- **The line turns the danger colour** by the morning brief's step-down limits: HRV 10% or more under its average,
  resting HR 5 bpm or more over, slept under 6 h or an hour under. It turns the success colour when the reading is
  better than its average by the same margin. Otherwise it is neutral.
- **A tile with no value** says `Not synced` and keeps its spark.
- **Each tile opens** Thrive Trends on its group for today.

### Training

Today's completed sessions, as the morning brief's *Yesterday* draws them: type chip, name, big figure, effort, stats,
the session's note. Each opens in Thrive's history. None: `Rest day.` Today's journal note follows in one line, when
there is one.

### Food

From Forage, today so far:
- **Calories**, large, with `kcal so far` and the protein in grams.
- **The macro bar** and its key.
- **Four goal rows**, sodium, protein, fiber and saturated fat (the goals page's targets). Each shows the **week's
  average over complete days** as its bar against the goal's tick, with today's figure after it:
  `Sodium · week 3,100 mg · today 1,840 so far`. A goal with no number on the goals page has no row. With fewer than
  3 complete days in the week, the bars are left out and the rows show today alone.
- **Meals by slot**, Breakfast, Lunch, Dinner, After dinner (#826), Snacks: names and calories, a slot with nothing
  shown as `—`. The card opens Forage Eaten.
- **Yesterday's missing meals.** Yesterday is complete when Breakfast, Lunch and Dinner each have an entry. When it
  isn't, one line under the meals: `Yesterday's lunch isn't logged.` (or `Yesterday's lunch and dinner aren't
  logged.`), linked to Forage Eaten on yesterday's date (#825). **Today is never flagged**: dinner is late and often
  logged after the brief, so today's card is the day so far.
- **Forage unreachable:** `Couldn't read Forage.` and the foot names it.

### Drinks

Water (oz, percent of goal, a bar), coffee (cups, `last 1:40 PM`), alcohol, Unwind, as of the run time. A kind not
logged says `Not logged`. Figures only, as on every brief page. Judgement belongs to the moves and, later, the findings.

### Body

The 14 days' **morning** weigh-ins (the day's first reading before noon) as a spark, with the latest. Then blood
pressure: the latest reading and its date, or `None in 14 days`.

## Next 5 days

- **At the top:**
  - Hive's overdue items as one dashed line: `1 overdue in Hive · Wipe the laptops, 2 days late`
  - Forage's planned dinners: `No dinners planned in Forage Thu to Sun.`, or the planned count, linked to Forage Plan
- **Then a time axis,** 5 AM to 11 PM, and one row per day, tomorrow first:
  - the date and the day's weather, read over waking hours, with its flag
  - a strip with the night shaded, planned sessions in their type colours (outdoor ones in their best window, as the
    weekly does), and timed calendar events
  - events in words, and Hive items due
  - the plan's why line for that day's session, when the block page has one
  - **`Bed by 10:15 PM`, with its reason**, in the bed-by colour
- **Links:** each day opens Thrive's Day screen on that date, each Hive item opens over its board, each event opens
  in Google Calendar.

## Freshness

The notice under the header says what the run is missing:
- **Today's DailyHealth row is missing or has no sleep** (last night didn't sync): `Last night's sleep hasn't synced.
  Open the COROS app, then reply refresh to this brief in Claude.` Tonight's hero is still drawn from the usual
  bed-by, and the Slept, score and Asleep at tiles say `Not synced`. **refresh** runs the whole nightly again, as the
  morning brief's does.
- **Today's DailyHealth `synced_at` is before 21:00** (the 9:00 PM sync didn't run, #828): `Thrive last synced at
  6:31 PM. A session after that isn't here yet.` Drinks are read directly, so they are current either way.

## Links

- **The phone check comes first.** Before building any link, publish a test page holding one Thrive link and confirm
  with the owner that a tap on the phone opens Thrive. If it doesn't, the page data carries `links: false` and
  everything renders as plain text, with no other change.
- **Every link** opens in a new tab (`target="_blank" rel="noopener"`), from a URL the run builds. A URL never comes
  from a calendar title, a note or a Hive item's text.

| What | Opens |
|---|---|
| A tile | `https://luketmoss.github.io/keel/thrive/#/trends/<group>?date=<today>` |
| A session today | `…/thrive/#/history/<workout id>` |
| A day ahead | `…/thrive/#/day/<date>` |
| The food card | `https://luketmoss.github.io/keel/forage/#/eaten` |
| Yesterday's missing meals | `…/forage/#/eaten/<yesterday>` |
| The planned-dinners line | `…/forage/#/plan` |
| A Hive item | `https://luketmoss.github.io/keel/hive/?board=<board id>&item=<item id>` |
| A calendar event | the event's own `htmlLink` |

## The phone call

As the morning brief's Step 6, with `kind=nightly`:
- `status=complete`, or `no-sleep` when last night hadn't synced
- `note` built in this order and joined with ` · `:
  - `Not read: Hive` / `calendar` / `Forage`
  - the yesterday-food line, in the page's words, so the notification can say it without opening the page
- the same failure notes and `status=failed` when the page couldn't go up

The phone's macros are #836's.

## Foot

What wasn't read; any Hive due date it couldn't read; and *Training guidance from your own data, not medical advice.*

## Edge cases

- **Run before 8 PM by hand:** the page still says `Tonight`. The ribbon's `now` line sits where it is, and the dry
  stretch counts only up to now (#827's rule).
- **Tomorrow is a rest day with no events:** the usual bed-by, and `No early start tomorrow`.
- **A wake-by earlier than 30 minutes from now plus time in bed:** the hero says `As soon as you can` in place of a
  time.
- **No food logged today:** the food card says `Nothing logged in Forage today.` and shows the week's rows if it has
  them.
- **Water goal unset:** the API's default (#519) is the goal, as everywhere.

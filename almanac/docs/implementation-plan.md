# almanac — implementation plan

**Revision 2** — 23 September 2026
**Scope:** building almanac from its scaffold to its three screens. This
document sequences the work. What almanac is and how it looks are decided in
[`spec.md`](spec.md) (revision 2) and
[`design/design-language.md`](design/design-language.md); this does not
re-argue either.

Revision 2 records the refinement run of 22–23 September: every issue in the
order below is **Refined** and waiting at Gate 1, and §0's sizes are now the
board's rather than expectations. Nothing split, nothing halted.

---

## 0. Issues

| Order | Issue | What | Depends on | Size | Design note |
|---|---|---|---|---|---|
| 1 | [#350](https://github.com/luketmoss/keel/issues/350) | Foundation: app frame, sign-in, demo mode, the almanac sheet, deploy | — | L | [350-foundation](design/350-foundation.md) |
| 2 | [#351](https://github.com/luketmoss/keel/issues/351) | The day screen: route, header, week strip, three day states, panel shells | #350 | L | [351-day-screen](design/351-day-screen.md) |
| 3 | [#352](https://github.com/luketmoss/keel/issues/352) | Check-in and journal | #350, #351 | L | [352-check-in-and-journal](design/352-check-in-and-journal.md) |
| 4 | [#355](https://github.com/luketmoss/keel/issues/355) | Reach Thrive's and Hive's APIs without shipping their keys | #350 | M | — (no surface) |
| 5 | [#353](https://github.com/luketmoss/keel/issues/353) | To do panel, from Hive | #350, #351, #355 | L | [353-todo-panel](design/353-todo-panel.md) |
| 6 | [#356](https://github.com/luketmoss/keel/issues/356) | Training panel, from Thrive | #350, #351, #355 | L | [356-training-panel](design/356-training-panel.md) |
| 7 | [#357](https://github.com/luketmoss/keel/issues/357) | Health panels: last night, steps, your range | #350–#352, #355; real data needs thrive#127 | L | [357-health-panels](design/357-health-panels.md) |
| 8 | [#358](https://github.com/luketmoss/keel/issues/358) | Calendar | 1–7 | L | [358-calendar](design/358-calendar.md) |
| 9 | [#359](https://github.com/luketmoss/keel/issues/359) | Trends | #350, #352, #355–#357 | L | [359-trends](design/359-trends.md) |
| — | [#354](https://github.com/luketmoss/keel/issues/354) | Withings: weight, body fat, blood pressure | after 9 | not refined | — |
| — | [#360](https://github.com/luketmoss/keel/issues/360) | Spike: sync on demand | #355; thrive#127 | M, a half-day box | — (no surface) |

The sizes are the board's, set at `/pm`. Six issues came out a size above the
expectation — #351, #352, #353, #356 and #358 at L rather than M — because each
carries a seam the others build on rather than only its own surface. Nothing
refined to XL, so nothing split.

**The board carries the order.** Priority is P1 for 1–4, P2 for 5–9, and unset
for the backlog. `board.py next` picks by priority and then the lowest issue
number, which gives exactly this order.

## 1. The shape of it

```
  #350 foundation ─► #351 day screen ─► #352 check-in & journal ─┐
        │                                                         │
        └─► #355 API access ─┬─► #353 To do (Hive)                │
                             ├─► #356 Training (Thrive)           │
                             └─► #357 Health ◄────────────────────┘
                                      │
                    #358 Calendar ◄───┤   (they read every source,
                    #359 Trends   ◄───┘    over ranges)

  upstream, done:    hive#239 #240 #241 · thrive#130 #131
  upstream, open:    hive#263 "Add" link · thrive#143 "Plan" link
                     thrive#127 COROS sync, after thrive#133 → health data
```

## 2. How the issues were cut

- **Serial by design.** Keel allows one issue in progress per project, so this
  is a sequence, not parallel tracks.
- **Bigger, vertical issues.** A new app has nothing to conflict with but
  itself. Each issue is one whole slice, from source to screen, up to L. Fewer,
  larger issues keep a slice's context in one refinement and one PR, instead of
  spreading it across hand-offs.
- **Each issue owns its own folders,** so a later issue adds folders rather
  than editing an earlier one's files. The layout below is a suggestion, and
  `/develop` has the final say:

  | Issue | Owns |
  |---|---|
  | #350 | `src/app/` (frame, routes, theme), `src/auth/`, `src/data/` (the interface, demo data, sheet client), `global.css` |
  | #351 | `src/day/` |
  | #352 | `src/panels/checkin/`, `src/panels/journal/` |
  | #355 | `src/data/thrive.ts`, `src/data/hive.ts` |
  | #353 | `src/panels/todo/` |
  | #356 | `src/panels/training/` |
  | #357 | `src/panels/health/` |
  | #358 | `src/calendar/` |
  | #359 | `src/trends/` |

  The one shared seam is #350's day-keyed data interface. Panels add their
  reads behind it rather than reaching into each other.
- **Demo data first, live data one source at a time.** #350's demo mode lets
  every screen be built and `/test`ed before its live source exists, and each
  source's issue adds its own live reads. Nothing waits on the COROS sync to
  merge: #357 designs its no-data states, and demo mode shows the full panel.
- **Port, don't copy.** [`prototype.html`](prototype.html) is the source of the
  published prototype (<https://claude.ai/artifact/Dk2WztPMbKAQLscNCKmnyP>). It
  is a behavioural reference, and a donor for the sample-data generator
  (`build()`) and the sunrise calculation (`sun()`). Production code is Preact
  and TypeScript with colocated tests and styles, per `stack-web`. The
  prototype's single-file JavaScript is not.

## 3. Why this order

1. **#350 first.** Nothing renders, tests or deploys without it.
2. **#351.** The main surface, and the day-state model the spec says cannot be
   bolted on afterwards.
3. **#352.** The only panel with no upstream dependency, and the one thing
   almanac writes. The app is worth opening from here, before any other source
   is wired up.
4. **#355, before any Thrive or Hive panel.** It decides how the browser
   authenticates to both APIs, and may need a change in both repos first.
5. **#353, then 6. #356.** Both sources are ready upstream: hive#239, #240 and
   #241 are closed, and thrive#130 has shipped. Their "Add" and "Plan" links
   (hive#263, thrive#143) fall back to opening the app until those ship.
7. **#357.** It can merge before the COROS sync runs, but its real data depends
   on thrive#127. So it follows the panels that light up with real data straight
   away.
8. **#358 and 9. #359 last.** They read every source over ranges, so they are
   best built once all the day panels exist.

## 4. Outside almanac

| Needed | Where | Status | Affects |
|---|---|---|---|
| Audit log, item links, due-date filters | hive#239, #240, #241 | Done | #353 |
| Workouts and planned workouts by date, `DailySummary` | thrive#130, #131 | Done | #356, #357 |
| Create an item with its due date | hive#263 | To Do | #353's "Add" |
| Plan a workout on a date | thrive#143 | To Do | #356's "Plan", and keel#361 to point it there |
| COROS sync, `DailyHealth` and its API actions | thrive#127, after thrive#133 | Not started | #357 real data, #358 shading, #359 health charts |
| Syncs several times a day | the COROS job | In progress (you) | spec §9.9 |
| Accept almanac's Google token for read actions | thrive#144, hive#264 | To Do | every live read (#353, #356, #357) |
| Read `DailyHealth` through the API | thrive#147 | To Do | #357's stages, bed-to-wake and sync time; #359's VO₂ max (keel#364) |
| Bed and wake times, and a step goal if COROS sends one | thrive#148 | To Do | #357; carries §9.11's `[VERIFY]`, which thrive#133 does not ask |
| An estimated duration for a planned workout | thrive#145 | To Do | #356's "about 45 min" |
| Exercise and set counts on `getPlannedWorkouts` | thrive#146 | To Do | #356's plan read, one call instead of N |
| A daily FIT request budget, not a per-run one | thrive#149 | To Do | the multi-run cron change; found by #360 |
| Audit rows carrying title and board | hive#265 | To Do | #353's past day, one call instead of two |
| Every board's statuses in one call | hive#266 | To Do | #353 before 20 September 2026 |

## 5. Risks

- **API keys in a public bundle.** The largest risk in the plan. It is why #355
  exists, and why it comes before every Thrive and Hive panel.
- **The COROS sync slips.** The health panels, calendar shading and health
  charts stay in their no-data states. Nothing else is affected. Refinement
  sharpened two things here: #358 **shades nothing and says so** rather than
  hatching, because a hatch claims the watch has no data when almanac has not
  asked; and VO₂ max has no route into almanac even after the sync runs, since
  `DailySummary` carries no such column — #359's Fitness group ships with a
  designed no-data state and keel#364 carries the swap.
- **Apps Script latency.** Every read is a script execution, and a second or
  more per call is common. Month and range reads (#358, #359) batch and cache
  rather than fetching each day separately.
- **Manual setup.** A person is still needed, but not for the sheet: under
  `drive.file` almanac creates and finds its own (#350). What is left is the
  Google Cloud project, consent screen and OAuth client with its origins
  (#350); the repo secrets `ALMANAC_GOOGLE_CLIENT_ID` (#350),
  `ALMANAC_THRIVE_API_URL` and `ALMANAC_HIVE_API_URL` (#355) and
  `ALMANAC_THRIVE_APP_URL` (#356); and, once thrive#144 and hive#264 ship,
  re-deploying each Apps Script and setting its `TOKEN_CLIENT_ID` and
  `TOKEN_ALLOWED_EMAIL` properties (#355).

## 6. Later

- **#354, Withings:** weight, body fat and blood pressure on the day screen,
  plus the Body and Blood pressure groups in Trends.
- **#360, a spike:** sync on demand, in addition to the scheduled runs.
- **Found during refinement, all in To Do without a priority:**
  [#361](https://github.com/luketmoss/keel/issues/361) point "Plan" at Thrive's
  dated planner link once thrive#143 ships;
  [#362](https://github.com/luketmoss/keel/issues/362) the dark theme's
  calendar shading ramp fails AA at its third step;
  [#363](https://github.com/luketmoss/keel/issues/363) the light theme's chart
  dot fails the 3:1 non-text minimum;
  [#364](https://github.com/luketmoss/keel/issues/364) read `DailyHealth`
  directly once thrive#147 ships. #362 and #363 are changes to the standing
  design language, which no issue may edit on its own.
- **Spec §9.3 and §7:** a week view, and Forage.

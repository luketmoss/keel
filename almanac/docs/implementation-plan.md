# almanac — implementation plan

**Revision 1** — 22 September 2026
**Scope:** building almanac from its scaffold to its three screens. This
document sequences the work. What almanac is and how it looks are decided in
[`spec.md`](spec.md) (revision 2) and
[`design/design-language.md`](design/design-language.md); this does not
re-argue either.

---

## 0. Issues

| Order | Issue | What | Depends on | Expected size |
|---|---|---|---|---|
| 1 | [#350](https://github.com/luketmoss/keel/issues/350) | Foundation: app frame, sign-in, demo mode, the almanac sheet, deploy | — | L |
| 2 | [#351](https://github.com/luketmoss/keel/issues/351) | The day screen: route, header, week strip, three day states, panel shells | #350 | M |
| 3 | [#352](https://github.com/luketmoss/keel/issues/352) | Check-in and journal | #350, #351 | M |
| 4 | [#355](https://github.com/luketmoss/keel/issues/355) | Reach Thrive's and Hive's APIs without shipping their keys | #350 | M, plus upstream |
| 5 | [#353](https://github.com/luketmoss/keel/issues/353) | To do panel, from Hive | #350, #351, #355 | M |
| 6 | [#356](https://github.com/luketmoss/keel/issues/356) | Training panel, from Thrive | #350, #351, #355 | M |
| 7 | [#357](https://github.com/luketmoss/keel/issues/357) | Health panels: last night, steps, your range | #350–#352, #355; real data needs thrive#127 | L |
| 8 | [#358](https://github.com/luketmoss/keel/issues/358) | Calendar | 1–7 | M |
| 9 | [#359](https://github.com/luketmoss/keel/issues/359) | Trends | #350, #352, #355–#357 | L |
| — | [#354](https://github.com/luketmoss/keel/issues/354) | Withings: weight, body fat, blood pressure | after 9 | |
| — | [#360](https://github.com/luketmoss/keel/issues/360) | Spike: sync on demand | #355; thrive#127 | spike |

The sizes are expectations to check at `/pm`, not board values. Nothing here is
XL, and anything that refines to XL gets split.

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
| Plan a workout on a date | thrive#143 | To Do | #356's "Plan" |
| COROS sync, `DailyHealth` and its API actions | thrive#127, after thrive#133 | Not started | #357 real data, #358 shading, #359 health charts |
| Syncs several times a day | the COROS job | In progress (you) | spec §9.9 |
| API authentication without static keys | Thrive and Hive, if #355 chooses it | To file | #353, #356 |
| Step goal in the COROS daily payload | thrive#133 | [VERIFY] | #357 |

## 5. Risks

- **API keys in a public bundle.** The largest risk in the plan. It is why #355
  exists, and why it comes before every Thrive and Hive panel.
- **The COROS sync slips.** The health panels, calendar shading and health
  charts stay in their no-data states. Nothing else is affected.
- **Apps Script latency.** Every read is a script execution, and a second or
  more per call is common. Month and range reads (#358, #359) batch and cache
  rather than fetching each day separately.
- **Manual setup.** The sheet, the OAuth client's authorized origins and the
  repo secrets need a person (#350).

## 6. Later

- **#354, Withings:** weight, body fat and blood pressure on the day screen,
  plus the Body and Blood pressure groups in Trends.
- **#360, a spike:** sync on demand, in addition to the scheduled runs.
- **Spec §9.3 and §7:** a week view, and Forage.

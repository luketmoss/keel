# 692 — Routes like this and Near here, from shared map grid cells

Part of #680. #682 designed the Routes like this section over hand-written fixture
pairs; this note gives it a real rule and adds the Near here section beside it.
Everything else about the section is #682's and stays: its place on activity detail,
its heading, #528's activity cards unchanged, newest first, up to 3, and the
card's `data-focus-key="workout:<id>"`.

Earlier notes kept: #531's detail shell, #532's map hero, #528's activity card,
#682's `.trail-routes` and `.trail-section-title` styles.

## Where it is computed

**In the browser, from the tracks the app can already read.** No sheet column, no
Apps Script change, no `mcp/` change, and nothing from #688. The sync is not
involved.

Why not the sync or the sheet: it would be a new Workouts column, which is a
migration plus the Apps Script, the frontend mirror and the Worker in one pull
request, and a human-reviewed one (`thrive/CLAUDE.md` §Changing the schema). The
rule needs only each activity's route, and every tracked activity already has one
behind `getWorkoutTrack`.

The cost of that choice is the first run: every tracked activity's track is fetched
once. The result is kept on the device (below), so afterwards only a new activity
costs a fetch. If the first run proves too slow in use, the cheaper-per-open
alternative is for the sync to store the cells, which is a later issue and reuses
this note's rules unchanged.

## The grid

- **Cell.** A web-map tile at zoom 19, the same x/y a slippy map uses, so a cell
  has one global address and no origin to agree on. On the ground it is about
  76 m × cos(latitude) square: 54 m at 45° N, 58 m at 40° N.
- **Cell id.** `x * 2^20 + y`, a whole number below 2^40.
- **A track's cells.** Walk the track's coordinates in order and add the cell of
  each point, and of a point every 25 m or less along each segment, since a
  simplified track keeps few points on a straight (the sync's own tolerance is 5 m
  and keeps about one point per 50 m on a gentle road). A segment longer than
  1 km is not filled in: its two ends count and nothing between, so a recording
  that lost signal does not draw a phantom line. Duplicates collapse to a set.
- **Near.** A cell is near a set when the set holds it or one of its 8 neighbours.
  That makes a match tolerant of about one cell (55 to 110 m) in any direction,
  which is what GPS wander between two passes of the same trail needs.

## The rules (`frontend/src/similar/`, framework-free, unit-tested)

For a viewed activity A and another B, with `shared` the number of A's cells near
B, and **coverage** `cov(A→B) = shared / |A|`:

- **Too small to say.** An activity with fewer than **20 cells** (about 1.1 km) is
  not compared, and takes part in neither section as A or B.
- **Routes like this.** `min(cov(A→B), cov(B→A)) ≥ 0.70`. Both must cover most of
  the other, so a short ride that sits inside a long one is not "like" it.
- **Near here.** Not a Route like this, and `shared ≥ 15` cells (about 0.8 km) and
  `max(cov(A→B), cov(B→A)) ≥ 0.25`. They share a stretch of ground. The size test
  keeps one crossed road from pairing every ride that leaves the same street.
- **Any type.** A hike and a ride on the same route pair. The route is the thing,
  not the sport, and the cards show each activity's type.
- **Which activities.** Completed, with a `track_ref`. The viewed activity is
  never in its own lists. A planned or active one is not compared.
- **Order and limit.** Each section: newest first (date, then time), up to 3.
  Constants live in one module, so a threshold is one edit.

### Measured

Against the demo tracks (the bundled loop of 166 cells and ride of 302 cells), with
a copy shifted sideways by the stated distance:

| Shift | Coverage, exact cells | Coverage, with Near |
|---|---|---|
| 10 m | 0.86 to 0.89 | 1.00 |
| 20 m | 0.75 to 0.80 | 1.00 |
| 80 m | 0.25 to 0.37 | 0.88 to 0.94 |
| 150 m | 0.13 to 0.26 | 0.40 to 0.52 |

A road 120 m parallel to the ride covers 0.51, under 0.70 and over 0.25: Near here,
not Routes like this. The loop and the ride, a long way apart, cover 0. The first
40% of the ride covers 1.00 of the whole ride one way and 0.42 the other: Near
here. These are why Near is on and why the route threshold is 0.70 rather than the
0.60 the exact cells alone would allow. Measured with a throwaway script over the
same formulas; the build's tests assert the same cases.

## The index (`frontend/src/state/similar-routes.ts`)

A module signal holds `{ id → { trackRef, cells } }`.

- **When it builds.** The first time an activity detail screen with a track opens
  in a session, and again on a later open if anything is unindexed. Nothing
  indexes at sign-in or on the Activities list, so a session that never opens a
  tracked activity makes no extra request.
- **Order.** The viewed activity first (its track is usually already in the session
  cache from the map hero), then the other completed tracked activities, newest
  first, to a cap of **600**. Older ones are left out and never fetched.
- **How.** One request at a time through `track-cache.ts`, so the detail screen's
  own fetch always has the second slot of the two-at-a-time limit. The cache gains
  a `keep: false` option, so an index fetch is not held in the session cache (600
  tracks would be megabytes) and a viewed activity's track still is.
- **Kept on the device.** `localStorage` key `thrive.cells.v1`: per activity its
  `track_ref` and its cells, sorted and delta-encoded in base 36, with the grid
  zoom and a format number. It is a convenience, never a source: missing, unreadable
  or over quota, the index rebuilds, and over quota it carries on in memory. An
  entry whose `track_ref` differs from the Workouts row's (the sync rebuilt the
  track) or whose activity is gone is dropped and re-fetched. An activity whose
  track the API says does not exist is stored as no cells, so it is not asked for
  again. **Signing out clears the key.** About 2 KB per activity, so 600 is
  about 1.2 MB of the 5 MB limit. This is the first time the app keeps anything
  derived from a track past a reload; the cells are 55 m squares, not the track,
  and are cleared with the session.
- **Failures.** A failed fetch (network, timeout, a token problem) is skipped, not
  stored. Five failures in a row stop the run, and the next open of a tracked
  activity starts it again. Nothing logs a coordinate, a cell or a track.
- **Demo mode.** The same index, built at once from `DEMO_TRACKS` with no request.

## Activity detail

- **Place.** After the Trails card, or the Elevation card when there is no Trails
  card (the real data has none until #690), and before the note card: Routes like
  this, then Near here. Each is shown only with at least one result. An activity
  with no readable track shows neither, and no placeholder.
- **Routes like this.** As #682.
- **Near here.** `h2` "Near here" in `.trail-section-title`, and under it, in
  `--text-sm` `--color-text-secondary`, "Share ground with this one". Then up to 3
  of #528's cards, as Routes like this has.
- **Both lists share a card at most once.** An activity is in Routes like this or
  in Near here, never both.
- **Results arrive as the index does.** A section appears when its first result
  does, and a later arrival re-sorts the list without moving focus or scroll. A
  card that leaves the top 3 because a newer one arrived is not announced.

### Status line

One line, `--text-sm` `--color-text-secondary`, `role="status"`, below the last
section (or alone, if there are none yet), only while the index is incomplete:

| State | Shows |
|---|---|
| Building | "Looking for similar routes… 120 of 480 checked" |
| Stopped on failures | "Couldn't check every activity. Open this screen again to finish." |
| Complete, or nothing to check | nothing |
| Offline before any fetch | the stopped line |

The count is activities checked over activities to check, both including the
saved ones, so a screen opened with 470 of 480 saved reads "470 of 480" at most
briefly and then goes. The count is not announced on every step: the live region
updates at most every 2 seconds.

## Demo data

`DEMO_ROUTE_PAIRS` and `pairedWith` are removed. The sections are produced by the
rule above from tracks, so demo mode exercises the real thing. Variants of the two
bundled tracks (`demo-track.ts`) are added to `DEMO_TRACKS`, made by a pure
function from a base track that shifts it by a stated distance and keeps a stated
share of it, and the matching demo workouts get a non-empty `track_ref`. Their
dates, times and ids are the existing ones, and no real coordinate is involved.

| Activity | Track | Shown for the demo ride (`w_demo011`) as |
|---|---|---|
| `w_demo012` | the ride shifted 20 m | Routes like this |
| `w_demo034` | the ride shifted 10 m | Routes like this |
| `w_demo028` | the first 40% of the ride | Near here |
| `w_demo022` | the ride shifted 150 m | Near here |
| `w_demo031`, `w_demo025` | the hike's loop shifted 20 m and 10 m | Routes like this, for the demo hike `w_demo008` |

The demo hike has no Near here. The demo ride and hike sit far apart, so each
shows none of the other. Showing a track on these activities also gives them a map
hero and a thumbnail, as any tracked activity has.

## States

| State | Shows |
|---|---|
| Activity has no track, or is planned or active | Neither section, no status line |
| Index building, no result yet | The status line only |
| Index building, some results | Sections with what there is, and the status line |
| Index complete, no result | Nothing |
| Offline, nothing saved | The stopped line; sections absent |
| Offline, saved cells | Sections from the saved cells, no status line |
| Saved cells but the activity's own track will not load | Sections absent; the map hero's own error line is unchanged |
| Storage unavailable or over quota | Works from memory, rebuilt on the next session |

## No new tokens, copy or icons

Strings: "Near here", "Share ground with this one", "Looking for similar routes… N of
M checked", "Couldn't check every activity. Open this screen again to finish."
Everything else reuses #682's classes and #528's card.

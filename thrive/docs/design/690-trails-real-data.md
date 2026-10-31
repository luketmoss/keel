# 690 — Trails on real data: the source, the states, and one rule change

Part of #680. #682 built the Trails card, the Trail screen and trail search over a
demo fixture, and its owner verdict was "goes ahead as shown". This note changes
none of how those look when there is data. It gives them a real source (the
`trails` cell #688 writes to `Workouts!AD`), says what the app shows when an
activity has no trail data to show, and tightens the like-for-like rule.

Earlier notes kept, unchanged: #682's rules (`frontend/src/trails/`), formats, pass
row, Trails card, Trail screen and search; #531's detail shell; #528's cards;
#404's interaction states; #260's external-link pattern. Where this note is silent,
#682 holds.

There are no standing documents in `thrive/docs/design/` (every file is
numbered), so #682's and #692's notes are the nearest authority.

## What this note does not touch

**Routes like this and Near here are #692's.** No file, rule or test of theirs is
touched here (`routes-like-this.tsx`, `similar/`, the grid index, the Near here
section). #692 is in development and edits `state/trails.ts`, `trails-682.test.tsx`
and the demo fixture too, so whichever lands second rebases. This note is written
against #692 as merged: `DEMO_ROUTE_PAIRS`, `pairedWith` and `routesLikeThis` are
gone, and Routes like this is no longer demo-only. If #692 has not merged when
this is built, leave `pairs` and `routesLikeThis` exactly as found and let #692
delete them on its rebase.

**Nothing here can ship before #688 is merged and deployed.** The column, the
`Workout.trails` field and `parseTrailsCell` (`frontend/src/api/trails-cell.ts`)
are #688's. This note only consumes them.

## Where the data comes from

Trails ride in the Workouts read, so they share its loading and refresh path
(#249). There is no new request, no loading state of their own and no cache.

- **Parsing.** Every completed activity's `trails` cell goes through
  `parseTrailsCell`. The result is one of: `untagged`, `tagged` (with `passes`,
  `unmatchedM` and `omitted`) or `unreadable`.
- **What counts as not tagged.** A blank cell on an activity whose `track_ref` is
  not blank. A blank cell with a blank `track_ref` has no track to tag and never
  will: it is not counted anywhere and shows nothing, as before.
- **A tagged cell with no passes** is knowledge: the sync looked and found no named
  trail. It shows nothing, like #682's "activity with no passes", and is not
  counted as untagged. So on an activity, a line saying "not tagged yet" appears
  only where the answer really is unknown.
- **Planned and active activities** are not read: only `completedWorkouts`.
- **The index** (`trailIndex` in `state/trails.ts`) is built from the parsed
  activities exactly as #682 builds it from the fixture, and recomputes when
  `workouts` is swapped, so a refresh after a sync brings new Trails cards in
  without a reload.
- **The matcher version is ignored.** Passes from different versions sit in one
  index. A matcher bump re-tags rows over later runs, and the app shows whatever
  each row holds.
- **A name that splits to nothing** (a bare `;`) puts its pass in no group: it is
  skipped, never an error.
- **One unreadable cell never hides the others.** It is counted and left out; every
  other row is read as normal.

### The demo goes through the same path

The demo fixture stays, and `?demo=true` still shows what #682 showed. But it no
longer has a source of its own: `DEMO_WORKOUTS` carry `trails` cells like real
rows do, written from the fixture's passes by a small encoder in
`api/demo-trails.ts`, and `trailSource()` reads cells in both modes. That way the
decoder, the three states and every screen below are exercised by the demo, and
the demo can't drift from the real column. The encoder's output for the #688 example
(the golden string #688 commits) is asserted equal to that string, so the two
encoders agree.

The fixture adds the cases the new states need (see **Demo fixture**).

## The rule change (`frontend/src/trails/compare.ts`)

Two passes are like-for-like when all of these hold. The first three are #682's
and unchanged:

1. same trail group
2. same direction
3. `|startPct − startPct'| ≤ 10` and `|endPct − endPct'| ≤ 10`, inclusive
4. **new:** the same `trail` string, exactly as written (before the split; case,
   spacing and the word "Trail" all count)
5. **new:** `|metres − metres'| ≤ 25%` of the longer of the two, inclusive. When
   either `metres` is unknown, the pair is not like-for-like (the length can't be
   checked, so the stretch can't be claimed). Two zero-metre passes are equal.

Why: a pass's percentages are relative to the geometry of the OSM name it matched
(#688 decision (a)). `Juniper Ridge` and `Juniper Ridge Trail` are one group on the
screen, but they are two OSM names, so 0 → 100% on one is not the stretch 0 → 100%
on the other. The length test also rejects a 40 → 60% pass against a 30 → 70% pass
(twice the length, which the 10-point rule accepts) and guards against OSM editing
a way between two taggings.

What changes on screen: a pass whose only earlier matches are under a different
name now reads "No earlier pass over this stretch". Search, groups, the Trails card
and the Trail screen group exactly as before. Names are `LIKE_FOR_LIKE_POINTS` and
a new `LIKE_FOR_LIKE_LENGTH_RATIO = 0.25`, beside each other in `compare.ts`.

Worked cases (the tests assert these):

| A | B | Like-for-like |
|---|---|---|
| `Juniper Ridge` 0 → 100%, 3210 m | `Juniper Ridge` 0 → 100%, 3204 m | yes |
| `Juniper Ridge` 0 → 100%, 3210 m | `Juniper Ridge Trail` 0 → 100%, 3205 m | no: same group, different name as written |
| `Aspen Draw;Kestrel Connector` 0 → 100%, 164 m | `Kestrel Connector` 0 → 100%, about 3 000 m | no: different name, and 164 m is not within 25% |
| `Juniper Ridge` 40 → 60%, 640 m | `Juniper Ridge` 30 → 70%, 1280 m | no: 640 is more than 25% of 1280 |
| 750 m | 1000 m | yes: exactly 25% of the longer |
| 749 m | 1000 m | no |
| 0 m | 0 m | yes |
| `metres` unknown | any | no |

## Activity detail

### Tagged with trails

The Trails card, as #682. One addition: when the cell's `omitted` is above 0, the
card footer gets a first line above the unmatched-distance line:

- "1 short pass isn't shown"
- "3 short passes aren't shown"

`--text-xs`, `--color-text-secondary`, in `.trail-unmatched`'s style. It is the
shortest passes that are left out (#688), so the line says "short". It is not
repeated on the Trail screen: a trail's count there is of the passes the cell holds.

### Not tagged yet

A completed activity with a `track_ref` and a blank `trails` cell has no Trails
card. In its place, in the Trails card's position, one line:

**"Trails not tagged yet"**

`--text-sm`, `--color-text-secondary`, a plain paragraph (`.trail-status`), not a
card, with the same side padding as the other sections and `--space-sm` + `--space-xs`
above and below like any section. It is not a status region and not a button: it
does not change while the screen is open unless a refresh brings the tags in, and
then it is replaced by the card.

It says nothing about when. A later sync run, or the backfill (#689), tags the
activity; the app doesn't explain that.

### Unreadable

A cell the decoder can't read: **"Trails couldn't be read"**, same style. The cell
is never shown or quoted.

### Nothing

- a tagged cell with no passes
- a blank cell with a blank `track_ref` (a strength workout, an untracked ride)
- a planned or active activity

Each shows no Trails card and no line.

## Activities: trail search

#682's search, rules and result list, over the real index.

- **The field** is shown when the index holds at least one trail group. With none
  (nothing tagged yet, or only tagged-with-no-trail), there is no field: there is
  nothing to search, and a field that always answers "No trails match" would only
  mislead. Once a sync tags the first trail and the screen refreshes, it appears.
- **Results across every month, newest last time first**, as #682.
- **Absence is not "never".** When activities are not tagged yet, a paragraph
  follows the result list, or follows the no-match line, in `--text-sm`
  `--color-text-secondary` (`.trail-untagged`, a plain paragraph), after
  `--space-sm`:

| Untagged | Unreadable | Shows |
|---|---|---|
| 0 | 0 | nothing |
| 1 | 0 | "1 activity not tagged yet. Its trails aren't listed." |
| 12 | 0 | "12 activities not tagged yet. Their trails aren't listed." |
| 0 | 1 | "1 activity's trails couldn't be read." |
| 0 | 3 | "3 activities' trails couldn't be read." |
| 12 | 1 | "12 activities not tagged yet. Their trails aren't listed. 1 activity's trails couldn't be read." |

  The count is of untagged activities across all months, because the search is
  across all months. It does not change as the user types.
- The no-match line is #682's: "No trails match “juniper x”". With untagged
  activities it is followed by the paragraph above, so a miss reads as "maybe not
  tagged", not "never been there".
- Long and odd OSM names: rows already wrap (`overflow-wrap: anywhere`), and the
  URL key is `encodeURIComponent`'d and decoded by the router, so a name with `/`,
  `%` or `&` opens its own screen. A test uses a name with each.

## Trail screen (`#/trail/<key>`)

Tagged, with the key in the index: #682's screen, unchanged in order and look. One
addition, a note between the Last time card and Every time:

- **`.trail-untagged`**, the same style as in search, `--space-sm` below the card.
- **When activities newer than the Last time activity are not tagged**, k of them
  (by date, then time; a tracked, completed, blank-cell activity):
  - "1 newer activity not tagged yet, so this may not be the last time."
  - "2 newer activities not tagged yet, so this may not be the last time."
- **Otherwise, when any are not tagged** (N of them, all older):
  - "1 activity not tagged yet. It may have been on this trail."
  - "12 activities not tagged yet. They may have been on this trail."
- **Neither:** no note.
- When some cells are unreadable, the sentence "1 activity's trails couldn't be
  read." (or "3 activities' trails couldn't be read.") follows either form.

The one note is the most relevant of the two, never both, so the goal question
("when did I last do this, and how did it compare?") is never answered with
confidence the data can't back.

### Trail not found, and when trail data is unavailable

#682's not-found layout (no top bar, `.empty-state`, a "Back to Activities"
button) is used for all three of these:

| Cause | Shows |
|---|---|
| The key names no trail, and nothing is untagged or unreadable | `p` "Trail not found", **Back to Activities** |
| The key names no trail, and N activities are untagged | `p` "Trail not found", then `.trail-no-match` style: "1 activity not tagged yet, so it may be in there." / "12 activities not tagged yet, so it may be in one of them.", **Back to Activities** |
| The activities didn't load (the app's initial read failed) | `p` "Couldn't load your activities, so trails can't be shown.", **Try again** (`btn btn-primary`), **Back to Activities** (`btn btn-secondary`) |

- **Try again** runs the initial load again (`loadInitialData`). The app's loading
  screen shows while it runs; if the read fails again, this state returns, and the
  existing "Failed to load data" toast shows again.
- To tell a failed read from an empty one, the store gains `loadFailed`, a signal set
  when `loadInitialData` fails for any reason but sign-in, and cleared when it
  succeeds. A background refresh that fails keeps the data it has and does not set
  it.
- The document title is "Trail not found" in all three. A trail whose activities are
  all unreadable is the second row with the unreadable sentence appended.
- **Loading.** A page load straight onto `#/trail/<key>` shows the app's own loading
  screen until the Workouts are read, then the trail. It never shows "Trail not
  found" in between, because the app renders no route while `loading` is true.

## Demo fixture (`frontend/src/api/demo-trails.ts`)

Everything in #682's fixture table stays. It is re-expressed as cells, and these
cases are added. All names invented; no real name, date or coordinate.

- **Like-for-like under the new rule.** The goal-question case must still hold: the
  newest Juniper Ridge pass (`w_demo011`) needs a same-string predecessor within
  25% of its length. Gravel Loop's two laps become `Juniper Ridge` (they were
  `Juniper Ridge Trail`). `Juniper Ridge Trail` stays on at least one activity
  (`w_demo034`, the oldest), so search and the group still show "Also mapped as".
  The tests that assert Gravel Loop's lap as the comparison are updated to the
  nearest same-string predecessor.
- **A different-name case.** At least one pass whose only earlier matches in its
  group are under a different name, so the screen shows "No earlier pass over this
  stretch" for that reason. Heron Loop and Heron Loop Trail are the natural pair.
- **Omitted passes.** `w_demo034`'s cell carries `x` 2, so its Trails card shows
  "2 short passes aren't shown".
- **Not tagged.** Two tracked demo activities with a blank cell, both older than
  `w_demo011`, so the Juniper Ridge screen shows "2 activities not tagged yet. They
  may have been on this trail." and the search shows its note.
- **Tagged, no named trail.** One tracked demo activity with
  `{"v":1,"m":1,"u":<metres>,"n":[],"p":[]}`: no card, no line.
- **Unreadable.** One tracked demo activity with a cell the decoder rejects (an
  unknown version, `{"v":2}`), so the "Trails couldn't be read" line and the
  unreadable sentence are on screen in demo.
- **Tracks for these four.** Existing outdoor history activities (types bike, hike
  or run; develop picks them, with the demo parity tests green) get `track_ref` and
  a track. Their tracks are the bundled ride or loop shifted far enough (5 km) to
  share no grid cell with any other demo track, by #692's shift helper in
  `demo-track.ts`, so Routes like this and Near here are unchanged from #692's table.
  If #692 has not merged, the same few lines are written here and #692 keeps
  whichever lands.

The demo's cell count must stay small enough that the encoder runs at module load
with no measurable cost; no further requirement.

## States

| State | Shows |
|---|---|
| Signed in, nothing tagged anywhere | No search field. Each tracked completed activity: "Trails not tagged yet". `#/trail/*`: "Trail not found" with the untagged sentence |
| Tagged, trails | Trails card; search; Trail screen |
| Tagged, no named trail | Nothing on the activity. Not counted as untagged |
| Blank cell, no track | Nothing. Not counted |
| Not tagged (blank cell, has track) | "Trails not tagged yet", and counted in the notes |
| Unreadable | "Trails couldn't be read", and counted in the notes |
| Passes left out (`x`) | Trails card, plus "N short passes aren't shown" |
| Mix of tagged and untagged | Search and Trail screen notes as above; each activity by its own cell |
| Workouts failed to load | Trail screen: "Couldn't load your activities…" with Try again |
| Workouts refreshed after a sync | Lines and cards update in place; no reload |
| Offline with the data already loaded | Nothing different: the cells are in memory |

There is no loading state of its own and no error state on a card: the cell is part
of the row that is already on screen.

## Measurements

Measured in the running app (`?demo=true#/trail/juniper%20ridge`, emulated 375×667,
dev server from `.claude/launch.json`'s `thrive` entry), on the code as of #682:

- Top bar 0 to 52 px; title block 64 to 121 px; the Last time card 133 to 308 px.
- The activity row is 44 px tall (181 to 225); the first pass row's comparison line
  ends at 292 px.
- The bottom nav's top edge is at 603 px (64 px tall).

So the card ends 295 px above the nav, and a note of two lines of `--text-sm` plus
`--space-sm` (about 60 px) under it still ends well above 603 px. The #682 claim
("the title block and the first pass row, comparison line included, are on screen
without scrolling") holds, with 295 px to spare, and the criterion below is that
the card and the note are above 603 px at 375×667 with the longest note in the
fixture.

## New tokens, icons, copy

**No new tokens and no new icons.** The two new classes (`.trail-status`,
`.trail-untagged`) use `--text-sm`, `--color-text-secondary` and `--space-*`.

Strings, in full: "Trails not tagged yet"; "Trails couldn't be read"; "1 short pass
isn't shown"; "N short passes aren't shown"; "1 activity not tagged yet. Its trails
aren't listed."; "N activities not tagged yet. Their trails aren't listed.";
"1 newer activity not tagged yet, so this may not be the last time."; "N newer
activities not tagged yet, so this may not be the last time."; "1 activity not
tagged yet. It may have been on this trail."; "N activities not tagged yet. They may
have been on this trail."; "1 activity not tagged yet, so it may be in there.";
"N activities not tagged yet, so it may be in one of them."; "1 activity's trails
couldn't be read."; "N activities' trails couldn't be read."; "Couldn't load your
activities, so trails can't be shown."; "Try again"; "Back to Activities". As
#682, none says "ride" or "ridden".

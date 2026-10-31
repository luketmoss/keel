# 682 — Trail prototype: Trails card, Trail screen, trail search, Routes like this

Part of #680. It follows spike #681, whose `## Results` the data rules come from.
This is a demo-mode prototype in the real app. Every surface here is shown only
when the trail source has data, and only demo mode has any. A signed-in session
sees none of it.

Earlier notes kept: #531's detail shell (top bar, title block, card style,
not-found, focus), #532's map hero and Elevation card, #528's activity card,
#642's search field, #404's interaction states, #405's drawn icons, and
#260's external-link pattern.

## The rules (`frontend/src/trails/`)

The rules are pure functions with no view library, unit-tested. The build phase
keeps them.

### Trail groups

- **Split.** A pass's OSM name is split on `;` and on ` / ` (space, slash,
  space). Each part is trimmed and empty parts are dropped. The pass belongs
  to every resulting trail. `Fox Hollow / Kestrel Connector` is a pass on Fox
  Hollow and a pass on Kestrel Connector.
- **Key.** Lowercase, with runs of whitespace collapsed to one space. Then
  ` trail` is removed from the end when something is left. `Heron Loop Trail`
  and `Heron Loop` are both `heron loop`, and `Trail` alone stays `trail`.
- **Sections stay apart.** `Lower Juniper` is not `Juniper Ridge`, and no
  prefix or alias rule joins them.
- **Display name.** This is the variant (the part as written, after the split)
  carried by the most passes across all activities. A tie goes to the variant
  on the most recent pass.
- **Other names.** These are the group's other variants, in the order they were
  first seen.
- **URL key.** `encodeURIComponent(key)`, so the route is
  `#/trail/heron%20loop`.

### Like-for-like

Two passes are **like-for-like** when all of these hold:

- they are in the same trail group
- they go in the same direction
- `|startPct − startPct'| ≤ 10` and `|endPct − endPct'| ≤ 10`

The 10 is inclusive.

A pass's **comparison** is with an earlier activity only. Out of the earlier
activities (by date, then time) with at least one like-for-like pass, take the
most recent, and from it, the last such pass. Laps within one activity are not
compared with each other.

- **Time difference**: `durationS − durationS'`. Shown only when both durations
  are known.
- **Climb difference**: `climbM − climbM'`. Shown only when both are known.

### Search

The query is trimmed. A group matches when any of its variants contains the
query, ignoring case. A query that is blank after trimming is not a search.

## Formats

| Thing | Format | Example |
|---|---|---|
| Position | start → end, whole %, rounded | "0 → 100%", "100 → 0%", "40 → 100%" |
| Pass time | m:ss under an hour, h:mm:ss from an hour | "14:32", "1:02:10" |
| Climb | feet, grouped, "↑" | "↑ 420 ft" |
| Entry offset | time into the activity, as pass time, with " in" | "0:42 in" |
| Date | as #531's date line, without the time; year added when it is not this year | "Thu, Oct 22", "Thu, Oct 23, 2025" |
| Short date (in comparisons) | month and day, plus year when it is not this year | "Oct 3", "Oct 3, 2025" |
| Distance | miles, one decimal | "1.2 mi" |

The time difference reads as "1:12 faster" or "0:40 slower". Under 5 s either
way it reads as "Same time". The climb difference reads as "↑ 20 ft more" or
"↑ 20 ft less", and it is left out under 10 ft either way.

Every word here works for a ride, a hike, a run and a walk. No copy says
"ride" or "ridden".

## Pass row (shared)

The same component is used on the Trails card, the Last time card and the Every
time list.

```
[■■■■■■■■■■■■■■■■■■■▶          ]      ← position bar
0:42 in · 0 → 100% · 14:32 · ↑ 420 ft
1:12 faster · ↑ 20 ft less than Oct 3
```

- **Position bar:** full width, `--trail-bar-height` tall (new, below),
  `--radius-full`. The track is `--range-track`. The fill runs from
  min(start, end) to max(start, end) in `--color-primary`. At the end the
  pass finished (the right edge for forward, the left for reverse), a
  triangle points the way of travel. Its height is `--trail-bar-height` × 2,
  in `--color-primary`. `aria-hidden="true"`, because line 1 says the same
  thing.
- **Line 1:** `--text-sm`, `--color-text`, `tabular-nums`. Its parts are
  joined with " · ". "0:42 in" appears only when the trail has more than one
  pass in this activity. A part whose value is unknown is left out.
- **Line 2, the comparison:** `--text-sm`, `--color-text-secondary`. It is the
  time difference, then the climb difference, then " than <short date>". With
  only one of the two known, only that one shows. When there is no
  like-for-like pass before, or both differences are unknown, it reads **"No
  earlier pass over this stretch"**. There is no colour coding: the words
  carry faster and slower.
- Passes are `--space-sm` apart, in time order.

## Activity detail: Trails card

It comes after the Elevation card (after the stats card when there is no
track), and before the note card. It is shown when the activity has at least
one pass. It uses #531's card style: `--color-surface`, `--radius-lg`, padding
`--space-md`.

- **Header row:** on the left, `h2` "Trails" at `--text-base` 600, with a 16px
  trail icon (new, below) in `--color-primary`. On the right, "3 trails" (or
  "1 trail") in `--text-sm` `--color-text-secondary`.
- **One block per trail group**, in the order of each group's first pass. A
  hairline (`--color-border-light`) and `--space-sm` + `--space-xs` (12) of
  space separate the blocks.
  - **Trail link:** a full-width `button`, at least 44px tall, that opens
    `#/trail/<key>`, with `data-focus-key="trail:<key>"`. It holds the display
    name (`--text-base` 600) and under it, in `--text-sm`
    `--color-text-secondary`, "8 other times" (or "1 other time"), or "First
    time on this trail" when there are none. A 16px chevron-right sits on the
    right. Its accessible name is "<name>, 8 other times. Open trail".
  - Then the group's pass rows.
- **Footer**, `--text-xs` `--color-text-secondary`, after a hairline:
  - "1.2 mi not on a named trail", only when the unmatched distance is at
    least 0.1 mi
  - "Trail names © OpenStreetMap contributors", where "OpenStreetMap
    contributors" links to `https://www.openstreetmap.org/copyright`. It opens
    in a new tab, with #260's external glyph, an sr-only "(opens in a new
    tab)", and a 44px tall hit area. The data is synthetic in demo mode, but
    the credit is part of the look the build needs.

## Routes like this

It comes after the Trails card and before the note card. It is shown when the
fixture pairs this activity with at least one other.

- `h2` "Routes like this" at `--text-base` 600, with `--space-sm` below it. It
  is not on a card.
- Below it, up to 3 of #528's activity cards, unchanged, newest first, each
  opening its activity. A card's `data-focus-key` is
  `workout:<id>`, as on Activities.

## Trail screen (`#/trail/<key>`)

It is a new route in `router.tsx`'s route list. Its document title is the
display name, and "Trail not found" when there is none. It has no tab bar
highlight change: Activities stays selected.

Order on screen:

1. **Top bar:** #531's, with Back only (no Edit and no menu). Back calls
   `goBack()`.
2. **Title block:** a 44px tile (`--color-primary-light`, `--radius-md` +
   `--space-xs`) holding the trail icon at 24px in `--color-primary`. Next to
   it, the `h1` display name (`--text-2xl`, 700) and under it "Also mapped as
   Heron Loop Trail" (other names joined with ", "), in `--text-sm`
   `--color-text-secondary`. That line is left out when there are no other
   names.
3. **Last time card:** #531's card style.
   - Header row: `h2` "Last time" on the left, and the date ("Thu, Oct 22") on
     the right in `--text-sm` `--color-text-secondary`.
   - Then the activity: its type icon at 18px in `--type-<type>`, its name (or
     type word) in `--text-base` 600, and "· 4 passes" in
     `--text-sm` `--color-text-secondary` when there is more than one. The
     whole row is a 44px button that opens the activity.
   - Then that activity's pass rows on this trail.
   - At 375×667 the title block and this card's first pass row, comparison
     line included, are on screen without scrolling. That is the goal
     question: when, and how it compared.
4. **Every time:** `h2` "Every time", with "9 times" on the right in
   `--text-sm` `--color-text-secondary`. One #531-style card per activity,
   newest first, the latest included, `--space-sm` apart. Each card has the
   same activity row as the Last time card, with the date added to its
   secondary text ("Thu, Oct 22 · 2 passes"), then its pass rows.
5. **Credit:** the Trails card's OpenStreetMap credit line, alone.

Section spacing and side padding follow #531 (`--space-sm` + `--space-xs`
between sections, `--space-md` at the sides).

**Not found:** an unknown key, or any key outside demo mode, shows #531's
not-found layout with "Trail not found" and "Back to Activities".

**Focus:** arriving focuses the `h1`, as other routes do. Back returns to the
opener, with focus on its `data-focus-key` (the Trails card's trail link, or
the search result row).

## Activities: trail search

It is shown only when the trail source has data.

- **Field:** between the header and the type chips. It uses #642's Exercises
  search field style (`.ex-search .search-input`: 44px, magnifier icon,
  `--color-surface`, no border), with `type="search"`, placeholder "Search
  trails" and `aria-label="Search trails"`. When it has text, a 44px "Clear
  search" icon button sits inside it on the right.
- **The query lives in a module signal**, so it survives opening a trail and
  coming Back.
- **While a search is active:** the type chips, the tag row, the month
  summary, In progress, Up next and the week list are all hidden. In their
  place is the result list. The header (month picker and title) stays.
  Choosing a month clears the search.
- **Result list:** `h2` "Trails" with "3 found" on the right (`--text-sm`
  `--color-text-secondary`). Then one 44px+ row button per matching group,
  across **all** months, newest last time first. A row shows the display name
  (`--text-base` 600) and under it "9 times · last Thu, Oct 22" in `--text-sm`
  `--color-text-secondary`, with a chevron-right. It opens `#/trail/<key>`,
  with `data-focus-key="trail:<key>"`. Rows sit on `--color-surface`,
  `--radius-lg`, `--space-sm` apart.
- **No match:** "No trails match “juniper x”" in `--text-sm`
  `--color-text-secondary`, in place of the list.
- **Clearing:** Clear search, Escape in the field, or deleting the text puts
  the screen back exactly as it was, with the same month, type and tags.
  Clear search returns focus to the field.
- The search finds trails, not activities. Activities are one tap further, on
  the Trail screen.

## Demo fixture (`frontend/src/api/demo-trails.ts`)

All names are invented. Do not open `thrive/scripts/.spike-681/`, and do not
copy a name from it. Each activity entry holds its passes, in #681's per-pass
shape (`trail` as OSM wrote it, `metres`, `durationS`, `climbM`, `startPct`,
`endPct`, `direction`, `entryOffsetS`), and `unmatchedM`. A separate list
holds the Routes like this pairs. Passes attach to existing demo workouts
where the type fits, and new demo workouts are added only where needed, with
the demo parity tests kept green.

The fixture must contain every case these screens have to show:

| Trail (as OSM writes it) | Case |
|---|---|
| `Juniper Ridge` and `Juniper Ridge Trail` | with/without "Trail": one group, at least 5 bike activities over at least 3 months |
| `Lower Juniper` | a section, its own group; found with Juniper Ridge by "juniper" |
| `Heron Loop` and `Heron Loop Trail` | a second grouped trail |
| `Aspen Draw;Kestrel Connector` | `;` multi-value, short connector (< 200 m, full length) |
| `Fox Hollow / Kestrel Connector` | ` / ` multi-value |
| `Ridge Trail` | the hike trail: the demo "Ridge Trail" hike plus at least 2 earlier hikes |

On Juniper Ridge, at least these:

- the newest ride, a full forward pass (0 → 100%) with a like-for-like
  predecessor, so the goal question has an answer
- a lap ride: two forward passes in one activity
- an out-and-back: a forward pass, then a reverse pass with no earlier
  reverse
- a partial pass (about 40 → 100%) with no like-for-like predecessor

Also:

- The tracked demo ride (`demo-track-ride`) is one of the Juniper Ridge rides,
  so one detail screen shows the map, the elevation and the trails together.
  Its unmatched distance is at least 0.1 mi. The hike's is 0.
- At least two Routes like this pairs, one of them among the Juniper Ridge
  rides.
- Climb is positive on forward Juniper Ridge passes and small on reverse
  ones, so the differences look plausible.

## States

| State | Shows |
|---|---|
| Not demo mode (no trail data) | No Trails card, no Routes like this, no search field. `#/trail/*` is not found |
| Demo activity with no passes | No Trails card |
| A pass with an unknown duration or climb | That part is left out of line 1, and the comparison uses what is known |
| A trail with only one activity | Trail screen: the Last time card and an Every time list of one. Trails card: "First time on this trail" |
| Search with no match | The no-match line |

There is no loading or error state: demo data is synchronous. A real source's
loading and error states belong to #680's build.

## New tokens

- `--trail-bar-height: 6px`: the pass position bar's height. It matches
  `--drink-bar-height`, but it is its own token because the two bars change
  for different reasons.

## New icon

**Trail**, drawn as #405's icons are (24-unit viewBox, 2px round stroke,
`currentColor`): a winding path that runs from the bottom left to the top
right, with two bends. It goes in `components/shared/icons.tsx` as
`TrailIcon`.

## Measurements

The 375×667 no-scroll claim on the Trail screen is from the parts specified
here, not measured: the screen doesn't exist yet. Top bar (44 + `--space-sm`),
title block (44px tile, a two-line text column at most), and the Last time
card header, activity row (44) and one pass row (bar + two text lines) add up
to well under 667 px. If the built screen misses it, `/test` measures with
`getBoundingClientRect()` and the layout is fixed, not the criterion.

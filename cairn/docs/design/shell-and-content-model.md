# cairn shell and content model

Standing reference, not an issue note — the same status as
[design-language.md](design-language.md), and no number for the same reason.
That file decides what cairn is *made of*: colour, scale, elevation, motion.
This one decides what cairn *contains* and *where it goes*. Neither overrides
the other; a change that needs both says so.

**It supersedes the Navigation section of design-language.md** — which proposed
three changes as targets rather than specifying them — and the chrome placement
decided by #78 (`TopBar`), #79 (the floating date range), #80 (the trips panel's
position), and #104 (the basemap control's position). Those issues are not
wrong; they each placed one control correctly on the day it shipped, and never
against each other. This file is what they were missing.

It also restates a rule from #81 that the content model breaks. See *Routes*.

**[cairns.md](cairns.md) is standing and wins wherever the two disagree.** It
replaced *photo* as a kind of its own with **cairn** — something at a
coordinate, carrying an optional image and an optional icon, absorbing points
of interest with it — and superseded the *Three kinds* table below and the
*Position, and the photo that has none* section, which no longer describes a
reachable state: a cairn always has a position. Everything else here — the
column, the panel, ownership moves, routes, mobile — is unchanged and still
authoritative.

## The two ideas

**Everything is on the map.** A trip, a day hike's track, and one good photo are
all things that live at a coordinate. None of them requires the others to exist.

**A trip is a bundle, not a container you must use.** It has a name, a status, a
date range, and it holds tracks and photos — but a track outside a trip is not a
lesser thing, and putting one into a trip is a move, not a promotion.

Under both sits the rule cairn already followed, unchanged: **chrome floats over
a map.** The map is the content. What follows mostly falls out of taking that
sentence seriously for the first time.

The spatial model is Google Maps': one column on the left carrying search,
results and detail; map controls in the map's own corners; no page-level
navigation. That is a deliberate borrowing of *layout*, not of look — nothing
here changes a colour, a radius, or a typeface.

---

# Part one — the content model

## Two kinds, plus cairn

| Kind | What it is | Marker | Position comes from |
|---|---|---|---|
| **Trip** | A named bundle with `planned \| completed` and a date range | Dot: filled `--accent` when completed, hollow when planned | Its existing `origin` |
| **Track** | One route, usually a day hike | Rounded tile at `--radius-sm` carrying the track's own colour | First point of its geometry |

A cairn — something at a coordinate, carrying an optional image and an
optional icon — is the third thing this column and this map show. Its own
shape, its marker and its position sources are [cairns.md](cairns.md)'s, not
restated here.

A track or cairn is **loose** when no trip owns it, and **owned** when one
does. That is the only distinction; a loose track is not a different type from
an owned one, and no field other than ownership changes when it moves.

**Owned things do not draw at the top level.** A trip's tracks and cairns
appear when the trip is open, not as separate markers beside its dot —
otherwise a trip with 200 cairns buries every other thing on the map.

## Ownership moves

**One action in each direction, and they are named.**

| Action | Where | What happens |
|---|---|---|
| Add to a trip | Primary button on a loose track or photo; `⋮` on its row | Moves it into that trip |
| Remove from trip | `⋮` on the row, inside a trip | Moves it back out; it becomes loose |
| Delete permanently… | `⋮`, in `--danger`, with the inline confirm | Destroys the file |

**Remove and delete are separate items in the same menu, never one action with a
second step.** Getting rid of something is one click away from everywhere it
appears. This is also why the labels are the full phrases: `--danger` and
`--accent` are near-identical under red-green colour blindness, so per
design-language.md the words carry the meaning and the colour only reinforces
it.

### Add to a trip offers an existing trip or a new one

The picker opens **inside the panel**, bounded by its width — never a floating
menu that can leave the column.

```
Add to a trip                    Cancel
＋ New trip…
─────────────────────────────────────
● Larapinta Trail            4T · 128P
● Overland Track              3T · 96P
○ Kokoda Track                 1T · 0P
```

Choosing a trip moves the item and opens that trip. Choosing **New trip…**
replaces the list with a name field and a `Create` button, then does the same in
one step — creating a trip and putting nothing in it is not a state the user has
to pass through.

Counts read `4T · 128P` in the monospace face at `--text-xs`: a trip's contents
are what makes it the right or wrong destination.

## Storage

The app owns `/Cairn/`, unchanged, under `drive.file` — see cairn's `CLAUDE.md`.
Loose things need a home outside any trip folder:

```
/Cairn/
├── trips/<trip-id>/          # as today
└── loose/
    ├── tracks/<track-id>/
    └── cairns/<cairn-id>/
```

**"Add to a trip" is a move between folders**, and "remove from trip" is the
same move reversed. Neither is a copy, and neither is a delete.

This is a real change to the decision recorded in cairn's `CLAUDE.md` that a
trip is where things live. The decision that **a trip is one entity with a
`planned | completed` status** is untouched.

## The index and the performance rule

cairn's `CLAUDE.md` requires the overview map to read precomputed simplified
geometry, never source KMLs. **That rule now covers loose tracks**: each needs
its own `overview.geojson`, generated the same way and at the same time as a
trip's.

The world index carries three kinds rather than one. A loose photo is cheap — a
coordinate and a thumbnail id — and a loose track costs exactly what a trip
costs today.

---

# Part two — the shell

## The column

One column, `--space-4` from the top, left and bottom edges, `--panel-width`
wide. Three parts, stacked with `--space-2` between them:

```
┌──────────────────────┐
│ search card          │  --search-height, --radius-md, L2
├──────────────────────┤
│ chips                │  --chip-height, --radius-full, L2
├──────────────────────┤
│                      │
│ panel                │  fills the rest, --radius-md, L2
│                      │
└──────────────────────┘
```

Everything else on screen belongs to the map.

## The search card

Three slots, and the first one changes meaning. This is what makes back a
first-class control rather than an afterthought.

| Slot | At rest | On a detail |
|---|---|---|
| Left, `--hit-target` | The cairn mark — opens the app menu | **Back** — returns to the list |
| Centre | Search field | Name, and kind beneath it |
| Right, `--avatar-size` | Account avatar | Unchanged |

**There is no navigation bar and no wordmark beside one.** `World` and `Trips`
were never destinations — one is the map, the other is a panel over it — and a
control that promises a page it does not deliver is worse than no control. The
identity lives in the mark; the account lives in the same card rather than
floating alone in the opposite corner.

Copy: the field reads `Search trips, tracks and photos`. The kind line reads
`trip`, `track · not in a trip`, or `photo · not in a trip`, in the monospace
face at `--text-xs`, uppercase, `--text-muted`.

## The chips

`All` · `Trips` · `Tracks` · `Photos`. Selected chip takes `--accent-soft` with
`--accent` text, per the language's Selected state.

**One filter drives the list and the map together.** A chip that hid rows but
left markers would be two truths about the same question.

**The chips are hidden while a detail is open** — filtering a list you are no
longer looking at is noise — and while a draft import is open, for the reason
#81 already gives.

## The panel

Two faces of one surface. Navigating between them never unmounts the map and
never moves the search card.

**List face.** Header, then the year range, then the rows.

- Title is the active chip: `Everything`, `Trips`, `Loose tracks`,
  `Loose photos`. The header always names what you are looking at.
- Count beside it, monospace, `--text-xs`, `--text-muted`.
- `New trip` action, right-aligned.
- **The year range lives here**, under the header: a two-thumb slider labelled
  `Years` with the bounds either side in tabular numerals. It is a property of
  the list, not of the map, and the floating bottom-centre slider from #79 is
  removed.

**Row anatomy.** Glyph, text, `⋮`.

```
● Larapinta Trail                             ⋮
  12 – 19 Jun 2023 · 4 tracks · 128 photos
```

| Kind | Meta line |
|---|---|
| Trip | `12 – 19 Jun 2023 · 4 tracks · 128 photos` |
| Track | `9 Mar 2024 · 14.2 km · 690 m` |
| Photo | `3 Nov 2024 · photo` |
| Photo, unplaced | `1998 · no location` |

**The row's glyph is the marker.** Same shape, same colour, same status
treatment, drawn smaller. A thing spotted on the map and the same thing in the
list have to be recognisably one object, and #80 already established that a row
and its dot are one object for hover.

**`⋮` replaces the always-visible `×`.** It appears on hover and on focus,
carries named actions, and is where both remove and delete live. An icon whose
only meaning is *destroy this* does not get to be the one control permanently
visible on every row.

Rows are `--row-touch` minimum. Hover and the map's matching marker light
together in both directions.

**Detail faces.** One per kind, all sharing the same header shape: name at
`--text-lg`/700, a metadata row, a primary action, `⋮`.

| Kind | Primary action | Body |
|---|---|---|
| Trip | `Import files` | Tabs — `Tracks n` · `Photos n` · `Notes` |
| Track | `Add to a trip` | Distance, ascent, points, source file |
| Photo | `Add to a trip` | The image, then position and source |

A trip's date range opens the range picker (below). A track's and a photo's
dates come from their files and are not edited here.

## The range picker

Two native date inputs will not fit `--panel-width` side by side and will never
match the rest of the app. **They are replaced by one range calendar built from
cairn's own parts** — `--radius-full` day cells, `--accent-soft` for the span,
`--accent` for the two ends — opening inside the panel so it cannot overflow.

It expresses a full range, a start with no end while picking, and no dates at
all. `Clear` sets no dates; `Done` commits.

## The map's corners

| Corner | What lives there |
|---|---|
| Bottom left | **Layers** — a thumbnail that expands to Map / Satellite / Terrain, and a Labels switch |
| Bottom right | Fit-to-everything, then zoom in / out |
| Top left | The column |
| Top right | *Nothing.* The account moved into the search card |

**A map control belongs in the map's corners.** The basemap picker sat top-right
under the account bubble, as far from every other filter as the screen allows,
and needed arithmetic in its own stylesheet to dodge a control that was already
there. Layers is a thumbnail because the choice is visual.

When the panel is open, Layers clears the column; when the panel is collapsed it
slides to the map's own left edge, over `--motion-base`.

The Layers panel also carries the **3D** switch. While 3D is on the trigger
is badged, and the tile selection is Satellite — there is no 3D form of Map
or Terrain.

## Navigation

**The map is never unmounted.** One Google Maps instance for the session. Camera
state survives every navigation because nothing that navigates destroys it.

| Route | What it draws |
|---|---|
| `/` | Column with the list face |
| `/trips/:id` | Column with the trip face |
| `/tracks/:id` | Column with the track face |
| `/photos/:id` | Column with the photo face |

`/trips/:id` stops being a top-level route that unmounts everything above it.
Filters, scroll position and the camera survive by construction rather than by
the module-level snapshots #79 and #80 needed.

Back returns to the list, always — the left slot of the search card, at
`--hit-target`. Collapsing the panel is a tab on its right edge, and the panel
**opens by default**: the list is the home screen, which is what removes the last
argument for a navigation bar.

## Markers and routes

| Kind | Size | Ring |
|---|---|---|
| Trip dot | `--dot-size` | `--dot-ring` |
| Track tile | `--marker-track`, `--radius-sm` | `--dot-ring` |
| Photo | `--marker-size` | `--marker-ring` |

Hit target is `--hit-target` for all three regardless of drawn size. Hover,
focus, and a hovered row all scale the marker to 1.35 and reveal its name chip —
one treatment, three sources, as #80 established.

Selecting anything dims every other marker. Clustering (#79) treats all three
kinds as one pool.

### Routes

**A track's route draws on hover and on selection, never at rest.** At rest
every kind is a marker. This keeps the world readable at six things or six
hundred, and keeps the performance rule honest.

**On the 2D map.** In 3D there are no marker glyphs, so routes draw at rest
and the world view is a set of routes on terrain. Both surfaces read the same
`overview.geojson`; the performance rule is unchanged.

#81 established *a dot means it is a trip, a route means it is not saved yet*.
Loose tracks draw real routes, so that rule no longer holds as written and
becomes:

> **A white route means unsaved.** Colour, not the presence of a line, is what
> distinguishes a draft import from a saved track.

A selected track's route uses its own colour with the `drop-shadow(0 0 7px)`
glow design-language.md licenses. A draft uses `--text`.

## Mobile

The column's phone form is the bottom sheet design-language.md already
specified and nothing has built. **They are one design, and doing them apart
means designing the transition twice.**

| Detent | Height |
|---|---|
| Peek | `--sheet-peek` |
| Half | `--sheet-half` |
| Full | `--sheet-full` |

Draggable, snapping under `--motion-base`. Opening a **decision** — an import
draft, the placement queue, the cairn-create panel — goes to full and suspends
the detents until it closes. Opening a **place** — a trip, a loose item, a
track face — changes the face and leaves the detent alone, except that peek is
promoted to half so the face is not a sliver.

The search card floats above the sheet at the top of the screen. The chips move
into the sheet, directly under the grabber. Map controls stack above the sheet's
top edge and move with it. Everything else — rows, faces, actions, copy — is
identical to desktop.

## New tokens

The only place a raw value belongs.

| Token | Value | For |
|---|---|---|
| `--search-height` | `56px` | The search card |
| `--chip-height` | `34px` | Filter chips |
| `--marker-track` | `22px` | The track tile marker |
| `--sheet-peek` | `140px` | Sheet detent, collapsed |
| `--sheet-half` | `52vh` | Sheet detent, half |
| `--sheet-full` | `92vh` | Sheet detent, full |

**Changed:** `--panel-width` moves from `360px` to `380px`. The column now
carries detail as well as a list, and a track's stats row is cramped at 360.

**Removed:** `--sidebar-width` (`320px`). Nothing docks any more.

## States

| State | List face | Map |
|---|---|---|
| Nothing at all | `Nothing here yet` / `Drop a KML or a photo anywhere to start.` | Empty overlay, same copy |
| Filtered to nothing | `Nothing in this range` / `Clear filters` | Empty overlay |
| Signed out | `Sign in to see your map.` | Same, over the live basemap |
| Loading | Rows fade in as the index hydrates; no spinner | Basemap draws immediately |

"Sign in to see your map" replaces #95's "sign in to see your trips": the panel
is no longer only trips.

Disconnected remains read-only exactly as #73 specifies — every mutating control
takes the Disabled treatment, with one sentence per surface rather than a
tooltip per control.

## Decisions not taken

Recorded so they are not made twice.

- **Keeping `World` / `Trips` as navigation.** Rejected: neither is a
  destination, and the tile promised a page it did not deliver.
- **A loose track as a one-track trip**, avoiding a third kind entirely. Rejected
  as a lie in the list — every day hike would appear as a trip, the trip count
  would stop meaning anything, and "add to a trip" would become a merge instead
  of a move.
- **Remove-from-trip as the only removal**, with delete reached afterwards.
  Rejected: it makes deleting a two-step operation to save a menu item.
- **Loose tracks drawing their full route at rest.** Rejected against the
  performance rule; a route on hover and on selection carries the same
  information at a fraction of the cost.
- **Grouping the list by kind** instead of filtering it with chips. Rejected:
  three headed sections in a `--panel-width` column spend most of their height
  on headings, and the chips already answer the same question in one row.
- **A separate saved/library page.** Rejected for the reason the nav bar was:
  the list is the home screen, so a second home is a second place to look.

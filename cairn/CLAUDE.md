# CLAUDE.md — cairn

A map app for importing KML tracks and organizing them into trips, with
Drive-backed storage and photo EXIF plotting in later phases. Personal use.

**Stack:** web. The authoritative conventions for this project are in
`.claude/skills/stack-web/SKILL.md` — read it before writing code here.

Workspace rules live in the root `CLAUDE.md` and `CONVENTIONS.md`. This file
covers only what is specific to cairn.

## Layout

```
cairn/
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   └── components/
└── docs/design/        # UX artifacts, one file per issue
```

## Decisions already made

These were settled before the project existed. Revisit them deliberately, not
by accident.

- **"photo" is not a kind.** Photos and points of interest are one **cairn** —
  something at a coordinate, carrying an optional image and an optional icon.
  A photo is a cairn with an image and no icon; a campsite is a cairn with an
  icon and no image; both together is legal and useful. Normative in
  [`docs/design/cairns.md`](docs/design/cairns.md), which is standing and
  authoritative for every issue that touches a cairn.
- **Map engine is the Google Maps JS API**, via `@vis.gl/react-google-maps`.
  Chosen for satellite imagery quality and because Drive already puts the user
  through Google OAuth — one vendor, one consent screen. `Map3DElement` is the
  path to a Google Earth–style view if one is wanted later.
- **Not a Google Earth plugin.** There is no extension API for Google Earth Web,
  and the old NPAPI plugin was removed in 2015. Earth interop is a KMZ export
  button, never an architecture.
- **Storage is Google Drive under the `drive.file` scope.** Full `drive` and
  `drive.readonly` are restricted scopes requiring a paid CASA security
  assessment to publish; `drive.file` is not. The app owns a `/Cairn/` folder
  and everything it creates inside it. It cannot see files the user adds to that
  folder by other means — those must come through the Google Picker.
- **No backend.** Static SPA, client-side OAuth, Drive as the only persistence.
- **Photos without GPS get positioned by timestamp interpolation** against the
  trip's tracks, not discarded. This is the feature that makes cairn worth using
  over dumping a folder into Google Earth.
- **A trip is one entity with a `planned | completed` status**, not two types.
  Planning KMLs stay alongside the actual tracks after the trip happens.
- **Tracks and cairns can exist without a trip.** A day hike's track and a
  single good photo are things at a coordinate; neither needs a trip invented
  around it. Loose ones live under `/Cairn/loose/`, and adding one to a trip is
  a move between folders rather than a copy or a promotion.
- **A trip is a bundle, not the unit of storage.** It holds tracks and cairns
  and gives them a name, a status and a date range — but the map shows trips,
  loose tracks and loose cairns side by side, and deleting a trip deletes what
  it holds. See `docs/design/shell-and-content-model.md`.
- **OAuth stays in Testing mode.** Single user for now, so tokens expiring every
  seven days is the accepted cost of skipping brand verification.

## Performance rule

The all-trips overview map reads precomputed simplified geometry
(`overview.geojson` per trip), never the source KMLs. Loading full-resolution
tracks for the world view does not scale past a handful of trips.

**This covers loose tracks too.** A track that belongs to no trip gets its own
`overview.geojson`, generated the same way and at the same time as a trip's. A
loose track costs the world view exactly what a trip costs; the rule does not
get to have an exception the moment a track stops being owned.

Storage access sits behind one interface even while the only implementation is
local — swapping in Drive should touch that module and nothing else.

## Board

Project option: `cairn`. Filter the board by it to see only this project's work.

## Testing

Automated. `/test` runs the suite and verifies acceptance criteria against it,
and the delivery run continues through to Ready to Ship without stopping.

Acceptance criteria describing visual appearance rather than behaviour are the
exception — those need eyes, and `/test` says so rather than passing them
silently. Map rendering work will hit this often.

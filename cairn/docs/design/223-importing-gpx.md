# 223 — importing a GPX

Standing documents read first: [design-language.md](design-language.md),
[shell-and-content-model.md](shell-and-content-model.md). Prior notes:
[4-file-import.md](4-file-import.md), [75-trip-import-feedback.md](75-trip-import-feedback.md),
[188-importing-a-zip.md](188-importing-a-zip.md), [218-track-and-trip-stats.md](218-track-and-trip-stats.md)
(the rules a parsed track's numbers obey), [7-track-statistics.md](7-track-statistics.md).

**Almost none of this is new surface.** A GPX becomes a `Track[]` and every
downstream surface — rows, stats, profile, map, overview, Drive — is untouched.
What needs deciding is the copy that names accepted formats, and what a reader
sees when a `.gpx` behaves differently from the `.kml` of the same walk.

## Why this exists at all

Written down because "support another file format" reads like completionism, and
it is not.

A Garmin Connect KML of a real hike carries 358 bare `lon,lat` points, no
altitude and no timestamps. The same activity as GPX carries `<ele>` and `<time>`
on every point. **The format, not the vendor, decides what survives** — and the
format the watch offers first is the lossy one.

This is also the only route to **duration**. #224's DEM sampling can infer
elevation from coordinates; nothing can infer when you walked.

## The main path

Indistinguishable from a KML import, deliberately:

1. A `.gpx` is dropped on a trip, chosen from the file picker, or extracted from
   a dropped `.zip`.
2. It uploads to the trip's Drive folder like any track file.
3. It parses to `Track[]`; #218's stats run over the result unchanged.
4. Its row appears with the same anatomy, meta line, colour swatch and `⋮`.

A reader who never opens the file picker should not be able to tell which parser
ran. That is the whole design goal, and every decision below serves it.

## Copy

One string changes, and it is the one that tells a reader the format is welcome
before they try it.

| String | Where |
|---|---|
| `trips take .kml, .kmz or .gpx tracks, JPEG, PNG or WebP photos, and .zip archives` | `UNRECOGNISED_TYPE_MESSAGE` |
| `Drop a KML, GPX or a photo anywhere to start.` | `trips-panel__empty-detail` |

The empty state says `KML, GPX` rather than listing three extensions — it is an
invitation, not a specification, and the failure message is where precision
belongs.

**Extension order is `.kml, .kmz or .gpx`** rather than alphabetical: it matches
the existing string's shape so the diff is an insertion, and KML stays first
because it remains what most files are.

## States

Every one already exists; this is what a GPX puts in them.

| State | Treatment |
|---|---|
| Importing | The existing progress row, filename unchanged |
| Imported, with elevation and time | Full meta line — `5.2 mi · 4h 40m · 1,950 ft ↑` |
| Imported, `<ele>` present but all identical | Elevation unavailable per #218; distance and duration only |
| Imported, no `<ele>`, no `<time>` | Distance only, exactly as an altitude-less KML |
| Malformed | The existing failure row, retryable, naming the file |
| `.gpx` that is not GPX | The same failure row — see below |
| Signed out | Unchanged; the existing signed-out drop message |

## Failure copy, and one honest limit

A file named `.gpx` whose content is not GPX gets the same failure row a
malformed KML gets. `parseGpx` returns the same `ParseResult`, so
`75-trip-import-feedback.md`'s row, its retry and its dismiss all work with no
change.

The message reads `File is not a GPX document`, mirroring the existing
`File is not a KML document` — parallel strings for parallel failures, so the
two never read as different classes of problem.

**A GPX with routes or waypoints but no `<trk>` fails as `no tracks found in
this file`**, which is the string that already exists for an empty KML. It is
accurate and it is unhelpful, and that is a deliberate limit rather than an
oversight: distinguishing "this file has waypoints you might have wanted" needs a
model answer about whether a waypoint is a cairn, and that question is bigger
than an import message. Recorded so the next person meets a known gap rather
than a bug.

## Edge cases

- **Multi-segment track (`<trkseg>` × N).** One track. A segment break is a
  recording pause — a tunnel, a battery swap — not a separate walk, and
  splitting on it would put two rows in the list for one hike and break #218's
  closed-loop invariant across the pair.
- **Multiple `<trk>` elements in one file.** Several tracks, exactly as a
  multi-track KML: the row shows the ` 3 tracks` suffix and no meta line, per
  #6 and #7, and #219's detail does not open.
- **`<ele>` on some points and not others.** #218 already skips gaps rather than
  reading a missing value as zero. Unchanged.
- **`<time>` present but unordered.** #7 takes the span as `max − min`.
  Unchanged.
- **A `.gpx` and a `.kml` of the same activity, both imported.** Two rows, two
  polylines, two sets of numbers within 1% on distance. cairn does not
  deduplicate tracks and this issue does not start — the user imported two
  files and gets two.
- **`.gpx` inside a `.zip`.** Handled by `TRACK_EXTENSIONS`, which the archive
  expander reads; nothing archive-specific changes.
- **A very large GPX.** 1 Hz recording over a long day is tens of thousands of
  points. No decimation is specified here — `overview.geojson` already owns
  simplification for the world view, and the detail view carries full
  resolution today for KML too.
- **GPX 1.0 rather than 1.1.** togeojson handles both; no version gate.

## Visual language

Nothing new. No token, no colour, no component. If this issue produces a
stylesheet change, something has gone wrong.

## New tokens

None.

## Out of scope

- **TCX**, `<rte>`, `<wpt>`, GPX extensions, and export — all named in the issue.
- **Deduplicating the same activity imported twice.**
- **Suggesting GPX when a KML imports without elevation.** A genuinely good idea
  — the app knows enough to say *this export dropped your elevation; GPX would
  carry it* — and it needs #222's correction landed first so the advice is
  accurate. Its own issue.

# 337 — pasting a coordinate

Getting a longitude/latitude pair from somewhere else into the map, and turning
it into a cairn.

Standing documents: [cairns.md](cairns.md) (the record, `positionSource`, the
ownership rule), [design-language.md](design-language.md) (tokens, contrast,
motion), [shell-and-content-model.md](shell-and-content-model.md) (the search
card, the list face, row anatomy). Prior notes:
[156-creating-a-cairn.md](156-creating-a-cairn.md) (the create gesture and the
create face — this note adds a second route into that same face),
[109-shell-column.md](109-shell-column.md) (the search field as a filter),
[270-selecting-reveals-it-on-the-map.md](270-selecting-reveals-it-on-the-map.md)
(the visible area and its insets),
[303-a-3d-reveal-frames-the-ground.md](303-a-3d-reveal-frames-the-ground.md)
(resolving a look-at onto the ground),
[335-my-location-on-the-map.md](335-my-location-on-the-map.md) (the other new
route into the create face).

## Why this is a search result and not an instant jump

The obvious reading of the request — paste, and the map is already there — is
wrong for one mechanical reason. **Every prefix of a coordinate is a
coordinate.** Typing `47.6205` passes through `4` and `47` and `47.6`, and a
field that flew the camera as the query parsed would fly to three unrelated
places before the user finished, then again on every correction. A paste
arrives whole and would be fine; typing is not, and the field cannot tell the
difference after the fact.

So the coordinate is offered as **one result row at the top of the list face**,
and choosing it is what moves the map. For a paste that is one keystroke —
`Cmd-V`, `Enter` — which is as close to "already there" as is honest.

This also keeps #156's rule intact: **there is no armed placement mode.** The
row carries its own coordinate, exactly as the right-click gesture carries its
own. Nothing is entered, remembered, or stuck in.

## Latitude first

`47.6205, -122.3493` is read as latitude 47.6205, longitude -122.3493.

The issue asks for this in the words "longitude, latitude", and the note goes
the other way deliberately: **every source a coordinate is copied *from* writes
latitude first.** Google Maps, Apple Maps, a Garmin, a phone's compass app, the
coordinate line in a trip report — all latitude first. Reading the paste as
longitude first would mis-place the great majority of real pastes in order to
honour a word order.

The reversed paste is still handled, by the one case where it is detectable:

> **If the first value's magnitude exceeds 90 and the second's does not, the
> pair is read longitude first instead.**

A latitude cannot exceed 90, so a first value that does is not one. This catches
the coordinate copied out of GeoJSON, a KML `<coordinates>` element, or a
PostGIS query — all genuinely longitude-first — without a setting and without a
prompt.

Where both values are within ±90 the pair is ambiguous and is read latitude
first. This is a real limitation with no fix available from the string alone,
and the result row's label (below) is where the user sees which way it went.

## What parses

| Input | Reads as |
|---|---|
| `47.6205, -122.3493` | 47.6205, -122.3493 |
| `47.6205 -122.3493` | the same |
| `47.6205°, -122.3493°` | the same |
| `47.6205° N, 122.3493° W` | the same |
| `N 47.6205 W 122.3493` | the same |
| `47.6205N, 122.3493W` | the same |
| `47°37'13.8"N 122°20'57.5"W` | the same, to within 0.0001° |
| `-122.3493, 47.6205` | the same — first value exceeds 90, so read longitude first |
| `47.6205, -122.3493, 812` | the same; the third value is ignored |
| `91, 181` | nothing — out of range either way round |
| `Larapinta` | nothing; the list filters by name as today |

Leading and trailing whitespace and newlines are ignored, which matters because
a coordinate copied from a web page routinely arrives with both.

A hemisphere letter and a sign that disagree — `N -47.6205` — is **not** a
coordinate. Two statements of the sign that contradict each other have no
correct reading, and guessing one is how a cairn ends up in the wrong
hemisphere.

## The result row

At the top of the list face, above the rows, in row anatomy per the standing
document — glyph, text — with no `⋮`, because there is nothing to act on but
the row itself.

```
✛ 47.62050, -122.34930
  go here and place a cairn
```

| | |
|---|---|
| Glyph | `✛`, the create-pin mark, in `--accent` |
| Title | The parsed point, decimal degrees, 5 decimal places, in the monospace face, tabular numerals |
| Meta line | `go here and place a cairn`, `--text-xs`, `--text-muted` |
| Height | `--row-touch`, as every row |
| Selected/hover | The language's standard row treatments, unchanged |

**Five decimal places, always, including trailing zeros.** That is ~1.1 m —
finer than any paste is honest about and coarse enough to stay one line. Fixed
width matters more than brevity here: the label's job is to let the user check
at a glance that the pair was read the way they meant, and a number whose
length changes is harder to scan than one whose length does not.

The title is the normalised point, never the raw string. `N 47.6205 W 122.3493`
shown back as `47.62050, -122.34930` is what tells the user the letters were
understood.

**The row shows whatever the chips say.** `All`, `Trips`, `Tracks`, `Cairns` —
the row is present under every one. The chips filter *content*; a coordinate is
not content and has not been filtered by anything.

**The rows below are unaffected.** Name filtering still runs on the same query,
and its results — almost always none, for a string of digits — sit beneath. The
list's `Nothing in this range` empty state is suppressed while the coordinate
row is present: a panel with a row in it is not empty.

## The main path

1. The user pastes `47.6205, -122.3493` into the search field.
2. The coordinate row appears at the top of the list, immediately — parsing is
   synchronous against the typed string, with no debounce and no loading state,
   the same stance #109 takes for the chips.
3. The user presses `Enter`, or clicks the row.
4. The camera moves to the point.
5. The create face opens with the pin dropped and selected at it — #156's face,
   its fields, its defaults, its `Create` and `Cancel`, reached by a different
   route and otherwise identical.
6. `Create` writes the cairn. `Cancel` removes the pin and nothing existed.

`Enter` chooses the row when the field holds a coordinate. It does nothing
otherwise, which is what it does today.

### The camera move

**This is #302's reveal, not a new camera path.** `revealPoint` in
`src/map/reveal.ts` is already the app's "arrive at this one point" move — it is
what selecting a cairn does — and a pasted coordinate is the same subject: one
point, no extent, arrival *at* it being the whole request. It centres the point
inset-aware against the visible area per #270, closes in to `CLUSTER_MAX_ZOOM`,
never zooms **out** from a closer view the user chose, and already collapses to
`setCenter` under `prefers-reduced-motion`.

**Not #335's zoom-17 floor.** That floor exists because a fix has an accuracy
and a two-metre reading should not be shown at a confidence the fix does not
support. A pasted coordinate has no accuracy — it is asserted exactly — so there
is nothing to hold the camera back from, and the user is about to drop a pin
they will want to see precisely placed. Reusing `revealPoint` also means the
app keeps one answer to "go to a point" rather than a second constant meaning
almost the same thing.

**3D:** `flyToFramedGround` with the single point, **heading and tilt
untouched**, the look-at resolved onto the ground per #303 — the same call
`LocateCamera` makes, which already takes a one-element corner list. Like a
locate and unlike a reset, this is a pan: you asked to go somewhere, not to be
turned around.

Pressed mid-flyover, the flight is cancelled and the camera goes to the point —
#274's "a deliberate input on the surface cancels the flight", unchanged.

Under `prefers-reduced-motion: reduce` the camera arrives without the
transition, as everywhere else.

## Ownership

Unchanged from #156 and decided the same way: a trip is open, the cairn is the
trip's; nothing is open, it is loose.

The create face's readout says which it chose, and needs one new string —
#156's `(a trip was open when you clicked)` is false here, because nothing was
clicked:

| Context | Line |
|---|---|
| Nothing open | `trip null` · `(nothing was open — this will be loose)` |
| A trip open | `trip <trip-id>` · `(a trip was open when you searched)` |

## `positionSource`

`placed`. The user supplied the coordinate, which is what `cairns.md` means by
*a person put it here*, and it takes rule 2 with it: interpolation will never
move it again. That is the correct outcome for the most precisely-known position
in the app — a pasted coordinate is the one case where the number is exact and
the map is the approximation.

No new `PositionSource` value. Provenance records *where the coordinate came
from*, and it came from a person.

## States

| State | What shows |
|---|---|
| Query empty | No row. The list is whatever it was |
| Query not a coordinate | No row. Name filtering only, as today |
| Query a coordinate | The row, at the top, above any name matches |
| Query a coordinate, out of range | No row. An out-of-range pair is not a coordinate, and a row that refused to work would be worse than no row |
| Row chosen | Camera moves, create face opens, the field is cleared and the list face is replaced by the create face |
| Create face open | As #156 — including that a right-click while it is open replaces the coordinate and keeps what was typed |
| Cancel / Back / Escape | Pin removed, list face returns, nothing written. The search field returns **empty**, not holding the coordinate |
| Disconnected (#73) | The row works and the face fills in; `Create` takes the Disabled treatment with `Sign in to keep cairns.`, per #156 |
| Map unavailable (#2) | No row. There is nowhere to go, and the map's own unavailable state already says so |

**The field is cleared when the row is chosen.** The coordinate has become a pin
on the map; leaving the string in a field the user can no longer see — the card's
centre slot is the create face's title by then — would mean it reappears on
Cancel, offering to do again the thing just cancelled.

## Edge cases

- **A paste that is already a coordinate plus a label** — `Camp 47.6205,
  -122.3493` — does not parse. Extracting a pair from inside arbitrary text
  means deciding which numbers in a sentence are coordinates, and the failure
  mode is placing a cairn from a phone number.
- **Repeated `Enter` on the same coordinate.** The second does nothing: the
  create face is open by then and the field is gone.
- **A coordinate at the antimeridian or a pole.** `0, 180` and `90, 0` are in
  range and place normally. The camera has no special case; Maps handles both.
- **`0, 0`.** A coordinate like any other. Null Island is a real place to put a
  pin and refusing it would be a guess about intent.
- **A coordinate matching an existing cairn's position.** Nothing special — a
  new draft pin at the same point, drawn above the existing marker per
  `CairnDraftMarker`'s `zIndex`.
- **Typing into the field while the create face is open.** Not possible; the
  field is not rendered on a detail face.

## Copy

| Where | String |
|---|---|
| Row title | The normalised coordinate, e.g. `47.62050, -122.34930` |
| Row meta line | `go here and place a cairn` |
| Row `aria-label` | `Go to 47.62050, -122.34930 and place a cairn` |
| Owned readout (new) | `(a trip was open when you searched)` |
| Everything else | #156's, unchanged |

The search field's placeholder is **not** changed. `Search trips, tracks and
cairns` stays as it is: appending "or paste a coordinate" spends the field's
one line of copy on the rarer of its two jobs, and the row appearing the moment
a coordinate is typed teaches the feature better than a placeholder nobody reads
twice.

## Accessibility

- The row is a `<button>` inside the list, reachable by `Tab` from the field and
  activated by `Enter` or `Space`, carrying the `aria-label` above.
- The list region is `aria-live="polite"`, so the row's appearance is announced
  without stealing focus from the field mid-type.
- The coordinate in the row's accessible name is the normalised decimal pair,
  read as digits — the visual monospace treatment carries no meaning a screen
  reader needs.

## Discoverability

This gives the create face a **keyboard route** it did not have, which #156's
accessibility section records as an open gap ("Right-click is not the only
route... that is precisely the gap the discoverability follow-up has to close").

It does not close that gap, and should not be recorded as having done so. A user
who does not already know they can paste a coordinate is exactly as stuck as
before, and pasting a coordinate is not a substitute for placing a cairn
somewhere you can see but cannot name. #156's two rejected candidates remain the
ones on the table.

## New tokens

None added by this issue. The row is built from `--row-touch`, `--text-xs`,
`--accent` and `--text-muted`, all existing.

**But the project needs `--mono`, and this note is at least the eighth caller.**
The monospace face has no token: `ui-monospace, SFMono-Regular, Menlo, Consolas,
monospace` is written out literally in `AddToTripPicker.css`,
`CairnCreatePanel.css` (twice), `CairnList.css`, `Lightbox.css` and others, and
this row's title would make one more. `design-language.md` names the monospace
face in prose — "tabular numerals in a monospace face" — without ever giving it
a value to reference.

Proposed: `--mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` in
`src/index.css`, beside the type steps.

It is **not** added here. Introducing it means touching every stylesheet that
copied the stack, which is a change with its own blast radius and no relation to
pasting a coordinate — it belongs in its own issue, alongside the sweep. This
note follows existing practice and writes the stack out, and records the debt
rather than paying it silently or pretending it isn't there.

## Measurements

This note asserts no layout quantity — no width, height, character count or
area — so there is nothing here to measure against the running app. Its one
number is a chosen constant rather than a claim about the rendered UI: 5 decimal
places (~1.1 m). The row's height is `--row-touch`, the token, which is the
standing document's number and not this note's, and the camera's zoom is
`CLUSTER_MAX_ZOOM`, which is `fitBounds.ts`'s and not this note's either.

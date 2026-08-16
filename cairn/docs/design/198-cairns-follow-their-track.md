# 198 — a cairn's visibility follows its track

Hiding a track hides the cairns from that day. This note fixes what "that day"
means, precisely enough to build and to argue with.

Standing documents: [cairns.md](cairns.md), [design-language.md](design-language.md),
[shell-and-content-model.md](shell-and-content-model.md). Prior notes:
[6-track-list.md](6-track-list.md) (the eye control),
[5-track-rendering.md](5-track-rendering.md),
[54-photo-markers.md](54-photo-markers.md) (clustering),
[51-photo-import.md](51-photo-import.md) and `photo/interpolate.ts` (the trip's
own local time, and why it is not the browser's).

## The rule

> **A cairn is attached to every track whose day span contains the cairn's
> date. It is visible on the map when any track it is attached to is visible.**

Three definitions and that is the whole model.

**A track's day span.** The set of calendar days its own timed points fall on,
read at the trip's UTC offset (`tripUtcOffsetHours(tracks)`), inclusive of the
first and last. A walk from 06:40 on 12 Aug to 00:20 on 13 Aug spans two days,
and a cairn dated either day is attached to it. A track with no timed points has
an empty span and attaches nothing.

**Attached.** A cairn's `date` — the field its row already displays — falls in
that set. Not `captureInstantMs`: an interpolated or hand-placed cairn may have
no instant at all, and a rule that only works for cairns that came from a
geotagged photo is not a rule.

**Visible.** Any attached track visible ⇒ visible. Union, not intersection. A
cairn on a day covered by both the planning KML and the recorded GPX should not
vanish because one of the two is off — the user hid *one line*, and hiding a
line has never meant hiding a place.

## Why date and not distance

Recorded so it is not re-litigated.

- A proximity rule needs a threshold. Every value is wrong somewhere: 50m loses
  a viewpoint photographed from the ridge above the trail, 500m attaches a cairn
  to a track that merely passed within half a kilometre on a different day.
- `cairns.md` explicitly expects a photo taken *of* something across a valley,
  and expects the user to drag it there. Distance calls that a mistake; date
  does not care.
- A hand-placed cairn has a date and no relationship to any line. Under a
  proximity rule it attaches to whatever happened to be near the point clicked.
- The user's own framing is a day — *everything from day 1*.
- Date is exact and free. The data is already loaded, `timedPointPool` already
  parses it, and there is nothing to tune.

The cost is real and stated: **a trip whose tracks carry no timestamps gets
nothing from this feature.** Every cairn falls into the unattached group and
every track toggle leaves them alone. That is the correct behaviour — inventing
an attachment from a track with no time is worse than declining to — and it is
why the unattached group is a visible, controllable thing rather than a silent
fallback.

## Unattached cairns

Anything the rule cannot place: a date matching no track's span, or no date at
all.

They are **visible by default** and **unaffected by every track toggle**. They
get their own group in the sidebar list and their own eye on that group's
heading.

```
Cairns                                  17
[Any] [Photo] [⛺][💧][🛖][…]
────────────────────────────────────────
◉  Cairn above the couloir
   12 Aug 2026 · hazard · photo
◉  Willow Creek camp
   12 Aug 2026 · campsite
────────────────────────────────────────
Not on a track                     3   👁     ← its own eye
────────────────────────────────────────
◉  Trailhead parking
   undated · parking
…
```

This replaces the existing `No date` divider, which was a narrower version of
the same idea — an undated cairn is unattached by definition, so one group
covers both cases and the list stops having two kinds of divider.

`No date` is not simply renamed: the group's membership grows to include dated
cairns whose day no track covers. `orderCairnListItems` keeps the attached
cairns in date order above it and sorts the unattached group by name, exactly as
it sorts the undated group today.

## What "hidden" does, and does not, do

**It removes the marker from the map.** Clustering recomputes over what is left,
so hiding four of five days does not leave a badge counting cairns that are not
drawn.

**It does not remove the row from the list.** The row stays, in the hidden
treatment — glyph and name at `--text-muted`, meta line at full contrast, the
same shape `.track-row--hidden` already gives a hidden track — and it stays
clickable. Opening a hidden cairn's detail face works.

This is the eye's existing meaning and it is worth being explicit about, because
`shell-and-content-model.md` says one filter drives the list and the map
together. **A filter and a visibility toggle are different things.** The chips
answer *which of these do I want to look at* and act on both; the eye answers
*what is drawn on the map* and has never touched the list. Making cairns the
exception would put them out of reach exactly the way #194's clusters were.

The `Cairns` count stays the trip's total. It counts what the trip holds; the
facet (#192) is what makes it count something narrower.

## Composing with the facet (#192)

Independent, and both apply.

| | Facet says show | Facet says hide |
|---|---|---|
| **Visibility says show** | Row shown, marker drawn | Not in the list, not on the map |
| **Visibility says hide** | Row shown hidden-styled, no marker | Not in the list, not on the map |

The facet removes; visibility dims. A filtered-out cairn is not in the list to
be dimmed, so the facet wins wherever they meet. No third rule is needed.

## States

| State | List | Map |
|---|---|---|
| All tracks visible | Every row at rest | Every cairn drawn |
| One track hidden | Its days' rows in the hidden treatment | Those cairns not drawn |
| All tracks hidden | Every attached row hidden-styled; unattached rows at rest | Only unattached cairns drawn |
| Trip has no tracks | Every cairn unattached, every row at rest | Everything drawn |
| Tracks have no timestamps | Same as no tracks | Same |
| `Not on a track` hidden | Its rows hidden-styled | Those cairns not drawn |
| A cairn is selected and then hidden | Row stays selected and visible in the list | Marker gone; selection kept |
| Trip still loading | Attachment recomputes as tracks arrive; rows settle without flicker | — |
| Disconnected | Toggles work — visibility is local and writes nothing | Same |

**Hiding the selected cairn does not clear the selection.** Unlike the facet
(#192), which removes the row and therefore leaves the selection pointing at
nothing, the row is still there and still highlighted. The detail face, if open,
stays open.

## Edge cases

- **A cairn dated on a day two tracks both cover.** Attached to both. Visible
  while either is. This is the common case on a trip with a planning KML.
- **A track spanning midnight.** Both days are in its span. A cairn on either is
  attached. The trip's offset is what decides where midnight is, not the
  browser's — a trip walked in Colorado and reviewed in Sydney must not
  re-attach itself.
- **A cairn dated during a rest day with no track.** Unattached. It appears
  under `Not on a track` and stays visible while every track is hidden, which is
  the right answer: nothing was hidden that would explain its absence.
- **A track is deleted while its cairns are hidden by it.** Those cairns become
  unattached and therefore visible, and move to the `Not on a track` group.
  Deleting a line must not leave places invisible with no control to bring them
  back.
- **A track is renamed or recoloured.** No effect. Attachment reads timestamps.
- **A cairn's date is edited** (not possible today; #196 leaves the date out).
  When it becomes possible, attachment recomputes and the row may move between
  groups. Nothing here needs to change for that.
- **A cairn is imported into a trip whose tracks are partly hidden.** It attaches
  by its date like any other and inherits that day's visibility immediately. It
  does not get a grace period — a photo appearing on a day the user has hidden
  is the surprise, not its absence.
- **Every cairn is unattached and the group's eye is off.** The map draws no
  cairns and the list shows every row hidden-styled with a lit control to turn
  them back on. Recoverable, which is the requirement.
- **Two hundred cairns.** Attachment is a day-set membership test per cairn
  against a small set of days; computed once per change to the tracks or the
  cairns, memoized, not per render.

## Copy

| String | Where |
|---|---|
| `Not on a track` | The unattached group's heading |
| `Hide cairns not on a track` / `Show cairns not on a track` | That group's eye control, `aria-label` and `title`, tracking its state |

`No date` is removed — the group it named is now a subset of this one.

The heading says `Not on a track`, not `Unattached` or `Other`. It says the
thing that is true and, by saying it, explains why the track toggles do nothing
to those rows.

## New tokens

None. The hidden treatment is `--text-muted` and the group heading reuses
`.cairn-list__divider`'s type; the eye reuses the track row's control sizing.

## Out of scope

Proximity, in any form. Per-cairn visibility toggles. Grouping the list by day
or labelling groups with their track — the obvious next thing and a different
change. Persisting visibility. Anything about what a track's eye does to its own
polyline.

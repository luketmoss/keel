# 226 — a track's details belong on its face

Standing documents read first: [shell-and-content-model.md](shell-and-content-model.md)
(**decisive here** — it already specifies the track face and its body),
[design-language.md](design-language.md). Prior notes:
[219-opened-track-detail.md](219-opened-track-detail.md) (**superseded in
part** — its inline disclosure is removed), [218-track-and-trip-stats.md](218-track-and-trip-stats.md)
(the numbers and their rules, unchanged and authoritative),
[193-trip-row-anatomy.md](193-trip-row-anatomy.md), [46-track-file-editing.md](46-track-file-editing.md),
[133-editing-a-loose-item.md](133-editing-a-loose-item.md), [140-exporting-a-loose-item.md](140-exporting-a-loose-item.md).

## What went wrong, stated plainly

#219 measured 99.3px stat cells in the trip totals block — which sits at the
panel's full inner width — and then specified the same six-cell grid into the
track row's **146px** text column. Roughly 41px per cell against a 77px widest
value. It overflows, and the build is faithful to the note.

The lesson worth keeping: **a measurement belongs to a container, not to a
design.** #219 carried a number across two and did not re-measure.

Widening the inline detail was the obvious patch and it is the wrong one. A row
disclosure is capped at the row's width forever, and the content already wants
more than that — six stats, a profile, a source file, a point count, and #224's
sampled-elevation marks still to come.

## The face already exists

This is the finding that shapes the issue. `shell-and-content-model.md` is
standing and already says:

> **Detail faces.** One per kind, all sharing the same header shape: name at
> `--text-lg`/700, a metadata row, a primary action, `⋮`.
>
> | Track | `Add to a trip` | Distance, ascent, points, source file |

`/tracks/:id` is already routed, and `LooseFace` already draws `Distance`,
`Ascent` and `Source file` for a loose track.

So nothing here invents a surface. **A track inside a trip simply cannot reach
the face that was specified for it**, and the face is missing four of #218's six
numbers and the profile. This issue closes both gaps and makes one component
serve both kinds of track — which is what "one per kind" already required.

## The row, after

```
┌────────────────────────────────────────────────┐
│ ⠿  ●   Belford & Oxford traverse         👁  ⋮ │
│        6.4 mi · 5h 20m · 2,780 ft ↑            │
└────────────────────────────────────────────────┘
```

#193's two-line row, exactly. No third line, no disclosure, no chevron.

**The click does nothing.** Deliberately, and it is worth defending because a
dead row is unusual: every control on this row is already a control — `⠿`
drags, the swatch picks a colour, `👁` toggles the map, `⋮` opens actions. The
row is a container for five affordances, not itself one. Adding a sixth meaning
to the whitespace between them makes the other five ambiguous — which is exactly
what #219 did, and it is why the name had to become a button and rename had to
move.

This diverges from #194's *one click opens* contract for cairns, knowingly. A
cairn marker on a map has no controls on it, so its click is unambiguous and
free. A track row's is neither.

**`Rename` stays in the `⋮`.** #219 moved it there to free the click; the click
is now free for a different reason, but click-to-rename was undiscoverable
before and would be again. Moving it back costs discoverability to buy nothing.

## The menu

| Row | Actions, in order |
|---|---|
| Track, in a trip | `More details` · `Rename` · `Remove from trip` · `Delete permanently…` (`danger`) |
| Track, loose | `More details` · `Rename` · `Add to a trip` · `Delete permanently…` (`danger`) |

Order runs safe → destructive, per #193.

**`More details` takes no ellipsis.** #193 fixed the convention: the ellipsis on
`Delete permanently…` means *this will ask*. Opening a face asks nothing, so an
ellipsis here would promise a prompt that never comes. `Rename` already sets the
precedent — it opens an input and carries no ellipsis either.

**A multi-track file gets no `More details`.** #6 and #7 both hold that such a
file has no unambiguous single set of numbers, so there is nothing for a face to
show. The item is absent rather than disabled: disabled implies a condition the
reader could change, and this one is a property of the file.

## The face

Header shape is the standing document's and is not restated. The body:

```
┌──────────────────────────────────────────────┐
│      ▁▃▅▇█▇▅▆█▇▅▃▂▁                          │
│                                              │
│ DISTANCE      ASCENT        DESCENT          │
│ 6.4 mi        2,780 ft ↑    2,140 ft ↓       │
│                                              │
│ HIGH POINT    LOW POINT     DURATION         │
│ 14,153 ft     12,020 ft     5h 20m           │
│ ─────────────────────────────────────────    │
│ 1,284 points · Belford-Oxford.kml            │
└──────────────────────────────────────────────┘
```

`StatGrid` unchanged from #218 — the same component, at the panel's full inner
width, which is the width it was measured for. Cells land at the same ~99px the
trip totals block gets, and the two finally read as one system, which is what
#219 claimed and could not deliver at 41px.

The profile is #219's `TrackElevationProfile`, unchanged, at
`--profile-height` — drawn in the track's own colour, from the median-filtered
series, omitted entirely when there is no usable elevation.

**Points and source file share the footnote line**, in `--text-xs`
`--text-muted` beneath the `--border` rule — the same slot #218's coverage
footnote occupies in the trip block. They are provenance rather than
measurement, and putting them in stat cells would imply they are comparable
between tracks in the way the six above are.

## One formatter, and a bug it exposes

`LooseFace` currently renders ascent as `` `${Math.round(item.ascentMeters)} m` ``
— **raw metres, on an app that is imperial everywhere else.** A loose track says
`595 m` while the identical track in a trip says `1,950 ft ↑`.

Unifying the body fixes it by construction: one component, reading
`formatElevationGain`, reading `SYSTEM`. Recorded here rather than filed
separately because the unification is what makes it unmissable, and fixing it
anywhere else would leave the duplicate to drift again.

## States

| State | The face shows |
|---|---|
| Track with elevation | Profile, six values, footnote |
| No usable elevation | No profile; four em dashes; distance, duration and footnote real |
| No timestamps | Duration em dash; everything else real |
| Neither | Distance, points and source file only; four dashes and a duration dash |
| Loading | The face's existing loading treatment; no half-filled grid |
| Track removed while open | Face closes, returns to origin — see below |
| Disconnected (#73) | Reads normally at full contrast; only `⋮` items disable |

Disconnected stays undimmed for #218's reason: derived data with no control in
it, computed from a track already in memory.

## Coming back

`More details` navigates. Leaving returns to where it was opened from — the
trip's face with its list scrolled as it was, or the loose list.

The shell already makes this nearly free: *"the map is never unmounted"* and
route state is ordinary state, so scroll position and camera survive by
construction rather than by snapshots.

**A track removed while its face is open** returns to the origin rather than
showing an empty face. It is the same event the row's own removal handles, and a
face for a track that no longer exists has nothing to say.

## Edge cases

- **A very long track name** in the face header — the standing header shape's
  truncation, unchanged.
- **A loose track with no trip.** `Add to a trip` is its primary action, per the
  standing table. Unchanged by this issue.
- **A track whose colour changes while the face is open.** The profile restyles,
  same as #219 specified.
- **Deep-linking `/tracks/:id` for a trip-owned track.** Must resolve, since the
  route is now reachable for it. A URL for a track that no longer exists shows
  the existing not-found treatment rather than an empty face.
- **The same track opened from the trip and from the loose list.** Impossible —
  a track is one or the other, never both (cairn's `CLAUDE.md`: adding to a trip
  is a move, not a copy).
- **Phone.** The face is the sheet at its full detent; the grid holds three
  columns at 375px per #218's measurements.
- **Reduced motion.** No expand animation exists to collapse any more. The
  navigation uses whatever the shell already does.

## What is deleted

Named explicitly, because a partial removal is how a disclosure survives as dead
CSS nobody dares touch:

- `track-row__detail-wrapper`, `track-row__detail-inner`, and their
  `grid-template-rows` transition
- the row's `open` state, its toggle, `aria-expanded` and `aria-controls`
- the name-as-`<button>`; the name returns to a plain `<span>` with its `title`
- `TrackRowDetail`'s use inside `TrackList` — the component itself moves to the
  face rather than being deleted

## New tokens

None. `--profile-height` (#219) survives and is reused.

## Out of scope

Everything in the issue, plus:

- **A face for a cairn**, which #197 owns.
- **Editing anything on the face** beyond what #133 already specifies.
- **The track face's `Add to a trip` action** for trip-owned tracks — a track in
  a trip is already in one; the primary action slot for that case is
  `Remove from trip` and it is the standing document's to define, not this
  note's to invent.

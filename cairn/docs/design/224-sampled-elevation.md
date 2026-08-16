# 224 — elevation the app worked out, not elevation you recorded

Standing documents read first: [design-language.md](design-language.md),
[shell-and-content-model.md](shell-and-content-model.md). Prior notes:
[218-track-and-trip-stats.md](218-track-and-trip-stats.md) (the rules every one
of these numbers obeys — authoritative, and extended rather than revised here),
[219-opened-track-detail.md](219-opened-track-detail.md),
[7-track-statistics.md](7-track-statistics.md) (unavailable versus zero),
[73-disconnected-read-only.md](73-disconnected-read-only.md).

## The whole issue in one sentence

The app can fill in elevation for a track that has none, and **the entire value
of doing so depends on never letting the filled-in number pass as a recorded
one.**

#218 spent its design on the difference between *unavailable*, *zero*, and
*measured*. Adding a fourth category — *inferred* — that looks identical to
*measured* would undo that work and make every number in the app slightly less
trustworthy, including the ones that were fine.

So this note is mostly about a mark, and only briefly about a feature.

## The mark

**A `~` prefix on the value, and a one-line source note under the grid.**

```
DISTANCE      ASCENT        DESCENT
5.2 mi        ~1,950 ft ↑   ~180 ft ↓

HIGH POINT    LOW POINT     DURATION
~11,240 ft    ~8,940 ft     —
Elevation estimated from terrain data.
```

`~` is chosen over the alternatives for reasons worth recording:

- **Not a different colour.** The language spends its one accent on interaction,
  and `--text-muted` on a value would read as *less certain* in the sense of
  *stale* — and would collide with the Disabled treatment.
- **Not an icon.** A glyph in a 99px cell costs width the grid measured
  carefully in #218, and an unlabelled icon needs a tooltip to mean anything,
  which #199 already established is not where meaning should live.
- **Not a footnote alone.** A reader scanning the grid takes the number without
  reading beneath it. The mark has to be *on* the figure.

`~` reads as *approximately* in every context a number appears, needs no legend,
costs one character, and survives being read aloud. The footnote is what makes it
unambiguous the first time.

**The mark travels with the value, everywhere.** The track row's meta line, the
opened detail's grid, and the trip totals all show it. A number that is honest in
one place and bare in another is worse than one that is bare everywhere, because
it teaches the reader that the absence of a mark means something.

## The trip totals footnote

#218 owns this line and defines three cases. Sampling adds a fourth, and refines
one:

| Coverage | Copy |
|---|---|
| All recorded | *no footnote* |
| Some tracks lack elevation, none sampled | `Elevation from 3 of 4 tracks. Distance covers them all.` |
| Any track sampled | `Elevation estimated from terrain data for 2 of 4 tracks.` |
| All sampled | `Elevation estimated from terrain data.` |
| None available | `No track in this trip carries elevation.` |

**A trip mixing recorded and sampled tracks marks the total with `~`.** A total
that is part measured and part inferred is inferred — the weaker claim governs,
the same way a mixed-coverage total already gets a footnote rather than a silent
sum.

## When sampling happens

**At the moment `overview.geojson` is written**, which is where a trip's derived
geometry is already generated and persisted. One write, not a fetch on every
trip open, and it reuses the regeneration contract `src/geo/overview.ts` already
documents.

Consequences that follow from that choice and are worth stating:

- **Sampling is not interactive.** There is no *estimate elevation* button. A
  control implies a decision, and there is no decision here — a track either has
  elevation or it does not.
- **The numbers appear when the import settles**, not progressively. A grid that
  fills in em dashes and then replaces them a second later reads as a bug.
- **Opening a trip again samples nothing**, because the values are stored.

## States

| State | Treatment |
|---|---|
| Track carries its own elevation | Never sampled, never marked. Unchanged from #218 |
| Track has none, sampling succeeded | Four values with `~`, footnote, profile drawn from the sampled series |
| Track has none, sampling failed | Exactly #218's unavailable state — em dashes, no `~`, no profile |
| Track has none, offline or signed out | Same as failed. Nothing attempted |
| Fewer than two points | Not sampled. Nothing to sample along |
| Sampling in flight | The import's existing progress row. No separate indicator |

**Failure is silent per track and reported once per import.** One line in the
existing failure area — `Couldn't estimate elevation for 2 tracks.` — not a row
per track. #75's feedback area already collapses like this, and a reader who
imported eight tracks does not need eight identical apologies.

The failed state being *identical to today* is the point: nothing regresses, the
map still draws, distance is still right, and the trip is still usable.

## The profile

#219's profile draws from a sampled series exactly as from a recorded one, with
one change: **the `aria-label` names the source.**

> `Elevation profile, estimated from terrain data: 8,940 ft to 11,240 ft over 5.2 miles`

A sighted reader gets `~` on the numbers directly beneath the profile; a screen
reader user gets it in the only place they meet the profile at all.

A DEM profile will look *smoother* than a recorded one — it is terrain, not a
noisy barometer — which is a real and slightly misleading impression of
precision. The `~` and the footnote are the mitigation; smoothing it artificially
to look more "authentic" would be a lie in the other direction.

## Edge cases

- **A tunnel, a gondola, or a boat.** The DEM returns ground elevation and the
  track was not on the ground. The `~` is doing exactly the work it exists for,
  and no detection is specified — inferring "this segment is implausible" is a
  feature, not a caveat.
- **A track crossing water.** DEM values near zero or interpolated. Same answer.
- **A track that carries elevation for part of its points.** Not sampled at all.
  #218 already computes across the points that have it, and splicing two sources
  into one series would produce a profile with a seam and stats with no
  meaningful provenance.
- **All-identical altitudes** (`clampToGround` zeros). Counts as *no elevation*,
  per #218 — so it is sampled. This is the Garmin case and the main reason the
  issue exists.
- **Quota exhausted mid-import.** Treated as failure for the remaining tracks,
  reported once. Nothing retries automatically.
- **`prefers-reduced-motion`.** Nothing animates.
- **The `~` next to a negative value** — `~-120 ft` for a low point below sea
  level. Ugly and correct; it renders as `~−120 ft` with a proper minus sign,
  which is what the mono face draws well.
- **A sampled trip opened while disconnected.** Values are stored, so it reads
  normally with its marks — #218's rule that derived data is not dimmed applies
  unchanged.

## Storage

Sampled values persist beside the trip's other derived data, and carry two
things beyond the numbers:

- **A source discriminator** per track — `recorded` or `sampled` — which is what
  every `~` in the UI reads. Storing a bare number and inferring the source from
  "the KML had no altitude" would re-derive it on every load from a file the
  list view is not allowed to open.
- **A version stamp**, for the same reason #225 needs one: #218's constants live
  in code, and a retune must invalidate what was stored under the old values.

Both are shared concerns with #225, which persists trip totals into the same
sidecar. **Whichever lands first defines the stamp; the second reads it.** They
should not invent two.

## New tokens

None. `~` is a character, and the footnote reuses `--text-xs` `--text-muted`.

## Out of scope

Everything in the issue's Out of Scope, plus:

- **Explaining what a DEM is** anywhere in the UI. "Terrain data" is the phrase;
  a reader who wants more is not going to find it in a 99px cell.
- **A preference to turn sampling off.** If the mark is honest, there is nothing
  to opt out of. If it is not, the fix is the mark.
- **Sampling loose tracks.** Same argument applies and the same code should
  serve it, but the loose face has its own row anatomy and its own note.

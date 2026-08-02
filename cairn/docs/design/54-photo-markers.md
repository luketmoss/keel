# 54 — Photo markers on the trip map

Tokens from [design-language.md](design-language.md). Map region and track
polylines from [5-track-rendering.md](5-track-rendering.md); trip map from
[35-trip-detail-view.md](35-trip-detail-view.md). Photos arrive from
[51-photo-import.md](51-photo-import.md), positions from #52, images through
#53's cache.

## Marker form

A 28px circle showing the photo's thumbnail, with a 2px ring and the
elevation-L2 shadow so it reads as lifted off the imagery rather than printed
on it. Circular rather than the classic teardrop pin: a teardrop's point claims
a precision the position does not have, and it is worse still for an
interpolated one.

Thumbnails rather than dots because a photo map whose photos are invisible is a
worse map, and clustering bounds how many render at once — the count is limited
by screen area, not by how many photos the trip holds.

**Provenance is carried by the ring, not by colour.** The design language spends
its one accent on interaction, and `--danger` and `--accent` are near-identical
under red-green colour blindness, so a colour-coded provenance scheme would fail
twice over.

| Provenance | Ring | Meaning |
|---|---|---|
| Recorded | solid 2px `--text` | GPS in the file |
| Derived | dashed 2px `--text-muted` | interpolated from track time |

Dashed reads as "inferred" without a legend, and it is the same instinct #37
already uses for planned trips — reusing that vocabulary rather than inventing a
second one.

**Unlocated photos do not render here at all.** They have no position. They are
reachable only from #55's list, which is why that issue and this one are
adjacent.

## Clustering

Markers whose circles would overlap collapse into one cluster marker: same 28px
circle, `--surface` fill, no thumbnail, the count in `--text-sm` tabular
numerals. A cluster of two shows `2`.

A hundred photos from one afternoon at one viewpoint is the normal case, not the
edge case. Uncllustered, that is one opaque blob that hides the track beneath it.

Clusters break apart as zoom increases, at whatever threshold keeps circles from
overlapping — computed from marker size and zoom rather than a hand-tuned zoom
level per trip.

A cluster containing both recorded and derived photos takes the dashed ring. The
weaker claim wins: saying "some of these are inferred" is honest, and saying
nothing is not.

## Selection

Selecting a marker sets it as the trip's selected photo — a single selection
shared with #55's list, not a separate one.

Selected marker: `--accent` ring at 3px, replacing whatever provenance ring it
had, plus the active-track glow treatment the design language licenses
(`drop-shadow(0 0 7px)`) in `--accent`. One at a time, which is the condition
that language attaches to the effect.

Provenance is not shown while selected — the ring is spent on selection, and the
list row and the viewer both still carry it. Losing one signal on one marker for
as long as it is selected is a fair trade for an unambiguous selected state.

Clicking a cluster zooms to fit its members rather than selecting anything.
There is no sensible single answer to "which photo did you mean".

Hit target is 40px square regardless of the 28px visual, per the design
language's touch minimum.

## Layering

Markers render above track polylines, always. The track is context; the photo is
the thing being pointed at. A marker hidden under a 5px polyline is a marker the
user cannot click.

## States

**No photos** — trip renders exactly as #35 leaves it. No empty state on the
map; the sidebar says it.

**Photos loading** — markers appear as their thumbnails resolve through #53.
A marker whose thumbnail has not arrived renders as a `--surface-lift` circle
with the correct ring, so position is visible before imagery is. Markers do not
wait for the whole batch, matching #35's file rows and #37's routes.

**Thumbnail failed to load** — marker keeps its `--surface-lift` fill
permanently rather than disappearing. Position is real even when the image is
not fetchable, and removing the marker would hide a photo that exists.

## Copy

| Context | Copy |
|---|---|
| Marker label (recorded) | `Photo taken <time>` |
| Marker label (derived) | `Photo, position estimated from track` |
| Cluster label | `<n> photos` |

`aria-label` on every marker; these are icon-only controls and unusable without.
"Estimated" rather than "interpolated" — it is the word that means the same
thing to someone who has not read this document.

## Edge cases

- **Two photos at identical coordinates** — cluster of 2 at every zoom, since
  they never separate. Correct: the only way to reach either is the list or the
  cluster's zoom-to-fit, and both work.
- **A cluster that cannot break apart at maximum zoom** — stays a cluster.
  Clicking it stops zooming once it is already at max and does nothing further;
  the list is the way through.
- **Every photo unlocated** — no markers, tracks render normally. The map looks
  exactly as it did before photos existed, which is honest.
- **A photo positioned outside the track's bounds** — renders where it says.
  #52 only interpolates within a track, so this means recorded GPS, and a
  recorded position that disagrees with the track is a real thing worth seeing.
- **200 photos** — clustering bounds rendered markers to what fits on screen.
  If this still stutters, the fix is fewer thumbnails at low zoom rather than
  fewer markers, and it is out of scope until measured.
- **Bounds fitting** — unchanged. #35 fits to tracks; photos do not extend the
  fit, or a single mis-tagged photo drags the camera across an ocean.
- **Reduced motion** — the selection glow is a static shadow rather than an
  animation, so it stands. Cluster zoom inherits the map camera's reduced-motion
  behaviour from #5.

## Not decided here

Whether a marker's thumbnail is the 512px file scaled down or a smaller derived
size is left to implementation — #53 caches whatever is asked for and no
criterion turns on it. Whether hovering a marker previews the photo is
deliberately unspecified; it is a nice idea that does not survive touch, and
#55's list is the real preview surface.

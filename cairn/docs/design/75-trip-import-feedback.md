# 75 — Trip import feedback

Import pipeline, progress and failure rows from
[34-attach-tracks-to-trip.md](34-attach-tracks-to-trip.md) and
[51-photo-import.md](51-photo-import.md). Drop overlay from
[4-file-import.md](4-file-import.md). Tokens from
[design-language.md](design-language.md).

Nothing here changes what happens to a file the app accepts. This note is about
the three moments it currently gets wrong: a drop it cannot take, a file it
cannot identify, and a file it already has.

## The rule

**Every dropped file produces a visible outcome.** It imports, or it is named in
a failure row saying why. Silence is not one of the options — and today a drop
while signed out is exactly that: a full-bleed overlay inviting it, then
nothing.

## A drop the app cannot accept

The overlay is the app's promise that a drop will be handled, so while
disconnected it **does not appear**. `dragenter` with files, no connection: no
overlay, no highlight, the cursor's own no-drop indicator is the only feedback,
which is the platform's normal answer for a target that is not accepting.

A drop that lands anyway — the pointer entered before the session lapsed, or the
overlay was suppressed mid-drag — is not swallowed. It produces one failure row
for the batch, not one per file, because the reason is the same for all of them
and a fifty-photo folder should not produce fifty identical rows:

> **12 files** — sign in to add files to this trip

Activating that row does nothing on its own; the sign-in control is in the
account row directly above, where it always is. The row is dismissed by the
panel's existing `Dismiss`.

The panel's standing signed-out line is reworded to cover both pipelines:

> `Sign in to add tracks and photos to this trip.`

## A file the app cannot identify

Files are partitioned into three buckets, not two:

| Bucket | Extensions | Goes to |
|---|---|---|
| Tracks | `.kml`, `.kmz` | #34's pipeline |
| Photos | `.jpg`, `.jpeg`, `.png`, `.webp` | #51's pipeline |
| Neither | everything else | rejected by name, before either pipeline |

Today the third bucket does not exist: anything not a track is handed to the
photo pipeline, so a `.gpx` — the likeliest wrong file anyone brings to a
mapping app — is told `only JPEG, PNG, and WebP photos can be imported`.

Rejection copy for the third bucket names both halves of what the trip takes,
since the user's file is neither:

> **route.gpx** — trips take .kml or .kmz tracks and JPEG, PNG or WebP photos

`.heic`/`.heif` keep their own message from #51 — it tells the user how to fix
the problem, which is more useful than the generic line, and iPhone photos are
common enough to be worth the special case:

> **IMG_4021.HEIC** — iPhone HEIC photos aren't supported. In iOS, Settings →
> Camera → Formats → Most Compatible.

A file with no extension at all falls in the third bucket.

## A file the trip already has

A file whose name already names a track or a photo in this trip is refused
before anything is uploaded:

> **Holy Cross Day 1.kml** — already in this trip

Matching is on filename within the trip, case-insensitively, against the
trip's current contents — which includes files read back from Drive on load, not
only ones imported this session.

The check is deliberately crude. It refuses two genuinely different files that
share a name, and misses the same file renamed. It is chosen because the failure
it prevents — dragging the same folder in twice and doubling a trip, in Drive as
well as on screen — is common, and the failure it introduces is rare and
recoverable by renaming the file. Content hashing is the correct answer and is
not worth its cost at this scale.

A batch that is entirely duplicates uploads nothing and leaves the trip
untouched, matching #51's stance for a batch where every file failed.

**The `/` map page is unchanged.** It is scratch space that does not survive a
reload, re-importing there is a normal way to reset, and #4's behaviour stays
exactly as specified.

## States

| State | Overlay | Panel |
|---|---|---|
| Connected, idle | shown on drag with files | `Import files` enabled |
| Connected, importing | shown | `Importing…`, disabled, progress rows |
| Disconnected | not shown | `Import files` disabled + signed-out line |
| Disconnected, drop landed anyway | — | one batch failure row |

## Edge cases

**A mixed batch.** One `.kml`, one `.jpg`, one `.gpx`: the first two import,
the third produces one failure row. Partial success is the existing contract and
is unchanged.

**Two files with the same name in one batch.** Both cannot end up in the trip:
the first to complete wins and the second is refused as already present. They
render as two distinct progress rows while in flight — today they collide on the
React key `` `${index}-${name}` ``, which must key on the batch position
instead.

**A duplicate of a file that failed to upload earlier.** Not a duplicate: the
trip does not contain it, so it imports normally.

**A drop of a folder containing nothing importable.** One failure row per file,
as with any other rejection. There is no "nothing here" summary — the user
dropped specific files and the rows name them.

**Drag leaves the window mid-drag.** Unchanged from #4: the depth counter clears
the overlay only when the drag has actually left.

## Copy

| Case | String |
|---|---|
| Panel, disconnected | `Sign in to add tracks and photos to this trip.` |
| Drop while disconnected | `<n> files — sign in to add files to this trip` |
| Unrecognised type | `trips take .kml or .kmz tracks and JPEG, PNG or WebP photos` |
| HEIC (unchanged, #51) | `iPhone HEIC photos aren't supported. In iOS, Settings → Camera → Formats → Most Compatible.` |
| Already present | `already in this trip` |
| Empty track list (was "Import tracks") | `Drop tracks or photos anywhere, or use Import files above.` |

The last row is the copy defect this note closes: the empty state pointed at a
button labelled `Import tracks`, which has read `Import files` since #51.

`TrackList` renders on two surfaces with two different import controls beside
it, so the empty-state string belongs to the surface, not to the component —
the trip page passes the string above, and `/` keeps its existing
`Drop a KML or KMZ file anywhere, or use Import tracks above.` unchanged, because
`/` genuinely does not take photos.

## New tokens

None.

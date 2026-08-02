# 51 — Import photos into a trip, with thumbnails

Tokens from [design-language.md](design-language.md), which supersedes the
Tokens section of [2-map-shell.md](2-map-shell.md) — `--ground` replaces the
`--surface-solid` older notes refer to. Lives on the trip detail view from
[35-trip-detail-view.md](35-trip-detail-view.md), and reuses the per-file
failure contract from [4-file-import.md](4-file-import.md) and the upload
behaviour from [34-attach-tracks-to-trip.md](34-attach-tracks-to-trip.md).

## Where it lives

Trip detail owns its own shell rather than slotting into the default one
(`App.tsx` routes `/trips/:id` exclusively for exactly this reason), so its drop
target is already scoped to the open trip and does not fight a window-wide
handler. Photos reuse that target — the same drop that accepts a KML accepts a
JPEG, and the file's type decides which pipeline it enters.

One import control, not two. A second button labelled "Import photos" beside
"Import tracks" makes the user classify their own files before cairn does, and
gets it wrong the moment someone drags a folder containing both.

```
┌──────────────────────────────┐
│  ← Trips                     │
├──────────────────────────────┤
│  Hokkaido            planned │
│  Aug 12 – Aug 19             │
├──────────────────────────────┤
│  [ Import files ]            │  accepts .kml .kmz .jpg .png .webp
│  Uploading IMG_4021.jpg      │  progress, --text-xs --text-muted
│  12 of 50                    │
├──────────────────────────────┤
│  ● Day-3.kml    12.4 mi  👁  │  tracks (#6 anatomy)
├──────────────────────────────┤
│  ▦ 48 photos                 │  photo section (#55 fills it)
└──────────────────────────────┘
```

The control's label changes from "Import tracks" to "Import files", and its
`accept` widens. That is a visible change to a shipped surface and is
deliberate.

## Main path

1. Drop or pick files onto an open trip.
2. Files are partitioned by extension. Tracks take the existing #34 path;
   images enter this one. Anything else is rejected by name.
3. Each photo, in turn: read EXIF (#50), decode, draw to a canvas at thumbnail
   size with orientation applied, encode, then upload original and thumbnail to
   the trip folder.
4. `photos.json` is written once at the end of the batch, not once per photo —
   fifty sequential index writes is fifty chances to lose the etag race for no
   benefit.
5. Nothing announces success. The photo count appearing in the sidebar is the
   confirmation, consistent with #4 treating the track appearing on the map as
   its own.

## Concurrency

At most four uploads in flight. Chosen rather than unbounded because a fifty
photo batch at 4MB each will otherwise open fifty sockets, starve the map's own
tile requests, and make every individual photo slower to land.

Thumbnail generation is sequential and happens on the main thread. A canvas
decode of a 12MP JPEG is tens of milliseconds; fifty of them interleaved with
uploads is noticeable but not a freeze, and moving it to a worker is a
complication to buy back later if a real batch proves it necessary.

## Thumbnails

Longest edge 512px, aspect preserved, JPEG at quality 0.82. Named
`<originalName>.thumb.jpg` alongside the original in the trip folder.

512 is chosen against the two consumers: #54's map markers render at 28px and
#55's list rows at 32px, both far below it, while the list must still look right
on a 3× display and a marker may be enlarged on selection. It is small enough
that a hundred of them is a couple of megabytes.

**Orientation is applied to pixels, not carried forward.** #50 reports the EXIF
orientation; this issue rotates the canvas accordingly and writes an upright
thumbnail with no orientation tag. Every consumer then renders it without
needing to know EXIF exists. Portrait phone photos landing sideways is the most
visible way this feature can look broken, and the fix belongs here, once.

The original is uploaded untouched — orientation tag intact, EXIF intact, bytes
identical.

## States

**Idle** — control reads `Import files`, enabled.

**Dragging over** — the existing #4 overlay, unchanged. Copy widens to
`Drop tracks or photos`.

**Importing** — control disabled, reads `Importing…`. Beneath it, two muted
`--text-xs` lines: the current file's name, and `12 of 50`. One line per batch,
not per file; a fifty-row progress list is noise.

The whole trip stays interactive during import. Tracks already loaded stay
visible and pannable, and the photo section fills in as the batch settles.

**Done** — control returns to `Import files`, progress clears, photo count
updates.

## Failures

Reported per file beneath the control, on `--danger`, persisting until the next
import begins. A `Dismiss` link clears them early. Not toasts — a fifty file
batch with six failures produces a stack to read at your own pace, matching #4.

| Cause | Copy |
|---|---|
| HEIC | `<name> — iPhone HEIC photos aren't supported. In iOS, Settings → Camera → Formats → Most Compatible.` |
| Unsupported type | `<name> — only JPEG, PNG, and WebP photos can be imported` |
| Unreadable image | `<name> — could not be read as an image` |
| Upload rejected | `<name> — upload failed` |
| Drive out of space | `<name> — Drive is out of space` |

The HEIC message names the setting rather than the format, because "HEIC is
unsupported" tells the user what went wrong and not what to do. It is the one
error here with a one-time fix, so it gets the extra sentence.

## Edge cases

- **A folder containing tracks and photos** — both import, each down its own
  path, one progress line covering the whole batch.
- **The same photo imported twice** — both import. No deduplication, matching
  #4's stance for tracks; re-importing after editing is a legitimate case and
  cairn cannot tell the difference.
- **Every file in the batch fails** — each reports its own line; `photos.json`
  is not written, and the trip is unchanged.
- **Dropping more files mid-import** — they queue onto the current batch and
  the count grows (`12 of 63`), rather than being rejected or starting a second
  batch.
- **Token expires mid-batch** (#32's seven-day reality) — the in-flight photo
  fails, the batch pauses rather than burning through forty more failures, and
  the existing reconnect affordance is surfaced. Resuming re-runs only what did
  not upload.
- **A photo with no EXIF at all** — imports normally. Location and time are
  absent, it lands in the list unlocated (#55), and it is not an error.
- **A 100MP photo** — thumbnails fine; the canvas is bounded by the output
  size, not the input. Upload is slow and the progress line is the answer.
- **Picker cancelled** — nothing happens, no state change.
- **Photo dropped while no trip is open** (on `/` or `/trips`) — rejected with
  `Photos belong to a trip — open one first.` The v1 map has no trip to attach
  to and silently discarding the drop looks like a bug.

## Not decided here

Whether the photo section renders above or below the track list is left to #55,
which owns that surface. Whether `photos.json` merges with or replaces an
existing index on a second import is an implementation detail of the same etag
rule #33 already sets, and no criterion here turns on it.

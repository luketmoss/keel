# 34 — Attach tracks to a trip, stored in Drive

Tokens and layout from [2-map-shell.md](2-map-shell.md). Row and list
semantics from [6-track-list.md](6-track-list.md). Import batching semantics
from [4-file-import.md](4-file-import.md), extended to cover the network.

This introduces the trip detail page — `/trips/:tripId` — since #33 only
specifies the `/trips` list. It reuses the map-shell layout wholesale rather
than inventing a second one.

## Main path

1. From `/trips` (#33), opening a trip navigates to `/trips/:tripId`.
2. Same shell as #2: 320px sidebar, map filling the rest. The sidebar header
   replaces "Cairn" with the trip's name and a **←** back control to `/trips`,
   left of the name. **Import tracks** sits below it, exactly as in #4.
3. On mount, the page reads the trip's existing tracks back from its Drive
   folder and renders them into the sidebar list (#6) and onto the map (#5) —
   this is what makes attached tracks survive a reload.
4. Import works exactly as #4 describes for triggering it — picker or
   window-wide drag-and-drop — except drops on a trip page target *this*
   trip, never the untethered v1 flow.
5. Each valid file now goes through two phases instead of one: **upload**
   (original bytes, unmodified, to the trip's Drive folder, its original
   filename) and **parse** (#3's module, unchanged). Up to 3 files are
   in-flight at once; the rest of the batch queues.
6. As each file's upload finishes, it's parsed and its track(s) land in the
   list and on the map — files don't wait for the whole batch to complete
   before appearing, since with resumable, bounded-concurrency uploads a
   5-file batch may take real wall-clock time.
7. Nothing announces overall success, per #4 — the track appearing is the
   confirmation.

## Sidebar header

```
┌──────────────────────────────┐
│  ←  Hokkaido 2024             │  header
│  [ Import tracks ]            │
├──────────────────────────────┤
│  ... track rows, per #6 ...   │
└──────────────────────────────┘
```

`←` is an icon button, `aria-label="Back to trips"`, `--text-muted` going
`--text` on hover. Trip name is 16px `--text`, truncated with ellipsis, full
name in `title`.

## States

**Loading** — trip page just mounted, tracks not yet read back from Drive.
Sidebar body shows nothing but the header and button (both usable
immediately — the button doesn't wait on the read). Where the track list
will go, a single centred 14px `--text-muted` line: `Loading tracks…`. No
skeleton rows — the list is typically short enough that a skeleton is more
motion than signal.

**Idle, signed in** — header, button, and track list (or #6's empty state:
"No tracks yet / Drop a KML or KMZ file anywhere, or use Import tracks
above.").

**Signed out** — Drive is additive, not a gate (#32), but attaching a track
*is* a Drive write, so it's the one thing this page can't do offline. Button
is disabled, and directly beneath it, 12px `--text-muted`:

> Sign in to attach tracks to this trip.

Previously-attached tracks (read while last signed in, or none yet if this
trip was created and never opened signed-in) still render normally — reading
what's already on screen isn't a write. Reopening the trip while signed out
re-attempts the Drive read and, on failure, falls back to whatever was
already rendered rather than clearing the list.

**Uploading** — button disabled, reads `Importing…`. Beneath it, per file
currently in flight (up to 3 lines at once), 12px `--text-muted`:

> `Tokyo-day-3.kml` — uploading, 2 of 5

Once a file's upload completes and it's parsing (near-instant per #4, so this
rarely renders long enough to notice, but the string exists for a large
file):

> `Tokyo-day-3.kml` — parsing, 2 of 5

"2 of 5" is the file's position in the batch by import order, not upload
completion order — stable, so the line doesn't jump around as files at
different concurrency slots finish out of order.

**Done** — button returns to `Import tracks`. Progress lines clear as each
file finishes; failures move to the failure list below (per #4) and persist
until dismissed or the next import starts.

## Failures

Same list-beneath-the-button pattern as #4, on `--danger`, batch continues
regardless of one file's outcome:

| Cause | Copy |
|---|---|
| Wrong extension | `<name>` — only .kml and .kmz files can be imported |
| Parse error | `<name>` — not a valid KML or KMZ file |
| No tracks inside | `<name>` — no tracks found in this file |
| Read error | `<name>` — could not be read |
| Upload failed | `<name>` — could not be uploaded, tap to retry |
| Sign-in expired mid-upload | `<name>` — signed out before this finished uploading, tap to reconnect |

The last two carry an action, unlike the first four (which require a
different file to fix anything). **Upload failed** retries just that file
from the picker's still-held `File` object — no reselection needed. **Signed
out** routes through #32's re-authentication rather than a bare retry, since
retrying without a token fails identically.

A resumable upload that survives a transient drop (Wi-Fi blip, tab
backgrounded) never reaches this list at all — resumption is invisible and
the progress line simply continues. It only becomes **Upload failed** once
resumption itself has been exhausted (network gone, or the resumable session
expired).

## Edge cases

- **Leaving the trip page mid-batch** — uploads in flight or still queued are
  abandoned; there's no service worker to carry them past the page's
  lifetime. Files that finished before navigating away are already attached
  and stay. No confirmation dialog on navigation — the cost of an abandoned
  upload is re-dropping the same file, which is cheap, and a dialog on every
  accidental back-click is a worse everyday cost than the rare interrupted
  batch.
- **Same file imported twice into the same trip** — both upload as distinct
  Drive files (Drive doesn't enforce unique names in a folder) and both
  tracks appear, matching v1's non-deduplication (#4).
- **Token expires 7 days in, mid-session, no upload in progress** — the next
  import attempt fails immediately with the reconnect copy above rather than
  starting an upload that's certain to fail.
- **Trip's Drive folder deleted or renamed outside the app** — out of scope
  for this issue; #33 owns what happens when the index and Drive disagree,
  and this page inherits that behavior rather than defining its own.
- **Very large batch (20+ files)** — bounded concurrency means the tail of
  the batch may sit queued for a while; the position-in-batch number in the
  progress line ("18 of 22") is what tells the user it's still working
  through the list rather than stalled.
- **Non-file drag, picker cancelled** — unchanged from #4.

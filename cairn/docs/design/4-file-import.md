# 4 — Import track files by drag-and-drop or file picker

Tokens and layout from [2-map-shell.md](2-map-shell.md).

## Main path

1. Sidebar header holds a full-width button: **Import tracks**.
2. Clicking opens the OS picker with `accept=".kml,.kmz"` and `multiple`.
   Alternatively the user drags files from a file manager anywhere over the
   window.
3. On drop or selection, files are validated by extension, then parsed one at a
   time through #3's module.
4. Each success adds a row to the sidebar (#6) and polylines to the map (#5).
5. Nothing announces success. The track appearing on the map *is* the
   confirmation, and a toast saying "Imported 1 file" over the top of the thing
   you just imported is noise.

## Drop target

The whole window, not a bordered rectangle. A dedicated drop zone would either
occupy space permanently or force the user to aim, and the map is the obvious
place to throw a map file.

While a drag carrying files is over the window, overlay the entire viewport:

- `--surface` at full coverage, `backdrop-filter: blur(2px)`
- a 2px dashed `--accent` inset border, 16px from the edge
- centred, 18px, `--text`: **Drop KML or KMZ files**

The overlay appears on `dragenter` and clears on `dragleave` at the window
boundary or on `drop`. Only for drags carrying files — dragging selected text
across the window must not trigger it.

## States

**Idle** — button reads `Import tracks`, enabled.

**Dragging over** — overlay as above. Sidebar stays visible beneath it.

**Parsing** — button is disabled and reads `Importing…`. Beneath it, a single
muted 12px line naming the current file and position in the batch:

> `Tokyo-day-3.kml` — 2 of 5

One file at a time, sequentially. Parallel parsing of five large files competes
for the main thread and makes every one of them slower to first render.

**Done** — button returns to `Import tracks`. Progress line clears.

## Failures

Reported per file, in a list beneath the import button, on `--danger`. The batch
continues; a failure never aborts the remaining files.

| Cause | Copy |
|---|---|
| Wrong extension | `<name>` — only .kml and .kmz files can be imported |
| Parse error | `<name>` — not a valid KML or KMZ file |
| No tracks inside | `<name>` — no tracks found in this file |
| Read error | `<name>` — could not be read |

The third is not a failure of the file, but it is a failure of the user's
intent, and silence would look like a bug.

Messages persist until the next import begins, then clear. They are not toasts —
a five-file batch with three failures produces a stack you want to read at your
own pace, not three overlapping timers. A single **Dismiss** link clears them
early.

## Edge cases

- **Same file imported twice** — both import and both appear. They get distinct
  colours from #5's palette, so they are distinguishable on the map. Not
  deduplicated; a legitimate case is re-importing after editing a file.
- **Zero valid files in the batch** — every file reports its own error, and the
  map is untouched.
- **A very large file** — the progress line is the answer. Parsing stays on the
  main thread for v1; a worker is the fix if a real file ever locks the UI long
  enough to notice, and that is a v2 problem with real data behind it.
- **Drop during an in-progress import** — dropped files queue onto the end of
  the current batch rather than being rejected.
- **Mixed valid and invalid extensions** — invalid ones are rejected up front by
  extension without being read, valid ones parse normally.
- **Non-file drag** (text, a link, an image from a web page) — no overlay, no
  response.
- **Picker cancelled** — nothing happens, no state change.

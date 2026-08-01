# 6 — Track list with visibility toggles

Tokens and layout from [2-map-shell.md](2-map-shell.md). Colours are the
per-file assignments from [5-track-rendering.md](5-track-rendering.md).

## Sidebar anatomy

```
┌──────────────────────────────┐
│  Cairn                       │  header
│  [ Import tracks ]           │  #4
├──────────────────────────────┤
│ ● Tokyo-day-3.kml     👁  ×  │  row
│   12.4 mi · 3h 42m · 1,850ft │  #7
├──────────────────────────────┤
│ ● Hokkaido.kmz  4 tracks     │
│                       👁  ×  │
└──────────────────────────────┘
```

Header is fixed. The row list scrolls internally when it overflows — the page
never scrolls (#2).

## Row

One row per **file**, not per track. A KML holding twelve tracks is one thing
the user dragged in and one thing they will want gone; twelve rows would bury
the list on the first import.

- **Swatch** — 10px circle, the file's polyline colour, vertically centred
- **Name** — the file name including extension, 14px `--text`. Truncated with
  `text-overflow: ellipsis`, full name in the `title` attribute
- **Count** — `4 tracks` in 12px `--text-muted`, only when the file holds more
  than one. Singular files say nothing; "1 track" is noise
- **Statistics line** — 12px `--text-muted`, second line. Specified in #7
- **Visibility toggle** — eye / eye-slash icon button, 24px hit target minimum
- **Remove** — `×` icon button, `--text-muted`, `--danger` on hover

Icon buttons carry `aria-label`: `Hide Tokyo-day-3.kml` / `Show
Tokyo-day-3.kml`, and `Remove Tokyo-day-3.kml`. Two icon-only controls per row
are unusable without them.

Rows are separated by a 1px `--border` rule. No hover highlight — nothing
happens when you click a row, and a highlight implies otherwise.

## States

**Empty** — centred in the sidebar body, 14px `--text-muted`:

> **No tracks yet**
> Drop a KML or KMZ file anywhere, or use Import tracks above.

**Populated** — rows as above, newest at the bottom, so import order reads
top to bottom and existing rows do not shift under the cursor.

**Row hidden** — swatch drops to 40% opacity, name goes `--text-muted`, eye
icon switches to eye-slash. The row keeps its place in the list. Statistics stay
at full contrast — hiding a track on the map does not make its numbers less
true, and greying everything makes the row look disabled rather than hidden.

**Importing** — existing rows stay interactive. The progress line from #4 sits
under the button, above the list.

## Edge cases

- **Removing the last file** — list returns to the empty state. No animation, no
  confirmation. Undo is out of scope, and the recovery is re-importing the file,
  which is cheap and which the user still has on disk.
- **Every row hidden** — the list looks fully dimmed and the map is bare. No
  extra message; the eye-slash icons say it, and an empty-map overlay would be
  wrong the moment one row is toggled back.
- **Long name with no break opportunity** (`2024-08-01T09-14-22Z-morning-run.kml`)
  — truncates mid-token via ellipsis. `title` carries the full string.
- **Many files (20+)** — the list scrolls. Colours have repeated by then (#5),
  so the swatch narrows the search rather than identifying uniquely, and the
  name disambiguates.
- **Toggling rapidly** — visibility is local state, so it tracks the clicks with
  no debounce needed. Bounds re-fitting on show is animated (#5) and a fast
  second toggle interrupts the animation, which is correct.
- **File containing zero tracks** — never reaches this list. #4 rejects it at
  import with its own message.

# 46 — Rename, reorder, and recolor track files within a trip

Tokens, row anatomy, and visibility toggling from [6-track-list.md](6-track-list.md).
Colours are the fixed eight-colour palette from [5-track-rendering.md](5-track-rendering.md).
Click-to-edit and save-failure conventions from [35-trip-detail-view.md](35-trip-detail-view.md)'s
trip header — this note reuses that pattern rather than inventing a second one.

Assumes #46's `tracks.json` per-trip sidecar (`{ [fileId]: { displayName?, color?, order } }`),
written next to the trip's other Drive-backed files. Applies on top of the file
listing #34/#35 already load; nothing here changes how files are fetched.

## Row anatomy, updated

```
┌──────────────────────────────────┐
│ ⠿ ● Day-3.kml            👁  ×   │
│     12.4 mi · 3h 42m · 1,850ft   │
└──────────────────────────────────┘
```

- **Drag handle** (`⠿`, `--text-muted`) — new, leftmost. 24px hit target,
  `aria-label` `Reorder <name>`. Grabbing it is the only way to reorder; the
  row itself is not draggable, so clicking the name or stats never
  accidentally starts a drag.
- **Swatch** — same 10px circle, now also a button. Click opens the colour
  picker (below). `aria-label` `Change colour for <name>`.
- **Name** — same position, now click-to-edit. Click enters edit mode; the
  eye and remove buttons stay where they are.

## Rename

Click the name text (not the row) to enter edit mode: text input in place,
autofocus, existing name pre-filled and selected. Same commit rules as the
trip header's `NameEditor`:

- **Enter or blur** commits. Read mode returns immediately with the thin
  `--accent` underline that fades over 300ms, confirming the save landed.
- **Escape** discards, reverts to the prior name, does not save.
- **Empty commit** (blur or Enter with the field cleared) reverts to the prior
  name without attempting a write — same as Escape, not an error.
- **Save failure** (Drive write rejected, offline, etag conflict on
  `tracks.json`): reverts to the prior name and shows `Couldn't save name —
  reverted.` in `--danger` beneath the track list, clearing on the next
  successful edit to any track in the trip.

Renaming sets `displayName` in `tracks.json` only. The file's actual name in
Drive is never touched — the `title` attribute and any Drive-side view of the
file continue to show the original filename.

Only one row edits at a time, same rule as the trip header: starting a rename
on another row commits or discards whatever edit was already in progress.

## Reorder

Drag the handle to move a row. While dragging: the dragged row lifts slightly
(subtle shadow, no rotation — this is a list, not a card sort), and a 2px
`--accent` line shows between rows to mark the drop position, updating as the
row passes over others. Dropping commits the new order immediately (optimistic,
same underline-fade confirmation as rename) and writes `order` for every track
in the trip to `tracks.json` in one request.

Drag handles are disabled (`--text-muted` at reduced opacity, not clickable)
while the trip is in [#35's **Partially loaded**](35-trip-detail-view.md) state.
Reordering a list that's still gaining rows underneath the cursor produces a
result nobody intended; handles activate once the batch settles.

**Save failure** on drop: the list reverts to its prior order and the same
danger-text pattern as rename appears — `Couldn't save order — reverted.`

## Recolour

Click the swatch to open a small popover anchored below it: the eight
`TRACK_COLORS` swatches in a row, 20px circles, the current colour marked with
a `--accent` ring. Click a swatch to select — closes the popover, updates the
row's swatch and the track's line colour on the map immediately, same
underline-fade confirmation. Click outside the popover or press Escape closes
it without changing anything.

Each option's `aria-label` is the colour name from the palette comment (`Red`,
`Cyan`, `Yellow`, `Magenta`, `Orange`, `Chartreuse`, `Violet`, `Spring green`).
The trigger's `aria-label` is `Change colour for <name>`; the popover's
`aria-label` is `Colours for <name>`.

Recolouring sets `color` in `tracks.json` — an explicit palette index — which
takes over from the auto-assigned `colorIndex` for that file going forward,
even if it now matches or collides with another track's colour. Two tracks
sharing a colour is allowed; the palette repeats past eight tracks already
(#5), so collision handling already has to exist and this doesn't add a new
case.

**Save failure**: popover has already closed by the time a write could fail
(closing isn't gated on the save), so the swatch reverts to its prior colour
and the same danger-text pattern appears — `Couldn't save colour — reverted.`

## States

**No overrides yet** — first use of this feature on a trip; `tracks.json`
doesn't exist. Every row uses today's defaults (Drive filename, Drive-listing
order, auto-assigned `colorIndex`), identical to current behaviour. The file is
created on the first successful rename, reorder, or recolour — not eagerly on
trip load.

**Overrides loaded** — `tracks.json` exists and has been fetched alongside the
file listing. Rows apply `displayName`/`color`/`order` on top of the raw Drive
data before first render, so there's no flash of default-then-overridden
values.

**Track missing an override** — a file present in Drive but absent from
`tracks.json` (newly attached since the sidecar was last written) falls back
to defaults for whichever fields it lacks: original filename if no
`displayName`, appended to the end of the order if no `order`, next
auto-assigned colour if no `color`. This can happen per-field, not just
per-file — a track can have a saved colour but no saved name yet.

**Stale override** — `tracks.json` names a file ID no longer in the Drive
listing (removed via the existing `×` control, or independently in Drive).
Ignored silently; not surfaced as an edge case in the UI, since #35 already
handles a missing *file* — this is a missing metadata *entry*, which is just
absence. On the next successful write to `tracks.json` for any track in the
trip, stale entries are pruned so the file doesn't grow unbounded over a trip's
lifetime.

## Edge cases

- **Renaming two tracks to the same name** — allowed, no warning. The swatch
  and drag order still distinguish them; name collisions aren't this feature's
  problem to solve.
- **Reordering during File deleted behind the app's back (#35)** — a missing
  row (danger-glyph state) has no drag handle, same as it has no visibility
  toggle today; it's not draggable and other rows can be reordered around it.
  Its position is still tracked in `order` so it doesn't jump if the file
  reappears.
- **Rapid sequential drags** — each drop is its own write, same as rapid
  visibility toggles today (#6); no debounce, last drop wins.
- **Renaming, then immediately dragging the same row before the rename's save
  resolves** — the rename commit (optimistic UI update) has already happened
  by the time a drag can start, since drag requires releasing the name field
  first (only one field edits at a time, and dragging counts as leaving edit
  mode same as clicking elsewhere). No race between the two.
- **Very long renamed name** — same truncation/`title` rule as original names
  (#6): ellipsis in read mode, full string on hover and in the edit input.
- **Colour popover near the bottom of a scrolled list** — opens upward instead
  of downward if there isn't room below, same as any anchored popover; no new
  convention needed beyond "don't render off-screen."

## Not decided here

Keyboard-only reordering (arrow-key or button-based move-up/move-down) is not
provided — reordering is mouse/touch drag only. Nothing in the acceptance
criteria requires a keyboard path, and adding one is a reasonable follow-up
rather than part of this issue.

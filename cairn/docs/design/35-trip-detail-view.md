# 35 — Trip detail view

Tokens and layout from [2-map-shell.md](2-map-shell.md). Row anatomy and
visibility toggling from [6-track-list.md](6-track-list.md). Statistics line
from [7-track-statistics.md](7-track-statistics.md). This issue scopes that
same shell to one trip, loaded from Drive instead of from a drop event, and
adds an editable metadata header above the file list.

Assumes #33's `trip.json` shape (name, dates, `planned | completed`, notes) and
#34's per-trip file storage (original files kept, one entry per file). Neither
exists yet; this note specifies behaviour against what those issues propose.

## Layout

Same 320/remainder split as [2-map-shell.md](2-map-shell.md). The sidebar
gains one section above the file list:

```
┌──────────────────────────────┐
│  ← Trips                     │  back link
├──────────────────────────────┤
│  Hokkaido                    │  trip header
│  planned            ▾        │  (editable)
│  Aug 12 – Aug 19              │
│  Notes…                      │
├──────────────────────────────┤
│ ● Day-3.kml     👁  │  row (existing #6 anatomy,
│   12.4 mi · 3h 42m · 1,850ft │   no remove control here)
└──────────────────────────────┘
```

The back link (`← Trips`) sits above everything and always routes to `/trips`,
regardless of load state — a broken detail view should never trap the user.

## Trip header

Read mode: name as an 18px `--text` heading, status as a small pill (`planned`
in `--accent`, `completed` in `--text-muted`), dates as `Aug 12 – Aug 19` (or
`Planned — no dates set` if absent), notes as a muted paragraph, truncated to
three lines with a `Show more` link when longer.

Every field is independently click-to-edit: clicking the name turns it into a
text input in place; clicking the status pill turns it into the two-option
selector; clicking dates opens two date inputs; clicking notes turns the
paragraph into a textarea. Only one field edits at a time — starting a second
edit commits or discards the first (see below) rather than stacking two inputs.

**Committing an edit**: blur or Enter (Enter is a no-op in the notes textarea,
where it's a real newline) saves. The field shows its read-mode display
immediately (optimistic), with a thin `--accent` underline that fades out over
300ms as confirmation the save landed. Escape discards and reverts to the prior
value without saving.

**Save failure** (Drive write rejected, offline, etag conflict): the field
reverts to its prior value and a single-line message appears beneath the
header in `--danger`: `Couldn't save — <field> reverted.` It clears on the next
successful edit anywhere in the header.

Name cannot be saved empty — an empty commit reverts without attempting the
write, same as Escape. No error message; an empty name is an aborted edit, not
a failed one.

## Main path

1. Navigate to `/trips/:id`.
2. View enters **Fetching** (below) while trip metadata and the trip's file
   list load.
3. Metadata renders in the header. Files render into the sidebar list and onto
   the map as they arrive — see **Partially loaded**.
4. Once all files have loaded (or failed), the map fits bounds to the union of
   all visible tracks, same behaviour as v1's fit-on-import.

## States

**Fetching** — nothing has arrived yet. Header shows three grey placeholder
bars (`--border` background, no shimmer — consistent with the map shell's
stance that a static placeholder beats a spinner that flashes and vanishes on
a fast connection). File list shows nothing; the map shows `--surface-solid`,
same treatment as the map shell's own loading state.

**Partially loaded** — some files have arrived, others are still in flight.
Arrived files render into the list and onto the map immediately, in the order
their fetches resolve (not a fixed order — re-fetching the same trip can
reorder rows run to run, which is acceptable; nothing here promises a stable
sort). Files still in flight do not reserve a placeholder row — a row appears
when its data is ready, not before. The map's bounds-fit is deferred until the
whole batch settles (success or failure per file) so it doesn't jump repeatedly
as rows trickle in.

**File deleted behind the app's back** — the trip's file index names a file
Drive no longer has (404) or can't return (any other read failure). That row
still renders, styled like a hidden row (40% opacity swatch) but with the eye
icon replaced by a small `--danger` warning glyph, `aria-label`
`<name> — file missing`. No stats line; the row is not clickable and has no
visibility toggle, since there's nothing to show or hide. It does not block
sibling files from loading or the map from fitting bounds around the ones that
did.

**Trip not found** — `:id` matches no trip (checked against the same index
#33 uses for the list, then confirmed against Drive per that issue's "index is
a cache, not the truth" rule). Centred in place of the whole detail view, on
`--surface-solid`:

> **Trip not found**
> It may have been deleted. [← Back to trips]

**Empty trip** — id is valid, metadata loads, but the trip has no attached
files yet (nothing has landed from #34 for it). File list shows the existing
#6 empty state text (`No tracks yet` / `Drop a KML or KMZ file anywhere, or use
Import tracks above.`) even though import isn't wired up in this view (see Out
of Scope) — the copy still describes the actual way to get files into a trip
today, from the global import panel while the trip context menu is out of
scope for #35.

## Edge cases

- **Every file in the trip missing** — list shows every row in the missing
  state, map is bare (`--surface-solid` fades to whatever basemap default
  centre/zoom the shell falls back to when there's nothing to fit bounds
  around — same as v1's empty-import world view). No extra banner; the rows
  already say it.
- **Editing a field, then navigating away via the back link before it
  commits** — treated as blur: the in-flight edit commits (or discards on
  empty name) before navigation proceeds, same as clicking elsewhere.
- **Two edits to different fields in quick succession** — each is its own save
  request; they do not need to serialize relative to each other, only relative
  to `trip.json`'s etag per #33's `If-Match` rule. A conflict on the second
  save surfaces the same failure message as above.
- **Very long trip name** — input grows to the sidebar width and truncates
  with ellipsis in read mode, same truncation rule as file rows in #6.
- **Notes with only whitespace** — treated as empty notes; read mode shows
  nothing, not a blank paragraph with height.
- **Status changed while dates are unset** — allowed. Status and dates are
  independent fields; nothing here requires dates to mark a trip completed.

## Not decided here

Whether arriving files animate into the list/map (fade-in) versus appearing
instantly is left to implementation; nothing in the acceptance criteria turns
on it and #5's existing polyline-draw behaviour is the natural default to
inherit.

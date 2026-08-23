# 294 — a cairn without a photo expands

The row expansion #250 gave a photograph, given to every other cairn.

Standing documents: [cairns.md](cairns.md) (*"photo" is not a kind* — the rule
this issue is the interaction half of), [design-language.md](design-language.md)
(type scale, spacing, motion),
[shell-and-content-model.md](shell-and-content-model.md) (the row, the column,
the phone sheet). Prior notes:
[250-expanding-a-cairn-row.md](250-expanding-a-cairn-row.md) — **the note this
revises** — [193-trip-row-anatomy.md](193-trip-row-anatomy.md) (the header,
unchanged), [197-seeing-the-photo.md](197-seeing-the-photo.md) and
[195-lightbox-controls.md](195-lightbox-controls.md) (the detail face, still
where editing happens),
[196-editing-a-cairn.md](196-editing-a-cairn.md) (the fields the detail face
owns), [159-cairn-facets.md](159-cairn-facets.md) (the facet the summary
names), [158-moving-a-cairn.md](158-moving-a-cairn.md)
(`positionSourceSentence`).

## Why

> *"Clicking on a cairn that isn't a photo should open/expand in the side bar
> with details just like photos."*

#250 wrote the split honestly: *"An icon-only cairn never expands. There is
nothing to preview."* That is true of a **photo** and false of a **cairn**. A
campsite has a name, a date, a facet, a description and a reason it is where it
is — the detail face has been showing exactly that since #157 made it the whole
face rather than a photo viewer. What the row lacked was not content; it was a
block to put the content in.

And the cost of the split is the thing being reported. Clicking down a list of
cairns, every icon-only one throws a modal over the map and has to be dismissed
before the next click — which is precisely the tax #250 exists to remove, left
in place for the kind of cairn a trip has most of once you start marking
junctions and water.

`cairns.md` says photos and points of interest are one kind. Two click
behaviours is that rule not being kept.

## What this revises in #250

One row of its table, and the sentence under it.

| You click | Selected | Expanded | Lightbox |
|---|---|---|---|
| Collapsed row, cairn has an image | this cairn | this row | — |
| ~~Row of an icon-only cairn~~ **Collapsed row, cairn has no image** | this cairn | ~~—~~ **this row** | ~~opens~~ **—** |
| Expanded row's header | unchanged | collapses | — |
| The inline photo | unchanged | stays expanded | opens |
| ~~Marker of an icon-only cairn~~ **The inline summary** | unchanged | stays expanded | opens |
| Marker of a cairn with an image | this cairn | its row | — |
| Marker of a cairn with no image | this cairn | its row | — |
| Another row, or another marker | moves | moves with it | — |

Everything else in #250 stands: expansion is its own state, only one row is
expanded at a time, a marker click does exactly what its row click does, and the
second click collapses without deselecting.

The rule #250 left behind — *the lightbox is reached only by clicking a
photograph, or by clicking an icon-only cairn* — loses its second clause and
becomes simply: **the detail face is reached by clicking the expanded row's own
body.** One sentence, no exception.

## The expanded row

The header is untouched, as in #250. The body is a second block inside the same
`<li>`, and which body it is depends on the one predicate `cairns.md` already
states for the marker:

```
┌────────────────────────────────────────┐
│ ⛺ Camp 2                           ⋮  │   ← header, unchanged
│    16 Jun 2023 · campsite              │
│ ┌────────────────────────────────────┐ │
│ │ Flat bench above the creek, water  │ │   ← the summary
│ │ 50m back down the trail.           │ │
│ │                                    │ │
│ │ Dropped on the map                 │ │
│ └────────────────────────────────────┘ │
└────────────────────────────────────────┘
```

| Property | Value |
|---|---|
| Width | The row's content width — `--panel-width` less the row's own padding, the same as the photo preview's |
| Padding | `--space-3` |
| Gap from header | `--space-3`, matching the preview |
| Ground | `--surface-lift`, the preview's own ground, so the two bodies read as one block at two sizes |
| Radius | `--radius-sm` |
| Description | `--text-sm` in `--text`, wrapped, **clamped to four lines** with a trailing ellipsis |
| Position line | `--text-xs` in `--text-muted`, `--space-2` beneath the description |
| Cursor | `pointer` — it opens the detail face, it does not zoom, so never the preview's `zoom-in` |

**Two lines of content, not a form.** The description and
`positionSourceSentence(row.source)` — the same sentence the detail face shows,
because *why this cairn is where it is* is the one fact a summary can give that
the header cannot. Name, date and facet are already in the header and are not
repeated.

**The four-line clamp is what keeps this a summary.** A long description is
exactly the case for opening the face, and an unclamped row would push the rest
of the list off screen to show something the next click shows better.

**Editing stays on the detail face.** #196 owns the fields; the expanded row is
read-only, the same way the photo preview is a picture rather than a photo
editor.

## Copy

| Case | String |
|---|---|
| No description | `No description yet.` in `--text-muted`, in the description's place |
| The body's accessible name | `Open <name>` — its `aria-label`, matching the preview's `View <name> larger` in shape |
| Position line | `positionSourceSentence(row.source)`, unchanged and not restated here |

The empty case shows the block rather than hiding it: the position line is real
content on its own, and a row that expands into nothing reads as a bug. It is
also the fastest route to *add* a description, one click from the face.

## States

| State | The row |
|---|---|
| Collapsed | Header only, as today |
| Expanded, has a description | The summary block, as drawn above |
| Expanded, no description | `No description yet.` and the position line |
| Expanded, cairn has an image | **The photo preview, unchanged.** #250's block, its cap, its `zoom-in` |
| Expanded, image *and* icon | The photo preview. The image predicate wins, exactly as the marker's does (`cairns.md`) |
| Mid-attach (#157) | Does not expand; the detail face is already open for it and carries the progress. #157's precedence is unchanged |
| Removing | Inert, never expanded — #250's own guard |
| Confirming removal | The confirm replaces the row's contents, as today |
| Hidden (#193) | Expands normally. Hidden is about the map |
| Signed out (#73) | Expands. Reading is not a mutation |

## Edge cases

- **A photo dropped onto an expanded icon-only cairn** (#157). The row's body
  becomes the photo preview when the image lands; the row does not collapse.
- **A photo removed from a cairn, leaving an icon.** The reverse, same rule: the
  body becomes the summary.
- **A description edited on the detail face while its row is expanded
  underneath.** The summary re-renders from the same record; there is no cached
  copy.
- **A description that is only whitespace.** Treated as absent — the empty copy
  shows.
- **The expanded cairn is filtered out by a facet chip** (#159). #250's existing
  clearing applies: expansion follows the cairn, and a cairn that leaves the
  list takes its expansion with it.
- **Arrow navigation in the lightbox** (#250). `expandedIdAfterNavigate` no
  longer has a reason to return `null` for an icon-only cairn: closing the
  lightbox now always lands on the expanded row of the cairn arrived at.
- **A very long single-word description** (a URL). Wraps by breaking the word;
  the clamp still applies.
- **Phone sheet.** The block is inside the row and inherits the sheet's own
  scrolling; no detent change, and #258's rule that the detail keeps its detents
  is untouched.

## New tokens

**None.** `--surface-lift`, `--radius-sm`, `--space-2`, `--space-3`,
`--text-sm`, `--text-xs`, `--text-muted` and `--panel-width` all exist and are
all already used by the row and the preview beside it. The four-line clamp is
`-webkit-line-clamp: 4`, a property value rather than a token, in one rule.

## Decisions taken here

- **The summary opens the detail face, mirroring the photo preview.** The
  alternative — an expanded row that opens nothing, with the face reached only
  from the `⋮` — was rejected because it would make the two bodies behave
  differently for no reason a user could name, which is the exact fault this
  issue reports.
- **The description and the position line, and nothing else.** Name, date and
  facet are in the header; repeating them makes the block a worse copy of the
  face. Tracks-nearby, distance and elevation are not in the row's vocabulary.
- **A cairn with an image keeps the photo preview alone**, without a description
  beneath it. Adding one would change a surface nobody complained about and
  would make the tall case taller. If a photo's description wants to be visible
  in the list, that is its own issue.
- **Four lines.** Two reads as truncated-on-purpose for almost any real note;
  unclamped, one cairn can own the panel. Four is where a typical two-sentence
  note fits whole.

## Out of scope

- **The detail face** (#195, #196, #197) — unchanged, still where editing lives.
- **The world view's loose cairn face** — a different surface, and its own note.
- **The photo preview's own behaviour**, including full bleed.
- **Facet or icon editing from the row.**
- **Anything about the map markers.** A marker click already routes through the
  one function this changes, so 3D and 2D both inherit the new behaviour with no
  work of their own — which is the point of #250's single `selectCairn`.

# 192 — the cairn facet row inside a trip

The facet row from [159-cairn-facets.md](159-cairn-facets.md), on the trip
surface. That note is the design; this one decides only what changes when the
same control moves from the top-level column into `TripDetail`.

Standing documents: [cairns.md](cairns.md) (authoritative — the facet
vocabulary, and the one-filter rule), [design-language.md](design-language.md),
[shell-and-content-model.md](shell-and-content-model.md). Also read
[35-trip-detail-view.md](35-trip-detail-view.md) for the panel this lands in.

## What is different here, and what is not

**Not different:** the chips, their order, their icon-only treatment, their
labels, their selected state, and what each facet matches. `CairnFacetChips`
renders unchanged and `cairnMatchesFacet` decides unchanged.

**Different:** there is no top-level chip row above it. On the main map the
facet row is a *sub-row* that appears only while `Cairns` is the active kind
chip. Inside a trip there is no kind chip — a trip's panel is already scoped to
one trip's contents — so the facet row is not subordinate to anything and is
simply the cairn list's own filter.

That is the whole of the port. Everything below follows from it.

## Placement

The facet row sits **inside the `Cairns` section, between its header and its
rows** — not above the track list, and not at the top of the panel.

```
Import files
─────────────────────────────
⠿ ● 2028_10_…              👁 ⤴ ×
⠿ ● activity_…             👁 ⤴ ×
─────────────────────────────
Cairns                       17
[Any] [Photo] [⛺][💧][🛖][👁‍🗨][▲][⚠][🅿][⤫]
─────────────────────────────
● Notch Mountain hazard
● …
```

A filter belongs to the list it filters. Placed at the top of the panel it would
read as filtering the tracks too, which it does not, and the section header is
already the thing that says *these are the cairns*.

Spacing: `--space-2` above and below the row, `--space-4` horizontal padding to
line up with `.cairn-list__header`. The row itself is `CairnFacetChips.css`'s,
unchanged.

## The count

`cairns.md`: *with a facet active the title stays `Cairns` and the count
reflects the facet*.

| Facet | Header |
|---|---|
| `Any` | `Cairns` `17` |
| `Photo`, 12 match | `Cairns` `12` |
| `Hazard`, 1 matches | `Cairns` `1` |
| `Water`, none match | `Cairns` `0` |

The count is what is showing, never `12 of 17`. A fraction implies the list is
truncated; it is filtered, and the chip already says by what.

`0` is shown rather than hidden. `CairnList` currently hides the count at zero,
which is right for a trip with no cairns at all and wrong for a filter that
matched none — the difference between *nothing here* and *nothing like that
here* is exactly what the user needs to see.

## The map

**One filter, two views.** Every cairn the facet hides from the list is hidden
from `CairnLayer` too. Clustering recomputes over what is left, so filtering to
`Hazard` inside a cluster of twelve photos and one hazard leaves a single hazard
pin, not a badge reading `1`.

Tracks, their polylines, and their own visibility toggles are untouched. The
camera does not move when the facet changes — a filter is not a navigation, and
`cairns.md` spends its camera moves on selection and on cluster clicks.

## States

| State | Facet row | List | Map |
|---|---|---|---|
| Trip has no cairns at all | Hidden | `No cairns yet` / `Drop photos onto this trip to see them here.` — unchanged | No cairn markers |
| Facet `Any` | Shown, `Any` selected | Every cairn | Every cairn |
| Facet matches some | Shown, that chip selected | The matches | The matches |
| Facet matches none | **Shown**, that chip selected | `No cairns like that` / `Clear the filter to see all 17.` | No cairn markers |
| Trip still loading its cairns | Hidden until the first cairn arrives | Rows fade in as they hydrate, unchanged | — |
| Disconnected (#73) | Shown and live | Filtered normally | Filtered normally |

The facet row stays visible in the matched-nothing state. Hiding the control
that caused an empty list is the one thing that makes it unrecoverable, and it
is the mistake `shell-and-content-model.md`'s own `Filtered to nothing` state
exists to avoid.

**Disconnected does not disable the facet.** Filtering reads nothing from Drive.
#73's rule is that *mutating* controls take the Disabled treatment.

## Copy

| String | Where |
|---|---|
| `No cairns like that` | Empty title, filter matched nothing |
| `Clear the filter to see all 17.` | Empty detail; the numeral is the trip's total cairn count |
| `Filter cairns` | The row's `aria-label`, unchanged from `CairnFacetChips` |

The detail line names the total on purpose: it answers *is anything here at
all* in the same breath as offering the way back. With a total of 1 it reads
`Clear the filter to see the 1.` — so make the plural rule handle one.

## Selection, and the lightbox

**Filtering out the selected cairn clears the selection.** Its row is gone and
its marker is gone; a selection pointing at neither is a state with no way to
see or undo it. Restoring the facet to `Any` does not restore the selection —
the user picked a filter, not a navigation, and silently re-selecting something
they can no longer see the trail to is worse than a clean slate.

**Filtering while the lightbox is open closes it.** This cannot happen today —
the lightbox traps focus and the chips are outside it, the same reasoning
`Lightbox.tsx` already records for its own arrow-key navigation — but the rule
is written so that a future non-modal detail face does not have to invent one.

**The lightbox's `←` / `→` walk the filtered list.** `TripDetail` already builds
its `flatCairnRows` from the ordered list; filtering upstream of
`orderCairnListItems` makes this true by construction rather than by a second
rule. Arrows still do not wrap, and the boundary arrows still render disabled
rather than hidden.

## Resetting

The facet is `useState` in `TripDetail`, initialised to `any`, and it dies with
the component. Leaving the trip and returning gives `Any`.

This matches #159's decision for the top-level row and is the right default for
the same reason: a filter you cannot see the cause of, restored on arrival, is
indistinguishable from missing data. The trip's facet and the main map's facet
are two independent pieces of state and neither reads the other.

## Edge cases

- **A cairn's icon changes while a facet is active.** Retyping a photo as a
  campsite from the lightbox (#156) can filter the open cairn out from under
  itself. The lightbox stays open on the cairn the user is looking at; the list
  and map behind it update immediately, and closing lands on the filtered list
  with no selection, per the rule above.
- **A cairn is added to the trip while a facet is active.** It appears only if
  it matches. The count moves. Nothing else happens — no auto-clear of the
  facet.
- **A cairn is removed while a facet is active.** Same, in reverse. If it was
  the last match, the state becomes matched-nothing, not trip-has-no-cairns —
  the total in the detail copy is what distinguishes them.
- **Every cairn in the trip carries the same icon.** Seven of the eight place
  chips will match nothing. They are not hidden or disabled: a fixed, always
  complete row is learnable, and a row whose contents change per trip is not.
  `cairns.md` fixes the set at eight for the same reason.
- **A very narrow panel.** `CairnFacetChips.css` already wraps to two rows at
  `--panel-width` and that measurement is #159's; nothing here changes it.
- **Phone.** The row is inside the sheet, in the same position relative to the
  cairn list, per `shell-and-content-model.md`'s "everything else is identical
  to desktop".

## Out of scope

Filtering tracks, searching cairns by name, date-based show/hide (#198), and
persisting the facet anywhere. The eight icons themselves are `cairns.md`'s and
are not up for revision here.

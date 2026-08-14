# 159 — Filtering cairns by what kind of place they are

Model in [cairns.md](cairns.md), standing and outranking this note. Chip
treatment from [shell-and-content-model.md](shell-and-content-model.md), tokens
from [design-language.md](design-language.md).

## Why a facet row rather than more top-level chips

A top-level chip answers *what kind of thing is this*. There is one kind of
cairn, so there is one chip.

A facet answers *which of these do I want right now*, which is a different
question and may be asked of an attribute. That distinction is what lets a
photographed campsite appear under both `Photo` and `Campsite` without either
being a claim about what it is — and it is why this does not reintroduce the
disagreement between the chips and the marker that a `Photos` / `Places` split
would.

The marker still says campsite. It always did.

## Layout

```
┌──────────────────────────────────────┐
│  All   Trips   Tracks   [Cairns]     │   --chip-height, --radius-full
│    Any  Photo  ⛺ 💧 🛖 👁 ⛰ ⚠ P Y     │   28px, indented --space-2
└──────────────────────────────────────┘
```

The facet row sits directly beneath the main row, indented `--space-2` so it
reads as subordinate rather than as a continuation. Facet chips are 28px tall
against the main row's `--chip-height`, same `--radius-full`, same L2 surface.

**`Any` and `Photo` keep their words. The eight place chips are icon-only** at
`--space-2` horizontal padding, which measures 30px each.

Measured at `--panel-width`: labelled throughout, the row wraps to three lines
and costs 96px. Icon-only for the eight, it wraps to two and costs 60px. Panel
height is the scarcest resource in the column and 36px is a whole row of content.

Selected takes `--accent-soft` with `--accent`, per the language's Selected
state — identical to the main row, because a facet is a filter and filters look
like filters.

## Behaviour

| Action | Result |
|---|---|
| Select `Cairns` | Facet row appears, `Any` selected |
| Select a facet | List and map both narrow; panel count follows |
| Select `Any` | Returns to every cairn |
| Select a different top-level chip | Facet row hides |
| Return to `Cairns` | Facet row reappears with `Any` selected |

**The facet resets rather than being remembered.** A hidden filter that is still
applied when you come back is the single most confusing thing a filter row can
do, and remembering it saves one click.

The row appearing and disappearing shifts the panel down and up by its height.
That transition runs over `--motion-base`, and the panel's own content does not
animate — only its top edge moves.

## States

| State | Facet row | Panel |
|---|---|---|
| `Cairns` active, `Any` | Shown, `Any` selected | Title `Cairns`, count of all cairns |
| `Cairns` active, a facet | Shown, that facet selected | Title stays `Cairns`, count reflects the facet |
| Facet matches nothing | Shown, facet still selected | `Nothing in this filter` over `Clear filters`, per the shell model's filtered-to-nothing state |
| Any other chip | Hidden | Unchanged |
| Detail, create, or draft face | Hidden | Unchanged |

**The title stays `Cairns` under a facet** rather than becoming `Campsites`. The
header names what kind of thing you are looking at; the selected chip already
says which subset, and two controls saying the same thing is one too many.

## Edge cases

- **No cairns at all.** The `Cairns` chip still shows and the facet row still
  appears; every facet reads zero. Hiding filters because the data is empty makes
  an empty app look broken rather than empty.
- **A facet with no members** — selectable, and lands on the filtered-to-nothing
  state. Disabling empty facets would make the row flicker as data changes and
  would hide the fact that you have no huts, which is itself the answer.
- **A cairn's icon changes while its facet is active** (#156's retyping) — it
  leaves the filtered list immediately, in the panel and on the map together.
- **A photo gains an icon while `Photo` is active** (#157) — it stays, because it
  still has an image. `Photo` is about the image, not about the absence of an
  icon.
- **Narrow viewports.** The facet row wraps as many lines as it needs; it never
  scrolls horizontally, because a horizontally scrolling filter row hides
  filters.

## Copy

| Where | String |
|---|---|
| Top-level chip | `Cairns` |
| Facets | `Any` · `Photo` · `Campsite` · `Water` · `Hut` · `Viewpoint` · `Summit` · `Hazard` · `Parking` · `Junction` |
| Panel title | `Cairns`, under every facet |
| Empty | `Nothing in this filter` / `Clear filters` |

The eight place names are the icon labels fixed in [cairns.md](cairns.md), used
verbatim so a facet and an icon picker never disagree about what a glyph is
called.

## New tokens

| Token | Value | For |
|---|---|---|
| `--chip-height-sub` | `28px` | The facet row's chips |

`--chip-height` (34px) is unchanged and stays the main row's.

## Accessibility

- The facet row is a group labelled `Filter cairns`.
- Each icon-only chip carries an `aria-label` of its name and `aria-pressed`
  reflecting selection. **Hiding a visible label is not permission to ship an
  unnamed control** — the label moves, it does not vanish.
- The icon glyphs are `aria-hidden`, since the chip's own label carries the name.
- Facet chips are in the tab order in visual order, after the main chip row.
- The panel count is in an `aria-live="polite"` region so a facet change
  announces how much is left rather than silently reflowing the list.

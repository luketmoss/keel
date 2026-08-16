# 199 — tooltips on track and cairn row controls

Every icon-only control on a row gets a native `title` carrying the string its
`aria-label` already carries.

Standing documents: [design-language.md](design-language.md),
[shell-and-content-model.md](shell-and-content-model.md),
[cairns.md](cairns.md). Row anatomy is
[6-track-list.md](6-track-list.md)'s and #77's; nothing here changes it.

## The rule

> **One string per control, used as both `aria-label` and `title`.**

Not two strings that mean the same thing. A tooltip and a label that drift apart
are a bug that only one of the two audiences can see, and the labels already in
the code are the right strings — specific, naming the action and the row.

Implementation follows from that: derive the string once per control and pass it
to both attributes. Do not write the literal twice.

## The strings

Every one already exists in `TrackList.tsx` or `CairnList.tsx`. Listed here so
the set is checkable, with `X` standing for the row's own name.

### Track row

| Control | String | Notes |
|---|---|---|
| `⠿` reorder handle | `Reorder X` | Rendered only when the list is reorderable |
| Colour swatch | `Change colour for X` | Only when recolour is available |
| `👁` / `🚫` visibility | `Hide X` when visible, `Show X` when hidden | **State-dependent — the tooltip flips with the glyph** |
| `⤴` remove from trip | `Remove X from trip` | Only inside a trip |
| `×` delete | `Delete X permanently` | The word `permanently` carries the weight, per the language's rule that danger cannot rely on colour |

### Cairn row

| Control | String |
|---|---|
| `⤴` remove from trip | `Remove X from trip` |
| `×` delete | `Delete X permanently` |

`X` is the row's display name verbatim, unquoted and untruncated. The tooltip is
the one place a long name is allowed its full length — the row itself truncates,
and hovering to read the name in full is a second thing this earns for free.

## States

| State | Tooltip |
|---|---|
| Rest | Shown on hover after the browser's own delay |
| Disabled (`disableRemove`, or `disabled` on rename/recolour/reorder) | **Still shown.** A disabled control is exactly the one whose purpose is least guessable |
| Removing (`Removing…` replaces the controls) | No controls, so no tooltips |
| Confirming (the row's contents are replaced by the inline confirm) | No controls, so no tooltips — the confirm's own words are the explanation |

The disabled row deserves comment. `title` on a `disabled` button is not shown
by every browser, because pointer events do not reach a disabled control. Where
that bites, the fix is the `title` on the control's existing wrapper span — the
track row's swatch already has one (`.track-row__swatch-wrap`) for precisely
this shape of problem. Do not remove `disabled` to make a tooltip appear.

## What this deliberately does not do

**No custom tooltip component.** Native `title` is slow to appear, unstyleable,
and does not fire on touch. All three are acceptable here and none is worth a
component: this is a discovery aid for a mouse user who is unsure, not a label.
A styled tooltip is a real thing to want and would be its own issue with its own
positioning, delay, dismissal and escape rules.

**No `title` on the row's name.** The name already carries `title={name}` for
truncation, and the discoverability of click-to-rename is #196's problem — a
tooltip is the wrong answer to a missing affordance.

**No change to the glyphs.** `👁` and `🚫` as emoji are not this issue's to fix.

## Copy checks

- Sentence case, no trailing period — these are labels, not sentences.
- `Delete X permanently`, never `Delete X` — the adverb is the whole warning.
- `Remove X from trip`, never `Remove X` — the pair only reads as two different
  exits if both say where the thing goes.
- Hide/Show tracks the current state, so the tooltip answers *what will happen*,
  not *what is true*.

## Edge cases

- **A name containing quotes or angle brackets.** `title` takes text, not
  markup; React escapes it. Nothing to do, noted so nobody adds an escape.
- **An empty name.** Not reachable — both stores treat an empty commit as an
  aborted edit — but the string would read `Delete  permanently` with a double
  space if it were. Not worth guarding.
- **Touch.** No hover, so no tooltip. The `aria-label` is unchanged and remains
  the only affordance a screen reader needs. This is the accepted cost of the
  native control.
- **Keyboard focus.** `title` does not appear on focus in any browser. Also
  accepted, and also why the `aria-label` staying correct is the criterion that
  matters most.

## Out of scope

Row layout and the name's width (#193), the missing rename affordance on a cairn
(#196), tooltips on any other surface, and a styled tooltip component.

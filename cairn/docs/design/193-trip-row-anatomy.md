# 193 — the trip's track and cairn rows

The two lists inside a trip move onto the row anatomy
[shell-and-content-model.md](shell-and-content-model.md) already specifies, and
get their names back.

Standing documents read first: that file (row anatomy, the `⋮` rule),
[cairns.md](cairns.md) (the cairn row's glyph and meta line — authoritative and
not revised here), [design-language.md](design-language.md) (type, spacing,
states). Prior notes on these rows: [6-track-list.md](6-track-list.md),
[46-track-file-editing.md](46-track-file-editing.md),
[77-removing-tracks-and-photos.md](77-removing-tracks-and-photos.md),
[132-remove-photo-from-trip.md](132-remove-photo-from-trip.md),
[155-cairns-replace-photos.md](155-cairns-replace-photos.md).

This note contradicts none of them on behaviour. It moves the controls those
issues added into the container the standing document specified afterwards.

## The shape

```
┌────────────────────────────────────────────────┐
│ ⠿  ●   Notch Mountain descent            👁  ⋮ │
│        9 Mar 2024 · 14.2 km · 690 m            │
└────────────────────────────────────────────────┘

┌────────────────────────────────────────────────┐
│    ◉   Cairn above the couloir               ⋮ │
│        12 Aug 2026 · hazard · photo            │
└────────────────────────────────────────────────┘
```

Name first, full contrast, one line, ellipsised only when it genuinely runs out.
Meta beneath at `--text-xs` in `--text-muted`, indented to the name's left edge
so the two read as one block hanging off the glyph.

This is the same shape `TripsPanel` and `LooseFace` already draw. The point of
this issue is that a track inside a trip and a track outside one stop being two
different-looking objects.

## Why the name has no room today

Written down because it is the thing that has to change, and because "make the
name wider" without it is a guess.

**Track row**, at `--panel-width: 380px`:

| Item | Width |
|---|---|
| Row padding, `--space-4` × 2 | 32 |
| `⠿` handle | 40 |
| Colour swatch button | 40 |
| `👁` visibility | 40 |
| `⤴` remove from trip | 40 |
| `×` delete | 40 |
| Five `--space-2` gaps | 40 |
| **Name** | **68** |

**Cairn row**, same width: two 40px controls with `--space-2` margins (96), the
button's own `--space-4` padding (32), a 14px glyph, two gaps (16), and an
inline meta column of roughly 144px for `AUG 12, 2026 · PHOTO` in the uppercase
monospace face — leaving the name about **78px**, rendered in `--text-muted`
next to a date rendered at the same weight.

**After**, track row: `⋮` replaces two controls, so 40 + 40 + 40 + 40 = 160 of
controls, four gaps = 32, name = **156px** reserved. The `⋮` is invisible at
rest but keeps its box, so the name does not reflow on hover — 156 is the number
that matters, not a wider one that flickers.

**After**, cairn row: 32 padding + 24 glyph + 8 gap + 40 `⋮` + 8 margin leaves
the name **236px**, and the meta line gets all 236 of it on its own line rather
than competing for the same 252.

## The `⋮`

`RowMenu` exists, is tested, and is already the `⋮` on `TripsPanel`'s and
`LooseFace`'s rows. Reuse it. Do not write a second one.

| Row | Actions, in order |
|---|---|
| Track, in a trip | `Remove from trip` · `Delete permanently…` (`danger`) |
| Cairn, in a trip | `Remove from trip` · `Delete permanently…` (`danger`) |

Full phrases, per the language's rule that danger cannot rely on colour: `--danger`
and `--accent` are near-identical under red-green colour blindness, so the words
carry it. The ellipsis on `Delete permanently…` means *this will ask* — and it
does: selecting it starts the row's existing #77 inline confirm, which replaces
the row's contents in place. `RowMenu` opens; it never destroys.

**Reveal:** `opacity: 0` at rest, `1` on row hover and on `:focus-within`,
transitioned on `opacity` alone over `--motion-fast`. Never `visibility` and
never `display` — both take it out of the tab order, and the standing document
says *on hover **and on focus***, which means it has to still be focusable while
invisible. Space is always reserved.

**Touch:** there is no hover, so the `⋮` renders at full opacity below the
tablet breakpoint. A control revealed by a gesture the device cannot make is not
a control.

`disableRemove` (disconnected) disables both menu items via `RowMenuAction.disabled`
rather than hiding the trigger — #73's Disabled treatment, one sentence per
surface, not a tooltip per control.

## The controls that stay

**The track's visibility eye stays always-visible.** It is the most-used control
on the row, it is not destructive, and burying the answer to *why can I not see
this track* behind a menu is the opposite of the fix. The standing document's
`⋮` rule is aimed at the always-visible `×`, and names it.

**The `⠿` handle and the colour swatch stay** where they are and at their sizes.
Both are direct-manipulation affordances — a drag target and a colour you are
choosing by looking at it — and neither survives being turned into a menu item.

## The cairn's glyph

`cairns.md`: *the glyph is the marker, drawn smaller*. Today it is drawn at
`--dot-size` (14px), which is a trip's dot, not a cairn's marker — a cairn's
marker is `--marker-size` (28px) as a thumbnail or `--marker-poi` (30px) as a
pin, and 14px is small enough that a campsite pin and a hazard pin are the same
grey smudge.

**New token:** `--glyph-size: 24px` — the size a marker is drawn at in a list
row. Large enough that the eight place icons are distinguishable at a glance,
small enough to sit inside a two-line row without setting its height.

It is a token rather than a literal because the track swatch is the next thing
that will want it (see Out of scope), and because "the row's glyph" is a concept
the standing document already has and the stylesheets do not.

`CairnMarker`'s `small` variant renders at the new token. Its predicate is
unchanged: thumbnail when the cairn has an image and no icon, otherwise the pin
with its icon and, if it also has an image, the camera badge.

## The meta line, unchanged

`cairns.md` pins it and it is standing:

| Cairn | Meta line |
|---|---|
| Photo, no icon | `16 Jun 2023 · photo` |
| Campsite, no photo | `13 Jun 2023 · campsite` |
| Campsite with a photo | `13 Jun 2023 · campsite · photo` |
| Neither | `14 Aug 2026 · cairn` |
| No date | `undated · …` |

`cairnRowMetaLine` already produces exactly this. This issue moves where it
renders and nothing else.

**A time clause was asked for and is not taken here.** `13 Jun 2023 · 14:32 ·
campsite` is a reasonable thing to want — `CairnListRow` already carries
`captureInstantMs` and `formatCaptureTime` already renders it in the trip's own
local time — but the clause list above is in a standing document, and an issue
note does not get to add to one. It is a one-line change to `cairns.md` plus a
one-line change here, and it should be its own decision with the marker, the
lightbox and the loose face in view, not a side effect of a layout fix.

The uppercase monospace treatment stays. On its own line it costs nothing, and
it is what makes the meta line read as data rather than as a second sentence.

## States

| State | Track row | Cairn row |
|---|---|---|
| Rest | Name `--text`, meta `--text-muted`, `⋮` hidden | Same |
| Hover | `--hover` fill, `⋮` revealed | `--hover` fill, `⋮` revealed |
| Focus within | `⋮` revealed; the global 2px `--accent` outline on the focused control | Same |
| Selected | — (track rows have no selected state) | `--accent-soft` fill, `--accent` text; the meta line inherits it, as today |
| Hidden (track only) | Swatch and name at `--text-muted`; **the meta line keeps full contrast** — hiding a track on the map does not make its numbers less true, which `.track-row__stats` already gets right | — |
| Removing | Contents replaced by `Removing…`, row at `opacity: 0.4` | Same |
| Confirming | Contents replaced by the inline confirm | Same |
| Disconnected | `⋮` present, both its items disabled | Same |
| Renaming a track | The name line becomes the input; the meta line stays put | — |

## Edge cases

- **A name long enough to fill 236px.** One line, ellipsis, and the full name in
  the existing `title`. Never two lines — a wrapping name makes rows different
  heights and destroys the scannability the whole change is for.
- **A track file holding several tracks.** The ` 3 tracks` suffix stays on the
  name line, in `--text-xs --text-muted`, and is what the name ellipsises
  *before*: the count must survive.
- **A track whose stats line is absent** (a multi-track file, per #6). The meta
  line is empty and the row is one line tall. This is already true and stays
  true; do not render an empty second line to keep heights equal.
- **A cairn with no date and no icon and no image.** Meta reads `undated · cairn`.
- **The colour popover open** while the `⋮` is revealed. Both are anchored to
  their own control and neither traps; `RowMenu`'s outside-pointerdown closes it
  when the popover's backdrop is clicked.
- **The row menu open when the row is removed underneath it.** `RowMenu`
  unmounts with the row. Its document listeners are cleaned up in its own
  effect; nothing new is needed.
- **Reduced motion.** The `⋮`'s opacity transition collapses under the global
  block. It appears instantly, which is fine.
- **Phone.** Rows keep `--row-touch`; the two-line shape makes that easier, not
  harder. The `⋮` is always visible, per Reveal above.

## Copy

| String | Where |
|---|---|
| `Remove from trip` | `⋮`, both rows |
| `Delete permanently…` | `⋮`, both rows, `danger` |
| `Row actions for X` | The `⋮` trigger's `aria-label`, X being the row's name |

The trigger's label names the row so a screen reader user moving down the list
is never told `Row actions` five times in a row. This is the same shape the
existing per-control labels already use and the reason #199's tooltip rule works
at all.

## New tokens

| Token | Value | For |
|---|---|---|
| `--glyph-size` | `24px` | A marker drawn as a list row's glyph |

## Out of scope

- **The track row's swatch.** It is a 10px dot where the standing document says
  it should be the track's own rounded tile at `--marker-track`. Real, and a
  different change from the one this issue was raised for. `--glyph-size` is
  defined so that work has somewhere to land.
- Adding a time to the meta line — see above.
- Tooltips (#199), which this issue removes two of the targets of.
- Editing a cairn's name from the row (#196).
- What a row click opens (#194, #197).
- The top-level list, which is already on this anatomy.

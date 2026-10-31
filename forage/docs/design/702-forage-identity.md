# 702 — Forage identity: mark and app tile

Specifies the artwork for [#702](https://github.com/luketmoss/keel/issues/702). The rules are
[`app-icons.md`](../../../ui/docs/design/app-icons.md) and the colour registry in
[`keel-wide-rules.md`](../../../ui/docs/design/keel-wide-rules.md); nothing here restates them. This note
fixes only what is Forage's: motif, palette and the checks to record. Final artwork is drawn in `/develop`
and approved by the owner.

## Colour decision

Green stays: `#357A38` interactive in light, `#66BB6A` in dark. It shares no hue with cairn (orange), Thrive
(cobalt) or Hive (gold), and the registry already measures it passing AA in both themes. Amethyst stays
unassigned. No registry row changes unless `/develop` finds a measured figure that differs, in which case it
corrects the row.

## The mark

An apple with one leaf, kept from the old Forage icon (a white apple on a green hexagon) and redrawn in the
family style: chunky shapes, `stroke-width="7"` with round joins in a near-black green (`#0a1a10`), a soft
highlight on the apple, on transparency, drawn in a 256 viewBox like cairn's and Thrive's marks. No hexagon.
Silhouette first: at 16px it must read as a round body with a stem and leaf, so the leaf sits clear of the body.

| Part | Fill |
|---|---|
| Apple body | `#8fd694` with a `#ffffff` highlight at 0.4 opacity |
| Leaf | `#66BB6A` |
| Stem | `#f4f1ea` |

## The tile

Template geometry unchanged. Forage's choices:

| Layer | Spec |
|---|---|
| Ground | `#10281a` |
| Sun | `#66BB6A` at 760,260, `r` 105: the registry accent, 6.63:1 on the ground |
| Line motif | a hedgerow: a scalloped run of rounded leaf bumps across the upper middle, `#2f5a3a`. Decorative, 1.97:1 on purpose, like the other apps' motifs |
| Trail | a winding path across the bottom in `#ffb45e`, 8.91:1 on the ground |
| Mark | apple, `scale(2.95)`, centred; `translate` set so its centre lands at 512,512 |

The sun's farthest edge is 353.6 + 105 = 458.6, over 409.6, so the rounded tile gets a separate maskable:
the same artwork on a square ground with no `rx`, scaled to 86% about the centre, putting the sun at 394.4.

## `theme_color`

`#10281a`, one value for `theme_color`, `background_color` and the `<meta name="theme-color">`.

## States and edge cases

No runtime states: these are static files. Edge cases to check: the favicon at 16, 32 and 48px; the 180
PNG has no transparent corners showing white on iOS (it is flattened onto the ground); the maskable's mark
and sun are inside the 409.6 circle.

## Measurements to record

`/develop` measures and writes into the registry: the sun, trail and mark against the ground, and the
sun distances above from the shipped SVG. Figures in this note are the proposal's, not shipped ones.

## New tokens

None. The ground, motif and trail colours belong to the artwork, as in cairn's and Thrive's SVGs.

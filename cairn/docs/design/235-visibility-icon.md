# 235 — the show/hide mark

Standing documents read first: [design-language.md](design-language.md)
(interaction states, hit targets, type scale),
[shell-and-content-model.md](shell-and-content-model.md),
[cairns.md](cairns.md) (the fixed icon set, and the drawing convention this
note reuses). Prior notes: [6-track-list.md](6-track-list.md),
[46-track-file-editing.md](46-track-file-editing.md) (the row's control
cluster), [48-interaction-states.md](48-interaction-states.md),
[193-trip-row-anatomy.md](193-trip-row-anatomy.md),
[199-row-control-tooltips.md](199-row-control-tooltips.md) (where meaning is
allowed to live).

## The whole issue in one sentence

The row already knows how to draw an eye — it draws one for the `viewpoint`
cairn — and the show/hide control should use **that** eye instead of asking the
operating system for one.

## The mark

**Visible: the eye. Hidden: the same eye with a slash through it.**

Both are a 24×24 `<svg>` drawn exactly the way `CairnIconGlyph` draws the fixed
icon set — `stroke: currentColor`, `fill: none`, `stroke-width: 1.9`, round
caps and joins. That is the whole reason this works: an SVG stroked in
`currentColor` inherits `--text-muted` at rest and `--text` on hover from the
button that contains it, which is precisely what the emoji could not do.

### The eye is the project's existing eye

The visible state uses the same geometry as the `viewpoint` icon in
`CAIRN_ICON_GLYPHS` — the almond and the pupil, unchanged:

```
M2.2 12s3.9-5.8 9.8-5.8S21.8 12 21.8 12s-3.9 5.8-9.8 5.8S2.2 12 2.2 12Z
M12 9.4a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2Z
```

**The app has one eye.** Whatever holds that path is read by both the cairn icon
set and this control, so the two cannot drift into a near-match — a near-match
is worse than either a match or a clear difference. Drawing a second, slightly
different eye for the toggle is the failure mode this rules out.

**The collision this accepts.** A cairn whose icon is `viewpoint` puts the same
drawing in the same list as this toggle. That is a real ambiguity and it is
accepted: the two differ in size, position and treatment (the cairn's eye sits
in its marker swatch at the row's leading edge; the toggle sits at the trailing
edge as a muted ghost button), and the alternative — inventing a second eye so
the two do not look alike — would make the app's drawing less coherent to fix a
problem no reader has reported.

### The hidden state

The eye, plus one stroke corner to corner:

```
M4.5 19.5 19.5 4.5
```

Same stroke width, same cap, same colour, part of the same glyph rather than a
second element layered on top.

- **No cut behind the slash.** The usual trick — a second stroke in the
  background colour, so the slash appears to pass in front — needs an opaque
  background, and these rows sit on a translucent `--surface` over a blurred
  map. A cut would paint a hard-edged smear of the wrong colour. At 18px with a
  1.9 stroke the slash reads clearly without one.
- **Not `🚫`, and not a second glyph.** The old hidden mark meant *prohibited*.
  A struck-through eye means *not shown*, which is what the control does.
- **The slash direction is bottom-left to top-right**, matching the `⤴` and the
  rest of the app's diagonals.

### Rejected

- **A different icon per state that is not an eye** — a closed eyelid, a
  crossed-out square. The eyelid is unreadable at 18px, and anything
  non-ocular loses the one-glance meaning the eye has.
- **Keeping the emoji and forcing colour** with `filter: grayscale()` or a
  text-shadow trick. It works on one platform and not the next, which is the
  problem being fixed.
- **Pulling in an icon library.** #235 put that out of scope, and it would be a
  large decision made as a side effect of a small one. The project already has
  a drawing convention; this uses it.

## Size and placement

Nothing about the row's geometry changes. The 40px hit target, the negative
vertical margin that absorbs it into the row's padding, the order of the
controls — all unchanged.

The glyph box inside that target is `--icon-sm` (see **New tokens**), which is
the optical size of the `⋮` beside it. The `⠿` handle stays at `--text-base`;
it is a text glyph and matching drawn-icon sizes to text sizes is what produced
the mismatch this issue is about.

```
⠿   ●   Holy Cross - Day 1 - Hike In        👁   ⋮
        5.1 mi                              ↑
                                            40px target, 18px glyph
```

## States

Every one of the six, per `design-language.md`. None of these is new behaviour —
they are what the CSS already declares and the emoji ignored.

| State | Treatment |
|---|---|
| Rest, visible | Eye, `--text-muted`, no fill |
| Rest, hidden | Struck eye, `--text-muted`, no fill. The row itself keeps its existing `track-row--hidden` treatment |
| Hover | Glyph to `--text`, `--hover` fill on the 40px button, `--motion-fast` |
| Pressed | `--pressed` fill, no transform, no scale |
| Focus | The global 2px `--accent` outline at 2px offset. Never overridden |
| Disabled | `opacity: 0.4`, `cursor: default`, no hover response — the disconnected case (#73), where the control renders and does not respond |

Selected does not apply: this is a toggle whose state is the glyph, not a
selection.

**The change between states is instant.** No cross-fade, no rotation, no
morph between the two paths. #49 licenses two motion effects and this is
neither; a visibility toggle that animates reads as slower than one that does
not, and this control is used in bursts.

## Copy

Unchanged, and it stays the only place the meaning is written out:

- Visible → `Hide <track name>`
- Hidden → `Show <track name>`

Supplied by `iconLabel()`, which puts it in both the accessible name and the
tooltip, per #199. The glyph itself stays `aria-hidden="true"` — it is
decoration over a labelled button, and announcing it twice is worse than not
announcing it.

On the cairn list's unattached toggle the wording follows the same pattern
against whatever that control names today; the mark and the states are
identical to the track row's.

## Edge cases

- **A very long track name.** Irrelevant to this control — it is `flex: none`
  and the name truncates before reaching it, as it already does.
- **Rapid repeat toggling.** Each press flips the glyph immediately. No
  animation means nothing to interrupt and no intermediate state to land in.
- **Disconnected (#73).** Disabled treatment, above. The glyph still shows the
  current state; it is not blanked.
- **Forced-colours / high-contrast mode.** A `currentColor` stroke inherits the
  forced text colour, which is another thing the emoji could not do. Nothing
  special is needed.
- **A row mid-drag.** The control keeps its rest treatment; the drag belongs to
  the handle.
- **The cairn list's toggle when there are no unattached cairns.** Unchanged by
  this issue — whatever it does today, it does with the new mark.

## New tokens

| Token | Value | For |
|---|---|---|
| `--icon-sm` | `18px` | The drawn-icon box inside a 40px row control. The first drawn icon in a row; every one after it uses this rather than borrowing a type step |

`--hit-target` already exists at 40px and is not restated here.

Adding `--icon-sm` is the visible decision this note is making about the system:
drawn icons get their own scale rather than sharing the type scale, because the
two are measured differently — a 15px type step and a 15px glyph box do not
look the same size, which is exactly the complaint that produced this issue.

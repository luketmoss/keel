# 529 — The muscle figure and the stretch figure on activity cards

Part of #525. Fills #528's visual slot for weight and stretch. Uses #526's
`--type-weight` and `--type-stretch`. Board A of the prototype
(https://claude.ai/artifact/3EKueKvLjDGy2Now8unv9m), whose figures were settled
with the owner on 2026-10-20 through several rounds. The geometry below is the
prototype's, with one addition: shoulder caps, because Shoulders is one of the
six tags and the prototype drew no shoulders. Implement it as written. Don't
redraw it.

**Why not sets:** set tracking against the plan is unreliable, and sets don't
matter to the owner. Nothing in this note shows a set count.

## Shared drawing rules

- One inline `<svg>` per figure, `viewBox="0 0 92 80"`, 92×80, filling the
  slot. `aria-hidden="true"` and `focusable="false"`.
- Every body part is a filled rounded `rect` or a `circle`. There are no
  strokes and no outlines. The block style is what makes the two figures read as
  a family.
- No tile background behind either figure. The card's surface shows through.
- Colours come from CSS (`fill: var(...)` through classes), never attributes,
  so forced colours can override them.

## The muscle figure

A front view (left, `translate(6 2)`) and a back view (right,
`translate(46 2)`), each drawn in a 40×76 box.

| Part | Shape (in its view's box) | Front region | Back region |
|---|---|---|---|
| Head | circle 20,7 r6 | never shaded | never shaded |
| Shoulders | circle 8,17 r3.5 and circle 32,17 r3.5 | shoulders | shoulders |
| Upper torso | rect 12,15 16×12 rx4 | chest | back |
| Lower torso | rect 13,28 14×13 rx3 | core | core |
| Upper arms | rect 5,16 6×12 rx3, and rect 29,16 6×12 rx3 | arms | arms |
| Forearms | rect 5,29 6×12 rx3, and rect 29,29 6×12 rx3 | arms | arms |
| Legs | rect 13,43 6.5×31 rx3, and rect 20.5,43 6.5×31 rx3 | legs | legs |

Shoulder circles are drawn after the upper arms, so they sit on top.

### Which regions are shaded

1. Take the workout's set rows (`sets` for its id), drop those whose section
   is `warmup`, and collect their distinct exercise ids.
2. For each exercise, split its `tags` on commas, trim the pieces, and
   lower-case them.
3. A region is **shaded** when any exercise carries its tag:

| Tag | Shades |
|---|---|
| chest | front upper torso |
| back | back upper torso |
| shoulders | all four shoulder circles |
| arms | upper arms and forearms, both views |
| core | lower torso, both views |
| legs | legs, both views |

Every other tag is ignored, including Push, Pull, Compound, Isolation, BB, DB,
FT and Warmup.

- **Colours:** shaded regions are `--type-weight`. Unshaded regions and the
  heads are `--color-border`. Shaded against unshaded measures 3.98:1 in light
  and 5.81:1 in dark, so the difference is in lightness, not hue alone.
- **No muscle tags:** when no region is shaded (no exercises, or none tagged
  with the six), the slot keeps #528's type-icon tile. An all-grey figure would
  claim "worked nothing".
- **Planned workouts** never get a figure. They only appear in Up next, which
  has no slot.

### Accessible name

#528's name gains ", worked " plus the shaded groups in this order:
shoulders, chest, back, arms, core, legs. They're joined like a sentence: "worked
back and arms", or "worked shoulders, chest and arms".

## The stretch figure

One figure, the same for every stretch session, in `--type-stretch`. It's a
standing side bend leaning right, one arm curved over the head and the other
along the side. The owner chose it over a line drawing and over a forward fold
("looked like a face palm" was fixed by keeping the upper arm beside the head).

Exact geometry, all inside
`<g transform="translate(46 77) scale(0.9) translate(-46 -76)"><g transform="translate(-2 2)">`:

```
rect 38.5,44 6.5×31 rx3  rotate(16 42 44)      left leg
rect 45,44   6.5×31 rx3  rotate(-16 48 44)     right leg
<g transform="rotate(18 45 44)">               upper body, leaning
  rect 37,16 16×12 rx4                          chest
  rect 38,29 14×13 rx3                          core
  circle 45,9 r5.5                              head
  rect 31,4  6×14 rx3  rotate(-8 34 18)         raised upper arm, beside the head
  rect 33,-8 6×13 rx3  rotate(55 36 4)          raised forearm, over the head
  rect 54,17 6×12 rx3  rotate(-8 57 17)         lower arm, upper
  rect 54,30 6×12 rx3  rotate(-8 57 17)         lower arm, fore
</g>
```

The stretch card's accessible name is unchanged from #528.

## Forced colours

Under `forced-colors: active`, shaded regions and the whole stretch figure are
`CanvasText`, and unshaded regions and heads are `GrayText`.

## States

The figures have none of their own. A workout whose exercises or sets are still
loading shows the type-icon tile until they arrive. It never shows an empty
figure.

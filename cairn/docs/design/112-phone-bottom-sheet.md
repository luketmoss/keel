# 112 — the bottom sheet on phone

The detents, what moves with the sheet and what does not, are normative in
[shell-and-content-model.md](shell-and-content-model.md). This note covers the
gesture, the conflicts it creates, and the states.

## The main path

1. Below the breakpoint the column renders as a sheet anchored to the bottom.
2. It opens at half: map above, list below, both usable.
3. Dragging the grabber moves the sheet with the pointer; releasing settles it
   on the nearest detent.
4. Activating a row swaps to that detail face at the detent the sheet is
   already at, promoting peek to half. (**Revised by
   [258](258-detail-keeps-its-detents.md)** — it used to take the sheet to
   full, which buried the map on exactly the trips worth opening.)
5. Back returns to the list face **at the detent the sheet was at before the
   detail opened**, not at full — which, after 258, means it undoes the peek
   promotion and nothing else. A drag the user made *inside* the detail is
   theirs and is never undone.

That last rule is the one that makes the sheet feel like a place rather than a
sequence of screens. Returning to full every time buries the map the user was
just looking at.

## The gesture, and what it collides with

Three things want a vertical drag inside the sheet: moving the sheet, scrolling
the list, and the map behind it.

- **The grabber owns the sheet.** A drag starting on it always moves the sheet.
- **The list owns its own scroll**, at every detent. A drag starting on a row
  scrolls; it never drags the sheet.
- **The map is untouched by anything inside the sheet.**

This is deliberately simpler than the iOS convention where a list scrolled to
its top starts dragging the sheet. That rule needs the scroll position, the
direction and the velocity to agree, and gets it wrong often enough to feel
broken. A grabber that always works is worth more than a gesture that usually
does.

**Settling.** A release settles on the nearest detent by distance, except that
crossing more than half the gap commits to the next one regardless of velocity.
No fling.

## States

| State | Sheet |
|---|---|
| Peek | `--sheet-peek`. Header, chips and the first row visible |
| Half | `--sheet-half`. The default |
| Full | `--sheet-full`. Map still visible above it — never 100% |
| Detail open | Unchanged, or half if it was at peek |
| Draft, queue or create open | Full, detents suspended |
| Dragging | Follows the pointer, no transition |
| Signed out | Half, with `Sign in to see your map.` |

**Full is not full-screen.** The sheet stops at `--sheet-full`, leaving the map
visible above. A sheet that covers everything is a page, and the whole argument
against the old full-bleed panel was that it stopped being a map app.

## Edge cases

**Rotation to landscape.** `--sheet-half` and `--sheet-full` are viewport-height
relative, so both shrink with the viewport. If `--sheet-peek` exceeds half the
viewport height, peek is dropped and the sheet cycles between half and full
only — a detent taller than the space it sits in is not a detent.

**The keyboard opening** while the search field is focused. The sheet goes to
full and stays there until the field blurs. Anything else puts the field under
the keyboard.

**A drop while the sheet is open.** The draft panel from #81 takes the sheet at
full, and the detents are suspended — a draft is a decision, not something to
peek at.

**Content shorter than the detent.** The sheet keeps its detent height and the
list simply ends. Sizing the sheet to its content would make every filter change
resize the map.

**Scroll position across detents.** Preserved. Changing detent is not a
navigation.

**`prefers-reduced-motion: reduce`.** Settling becomes a cut. The drag itself
still tracks the pointer — that is direct manipulation, not animation.

## Transitions

| What | Duration |
|---|---|
| Settling on a detent | `--motion-base` |
| List ⇄ detail face | `--motion-base` |
| Map controls tracking the sheet edge | `--motion-base`, same curve |

The map controls and the sheet must use the same duration and easing, or the
controls visibly lag the edge they are supposed to be attached to.

## Copy

No new strings. Every label is shared with the desktop column.

`aria-label="Resize sheet"` on the grabber, with `aria-expanded` reflecting
full. The detent is announced on change: `Peek`, `Half`, `Full`.

## New tokens

None new here. `--sheet-peek`, `--sheet-half` and `--sheet-full` are declared in
the standing document and added to `src/index.css` by #109.

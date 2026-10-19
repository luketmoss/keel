# 487 — The week strip: the viewed day as a filled tile

Part of #484; uses #485's tokens. Changes how #237's week strip looks. What it
marks (`calendar/marks.ts`, shared with the Calendar, #241), how it moves
(swipe a week, keyed by position so focus stays) and what it announces do not
change.

## Each day

A button, a column of three: weekday letter (`--text-xs`), date
(`--text-lg`, weight 600, `tabular-nums`), marks row (6px tall, kept on empty
days so the strip never jitters). Height: `--space-2xl` + `--space-md` (64), so
every tile clears the Keel-wide 44px target with room. Radius `--radius-lg`.
Gap between tiles `--space-xs`, as now.

| Day | Background | Letter | Number | Marks |
|---|---|---|---|---|
| ordinary | none | `--color-text-muted` | `--color-text` | `--color-text-muted` |
| today, not viewed | none | `--color-text-muted` | `--color-primary-text`, 700, underlined 2px, offset 3px (unchanged) | `--color-text-muted` |
| viewed (today or not) | `--color-primary-fill` | `--color-on-fill` | `--color-on-fill`, 700 | `--color-on-fill` |

Done is a filled dot, planned a ring (`box-shadow: inset 0 0 0 1.5px`), at most
three, as `markKinds` returns them.

Measured with the WCAG formula: `--color-on-fill` on `--color-primary-fill` is
4.91 in light and 6.72 in dark (#397's figures for the same pair), so the
number passes 4.5:1 and the marks pass 3:1.

On the viewed tile, today is no longer told apart by the underline's colour
(the whole tile is filled), so the number keeps its underline in
`--color-on-fill`: today stays recognisable without colour.

## States

Hover and pressed join #404's row family (`--state-hover` / `--state-pressed`
laid over the background, including the filled tile). Focus is the global ring,
offset so it clears the fill. Under `forced-colors: active` the viewed tile
draws `2px solid Highlight` and its text `HighlightText`; ordinary tiles have no
border, as now.

## Edge cases

- 320px wide: the existing rule (strip edge to edge, no gap) keeps each tile at
  least 44px wide; it is not changed.
- Seven days with three marks each: the marks row never wraps; three is the cap.
- The viewed day is in another week than today: no tile is underlined, as now.

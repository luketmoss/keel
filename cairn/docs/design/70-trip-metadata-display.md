# 70 — Trip metadata display

Tokens from [design-language.md](design-language.md). Header anatomy from
[35-trip-detail-view.md](35-trip-detail-view.md); row anatomy from
[33-trips-list.md](33-trips-list.md).

This note covers the **read** side of trip metadata only. Every editor —
click-to-edit name, status select, the two date inputs, the notes textarea — is
unchanged from #35, including when it opens and what it commits.

## The rule this note exists to enforce

**A metadata surface never states more than the record holds.** Three of the
four defects are the same mistake: a string that asserts a status, a date, or a
truncation the record does not support. Where the record is silent, the surface
says so plainly and stops.

## Dates

### Formatting

One helper, `formatTripDateRange(startDate, endDate)`, in `src/format/` beside
`units.ts` — both the header and the trips-list row call it, so the two can no
longer disagree.

Dates are **calendar days, not instants.** `2026-08-01` is parsed by splitting
on `-` and constructing a local date, never by handing the string to `Date`,
which reads it as UTC midnight and renders the day before at every negative
offset. This is the whole of the reported bug and the one line most worth a
test at several offsets.

### What it renders

| Record | Renders |
|---|---|
| both dates, same month | `Aug 1 – 5` |
| both dates, same year | `Aug 1 – Sep 3` |
| both dates, different years | `Dec 28, 2026 – Jan 2, 2027` |
| both dates, neither in the current year | `Aug 1 – 5, 2024` |
| start only | `From Aug 1` |
| end only | `Until Aug 5` |
| neither | `No dates set` |
| unparseable | the stored string, verbatim |

The year appears when it is not the current year, or when the two ends differ —
a trip list read in January should not show last August's trip as if it were
next week's. Within-year dates stay short, because that is the common case and
the row is narrow.

`–` is an en dash with hair spaces either side, matching the existing header.
The separator is not a hyphen: `Aug 1 - 5` reads as a subtraction in the
tabular numerals the language mandates.

**`No dates set` names no status.** Today's `Planned — no dates set` is wrong
half the time and redundant the rest: the status pill sits immediately to its
left and already says `planned` or `completed`.

Unparseable is a defensive case, not a designed one — a hand-edited `trip.json`
or a future format change. Showing the raw string is more useful than
`Invalid Date` and cannot throw.

### Where it renders

**Trip header** — unchanged position, immediately right of the status pill,
`--text-sm` in `--text-muted`, click-to-edit as today.

**Trips-list row** — replaces the hardcoded `No dates set` in the row's second
line, same `--text-xs` `--text-muted` treatment the row already uses. Not
clickable: the row is a link to the trip, and a second target inside it is the
kind of nested hit area the language's 40px rule exists to avoid.

```
┌────────────────────────────────────────┐
│  Holy Cross Wilderness      completed  │
│  Aug 1 – 5                             │
└────────────────────────────────────────┘
```

## Notes

### Clamped or not

`Show more` appears **only when the note is actually clamped** — measured, not
assumed. The clamped paragraph keeps its existing `-webkit-line-clamp`; after
layout, the control renders when `scrollHeight > clientHeight`, re-measured on
resize (a `ResizeObserver` on the paragraph, since the sidebar changes width on
rotation and the sheet is draggable in the language's target state).

Expanded, the control becomes **`Show less`** in the same position and returns
the paragraph to its clamped state. Today expansion is one-way, which is a dead
end on a long note in a panel that does not scroll independently.

Both are `--text-sm` in `--accent`, the language's one interactive colour, with
the standard focus outline. They are the same control in two states, not two
controls: nothing shifts position between them.

### States

| Note | Shows |
|---|---|
| empty | the existing empty click target, no control |
| whitespace only | treated as empty — `trim()` already governs this |
| short enough to fit | the note, no control |
| clamped | the note, clamped, `Show more` |
| clamped, expanded | the note in full, `Show less` |

A note that becomes short enough to fit — because the note was edited, or the
panel got wider — drops the control rather than leaving a `Show more` that does
nothing.

## Edge cases

**A trip whose dates change while the list is open.** Both surfaces read the
same record through the same store subscription, so they update together. There
is no independent formatting state to fall out of step.

**A range whose end precedes its start.** Rendered exactly as stored —
`Aug 5 – 1`. Validation is out of scope for this issue, and silently reordering
would hide a mistake the user can see and fix.

**A note expanded, then edited.** Committing an edit returns the note to its
clamped state, since the new text may be a different length and the control
re-measures against it.

**Very long single-word note.** Wraps with `overflow-wrap: anywhere`; the clamp
measures the wrapped result, so the control appears or not on what is actually
rendered.

## Copy

| Where | String |
|---|---|
| No dates, header and row | `No dates set` |
| Start only | `From Aug 1` |
| End only | `Until Aug 5` |
| Notes, collapsed | `Show more` |
| Notes, expanded | `Show less` |

## New tokens

None. Everything here uses `--text-xs`, `--text-sm`, `--text-muted` and
`--accent` as already defined.

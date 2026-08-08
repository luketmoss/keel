# 147 — status derived from dates, and today in the calendar

Tokens from [design-language.md](design-language.md). The picker's material and
the trip's place in the content model are normative in
[shell-and-content-model.md](shell-and-content-model.md); the picker's behaviour
is [111-trip-date-range-picker.md](111-trip-date-range-picker.md) and this note
does not change it.

**This note supersedes [127-status-control-styling.md](127-status-control-styling.md)
entirely.** That note specified a two-segment toggle for editing status. There
is no longer an editing state for status, so the control it describes ceases to
exist rather than being restyled again.

---

# Part one — status stops being a control

## The rule

A trip's **last day** is its `endDate`, or its `startDate` when it has no
`endDate`. If that day falls strictly before today, the trip is `completed`.
Everything else is `planned`.

| Trip | Reads |
|---|---|
| 3 – 7 Aug 2026, today is 8 Aug | `completed` |
| 3 – 8 Aug 2026, today is 8 Aug | `planned` — a trip ending today is not over |
| 5 – 12 Aug 2026, today is 8 Aug | `planned` — spans today |
| 14 – 16 Aug 2026, today is 8 Aug | `planned` |
| No dates | `planned` |
| Start only, 1 Aug 2026 | `completed` — the start is the last day it has |

## Main path

1. The trip header shows a status pill and a date line, exactly where they sit
   today.
2. The pill is **not clickable**. It is a label reporting what the dates say.
3. Activating the date line opens the range calendar, unchanged from #111.
4. `Done` commits the range. The pill updates in the same render — moving a
   trip's dates from last month to next month flips it from `completed` to
   `planned` with no second action.

## The pill

`trip-metadata__status` becomes a `<span>` rather than a `<button>`. Everything
about its shape is unchanged — `--radius-full`, `--text-xs`,
`var(--space-1) var(--space-2)` padding, `--muted-soft` background — so the row
does not shift.

What is removed is every affordance that promised interaction:

| Property | Was | Now |
|---|---|---|
| `cursor` | `pointer` | inherited (default) |
| `:hover` | `--hover` fill | none |
| `:active` | `--pressed` fill | none |
| Focus | reachable by Tab | not focusable |

The existing `--planned` / `--completed` colour treatment carries over
untouched. Note that the pill uses `--accent` for `planned` while the map dot
uses `--accent` fill for `completed` — that inversion predates this issue, and
correcting it is deliberately not part of it.

## States

| State | Treatment |
|---|---|
| Planned | `--muted-soft` fill, `--accent` text — unchanged |
| Completed | `--muted-soft` fill, `--text-muted` text — unchanged |
| Hover / pressed / focus | **none.** It is not interactive |
| Disabled (#73) | dims with `trip-metadata__fields--disabled`, as today |

**Why the pill still dims while disconnected**, even though a label is not
something you can be prevented from using: it sits in the same row as the date
line, and one dimmed field beside one bright label reads as a rendering fault
rather than as information. The block dims as a block.

## The three controls that go

| Where | What is removed |
|---|---|
| `TripMetadataHeader` | `StatusEditor`, the two-segment toggle, and the `editing === 'status'` branch |
| `TripsPanel` row menu | *Mark as completed* / *Mark as planned* |
| Import draft (`DraftPanel`) | its status control — removed for free, since it renders `TripMetadataHeader` over a synthetic trip |

**The trips-panel row menu stays, holding only *Delete trip…*.** A one-item
menu looks like an oversight, and the tempting fix is to promote delete to a
direct control on the row. That is the wrong trade here: the language requires
a destructive action to carry an inline confirm and a naming label, and keeping
delete behind the menu keeps a misfire two deliberate actions away rather than
one. The menu is the guard, not the container.

## Edge cases

**A trip you took but never dated** reads `planned`, permanently, and there is
no way to say otherwise. This is the accepted cost of the rule and not a state
to design around — the remedy is to give the trip dates, which is the thing the
user wanted to be easy in the first place.

**A session left open across midnight** can show yesterday's answer until
something re-renders. Status is computed at render from the current date; there
is no timer. A trip that became `completed` at midnight shows as `completed` the
next time the panel repaints, which in practice is the next navigation.

**A trip with an `endDate` but no `startDate`** — not reachable through the
picker, per #111, but possible in storage. It takes the `endDate` as its last
day, so the rule needs no special case.

**Filtering** by `planned` / `completed` in the trips panel is unchanged in
appearance and behaviour; it reads the derived value like every other surface.

---

# Part two — today in the calendar

## The treatment

Today's cell carries **a 4px round dot centred below the numeral**, in
`currentColor`.

```
   ┌──────┐
   │  8   │
   │  ·   │
   └──────┘
```

Drawn as a `::after` on `.date-range__day--today`, absolutely positioned against
a now-`position: relative` cell, so the numeral's flex centring is untouched and
no cell changes size. Diameter and offset from the bottom are both `--space-1`.

**`currentColor` is the whole idea.** The cell already guarantees its numeral
contrasts against whatever is behind it; a dot in the same colour inherits that
guarantee for free, in every combination, without a single hand-picked value.

## Why not the obvious alternatives

- **A ring or border** collides with the global 2px `--accent` focus outline,
  which the language forbids overriding. Two rings on one cell is unreadable.
- **Bold weight** is already the end-of-range treatment (`font-weight: 700`).
  Today plus an end would be indistinguishable from an end.
- **An accent fill** spends the one accent on something that is not
  interactive, which the language explicitly forbids.

## The combinations

| Cell | Dot resolves to | Against |
|---|---|---|
| Today, unselected | `--text` | cell background (none) |
| Today, a range end | `--on-accent` | `--accent` fill — 7.39, AAA |
| Today, inside a range | `--text` | `--accent-soft` |
| Today, focused | `--text` | outline sits outside the cell; no collision |
| Today, shown as an outside-month day | `--text-muted` at `opacity: 0.45` | dims with the cell, correctly — it is a hint about the grid |

That last row is deliberate: page forward a month and today appears in the
leading row as a neighbouring-month day. It keeps its dot and dims along with
the rest of the cell, because it is still true and still secondary.

## Accessibility

The cell's `aria-label` already reads as a full date. It gains a trailing
`, today`:

> `Saturday, 8 August 2026, today`

The dot is decorative and adds nothing to the accessibility tree.

Focus still enters the grid on the selected start, or on today when there is
none — #111's existing rule, unchanged, and now visibly consistent with the dot.

## What does not change

Everything in [111-trip-date-range-picker.md](111-trip-date-range-picker.md):
the pending range, `Clear` and `Done`, Escape and click-away discarding,
arrow keys and `PageUp`/`PageDown`, outside-month days staying selectable, the
readout's three shapes, and the six-row grid that never changes height. The
implementation behind them may be restructured freely; the behaviour is fixed,
and the existing tests are the contract.

---

## Copy

| Where | String |
|---|---|
| Status pill | `planned` · `completed` — lowercase, unchanged |
| Status pill `title` | `Set by the trip's dates` |
| Trips-panel row detail | `12 Jun – 19 Jun 2023 · completed` — unchanged |
| Today's cell `aria-label` | `<weekday>, <d> <month> <year>, today` |

The pill's `title` is the only new string. Someone who has been clicking that
pill for months will click it again; one hover answers why it no longer does
anything, without spending a line of the panel on it.

## Transitions

The pill loses its `--motion-fast` colour transition along with its hover and
pressed states — nothing about it animates any more.

**The pill does not flash on commit.** `TripMetadataHeader` flashes
`trip-metadata__field--saved` on the dates for 300ms, and the status changing is
a consequence of that same commit. Two flashes in one row reads as two things
happening.

## New tokens

None. The dot's diameter and offset are `--space-1`; every colour resolves
through `currentColor`. If the 4px dot reads heavy in review, the correction is
a named token here — not a raw value in the stylesheet.

# 111 — the trip date range picker

The picker's material — cell radius, span fill, end treatment, and that it opens
inside the panel — is normative in
[shell-and-content-model.md](shell-and-content-model.md). This note covers how
it behaves.

## The main path

1. Activating the trip's date line opens the calendar below it, inside the
   panel, showing the month of the current start date.
2. The first day chosen becomes a pending start; any existing range clears.
3. The second day completes the range. Chosen earlier than the first, it becomes
   the start and the first becomes the end — **the user picked two days, not a
   direction.**
4. `Done` commits and closes.

## The three shapes a trip's dates take

| Shape | Readout | Committed as |
|---|---|---|
| Full range | `12 Jun – 19 Jun 2023` | `startDate`, `endDate` |
| Picking | `12 Jun – pick the end` | nothing yet |
| None | `no dates set` | `null`, `null` |

The current pair of inputs cannot express the middle one at all, and expresses
the third only as two empty boxes. Being able to say "no dates" deliberately is
the point — a planned trip often has none.

**A single-day trip** is a range whose ends are the same day: choose the same
date twice. The cell takes the end treatment and no span is drawn.

## States

| State | Treatment |
|---|---|
| Rest | The date line, `--text-muted`, `cursor: text` |
| Open | Calendar below, `--surface-lift` |
| Day, in range | `--accent-soft` behind the cell |
| Day, an end | `--accent` fill, `--on-accent` text, weight 700 |
| Day, outside the month | `--text-muted` at `opacity: 0.45`, still selectable |
| Day, hover | `--hover` |
| Focused day | Global 2px `--accent` outline, never overridden |
| Disabled (#73) | `opacity: 0.4`, does not open |
| Save failed | `Couldn't save — dates reverted.` in `--danger` |

Days from the neighbouring month stay selectable. Greying a day the user can
still click is a hint about the grid, not a restriction.

## Edge cases

**A range crossing a year boundary.** The readout carries the end's year; the
row in the list shows both years when they differ.

**Month navigation across a year.** December → January increments the year, and
the reverse decrements it. The obvious bug and the one worth a test.

**Escape while picking.** Closes and discards, leaving the committed dates
untouched — including when a pending start was chosen. Consistent with every
other editor in `TripMetadataHeader`.

**Clicking away while picking.** Same as Escape. A pending start is not a value.

**A trip with an end but no start.** Not reachable through this control and not
produced by it. If one exists in storage, it opens as `no dates set` with the
end's month shown, so the next pick fixes it rather than preserving a shape the
model does not want.

**Keyboard.** Arrows move by day, `PageUp`/`PageDown` by month, `Enter` chooses.
Focus enters the grid on the selected start, or today when there is none.

**The panel is narrower than seven cells can fill comfortably.** Cells size from
the grid rather than a fixed width, so the calendar always fits
`--panel-width` minus padding. This is the whole reason the control exists;
nothing in it may have a minimum width in pixels.

## Transitions

Open and close over `--motion-fast`. The saved-underline flash on commit is
`TripMetadataHeader`'s existing 300ms fade and is unchanged.

## Copy

| Where | String |
|---|---|
| Empty date line | `Add dates` |
| Readout, complete | `12 Jun – 19 Jun 2023` |
| Readout, picking | `12 Jun – pick the end` |
| Readout, empty | `no dates set` |
| Actions | `Clear` · `Done` |
| Month nav | `aria-label="Previous month"` / `"Next month"` |
| Failure | `Couldn't save — dates reverted.` |

`Add dates` replaces today's clickable empty span, which renders as nothing at
all and is discoverable only by chance.

## New tokens

None. The picker is built from `--radius-full`, `--accent`, `--accent-soft`,
`--surface-lift`, `--text-xs` and the spacing scale.

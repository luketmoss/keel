# 642 — Library · Exercises tab

Part of #637. Prototype board "Library · Exercises"
(https://claude.ai/artifact/2jw8SJaaHJ15fcXxL3Gc8B). This note replaces the
body of `#/exercises` under #638's header and switch. The New and Edit
exercise screens are unchanged.

Earlier notes kept: #528's week rule and week-heading style, #485's card,
#404's interaction states, the focus handoff
(`data-focus-key="exercise:<id>"`), and today's filter rule (an exercise must
have **every** selected label: this tab narrows, while #641's picker widens).

## Order on screen

1. #638's header and switch
2. Search
3. Filter row
4. Count and sort line
5. Groups: a heading, then one card of rows
6. FAB (unchanged)

Blocks are `--space-sm` + `--space-xs` (12) apart. Groups have `--space-lg`
above each heading. The list ends with room to clear the FAB.

## Search

44px, full width, `--color-surface`, `--radius-md` + `--space-xs` (12), no
border, a 18px search icon in `--color-text-secondary`, and the placeholder
"Search 19 exercises" (the count of all exercises; "Search exercises" before
they load). Named "Search exercises". It matches the name, as today.

## Filter row

One row of `.filter-chip` pills that scrolls sideways (`.activities-chips`'
scroller), group named "Filter by label":

- **All:** first, with no dot. It is pressed (`.active`, `aria-pressed`) when
  no label is selected. Pressing it clears the selection.
- **One pill per label:** in today's `allTags` order. Each has an 8px dot in
  the label's colour (`getLabelColor` of its `color_key`, else
  `colorKeyFromName`), then the word. Pressing it toggles the label.

## Count and sort

One row, `--text-sm`:

- **Left:** "16 of 19 shown" in `--color-text-secondary`, or "19 exercises"
  when nothing filters. It sits in a polite live region, so a filter change is
  heard.
- **Right:** a text button, at least 44px tall, with a 16px sort icon then
  "Last used" or "A–Z", in `--color-primary-text` 600. It is named "Sort: last
  used" / "Sort: A to Z" and toggles between them. The choice is stored in
  `localStorage` `thrive.exerciseSort` (`'recent'` / `'az'`). The read and write
  are in `try/catch`, and anything unreadable means `'recent'`.

## Groups

### Last used (the default)

From `buildLastPerformedMap` (the latest workout date per exercise), with
#528's Monday-to-Sunday weeks in Denver dates:

| Heading | Holds |
|---|---|
| This week | last done in the week holding today |
| Last week | the week before |
| Earlier | before that |
| Not done yet | no date |

Within a group, most recent first, then by name. A group with nothing in it is
left out.

### A–Z

One group per first letter (upper-cased; a digit or symbol goes under "#",
first), by name within.

### Heading and card

- **Heading:** `.week-heading`. The `h2` holds the words; on the right is
  `.week-totals` "16 exercises" ("1 exercise"). A–Z headings have no count.
- **Card:** one Day card per group, `--color-surface`, `--radius-lg`, no
  border, padding 0 `--space-md`. Its rows are separated by hairlines
  (`--color-border-light`). It is not one card per exercise.

## Row

A `button` (replacing today's `div role="button"`), full width, at least
64px, `aria-expanded`, keeping `data-focus-key="exercise:<id>"`:

```
Bench Press BB                                Today  ›
● Push  ● Chest  ● BB
```

- **Name:** `--text-base` 600.
- **Labels:** under the name, a wrapping row, `--text-xs`
  `--color-text-secondary`, `--space-sm` + 2 (10) gap. Each is a 7px dot in
  the label's colour, then the word. No badges.
- **When:** on the right, `--text-xs` `--color-text-secondary`,
  `tabular-nums`: "Today", "Yesterday", the weekday ("Thu") within the last 6
  days, "Oct 8" this year, "Oct 8, 2025" earlier, or nothing when never done.
- **Chevron:** 16px, `--color-text-secondary`. It points right when closed,
  turns down when open, and doesn't rotate under reduced motion (it swaps).

### Open

Today's panel, unchanged in content and words: the last-time date, the set
table ("Set / Weight / Reps / Effort"), "No previous data", and Edit. It sits
inside the card under the row, on an inset `--color-bg` block,
`--radius-md`, padding `--space-sm` + `--space-xs`, `--space-sm` +
`--space-xs` margin below. Edit is a secondary button, at least 44px. Escape
closes, as today. One row is open at a time, as today.

## States

- **Loading:** today's treatment.
- **No exercises:** "No exercises yet." / "Tap + to add your first
  exercise.", as today, in `--text-sm` `--color-text-secondary`, centred. The
  filter row and sort are hidden.
- **Nothing matches:** "No matching exercises", centred, in place of the
  groups. The count line reads "0 of 19 shown".
- **Workouts not loaded:** every exercise sits in "Not done yet" in Last used,
  and regroups when they load. Focus is kept by focus key.

## Contrast

Existing pairs only: `--color-text`, `--color-text-secondary` and
`--color-text-muted` on `--color-surface` and `--color-bg`, and
`--color-primary-text` on `--color-bg`. The label dots are data colours beside
their words.

## Removed

The wrapping `LabelBadge` filter rows and row badges on this screen, the
"Last: Mar 10, 2026" line, `formatShortDate`'s use here, and
`.exercises-full-list`'s inline padding.

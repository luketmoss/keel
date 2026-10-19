# 486 — The Day header: a large title and an icon sync button

Part of #484; uses #485's tokens. Replaces the header drawn by #237 and the
sync line drawn by #409 (luketmoss/thrive#409). Their behaviour stays:
navigation, keyboard shortcuts, the focus hand-offs, `useSyncNow`,
`collapseSyncStatus` and `dayRequestEntries` are reused as they are.

## Layout

Top to bottom, inside the screen's existing `--space-md` padding:

1. **Meta line** — `--text-sm`, `--color-text-secondary`:
   `Mon, Oct 19` · sun icon · `7:12 AM – 6:15 PM`.
   The dot is a 3px `--color-text-muted` circle, `aria-hidden`. The sun icon is
   a #405-style drawn sun, 14px, `aria-hidden`, stroked in `--metric-calories`
   (a data colour; `--color-warning` would read as a status). The times are
   `sunLine(date).sunrise` and `.sunset`. The daylight-change sentence is
   dropped: it is the least looked-at line on the screen and Trends has no use
   for it either.
2. **Title row** — the `h1`, then, pushed right, the controls in this order:
   Today (only when not on today), ‹, ›, Calendar, Sync. Sync is last so the
   arrows never move when it changes state.
3. **Status lines** — only when there is something to say (below).
4. **Request lines** — the existing polite live region, unchanged in content.

## The title

| Viewed day | `h1` text | Screen-reader text |
|---|---|---|
| today | Today | "Today, October 19, 2026" |
| any other | the weekday ("Saturday") | "Saturday, October 17, 2026" |

`--figure-lg`, weight 700, `--color-text`, `letter-spacing: -0.01em`. The
relative pill ("Today", "Yesterday", "In 3 days") is removed: on today the title
says it, and on other days the meta line's date plus the Today button say it.

## The sync button

A 44×44 round icon button (`--radius-full`), no border, background transparent,
icon `--icon-md` in `--color-text-secondary`, joining #404's icon-button family
for hover, pressed and focus.

| State | Icon | Dot (8px, top right, 2px `--color-bg` ring) | Accessible name |
|---|---|---|---|
| Neutral status | sync arrows | `--color-success` | "Sync now, Synced 3:30 PM" |
| Stale / failed (tone ≠ neutral) | sync arrows | the tone's colour (`--color-warning` / `--color-danger`) | "Sync now, " + status text |
| No runs yet | sync arrows | none | "Sync now, Not synced yet" |
| Request open (`bothOpen` or `asking`) | arrows spinning (static under reduced motion) | none | "Syncing…", `aria-disabled="true"` |

The status text is `collapseSyncStatus(...).text`, the same words the old line
printed. `title` repeats the name for a mouse.

## Status and request lines

Under the title row, `--text-sm`:

- **When the tone is not neutral**, the status text and each vendor note are
  printed as today's line did, in their tone class. A problem is therefore
  always words, never only a dot.
- **When the tone is neutral**, nothing is printed: the age lives in the
  button's name.
- **Request lines** (`dayRequestEntries`) are printed below that, in the same
  `role="status" aria-live="polite"` container, with the same text and expiry as
  today ("COROS: Asking for a sync…", "Withings: Synced just now"). Lines only
  grow downward; nothing above them moves.

## Edge cases

- Narrow screens (320px): the title row wraps the controls below the title
  rather than shrinking any control under 44px; the existing `flex-wrap` stays.
- Long weekday ("Wednesday") with Today showing: the same wrap.
- Tapping Sync while open: no-op, as `aria-disabled` today.
- Midnight rollover while on `#/`: the title flips from the weekday to "Today"
  with the date; no announcement, as now.

## Removed

`.day-pill`, `.day-sun` and `.day-sync-btn`'s labelled pill. Tests that assert
on them are rewritten to the new names; none of the behaviours they cover is
dropped.

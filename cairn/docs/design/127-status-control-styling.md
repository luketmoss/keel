# 127 — Trip status control uses unstyled native select

Tokens from [design-language.md](design-language.md). Layout and the
click-to-edit pattern this replaces are from
[70-trip-metadata-display.md](70-trip-metadata-display.md) /
`TripMetadataHeader.tsx` — this note only changes what renders while
`editing === 'status'`; the pill in read mode, the click-to-edit trigger, and
the commit/cancel wiring are unchanged.

## Main path

1. Read mode: the status pill (`trip-metadata__status`) shows the trip's
   current status as today — unchanged.
2. Click the pill → edit mode. Today this swaps in a native `<select>`; it now
   swaps in a two-segment toggle showing both `planned` and `completed` inline,
   side by side, in that fixed order regardless of which is current.
3. The segment matching the trip's current status is shown Selected. Clicking
   the *other* segment commits immediately — same as the native select's
   `onChange` today, one click, no separate confirm step — and returns to read
   mode showing the new pill.
4. Clicking the already-selected segment does nothing (it's already the
   current value; no redundant commit).

## States

- **Rest (read mode)** — unchanged pill, per #70.
- **Editing, rest** — container is a single `--radius-full` pill shaped
  exactly like the read-mode pill it replaces (same height, so nothing shifts
  vertically when toggling edit mode), background `--surface-lift`, split into
  two segment buttons with no visible seam between them beyond the
  Selected fill.
- **Editing, segment selected** (matches trip's current status) —
  `--accent-soft` fill behind that segment, text `--accent`. This is the
  language's standard Selected treatment, same tokens the read-mode
  `planned` pill already uses.
- **Editing, segment unselected** — text `--text-muted`, no fill.
- **Hover** (unselected segment) — `--hover` fill, per the language's standard
  Hover state.
- **Pressed** — `--pressed` fill, no transform/scale, per the language.
- **Focus** — the standard global 2px `--accent` outline at 2px offset;
  segments are real `<button>` elements so this comes for free and Tab moves
  between the two.
- **Disabled** — inherited for free from the existing
  `trip-metadata__fields--disabled` wrapper (#73); no per-control disabled
  state needed.

## Edge cases

- **Escape** cancels edit mode with no change, same as the current
  `onKeyDown` handler on the select — carries over unchanged, just moved to
  fire on the toggle's container instead of a `<select>`.
- **Keyboard-only use**: Tab reaches the first segment, Tab again reaches the
  second, Enter/Space activates the focused segment (native button behavior,
  no custom key handling needed beyond the existing Escape case).
- No loading/error state specific to this control — save failures already
  surface through the shared `trip-metadata__error` line below the fields,
  unchanged.

## Transitions

Selection fill uses `--motion-fast` (120ms) color/background transition, same
as the language's default for hover/focus/color per
[design-language.md](design-language.md#motion). No layout animation — the
segment that becomes selected fills in place, nothing slides.

## Copy

Segment labels stay lowercase `planned` / `completed`, matching the existing
pill text exactly — no copy change.

## Layout detail

Container: `border-radius: var(--radius-full)`, `background: var(--surface-lift)`,
`display: inline-flex`, `padding: 2px` (the same relationship #33's map-filter
segments already use between an 18px outer and 14px inner radius — here the
outer pill keeps `--radius-full` and the inner segments do too, since a pill
has no straight edge for a smaller radius to read against).

Each segment: `padding: var(--space-1) var(--space-2)`,
`font-size: var(--text-xs)`, `border-radius: var(--radius-full)`, `border: none`
— i.e. exactly the padding and type size the current `trip-metadata__status`
pill already uses, so the control occupies the same footprint whether it's
showing one pill (read mode) or two segments (edit mode).

## New tokens

None. Everything above is expressible with tokens already defined in
[design-language.md](design-language.md).

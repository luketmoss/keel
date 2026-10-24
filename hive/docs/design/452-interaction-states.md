# 452 — All six interaction states, a focus ring everywhere, and gold fills that read in dark

Every interactive element in Hive answers six questions the same way: how it
looks at rest, hovered, pressed, focused, selected and disabled. This is
Thrive's #404 applied to Hive, with the places Hive genuinely differs marked.

Standing documents this answers to: the Keel-wide rules
([`keel-wide-rules.md`](../../../ui/docs/design/keel-wide-rules.md)) — all six
states; a focus ring of at least 2px and 3:1 that is never suppressed; reduced
motion honoured — and the suite language
([`suite-language.md`](../../../ui/docs/design/suite-language.md)). The
precedent is [`404-interaction-states.md`](../../../thrive/docs/design/404-interaction-states.md);
this note says "as Thrive" wherever it copies a decision and gives a reason
wherever it does not. It builds after #446 (the suite overlays and neutrals) and
#447 (the light primary), and is specified against Hive's code as it stands
today; the move into Keel is behaviour-identical.

## What is wrong today

Measured from `global.css` by parsing every rule and listing, for each control
class the TSX renders, which state selectors exist:

- **Hover:** 75 `:hover` rules, none inside `@media (hover: hover)`, so on a
  phone the last-tapped control keeps its hover fill. Four hovers move the
  control: `scale` on `.fab` (1.05), `.owner-circle` (1.08) and `.color-swatch`
  (1.1 and 1.15).
- **Pressed:** one `:active` rule in the file, and it is a cursor change. Pressed
  effectively does not exist.
- **Focus:** no global ring. 30 `:focus-visible` rules draw rings three ways
  (a 2px `outline` in `--color-primary` or `--color-focus`; the `--focus-ring`
  `box-shadow`; an inset outline), and 13 rules set `outline: none` or `0`. Of
  those 13, the fields (`.filter-search-input`, `.subtask-*-input`,
  `.form-field …`, `.label-form-input`, the date inputs) pair it with a border
  change and a halo; the rest are `.kebab-item`, `.card-title`, `.color-swatch`
  (each with a `box-shadow` ring) and `.card:focus-visible`, which swaps in a
  larger shadow and is not a ring. Every other control gets the browser default.
- **Disabled:** 8 rules, four opacities (0.3, 0.4, 0.5, 0.6) and two cursors.
  `.btn-ghost`, `.btn-icon` (except in the column settings), `.fab` and
  `.login-btn` have none.
- **Reduced motion:** no `prefers-reduced-motion` rule.
- **A hover that does not exist:** `.column-add-btn:hover` and
  `.column-add-row:hover` read `--overlay-hover`, which is never defined.
- **Dark fills that cannot be read:** five fills draw `white` on gold, 1.80:1 in
  dark (1.41 on their hover): `.fab`, `.user-avatar-placeholder`, `.filter-badge`,
  `.view-toggle-active` and `.filter-chip-due.filter-chip-active`.

## The states

Decided per **family**, not per class, so a new control inherits them.

| State | Treatment |
|---|---|
| **Rest** | As each component has it today. Unchanged, except the five fills' text colour below |
| **Hover** | Only under `@media (hover: hover)`. Filled buttons keep their existing `-hover` fill token. Everything else lays `--state-hover` over its own background. No transform |
| **Pressed** (`:active`) | `--state-pressed` laid over the control's background, filled buttons included, on touch too. No transform |
| **Focus** (`:focus-visible`) | The global ring below |
| **Selected** | Unchanged where it exists: the `.active`-style tint and its non-colour cue (tick, underline, bold label), and the control exposes it with `aria-pressed`, `aria-checked`, `aria-selected` or `aria-current`. Hover and pressed still apply on top |
| **Disabled** | `--opacity-disabled` on the control's content, `cursor: default`, no hover or pressed response. Applies to `:disabled` and `[aria-disabled="true"]` alike |

"Laid over" is a background layer, `background-image: linear-gradient(var(--state-hover),
var(--state-hover))`, so the control's own fill and its text contrast stay
underneath. In light the overlays darken and in dark they lighten (they are
`--overlay-sm` and `--overlay-md`, which are per theme in the suite file).

**Text colour moves with the overlay, for quiet and icon controls.** An overlay
under muted text costs contrast: muted `#606b76` is 4.06:1 on the page under hover
and 3.70 under pressed, and in dark `#868e98` is 3.66 on the card under pressed
(Thrive found this after shipping). So any quiet or icon control whose rest colour
is `--color-text-muted` or `--color-text-secondary` takes `--color-text` on hover
and pressed, which most of Hive's hovers already do (`.column-add-btn:hover`,
`.filter-popup-close:hover`). `--color-text` stays above 8.7:1 on both overlays (the tightest is dark, raised surface, pressed).

### The focus ring

```css
:focus-visible {
  outline: var(--focus-ring-width) solid var(--color-focus);
  outline-offset: var(--focus-ring-offset);
}
```

**`--color-focus`, not Thrive's `--color-text`.** Thrive chose the text colour
because twelve of its fourteen rings already used it. Hive's go the other way:
almost every ring it draws is in `--color-primary` or `--color-focus` (gold), so
a text-colour global ring would sit beside gold ones. After #447 the colour is
the right one: `#805F00` in light is 5.91 on white, 5.27 on the page, 4.88 or
more on all twelve pastels and 4.74 on the tightest tint; `#F5B700` in dark is
9.63 on the card, 8.48 on the raised surface and 7.21 on the darkest pastel. The
suite language already says rings are drawn in the primary colour.

The existing rings stay and override it where they are already 2px in the focus
colour. Two kinds are replaced or completed:

- `.card:focus-visible` (a larger shadow, no ring) loses its `outline: none` and
  gets the global ring.
- Inset rings (`outline-offset: -2px` on `.rail-item`, `.theme-toggle-btn`,
  `.kebab-item`) stay inset, where the container clips an outside ring.

**Suppression** stays as it is: form fields (border change in the primary colour,
5.91:1, and a 3px halo), and programmatic focus on non-controls. No new
exception.

## Families

Every control class the TSX renders belongs to one. The implementation lists
these in a test so a new class must be placed; a test fails if the TSX renders a
`<button>`, `<a href>`, `[role="button"]`, `[role="menuitem*"]`, `[role="radio"]`
or form-field class that is in none. Read from the interactive elements in the
TSX. Building it placed what the first reading missed: `.subtask-menu-item` (the
sub-task menu's buttons had no class), `.completed-date-btn` and four fields;
and removed what is no longer rendered anywhere (`.control-bar-chip-more`,
`.control-bar-chip-remove`, `.due-clear-btn`, `.view-toggle-btn`,
`.upcoming-card`, whose CSS is dead). `.card` is a `<div>` with `onClick`, not a
keyboard control, so it is in the table for its pointer states and the test
exempts it from "rendered as a control".

| Family | Classes |
|---|---|
| Filled buttons | `.btn-primary`, `.btn-danger`, `.fab`, `.login-btn`, `.filter-popup-apply` |
| Quiet buttons | `.btn-ghost`, `.share-archive-board-btn`, `.filter-popup-reset`, `.column-archive-link`, `.toast-action`, `.label-new-pill`, `.column-settings-add-btn`, `.column-settings-name`, `.subtask-date-add-inline`, `.overflow-menu-btn`, `.login-link` (#609) |
| Icon buttons | `.btn-icon`, `.btn-icon-danger`, `.kebab-trigger`, `.subtask-kebab-btn`, `.subtask-action-btn`, `.subtask-add-circle`, `.archive-search-clear`, `.filter-search-clear`, `.filter-popup-close`, `.share-remove-btn`, `.staged-subtask-remove`, `.label-gear-btn`, `.column-add-btn`, `.column-settings-delete-btn`, `.date-clear-btn` |
| Chips and toggles | `.filter-chip`, `.filter-toggle`, `.label-toggle`, `.theme-toggle-btn`, `.color-swatch`, `.column-color-swatch`, `.column-settings-swatch`, `.icon-swatch`, `.quick-date-chip`, `.owner-circle`, `.status-chevron`, `.check-icon`, `.subtask-date-inline` |
| Rows and cards | `.card`, `.card-title`, `.archive-item`, `.kebab-item`, `.overflow-menu-item`, `.subtask-menu-item`, `.subtask-title`, `.editable-value`, `.due-date-btn`, `.completed-date-btn`, `.column-add-row` |
| Navigation | `.bottom-nav-tab`, `.rail-item`, `.settings-row`, `.settings-tab`, `.column-indicator-dot` |
| Fields | `.filter-search-input`, `.subtask-add-input`, `.subtask-add-date`, `.subtask-title-input`, `.label-form-input`, `.board-switcher-select`, `.column-sort-select`, `.archive-search-input`, `.profile-email-input`, `.due-date-hidden`, `.column-settings-name-inline`, `.column-settings-name-input`, `.column-settings-delete-select` — keep their focus treatment, gain the disabled state. Radios and checkboxes carry no class and are fields too; so is every input inside a `form-field` wrapper, which styles it |

Selected applies to chips and toggles, the navigation tabs, `.check-icon`,
`.status-chevron`, `.owner-circle`, `.overflow-menu-item` (checked) and
`.label-toggle`. Everything else has five states. Hive's menus use
`role="menuitemradio"` for the group-by choices: they expose `aria-checked`.

## The dark-mode fills

The five fills above change their text from the literal `white` to
`var(--color-on-primary)` (#447): white in light, where nothing changes (5.91 on
`#805F00`), and `#1f1f1f` in dark: **9.15:1** on `#F5B700` and **11.68** on the
hover `#FFD54F`, against 1.80 and 1.41. The icon glyph inside the avatar, the
badge count and the FAB's "+" follow. This is a visible change to dark mode
(white marks on gold become near-black), and the user has accepted it.

**What this does not fix.** Dark `.btn-danger` is white on `#ef5350`: 3.49:1 at
rest, 3.19 hovered and 3.05 pressed. It is not one of the fills named, so it is
recorded here and left alone; its dark hover and pressed use the existing
`--color-danger-hover` fill with no extra overlay, so this change does not
lower it further. The suite's `--color-on-fill` (5.37 there) is the fix, and a
follow-up.

## Edge cases

- **A busy button** (Create while saving) is `disabled`, so it dims; its label
  change stays. The dimming is what says "not now".
- **`aria-disabled`** (the sub-task add confirm, the kebab's disabled items) stays
  focusable and its ring is not dimmed: opacity on the element would fade its own
  outline, so the content is dimmed and the control keeps an undimmed ring.
- **Hover on a selected chip:** the overlay sits on the selected tint; the cue
  stays.
- **Cards are drag sources.** `cursor: grab` under `(pointer: fine)` is kept. The
  card's hover shadow stays, and its pressed state is the overlay only; a card in
  a drag is not "pressed".
- **Pressed on the card's children** (title button, kebab) stays on the child, not
  the card.
- **`.kebab-trigger`** is invisible (`opacity: 0`) until the card is hovered or
  focused on fine pointers. Focus must make it visible, or a keyboard user has a
  ring on nothing: `:focus-visible` forces `opacity: 1`.
- **Forced colours:** outlines survive on their own; there is no forced-colours
  block in Hive today and none is added.
- **Reduced motion.** The four hover transforms are removed (this is how pressed
  and hover stop moving). The spinner, the toast slide and the panel width
  transition are a separate fix.
- **Touch-target sizes** are #453's, not this issue's.

## Transitions

Hover and pressed overlays change within `--transition-fast` as the control
already transitions `background`. Nothing new moves.

## Tests

- `interaction-states.test.ts` reads the Families table above and the stylesheet:
  every class is in exactly one family; every `:hover` is inside `@media (hover:
  hover)`; no hover or pressed state uses `transform`; every disabled treatment
  uses `--opacity-disabled`; `[aria-disabled="true"]` is dimmed like `:disabled`;
  `--overlay-hover` is gone.
- Contrast, in both themes: the ring on every surface in the note, the five fills'
  text at rest, hover and pressed, quiet controls' text on hover and pressed.
- It resolves the cascade per control and state (jsdom's `matches()` with data
  attributes standing in for `:hover`, `:active`, `:focus-visible`), as Thrive's
  does; a regex cannot say which rule wins.
- The existing Hive suite passes, including the #190 assertions #447 edited.

## Copy

None.

## New tokens

In Hive's `:root`, the names Thrive uses:

| Token | Value | For |
|---|---|---|
| `--state-hover` | `var(--overlay-sm)` | the layer over a control on hover |
| `--state-pressed` | `var(--overlay-md)` | the same, while pressed |
| `--opacity-disabled` | `0.4` | every disabled control's content; replaces 0.3, 0.4, 0.5 and 0.6 |
| `--focus-ring-width` | `2px` | the global ring, the Keel-wide minimum |
| `--focus-ring-offset` | `2px` | the global ring's offset; inset rings keep `-2px` |

Whether these join the suite stylesheet is that file's decision, as in Thrive.

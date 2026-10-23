# 404 — All six interaction states, and a focus ring everywhere

Every interactive element in Thrive answers six questions the same way: what
it looks like at rest, hovered, pressed, focused, selected, and disabled.

Standing documents this answers to: the Keel-wide rules
(`ui/docs/design/keel-wide-rules.md`, #401) — all six states; a visible focus
ring, at least 2px and 3:1, never suppressed; reduced motion honoured — and
the suite language (`ui/docs/design/suite-language.md`, #400) for tokens.
Cited as paths because neither exists until its issue merges.

## What is wrong today

Measured from `frontend/src/global.css` by listing, for each control class the
TSX renders, which state selectors exist for it (comments stripped, every
selector in every rule, scoped selectors such as `.day-screen .x:hover`
included):

- **`.btn` has no disabled state.** `.btn-primary` and `.btn-danger` are
  rendered `disabled` while busy (Save, Delete Workout, Start) and look exactly
  as clickable as at rest. This is the bug the issue is named for.
- **`.btn-secondary` has no hover**, and no `.btn` variant has a pressed state.
- **Five different disabled treatments**: opacity 0.6 (`.login-btn`), 0.5
  (`.btn-ghost`), 0.25 (`.reorder-btn`), 0.7 (`.sync-status-bar`), 0.3
  (`.exercise-toolbar-btn`), with `cursor` sometimes `default`, sometimes
  `not-allowed`.
- **No global focus ring.** Fourteen components draw their own (the
  `focus-contrast.test.ts` audit table) and pass 3:1. Everything else — every
  `.btn`, the bottom nav, the FAB, Back, the chips, the icon buttons — gets the
  browser's default, which differs per browser and is not checked by anything.
- **Pressed is a transform where it exists**: `.type-card:active` scales to
  0.97 and `.fab:hover` to 1.05, both of which move under reduced motion.
- **Hover sticks on touch.** No hover rule is inside `@media (hover: hover)`,
  so on a phone the last-tapped control keeps its hover fill.

## The states

The treatment is decided per **family**, not per class: a new control joins a
family and inherits its states.

| State | Treatment |
|---|---|
| **Rest** | As each component specifies today. Unchanged. |
| **Hover** | Only under `@media (hover: hover)`. Filled buttons keep their existing `-fill-hover` token. Everything else — ghost, secondary, icon buttons, rows, cards, chips, nav tabs — lays `--state-hover` over its own background. |
| **Pressed** (`:active`) | `--state-pressed` laid over the control's background, filled buttons included. No transform, no scale — `.type-card` and `.fab` lose theirs. Applies on touch too, which is where it matters. |
| **Focus** (`:focus-visible`) | The global ring below. |
| **Selected** | Unchanged where it exists: chips and toggles keep their `.active` tint *and* their non-colour cue (the `.chip-check` tick, the bottom tab's inset bar and bold label, #182). A selected control also exposes it — `aria-pressed`, `aria-checked` or `aria-current`, as each already does. Hover and pressed still apply on top. |
| **Disabled** | `--opacity-disabled` on the control's content, `cursor: default`, and no hover or pressed response. Applies to `:disabled` and `[aria-disabled="true"]` alike. The focus ring of an `aria-disabled` control (which stays focusable, #328) is not dimmed. |

"Laid over" means a background layer — `background-image:
linear-gradient(var(--state-hover), var(--state-hover))` — so the control's
own fill stays underneath and the text on it keeps its contrast. In light the
overlays darken; in dark they are white and lighten. On every filled button
that moves the fill *away* from its text, so the text contrast the #183 tests
assert can only rise.

### The focus ring

One rule for everything:

```css
:focus-visible {
  outline: var(--focus-ring-width) solid var(--color-text);
  outline-offset: var(--focus-ring-offset);
}
```

`--color-text` because it is the one colour at least 3:1 against every
surface a control sits on, in both themes — measured with the WCAG formula:
light `#1f1f1f` 14.70 on `--color-bg`, 16.48 on `--color-surface`, 13.68 on
`--color-border-light`, 8.51 on the darkest calendar shade; dark `#e8eaed`
15.54 on `--color-bg`, 14.39 on `--color-surface`, 12.68 on
`--color-surface-raised`, 7.42 on the darkest calendar shade. It is also what
twelve of the fourteen existing rings already use; the other two are the Day
and Calendar screens' `--color-primary-text` rings.

The fourteen audited rings stay as they are — they override this one, and all
pass. Rows and cards whose container clips an outside ring keep their existing
inset (`-2px`) offset.

**Suppression** stays as `focus-contrast.test.ts` lists it: form fields
(replaced by a border and halo, #183), and programmatic focus on non-controls
(`[data-route-focus]`, `.app-content`, `.panel-status`, `.trends-state`,
`.day-panel-title` on mouse focus). The rule allows exactly that exception and
no new one is added.

## Families

Every control class the TSX renders belongs to one. The implementation lists
these in a test so a new class must be placed.

| Family | Classes |
|---|---|
| Filled buttons | `.btn-primary`, `.btn-danger`, `.fab`, `.login-btn` |
| Quiet buttons | `.btn-secondary`, `.btn-ghost`, `.template-editor-back`, `.login-link`, `.filter-clear`, `.manage-labels-link`, `.day-today-btn`, `.training-plan-link`, `.detail-coros-link` |
| Icon buttons | `.btn-icon`, `.modal-close`, `.day-arrow`, `.set-remove-btn`, `.compact-card-remove`, `.last-time-close-btn`, `.copy-down-btn`, `.reorder-btn`, `.exercise-toolbar-btn`, `.manage-label-delete`, `.day-sync-btn`, `.sync-now-btn`, `.detail-icon-btn` |
| Chips and toggles | `.filter-chip`, `.label-chip`, `.tag-badge` (as a button), `.effort-btn`, `.sub-type-btn`, `.theme-toggle-btn`, `.trends-group-btn`, `.trends-chip`, `.trends-view-btn`, `.trends-menu-item`, `.detail-menu-item`, `.library-switch-btn`, `.color-swatch`, `.section-badge-btn`, `.section-picker-pill`, `.week-day` |
| Rows and cards | `.exercise-list-item`, `.create-new-row`, `.template-card`, `.workout-card`, `.compact-card-body[role="button"]`, `.type-card`, `.trend-row-link`, `.trend-open-day`, `.calendar-open-day`, `.calendar-day`, `.manage-label-name`, `.add-set-btn`, `.sync-status-bar`, `.settings-btn`, `.exercise-list-item-header`, `.settings-row-link`, `.day-card-link`, `.lift-check`, `.lift-set-btn`, `.lift-choice-card` |
| Navigation | `.bottom-nav-tab` |
| Fields | `.form-input`, `.form-select`, `.form-textarea` — keep their #183 focus treatment; gain the disabled state. |

Selected applies only to chips and toggles, the bottom nav, `.calendar-day`
and `.color-swatch`. Everything else has five states.

Six classes were placed during development (#404), because the TSX renders
them as controls and the table above had missed them: `.detail-coros-link`
(a link, quiet), `.section-badge-btn`, `.section-picker-pill` and `.week-day`
(each toggles or is selected, chips), and `.exercise-list-item-header` and
`.settings-row-link` (`role="button"` rows). `interaction-states.test.ts`
reads this table and fails if the two disagree.

## Edge cases

- **A busy button** (Save while saving) is disabled, so it dims. Its label
  change ("Saving...") stays; the dimming is what says "not now".
- **A disabled control with a tooltip or explanation** (`.day-sync-btn` while
  a sync is running): it stays focusable via `aria-disabled` and keeps its
  ring, so the explanation is still reachable by keyboard.
- **Hover on a selected chip**: the overlay sits on the selected tint; the
  tick and the tint remain.
- **Forced colours**: the existing `@media (forced-colors: active)` block is
  untouched. The outline ring survives forced colours on its own.
- **Reduced motion**: nothing in this note moves. Removing the two scale
  transforms is how the pressed state stops moving.

## Transitions

Hover and pressed overlays change instantly or within `--transition-fast` as
the control already transitions `background`; no new animation.

## Copy

None. No string changes.

## New tokens

In Thrive's `:root`:

| Token | Value | For |
|---|---|---|
| `--state-hover` | `var(--overlay-sm)` | the layer laid over a control's background on hover |
| `--state-pressed` | `var(--overlay-md)` | the same, while pressed |
| `--opacity-disabled` | `0.4` | every disabled control's content. Alpenglow's value; replaces the five values in use |
| `--focus-ring-width` | `2px` | the global ring; the Keel-wide minimum |
| `--focus-ring-offset` | `2px` | the global ring's offset; the inset rings keep `-2px` |

They are Thrive's for now. Whether they join the suite stylesheet (#402) is
that file's decision, not this issue's.

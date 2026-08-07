# cairn design language

Standing reference, not an issue note. Every other file in this folder covers
one issue; this one covers all of them, which is why it has no number. Per-issue
notes reference tokens from here by name instead of restating values.

**It supersedes the Tokens section of [2-map-shell.md](2-map-shell.md), colours
included.** That is a real change to shipped surfaces, not a tidying pass — the
blue-accented dark chrome from #2 becomes a warmer system, and every screen
built between #2 and #37 shifts with it. Chosen deliberately from five
proposals; the four that lost are recorded at the bottom so the choice does not
get quietly re-litigated.

## The idea

**Cold ground, one warm light.** Alpenglow is the last sun on a peak after the
valley has gone blue — a cold, shadowed field with a single warm source on the
high edges. The palette is that photograph: a blue-violet dark ground carrying
one orange accent, and nothing else competing for attention.

Underneath it sits the rule the app already followed: **chrome floats over a
map.** The map is the content; everything else is a panel above it. Together
those two sentences decide most of what follows — why the ground is cold, why
there is exactly one accent, why surfaces lift instead of butting together, and
why the page never scrolls.

Nothing here is Material, Fluent, or any other vendor language. Those exist to
give large teams a shared vocabulary across products that must look related.
Cairn is one app with one user, and the cost of importing a vocabulary is a
runtime plus a house style that is not ours.

## Colour

Every pair below was checked against WCAG. The full table is under Contrast.

| Token | Value | Use |
|---|---|---|
| `--ground` | `#121523` | the field behind everything; map fallback |
| `--surface` | `#1B1F33` | panels, sheets, cards |
| `--surface-lift` | `#262B42` | inputs, pressed rows, selected segments |
| `--text` | `#F1F3FA` | primary |
| `--text-muted` | `#8D93B0` | secondary, counts, units, timestamps |
| `--border` | `rgba(255,255,255,.07)` | seams where a panel meets the map |
| `--accent` | `#FF7A4D` | interactive, selected, focus, completed routes |
| `--on-accent` | `#1B0C05` | text and icons on an accent fill |
| `--danger` | `#FF4E6A` | destructive actions, parse failures |

**One accent, and it is spent on interaction.** Not on headings, not on
decorative rules, not on the brand mark. If everything can be orange then
nothing reads as clickable, and the whole reason the ground is cold is to leave
that one colour somewhere to land.

**Derived states are mixed, never hand-picked.** #33 already does this for
status pills; the rest follows the same form so a palette change propagates
instead of needing a search.

| Token | Value |
|---|---|
| `--accent-soft` | `color-mix(in srgb, var(--accent) 16%, transparent)` |
| `--muted-soft` | `color-mix(in srgb, var(--text-muted) 18%, transparent)` |
| `--hover` | `color-mix(in srgb, var(--text) 6%, transparent)` |
| `--pressed` | `color-mix(in srgb, var(--text) 12%, transparent)` |

A new hex literal in a component stylesheet is a bug. The exceptions are track
polyline colours, which are data rather than chrome, and are assigned by #5.

### Danger cannot rely on colour

`--danger` and `--accent` sit about thirty degrees apart and are close to
identical under red-green colour blindness. **Colour is therefore not permitted
to be the only signal on a destructive action.** Every one of them also carries:

- the inline confirm step `TripList` already implements, never a bare click
- a text label naming what is destroyed — "Delete trip", not a bin glyph alone
- no accent fill anywhere in the same row, so the two never sit side by side

This is the one place the language spends words instead of colour, and it is
worth it. A misfired delete is not recoverable from Drive.

### Contrast

| Pair | Ratio | |
|---|---|---|
| `--text` on `--surface` | 14.68 | AAA |
| `--accent` on `--ground` | 7.04 | AAA |
| `--on-accent` on `--accent` | 7.39 | AAA |
| `--accent` on `--surface` | 6.31 | AA |
| `--text-muted` on `--surface` | 5.37 | AA |
| `--danger` on `--surface` | 5.08 | AA |
| `--text-muted` on `--surface-lift` | 4.60 | AA |

The last row is the tightest in the system. Any future change to
`--text-muted` or `--surface-lift` re-checks it before landing.

## Scale

Three scales, all of them short. The stylesheets today carry seven distinct
border radii, eight font sizes, and fifteen padding pairs — none of it decided,
all of it arrived at one component at a time.

**Spacing** — 4px grid. `10px` and `14px` are the two off-grid values in the
codebase and both resolve up.

| Token | Value | Typical |
|---|---|---|
| `--space-1` | `4px` | icon gap, label-to-value |
| `--space-2` | `8px` | inline gaps |
| `--space-3` | `12px` | tight control padding |
| `--space-4` | `16px` | default control padding |
| `--space-5` | `18px` | row and panel padding |
| `--space-6` | `24px` | empty-state padding |
| `--space-8` | `32px` | page padding |

Alpenglow is the roomiest of the proposals and `--space-5` is why it exists:
rows and panels breathe at 18px in a way they do not at 16px, and rounding it
down to the grid is the one place where the grid loses.

**Radius** — generous, and three values. Nested radii are computed, not chosen:
an inner radius equals the outer radius minus the gap between them, which is
what makes the map filter segments `14px` inside an `18px` container padded
by `4px`.

| Token | Value | Use |
|---|---|---|
| `--radius-sm` | `10px` | inputs, buttons, segments, icon buttons |
| `--radius-md` | `18px` | floating panels, cards, sheets |
| `--radius-full` | `999px` | status pills, track swatches |

There is no square corner anywhere in this language. A 2px radius reads as an
oversight next to an 18px card, so the small step is 10px and not smaller.

**Type** — five steps, system stack, 1.45 line height. Weight is 400 or 700 and
nothing between; the mid-weight 600 currently used on titles goes away, because
at 700 against a 400 body the hierarchy carries without needing size.

| Token | Value | Weight | Use |
|---|---|---|---|
| `--text-xs` | `12px` | 400 | units, point counts, pill labels |
| `--text-sm` | `14px` | 400 | nav, secondary actions, stats |
| `--text-base` | `15px` | 400 | body, row titles, inputs, buttons |
| `--text-lg` | `18px` | 700 | panel and section titles |
| `--text-xl` | `24px` | 700 | page headings |

Titles carry `letter-spacing: -0.01em`; nothing else is tracked. All numerals
are `font-variant-numeric: tabular-nums` in a monospace face — a track's
distance and gain sit in a column and must not shift width as they update.

`11px`, `13px`, `16px`, and `20px` are dropped.

## Elevation

Three levels, and unlike the other proposals this language **uses shadow**.
Depth comes from material, and shadow is what separates a lifted surface from
the map beneath it.

- **L0 — field.** The map, or `--ground` where there is no map. Never blurred,
  never bordered, never shadowed.
- **L1 — docked chrome.** `--surface`, `backdrop-filter: blur(20px)`, and a 1px
  `--border` on the edge it meets the field along. No shadow: it is attached,
  and a shadow on an attached edge is a lie. The sidebar.
- **L2 — lifted chrome.** Same material, plus `--radius-md` and
  `0 10px 30px rgba(6,8,18,.55)`. No border — it touches no edge, so it needs no
  seam. The map filter row, the trip totals card, and any future sheet, menu,
  or toast.

**The shadow is deep, diffuse, and cold, never tight.** A short dark shadow over
satellite imagery reads as a smudge on the lens; a long soft one at low opacity
reads as recession. If a shadow is ever visible as an outline it is wrong. This
is the single easiest thing to get wrong in this language and the reason the
value is a token rather than a per-component decision.

**Blur only over the map.** `backdrop-filter` over a flat `--ground` region
composites a blur of a solid colour: no visual difference, a real GPU cost, and
a promise of depth the layout does not keep. `/trips` is the case that gets this
wrong today by rendering full-bleed solid where the map should still be behind
it — see Navigation.

## Interaction states

Every interactive element defines all six. Most components today define hover
and stop, which is how a disabled button ends up looking clickable.

| State | Treatment |
|---|---|
| Rest | as specified |
| Hover | `--hover` fill on rows and ghost buttons; `--text` on muted icon buttons |
| Pressed | `--pressed` fill, no transform and no scale |
| Focus | 2px `--accent` outline at 2px offset — global in `index.css`, never overridden |
| Selected | `--accent-soft` fill with `--accent` text |
| Disabled | `opacity: 0.4`, `cursor: default`, no hover response |

Hit targets are at least 40px square, up from the 24px the icon buttons use
today. Alpenglow is the proposal that assumes a phone in one hand, and 24px does
not survive that. Rows are 44px minimum on touch.

## Motion

The most animated of the five proposals, which makes restraint a written rule
rather than an instinct.

| Token | Value | Use |
|---|---|---|
| `--motion-fast` | `120ms` | hover, focus, colour |
| `--motion-base` | `180ms` | panels, sheet detents, route transitions |
| `--motion-slow` | `280ms` | map camera, bounds fitting |
| `--ease` | `cubic-bezier(.2,0,0,1)` | all of the above |

Two effects are licensed beyond state changes, and no others without a decision
recorded here:

- **Route draw-on.** A newly imported track draws along its own length over
  `--motion-slow`, once, on first appearance. It is the app confirming it
  understood the file, which is the moment that most needs confirming.
- **Active-track glow.** The selected track's polyline carries
  `drop-shadow(0 0 7px)` in its own colour. Only one track at a time, and only
  on explicit selection — a glow on everything is a glow on nothing.

Transition named properties, never `all` — `all` animates layout properties you
did not mean to and is the usual cause of a panel that appears to slide when it
should cut.

Everything collapses under `prefers-reduced-motion: reduce`, **including the map
camera and the route draw-on**, which #5's bounds fitting already flagged as the
first real case:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 1ms !important;
    transition-duration: 1ms !important;
  }
}
```

## Navigation

Alpenglow assumes the sheet is the navigation, and this section used to sketch
what that meant. **It no longer specifies anything.**
[shell-and-content-model.md](shell-and-content-model.md) is the standing
reference for layout, navigation, and the mobile sheet, and it supersedes what
stood here: one live map for the session, the column and its faces, and the
peek / half / full detents this language's radii and targets were always sized
for.

That file decides what cairn *contains* and *where it goes*. This one decides
what it is *made of*. A change that needs both says so.

Two ideas are not covered there and belong to nobody yet:

- **A shared-element view transition.** React Router 7 exposes the View
  Transitions API through `<Link viewTransition>`, so a trip's name could carry
  a `view-transition-name` and visibly move into the detail header rather than
  the panel repainting. Not adopted with the shell rebuild and not scheduled —
  it needs its own issue before it means anything.
- **A command palette**, deliberately not adopted. It earns its place at a few
  dozen trips, and cairn has a handful.

## Applying this

The tokens above are the target, not the current state, and the gap is larger
than a rename — the accent hue, the base font size, the radii, and the hit
targets all move. Three follow-ups, in order, each its own issue:

1. **Define the tokens and repoint the stylesheets.** Add the custom properties
   to `index.css` and migrate the component stylesheets onto them. Mechanical,
   and the only issue where a large visual diff is expected with no behaviour
   change.
2. **Fill in the missing interaction states**, including the 40px targets and
   the destructive-action rules above. This is where real bugs are hiding.
3. **Motion and elevation.** The shadow tokens, the two licensed effects, and
   the reduced-motion block.

Until then, new work uses these tokens and does not add to the drift.

## Proposals not taken

Recorded so the choice is not made twice.

- **Nightglass** — the existing blue-accented dark glass, tidied. The cheapest
  option and the safest. Rejected for having no point of view: swap the content
  and it could be a database console.
- **Quadrangle** — the printed USGS quad sheet, ink on paper, contours in brown,
  serif names and monospace numerals. The strongest identity of the five and the
  closest to what cairn is about. Rejected because paper chrome fights a
  photographic basemap, and committing meant replacing satellite imagery with a
  drawn map — which is the one thing #2 chose Google Maps for.
- **Material 3** — every state pre-decided, at the cost of MUI as a dependency
  and an unmistakably Android look. Rejected on both counts, plus its radii
  make chrome visually heavy exactly where it should be thin.
- **Bearing** — zero radius, phosphor on black, monospace throughout, no motion.
  Best numeral alignment of the five and genuinely good for night use. Rejected
  as a costume: cairn is a place to keep trips, not an instrument, and
  green-on-black over satellite is close to unreadable.

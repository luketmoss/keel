# 47 — Migrate token system to the Alpenglow design language

Tokens, exactly, from [design-language.md](design-language.md) — Colour, Scale,
and Elevation sections. This note does not restate values; it covers the parts
a restyle-of-everything raises that a token table alone doesn't answer:
ordering, the one exception, and what "done" looks like mid-migration.

## Main path

1. Tokens land in `index.css` first, as a single commit or the first commit of
   the PR. Every component stylesheet still resolves against them the moment
   they exist — a `var(--surface)` reference doesn't care whether the property
   was renamed underneath it, only whether it's defined.
2. Component stylesheets are repointed file by file. Order doesn't matter
   functionally, but doing `Sidebar.css` and `WorldMap.css` early is useful
   because between them they exercise every elevation level (L1 sidebar, L2
   floating filter) and surface the translucency-mechanism change (below)
   immediately rather than late.
3. Nothing renders half-migrated in a way a user sees: this ships as one PR,
   not incrementally on `main`, so there is no in-between state to specify.

## The one exception

The track swatch's `border-radius: 50%` ([TrackList.css](../../src/components/TrackList.css))
is a circle, not a rounded rectangle, and does not move to `--radius-full`
(`999px`). On a square element the two are visually identical; the swatch
stays `50%` so it still reads as a circle if its box is ever not square.

## The translucency swap

Today `--surface` is itself semi-transparent (`#14171AE6`), composited over
whatever blur is applied. Alpenglow's `--surface` (`#1B1F33`) is opaque; the
translucent read comes entirely from `backdrop-filter: blur(20px)` on the
elements that use it. Concretely: no component should carry both an alpha
surface color and a blur — that's double-transparency and reads muddier than
either alone. Where a component today has `background: var(--surface)` plus
its own `backdrop-filter`, only the blur stays; the surface token supplies full
opacity.

`DropOverlay.css`'s `blur(2px)` is not part of this — it's a distinct, smaller
blur behind a dashed drop-target border, not a chrome-over-map panel, and
issue #47 doesn't touch effect values, only the flat colour/scale tokens. Its
`background: var(--surface)` does still repoint to the new value.

## Edge cases

- **A component with no current blur** (`TripList.css`'s full-bleed
  `--surface-solid` background, `RoutePlaceholder.css`, `TripNotFound.css`) —
  these stay on `--surface` (opaque ground colour), not `--surface-lift` or a
  blurred variant. They're L0 field, not L1/L2 chrome, and inherit no blur by
  this migration.
- **`TripMetadataHeader.css`'s save-confirmation underline**
  (`box-shadow: inset 0 -2px 0 0 var(--accent)`, 300ms fade) — the colour
  token changes with the palette; the 300ms duration is untouched here, since
  motion tokens are #49's scope, not this one's.
- **Reduced motion** — not introduced by this issue. Nothing here adds
  animation; the query itself is #49.

## Not decided here

Whether `--surface-lift` (new, used for inputs/pressed rows/selected segments)
needs its own elevation level distinct from L1/L2 is answered by
`design-language.md` already: it's a fill token, not a blur level, used inside
L1/L2 surfaces for a nested control's own background.

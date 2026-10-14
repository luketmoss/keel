# #397 — Thrive's cobalt identity

Thrive stops wearing cairn's orange. The palette, the icons, the browser
chrome and the sign-in mark all move to cobalt at once, so that no build ever
ships half of each.

Thrive uses the suite design language, not cairn's Alpenglow: its tokens are
the custom properties in `thrive/frontend/src/global.css`, and the light and
dark blocks there are what this note changes. The icon handling follows
cairn's [300-the-cairn-mark.md](../../../cairn/docs/design/300-the-cairn-mark.md),
deliberately: the tile family is meant to be Keel-wide (#401), and cairn has
already found the traps (`%BASE_URL%`, the mark's `<filter id>`, small sizes).
[407-activity-route-map.md](407-activity-route-map.md) already assumes this
note's light primary, `#2f66f0`, for the route line.

## The two artworks

Both are committed exactly as drawn in #397's body. Neither is edited here.

- **The mark** (`thrive-mark.svg`, 256 viewBox) — a barbell, rotated −14°,
  dark-outlined (`#0a1233`), cobalt inner plates (`#2f66f0`), pale outer plates
  (`#8fb1ff`), on transparency, with a soft drop shadow (`<filter id="s">`).
  It is the one meant for small sizes: four plates and a bar, no scenery.
- **The app icon** (`thrive-app-icon.svg`, 1024 viewBox) — the mark on a navy
  `#0f2a7a` tile with 220 corners, a gold sun upper right, a blue pulse line
  (`#2c4ea8`) and an orange trail. At 48px the line and trail are texture; at 180px
  and up they are the point.

**The mark small, the tile large,** as cairn: the mark is the favicon and the
sign-in glyph; the tile is the home-screen and manifest icon.

The orange trail (`#ff7a45`) inside the tile stays. It is paint inside a
drawing on navy, not a UI colour, and it is not what made Thrive and cairn hard
to tell apart — their tiles' dominant colours and their in-app accents were.

## Files in `public/`

| File | From | Size | Used by |
|---|---|---|---|
| `thrive-mark.svg` | committed as drawn | vector | `<link rel="icon" type="image/svg+xml">`, `ThriveLogo` |
| `favicon.ico` | the mark | 16, 32, 48 | `<link rel="icon" sizes="32x32">` |
| `thrive-app-icon.svg` | committed as drawn | vector | source only; not linked |
| `thrive-app-icon-180.png` | the app icon | 180×180 | `apple-touch-icon` |
| `thrive-app-icon-192.png` | the app icon | 192×192 | manifest, `any` |
| `thrive-app-icon-512.png` | the app icon | 512×512 | manifest, `any` |
| `withings-callback.html` | unchanged | — | the Withings sign-in callback |

Removed: `thrive-favicon.svg`, `thrive-icon-192.svg`,
`thrive-icon-192-maskable.svg`, `thrive-icon-512.svg`,
`thrive-icon-512-maskable.svg`, `thrive-icon-compact.svg`,
`thrive-icon-minimal.svg`, `thrive-icon-primary.svg`.

PNGs are rendered with transparent corners (the tile's 220 radius), as cairn's
are. iOS rounds its own corners over them, so the transparency never shows on
the home screen.

## The tab and the home screen

`index.html`, replacing the current three lines:

```html
<link rel="icon" href="%BASE_URL%favicon.ico" sizes="32x32" />
<link rel="icon" type="image/svg+xml" href="%BASE_URL%thrive-mark.svg" />
<link rel="apple-touch-icon" href="%BASE_URL%thrive-app-icon-180.png" />
<meta name="theme-color" content="#0f2a7a" />
```

`%BASE_URL%`, not relative and not `/`: the Pages build sets `VITE_BASE_PATH`
(#396), and this is the form cairn settled on. `<link rel="manifest">` moves to
`%BASE_URL%manifest.json` for the same reason. `<title>` stays
`Thrive — Workout Tracker`.

**One `theme-color`, the tile navy, in both themes.** It colours the browser's
chrome and the OS splash, never a surface the app draws, so it matches the
tile, as #401 asks, rather than either theme's page background. A per-theme
`media` pair was considered and rejected: the in-app theme toggle can disagree
with the OS preference, and the media query would follow the OS.

`manifest.json`: `icons` becomes

```json
[
  { "src": "thrive-app-icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
  { "src": "thrive-app-icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" }
]
```

and `theme_color` and `background_color` both become `#0f2a7a`. `name`,
`short_name`, `description`, `display`, `start_url` and `scope` do not change.

**No maskable icon.** The sun's centre is 368 units from the tile's centre and
its radius is 105, so it reaches 473 — past the 410-unit radius of Android's
80% safe zone. Declared maskable, the 512 would lose most of the sun. Without a
maskable entry Android shows the `any` icon whole on a plain backing. The
full-bleed maskable export is #401's to define for every app.

## `ThriveLogo`

Drawn as an `<img>` of the public asset rather than inline SVG, as cairn's
mark is:

```tsx
<img src={`${import.meta.env.BASE_URL}thrive-mark.svg`} width={size} height={size} alt="" class={className} />
```

Two reasons, both cairn's. The mark carries `<filter id="s">`, and an inline
copy would put a document-global id into a component. And `public/` already
holds the file for the favicon; a second copy in `src/` is two files that can
drift.

`alt=""`: the sign-in card's `<h1>Thrive</h1>` is directly beneath, so the
mark is decorative and a name on it would announce "Thrive" twice — the same
reason the current SVG is `aria-hidden`. `--color-accent` is no longer read by
the logo.

The sign-in screen (`login-screen.tsx`, both its states: first sign-in and
Continue as) keeps `size={64}` and `.login-icon`. The mark's dark outline is
low-contrast on the dark theme's card (`#1a1a1e`); the plates and bar carry the
shape there, and the drop shadow is invisible. That is acceptable for a
decorative glyph above its own name.

| State | What is drawn |
|---|---|
| Light, either sign-in state | The mark, 64px, on `--color-surface` |
| Dark, either sign-in state | The same mark; no dark variant |
| The SVG fails to load | An empty 64px box; the card's layout holds because `width`/`height` are set |

No transition and no loading state: a 2 KB same-origin SVG arriving with the
page.

## The palette

Every token whose value is orange or derived from orange moves; nothing else
does. Ratios are WCAG 2 contrast, computed from the hex values in this table
against the background tokens as they stand in `global.css` today (light
`--color-bg` `#f0f2f5`, `--color-surface` `#ffffff`, `--color-border-light`
`#e8eaed`; dark `--color-bg` `#121212`, `--color-surface` `#1a1a1e`,
`--color-surface-raised` `#252528`, `--color-border-light` `#25252b`; calendar
bins `--cal-shade-1`…`4`). The plan's figure of 5.84 for the dark primary was
measured against cairn's surface; on Thrive's own card it is 6.22.

### Light

| Token | Was | Becomes | Measured |
|---|---|---|---|
| `--color-accent` (`:root`) | `#FF6B35` | `#2f66f0` | not read once `ThriveLogo` changes; kept so nothing that reads it breaks |
| `--color-primary` | `#FF6B35` | `#2f66f0` | fills, borders, selected outlines: 4.91 card, 4.38 page, 4.34 on the tint (≥ 3) |
| `--color-primary-hover` | `#D4400A` | `#2452c9` | 6.72 card |
| `--color-primary-light` | `#fff0eb` | `#ebf1ff` | the selected tint |
| `--color-primary-on-light` | `#B83508` | `#2452c9` | text on the tint: 5.94 |
| `--color-primary-text` | `#B83508` | `#2452c9` | text: 5.99 page, 6.72 card, 5.57 on `--color-border-light`; calendar dot and selected border on bins 1–4: 5.76 / 4.83 / 4.08 / 3.47 |
| `--color-primary-rgb` | `255, 107, 53` | `47, 102, 240` | |
| `--color-primary-focus-ring` | `rgba(255, 107, 53, 0.25)` | `rgba(47, 102, 240, 0.25)` | |
| `--color-primary-fill` | `#D4400A` | `#2f66f0` | `--color-on-fill` `#ffffff` on it: 4.91 |
| `--color-primary-fill-hover` | `#B83508` | `#2452c9` | `#ffffff` on it: 6.72 |
| `--chart-line` | `#b83508` | `#2452c9` | 6.72 card, 5.53 band |
| `--chart-band` | `#ffe4d9` | `#e1e9fd` | `--chart-dot` `#7a8088` on it: 3.28 |

The light theme can now use the brand itself as the fill, which orange never
could (white on `#FF6B35` is 2.84; that is why `--color-primary-fill` was a
darker step). `--color-primary-text` still needs a darker step, because the
brand is 4.38 on the page background, under 4.5.

### Dark

| Token | Was | Becomes | Measured |
|---|---|---|---|
| `--color-primary` | `#FF6B35` | `#6e97ff` | 6.22 card, 6.72 page |
| `--color-primary-hover` | `#FF9A76` | `#8fb1ff` | 8.18 card |
| `--color-primary-light` | `#2d1a10` | `#16213f` | the selected tint |
| `--color-primary-on-light` | `#FF9A76` | `#8fb1ff` | text on the tint: 7.48 |
| `--color-primary-text` | `#FF6B35` | `#6e97ff` | text: 6.72 page, 6.22 card, 5.48 raised, 5.47 on `--color-border-light`, 5.69 on the tint; calendar bins 1–4: 5.37 / 4.56 / 3.79 / 3.21 |
| `--color-primary-rgb` | `255, 107, 53` | `110, 151, 255` | |
| `--color-primary-focus-ring` | `rgba(255, 107, 53, 0.3)` | `rgba(110, 151, 255, 0.3)` | |
| `--color-primary-fill` | `#FF6B35` | `#6e97ff` | `--color-on-fill` `#121212` on it: 6.72 |
| `--color-primary-fill-hover` | `#FF9A76` | `#8fb1ff` | `#121212` on it: 8.83 |
| `--chart-line` | `#ff6b35` | `#6e97ff` | 6.22 card, 5.35 band |
| `--chart-band` | `#402819` | `#1a2645` | `--chart-dot` `#868c93` on it: 4.40 |

`--color-on-fill` stays `#ffffff` light and `#121212` dark. The plan proposed
ink `#0a1233` on dark fills (6.57); `#121212` measures 6.72 on the same fill,
is already the token every fill uses, and keeps one dark-on-fill colour across
primary, danger and success. No new `--color-on-primary`.

`.tag-badge-colored.active` falls back to `var(--color-primary)` behind a
hard-coded `#fff` (light) or `#111` (dark): 4.91 and 6.77 on cobalt. Left as it
is.

### What does not move

- **`.badge-bike`** stays blue (`#1565c0` on `#e3f2fd`; dark `#93c5fd` on
  `#0d1f33`). It is now in the same hue family as the brand. That is
  acceptable: a type badge always carries its word ("bike"), and the brand
  never appears as a filled pill with a word in it. Changing a type colour
  would be a separate decision about the type palette, not identity.
- **The calendar shading** stays blue. The selected border and note dot
  already use `--color-primary-text`, and the bins table above is the check
  that they still read on every bin — better than orange did on bin 4 (3.47
  against 3.05 light).
- Label colours (`api/label-colors.ts`, including the user-pickable orange),
  section colours (the warm-up border `#e65100`), effort, danger, success and
  warning.
- The bottom-nav active tab's bold label and top bar (#182): it is now
  cobalt, and still does not rely on colour.

## States to check by eye

In demo mode (`?demo=true`), in each theme, at 375px:

| Surface | Rest | Hover | Focus | Disabled |
|---|---|---|---|---|
| `.btn-primary` (e.g. Save) | cobalt fill, `--color-on-fill` text | `--color-primary-fill-hover` | the existing ring, now cobalt-derived | unchanged treatment |
| `.fab` (add) | as above, 56px circle | as above | as above | n/a |
| `.login-btn` | as above | as above | as above | 0.6 opacity, unchanged |
| Bottom-nav active tab | `--color-primary-text` label, bold, top bar | n/a | the existing ring | n/a |
| A selected chip / pill | `--color-primary-light` tint, `--color-primary-on-light` text | | | |
| Trends chart | `--chart-line` over `--chart-band` | | | |
| "View on COROS" link | `--color-primary-text`, underlined | | `--color-text` ring (#320, unchanged) | |

## Copy

Nothing new. `name` and `short_name` in the manifest stay "Thrive — Workout
Tracker" and "Thrive"; the sign-in card's heading stays "Thrive".

## New tokens

None. Every value above replaces an existing token. `#0f2a7a` appears as a raw
value in `theme-color` and the manifest only, for cairn's reason: it colours
the browser's chrome and the OS's tile, never a surface the app draws, so it
belongs in neither the stylesheet nor the token set.

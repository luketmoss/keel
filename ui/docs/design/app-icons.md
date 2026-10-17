# App icons

Standing reference, not an issue note. It is the icon rule in
[`keel-wide-rules.md`](keel-wide-rules.md), written out so a third app does not
have to reverse-engineer it from two SVGs.

It generalises cairn's
[`300-the-cairn-mark.md`](../../../cairn/docs/design/300-the-cairn-mark.md) and
Thrive's #397 artwork. Cairn's and Thrive's icons are one template, on purpose.
Nothing in the rules below is app-specific; cairn and Thrive appear as worked
examples.

## Two artworks, never interchangeable

- **The mark.** The app's glyph on transparency, dark-outlined. It is the
  favicon and any in-app identity slot. It survives being shrunk: cairn's four
  stones are still four stones at 48px.
- **The tile.** The mark on a rounded square of the app's dark ground, with a
  sun, a line motif and a trail. It is the home-screen and manifest icon, where
  the platform draws it at 180px or more.

**Mark small, tile large.** A tile at 16px spends most of its pixels on its
ground, and at 48px the motif and trail have already collapsed into texture.
Using the mark at 180px, on the other hand, wastes the room the tile exists to
fill.

## The tile template

A `0 0 1024 1024` viewBox, drawn in this order:

| Layer | Spec |
|---|---|
| Ground | a rounded rect, `rx="220"`, in the app's dark ground colour |
| Sun | a circle, `r="105"`, upper right: cairn's at 760,260, Thrive's at 770,250 |
| Line motif | a path across the upper middle, stroke 45 at 0.75 opacity: cairn's ridgeline, Thrive's pulse |
| Trail | a path across the bottom, stroke 32, round caps |
| Mark | the mark's artwork, centred at `scale(2.95)` |

Each app chooses its ground, sun, motif and trail colours from its own palette,
and the sun is the app's registry accent where that reads on the ground. The
geometry is the same for every app.

## The file set

In the app's `public/`:

| File | Used for |
|---|---|
| `<app>-mark.svg` | the favicon and in-app identity slots |
| `<app>-app-icon.svg` | the tile, source of the rasters |
| `<app>-app-icon-180.png` | `apple-touch-icon`: iOS ignores the manifest and ignores SVG |
| `<app>-app-icon-192.png`, `<app>-app-icon-512.png` | the manifest's `any` icons |
| a maskable 512 | the manifest's `maskable` icon, a separate file (see below) |
| `favicon.ico` | 16, 32 and 48px, for browsers that want a raster |

### What `index.html` declares

| Declaration | Points at |
|---|---|
| `<link rel="icon" href="%BASE_URL%favicon.ico" sizes="32x32">` | the ICO |
| `<link rel="icon" type="image/svg+xml" href="%BASE_URL%<app>-mark.svg">` | the mark, crisp at any tab scale |
| `<link rel="apple-touch-icon" href="%BASE_URL%<app>-app-icon-180.png">` | the 180 tile |
| `<meta name="theme-color" content="<ground>">` | see below |
| `<link rel="manifest" href="%BASE_URL%manifest.webmanifest">` | the manifest |

**Every href uses `%BASE_URL%`, never `/`.** Pages serves each app under a path,
and a root-absolute href fetches from the wrong origin path and silently falls
back to the browser's default glyph. For the same reason the manifest's
`start_url` and `scope` are `"./"`, relative.

## `theme_color`

`theme_color` is **the tile's ground colour**, in the manifest and in the meta
tag. It is one value, not two that must be remembered to move together. The
manifest's `background_color` takes the same value. Cairn's is `#171b35`.

## The maskable export

The maskable file is separate from the rounded tile, and full-bleed.

**Why a rounded tile cannot be the maskable.** Its `rx="220"` corners are
transparent, and Android crops the icon to a mask of its own choosing. Its safe
zone is the central circle of radius 40% of the icon: **409.6 units of the
1024**. Anything outside it can be cut.

**Measured from the SVGs,** the sun's farthest edge from the centre:

| App | Sun centre | Distance from centre | Plus `r` 105 |
|---|---|---|---|
| cairn | 760,260 | 353.6 | **458.6** |
| Thrive | 770,250 | 367.7 | **472.7** |

Both are outside 409.6, so a maskable crop cuts both suns. Cairn's note #300
declares its rounded 512 `maskable`; its own artwork shows that is wrong, and
the correction is a cairn issue, not made here.

**The maskable artwork** is the tile on a square of its ground with no corner
radius, with everything scaled about the centre to **86%**. That puts the suns
at 394.4 (cairn) and 406.5 (Thrive), inside 409.6. The motif and the trail may
be cropped. The mark and the sun may not.

**The manifest declares the rounded 512 as `any` and the maskable 512 as
`maskable`, and never one file as both.** Declaring one file both is how a
rounded tile with transparent corners ends up masked, and how its sun ends up
cut.

```json
"icons": [
  { "src": "<app>-app-icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
  { "src": "<app>-app-icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
  { "src": "<app>-app-icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
]
```

## Checking an app's icons

- The mark is on transparency and readable at 16px; the tile is not used
  anywhere it is drawn under 100px.
- The viewBox, `rx`, sun radius, motif and trail strokes and mark scale match
  the template.
- The sun's centre distance plus 105 is over 409.6 on the rounded tile, and
  under 409.6 on the maskable after the 86% scale.
- `theme_color` in the manifest, in `index.html` and as the ground colour is
  one value.
- Every href is `%BASE_URL%`, and the manifest's `start_url` and `scope` are
  `./`.
- No file in the manifest appears under both `any` and `maskable`.

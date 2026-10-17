# #429 — Thrive's maskable icon

Applies `ui/docs/design/app-icons.md` §The maskable export to Thrive. That
standing document outranks this note, and nothing here departs from it. This
note records what is specific to Thrive and the measurements behind the
criteria.

## What the person sees

| Where | Today | After |
|---|---|---|
| Android home screen, app drawer, recents | the rounded tile, shrunk inside a white circle | cobalt `#0f2a7a` fills the launcher's own shape (circle, squircle, teardrop), with the sun, dumbbell and trail inside it |
| Android splash screen (standalone launch) | the `any` 512 on `background_color` | unchanged: Chrome builds the splash from the `any` icon |
| iOS home screen | the 180 PNG | unchanged |
| Browser tab | `favicon.ico` / `thrive-mark.svg` | unchanged |

There is no copy, no state and no interaction. The only surface is the
launcher icon.

## The artwork

`thrive/frontend/public/thrive-app-icon-maskable.svg` is
`thrive-app-icon.svg` with two changes:

1. The ground is `<rect width="1024" height="1024" fill="#0f2a7a"/>`, with no
   `rx`. Full bleed, so whatever shape the launcher cuts is cobalt to its edge.
2. The sun, pulse, trail and mark are wrapped in one
   `<g transform="translate(512 512) scale(.86) translate(-512 -512)">`. The
   ground is outside that group and stays full size.

Colours, strokes and paths are copied unchanged. The pulse and trail run to
the tile's edges and **will** be cropped by most masks. `app-icons.md` allows
that: only the sun and the mark must survive.

## Measured

Computed from `thrive-app-icon.svg`'s coordinates, distance from the centre
(512, 512). The safe zone is a circle of radius 409.6 (40% of 1024).

| Element | Tile (unscaled) | Maskable (× 0.86) | Inside 409.6? |
|---|---|---|---|
| Sun: centre 770,250, plus `r` 105 | 472.7 | **406.5** | yes, by 3.1 units (≈1.5 px at 512) |
| Mark: farthest corner of the plates' and bar's bounding boxes, stroke included, after `rotate(-14)` and `scale(2.95)` | 351.7 | **302.4** | yes, with room to spare |

The mark figure is a bounding-box upper bound: the real rounded corners sit
closer to the centre than that. The sun's 3.1-unit margin is thin but is the
margin `app-icons.md` specifies. Do not "improve" it by scaling further: the
86% is the shared template, and cairn's export will use it too.

## Rasterising

Rasterise to `thrive-app-icon-maskable-512.png` the same way #397 produced
`thrive-app-icon-512.png`, so the two rasters match in rendering. The PNG must
be fully opaque. A transparent pixel anywhere means the ground rect was not
full bleed.

## Checking it

- Chrome DevTools → Application → Manifest → the maskable icon, with "Show
  only the minimum safe area for maskable icons" ticked: the whole sun disc
  and the whole dumbbell are visible.
- [maskable.app](https://maskable.app) with the PNG loaded, as a second view
  of the same check across launcher shapes.
- On the phone, Android caches an installed PWA's icon. Expect the old white
  circle until Chrome refreshes the WebAPK, which can take a day after deploy.
  Uninstalling and re-adding to the home screen forces it at once. Do this
  before judging Gate 2.

## Decisions

- **One maskable file, 512 only.** `app-icons.md` lists one, and Android
  downsamples it. Adding a 192 maskable would be a second file to keep in sync
  for no visible gain.
- **A separate SVG source**, not an inline transform at raster time. Keeping
  the artwork as a committed file means the next rasterisation needs no
  recipe, and the test can hash it the way #397 hashes the tile.

# 300 — The cairn mark

Cairn gets a face. The tab, the home screen, and the identity slot of the
search card all stop being placeholders.

Standing documents this answers to:
[design-language.md](design-language.md) for colour, scale and elevation, and
[shell-and-content-model.md](shell-and-content-model.md) for the search card's
three slots — the left one of which has said "The cairn mark" since #109 while
rendering the character `▲`.

## The two artworks

The package holds one glyph drawn two ways, and they are not interchangeable.

- **The mark** — four stacked stones on transparency, dark-outlined, the third
  stone orange and the top one stone-white. It survives being shrunk: at 48px
  the four stones are still four stones. This is the app's glyph.
- **The app icon** — the mark on a navy rounded tile with an orange sun, a
  slate ridgeline and a yellow trail. At 48px the ridgeline and trail have
  already collapsed into texture; at 180px and up they are the point.

**So: the mark small, the tile large.** The mark is the favicon and the search
card glyph. The tile is the home-screen and manifest icon, where the platform
draws it at 180px or more and rounds the corners itself. Using the tile as a
16px favicon would spend four fifths of the pixels on a navy square.

## The tab

`index.html` declares four things it does not declare today:

| Declaration | Points at | Why |
|---|---|---|
| `<link rel="icon" href="%BASE_URL%favicon.ico" sizes="32x32">` | `favicon.ico` | the 16/32/48 raster, for browsers that want a raster |
| `<link rel="icon" type="image/svg+xml" href="%BASE_URL%cairn-mark.svg">` | the mark | crisp at any tab scale; wins where supported |
| `<link rel="apple-touch-icon" href="%BASE_URL%cairn-app-icon-180.png">` | the tile | iOS home screen, which ignores the manifest |
| `<meta name="theme-color" content="#171b35">` | — | the phone's browser chrome, and the manifest's match |

`%BASE_URL%` rather than `/`. The Pages build sets `VITE_BASE_PATH`, and a
root-absolute favicon href on a project-pages URL fetches from the wrong origin
path and silently falls back to the default glyph — which is the bug this issue
exists to fix, reintroduced by the fix.

**The theme colour is the brand navy `#171b35`, not `--ground` `#121523`.**
They are three points apart and neither is ever visible beside the other: the
phone draws `theme_color` around a page whose own ground is `--ground`, never
adjacent to it. The brand value keeps the manifest and the meta tag one number
rather than two that must be remembered to move together.

## The home screen

`public/manifest.webmanifest`, linked from `index.html`:

- `name` and `short_name`: **Cairn**. There is no longer name to shorten to.
- `start_url` and `scope`: `"./"` — relative, for the same base-path reason.
- `display`: `standalone`.
- `theme_color` and `background_color`: `#171b35`.
- `icons`: the 192 as `any`, the 512 as both `any` and `maskable`.

The 512 is safe to declare maskable: the tile's own artwork sits inside the
rounded rect with margin to spare, so Android's mask crops padding rather than
stones.

Adding it to a home screen is all this buys. There is no service worker, so the
standalone window is a browser that needs the network — see the issue's Out of
Scope.

## The search card's left slot

The slot's contract does not change. `--hit-target` wide, `role="img"`,
`aria-label="Menu"`, still swapping to **Back** the moment a detail opens, and
still holding its width so the centre never shifts sideways. What changes is
what is inside it.

**Drawn as an `<img>` against the public asset, not an inlined `<svg>`:**

```tsx
<img src={`${import.meta.env.BASE_URL}cairn-mark.svg`} alt="" aria-hidden="true" />
```

Two reasons. The mark carries a `<filter id="s">` drop shadow, and an inlined
copy would put a document-global id into a component that could render twice.
And `public/` already holds the file for the favicon — importing a second copy
into `src/assets/` so the bundler can hash it means two files that can drift.
The `alt` is empty because the label lives on the slot; a nested image with its
own name would announce the mark twice.

**Size: `--mark-size`, 28px,** inside the 40px hit target. `--icon-sm` (18px) is
the token for a *control* glyph — the eye, the `⋮` — matched to a type step so a
row of controls reads level. The mark is not a control in that row; it is the
one piece of identity on screen, and at 18px the top stone stops being a stone.
28px is on the 4px grid and leaves 6px of the target on each side.

**The mark keeps its own colours, and `color: var(--accent)` comes off the
slot.** Worth stating, because the language says the accent is "not on the brand
mark" — and the placeholder `▲` has violated that since it was written, by being
literally `--accent`-coloured text. Replacing it with the artwork resolves the
violation rather than deepening it: the orange in the mark is `#ff7650` paint
inside a drawing, not the interaction token, and nothing else in the search card
at rest is orange, so the one warm object in the card is the identity and
nothing competes with it for the meaning "clickable".

## States

The slot has fewer states than it looks like it should.

| State | What is drawn |
|---|---|
| List face, at rest | The mark at `--mark-size` |
| Detail open | **Back** — unchanged, the mark is not rendered at all |
| Hover / focus / press | Nothing. The slot is not interactive today |
| The SVG fails to load | An empty `--hit-target` box. The card's geometry holds |

**The slot still does nothing when tapped.** `shell-and-content-model.md` says
the mark "opens the app menu" and there is no app menu; this issue puts the
right picture in the slot and does not invent the menu behind it. Making the
mark a `<button>` now would promise a panel that does not exist — the same
argument the shell document uses to delete the nav bar. It stays a labelled
`role="img"`, and the menu arrives with the issue that builds the menu.

**No loading state, no transition.** The favicon and the slot are both a single
small SVG served from the document's own origin; a spinner or a fade for an
asset that arrives with the page is motion spent on nothing. The mark does not
animate on the swap to Back either — the swap is instant today, and the language
reserves motion for state the user caused.

## Copy

Nothing new. The slot's accessible name stays `Menu`, the field keeps
`Search trips, tracks and cairns`, and the manifest's `name` and `short_name`
are both `Cairn`.

## New tokens

| Token | Value | For |
|---|---|---|
| `--mark-size` | `28px` | The optical size of the cairn mark inside the search card's `--hit-target` left slot. Deliberately larger than `--icon-sm`: identity, not a control. |

No new colour tokens. The brand navy `#171b35` appears twice as a raw value —
in `theme-color` and in the manifest — and belongs in neither the stylesheet nor
the token set, because it colours the browser's chrome and the OS's tile, never
a surface the app draws.

# 2 — Map shell with Google Maps satellite basemap

The first surface in cairn, and therefore the one that sets the visual language
every later issue inherits. Tokens and layout defined here are referenced by
#4, #5, #6, and #7 rather than restated.

## Layout

```
┌────────────┬──────────────────────────────┐
│  sidebar   │                              │
│   320px    │            map               │
│            │                              │
└────────────┴──────────────────────────────┘
```

Sidebar is fixed 320px on the left, map fills the remainder. Both are full
viewport height. `html, body, #root { height: 100%; overflow: hidden }` — the
page itself never scrolls; the sidebar scrolls internally when its content
overflows.

**Below 720px** the sidebar docks to the bottom instead, at 45vh, with its
header row acting as a collapse toggle. Collapsed it shows only that header,
giving the map the full screen. This is the whole mobile story for v1 — no
gestures, no drag-to-resize.

## Tokens

Chrome sits on top of satellite imagery, which is busy, and mostly mid-tone. A
dark translucent panel holds up over it far better than a light one.

| Token | Value | Use |
|---|---|---|
| `--surface` | `#14171AE6` | sidebar and overlay backgrounds |
| `--surface-solid` | `#14171A` | where translucency would hurt legibility |
| `--text` | `#F2F4F5` | primary |
| `--text-muted` | `#9AA3AB` | secondary, counts, units |
| `--border` | `#2C3238` | row dividers, panel edge |
| `--accent` | `#4C9AFF` | interactive, focus rings |
| `--danger` | `#FF6B6B` | parse failures |

System font stack. 14px base, 12px for muted secondary text. No CSS framework —
per the stack skill, one gets added when there is a second opinion to reconcile.

## Main path

1. App loads. `APIProvider` initialises with the key from
   `import.meta.env.VITE_GOOGLE_MAPS_API_KEY`.
2. Map renders centred at `{ lat: 20, lng: 0 }`, zoom `2` — the whole world,
   because with nothing imported there is no better answer, and a world view
   makes the satellite basemap immediately obvious.
3. `mapTypeId` is `satellite`. Not `hybrid` — labels are noise until there is a
   reason for them, and #5's polylines are the thing that should draw the eye.
4. Sidebar renders its empty state (specified in #6; for this issue it is an
   empty panel with the border and background).

Default Google controls: keep zoom, drop street view, map type, and fullscreen.
Map type is deliberately fixed for v1, so its control would be a lie.

## States

**Map ready** — as above.

**Missing API key.** Detected before the provider mounts, by checking the env
var for an empty or undefined value. Render in place of the map, on
`--surface-solid`, centred:

> **Map unavailable**
> Set `VITE_GOOGLE_MAPS_API_KEY` in `cairn/.env.local`, then restart the dev
> server.

The variable name goes in the copy verbatim. Whoever hits this is a developer on
a fresh clone, and the fix is the message.

**Invalid or unauthorised key.** Google reports this asynchronously, after the
provider has mounted, so it cannot be caught by the check above. `APIProvider`
exposes an error via `onError`. Same panel, different copy:

> **Map unavailable**
> Google rejected the API key. Check that the Maps JavaScript API is enabled
> for this project and that the key permits this origin.

**Loading.** The gap between mount and first tiles is short but real on a cold
load. Fill the map region with `--surface-solid` and nothing else — no spinner.
A spinner that flashes for 200ms is worse than a plain dark rectangle, and the
tiles arriving is its own progress indicator.

## Edge cases

- **Key present but empty string** — treated as missing, not as invalid. `''`
  is what an unset variable in a committed `.env.example` looks like.
- **Viewport resize, including device rotation** — map fills the new size with
  no page scrollbar. The 720px breakpoint re-evaluates live.
- **Very short viewport** (< 400px tall, landscape phone) — the bottom sheet
  stays collapsed by default rather than eating half the screen.
- **Reduced motion** — no map animation is introduced here, so nothing to
  suppress yet. #5's bounds fitting is where this matters.

## Not decided here

Initial centre is a placeholder answer. Once #5 lands, an import re-fits the
viewport immediately, so the world view is only ever seen on an empty app. If
v2 persists state, last position is the obvious replacement.

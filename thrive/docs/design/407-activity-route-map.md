# #407 — An activity's route on a map

Thrive uses the suite design language, not cairn's Alpenglow: tokens are the
custom properties in `thrive/frontend/src/global.css`. Cairn's map notes
([5-track-rendering.md](../../../cairn/docs/design/5-track-rendering.md),
[104-basemap-toggle.md](../../../cairn/docs/design/104-basemap-toggle.md)) are
prior art for map *behaviour* only: bounds fitting, the zoom cap, casing,
antimeridian handling. None of their colours or chrome carry over.

The track itself is luketmoss/thrive#421's contract: a GeoJSON `Feature` with a
`LineString` of `[lon, lat]`, a `bbox`, and per-point `t` and `ele`, fetched by
workout id through `getWorkoutTrack`.

## Where it lives

The activity detail screen, `#/history/:id` (`WorkoutDetail`), and nowhere
else. The Day view's done card already links there (`training-panel.tsx`,
`DoneCard`), and so does the Activities list, so neither changes. A route
thumbnail on a card was considered and rejected: every card would load the
Maps API (or the paid Static Maps API) for a glance, and the full map is one
tap away.

The **Route** section goes directly after `.detail-meta` (title, stats row,
provenance, "View on COROS", notes) and before the exercise list or the empty
state. A ride's route is the detail the user came for, and the stats above it
are what the map illustrates.

```
← Back                         [Edit]
Ridge Trail
[hike] 2025-01-09 08:10 1:25 4.05 mi ↑ 961 ft ↓ 945 ft 131 bpm
⌚ Synced from COROS
View on COROS ↗

Route
┌───────────────────────────────────┐
│              ╭──╮                 │
│      ●━━━━━━╯   ╰━━━╮            │
│                     ╰━━━━○        │
│                       [+][-]      │
└───────────────────────────────────┘
```

## When it appears

| Row | Route section |
|---|---|
| `track_ref` non-blank | shown |
| `track_ref` blank: indoor, strength, hand-logged, Garmin-era, a FIT not yet fetched, or a FIT with no usable track | **absent**, with no heading, placeholder or explanation |
| Build has no `VITE_GOOGLE_MAPS_API_KEY` or no `VITE_THRIVE_API_URL` | absent on every activity |
| Planned or active workout | absent: neither can have a `track_ref` |

Absent rather than "No route recorded": most of what the user opens is a
weight session, and a line saying it has no route on every one of them is
noise. An outdoor ride whose FIT is still waiting on the sync gets its map on
the next sync without anything having been promised.

When the section is present, the "No additional details" empty state
(`exerciseGroups.length === 0 && type !== 'weight' && !notes`) does **not**
show: the route is an additional detail.

## Layout

```css
.detail-route { margin-bottom: var(--space-lg); }
/* heading: the existing .detail-section-header with an <h3>Route</h3> */
.detail-route-map {
  height: var(--detail-map-height);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  overflow: hidden;
  background: var(--color-surface-raised);
}
```

Full width of the screen's content box. Same rounding and border as the
`.exercise-detail` cards below it, so it reads as one of the screen's blocks.

### Measured

From source, not a running app (no dev server was started for this note).
Method: CSS box arithmetic over `global.css`, `box-sizing: border-box`
everywhere (`global.css` line 3).

- **Map width at 375 px:** `.workout-detail-screen` has `padding: var(--space-md)`
  and `max-width: 600px`, so the content box is 375 − 2 × 16 = **343 px**. At
  viewports of 632 px and wider it is 600 − 32 = **568 px**.
- **Height:** `--detail-map-height` 280 px gives 343 × 280 (about 1.2 : 1) on
  the phone and 568 × 280 (about 2 : 1) on a wide screen. A fixed height,
  not an aspect ratio, because an aspect ratio grows the map to over 420 px on
  desktop and pushes everything below off screen for no gain in what it shows.
- **Above the fold at 375 × 812:** for the demo hike, the section's top sits
  at roughly 296 px: screen padding 16, header row 76 (`padding: var(--space-md) 0`
  around a 44 px Back target), title 44 (`--text-2xl` × 1.5 line height plus
  `--space-sm`), stats row about 70 (two wrapped lines of badges at 343 px plus
  `--space-sm` gap and margin), provenance 22, COROS link 44 (`min-height`),
  `.detail-meta` margin 24. The heading adds 35, so the map spans about
  331–611 px, inside the 748 px above the 64 px bottom bar. `/test` confirms
  with `getBoundingClientRect()` on the demo hike; the criterion it checks is
  "the whole map is visible without scrolling at 375 × 812 on the demo hike".
- **Try again** is a full `.btn .btn-secondary` (`min-height: 48px`), not
  `.btn-sm`, whose 36 px minimum fails the 44 px touch target.

## The map

- **Engine:** the Google Maps JS API (`maps` library), loaded with Google's
  own loader on the first render of a Route section, never at app start. Once
  loaded it stays loaded for the session.
- **Base layer:** Google's default roadmap. Controls: zoom, the map-type control
  (Map / Satellite, Google's own labels), and full screen where the browser
  supports it (Google hides it where it doesn't, e.g. iPhone Safari). Street
  View, tilt, rotate and clickable POIs are off (`streetViewControl: false`,
  `rotateControl: false`, `tilt: 0`, `clickableIcons: false`).
- **Gestures:** `gestureHandling: 'cooperative'`. On a phone the map sits in a
  scrolling screen, and a one-finger swipe must scroll the page, not drag the
  map: otherwise the map is a scroll trap the user cannot get past. Two
  fingers move the map; Google shows its own "Use two fingers to move the map"
  hint. On desktop, Ctrl + scroll zooms.
- **Both themes:** the map is Google's default light style in light and dark
  app themes alike. A dark map needs a Map ID and cloud styling (out of
  scope). The border and placeholder follow the app theme.
- **No Map ID.** Nothing here needs vector-only features (Advanced Markers,
  cloud styling), so only the key is required.

### Drawing

1. Coordinates come from the track's `geometry.coordinates`, converted to
   `LatLng`, then through `@keel/geo`'s `dropInvalidLatitudes` and
   `normalizeAntimeridian`, as cairn draws (#5).
2. **The line** is two `google.maps.Polyline`s, not clickable: a casing of
   `--map-track-width-casing` in `--map-track-casing`, under a line of
   `--map-track-width` in `--map-track`. The casing is what keeps the line
   readable over satellite imagery and over Google's own blue water and roads.
3. **Start and end** are `SymbolPath.CIRCLE` icons on the top polyline at
   `offset: '0%'` and `'100%'`, each `--map-dot-size` across:
   - start: filled `--map-track`, 2 px stroke of `--map-track-casing`
   - end: filled `--map-track-casing`, 3 px stroke of `--map-track`

   A loop ends where it starts, so the end dot sits over the start dot and
   both stay visible as a ring around a dot. Colour alone never tells them
   apart: one is solid, one is hollow.
4. **Fit:** `@keel/geo`'s `fitTracksToBounds(map, points, padding)` with
   padding `--space-lg` (24 px) and its default maximum zoom of 16, so a short
   walk keeps its street context. No animation on first fit: the map appears
   already framed, so there is no motion to reduce.
5. The view is not re-fitted afterwards. Panning and zooming are the user's.

The component reads the four colour and size tokens with `getComputedStyle`
on its container when it draws, so the values live in `global.css` alone.

## States

| State | Shows |
|---|---|
| **Loading** (the Maps script, the track, or both) | The map box at full height, `--color-surface-raised`, with "Loading route…" centred in `--text-sm`, `--color-text-secondary`. `aria-busy="true"` on the box. Nothing below moves when the map replaces it |
| **Loaded** | The map, drawn and fitted |
| **Error** | The same box: "Couldn't load the route." (`--text-sm`, `--color-text-secondary`) above a **Try again** `.btn .btn-secondary`, centred, `--space-sm` apart. The rest of the screen is unaffected |
| **Retrying** | Back to Loading. The button is not shown while a retry is in flight, so a double tap cannot fire two requests |

`--color-text-secondary`, not `--color-text-muted`, for both lines: the muted
text colour fails AA contrast on `--color-surface-raised` (#386's gap fix), and
these are the only words in the box.

**What counts as an error:** a network failure or the API's timeout
(`THRIVE_API_TIMEOUT_MS`); a `success: false` envelope from `getWorkoutTrack`,
whatever its `code` (`token_invalid`, `token_forbidden`, `token_unavailable`,
`read_only`, or a refusal); a track with fewer than 2 usable points after
step 1; the Maps script failing to load; Google calling `gm_authFailure` (a
bad or unauthorised key). All show the same copy: the user can do nothing
different about any of them except try again, and the reason is logged to the
console once, never shown. A refused or expired token is not a sign-in prompt
here: the app's own auth handling owns that.

**Try again** re-runs whatever failed: the script load if it failed, else the
track request. After a `gm_authFailure` a retry will fail again; it is still
offered rather than special-cased, because the copy stays honest either way.

### Edge cases

- **Rapid navigation:** leaving the screen while loading abandons the work; a
  response that arrives for a screen no longer showing is dropped, never drawn
  into another activity's map.
- **Reopening** the same activity in the session draws from the in-memory
  copy with no request, so it goes straight from Loading to Loaded once the
  map is ready. Nothing persists across reloads.
- **Two activities in a row** (back, then another): each fetches its own
  track; the Maps script is not loaded twice.
- **A track crossing the antimeridian** draws as a short line, per step 1.
- **A 5,000-point track** (luketmoss/thrive#421's ceiling) is one polyline.
  Google Maps draws that without trouble, as cairn's notes record for 10,000.
- **Offline:** the track request fails, so Error. No offline copy.
- **Rotation / resize:** the map fills its box at any width; the view is not
  re-fitted on resize.

## Demo mode

`?demo=true` gives the demo COROS hike, "Ridge Trail" (`w_demo008`), a
`track_ref` and a synthetic track bundled with the demo data: a made-up loop of
a few hundred points, not anyone's real route. The demo path never calls the
API. With a Maps key in the local `.env.local`, demo mode shows a real map;
without one, the Route section is absent, as in any build without the key. This
is how `/test` sees the section.

## Accessibility

- The heading is an `<h3>Route</h3>` in the existing `.detail-section-header`.
- The map box has `role="region"` and `aria-label="Route map"`. The stats row
  above already gives distance and climb in text; the map adds no fact that
  is only visual except the shape of the route.
- Google's controls are keyboard-focusable and carry their own labels; the
  map takes arrow keys for panning once focused. Tab order: the Route section
  comes after "View on COROS" and the notes, before the exercises or the
  actions.
- "Loading route…" and the error line sit in a `role="status"` element, so
  the change is announced once.

## Copy

| Where | Text |
|---|---|
| Section heading | Route |
| Loading | Loading route… |
| Error | Couldn't load the route. |
| Retry button | Try again |
| Map region label | Route map |

## New tokens

Added to the `:root` block of `global.css`, **not** overridden in the dark
theme: the base map is light in both themes, so the line's contrast is against
the same map either way.

| Token | Value | For |
|---|---|---|
| `--map-track` | `#2f66f0` | The route line and the end dot's ring. Thrive's light-theme primary after the cobalt identity (plan decision P4), so the route is the app's own colour, and 4.9 : 1 against white roads and over 3 : 1 against Google's water. Literal, not `var(--color-primary)`, so the dark theme's lighter primary never reaches a light map |
| `--map-track-casing` | `#ffffff` | The casing under the line, the start dot's ring, the end dot's fill |
| `--map-track-width` | `4px` | The line. A shade thicker than cairn's 3 px, because this map is small and shows one route |
| `--map-track-width-casing` | `7px` | The casing: 1.5 px either side of the line |
| `--map-dot-size` | `12px` | Start and end dots' diameter |
| `--detail-map-height` | `280px` | The map box's height, loading and error states included |

Reading pixel values in JavaScript: the component parses the computed token
(`parseFloat`) and passes the number to `strokeWeight` and the symbol's
`scale` (radius, so half `--map-dot-size`).

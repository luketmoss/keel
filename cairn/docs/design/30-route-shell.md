# 30 — Route shell: URLs for the map, trips, and a single trip

Three routes, one shell. The sidebar (title, nav, import panel, track list) is
constant across all of them; only the region that currently holds `MapView`
switches. Tokens and layout are inherited from
[2-map-shell.md](2-map-shell.md) — nothing here introduces a new token.

## Routes

| Path | Main content |
|---|---|
| `/` | `MapView`, unchanged |
| `/trips` | Trips placeholder |
| `/trips/:id` | Trip placeholder, showing `:id` |
| anything else | redirect to `/` |

## Layout

```
┌────────────┬──────────────────────────────┐
│  Cairn     │                              │
│  Map│Trips │      MapView, or a           │
│────────────│      placeholder             │
│  import    │                              │
│  panel     │                              │
│  track     │                              │
│  list      │                              │
└────────────┴──────────────────────────────┘
```

`sidebar__header` gains a second row below the existing title row: a nav row
with two links, "Map" (`/`) and "Trips" (`/trips`). The title row (brand +
mobile collapse toggle) is unchanged. Both rows stay visible when the sidebar
is collapsed on mobile — collapsing only hides `sidebar__body` (import panel,
track list), and nav has to stay reachable regardless of that state, since
it's the only way back to the map from `/trips`.

Nav row: flex row, 8px gap, `padding: 8px 16px`, `border-bottom: 1px solid
var(--border)` separating it from the body below (the title row's existing
bottom border moves down to sit under the nav row instead).

## Main path

1. User is at `/`, sees today's app exactly as before.
2. Clicks "Trips" in the sidebar header. URL becomes `/trips`, main content
   area swaps from `MapView` to the trips placeholder. Sidebar itself does not
   re-render — import state, track list, scroll position all survive the
   navigation untouched.
3. Clicks "Map". URL returns to `/`, main content area swaps back to
   `MapView`. Whether `MapView` remounts or was kept mounted-but-hidden is an
   implementation detail, not something a user can observe: imported tracks
   live in `useTrackImport` state at the `App` level either way, per current
   code, so the map redraws the same tracks regardless.
4. A trip link (once #31+ exist) will navigate to `/trips/:id`; for this issue
   that path is only reachable by typing the URL. Main area shows the trip
   placeholder, id from the URL.

## Nav link states

Two states per link, `NavLink`'s active match:

- **Inactive** — `var(--text-muted)`, no underline
- **Active** — `var(--text)`, `border-bottom: 2px solid var(--accent)`

"Map" matches only the exact path `/` (`NavLink`'s `end` prop) — otherwise it
would read active on `/trips` too, since `/` is a prefix of every path.
"Trips" matches `/trips` and `/trips/:id` both (no `end`), so the trip detail
view still shows "Trips" as the active section.

No hover state beyond the browser default cursor — these are two words in a
14px sidebar, not a hit target worth a dedicated hover treatment.

## Placeholder content (`/trips`, `/trips/:id`)

Fills the same region `MapView` occupies (remaining width beside the sidebar,
full viewport height), on `--surface-solid`, content centered:

**`/trips`**

> ## Trips
> Trip list is coming soon.

**`/trips/:id`**

> ## Trip {id}
> Trip detail is coming soon.

Heading in `--text`, subtext in `--text-muted` at 12px — same pairing
`ImportPanel` already uses for label/detail. `{id}` is the raw URL param,
inserted verbatim (see Edge cases for what "raw" means here).

## States

There is exactly one state per placeholder route: the placeholder itself.
No loading state — nothing is fetched, the swap is synchronous — and no error
state, since an unparseable `:id` still renders (see Edge cases).

## Transitions

Route changes are instant, client-side, no animation. Consistent with the map
shell's own stance (no spinner for a 200ms gap): introducing a fade or slide
here would be motion added for its own sake, not to communicate anything.

## Edge cases

- **`/trips/` (trailing slash, empty id)** — does not match `/trips/:id`
  (empty segment) and is not `/trips` exactly. Falls through to the
  unmatched-path redirect, landing on `/`.
- **`:id` with special or very long characters** (`/trips/../etc`,
  `/trips/<script>`) — rendered as inert text inside the heading via React's
  normal escaping, exactly as typed in the URL, percent-decoded. No
  validation against a real trip list, because none exists yet; that
  validation is #31+'s problem once there's data to validate against.
- **Reduced motion** — nothing to suppress; no motion is introduced.
- **Very short viewport (sidebar collapsed on mobile)** — nav row still
  renders above the collapsed body, so "Map"/"Trips" are reachable with the
  import panel and track list hidden.
- **Direct load of `/trips` or `/trips/:id`** (fresh tab, no prior `/` visit)
  — renders the same as navigating there from `/`; the sidebar's import state
  starts empty either way, same as loading `/` fresh does today.

## Not decided here

Whether `MapView` unmounts and remounts on leaving/returning to `/`, or stays
mounted and hidden, is left to whoever implements this — no acceptance
criterion depends on it, and #31+ (real trip list, real trip detail) may
change the answer anyway once there's a reason to preserve map state across
routes.

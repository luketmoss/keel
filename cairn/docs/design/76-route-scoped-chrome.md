# 76 — Route-scoped sidebar chrome

Shell and sidebar from [2-map-shell.md](2-map-shell.md) and
[30-route-shell.md](30-route-shell.md). World map from
[37-world-map.md](37-world-map.md). Tokens from
[design-language.md](design-language.md).

**Scope guard.** `design-language.md`'s Navigation section calls for one map
instance that is never unmounted, and a bottom sheet with detents, each as its
own issue. Neither is attempted here. This note decides only what the sidebar
contains per route, what `/world` says when it has nothing to draw, and when the
sidebar collapses.

## The rule

**The sidebar belongs to the route.** Its header and nav are shared; its body is
not. Today `DefaultShell` renders the import panel and the track list on every
route it owns, so `/world` lists tracks that are provably not on the map beneath
them and `/trips` offers an import whose result nothing on screen shows.

## Sidebar body, per route

```
/                 header + nav        /trips            header + nav
                  account row                           account row
                  ┌──────────────┐                      ┌──────────────┐
                  │ Import tracks│                      │              │
                  ├──────────────┤                      │  (empty)     │
                  │ track list   │                      │              │
                  └──────────────┘                      └──────────────┘
```

| Route | Sidebar body |
|---|---|
| `/` | import control + track list, exactly as today |
| `/trips` | nothing |
| `/world` | nothing |
| `/trips/:id` | its own, unchanged (#35) |

An empty body is empty — no placeholder, no "nothing here". The header, nav and
account row are the sidebar's constant, and on `/trips` the main pane already
carries the create form and the list; a second column of chrome beside it would
be inventing content to fill space.

The track store itself is untouched. Files imported on `/` are still there after
a round trip through `/trips` — they stop being *displayed* elsewhere, they do
not stop existing.

## `/` is session-scoped, and says so

The `/` track list gains one line beneath it, `--text-xs` `--text-muted`:

> `Tracks here last until you reload. Add them to a trip to keep them.`

It renders only when the list has at least one file — on an empty list the
existing empty state already explains what the surface is for, and two
explanations is one too many.

This is the smallest honest fix. The alternative — persisting `/`'s tracks —
means giving them somewhere to live, which means a trip, which is the app's
existing answer and not this issue's to revisit.

## `/world` empty states

Three distinct situations, three answers. Today the second is rendered as the
first, beneath a filter row that contradicts it.

| Situation | Filter row | Message |
|---|---|---|
| No trips at all | hidden | `No trips yet` / `Create one from Trips to see it here.` |
| Trips exist, none has geometry | shown | `No routes to draw yet` / `Add tracks to a trip and they'll appear here.` |
| Trips exist with geometry, filter excludes all | shown | `No planned trips` / `No completed trips` |
| Routes visible | shown | none |

The filter row and a message may appear together — that is correct in rows two
and three, where the user can act on the filter. It is row one that must not
show a filter, and row two that must not tell the user to create a trip they
have already created.

Heading is `--text-lg`, detail `--text-sm` `--text-muted`, on the existing
lifted L2 overlay, all unchanged from #37.

## Sidebar collapse

The threshold stays as #2 defined it: a viewport under 400px tall collapses the
sidebar, because a landscape phone has no room to give half its height to a
panel.

It is now evaluated on resize as well as on mount. The rule that makes this
bearable rather than annoying:

- **Crossing below the threshold collapses.** Always — the panel does not fit.
- **Crossing back above it expands, unless the user collapsed by hand while
  above it.** A deliberate collapse is remembered until the user toggles again.

Which means: rotate to landscape, the sheet gets out of the way; rotate back, it
returns — unless you had put it away yourself, in which case it stays away.
Transitions use `--motion-base` with `--ease`, and collapse under
`prefers-reduced-motion`.

## Edge cases

**Navigating between routes mid-import on `/`.** The import continues; its
progress and failure rows are on `/`'s panel and are not visible from `/trips`.
Returning to `/` shows the settled result. Nothing is lost, and this is already
true today.

**A drag-and-drop onto `/trips` or `/world`.** The window-level handlers belong
to `DefaultShell` and stay: a dropped `.kml` still imports into the `/` track
store, and the overlay still appears. Removing the drop target on those routes
would make a drop silently do nothing, which is the failure #75 exists to
eliminate. The overlay's label continues to name what will happen.

**A trip whose only track produces no drawable geometry** — a single-point
track, or one whose simplified line has fewer than two points. Counts as "no
geometry" for the message above; `routesForTrip` already drops it.

**Filter set to Planned, then the only planned trip is completed elsewhere.**
The map empties and row three's message appears. The filter is not reset for the
user.

**Viewport resized while the sidebar is mid-transition.** The latest threshold
crossing wins; there is no queue.

## Copy

| Where | String |
|---|---|
| `/` track list footnote | `Tracks here last until you reload. Add them to a trip to keep them.` |
| `/world`, no trips | `No trips yet` / `Create one from Trips to see it here.` |
| `/world`, no geometry | `No routes to draw yet` / `Add tracks to a trip and they'll appear here.` |
| `/world`, filtered empty | `No planned trips` / `No completed trips` |

## New tokens

None.

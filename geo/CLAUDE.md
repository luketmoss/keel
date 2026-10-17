# CLAUDE.md — geo

`@keel/geo`: the map logic that more than one Keel project needs — KML and GPX
parsing, track stats, route simplification, elevation sampling, bounds fitting,
the track palette and marker clustering — as a framework-free TypeScript
package. Extracted from cairn (luketmoss/keel#406).

**Stack:** web. The authoritative conventions for this project are in
`.claude/skills/stack-web/SKILL.md` — read it before writing code here. This
project is a library, so most of that skill does not apply: there is no React,
no dev server, no Pages deploy and no `launch.json` entry, and `/test` is
`typecheck` and `test` alone. There is no `build` script.

Workspace rules live in the root `CLAUDE.md` and `CONVENTIONS.md`. This file
covers only what is specific to geo.

## Layout

```
geo/
├── package.json        # "@keel/geo"; exports src/index.ts
├── tsconfig.json
├── vitest.config.ts
├── src/
│   ├── index.ts        # the one entry point
│   ├── kml/            # KML/KMZ/GPX readers into Track, and track stats
│   ├── geo/            # simplification, overview GeoJSON, totals, elevation
│   └── map/            # LatLng, bounds fitting, palette, clustering, motion
└── docs/design/        # UX artifacts, one file per issue
```

## No view library

**Nothing under `src/` imports `react`, `react-dom`, `preact` or `@vis.gl/*`,
and `package.json` depends on none of them.** Cairn is React and thrive is
Preact; the package is shared logic, never shared components. A test fails if
this is broken, and the answer to that failure is to move the code to the
consumer, not to the test.

## Consuming it

TypeScript source, no build step, nothing published to npm. A consumer depends
on it by relative path and compiles it with its own Vite and Vitest:

```json
"@keel/geo": "file:../geo"
```

and imports from the package name, never from a path inside it:

```ts
import { parseTrack, buildOverviewGeoJSON } from '@keel/geo'
```

A consumer's Vite dev server must be allowed to serve `../geo` (see
`cairn/vite.config.ts`), and its workflows must trigger on `geo/**` — a change
here is a change to every consumer, so it has to rebuild and redeploy them.

Consumers today: cairn. Thrive is next (luketmoss/keel#407).

## Readers produce `Track`

Every reader returns the shared `Track`/`TrackPoint` shape from
`src/kml/parse.ts`. A FIT reader, needed when a Thrive activity can be added to
a cairn trip (luketmoss/keel#387), is one more reader beside KML and GPX, not a
restructuring. None exists yet.

## Board

Project option: `geo`. Filter the board by it to see only this project's work.

## Testing

Automated. `/test` runs `npm run typecheck` and `npm test` and verifies
acceptance criteria against them; the delivery run continues through to Ready to
Ship without stopping. Nothing here is visual.

---
name: stack-web
description: Conventions, scaffold, and CI for web application projects in Keel (React, Vite, TypeScript). Use when working in a project folder whose CLAUDE.md names web as its stack.
---

# Web stack

React + TypeScript on Vite. Authoritative for any project whose CLAUDE.md names
`web`.

## Testing

Automated. `/test` runs the suite and verifies acceptance criteria against it,
and the delivery run continues through to Ready to Ship without stopping.

Acceptance criteria describing visual appearance rather than behaviour are the
exception — those need eyes, and `/test` says so rather than passing them
silently.

## Verifying a browser UI

The suite covers what the suite covers. Criteria about what the running app
does — it pans, it fits the bounds, it degrades without a key — are verified by
hand during `/test`, and the obvious ways of doing that all failed on cairn #2.
What follows is what worked.

**Launch through the project's `.claude/launch.json` entry** and drive the
preview pane. Never start the dev server with a bare shell command.

**Read state out of the DOM and the console, not off the screen.** Query for the
element and assert on its text, its attributes, or its computed style. A
screenshot answers *does this look right*; it never answers *is this correct*.

**Drive interaction by dispatching events.** Pointer automation is not reliable
against a canvas- or map-backed surface. On cairn #2 synthetic clicks landed
hundreds of pixels from their target because the harness coordinate space did
not match screenshot pixel space; an element-ref click on a zoom control
reported success and did nothing at all; a drag produced no movement, which read
as "the map is not interactive" when it was. Compute coordinates from the
target's `getBoundingClientRect()` and dispatch `WheelEvent` / `PointerEvent`
directly, then read the result back out of the DOM.

**A tool call reporting success is not evidence.** The observed state change
afterwards is. If nothing moved, assume the input never arrived.

**When a screenshot counts.** For a criterion about visual appearance, once the
page has settled and the DOM confirms the state being photographed. Not
immediately after load — cairn's first screenshot showed a uniform grey
rectangle that looked like a rendering failure, and one taken moments later
showed the real state. And never as proof that an error is *absent*: that same
run photographed Google's own "something went wrong" panel without noticing it.
The console is what answers that question.

### Worked example: a Google map's camera

The map's own attribution link carries the camera in its query string —
`ll=<lat>,<lng>`, `z=<zoom>`, `t=<type>` — and tile URLs carry the zoom index.
Between them they answer centre, zoom and map type exactly, which is what a
bounds-fitting criterion needs and what no screenshot will give you.

An unauthorised key does not surface through the loader's error path, because
the script loads fine and is rejected afterwards. Google calls the
`gm_authFailure` global instead; check for it before concluding the map works.

## Conventions

- TypeScript, `strict` on. `any` requires a comment saying why
- Function components and hooks. No class components
- Colocate: a component's test and styles live beside it, not in a mirror tree
- Data fetching stays out of components — a hook or a loader owns it
- Vitest for unit tests, Playwright only when a flow genuinely needs a browser
- No CSS framework by default. Add one when there's a second opinion to
  reconcile, not before
- Environment config through `import.meta.env`, never hardcoded per-environment
  branches

## Scaffold and CI

The project scaffold and the CI workflow template are in
[scaffold.md](scaffold.md), beside this file. `/new-project` reads it when a
project is created; nothing in the issue lifecycle does, which is why it is
not here.

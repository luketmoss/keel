# CLAUDE.md — almanac

A morning driver: one screen showing the day ahead — what training is
scheduled, what is due, what last night's sleep looked like — linking into the
apps that own each piece. Personal use.

**Stack:** web. The authoritative conventions for this project are in
`.claude/skills/stack-web/SKILL.md` — read it before writing code here, and
note the Preact deviation below.

Workspace rules live in the root `CLAUDE.md` and `CONVENTIONS.md`. This file
covers only what is specific to almanac.

The product specification is [`docs/spec.md`](docs/spec.md). It is standing and
authoritative; its §9 open questions are open, not settled by omission. Its
companions — `data-architecture.md` and `coros-sync-plan.md` — live outside this
repo and are not vendored here.

## Layout

```
almanac/
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   └── components/
└── docs/
    ├── spec.md         # the product specification
    └── design/         # UX artifacts, one file per issue
```

## Decisions already made

These were settled before the project existed. Revisit them deliberately, not
by accident.

- **Preact, not React.** `stack-web` names React and every other convention in
  it holds unchanged — TypeScript strict, function components and hooks,
  colocated tests and styles, fetching out of components, Vitest, no CSS
  framework, `import.meta.env`. Only the view library differs, matching Thrive:
  `preact`, `@preact/preset-vite`, `@testing-library/preact`, and
  `@preact/signals` for shared state. Chosen because almanac reads the same
  Apps Script/Sheets backend Thrive already solved, so the API client shape and
  the signal-based hash router port across rather than being rewritten.
  `tsconfig.json` maps `react`/`react-dom` to `preact/compat` so React-ecosystem
  packages still resolve.
- **Named "almanac" because it is not a journal.** Spec §1 is explicit that this
  is a morning driver, not a retrospective log — an almanac is a day-by-day
  forward-looking reference that happens to keep records, which is the shape of
  the app. Anything that makes it read as a diary is working against the spec.
- **It writes its own notes and nothing else.** Spec §5. Rescheduling a workout,
  completing a task, fixing a sport type all happen in the owning app, reached
  by a deep link. Every write capability almanac does not have is one it does
  not have to build, test, or keep in step.
- **Blank is not zero.** Spec §6 — all note fields are nullable, and a day you
  did not fill in is not an `OK` day. No code path may default a missing
  self-report to a middle value, the same discipline Thrive applies to
  `Workouts!L–Q`.
- **Dev server is port 5174.** cairn holds 5173, pinned in `vite.config.ts`.

## Board

Project option: `almanac`. Filter the board by it to see only this project's
work.

## Testing

Automated, not human-gated. `/test` runs the suite and verifies acceptance
criteria against it, and the delivery run continues through to Ready to Ship
without stopping. Criteria describing visual appearance are the exception —
those need eyes, and `/test` says so rather than passing them silently.

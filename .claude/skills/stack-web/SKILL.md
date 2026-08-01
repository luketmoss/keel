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

## Scaffold

```
<slug>/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── index.html
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   └── components/
└── .gitignore        # node_modules/, dist/, .env.local
```

## CI workflow

```yaml
name: <slug>
on:
  pull_request:
    paths: ['<slug>/**', '.github/workflows/<slug>.yml']
  push:
    branches: [main]
    paths: ['<slug>/**', '.github/workflows/<slug>.yml']
concurrency:
  group: <slug>-${{ github.ref }}
  cancel-in-progress: true
jobs:
  check:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: <slug>
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: npm
          cache-dependency-path: <slug>/package-lock.json
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
```

Note `cache-dependency-path` — without it the setup-node cache keys off the
wrong lockfile in a monorepo and projects evict each other.

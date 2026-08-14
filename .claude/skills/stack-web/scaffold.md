# web stack scaffold

Moved out of [SKILL.md](SKILL.md) so that the file every lifecycle command
reads carries only what those commands act on. Nothing here is reachable from
`/pm`, `/develop`, `/test` or `/review` — it is read once, by `/new-project`,
when a project is created.

## Scaffold

```
<slug>/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── index.html
├── .env.example
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── App.test.tsx
│   ├── test-setup.ts
│   └── components/
└── .gitignore        # node_modules/, dist/, .env.local
```

Plus one appended entry in `.claude/launch.json` at the repository root.

Transcribe the files below rather than inventing them. CI runs `typecheck`,
`test` and `build` by name, so a project that names its scripts differently
fails in a way that reads as a CI bug.

### package.json

```json
{
  "name": "<slug>",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@testing-library/react": "^16.1.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.4",
    "jsdom": "^25.0.0",
    "typescript": "^5.7.0",
    "vite": "^6.0.0",
    "vitest": "^3.0.0"
  }
}
```

**Vitest's major has to match Vite's.** Vitest 2 peer-depends on Vite 5, so
pairing it with Vite 6 makes npm nest a second copy — and `typecheck` then fails
with `@vitejs/plugin-react` typed against one Vite and `defineConfig` against
the other. `npm ls vite` reporting a single deduped version is the check.

**No `--passWithNoTests`.** A project with no test files should fail its build,
because that is the truth about it. cairn shipped a visibly broken map through a
green `typecheck`/`test`/`build`, and the flag is what made the middle one
vacuous. The example test below is what keeps the step honest from the first
commit.

### Test harness

`vite.config.ts` — note `defineConfig` comes from `vitest/config`, which is what
makes the `test` block typecheck:

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
})
```

`src/test-setup.ts` — Testing Library only auto-cleans when Vitest's globals are
on. They are not, so unmount explicitly or the second test in a file renders
into the first one's DOM:

```ts
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(cleanup)
```

`src/App.test.tsx` — the example. Tests import `describe`, `it` and `expect`
rather than relying on globals, which is why `tsconfig.json` needs no `types`
entry for Vitest:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('renders its heading', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: '<slug>' })).toBeDefined()
  })
})
```

Delete it once the first real test exists. Until then it is the difference
between `npm test` proving something and proving nothing.

### .env.example

Every `VITE_*` variable the app reads, each with a comment saying what it is and
where to get one. Committed; the filled-in copy is `.env.local`, which
`.gitignore` already covers.

```
# What this key is for, and where to obtain it.
#
# VITE_* values are inlined into the client bundle and readable by anyone who
# loads the app. They are configuration, not secrets — an API key here is
# protected by referrer restriction and a quota cap, nothing else.
VITE_SOMETHING_KEY=
```

Keep it exhaustive. A variable the app reads and this file omits is a fresh
clone that starts broken with no way to tell why.

### Launch config

`.claude/launch.json` lives at the repository root and is shared by every
project. **Append a configuration; never write the file.** Overwriting it
removes every other project's entry.

```json
{
  "name": "<slug>",
  "runtimeExecutable": "npm",
  "runtimeArgs": ["--prefix", "<slug>", "run", "dev"],
  "port": 5173
}
```

`--prefix <slug>` is what lets the server start from the repository root. Ports
are shared across the workspace too: a second web project picks a free one and
pins it with `server.port` in `vite.config.ts`, or the two silently fight over
5173.

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
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
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

# web stack scaffold

Moved out of [SKILL.md](SKILL.md) so that the file every lifecycle command
reads carries only what those commands act on. Nothing here is reachable from
`/pm`, `/develop`, `/test` or `/review` — it is read once, by `/new-project`,
when a project is created.

## Scaffold

Two variants, chosen by the project's `**View library:**` line (see
[SKILL.md](SKILL.md)): React, below, and [Preact](#preact-variant) after the
launch config. Everything not named in the Preact variant — `.env.example`,
`.gitignore`, the launch config and the CI workflow — is shared.

```
<slug>/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── index.html
├── .env.example
├── .prettierrc
├── .prettierignore
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── App.test.tsx
│   ├── test-setup.ts
│   └── components/
└── .gitignore        # node_modules/, dist/, .env.local
```

Plus one appended entry in `.claude/launch.json` at the repository root.

Transcribe the files below rather than inventing them. CI runs `format:check`,
`typecheck`, `test` and `build` by name, so a project that names its scripts
differently fails in a way that reads as a CI bug.

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
    "test": "vitest run",
    "format": "prettier --write .",
    "format:check": "prettier --check ."
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
    "prettier": "3.9.10",
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

### Formatting

Prettier, pinned to an exact version (a formatter's output changes between
releases, and an unpinned one makes CI fail on code nobody touched).
`.prettierrc` is the suite's house style, which is what Thrive and Hive use;
change it to the project's own if the project already has code in another
style, and say so in its `CLAUDE.md`. `endOfLine: "auto"` keeps each file's
line endings, so a Windows checkout and CI both pass.

```json
{
  "singleQuote": true,
  "semi": true,
  "trailingComma": "all",
  "printWidth": 120,
  "endOfLine": "auto"
}
```

`.prettierignore` leaves out what is not source: dependencies, build output,
the lockfile, prose and static pages.

```
node_modules
dist
package-lock.json
*.md
docs
public
*.html
```

Run `npm run format` once on the new project before the first commit, so
`format:check` is green from the start. Configure from a trial run, not by
assumption: run Prettier over existing code under candidate options and keep the
set that changes the fewest lines.

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

## Preact variant

For a project whose CLAUDE.md says `**View library:** preact`. Same tree as
above; the files below replace their React counterparts, and the scripts are
named the same so the CI workflow does not change. Transcribe them rather than
inventing them.

### package.json (Preact)

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
    "test": "vitest run",
    "format": "prettier --write .",
    "format:check": "prettier --check ."
  },
  "dependencies": {
    "@preact/signals": "^2.0.0",
    "preact": "^10.25.0"
  },
  "devDependencies": {
    "@preact/preset-vite": "^2.10.0",
    "@testing-library/preact": "^3.2.4",
    "jsdom": "^25.0.0",
    "prettier": "3.9.10",
    "typescript": "^5.7.0",
    "vite": "^6.0.0",
    "vitest": "^3.0.0"
  }
}
```

The Vite/Vitest major rule above applies unchanged, as does the ban on
`--passWithNoTests`.

### tsconfig.json (Preact)

`paths` is what keeps React-ecosystem packages typechecking: their `react`
imports resolve to `preact/compat`. `jsxImportSource` makes JSX compile against
Preact, not React.

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "jsxImportSource": "preact",
    "paths": {
      "react": ["./node_modules/preact/compat/"],
      "react-dom": ["./node_modules/preact/compat/"]
    },
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noEmit": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "types": ["vite/client"]
  },
  "include": ["src", "vite.config.ts"]
}
```

### vite.config.ts (Preact)

The alias repeats what `tsconfig` says. `tsconfig` `paths` only informs the
typechecker; Vite does not read it, so without `resolve.alias` a dependency's
`react` import resolves to nothing at build time.

```ts
import { defineConfig } from 'vitest/config'
import preact from '@preact/preset-vite'

export default defineConfig({
  plugins: [preact()],
  resolve: {
    alias: {
      react: 'preact/compat',
      'react-dom': 'preact/compat',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
})
```

### src (Preact)

`src/main.tsx`:

```tsx
import { render } from 'preact'
import App from './App'

render(<App />, document.getElementById('app')!)
```

`index.html` is Vite's standard one: `<div id="app"></div>` and a module script
pointing at `/src/main.tsx`.

`src/App.tsx`:

```tsx
export default function App() {
  return <h1><slug></h1>
}
```

`src/test-setup.ts` — the same reasoning as the React one: globals are off, so
unmount explicitly:

```ts
import { cleanup } from '@testing-library/preact'
import { afterEach } from 'vitest'

afterEach(cleanup)
```

`src/App.test.tsx` — as above, delete it once the first real test exists:

```tsx
import { render, screen } from '@testing-library/preact'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('renders its heading', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: '<slug>' })).toBeDefined()
  })
})
```

Shared state across components goes in module-level signals, not `useState`:

```ts
import { signal } from '@preact/signals'

export const count = signal(0)
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
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: '20'
          cache: npm
          cache-dependency-path: <slug>/package-lock.json
      - run: npm ci
      - run: npm run format:check || { echo "::error::Unformatted files. Run 'npm run format' and commit the result."; exit 1; }
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
```

Note `cache-dependency-path` — without it the setup-node cache keys off the
wrong lockfile in a monorepo and projects evict each other.

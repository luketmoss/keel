# worker stack scaffold

Moved out of [SKILL.md](SKILL.md) so that the file every lifecycle command
reads carries only what those commands act on. Nothing here is reachable from
`/pm`, `/develop`, `/test` or `/review` — it is read once, by `/new-project`,
when a project is created.

## Scaffold

```
<slug>/
├── package.json
├── package-lock.json
├── tsconfig.json
├── wrangler.toml
├── .dev.vars.example
├── src/
│   ├── index.ts
│   ├── index.test.ts
│   └── env.ts
└── .gitignore        # node_modules/, dist/, .wrangler/, .dev.vars
```

Transcribe the files below rather than inventing them. CI runs `typecheck`,
`test` and `build` by name, so a project that names its scripts differently
fails in a way that reads as a CI bug. Run `npm install` once after writing
`package.json` and commit the `package-lock.json` it produces: CI uses `npm ci`,
which refuses to run without one.

### package.json

```json
{
  "name": "<slug>",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "build": "wrangler deploy --dry-run --outdir dist",
    "deploy": "wrangler deploy",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^5.20261006.1",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0",
    "wrangler": "^4.0.0"
  }
}
```

`build` is a dry-run deploy: it bundles the Worker exactly as a real deploy
would and uploads nothing, needs no Cloudflare credentials, and fails on a bad
`wrangler.toml` or an import that will not bundle. That is the check a typecheck
cannot make.

**No `--passWithNoTests`.** A project with no test files should fail its build,
because that is the truth about it. The example test below keeps the step honest
from the first commit.

### wrangler.toml

```toml
name = "<slug>"
main = "src/index.ts"
compatibility_date = "2025-09-01"

# Non-secret configuration. Secrets are set with `wrangler secret put` and are
# listed in .dev.vars.example.
[vars]
```

Move `compatibility_date` forward deliberately, with the tests passing, not by
reflex.

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true
  },
  "include": ["src"]
}
```

### src/env.ts

```ts
/** Every binding the Worker reads. Add to this before reading `env.X`. */
export interface Env {}
```

### src/index.ts

```ts
import type { Env } from './env'

export async function handle(request: Request, _env: Env): Promise<Response> {
  const { pathname } = new URL(request.url)
  if (pathname === '/health') return new Response('ok')
  return new Response('Not found', { status: 404 })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await handle(request, env)
    } catch (err) {
      console.error('unhandled', err instanceof Error ? err.message : err)
      return new Response('Internal error', { status: 500 })
    }
  },
}
```

### src/index.test.ts

The example test — tests import `describe`, `it` and `expect` rather than
relying on globals. Delete it once the first real test exists; until then it is
the difference between `npm test` proving something and proving nothing.

```ts
import { describe, expect, it } from 'vitest'
import { handle } from './index'

describe('handle', () => {
  it('answers /health', async () => {
    const res = await handle(new Request('https://example.test/health'), {})
    expect(res.status).toBe(200)
  })

  it('404s everything else', async () => {
    const res = await handle(new Request('https://example.test/nope'), {})
    expect(res.status).toBe(404)
  })
})
```

### .dev.vars.example

Every secret the Worker reads, each with a comment saying what it is and where
to get one. Committed; the filled-in copy is `.dev.vars`, which `.gitignore`
already covers.

```
# What this secret is for, and where to obtain it.
SOMETHING_SECRET=
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
          node-version: '22'
          cache: npm
          cache-dependency-path: <slug>/package-lock.json
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
  deploy:
    needs: check
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: <slug>
    env:
      CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
      CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: '22'
          cache: npm
          cache-dependency-path: <slug>/package-lock.json
      - run: npm ci
      - name: Deploy
        run: |
          if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
            echo "::notice::CLOUDFLARE_API_TOKEN is not set - skipping deploy"
          else
            npm run deploy
          fi
```

Note `cache-dependency-path` — without it the setup-node cache keys off the
wrong lockfile in a monorepo and projects evict each other.

The `deploy` job's `if` is what keeps a pull request from ever deploying. The
skip-when-unset step is deliberate: see "Deploying" in [SKILL.md](SKILL.md).

# mobile stack scaffold

Moved out of [SKILL.md](SKILL.md) so that the file every lifecycle command
reads carries only what those commands act on. Nothing here is reachable from
`/pm`, `/develop`, `/test` or `/review` — it is read once, by `/new-project`,
when a project is created.

## Scaffold

```
<slug>/
├── package.json
├── app.json
├── App.js
├── src/
│   ├── screens/
│   ├── components/
│   ├── hooks/
│   └── theme/
└── .gitignore        # node_modules/, .expo/, *.apk, *.ipa
```

## CI workflow

Lint and test only. Builds go through EAS, which is not worth wiring into CI
until there is something to distribute.

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
      - run: npx expo lint
      - run: npm test --if-present
```

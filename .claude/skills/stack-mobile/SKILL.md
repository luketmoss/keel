---
name: stack-mobile
description: Conventions, scaffold, and CI for mobile app projects in Keel (React Native, Expo managed workflow). Use when working in a project folder whose CLAUDE.md names mobile as its stack.
---

# Mobile stack

React Native on Expo, managed workflow. Authoritative for any project whose
CLAUDE.md names `mobile`.

## Testing is partly human-gated

`/test` runs the automated suite and verifies what it can. Acceptance criteria
that require a device — gestures, permissions prompts, Bluetooth, camera,
background behaviour — cannot be checked in CI. Those are listed back explicitly
and the run stops rather than claiming them.

Criteria that are pure logic or component behaviour pass normally, and if all of
an issue's criteria are of that kind the run continues to Ready to Ship.

## Conventions

- Expo managed workflow. Do not eject; if something needs native code, that is a
  decision to raise, not to make silently
- Hooks for anything stateful and reusable — connection handling, permissions,
  persistence. Screens stay thin
- `useRef` for any value read inside a memoised callback. Closures capture at
  definition time and stale values in a `useCallback` are the single most common
  bug in this stack
- `useCallback` dependency arrays stay minimal and honest
- `Pressable` over `TouchableOpacity` — more reliable Android touch handling
- Theme values come from a theme module, never inline hex
- `AsyncStorage` for anything that must survive a force-close

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

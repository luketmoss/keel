---
name: stack-mobile
description: Conventions, scaffold, and CI for mobile app projects in Keel (React Native, Expo managed workflow). Use when working in a project folder whose CLAUDE.md names mobile as its stack.
---

# Mobile stack

React Native on Expo, managed workflow. Authoritative for any project whose
CLAUDE.md names `mobile`.

## Testing is not human-gated

The owner is the only user and has waived the on-device check before merge.
`/test` runs the automated suite (`npx expo lint`, `npm test --if-present`, as
CI does) and verifies what it can.

Criteria that are pure logic or component behaviour pass on evidence.

Criteria that need a device — gestures, permissions prompts, Bluetooth, camera,
background behaviour — cannot be checked in CI. They are **not** passed and
not failed: `/test` lists them back as **waived by the owner, not verified**,
and the run continues to Ready to Ship and merge. They are never reported as
passing.

`/ship` writes those behaviours into the issue's `## Results` as things to watch
after install, with the reminder that the build to install is an EAS build of
the merged `main` commit (CI does not build the app, see
[scaffold.md](scaffold.md)), not a build made for the PR. If one is wrong on the
device the owner reports it and it is fixed as a new issue. In a
multi-component project this applies to the criteria the `mobile/` component
owns.

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

## Scaffold and CI

The project scaffold and the CI workflow template are in
[scaffold.md](scaffold.md), beside this file. `/new-project` reads it when a
project is created; nothing in the issue lifecycle does, which is why it is
not here.

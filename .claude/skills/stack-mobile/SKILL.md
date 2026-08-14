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

## Scaffold and CI

The project scaffold and the CI workflow template are in
[scaffold.md](scaffold.md), beside this file. `/new-project` reads it when a
project is created; nothing in the issue lifecycle does, which is why it is
not here.

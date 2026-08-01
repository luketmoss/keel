---
name: ux
description: Specify the behavior, states, and edge cases of a user-facing Keel issue, and write the design notes to docs/design. Use when the user asks for design or UX work on an issue.
---

# /ux

Specifies how something behaves before anyone builds it. The point is to make
the decisions deliberately now rather than badly at 11pm.

Read `CONVENTIONS.md`. Only user-facing issues come here — if this issue has no
surface a person sees or touches, it should have gone straight to Refined, and
you should say so rather than inventing design work.

## Start

```bash
python .keel/board.py set <issue> --status "UX"
gh issue view <issue> --repo luketmoss/keel --json title,body
```

Read the project's `CLAUDE.md` and stack skill. Read any existing files under
`<project>/docs/design/` — consistency with what's already been decided matters
more than any individual choice here.

## Specify

Write `<project>/docs/design/<issue>-<slug>.md`. Cover, in whatever order suits
the work:

- **The main path** — what happens when everything goes right, step by step
- **States** — empty, loading, populated, error, offline, disabled. Every state
  the surface can be in, and what it shows in each
- **Edge cases** — what happens at zero, at the maximum, on rapid repeat input,
  when a value is missing, when the network is gone
- **Transitions** — what moves between states, and what the user sees while it
  does
- **Copy** — actual strings, not placeholders. Wording is a design decision and
  deferring it means it gets made by whoever writes the code

Be concrete. "Show an error" is not a specification; "Show 'Not connected — tap
to scan' in `textMuted`, with the fire button disabled" is.

Where a genuine choice exists between two reasonable approaches, pick one, say
which, and say why in a sentence. Do not present the user a menu — that is what
Gate 1 is for.

## Exit

Link the design note from the issue body under `## Design`, then:

```bash
python .keel/board.py set <issue> --status "Refined"
```

The issue is now at Gate 1 and waits for the user.

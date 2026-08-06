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

Read the **standing documents** first — every file in that folder whose name
does not start with an issue number, as defined under the UX stage in
`CONVENTIONS.md`. There may be more than one, and they outrank any single issue
note.

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

## Visual language

**Reference tokens by name; never write a raw value.** `--space-4`, not `16px`.
A note that says `16px` is a note whose padding cannot be changed anywhere but
by hand, in every file that copied it — which is how a project ends up with
seven border radii nobody chose.

Where the design language has no token for what the issue needs, say so
explicitly: name the proposed token, its value, and what it is for, under a
`## New tokens` heading in the note. That makes adding to the system a visible
decision rather than a side effect, and it is the only place a raw value
belongs.

A project with no `design-language.md` yet is not a licence to invent freely.
Match the values already in use, and if the issue is the third to reach for
something the system doesn't have, say that the project needs one.

## Exit

Link the design note from the issue body under `## Design`, then:

```bash
python .keel/board.py set <issue> --status "Refined"
```

The issue is now at Gate 1 and waits for the user.

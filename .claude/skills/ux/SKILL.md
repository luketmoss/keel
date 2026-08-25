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

Read the folder's **standing documents** first — `CONVENTIONS.md` defines which
files those are, under the UX stage. There may be more than one, and they
outrank any single issue note.

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

## Measure the numbers

A criterion phrased as a measurement — a pixel width, a character count, "at
least twice the area", "at least Npx" — either holds or it doesn't, and that
can be checked now instead of argued about later. Before such a criterion
ships to Refined, whether it's already in the issue body or one you're about
to write, measure it against the actual running app rather than an assumed
baseline.

Launch through the project's `.claude/launch.json` per the stack skill and
read the real computed value — `getBoundingClientRect()` and friends for the
web stack, per `stack-web/SKILL.md`'s "Verifying a browser UI"; whatever the
equivalent stack skill names otherwise. Record what you measured and where in
the design note, so the number in the criterion has a citation.

If reality contradicts the criterion — the space is smaller than assumed, the
target is arithmetically unreachable at the width the note itself specifies —
revise the acceptance criteria in the issue body to match what you measured,
the same way you'd sharpen a vague criterion into a concrete one. Don't ship a
criterion you already know is false and flag it for later; that's what sent
#193 and #197 to a halted `/test` run instead of a corrected number here.

This only applies to criteria asserting a specific quantity. "Legible" and
"obviously disabled" are judgment calls for a person to make, not something a
`getBoundingClientRect()` call settles.

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

A project with no design language yet is not a licence to invent freely.
Match the values already in use, and if the issue is the third to reach for
something the system doesn't have, say that the project needs one.

## Exit

**Commit and push the note to `origin/main` yourself, before anything else.**
`/develop` commits a design note that's sitting in its own working tree, but it
runs from a fresh worktree branched off `origin/main` — a note left uncommitted
here simply doesn't exist there. The note has to be on `origin/main` before any
`/develop` run, worktree or not, ever branches:

```bash
git fetch origin
git checkout -b ux-note/<issue> origin/main
git add <project>/docs/design/<issue>-<slug>.md
git commit -m "Add design note for #<issue> (<slug>)"
git push origin HEAD:main
git checkout -
git branch -D ux-note/<issue>
```

Base the commit on `origin/main` via the scratch branch, not on whatever the
local `main` happens to be doing — another session's work-in-progress can be
sitting there (see #203), and committing on top of it would drag that state
onto `origin/main` on push.

Link the design note from the issue body under `## Design`, then:

```bash
python .keel/board.py set <issue> --status "Refined"
```

The issue is now at Gate 1 and waits for the user.

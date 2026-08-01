# Keel

> The first structural piece laid down when building a ship. Everything else is
> framed onto it.

A workspace for personal software projects: several projects in one repo, one
shared GitHub Projects board, and a set of Claude Code skills that move work
through a defined lifecycle.

Starting a project means adding a folder — not provisioning infrastructure.

## How work moves

Issues travel through eight stages in two unattended runs, separated by two
gates where work waits for a human.

```
/idea → PM Refining → UX → [ Refined ] → In Development → Testing → [ Code Review ] → Done
        └──── refinement run ────┘         └──────── delivery run ────────┘
                                 gate 1                              gate 2
```

**Gate 1 — Refined.** Do you agree with the solution?
**Gate 2 — Code Review.** Do you agree with the implementation?

Both runs are fully unattended because neither can reach `main`. `/ship` is the
only irreversible action, and the only one triggered by hand.

## Commands

| Command | Does |
|---|---|
| `/idea` | Captures a thought as a well-formed issue |
| `/pm` | Problem statement, acceptance criteria, scope |
| `/ux` | Behavior, states, edge cases → `docs/design/` |
| `/develop` | Cuts the branch, writes the code, opens a draft PR |
| `/test` | Verifies acceptance criteria, takes the PR out of draft |
| `/review` | Reviews the diff, posts comments, checks CI |
| `/ship` | Merges |
| `/new-project` | Adds a project folder, CLAUDE.md, board option, CI workflow |

## Documentation

- **[CONVENTIONS.md](CONVENTIONS.md)** — the rules. Stage definitions, entry and
  exit criteria, issue anatomy, labels, CI. Authoritative.
- **[CLAUDE.md](CLAUDE.md)** — operational notes loaded into every session.

## Board

[github.com/users/luketmoss/projects/6](https://github.com/users/luketmoss/projects/6)

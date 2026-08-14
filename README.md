# Keel

> The first structural piece laid down when building a ship. Everything else is
> framed onto it.

A workspace for personal software projects: several projects in one repo, one
shared GitHub Projects board, and a set of Claude Code skills that move work
through a defined lifecycle.

Starting a project means adding a folder — not provisioning infrastructure.

## How work moves

Issues travel through nine stages in two unattended runs, with one gate between
them where work waits for a human.

```
/idea → PM Refining → UX → [ Refined ] → In Development → Testing → Code Review → Ready to Ship → Done
        └─── refinement run ───┘           └──────────────── delivery run ────────────────────────┘
                               the gate                                          parks here if it can't merge
```

**The gate — Refined.** Do you agree with the solution? It is the one place a
run waits for a person, and the one that decides what gets built.

**The delivery run reaches `main`.** Nothing merges on a judgment call: the
build is green, the review found nothing blocking, and every failure path parks
the issue in Ready to Ship instead of merging. The cost is that a bad run is a
commit to revert rather than a PR to close.

**Ready to Ship is where a run parks, not where it ends.** What rests there
could not finish on its own — a draft PR, a check that failed or never ran, a
conflict — and that is what makes it the inbox worth looking at.

## Commands

| Command | Does |
|---|---|
| `/refine` | Runs the refinement chain to Refined (the gate) |
| `/finish` | Runs the delivery chain through to merged |
| `/idea` | Captures a thought as a well-formed issue |
| `/pm` | Problem statement, acceptance criteria, scope |
| `/ux` | Behavior, states, edge cases → `docs/design/` |
| `/develop` | Cuts the branch, writes the code, opens a draft PR |
| `/test` | Verifies acceptance criteria, takes the PR out of draft |
| `/review` | Reviews the diff, posts comments, checks CI |
| `/ship` | Merges — the only irreversible action; `/finish` runs it |
| `/new-project` | Adds a project folder, CLAUDE.md, board option, CI workflow |

## Documentation

- **[CONVENTIONS.md](CONVENTIONS.md)** — the rules. Stage definitions, entry and
  exit criteria, issue anatomy, labels, CI. Authoritative.
- **[CLAUDE.md](CLAUDE.md)** — operational notes loaded into every session.

## Board

[github.com/users/luketmoss/projects/6](https://github.com/users/luketmoss/projects/6)

# Keel Conventions

The rules every Keel skill reads from. If a command's behavior contradicts this
document, this document is right and the command is a bug.

## What Keel is

A single repository holding multiple software projects, one shared GitHub
Projects board, and the skills that move work through it. Starting a project
means adding a folder — not provisioning infrastructure.

```
keel/
├── CONVENTIONS.md          # this file
├── CLAUDE.md               # monorepo rules, loaded in every session
├── .claude/skills/         # lifecycle + stack skills
├── .keel/                  # board.json, board.py, check.py
├── docs/design/            # keel's own UX artifacts
└── <project-slug>/         # one folder per project
    ├── CLAUDE.md           # names the stack, pins its stack skill
    └── docs/design/        # UX artifacts, one file per issue
```

A session opened in `keel/my-app/` loads both the root `CLAUDE.md` and the
project's own. The project file is what tells Claude which stack skill is
authoritative — never inferred from issue text.

### keel is one of the projects

Its folder is the repository root. Work on the conventions, the skills, `.keel/`,
or CI is a `keel` issue, and everything a project folder gets, keel gets from the
root: its project `CLAUDE.md` is the root `CLAUDE.md`, its stack skill is
`.claude/skills/stack-keel/SKILL.md`, its CI is `.github/workflows/keel.yml`, and
its design notes go in `docs/design/` rather than under a project folder.

There is no `keel/` directory. The rule is location, never inference, and keel's
location is everything no project folder claims — which is also why its workflow
lists its paths explicitly instead of globbing a folder.

### Naming

| Thing | Form | Example |
|---|---|---|
| Project slug | lowercase, hyphenated, no spaces | `drop-tracker` |
| Branch | `<slug>/<issue>-<short-desc>` | `drop-tracker/42-add-purge-command` |
| Tag | `<slug>-v<semver>` | `drop-tracker-v1.2.0` |
| Commit | imperative, references issue | `Add purge command (#42)` |

Branches, tags, and issue numbers are one shared pool across every project in
the repo. The prefixes are what keep them legible — they are not optional.

## Source of truth

**Fields own workflow state. Labels own taxonomy.**

Status lives only in the board's Status field. There are no `status:*` labels —
two places to record the same fact guarantees they disagree.

### Board fields

| Field | Type | Values |
|---|---|---|
| Status | single-select | the 9 stages below |
| Project | single-select | one option per project folder |
| Priority | single-select | P0, P1, P2 |
| Size | single-select | XS, S, M, L, XL |
| Type | single-select | Code, Design, Docs, Chore |

`Project` is a field rather than a label because grouping the board by project
is the primary view, and label-grouping support in Projects v2 is inconsistent.

Adding a project option uses `updateProjectV2Field`, which **replaces the whole
option list**. Existing options must be written back *with their IDs* or every
item already assigned to them is orphaned. Always go through the guarded helper.

### Labels

Kept deliberately thin — anything the board can express should not be a label.

| Label | Meaning |
|---|---|
| `bug` | Something is broken |
| `blocked` | Waiting on something external |
| `spike` | Time-boxed investigation, no shipping expectation |

### Priority

- **P0** — broken or blocking. Nothing else moves until it does.
- **P1** — the current focus. Should be a short list.
- **P2** — real, but not now.

### Size

Time to implement, not including refinement.

XS < 1hr · S 1–2hr · M half day · L 1–2 days · **XL means split it** — an XL
issue is not ready to be worked, it's an epic wearing a disguise.

## How work flows

Stages are granular; the way you actually work is not. Issues move in two
unattended runs, each ending at a gate where they wait for you.

**The refinement run** — `/idea` → PM Refining → UX → stops at **Refined**.
Invoked as "new idea for X and get it refined", or `/idea` alone to capture
without advancing.

**Gate 1 — Refined.** Do you agree with the *solution*? An issue you disagree
with goes back to PM Refining; it does not get fixed in flight.

**The delivery run** — In Development → Testing → Code Review → stops at
**Ready to Ship**. Invoked as "finish up issue X".

**Gate 2 — Ready to Ship.** Do you agree with the *implementation*? The PR is
open, reviewed, and green; nothing has touched main. This column is your inbox —
everything in it is waiting on you and nothing else is.

**The merge** — `/ship`. The only irreversible action in the system, and the
only one you trigger by hand. Nothing merges to main without you asking for it.

Both runs are fully unattended precisely because neither can reach main. Every
atomic transition also exists as its own command, for when a run stalls or a
stage needs re-running. The runs are the interface; the atomic skills are the
mechanism.

## The pipeline

Nine stages. Not every issue touches every stage; the skip rules are explicit
below. A stage with no defined exit criteria is a stage that will silently
collect work forever, so each one has them.

### 1. To Do

Captured, not yet understood. A one-line thought is enough — the whole point is
that capture is cheap. No structure required.

**Exit:** you decide the idea is worth investing thought in. Everything that
never earns that stays here, which is fine and expected.

### 2. PM Refining

What problem, for whom, why now, and what is explicitly *not* included. Produces
a problem statement and acceptance criteria. This is where an idea becomes a
specification.

**Command:** `/pm`
**Exit:** acceptance criteria are written and testable, scope is bounded, and no
open product questions remain. If a question needs your judgment, the issue
stays here with the question stated in the body — it does not advance, and the
refinement run halts rather than guessing.

### 3. UX

How it looks and behaves: states, transitions, empty and error cases, the
interaction details that get invented badly at 11pm if nobody wrote them down.

**Command:** `/ux`
**Skipped when** the issue has no user-facing surface — firmware timing changes,
refactors, build tooling. The refinement run determines this itself and moves
straight to Refined; it is not a question you get asked.
**Output:** design notes in `<project>/docs/design/<issue>-<slug>.md`, linked
from the issue.
**Exit:** the behavior is specified precisely enough to build without inventing.

### 4. Refined

The ready queue. Anything here satisfies the Definition of Ready and could be
started cold without asking a question.

**Definition of Ready**
- Problem statement and acceptance criteria present
- Size assigned, and it is not XL
- UX artifact exists, or the issue legitimately skips UX
- Project, Priority, and Type fields set
- No unresolved questions in the body

**Exit:** selected as next work — the delivery run starts here.

### 5. In Development

Branch cut, code being written.

**Command:** `/develop` — moves the issue here, cuts the branch, and ends by
pushing and opening a **draft** PR linked to the issue.
**Exit:** implementation complete and self-tested, with a draft PR open. Not
"the code is written" — "I ran it and it does the thing."

### 6. Testing

Verified against the acceptance criteria, deliberately and one at a time. For
firmware this means hardware in the loop; there is no substitute and a passing
build is not evidence.

**Command:** `/test`
**Exit:** every acceptance criterion passes and the PR comes out of draft. A
failure sends the issue back to In Development, not forward with a caveat.

Where acceptance criteria cannot be verified without physical hardware, a stack
skill may declare Testing human-gated. The delivery run then halts here rather
than at Ready to Ship, and says so. Firmware is the obvious case — a green build
is not evidence that a solenoid fired at the right microsecond.

### 7. Code Review

The PR is open and out of draft, and is being reviewed or is waiting on CI.
Transient — nothing should rest here. Review comments live on the PR, where they
belong; the board records only that the issue is in review.

**Command:** `/review` — reviews the diff against the acceptance criteria, posts
comments on the PR, and confirms the workflow run passed. Because required
status checks are deliberately not used (see below), that confirmation is the
only thing standing between a red build and a PR that looks ready.

**Exit:** review found nothing blocking and CI is green. Findings send the issue
back to In Development, not forward with a caveat.

### 8. Ready to Ship

Reviewed clean, CI green, PR out of draft, main untouched. Everything is done
except the merge.

**This column is the inbox.** Its whole job is to answer "what is waiting on
me?" at a glance — a question nothing else can answer, because GitHub does not
permit approving your own PR and so records no approval event on a solo repo.
Without this column, an item in Code Review might be un-reviewed, mid-CI, or
ready, and the card looks identical in all three cases.

It is also what lets the delivery run be fully unattended: the run stops here,
so the worst case of a bad run is a PR you close, not a commit you revert.

**Command:** `/ship` — merges, which closes the issue and triggers the build.
The only irreversible action in the system, and never part of a run.
**Exit:** merged.

### 9. Done

**Merged is deployed** — CI builds on merge to main, so there is no separate
deploy stage. Done means the change is live.

Before closing, fill in `## Results` — what actually happened, what surprised
you, what you'd do differently.

This is the highest-value habit in the whole pipeline and the easiest to skip.
Months later the Results section is the only part of the issue anyone reads.

## Continuous integration

One workflow per project, at `.github/workflows/<slug>.yml`, generated from the
project's stack skill — never hand-written. Four rules keep projects from
interfering with each other:

- **Path-filtered triggers**, including the workflow's own file, so editing CI
  tests CI.
- **`defaults.run.working-directory`** set to the project folder, so steps read
  the same as they would in a single-project repo.
- **Concurrency group prefixed with the slug**, or a push to one project cancels
  another project's in-flight run.
- **Cache keys prefixed with the slug**, or projects evict each other's caches.

```yaml
name: drop-tracker
on:
  pull_request:
    paths: ['drop-tracker/**', '.github/workflows/drop-tracker.yml']
concurrency:
  group: drop-tracker-${{ github.ref }}
  cancel-in-progress: true
jobs:
  build:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: drop-tracker
```

**Required status checks are not used.** A required check that is path-filtered
out never reports, and GitHub blocks the PR forever waiting for a run that will
not happen. The workarounds are worse than the problem at this scale, so
`/review` verifies the run instead, and nothing reaches Ready to Ship without a
green build. Do not turn them on in branch protection.

**Secrets are repo-wide** — every workflow can read every secret. If a project
ever needs isolation, scope its credentials with a GitHub Environment.

If a project's CI needs become genuinely incompatible with the others, that is
the signal to extract it into its own repo with `git subtree split`, which
preserves its history. The monorepo is a default, not a commitment.

## Issue anatomy

```markdown
## Problem
What's wrong or missing, and who it affects. Not the solution.

## Proposal
The intended approach. May be revised during refinement.

## Acceptance Criteria
- [ ] Specific, checkable statements
- [ ] Written so someone else could verify them
- [ ] Behavior, not implementation

## Out of Scope
What this deliberately does not cover, so scope creep is a visible decision.

## Results
Filled in at Done. What happened, what surprised you.
```

Sections may be empty in To Do. By Refined, everything above Results is filled.

## Working agreements

- **One issue in progress per project.** Parallel work across projects is fine;
  parallel work within one is how things get abandoned half-done.
- **An issue that stalls goes back, not forward.** Moving a card to Testing with
  known gaps converts a visible problem into an invisible one.
- **Refinement is allowed to kill an issue.** Closing something in PM Refining
  because the problem isn't real is a success, not a waste.
- **Every stage transition is a command**, whether run atomically or as part of
  a chain. A card dragged by hand means the board and the work have diverged,
  and the board is the one that will be believed.
- **The refinement run stops rather than guesses.** A halted chain with an open
  question in the issue body is the correct outcome, not a failure.

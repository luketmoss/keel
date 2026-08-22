# Keel Conventions

The rules every Keel skill reads from. If a command's behavior contradicts this
document, this document is right and the command is a bug.

## What Keel is

A single repository holding multiple software projects, one shared GitHub
Projects board, and the skills that move work through it. Starting a project
means adding a folder — not provisioning infrastructure. The layout is in
[CLAUDE.md](CLAUDE.md), which every session loads before this file.

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
cannot glob a folder the way every other project's does, and ends up triggering
on all of them instead. See §Continuous integration.

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
unattended runs, and there is one gate between them.

**The refinement run** — `/idea` → PM Refining → UX → stops at **Refined**.
Invoked as "new idea for X and get it refined", or `/idea` alone to capture
without advancing.

**The gate — Refined.** Do you agree with the *solution*? An issue you disagree
with goes back to PM Refining; it does not get fixed in flight. This is the one
place a run waits for a person, and it is the one that decides what gets built.

**The delivery run** — In Development → Testing → Code Review → **merge**.
Invoked as "finish up issue X", and it ends on Done.

**The delivery run reaches main.** What makes that acceptable is that nothing
merges on a judgment call: the build is green, `/review` found nothing blocking,
and every failure path parks the issue in Ready to Ship instead of merging. What
it costs is real and worth saying plainly — a bad run is now a commit to revert
rather than a PR to close.

**Ready to Ship is where a run parks, not where it ends.** Transient on the
happy path, the way Code Review is. An issue resting there could not finish on
its own — a draft PR, a check that failed or never ran, a conflict — and every
one of those needs a person. That is what makes the column an inbox worth
looking at: everything in it is waiting on you, and on the happy path nothing
is.

Every atomic transition also exists as its own command, for when a run stalls or
a stage needs re-running — `/ship` on its own is how something that parked gets
merged once its problem is fixed. The runs are the interface; the atomic skills
are the mechanism.

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
a problem statement and acceptance criteria.

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

#### Standing documents

A file in `<project>/docs/design/` whose name does **not** begin with an issue
number is standing: it covers every issue rather than one, and it outranks any
individual note. `design-language.md` is the usual first one, but there is no
fixed list and a project may have several.

Both `/ux` and `/develop` read all of them. Naming is the whole mechanism —
`shell-and-content-model.md` is standing, `109-shell-column.md` is not — so a
standing document never gets an issue number, even when one issue introduced it.

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

**Command:** `/develop` — moves the issue here, cuts the branch, and ends by
pushing and opening a **draft** PR linked to the issue.
**Exit:** implementation complete and self-tested, with a draft PR open. Not
"the code is written" — "I ran it and it does the thing."

### 6. Testing

Verified against the acceptance criteria, deliberately and one at a time.

**Command:** `/test`
**Exit:** every acceptance criterion passes and the PR comes out of draft. A
failure sends the issue back to In Development, not forward with a caveat.

Where acceptance criteria cannot be verified without physical hardware, a stack
skill may declare Testing human-gated. The delivery run then halts here rather
than at Ready to Ship, and says so. Firmware is the obvious case — a green build
is not evidence that a solenoid fired at the right microsecond.

### 7. Code Review

The PR is out of draft and is being reviewed or is waiting on CI. Transient —
nothing should rest here. Review comments live on the PR; the board records only
that the issue is in review.

**Command:** `/review` — reviews the diff against the acceptance criteria, posts
comments on the PR, and confirms the workflow run passed. Since required status
checks are deliberately not used (see `## Continuous integration`), that
confirmation is the only thing between a red build and a PR that looks ready.
**Exit:** review found nothing blocking and CI is green. Findings send the issue
back to In Development, not forward with a caveat.

### 8. Ready to Ship

Reviewed clean, CI green, PR out of draft, main untouched. Everything is done
except the merge. What rests here is the inbox, per `## How work flows` — and
nothing else can answer that question, because GitHub does not permit approving
your own PR, so a solo repo records no approval event and a card in Code Review
looks identical whether it is un-reviewed, mid-CI, or ready.

**Command:** `/ship` — merges, which closes the issue and triggers the build.
The only irreversible action in the system. `/finish` runs it; running it by
hand is for an issue that parked here and has since been fixed.
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
  tests CI. **keel's own workflow is the one exception** — `check.py` validates
  the whole repository, including every project's design notes and markdown
  links, so a filter would leave its trigger narrower than its scope. The
  reasoning is in `stack-keel/scaffold.md`, with the other two deviations keel's
  folder being the root forces.
- **`defaults.run.working-directory`** set to the project folder, so steps read
  the same as they would in a single-project repo.
- **Concurrency group prefixed with the slug**, or a push to one project cancels
  another project's in-flight run.
- **Cache keys prefixed with the slug**, or projects evict each other's caches.

The template is in each stack skill's `scaffold.md`, filled in for that stack.
Copy it from there rather than reconstructing one from these bullets.

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
- **A gate is where the session ends.** The refinement run, the delivery run and
  `/ship` are each their own session, because a session that spans all three
  carries every file the earlier stages read into the later ones and pays for
  them again on every turn. The cost is re-reading this file and the project's,
  and it doubles as the check: a run that cannot start cold from the issue and
  the board means the issue is underspecified, which is what Gate 1 is for.
  This is about the seams *between* runs — each run is still unattended
  end to end.

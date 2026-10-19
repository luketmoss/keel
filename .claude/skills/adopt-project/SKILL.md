---
name: adopt-project
description: Plan and file the move of an existing repo into Keel - an epic with child issues, nothing moved. Use when the user wants to import, migrate, adopt, or fold an existing repository into the Keel workspace.
---

# /adopt-project

Plans the move of an existing repo into Keel and files it as an epic with
child issues. **It moves nothing.** The moves happen in the children's delivery
runs, which follow [procedure.md](procedure.md). `/new-project` is for a folder
that does not exist yet; this is for a repo that does.

Read `CONVENTIONS.md` first. The wording of every question, stop, plan and
report is in
[docs/design/441-adopt-project.md](../../../docs/design/441-adopt-project.md);
use its copy. If the user asks for the move itself, say that this plans and
files, that the moves are the children's delivery runs, and that it does not run
`git filter-repo`.

## 1. Interview

One round, one message, numbered, each question carrying a proposal in
brackets. Exactly seven things:

1. **Old repo** - `owner/name`.
2. **Slug** - propose the repo name.
3. **Components** - each one's path and stack. Propose from the repo's
   top-level folders. Every component must have a stack skill under
   `.claude/skills/stack-*`.
4. **Live URL** - propose from the repo's Pages settings.
5. **Syncs, scheduled jobs, rotating tokens or Apps Script triggers** - decides
   whether there is a flip. Triggers cannot be seen from the repo; ask.
6. **Registry** - does its colour and icon already follow the registry in
   `ui/`. Look for the slug there and propose.
7. **Who else uses it** - decides whether the cutover has a second user's step.

A question the user's message already answered is shown as settled, one line,
and not asked. "None" and "just me" are complete answers to 5 and 7. Ask
nothing else: what the procedure needs and the old repo holds (the script ID,
the secret names) is read from the old repo, not asked.

## 2. Stops

Check the answers before planning. A stop names the cause and the way out, uses
the note's copy, and files nothing:

- **Slug taken** - the folder exists, or `python .keel/board.py projects` lists
  it.
- **A component has no stack skill** - never guess one. The user pins it to
  `-` or the skill is written first.
- **Old repo unreadable** - `gh repo view <old>` fails.
- **Epic already exists** - search open and closed issues for the title
  `Move <Name> into Keel`. That is also the resume path.

## 3. Plan

Show the plan from the note, then ask one question: file it. Three blocks:

- **Finish-first list** - the old repo's open issues, listed with
  `gh issue list --repo <old>`. The user says which finish in the old repo's own
  pipeline. The old repo is frozen after that. "None" when it has nothing open.
- **Children, in dependency order**, each with what it waits on. Always:
  import, deploy, cutover, tail. Add **identity** only when the colour or icon
  is not yet in the registry, and **syncs** only when question 5 found syncs,
  scheduled jobs, tokens or triggers. The tail is its own issue, depends on the
  cutover, and holds the time-based checks and the archive, so the cutover can
  close.
- **Manual steps**, each with the issue it blocks. A step that needs a person
  is never worded as something the skill does. Credentials are named, never
  requested in chat. A project with a flip lists the flip's steps in the order
  `procedure.md` runs them.

End with the usage-headroom rule (safety rule 4) and `File this? (yes / no /
change something)`. "Change something" returns to the interview with the
answers filled in. A no, or silence, files nothing and says so.

## 4. File

Only on a yes. Through `/idea`, in this order: the epic `Move <Name> into
Keel`, then each child. Every child's body cites `procedure.md` by path and the
section it follows, and carries its own acceptance criteria, rollback line and
the safety rules below by reference. Then link each child to the epic as a
sub-issue, as `/pm` §"When the user approves a split" describes.

File to To Do and stop there. Never refine, advance or start anything filed.

If filing fails partway, stop, list what was filed and what is missing, and do
not retry; running the skill again meets the "epic already exists" stop. A child
that could not be linked is listed under `Not linked:` with the command, and the
epic is never reported complete with one.

Report in at most 12 lines: the epic and children, that all are in To Do, the
one next action, and the user's first manual step.

## Safety rules

Stated in the plan and inherited by every child:

1. **The old repo is frozen** after its finish-first list: no commits, PRs,
   settings or issue edits, except the steps marked **[old repo]** (disabling
   workflows, the redirect PR, the archive).
2. **Nothing deploys Apps Script from Keel before the cutover**, and a session
   never runs `clasp push` or `clasp deploy` at all (`stack-apps-script`). A
   push by the owner starts from a fresh `origin/main`, after a diff of Keel's
   `src` against the frozen checkout.
3. **A live gate is never set outside the flip.** A `<SLUG>_SYNCS_LIVE`-style
   variable stays unset until the flip. Rotating-token files are never touched
   and no authorize script is run: copy existing values.
4. **A risky step starts with about half a usage window left.** The flip and
   the cutover are the risky steps. Check with `get_usage` if available,
   otherwise ask.
5. **Manual steps are batched and never block a lane.** A credential never goes
   through chat.

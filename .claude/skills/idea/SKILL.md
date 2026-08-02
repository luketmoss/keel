---
name: idea
description: Capture a thought as a well-formed issue in To Do on the Keel board. Use when the user has a new idea, wants to file something, or says to remember or capture a piece of work.
---

# /idea

Turns a rough thought into an issue on the board. Capture is meant to be cheap —
this should take one exchange, not an interview.

Read `CONVENTIONS.md` for issue anatomy.

## Which project

Determine it, don't ask if you can tell:

1. If the session is inside a project folder, that's the project
2. If the user named one, use it
3. Otherwise list options with `python .keel/board.py projects` and ask

Work about the workspace itself — conventions, skills, the board — is `keel`.

## Write the issue

A To Do issue does not need to be complete. It needs to be **recoverable** — you
must be able to tell in three weeks what you meant. Capture the thought and any
context the user gave; do not invent acceptance criteria, and do not pad thin
ideas into fake structure.

- **Title** — specific and searchable. "Fix the thing" is not a title
- **Problem** — what's wrong or missing, in the user's own framing
- **Proposal** — only if the user offered one. If they didn't, leave it out
  rather than inventing an approach they haven't considered

Leave Acceptance Criteria, Out of Scope, and Results absent. `/pm` fills those
in, and a stub full of empty headings makes the issue look further along than it
is.

## Create it

```bash
gh issue create --repo luketmoss/keel --title "..." --body "..."
python .keel/board.py set <number> --status "To Do" --project <slug> --type <Code|Design|Docs|Chore>
```

On Windows, if the title starts with `/` — an idea about a skill, e.g.
`/ship asserts...` — Git Bash rewrites it to a filesystem path
(`C:/Program Files/Git/ship asserts...`) before `gh` ever sees it. Prefix the
command with `MSYS_NO_PATHCONV=1` whenever the title starts with `/`.

Set Priority only if the user signalled urgency. Leave Size alone — sizing is a
refinement judgment and guessing it here just puts a wrong number on the board.

## Report

The issue number, title, and URL. One line.

If the user asked to have it refined as well — "new idea for X and get it
refined" — continue into `/refine` rather than stopping here.

# #441 - /adopt-project

What the user sees when they run `/adopt-project`: the interview, the plan, the
confirmation, the report. The procedure itself is in the issue and in
`procedure.md`. Nothing is visual, so there are no tokens. The surface is text
in the terminal or chat, in the style of `/new-project` and `/review`.

## The main path

1. The user runs `/adopt-project`, with or without details ("adopt luketmoss/hive").
2. The skill asks the seven questions in **one message**, skipping any already
   answered, and proposes a value for each it can infer (slug from the repo name,
   components from the repo's top-level folders).
3. It checks the answers: the slug is free, every component has a stack skill.
4. It shows the plan and asks one question: file it?
5. On a yes it files the epic and children, links them, and reports.

## The interview

One message, numbered, proposals in brackets. Real example (Hive):

> Seven questions, one round. Answer what differs from my proposal.
>
> 1. Old repo: `luketmoss/hive` [from your message]
> 2. Slug: `hive` [from the repo name]
> 3. Components and stacks: `frontend/` web, `apps-script/` apps-script [from the folders; confirm]
> 4. Live URL: `https://luketmoss.github.io/hive/` [from the repo's Pages settings]
> 5. Syncs, scheduled jobs, rotating tokens or Apps Script triggers? [I found none in `.github/workflows/`; Apps Script triggers I cannot see, so tell me]
> 6. Does its colour and icon already follow the registry in `ui/`? [I could not find `hive` in the registry; tell me]
> 7. Who else uses it? [nothing to infer]

Rules:

- A question the user's message already answered is not asked; it is shown as
  settled, one line, so they can correct it.
- "None" and "just me" are valid answers to 5 and 7. They are not followed up.
- The skill does not ask about anything else. Where the procedure needs a value
  it can read from the old repo (the script ID, the secret names), it reads it
  and does not ask.

## Stops

A stop names the cause and the way out, and files nothing.

| Cause | Copy |
|---|---|
| Slug taken | `Can't adopt as "hive": the folder exists / the board already has a "hive" option. Pick another slug, or tell me this is a resume and I'll look for the epic instead.` |
| Component without a stack skill | `"scripts/" has no stack skill, and I won't guess one. Either pin it to "-" (no stack skill, its CLAUDE.md is its only authority) or write the skill first.` |
| Old repo not found | `I can't read luketmoss/<name>. Is it private, or is the name different?` |
| Epic already exists | `"Move Hive into Keel" is already #439 with 6 children. Resume from it, or file a second epic?` |

## The plan

Shown after the interview, before anything is filed. Three blocks.

```
Plan: move luketmoss/hive into Keel as `hive`

In the old repo first (yours, through its own pipeline), then freeze it:
  - #288 Archive a board
  - #293 Remove the Custom GPT
  (I list the old repo's open issues; you tell me which finish first.)

Issues I'll file in Keel, in order:
  1. Import with history, project file and CI        no dependency
  2. Deploy at /keel/hive/                           after 1
  3. Cut over: redirect, transfer issues, close board after 2
  4. Confirm, then archive the old repo              after 3
  (no flip: no syncs or triggers. no identity issue: the icon is in the registry)

Your steps, and what each blocks:
  - Set HIVE_GOOGLE_CLIENT_ID and HIVE_SPREADSHEET_ID     blocks 2
  - Verify at the new URL, sign in                        blocks 3
  - Tell the other user, then they reinstall the app      blocks 3
  - Say yes to the redirect merge                         during 3
  - Say yes to the archive                                during 4

Start step 3 only with about half a usage window left.
File this? (yes / no / change something)
```

Rules:

- Blocks 2 and 3 are always there. Block 1 has a line saying "none" when the old
  repo has nothing to finish.
- A step that needs a person is never worded as something the skill will do.
  "Set the secrets" names the secrets and says they are identifiers or
  credentials; credentials are named, never requested in chat.
- A project with a flip lists its flip steps under "Your steps" in the order the
  procedure runs them.
- "change something" returns to the interview with the plan's answers filled in.
  A no files nothing and says so.

## The report

After filing, at most 12 lines:

```
Filed: epic #439 "Move Hive into Keel"
  #442 Import ...   #443 Deploy ...   #444 Cut over ...   #445 Confirm and archive ...
All are in To Do, linked as sub-issues of #439.
Next: finish the old repo's list, freeze it, then `/refine 442`.
Your first step: set the two secrets before #443 runs.
```

Rules:

- It says "To Do". The skill never refines or advances anything it files.
- It names the one next action, not the whole plan again.
- If linking a child as a sub-issue failed, that child is listed under "Not
  linked:" with the command to link it. The epic is never reported complete with
  an unlinked child.

## Edge cases

- **The user answers no, or stops replying:** nothing is filed. There is no
  half-filed state to clean up, because filing starts only after the yes.
- **A failure partway through filing:** the skill stops, lists what it filed and
  what is missing, and does not retry. Running it again hits the "epic already
  exists" stop, which is the resume path.
- **Forage-like repo with a flip:** the plan gains the syncs issue and the flip
  steps; the report lists one more child. Nothing else changes.
- **The user asks it to just do the move:** it says it plans and files, and the
  moves are the children's delivery runs. It does not run `filter-repo`.

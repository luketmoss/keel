# #508 — `/finish` on several issues

What the user reads when `/finish` is given an epic or a list: one plan line
at the start, one line as each issue ends, and one report at the end. The
subagents' own reports are not shown in full; they are the orchestrator's
input, and the batch report is built from them. Terms follow `CONVENTIONS.md`.

Nothing here is visual, so there are no tokens. The surface is text in the
terminal or chat.

## The main path

1. The orchestrator resolves the request to an ordered list and prints the
   plan, before starting anything.
2. It delivers each issue in turn through a subagent. As each one ends it
   prints a progress line.
3. When the list is done or the batch stops, it closes any epic that is now
   complete and prints the batch report.

## Copy

**Plan line**, printed once:

```
Batch: 5 issues in order — #446, #447, #448, #452, #453 (from #440, #449).
Skipped: #466 (PM Refining).
```

The `(from …)` names the epics the request expanded, in request order, and is
left out when the request was a plain list. The `Skipped:` line appears only
when something was skipped. Each skipped issue is shown with its stage, joined
by `, `.

**Progress line**, one per issue as it ends:

```
#446 Done — PR #461, a1b2c3d (sonnet)
#450 Parked in Ready to Ship — PR #476 changes human-reviewed paths (sonnet)
#447 Halted in In Development — AC3 fails: focus ring 2.8:1 on gold (sonnet)
#447 Re-running on opus (§Models: unclear fix)
```

The model is the one the subagent ran on. The reason after the dash is the
subagent's own one-line reason, unedited.

**Batch report**, printed at the end. When everything merged:

```
Batch finished — 5 of 5 merged.

  #446  PR #461  a1b2c3d  Hive consumes the suite token stylesheet
  #447  PR #462  d4e5f6a  Hive's light-mode primary passes AA
  ...

Closed epics: #449, #440.

Notes:
  - <anything a subagent reported that didn't block, prefixed with its issue>
  - <any judgment call a subagent said could have gone the other way>
```

When it stopped:

```
Batch stopped at #450 — 3 of 5 merged.

  #446  PR #461  a1b2c3d  Hive consumes the suite token stylesheet
  ...
  #450  Parked in Ready to Ship — PR #476 changes human-reviewed paths:
          mcp/src/hive/tools.ts
          mcp/test/fixtures/hive-stdio-tools.json
  #452  not started — still Refined
  #453  not started — still Refined

Open epics: #449 (2 of 2 children not done).
Review the diff, then run /ship 450, and /finish 452 453 to carry on.
```

The last line names the command that fixes the stop: `/ship <n>` for a park,
`/finish <n>` for a halt in development or testing. It then names the
`/finish` that resumes the rest. A park on a human-reviewed path lists its
paths exactly as `393-human-reviewed-paths.md` does: at most five, then
`and N more`.

`Notes:` is left out when no subagent reported anything.

## States and edge cases

- **Nothing to do.** Every issue was skipped:
  `Nothing to deliver — no issue in the request is in Refined.` followed by
  the `Skipped:` line. No subagent starts.
- **An epic with no open children.** It expands to nothing. If it's still
  open, it's closed with the Results described in the issue, and listed under
  `Closed epics:`.
- **The same issue named twice** (directly, and inside an epic) is delivered
  once, at its first position.
- **A re-run on opus succeeds.** Its progress line reads as Done, and the
  report's row carries `(opus re-run)` after the title.
- **A re-run on opus fails too.** The batch stops there. The row shows the
  re-run's reason, not the first run's.
- **A subagent returns no usable report** (an API error or the session limit).
  This is treated as a halt with the reason `subagent ended without a report`,
  and is never retried. The issue's board stage is read with `board.py show`
  and given in the row, because the run may have stopped part way through.
- **Human-gated Testing** (firmware, device-dependent mobile). The row reads
  `Halted in Testing — needs hardware: AC2, AC4` and the batch stops.

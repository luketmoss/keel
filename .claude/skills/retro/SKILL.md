---
name: retro
description: Review the session that just happened for improvements to the skills, CONVENTIONS.md, CLAUDE.md, and the board workflow. Use when the user asks for a retro or retrospective, or asks what could be improved about how the work went.
---

# /retro

Looks at the session that just happened and asks what should change about the
machinery that produced it — the skills, `CONVENTIONS.md`, `CLAUDE.md`, the
board, `.keel/`.

Read `CONVENTIONS.md` and `.claude/skills/stack-keel/SKILL.md` first. Everything
this proposes lands in keel, and keel's rules govern it.

**Scope is the machinery, not the work.** Whether the code was any good was
`/review`'s job and it already ran. The question here is only ever: what would
have had to be written down differently for this session to have gone better?

## Evidence, or it didn't happen

Every finding names something that **actually happened this session** — a file
read and never used, a command that needed a second attempt, a decision made
with no rule to make it from, a rule followed that produced the wrong thing.
Cite the step or quote the text.

A retro that reasons from what *could* go wrong produces plausible,
unfalsifiable prose that every future session pays to load. That is worse than
no retro at all. If the session was clean, say so and stop — a retro with no
findings is a correct outcome, the same way a halted refinement run is.

## Prefer deletion

The fix for almost anything is more words in a skill, and a skill is read every
time it runs. Added text costs tokens forever; a one-off mistake costs them
once.

Before proposing an addition, ask what it prevents and how often. Then look for
the opposite, because it is the harder thing to see: a paragraph loaded and
never load-bearing, a rule stated in `CLAUDE.md` and again in `CONVENTIONS.md`,
a skill section that restates what the reader has already read. Removals are
findings too, and they are the ones this skill exists to find.

## Where to look

- **Token cost** — files read that the work never used; a chain skill that reads
  every step's instructions up front when a step turns out to be skipped; the
  same rule in three places
- **Wrong turns** — a step retried, a tool called twice, an assumption corrected
  later. For each, ask what a skill would have had to say to prevent it
- **Gaps** — a judgment call made with nothing to make it from. If the session
  invented a rule and the rule was right, it belongs somewhere
- **Drift** — a skill contradicting `CONVENTIONS.md`, or describing a field,
  command, or board state that has since changed. `CONVENTIONS.md` wins and the
  skill is the bug
- **Ceremony that paid nothing** — a required step that produced no decision, or
  a gate nobody could have failed

## Rank

Order by how often the problem recurs, not by how irritating it was once. A gap
that hits every issue outranks a wrong turn that hit once and cost a round trip.

Say plainly which findings you would not act on and why. A list where everything
matters is a list nobody acts on.

## Exit

**Propose; do not edit.** The skills and `CONVENTIONS.md` are what every other
command reads. Editing them from inside the session that found the problem is
the one change no gate would ever see — and a retro is exactly the situation
where the reasoning feels most obviously correct at the time.

Report the ranked findings and ask which to file. Then, for each one taken,
follow `.claude/skills/idea/SKILL.md`. One issue per finding that stands on its
own; findings that only make sense together are one issue, not three.

Filing every finding automatically is its own failure — a board full of
machine-generated chores buries the work that came from a person.

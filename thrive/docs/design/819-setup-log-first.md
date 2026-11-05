# #819 — Set up next: the log card before the setup

Amends [#674](674-lift-set-up-next.md) §The screen, and its compact
must-stay-visible rule. Everything not named here is unchanged: the cards
themselves, Start <group>, the states and the edge cases.

## Why the order changes

#674 put the exercise cards first and the previous group's log card after them,
"one scroll away". In use, the moment Set up next opens is the moment the last
set's effort is easiest to judge. With the log card below the setup, marking it
takes a scroll every time, and a forgotten scroll leaves the set without an
effort until the summary. The rest screen already shows its clock, then the log
card, then what comes next. Set up next now does the same.

## The screen

Content, top to bottom, inside `.lift-content.lift-setup`. This replaces #674's
order of 1, 2, 3, 4.

| # | Part | From #674 |
|---|---|---|
| 1 | Since-last-set line | §1, unchanged |
| 2 | The previous group's log card, then its "earlier sets without effort" line when there is one | §4, moved up |
| 3 | Group heading: badge, meta, "Set up" | §2, unchanged |
| 4 | One card per exercise | §3, unchanged |
| 5 | Action bar: Start <group> | §5, unchanged |

The gap between parts is the screen's existing `--space-md` (`--space-sm` in
compact), so the log card and the heading are spaced like every other pair of
cards. No divider and no new heading. The log card's own title ("Log the set
you just did" / "Log this round") already says what it is, and "Set up" right
under it starts the next part.

`SetupScreen` takes the log card as its `children`, as now. It renders them
after the since-last-set line and before the heading. The `children` doc
comment changes to say so.

## States

| State | Shows, top to bottom |
|---|---|
| Between groups (a last set exists) | Since line, log card (and the earlier-sets line), heading, exercise cards |
| Before the first group (Start working sets, Start workout with no warm-up, opening from Logbook at a section's start) | Heading, exercise cards. No since line and no log card, as #674 says |
| Every set in the round was skipped (the log card has no items) | Since line, heading, exercise cards. `LogCard` renders nothing for an empty round, so nothing sits between the since line and the heading |
| Starting (Start <group> pressed) | As between groups. The log card's controls stay as they are, and Start reads "Starting…" |
| Reload during setup | As between groups, in the new order |

## Compact (`@media (max-height: 560px)`)

The same order. No `order:` rule moves the log card back below the setup. (The
rest screen's compact rule that puts Up next above its log card is #580's and
stays as it is: see Out of scope in the issue.)

#674's rule "must stay visible without scrolling at 412 × 480: the group badge
and title, the first exercise's name, and Start" now applies only **before the
first group**, where there is no log card. Between groups, what must stay
visible at 412 × 480 is the effort pills of the log card's first set, and
Start.

## Measured

Measured on 2026-11-04 in demo mode ("Upper Pull A", Lift Mode), on #674's
current layout, with the log card moved above `.lift-setup-head` in the DOM to
read the proposed positions. All figures are `getBoundingClientRect()` in CSS
px, scrolled to the top.

| Viewport | Screen | Today: effort pills' bottom | Proposed: effort pills' bottom | Action bar's top |
|---|---|---|---|---|
| 375 × 667 | Set up Superset 1, after Primary (one set in the log card) | 918 | 296 | 582 |
| 375 × 667 | Set up Superset 2, after Superset 1 (a round of two) | below the fold | 296 (A), 457 (B) | 582 |
| 412 × 480, compact | Set up Superset 1, after Primary | below the fold | 265 | 411 |

So at 375 × 667 both sets of a two-exercise round can be rated without
scrolling. In compact, a one-set log card sits at 93–290 and the group heading
follows it at about 319–372, so the badge and title still show above the action
bar there too. The first exercise's name doesn't, which the rule above accepts.

## Copy

No new strings and no changed strings.

## New tokens

None.

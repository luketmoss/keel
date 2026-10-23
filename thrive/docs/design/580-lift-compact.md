# 580 — Compact Lift Mode for split screen

Part of #575. It changes how #577's and #578's screens size themselves in a
short window, not what they contain. Prototype: the YouTube "Split screen"
control at https://claude.ai/artifact/87xdgi7Pe4ce6BJ8GqYgWz.

## Where the numbers come from

**Thrive's share of the screen.** Android split screen gives each app a
resizable share of the phone's height. On a 412 × 915 CSS px phone, with YouTube
taking about 40% (enough for a 16:9 video and its controls), Thrive gets
about 480 CSS px under the divider. The acceptance criteria use 412 × 480 and,
for a smaller phone, 360 × 440.

**The threshold** is `max-height: 560px`. Below it, the full layout's set
screen cannot fit:

| Element | Height |
|---|---|
| Header | about 60 |
| Set clock (`--lift-clock-size`) | 72 |
| Name, target, badge and padding | about 200 |
| Last-time and next cards | about 110 |
| Action bar | 84 |
| **Total** | **about 526**, before any scrolling margin |

These figures are summed from the prototype's CSS sizes. They were not
measured in a running app: Lift Mode does not exist yet, so there is nothing to
measure. `/test`
measures the real screens against the criteria with `getBoundingClientRect()`
per the web stack skill.

## The tab bar

Lift Mode hides Thrive's bottom tab bar at every height. The action bar is the
bottom of the screen, and the tab bar's 64px (`--nav-height`) is better spent
on content. Leaving Lift Mode, by finishing, switching or navigating back,
brings the tab bar back.

## Compact rules (`@media (max-height: 560px)`)

| Element | Full (#577) | Compact |
|---|---|---|
| Header padding | `--space-sm` `--space-md` | `--space-xs` `--space-md` |
| Workout name | `--text-lg` | `--text-base` |
| Content padding and gap | `--space-md` | `--space-sm` |
| Card padding | `--space-md` | `--space-sm` `--space-md` |
| Tip cards | shown | hidden |
| Set clock | `--lift-clock-size` (4.5rem) | `--figure-xl` (2.75rem) |
| Exercise name (set screen) | `--text-2xl` | `--text-xl` |
| Last-time and next cards (set screen) | two cards | merged into one card of two `--text-sm` lines |
| Rest ring | `--lift-ring-size` 132px | 84px |
| Rest clock in the ring | `--figure-md` | `--text-xl` 700 |
| Rest label | `--text-xl` | `--text-lg` |
| Rest-screen order | hero, log card, Up next | hero, Up next, log card |
| Up next exercise name | `--text-xl` | `--text-base` 700 |
| Action bar padding | `--space-md` | `--space-sm` `--space-sm` `--space-md` |
| Primary button height | 52px | 44px |
| All sets sheet height | up to 86% | up to 92% |
| Toast position | under the header | under the header (it follows the header, so it stays in Thrive's half) |

**Touch targets.** Every button keeps at least 44 × 44 in compact: the
steppers (already 44, per #576), the effort pills (min-height 44), Skip set and
Start set.

**Moving the divider.** The query is live, so moving the split divider across
560px swaps the layout in place. The state is in signals and the stored run
state, not in layout, so the step and its clock carry on.

**Reduced motion.** It applies as in #577.

## What must stay visible without scrolling at 412 × 480

- **Set screen:** the badge, exercise, target, set clock and Done.
- **Rest screen** (content scrolled to the top):
  - the ring with the clock, the label and the overtime line;
  - Up next's heading, exercise and "Set n of N";
  - Skip set and Start set.

  The log card starts below and scrolls.

## Copy

No new strings.

## New tokens

| Token | Value | For |
|---|---|---|
| `--lift-ring-size-compact` | `84px` | the ring in compact; `--lift-ring-size` is #577's |

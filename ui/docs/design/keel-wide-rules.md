# Keel-wide design rules

Standing reference, not an issue note. It covers every app, which is why it has
no number, and it outranks any single note.

Keel has two design languages by decision: Alpenglow for cairn, in
[`cairn/docs/design/design-language.md`](../../../cairn/docs/design/design-language.md),
and the suite language for Thrive, Hive and Forage, in
[`suite-language.md`](suite-language.md). They differ on purpose. This document
is what every app keeps **whichever language it uses**, so that the apps feel
related without sharing a stylesheet.

**Every rule here is one cairn already keeps.** Alpenglow is not changed by
writing this down, and a rule cairn broke would be a rule written to be broken.
Where cairn's own notes show a gap against a rule, the rule's section says so
instead of leaving it out.

Each rule gives what it requires, why, how each language keeps it, and how to
check it. "The suite" means the suite language. Where `suite-language.md` does
not yet say how it keeps a rule, the line says that and names the issue that
brings Thrive into line, so the gap is visible rather than assumed away.

## One colour per app, from the registry

**Requires.** Each app has one brand accent and one interactive colour per
theme, taken from the registry below. A new app takes an unassigned hue. Red is
excluded.

**Why.** The accent is the only thing that tells the apps apart on a phone.
Two apps sharing a hue is two apps nobody can tell apart, and red reads as
danger, which is a meaning every language reserves.

**Cairn.** One accent, spent on interaction: `--accent`, in the Colour section
of cairn's design language.

**The suite.** Two tiers, `--color-accent` for the brand and `--color-primary`
for everything interactive, in the Accent section of `suite-language.md`. The
values live in the registry, not there.

**Check.** The app's accent and interactive colours match its registry row, and
no two rows share a hue.

### The registry

Measured with the WCAG relative-luminance formula against each app's own
surfaces, from each app's stylesheet on 2026-10-13. "As text" means 4.5:1 and
"as a fill or ring" means 3:1.

| App | Hue | Brand accent | Interactive, light | Interactive, dark |
|---|---|---|---|---|
| cairn | orange | `#FF7A4D` | none: Alpenglow is dark only | `--accent` `#FF7A4D` |
| Thrive | cobalt | Thrive's `--color-accent` | `#2f66f0` | `#6e97ff`, with dark text (`--color-on-fill` `#121212`) on its fills |
| Hive | gold | gold | `#805F00`, specified by #447 (shipped: `#C49200`) | `#F5B700` |
| Forage | green | green | `#357A38` | `#66BB6A` |
| none | amethyst | unassigned | unassigned | unassigned |

| App | Measured | As text | As a fill or ring |
|---|---|---|---|
| cairn | 6.31 on `--surface` `#1B1F33` | passes | passes |
| Thrive, light | 4.91 on white, 4.38 on `--color-bg` | fails on `--color-bg`; text uses `--color-primary-text` `#2452c9`, 5.99 on the page | passes |
| Thrive, dark | 6.22 on `--color-surface` `#1a1a1e`; `#121212` on the fill 6.72 | passes | passes |
| Hive, light | `#805F00`: 5.91 on white, 5.27 on `--color-bg`, 4.57 on the tightest tint (an 18% tint of itself); white on the fill 5.91 | passes | passes |
| Hive, light, as shipped | `#C49200`: 2.82 on white | fails | **fails**: below 3:1 even as a ring |
| Hive, dark | 9.25 on `#1e1e1e` | passes | passes |
| Forage, light | 5.26 on white, 4.69 on `--color-bg` | passes | passes |
| Forage, dark | 7.05 on `#1e1e1e` | passes | passes |

Hive's light value was recorded as failing rather than left out, because the
registry is where that should be visible. #447 specifies the replacement: the
same gold, 44.5° of hue against 44.7°, darkened to `#805F00` (hover `#6B5000`),
measured against every surface the stylesheet draws it on in
`hive/docs/design/447-light-primary-aa.md`. Until it ships, Hive's stylesheet
still holds `#C49200`, which is why the shipped row stays. The brand accent
`#F5B700` is unchanged, and so is Hive's dark value.

**Excluded: red.** It reads as danger in both languages. An app whose accent is
red cannot show a destructive action as different from its own chrome.

**Unassigned: amethyst.** The next app takes it unless it has a reason not to.
When it does, it adds a row here with its measurements.

## Contrast meets AA, muted text included

**Requires.** Text is 4.5:1 on every surface it is drawn on, or 3:1 at 24px
and up, or at 18.66px and up when bold. That includes muted and placeholder
text. Focus rings, field outlines and state indicators are 3:1. Where an app's
interactive colour misses 4.5 as text, the app supplies a separate text step,
as Thrive's `--color-primary-text` does, rather than drawing text in it.

**Why.** Muted text is where contrast quietly fails: it is chosen to recede,
and nobody re-measures it against the tinted surfaces it lands on.

**Cairn.** The Contrast table in cairn's design language measures `--text-muted`
at 5.37 on `--surface` and 4.60 on `--surface-lift`, and names the second as the
tightest row to re-check before any change.

**The suite.** The Neutrals section of `suite-language.md` measures muted text
at every place it is drawn, down to 4.51 on `--color-border-light`, and says an
app below 4.5 on any of them migrates to those values.

**Check.** Measure every text and surface pair the change introduces, muted and
placeholder included, and every ring and outline against the surface it sits on.
Record the tightest pair.

## Destructive actions confirm, and say what they destroy in words

**Requires.** A destructive action asks first. The confirm names the thing, by
its name where it has one, and says what goes with it. The confirming control is
a verb phrase naming the thing, "Delete workout", never "OK" or a bare "Yes".
The confirm is an inline step or an in-app dialog, and **never the browser's
`confirm()`**, which cannot use the app's words or states. Colour is never the
only signal that an action is destructive.

**Why.** A misfired delete is not always recoverable. A native dialog cannot say
what will be lost and cannot be styled to match, and a destructive control that
relies on colour alone fails for anyone who cannot tell that colour apart.

**Cairn.** The inline confirm: "Danger cannot rely on colour" in cairn's design
language, with `33-trips-list.md` replacing the row in place and ruling out the
native `confirm()` by name. `132-remove-photo-from-trip.md` and
`147-derived-status-and-today.md` apply it to a photo and to the trips-panel
row menu. Cairn's confirming button there is labelled "Delete", which is short of the
verb phrase this rule asks for; its prompt names the thing instead.

**The suite.** `suite-language.md` has the Danger status token and requires an
icon and a word with it, but does not yet specify the confirm. Thrive's
`window.confirm` calls are the gap, closed by #403.

**Check.** Search the app for `confirm(`; there are none. Trigger each
destructive action: the confirm names the thing and its consequences, and its
button reads as a verb phrase. View it in greyscale; it still reads as
destructive.

## All six interaction states

**Requires.** Every interactive element defines each state that applies to it:
rest, hover, pressed, focus, selected (only where the element can be selected)
and disabled. Disabled looks unavailable and does not respond to hover.

**Why.** Most components define hover and stop, which is how a disabled button
ends up looking clickable.

**Cairn.** The Interaction states section of cairn's design language, one
treatment per state.

**The suite.** Not yet written in `suite-language.md`. Thrive defines them in
#404.

**Check.** For each control the change adds, list the states that apply and
find each in the stylesheet. Tab to it, press it, disable it and hover the
disabled one.

## A visible focus ring, never suppressed

**Requires.** On `:focus-visible`, a ring of at least 2px that is 3:1 against
every surface it sits on. The one exception is programmatic focus on something
that is not a control, such as a heading or region focused on a route change,
which may draw none.

**Why.** Keyboard and switch users have no other way to know where they are.

**Cairn.** A 2px `--accent` outline at 2px offset, global in `index.css` and
never overridden, per the Focus row of cairn's Interaction states. `--accent`
is 7.04 on `--ground` and 6.31 on `--surface`.

**The suite.** Focus rings are drawn in `--color-primary`, tuned per theme so
it passes on the surfaces it sits on (the Accent section of
`suite-language.md`). The ring itself is specified in #404.

**Check.** Tab through every screen the change touches. Search the stylesheets
for `outline: none` and `outline: 0`; each is either on a non-control focus
target or paired with an equivalent ring.

## Reduced motion honoured

**Requires.** Under `prefers-reduced-motion: reduce`, nothing translates, scales
or rotates. Colour and opacity may still change.

**Why.** Movement is what triggers vestibular symptoms; a colour change does
not.

**Cairn.** The reduced-motion block in the Motion section of cairn's design
language, which also covers the map camera and the route draw-on.
`112-phone-bottom-sheet.md` turns the sheet's settling into a cut.

**The suite.** `suite-language.md` names two transitions and does not yet
address reduced motion. Thrive's spinner rotates under it today, which no issue
covers.

**Check.** Enable the reduced-motion setting and use the screens the change
touches. Look for anything that moves, including spinners.

## Touch targets

**Requires.** At least 40px square for controls and 44px tall for rows. This is
the floor both languages keep today. A language may raise it.

**Why.** An app assumed to be used one-handed on a phone does not survive 24px
icon buttons.

**Cairn.** `--hit-target` is 40px, and rows are 44px minimum on touch, in the
Interaction states section of cairn's design language.

**The suite.** Raises the floor: touch targets are at least 44px for
everything, in the Layout section of `suite-language.md`.

**Check.** Measure the rendered size of each control and row the change adds, not
the size of its glyph. A drawn icon smaller than the target has padding to make
up the difference.

## Blank is not zero

**Requires.** A missing value shows as unknown: `—`, with words saying why. It
is never drawn or stored as 0 or as a middle value.

**Why.** A zero is a claim. Showing one where nothing was measured tells the
person something false, and a chart that draws it hides that the data is
missing.

**Cairn.** `218-track-and-trip-stats.md` shows em dashes for stats that are
unavailable, and `224-sampled-elevation.md` keeps that state when sampling
fails.

**The suite.** "Blank is not zero" in the Showing data section of
`suite-language.md`, and "Blank days break the line" under Charts.

**Check.** Give the screen a record with the field missing. It shows `—` and
says why. Look in the store: no 0 was written.

## The icon family: mark small, tile large

**Requires.** Every app has two icon artworks and uses each at its own size. The
rules, the template and the file set are in [`app-icons.md`](app-icons.md).

**Why.** A tile at 16px spends most of its pixels on its ground.

**Cairn.** `300-the-cairn-mark.md`, which `app-icons.md` generalises. One
correction to it is recorded in `app-icons.md`: it declares the rounded 512
`maskable`, which its own geometry does not support.

**The suite.** Thrive's artwork follows cairn's template on purpose, and
`app-icons.md` is the rule for Hive and Forage.

**Check.** The checks in `app-icons.md`.

## Session expiry and offline behave the same way everywhere

**Requires.** Described as what the person sees, not how it is built, because
cairn (Drive, no backend) and Thrive (Sheets, a write queue) work differently
underneath. No mechanism is prescribed.

1. An expired session never costs what is on screen or work already done.
2. When renewal needs the person, the app says so in words, where the failure
   shows, with one action to reconnect. Renewing silently first is allowed, not
   required.
3. A write that cannot reach its backend is either queued with the count
   visible, or refused before it is made, its control disabled, and never
   accepted and then lost.
4. Reconnecting never replays a destructive action.

**Why.** Every app here is used on a phone that goes through tunnels and sleeps
for hours. The person should not have to learn each app's way of failing.

**Cairn.** `72-drive-session-lifecycle.md` for 1 and 2: a session that dies
mid-use shows the email, a Reconnect action and the reason, and nothing that
failed is retried automatically, which is 4. `73-disconnected-read-only.md` for
3: without a connection every mutating control is disabled and one sentence per
surface explains why. `327-returned-home-by-an-expiry.md` for 2: a message with
a Sign in action that does not time out.

Cairn does not fully keep 1. `327-returned-home-by-an-expiry.md` abandons an
import draft or a placement in progress when it navigates home, and
`73-disconnected-read-only.md` lets an edit in flight at the moment of expiry
fail and revert. What is on screen survives; work not yet saved does not. Both
are recorded decisions there, and this rule is stricter. Closing the gap is a
cairn issue, not filed here.

**The suite.** Not yet written in `suite-language.md`. The Thrive queue and its
visible count are the suite's side of 3.

**Check.** Expire the session while a form is half filled, then while a write is
in flight. Go offline and try each write control. Reconnect after a delete was
refused and confirm it was not applied.

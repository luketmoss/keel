# 284 — one layers control, and 3D on the map

Standing documents: [design-language.md](design-language.md),
[shell-and-content-model.md](shell-and-content-model.md). This note amends the
bottom-left row of the second one's corner table, under
[Standing document amendment](#standing-document-amendment).

It supersedes three things and nothing else:

- [109-shell-column.md](109-shell-column.md)'s *selecting a basemap collapses
  the strip*, and its trigger-beside-panel arrangement.
- [263-labels-toggle.md](263-labels-toggle.md)'s trigger — its copy, its `3D`
  badge, and step 4 of its main path. The Labels switch itself, its
  checked-and-disabled treatment on Map and Terrain, its tooltips and its stored
  preference are untouched.
- [271-switching-the-map-into-3d.md](271-switching-the-map-into-3d.md)'s
  *control* section — where the 3D switch lives, the `Satellite only` caption,
  and the trigger badge. Everything #271 says about what happens when 3D turns
  on — the cross-fade, the tilt to `55°`, the camera conversion, what draws,
  the fallback — stands exactly as written.

## The idea

**The control is the basemap.** Not a button called `Layers` that opens a thing
that shows the basemap — the basemap itself, sitting in the corner, which opens
into the alternatives when you press it. One object with two sizes, rather than
two objects with one job.

That is the sentence the whole note follows from. A trigger and a panel on
screen at once are two objects, so the trigger goes away while the panel is up.
A control that closes the moment you choose is a control that thinks choosing is
the end of the task, and comparing is the task, so it stays. And 3D is not a
basemap, so it is not in there at all.

## The bottom-left cluster

Two controls, bottom-aligned, `--space-2` apart, sharing the corner's existing
behaviour: they clear the column while it is open and slide to the map's left
edge when it collapses, over `--motion-base`, exactly as `.layers-control` does
today. At phone width they ride the sheet together.

```
                       ┌──────────────┐
                       │  ▨    ▨   ▨  │
                       │ Map  Sat Ter │      the panel, expanded upward
                       ├──────────────┤
                       │  ☑  Labels   │
                       └──────────────┘
   ┌──────────────┐                       ┌──────┐
   │ ▨  Satellite │                       │  3D  │   collapsed: the basemap
   └──────────────┘                       └──────┘   and the 3D toggle
```

The panel's bottom-left corner sits where the collapsed control's bottom-left
corner sat. The 3D toggle does not move when the panel opens — it is a sibling
in the cluster, not a child of the layers control, and the panel grows upward
past it.

### Why 3D is here and not bottom-right

Google's 3D button sits by the compass on the right because that is where its
camera controls are. Cairn's bottom-right is Google's own zoom cluster, rendered
by the Maps API and not ours to sit inside; docking custom chrome above it means
measuring a control we do not own, which is the arithmetic
[104-basemap-toggle.md](104-basemap-toggle.md) already got punished for. The
bottom-left corner is cairn's own, already knows how to clear the column, and
already moves with the sheet on a phone. What the user asked for was that 3D
stop living *inside the basemap picker* and stop appearing where it cannot work
— both of which this satisfies.

## The collapsed control

A pill, `--radius-sm`, `--surface` with `backdrop-filter: blur(var(--blur))` and
`--shadow-lifted`, `--hit-target` tall — `.layers-control__trigger`'s existing
metrics, unchanged. What changes is the word.

| | Before | After |
|---|---|---|
| Visible text | `Layers` | `Map` · `Satellite` · `Terrain` |
| `aria-label` | `Layers` | `Layers: Satellite` |
| Badge | `3D` while 3D is on | none |

**The visible word is the basemap**, because that is the question the control
answers when you glance at it, and the swatch beside it already says *this is
the picture you are looking at*. `Layers` told you what pressing it would do,
which is the less useful of the two facts and the one the swatch cannot carry.

**The accessible name keeps both.** `Layers: Satellite` rather than a bare
`Layers`, so the name contains the visible string — a voice-control user saying
"click Satellite" must reach it, and an `aria-label` that omits the visible text
breaks that. The word `Layers` survives in the accessible name only; it is not
on screen anywhere once the panel is open, which is the whole point of the
issue.

**The badge goes.** It existed because a collapsed panel was the only thing on
screen that could say 3D was on. The 3D toggle is now on screen, always, in
exactly the case where 3D can be on — it is its own status readout, and a second
one two controls away is the duplication this issue is about.

The labels diagonal on the swatch (`.layers-control__swatch--labelled`, #263)
stays. It distinguishes the two satellite pictures, and the word `Satellite`
names both.

At phone width the word hides and the swatch stays, exactly as
`.layers-control__trigger-label` does today.

## The panel

Unchanged in material and contents from #263: `--surface`, blur, `--radius-md`,
`--shadow-lifted`, `--space-1` padding; a tile row, a full-width hairline, and
the Labels switch. Two things change.

**It replaces the collapsed control rather than sitting beside it.** The
collapsed pill unmounts in the same frame the panel mounts. Only one of the two
is ever in the DOM.

**The 3D switch and the `Satellite only` caption are gone from it.** The panel is
a tile row and a Labels switch again — #263's panel exactly.

The panel is not visibly titled. Its accessible name is `Layers`
(`aria-label="Layers"` on the panel, `role="group"`), and the tile row keeps its
own `aria-label="Basemap"` as it has since #104. A visible title would put the
word back on screen beside three tiles that already say what they are.

### Opening and closing

Opening: the panel fades in over `--motion-fast`, anchored at its bottom-left
corner, as #109 specifies. Under `prefers-reduced-motion: reduce` it cuts, via
the global block.

**Closing is dismissal, not selection.** Three ways, all of them the app's
existing idiom for a transient surface — the row confirm, the row menu, the
colour popover all dismiss this way:

| | |
|---|---|
| Pointer press outside the cluster | closes, and the press does its own job — it is not swallowed |
| Focus moves outside the cluster | closes |
| `Escape` | closes, and focus returns to the collapsed control |

Focus-out is the addition. Today only pointer and Escape close it, which means a
keyboard user tabbing into the column leaves a panel open behind them.

**There is no close button**, and this is the one place the note picks between
two things the issue explicitly left open. An `✕` would be the only one in the
app: nothing else that floats over the map has one, and adding it here makes
this popover the exception rather than making the pattern clearer. Outside-press
is also what the user described wanting first — "keep it open until it loses
focus and I select something away from that base map selection" is a description
of dismissal, not of a button. If the panel turns out to be hard to dismiss on a
touch screen where there is less obvious empty map to press, the answer is a
close button added to *every* floating surface at once, as a design-language
change, not to this one.

### Choosing a tile

Clicking a tile changes the basemap and **the panel stays open**. The selected
tile takes the language's Selected treatment (`--accent-soft` fill, `--accent`
text) and the previous one releases it, in the same frame Google redraws.

Clicking the already-selected tile is a no-op — not a close, as it is today.
Nothing in the panel closes the panel any more; that is the rule, and it has no
exceptions, because an exception is the thing that collapses under your pointer.

The Labels switch behaves exactly as #263 specifies. It always did stay open;
now it is not the odd one out.

## The 3D toggle

A pill in the cluster, right of the layers control, bottom-aligned with it.

```
┌──────┐        off — --surface, --text-muted
│  3D  │
└──────┘

┌──────┐        on — --accent-soft, --accent
│  3D  │
└──────┘
```

- `<button type="button" role="switch" aria-checked={is3DOn} aria-label="3D">`
  — a switch, like the one it replaces, so the on state is announced rather
  than inferred.
- `--hit-target` tall, `--radius-sm`, `--space-3` horizontal padding,
  `--text-sm`, `--surface` with `blur(var(--blur))` and `--shadow-lifted`: the
  collapsed layers pill's material, so the two read as one cluster.
- Off: `--text-muted`, `--text` on hover, `--pressed` on active.
- On: `--accent-soft` background and `--accent` text — the language's Selected
  treatment, the same one the chosen tile takes, and the same one the retired
  badge took. `background` and `color` transition over `--motion-fast`, named,
  never `all`.
- Focus is the global 2px `--accent` outline at 2px offset.

### When it is there

**Only on Satellite.** On Map and Terrain it is not rendered — no disabled
state, no greyed pill, nothing. The constraint that needed the words
`Satellite only` is now stated by the control's own presence, which is what the
user asked for and is strictly more honest than a caption: the previous design
had a control you could see and press that would silently move your basemap
under you.

This is the opposite call from #263's Labels switch, deliberately. Labels stays
visible-but-disabled on Map and Terrain because *the panel would change height*
and because "these views always show labels" is a fact about the view you are
on. 3D is a fact about a view you are not on; nothing reflows when it goes, and
the honest place to learn 3D exists is the view where it works.

### Turning Satellite off while 3D is on

3D turns off — #271's existing resolution, unchanged — the map returns to 2D
with #271's exit transition, and the toggle unmounts as the basemap tile
changes. Coming back to Satellite shows the toggle **off**. The mode is not
remembered across a basemap round trip: 3D is an in-memory mode rather than a
stored preference (#271), and restoring it silently would stand the ground up
under someone who did not ask twice.

### The caption slot

One line above the toggle, `--text-xs`, `--text-muted`, left-aligned with the
toggle, `--space-1` beneath the text — the `.flyover-button-wrap` column
pattern. The toggle stays anchored to the cluster's bottom edge and the caption
grows upward, so nothing below it moves.

At most one line shows at a time:

| When | Line |
|---|---|
| Browser cannot draw 3D, Satellite selected | `This browser can't draw 3D. Check that hardware acceleration is on.` |
| 3D is on | `Cairns don't show in 3D yet.` |
| Otherwise | none |

Both are #271's strings, relocated rather than rewritten. #73's rule is one
sentence per surface, and this is that surface's one sentence.

### When the browser cannot draw 3D

The toggle renders on Satellite, takes the Disabled treatment (`opacity: 0.4`,
`cursor: default`, no hover or active response), carries the sentence above it
as its caption, and repeats the sentence as a `title` on a wrapping `<span>` —
the `.track-row__swatch-wrap` fix from #199, because `title` on a `disabled`
button does not reach the pointer in every browser.

Disabled rather than absent, here, because this is a capability the user might
reasonably expect to have and can act on: hardware acceleration is a setting
they can go change. A missing control teaches nothing about that.

`'checking'` renders as available, unchanged from today — the library resolves
fast enough that flashing disabled-then-enabled on every load is the worse
trade.

## Copy

Every string in the cluster.

| Element | String |
|---|---|
| Collapsed control, visible | `Map` · `Satellite` · `Terrain` |
| Collapsed control, `aria-label` | `Layers: Map` / `Layers: Satellite` / `Layers: Terrain` |
| Panel, `aria-label` | `Layers` |
| Tile row, `aria-label` | `Basemap` |
| Tile captions | `Map` · `Satellite` · `Terrain` |
| Labels switch and its three tooltips | unchanged from #263 |
| 3D toggle, visible | `3D` |
| 3D toggle, `aria-label` | `3D` |
| 3D toggle `title`, enabled and off | `Stand the terrain up` |
| 3D toggle `title`, enabled and on | `Return to the flat map` |
| 3D toggle `title`, disabled | `This browser can't draw 3D. Check that hardware acceleration is on.` |
| Caption, 3D on | `Cairns don't show in 3D yet.` |
| Caption, 3D unavailable | `This browser can't draw 3D. Check that hardware acceleration is on.` |

The two enabled tooltips name the action, per #199 and #263. `3D` needs no gloss
on the pill itself; the tooltips are for the reader who wants to know what
pressing it does before pressing it.

## Main path

1. The map shows Satellite. Bottom-left: a pill reading `▨ Satellite`, and a
   `3D` pill beside it, off.
2. Press the pill. It is replaced in place by the panel, faded in over
   `--motion-fast`: three tiles with Satellite selected, a hairline, `Labels`.
   The `3D` pill has not moved.
3. Press `Terrain`. The map redraws. **The panel stays open**, Terrain now
   selected. The `3D` pill is gone.
4. Press `Satellite` again. The map redraws, the panel is still open, the `3D`
   pill is back, off.
5. Press `Labels`. The box fills, the imagery redraws. Still open.
6. Press the map, or tab into the column, or press `Escape`. The panel is
   replaced by the collapsed pill, now reading `▨ Satellite` with the labels
   diagonal on the swatch.
7. Press `3D`. The pill goes `--accent-soft` / `--accent`, the caption
   `Cairns don't show in 3D yet.` appears above it, and the map performs #271's
   entry exactly.

Steps 3–5 are the issue: three changes, one open.

## States

| State | Collapsed pill | Panel | 3D toggle |
|---|---|---|---|
| Closed, Map or Terrain | basemap name and swatch | not rendered | not rendered |
| Closed, Satellite | `Satellite` and swatch | not rendered | rendered, off or on |
| Open | not rendered | tiles and Labels | unchanged by the panel's state |
| Open, Map or Terrain | not rendered | Labels checked and disabled, #263 | not rendered |
| 3D on | `Satellite` and swatch, **no badge** | as above | on, caption above it |
| 3D unavailable | unchanged | unchanged | disabled, sentence above it |
| Column open | cluster clears the column | same | same |
| Column collapsed | cluster at the map's left edge | same | same |
| Phone width | swatch only, no word | tile captions hidden, #109 | `3D` keeps its word |
| Map unavailable (`MapUnavailableContext`) | whole cluster not rendered | — | — |
| Signed out or disconnected | unaffected — a way of looking, not a mutation | | |

There is no loading state and no error state in the cluster. The basemap and
Labels preferences are `localStorage` reads; 3D's own failure path is #271's and
resolves to the disabled toggle above.

## Motion

| What | Duration | |
|---|---|---|
| Panel fade in and out | `--motion-fast` | #109, unchanged |
| Cluster sliding as the column opens or collapses | `--motion-base` | shell model, unchanged |
| Tile selection, switch fill, 3D pill fill | `--motion-fast` | `background` and `color`, named |
| Entering and leaving 3D | `--motion-base` fade, `--motion-slow` tilt | #271, unchanged |

The collapsed pill and the panel do not cross-fade into each other. One
unmounts, the other fades in; a control morphing between two sizes is a bigger
promise than this needs and it reads as a stutter at `--motion-fast`.

## Edge cases

- **Pressing the pill twice quickly.** Open, then closed. The toggle is the
  pill's own `onClick` when collapsed; when open there is no pill to press, so
  the second press lands on the panel or outside it, and outside closes. No
  double-fire.
- **Pressing the map to dismiss.** The `pointerdown` listener closes the panel
  and does not `preventDefault` — a press meant to start a map drag still starts
  it. This is today's behaviour and must not regress into a swallowed first
  click.
- **Pressing the 3D toggle while the panel is open.** The toggle is outside the
  panel, so the panel closes and the toggle fires. Both, in that order, from one
  press. That is correct: 3D is not in the panel, and the panel's dismissal rule
  has no exception for a sibling.
- **Tabbing from the last tile to the Labels switch.** Focus stays inside the
  cluster; the panel does not close. The focus-out check is against the cluster
  root, not the panel — otherwise tabbing to the 3D toggle would close a panel
  the user is still working in, which they would experience as the control
  collapsing under them by a different mechanism.
- **`Escape` with focus inside the panel.** Closes, and focus moves to the
  collapsed pill that has just taken the panel's place. Focus must not be
  orphaned on an unmounted node.
- **Rapid tile switching.** Every press is a `setState` and a `localStorage`
  write. No debounce; Google coalesces `mapTypeId` changes itself. This is the
  interaction the issue exists to enable, so it must be cheap.
- **Turning 3D on, then dismissing the panel, then pressing the pill again.**
  The panel opens with Satellite selected, the 3D pill is on beside it, and 3D
  stays on. Opening the panel is not a mode change.
- **A stored basemap of `hybrid`.** Still resolves to Satellite with Labels on —
  #263's migration, untouched.
- **Phone width with the sheet at full.** The cluster rides the sheet as it does
  today. Both pills carry the same `bottom` and move together.
- **The two surfaces.** One preference, shared by the trip detail map and the
  world map, never mounted at once. Unchanged.

## Standing document amendment

[shell-and-content-model.md](shell-and-content-model.md), "The map's corners",
bottom-left row becomes:

> **The basemap** — a pill naming the current basemap, which expands in place to
> Map / Satellite / Terrain and a Labels switch, and a **3D** toggle beside it,
> present only on Satellite

The paragraph beneath it keeps its argument — a map control belongs in the map's
corners — and gains one sentence:

> The control names the basemap rather than itself: a trigger and a panel on
> screen at once are two controls for one question.

## New tokens

None. Every value in this note is an existing token, and the one new component —
the 3D pill — is built from the collapsed layers pill's metrics.

# 263 — hiding the base map's labels

Standing documents: [design-language.md](design-language.md),
[shell-and-content-model.md](shell-and-content-model.md). This note changes one
line of the second one — the bottom-left corner's contents — and says so under
[Standing document amendment](#standing-document-amendment).

It supersedes [104-basemap-toggle.md](104-basemap-toggle.md)'s four-segment
table and [109-shell-column.md](109-shell-column.md)'s
`Map · Satellite · Hybrid · Terrain` copy line. Everything else in both notes —
the corner, the thumbnail-and-strip behaviour, the dismissal mechanism, the
`--motion-fast` strip open — stands unchanged.

## What changes

**Hybrid stops being a place you go and becomes a thing you switch on.**

| Before | After |
|---|---|
| Map · Satellite · Hybrid · Terrain | Map · Satellite · Terrain, plus a **Labels** switch |

Satellite and Hybrid were always the same imagery; the only difference was
whether Google drew writing on it. Naming that difference "Hybrid" asks the user
to know a rendering term in order to express a preference about legibility. The
switch says the thing directly, and — because it is a preference rather than a
destination — it is still set the way you left it when you come back from the
road map.

The switch governs the imagery only. Map and Terrain always carry labels and
cannot be made to drop them; the reason is a vendor constraint recorded in the
issue, and how the control tells the truth about it is
[below](#on-map-and-terrain).

## The panel

The strip stops being a single row. It becomes a small panel: the tile row it
already was, a hairline, and the Labels switch beneath.

```
┌─────────────────────────────┐
│  ▨       ▨       ▨          │   tiles, unchanged but three
│ Map   Satellite Terrain     │
├─────────────────────────────┤   1px var(--border)
│  ☑  Labels                  │   the switch, full width
└─────────────────────────────┘
        ┌──────────┐
        │ ▨ Layers │              the trigger, unchanged
        └──────────┘
```

The panel keeps `.layers-control__strip`'s material exactly: `--surface`,
`backdrop-filter: blur(var(--blur))`, `--radius-md`, `--shadow-lifted`,
`--space-1` padding. It is L2 lifted chrome and nothing about that moves. The
outer element gains `flex-direction: column` and `gap: var(--space-1)`; the
tiles move into their own `flex-direction: row` group.

The hairline is `border-top: 1px solid var(--border)` on the switch, pulled out
to the panel's full width with negative margins rather than stopping inside the
padding. A seam that stops short reads as a mistake.

### The switch

One `<button type="button" role="switch" aria-checked={labels}>`, not an
`<input type="checkbox">`. Every other control in this component is a button
with an ARIA state (`aria-pressed` on the tiles), and a lone native checkbox
would need its appearance reset before it could be styled at all — which is the
same work, plus a second keyboard idiom in one panel.

```css
.layers-control__labels {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: calc(100% + var(--space-1) * 2);
  min-height: var(--hit-target);
  margin: 0 calc(var(--space-1) * -1) calc(var(--space-1) * -1);
  padding: var(--space-1) var(--space-2);
  border: none;
  border-top: 1px solid var(--border);
  border-radius: 0 0 var(--radius-md) var(--radius-md);
  background: transparent;
  color: var(--text-muted);
  font-size: var(--text-sm);
  text-align: left;
  cursor: pointer;
  transition: color var(--motion-fast) var(--ease),
              background var(--motion-fast) var(--ease);
}

.layers-control__labels:hover { color: var(--text); background: var(--hover); }
.layers-control__labels:active { background: var(--pressed); }
```

The box is a `<span aria-hidden="true">` at the row's left, `--checkbox-size`
square with `--checkbox-radius` — see [New tokens](#new-tokens), where both are
proposed as tokens rather than left as literals, and where the radius is argued
for, because it is the one place this note steps outside the language's scale.

| Labels | Box | Row text |
|---|---|---|
| Off | transparent, `inset 0 0 0 1px var(--border)` | `--text-muted` |
| On | `--accent` fill, `--on-accent` check glyph `✓` | `--accent` |

**Not** `--accent-soft` on the whole row. The language's Selected treatment is
for a chosen-among-others state, and this is a binary; filling the row would
make an on-switch shout louder than the selected tile above it, which is the
more important thing on that panel.

Focus is the global 2px `--accent` outline at 2px offset. Nothing overrides it.

### On Map and Terrain

The switch stays in the panel, and it goes **checked and disabled**.

Hiding it would be the tidier layout and it is the wrong call: the panel would
change height as you moved between tiles, and a control that vanishes teaches
nothing. Checked-and-disabled is simply true — Map and Terrain do carry labels,
and you cannot turn them off — and it says so in the one place the question
occurs to you.

| | Treatment |
|---|---|
| Box | The On treatment: `--accent` fill, `--on-accent` check |
| Row | `opacity: 0.4`, `cursor: default`, no hover or active response |
| `aria-checked` | `true` |
| `disabled` | `true` |

Per [199-row-control-tooltips.md](199-row-control-tooltips.md), a disabled
control is the one whose purpose is least guessable, so it keeps a tooltip — and
because `title` on a `disabled` button does not reach the pointer in every
browser, the `title` goes on a wrapping
`<span class="layers-control__labels-wrap">`, exactly as
`.track-row__swatch-wrap` already does.

**Turning the switch off is not silently forgotten while it is disabled.** The
stored preference is untouched by moving to Map or Terrain — it is the same
value it was, waiting. Coming back to Satellite restores it. What the disabled
switch shows is the *rendered* truth for the current tile, not the stored one,
and those differ only here.

## Copy

Every string in the control, so none of them get invented at the keyboard.

| Element | String |
|---|---|
| Trigger label | `Layers` (unchanged) |
| Trigger `aria-label` | `Layers` (unchanged) |
| Tile captions | `Map` · `Satellite` · `Terrain` |
| Switch label | `Labels` |
| Switch `title`, enabled and on | `Hide place labels on the imagery` |
| Switch `title`, enabled and off | `Show place labels on the imagery` |
| Switch `title`, disabled | `The map and terrain views always show labels` |
| Strip `aria-label` | `Basemap` (unchanged) |

The two enabled strings name the *action*, the way #199's visibility tooltip
flips with the glyph. The disabled string names the *rule*, because there is no
action to name and the rule is what the user is missing.

`Hybrid` disappears from the interface entirely.

## Main path

1. Click **Layers**. The panel opens over `--motion-fast`, as #109 specifies.
   It is now taller by one row; nothing else about the opening changes.
2. Click **Labels**. The box fills, the row text goes `--accent`, and Google
   redraws the imagery with labels in the same frame the `mapTypeId` prop
   changes. **The panel stays open.**
3. Click **Labels** again to put them back. Still open.
4. Click a tile, or press Escape, or point down outside — the panel closes, per
   #109.

Step 2 is the one deliberate divergence from #109's "selecting collapses the
strip", and on inspection it is not a divergence at all: that rule is about
*choosing a basemap*, where the choice is made and the panel's job is done. A
switch is a thing you might flip twice to compare, and collapsing under the
pointer between the two flips is the interaction failing. Tiles collapse; the
switch does not.

## States

| State | Panel | Switch |
|---|---|---|
| Collapsed | Trigger only | Not rendered |
| Open, Satellite | Three tiles, Satellite selected | Enabled, reflecting the stored preference |
| Open, Map or Terrain | Three tiles | Checked, disabled, `opacity: 0.4` |
| Map unavailable (`MapUnavailableContext`) | The whole control is not rendered — `MapCanvas` returns early today and still does | — |
| `prefers-reduced-motion` | The panel cuts rather than animating, via the global block | The colour change cuts too |

There is no loading state and no error state. The preference is a `localStorage`
read and a prop; nothing here can be pending and nothing here can fail.

## Motion

| What | Duration | |
|---|---|---|
| Panel open | `--motion-fast` | Unchanged from #109 |
| Box fill and row colour | `--motion-fast` | `background` and `color`, named, never `all` |
| Base layer redraw | — | Google's, not ours. Nothing in the app animates it |

## Edge cases

- **Rapid repeat toggling.** Every flip is a `setState` plus a `localStorage`
  write, both synchronous and both cheap. No debounce. Google coalesces the
  `mapTypeId` changes itself; the worst case is imagery that flickers as fast as
  the user can click, which is the honest response to that input.
- **A stored `hybrid`.** The value that exists on the user's machine right now.
  It resolves to Satellite with Labels **on** — the same picture they had before
  this issue — and both keys are rewritten on the next change. Reading it must
  not fall through to the default; landing on labels-off would be this change
  silently altering someone's map.
- **A stored `cairn.baseMapLabels` that is not `"true"` or `"false"`.** Resolves
  to the default, exactly as a malformed `cairn.baseMapType` resolves to
  `satellite` today. Malformed storage fails open to the current experience.
- **Nothing stored at all.** Satellite, Labels off. Unchanged from #104.
- **A `localStorage` write that throws** (quota, private browsing). The
  in-memory selection stands for the session and the throw is swallowed,
  matching `useBaseMapType`'s existing stance and `LocalTrackOverridesStore`'s.
- **Switching to Map with Labels off, then back to Satellite.** Labels come back
  off. The preference was never cleared, only overridden for the render.
- **The two surfaces.** One preference, shared by the trip detail map and the
  world map, like the tile. They are never mounted at once, so there is still no
  `storage` listener.
- **Phone width (`max-width: 719px`).** The tile captions still hide, per #109.
  **The switch keeps its word** — it is a label with nothing else to identify
  it, and a lone box in a panel is a puzzle. The panel is then as wide as
  `☑ Labels`, which is within a few pixels of three swatches anyway.

## Standing document amendment

[shell-and-content-model.md](shell-and-content-model.md), "The map's corners",
bottom-left row becomes:

> **Layers** — a thumbnail that expands to Map / Satellite / Terrain, and a
> Labels switch

Everything else in that section — the corner itself, clearing the column,
sliding to the map's edge over `--motion-base` — is untouched.

## New tokens

Two, and the second one is a deliberate exception to the language's radius
scale, which is exactly why it is written down here rather than inlined.

| Token | Value | For |
|---|---|---|
| `--checkbox-size` | `18px` | The switch's box, and any future checkbox |
| `--checkbox-radius` | `6px` | That box's corners |

`18px` because the box must read as smaller than a `--hit-target` row without
disappearing inside it, and 18 is already a value the system uses (`--space-5`,
`--text-lg`) rather than a sixth number arriving from nowhere. The box is not
`--space-5`, though, and must not be spelled that way: it is a size, not a gap,
and a spacing change should not resize a control.

`6px` because **`--radius-sm` cannot be used here.** The language sets the small
step at `10px` "and not smaller", and on an 18px box the browser clamps 10px to
9px — a circle. A circular checkbox reads as a radio button, which promises
one-of-several where this offers on-or-off, and a wrong affordance costs more
than an off-scale radius. `6px` is the value that gives an 18px box the same
corner *proportion* `--radius-sm` gives the 40px controls it was written for, so
this is the scale being honoured at a size it did not anticipate rather than
being ignored. If a second small control ever needs it, that is the moment the
language gains a real `--radius-xs` and these two tokens collapse into it.

The check glyph is `✓` at `--text-xs`, `--on-accent`, centred. No icon set is
introduced for one mark.

## What the swatches do

Three tiles need three swatches, and the fourth gradient does not go to waste.

- `--roadmap` and `--terrain`: unchanged.
- `--satellite`: unchanged when Labels are off.
- The `--hybrid` swatch's white diagonal — the mark that read as "imagery with a
  road drawn on it" — moves onto the **trigger's** swatch, which shows what the
  map is currently rendering. Satellite with Labels on shows the diagonal;
  Satellite with Labels off does not. The trigger is a status readout, so it
  should distinguish the two pictures even though the tile row no longer does.
- The Satellite **tile** never carries the diagonal. It names the imagery, not
  the labels; the switch below it owns that.

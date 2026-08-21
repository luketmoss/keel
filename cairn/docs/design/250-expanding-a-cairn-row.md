# 250 — expanding a cairn row

A step between the row's glyph and the lightbox, on the surface you are already
looking at.

Standing documents: [cairns.md](cairns.md) (what a cairn is, and the one marker
predicate the glyph draws by), [design-language.md](design-language.md)
(interaction states, motion, scale),
[shell-and-content-model.md](shell-and-content-model.md) (the column, the row
anatomy, the phone sheet). Prior notes:
[193-trip-row-anatomy.md](193-trip-row-anatomy.md) — the row this expands —
[197-seeing-the-photo.md](197-seeing-the-photo.md) and
[195-lightbox-controls.md](195-lightbox-controls.md) (the lightbox, unchanged
here), [194-reaching-a-clustered-cairn.md](194-reaching-a-clustered-cairn.md) —
**revised here**, see *What this revises in #194* —
[55-photo-list-lightbox.md](55-photo-list-lightbox.md).

## Why

> *"It keeps the map in view to click one after another without having to close
> the photo."*

That sentence is the whole issue, and it is also what decides the map's half of
it. Looking through a trip's photos is a sequence, not one lookup: you want the
next one and the next one, and every modal open and close between them is a
tax on the only thing you were doing. The lightbox is where you go when one
photo has won.

## The four sizes, and why there are four

```
 glyph            inline preview          lightbox          full bleed
  20px              ≤344 wide          dialog column        viewport
   ●             ┌────────────┐      ┌──────┬─────┐      ┌──────────┐
  row            │            │      │      │name │      │          │
                 │   photo    │      │photo │meta │      │  photo   │
                 └────────────┘      └──────┴─────┘      └──────────┘
   in the list        in the list         over the map      over the map
```

The first two are *in the list* and the last two are *over the map*, and that
seam is what makes four legible rather than arbitrary. Scanning happens on the
left; looking happens over the map. This note adds the second box and changes
nothing about the third or the fourth.

## The main path

1. The cairn list renders as it does today — glyph, name, meta line, `⋮`.
2. **Click a row whose cairn carries an image.** The cairn is selected (its
   marker takes #54's selected treatment, and the list scrolls the row into view
   as it already does) and the row expands: the photo draws beneath the row's
   header, inside the same row. The lightbox does not open.
3. **Click the photo.** The lightbox opens on that cairn, exactly as it opens
   today. Everything from there — the detail face, full bleed, the arrows — is
   #197's and #195's and is unchanged.
4. **Click the row header again.** The row collapses. The cairn stays selected.

Closing the lightbox returns to the list with the row still expanded, because
nothing collapsed it.

## What a click does, per surface

| You click | Selected | Expanded | Lightbox |
|---|---|---|---|
| Collapsed row, cairn has an image | this cairn | this row | — |
| Expanded row's header | unchanged | collapses | — |
| The inline photo | unchanged | stays expanded | opens |
| Row of an icon-only cairn | this cairn | — | opens |
| Marker of a cairn with an image | this cairn | its row | — |
| Marker of an expanded cairn | unchanged | collapses | — |
| Marker of an icon-only cairn | this cairn | — | opens |
| Another row, or another marker | moves | moves with it | — |

**Only one row is expanded at a time.** Expansion is its own state
(`expandedCairnId` beside `selectedCairnId` in `TripDetail`), not derived from
the selection — derived, the header's second click would have to deselect in
order to collapse, and losing the marker's highlight is not what "close this
preview" means.

**A marker click does exactly what that cairn's row click does**, including the
second click that collapses it. The map is the other place you pick photos one
after another, so it is the surface the *Why* above applies to hardest: a
lightbox that opens on every pin is a scrim over the map you were clicking
through.

**An icon-only cairn never expands.** There is nothing to preview, so its row
keeps today's single click to its detail face — the same rule #197 uses to
withhold full bleed from a cairn with no image, applied one level out.

## What this revises in #194

#194 made a marker click select-and-open in one action, and gave one reason:
the old two-step *"made the same object behave differently depending on which of
its two representations you clicked, and the map's half was the one nobody
expected."*

**That principle is upheld here, not overturned — its direction is reversed.**
The two surfaces still agree; they now agree on the row's behaviour instead of
the marker's, because the *Why* above turned out to apply to the map even more
than to the list. What #194 rejected was a marker that behaved unlike a row.
What it gets is a marker that behaves exactly like one, in every case including
the collapse.

Nothing else in #194 changes: clusters still zoom or fan by its rules, the fan's
dismissal is untouched, and a click on a fan member is a marker click and takes
the rule above.

The lightbox is now reached **only by clicking a photograph** — the inline
preview, on either path — or by clicking an icon-only cairn, which has no
photograph and whose detail face is its content. That is a smaller, more
consistent rule than the one it replaces.

## The expanded row

The header is untouched. The preview is a second block inside the same `<li>`,
beneath it, so the row grows rather than the list gaining an element.

```
┌────────────────────────────────────────┐
│ ● Camp 2                            ⋮  │   ← header, unchanged
│   16 Jun 2023 · photo                  │
│ ┌────────────────────────────────────┐ │
│ │                                    │ │
│ │              photo                 │ │   ← the preview
│ │                                    │ │
│ └────────────────────────────────────┘ │
└────────────────────────────────────────┘
```

| Property | Value |
|---|---|
| Width | The row's content width — `--panel-width` less the row's own padding |
| Height | Natural, at the photo's aspect ratio, capped at `--cairn-preview-max` |
| Fit | `object-fit: contain`, centred, **never upscaled past natural size** |
| Radius | `--radius-sm` |
| Ground | `--surface-lift` behind the image, so a portrait photo's margins read as frame rather than as a gap |
| Gap | `--space-3` between the header and the preview |
| Cursor | `zoom-in`, matching the lightbox's own affordance for the same gesture |

A portrait photo hits the cap and centres at whatever width its height allows; a
landscape photo hits the width. `--surface-lift` rather than `--surface` because
the row already sits on `--surface` and an image needs a seam.

**The preview is a `button`, not an image with a click handler** — it is the
control that opens the lightbox, and it has to be reachable by Tab and operable
by Enter and Space without any of that being written by hand.

## Where the pixels come from

The row's glyph has already fetched the 512px thumbnail through `usePhotoImage`.
**The preview draws that thumbnail immediately**, then swaps to the display-size
original (`DISPLAY_MAX_EDGE`, 2048) when it lands — the same
placeholder-then-original pattern #55 and #197 already use, and the reason
expanding a row is instant rather than a spinner.

512px across a ≤344px box is sharp at 1× and soft at 2×, which is what makes the
swap worth doing and also what makes it safe to skip when it fails. There is no
reflow across the swap: the box is sized from the aspect ratio, which both files
share.

## States

| State | The preview |
|---|---|
| Thumbnail in hand | Draws immediately, at the thumbnail's resolution |
| Original landing | Thumbnail stays drawn, swapped in place, **no reflow** |
| Original failed | The thumbnail stays. No error copy — the user has a usable image and nothing is broken from where they are standing |
| Thumbnail not in hand yet | `--surface-lift` fill at a 3:2 box, no spinner, matching the row glyph's own loading treatment |
| Thumbnail failed too | `Couldn't load this photo.` in `--text-muted` at `--text-sm`, centred in the 3:2 box. The row still opens the lightbox — #197 keeps its failed state enterable and this matches |
| Icon-only cairn | Not reachable. The row has no expanded state at all |
| A photo is uploading onto this cairn (#157) | The row does not expand while attaching; the click opens the detail face, where #157 already put the progress |
| Removing (`cairn-row--removing`) | Collapses, and cannot be expanded — the row is inert already |
| Confirming a delete (#77) | Collapses. The confirm replaces the row's contents in place, and a preview beneath a destructive confirm is a photo you are about to be asked to destroy |
| Hidden by track visibility (#198) | Expands normally, keeping the row's hidden treatment. An eye has never removed anything from a list and does not start here |
| Disconnected (#73) | Whatever is cached expands and draws. Viewing reads nothing |

## Edge cases

- **The facet changes and the expanded row is filtered out.** The expansion
  clears with the selection, by the same guard that already clears
  `selectedCairnId` when its cairn leaves `facetedCairns`. A facet change that
  keeps the row leaves it expanded and scrolled where it was.
- **The expanded cairn is deleted, or removed from the trip.** The expansion
  clears with the row, the same way `openCairnId` already clears.
- **Arrowing through the lightbox to a different cairn.** The lightbox's
  navigation moves the selection, as it does today, and the expansion moves with
  it. Closing the lightbox lands on an expanded row for the cairn you actually
  ended on — which is the row the list has already scrolled to.
- **Arrowing to an icon-only cairn.** Nothing expands; its row cannot.
- **Expanding a row near the bottom of the list.** The list scrolls the row into
  view on selection already (`block: 'nearest'`). That runs on selection, not on
  the height change, so a row expanding downward past the bottom edge is not
  yanked back up — `nearest` on the *header* is what the user is looking at.
- **Rapid clicking.** The header toggles; there is nothing in flight, so every
  click lands. A double-click on a collapsed row expands and collapses it, which
  is what a toggle means and is not worth suppressing.
- **A very small original (400px wide).** Drawn at natural size, centred, on
  `--surface-lift`. Never upscaled — #55's rule, and this is the surface where a
  stretched 400px photo would look most like a fault.
- **Reduced motion.** The height transition collapses under the global block and
  the row snaps open. Nothing else here moves.
- **Touch.** Tap is the click, and the two-step is if anything better on touch
  than with a mouse — the first tap now costs nothing to undo.
- **The phone sheet at the peek detent.** Expanding a row raises the sheet to
  `--sheet-half`; a preview drawn inside 140px of sheet is a preview nobody can
  see. From half or full the detent does not change. Opening the lightbox still
  goes to full, per the standing document.

## Copy

| String | Where |
|---|---|
| `View larger` | The preview button's `aria-label`, prefixed with the cairn's name — `View Camp 2 larger` |
| `Couldn't load this photo.` | The preview, when neither file could be fetched. The lightbox's wording, unchanged |

**No visible copy is added.** `cursor: zoom-in` and the photograph itself are
the affordance, for #197's reason: a `View larger` button beside a photograph is
a caption by another name.

The row header carries `aria-expanded` — `true` while expanded, `false` while
collapsed, and **absent** on the row of an icon-only cairn, which is not an
expandable thing and must not claim to be one.

## Motion

The row's height animates over `--motion-base` with `--ease`, transitioning
`height` and nothing else — never `all`, per the language. The image fades in
over `--motion-fast` on its first paint; the thumbnail-to-original swap does not
fade, because a cross-fade between two versions of one photograph reads as a
rendering fault.

Collapsing is the same transition, reversed.

## New tokens

| Token | Value | For |
|---|---|---|
| `--cairn-preview-max` | `320px` | The tallest an inline row preview draws, so a portrait photo cannot take the whole panel |

320px is a little under half of `--sheet-half` and leaves roughly two more rows
visible beneath an expanded portrait in a typical desktop column — the point of
the preview is that the list is still a list. A 3:2 landscape at the column's
344px content width draws 229px tall and never reaches the cap; the cap exists
for portraits, and for panoramas turned on their end.

Everything else reuses existing tokens: `--radius-sm`, `--surface-lift`,
`--space-3`, `--motion-base`, `--motion-fast`, `--ease`.

## Decisions taken here

- **The header collapses; the photo opens.** The alternative — a second click
  anywhere on the row opening the lightbox — makes the row's own area mean two
  different things depending on invisible state, and leaves no gesture for
  "close this again" short of selecting something else.
- **Expansion is separate state from selection**, for the reason under *What a
  click does*.
- **A marker click expands the row rather than opening the lightbox**, which
  revises #194. See the section above for why that upholds its principle.
- **No name, no meta and no actions inside the expanded area.** They are in the
  header directly above it. The preview is one photograph and nothing else — the
  same argument #197 makes for full bleed, one level down.

## Out of scope

The lightbox's layout, its full-bleed mode and its controls (#197, #195).
Clustering, the fan and its dismissal (#194) — only what a marker's *click* does
changes. Loose cairns' rows in the shell
panel and on the world map. Editing a cairn from the expanded row (#196 owns
editing, in the lightbox). Hover linking between the list and the map (#251) —
it lands on the same two files and leaves every decision here alone.

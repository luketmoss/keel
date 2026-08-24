# 276 — a row tap raises the sheet

The sheet rises when a marker selects something (#313). It should rise when the
row for that same thing is tapped, because #250 promised the two are one
gesture — and because both #250 and #268 wrote this behaviour down and neither
delivered it.

Standing documents: [shell-and-content-model.md](shell-and-content-model.md)
(the sheet, its detents, and that a marker and its row are one object),
[design-language.md](design-language.md) (`--motion-base`, `--ease`, the
reduced-motion rule), [cairns.md](cairns.md) (the cairn a row stands for).
Prior notes: [258-detail-keeps-its-detents.md](258-detail-keeps-its-detents.md)
— **required**, it owns the peek promotion and the argument for it —
[313-a-map-tap-raises-the-sheet.md](313-a-map-tap-raises-the-sheet.md) —
**required**, it owns the second trigger and the mechanism this one reuses —
[250-expanding-a-cairn-row.md](250-expanding-a-cairn-row.md) (the cairn row,
its inline preview, and the marker-behaves-like-the-row contract),
[268-expanding-a-track-row.md](268-expanding-a-track-row.md) (the track row and
its stat grid),
[269-emphasising-a-track-on-the-map.md](269-emphasising-a-track-on-the-map.md)
(a row click also selects, expansion or not),
[112-phone-bottom-sheet.md](112-phone-bottom-sheet.md) (the detents and the
settle),
[294-a-cairn-without-a-photo-expands.md](294-a-cairn-without-a-photo-expands.md)
(every cairn row expands now, image or not).

## Why

#250 and #268 each specified this in their Edge Cases tables, in nearly the
same words:

> Expanding a row raises the sheet to `--sheet-half`; a preview drawn inside
> 140px of sheet is a preview nobody can see.

Neither was built. #258 built the promotion but keyed it on a *face* opening,
and a row expanding is not a face. #313 then added the second trigger — a map
tap — and stopped one call site short of this one, recording the gap in a
comment: *"a row click never promotes"*.

The result is that the marker and the row now disagree, which is precisely what
#250 forbade — only inverted from the version #313 fixed. Tap a cairn's marker
and the sheet rises to show you the preview. Tap that cairn's own row, six
pixels of list away, and you get the sliver.

## The rule

> **A tap that leaves a row expanded promotes the sheet from peek to half.
> Nothing else about the sheet changes, and the sheet never lowers.**

| Detent when the row is tapped | Detent after |
|---|---|
| Peek | Half |
| Half | Half |
| Full | Full |

The same table as #258's and #313's, deliberately: a third trigger on one
behaviour, not a third behaviour.

## What counts as an expanding tap

| Gesture | Sheet |
|---|---|
| A collapsed cairn row's header (#250) | Promotes |
| A collapsed track row's header button (#268) | Promotes |
| A track row's own whitespace, where the row can expand (#268) | Promotes |
| A track row's whitespace where it **cannot** expand — a multi-track file (#269) | **No change** — it selects, and nothing opened |
| A second tap on the expanded row's header | **No change** — the row collapses and the sheet stays |
| A control inside a row — visibility, rename, drag handle | No change — `handleRowClick` already ignores these |
| A cairn mid-attach (#157), which opens its face instead | No change *here*; #258's `detailOpen` promotion runs, as today |
| The expanded row's preview button, opening the lightbox | No change — the lightbox is not the sheet |

Same dividing line as #313's, read from the other surface: **the sheet moves
for a tap that opens something, not for a tap that closes it.**

## One guard, not two

#313 guards its map-side promotion on *"the selection actually changed"*. The
natural guard here is *"a row ended up expanded"*. They agree everywhere but
one case: a marker tap on a cairn that is still selected but whose row has
since been collapsed. #313's guard declines; this one promotes.

**The expansion guard wins, and #313's is folded into it.** A row is opening
into a sliver in that case, which is the entire complaint. More importantly,
running two guards would put the decision in front of the shared `selectCairn`
on one surface and inside it on the other — the drift #250's construction
argument exists to prevent, and the reason #317 had to write the comment it
did.

So the promotion moves *into* `selectCairn`, and `handleSelectCairnFromMap`
loses its own promote call. One function, both surfaces, one guard.
`handleSelectRoute` keeps its select-then-toggle shape and promotes on the
toggle's outcome rather than on the selection's.

This is a behaviour change to shipped #313 in exactly that one case, and it is
intended.

## The main path

1. The sheet is at peek over an open trip. The map has most of the screen,
   which is why the user lowered it.
2. Tapping a collapsed cairn row expands it (#250) and scrolls it into view.
3. **The sheet settles at half**, over `--motion-base` with `--ease` — the same
   settle a drag release uses, and the same one #258 and #313 already run.
4. The photo preview is visible without any further gesture. That is the whole
   issue.
5. The user taps the next row down. It expands, the first collapses, and the
   sheet — already at half — does not move.

## What the promotion is not

**It is not restored.** #313 settled this and it is not reopened: nothing
closed, so there is nothing to restore from. Collapsing the row later does not
lower the sheet. #276's original proposal suggested copying `detailOpen`'s
promote-and-restore; that would give one visible state two exit behaviours
depending on which surface raised it, which is worse than either.

**It does not stack with #258's or #313's.** A cairn mid-attach opens a face
and promotes through `detailOpen`; a marker tap promotes through the shared
`selectCairn`. Each is one move to half, never two.

## States

| State | A row tap that expands does |
|---|---|
| Sheet at peek | Promotes to half |
| Sheet at half or full | Nothing to the sheet; the row expands as today |
| Mid-drag on the grabber | Nothing — the drag owns the sheet |
| A decision open (draft, queue, create) | Nothing. Detents are suspended (#258, #270, #313) |
| Peek unavailable — landscape (#112) | Nothing to promote from |
| Disconnected (#73) | Promotes normally. Expanding reads what is cached |
| A cairn with no image (#294) | Promotes — the summary body is the thing to see |
| Desktop (≥720px) | No sheet, no change |
| Reduced motion | The promotion is a cut |

## Edge cases

- **Tapping the already-expanded row.** It collapses (#250, #268) and the sheet
  stays where it is, including at peek — the user is putting it away.
- **Rapid taps down a list.** The first promotes; the rest find the sheet at
  half. One settle, not five.
- **A tap while the promotion is still animating.** The detent is already half;
  nothing further happens.
- **A row tapped while its marker's own promotion is in flight** — the same
  cairn, both surfaces, one gesture apart. Idempotent: half is half.
- **The expanded row is below the fold of the raised sheet.** It scrolls into
  view, as #250 and #268 already require; the promotion happens first so the
  scroll measures the taller sheet.
- **A row removed underneath the expansion** — a cairn deleted, a track pulled
  from the trip. The existing cleanup clears the expanded id; the sheet stays
  at half, because nothing here restores.
- **The keyboard is open** on a name field (#196). Out of scope, exactly as
  #258 and #313 left it.

## Transitions

| What | Duration |
|---|---|
| The promotion settle | `--motion-base`, `--ease` — identical to #258's and #313's |
| The row's own expansion | `--motion-base` on `grid-template-rows`, #250/#268's, unchanged |

They run together. The row growing and the sheet growing are one motion to the
eye, which is the point — the sheet is making room for what just opened.

Under `prefers-reduced-motion: reduce` both are cuts.

## Copy

**None.** The grabber's polite live region already announces `Peek` / `Half` /
`Full` on any detent change and now announces this one. No new strings: the
preview arriving is the explanation.

## New tokens

**None.** `--sheet-peek`, `--sheet-half`, `--motion-base` and `--ease` all
exist, and the promotion reuses `BottomSheet`'s existing `onRegisterPromote`
path rather than adding a third way for the sheet to move.

## Decisions taken here

- **Guard on expansion, not selection**, and fold #313's guard into it — see
  *One guard, not two*. This changes shipped behaviour in one case, on purpose.
- **A row that cannot expand does not promote.** A multi-track file's
  whitespace selects and opens nothing; raising the sheet for it would cover
  the map to show a row that did not change.
- **Not restored.** #313's decision, inherited rather than revisited.
- **The promotion happens before the scroll-into-view**, so the scroll measures
  the sheet it is scrolling inside. The mirror of #313's reveal ordering, and
  the same reason.

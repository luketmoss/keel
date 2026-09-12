# 338 — importing without a drag

Standing documents, all outranking this note:
[cairns.md](cairns.md) (the record an imported photo becomes),
[shell-and-content-model.md](shell-and-content-model.md) (the column, the
panel, the phone sheet — and the sentence this issue is the counterexample to),
[design-language.md](design-language.md) (tokens, interaction states, hit
targets).

Prior notes this inherits rather than revises:
[81-drop-to-draft.md](81-drop-to-draft.md) (the track draft),
[120-loose-items-in-drive.md](120-loose-items-in-drive.md) (the signed-out
refusal), [75-trip-import-feedback.md](75-trip-import-feedback.md) (progress
and failure rows), [188-importing-a-zip.md](188-importing-a-zip.md) (archive
expansion), [155-cairns-replace-photos.md](155-cairns-replace-photos.md) (the
placement queue), [159-cairn-facets.md](159-cairn-facets.md) (the precedent for
the decision taken below), [199-row-control-tooltips.md](199-row-control-tooltips.md)
(the tooltip rule).

## The one idea

**Every gesture that writes data needs a control in the panel.**

`shell-and-content-model.md` says of the phone sheet: *"Everything else — rows,
faces, actions, copy — is identical to desktop."* A drop is none of those. It
is a gesture, so it never got a phone form, and the world view's import became
desktop-only without anyone deciding that.

This note adds the missing control. It does not add a pipeline: the control
hands its files to `importDroppedLoose`, the same function the drop handler
calls, and everything past that point is already specified elsewhere and is
untouched here.

## The control

An **icon button in the world panel's title row**, immediately before
`New trip`.

```
┌────────────────────────────────────────┐
│ Everything            0      ↑  New trip │   ← the title row
└────────────────────────────────────────┘
```

| Property | Value |
|---|---|
| Glyph | `↑`, in a `<span aria-hidden="true">`, matching the map controls' idiom (`⌂`, `⛶`, `◎`) |
| Size | `--hit-target` square |
| Ground | `transparent` at rest — a ghost button, exactly as `New trip` is |
| Colour | `--accent`, as `New trip` |
| Radius | `--radius-sm` |
| Accessible name | `Import files` — the string `TripImportPanel`'s own button already uses |
| Tooltip | `title="Import files"`, the same string. One string for both, per #199 |

Behind it, a hidden `<input type="file" multiple>` with
`accept=".kml,.kmz,.gpx,.jpg,.jpeg,.png,.webp,.zip"` — `TripImportPanel`'s
list, unchanged.

### Why icon-only, and why that was measured

Measured against the running app at 2026-09-12 (dev server, Chromium, a clone
of `.trips-panel__new` injected into `.trips-panel__title-row` and read back
with `getBoundingClientRect()`):

| Form | Width | Title row at 320px | At `--panel-width` (380px) |
|---|---|---|---|
| Labelled `Import` | `77.0px` | **overflows by 22px** | fits, `45.4px` slack |
| Icon-only `↑` | `40.0px` (= `--hit-target`) | **fits, `22.4px` slack** | fits, `82.4px` slack |

The labelled form does not survive a 320px phone. `--panel-width` is 380px and
the heading (`Everything`, `110.1px`) and `New trip` (`91.4px`) are fixed costs
before anything is added.

This is the same call #159 made for the facet chips, on the same kind of
evidence: when the label is what does not fit, the label goes to `aria-label`
and the glyph stays. Hiding a label is not permission to ship an unnamed
control, which is what the accessible name and the tooltip above are for.

**The glyph is `↑`, not `+`.** `+` means *create*, and the button next to it
already means create. An upward arrow is the near-universal import mark and
does not compete with `New trip` for the same meaning.

## The main path

1. The world view's list face is open — no trip, no detail.
2. Tap `↑`. The OS file chooser opens. On a phone this is the photo library,
   the camera, and Files.
3. Choose one or more files. The chooser closes.
4. From here nothing is new: the files go to `importDroppedLoose`, and what
   happens is exactly what happens when those same files are dropped on the
   map at a desktop.
   - A photo with EXIF GPS becomes a loose cairn at its coordinate,
     `positionSource: 'exif'`.
   - A photo without one goes to the placement queue (#155), which is already
     driven by map taps and already works on touch.
   - A track opens #81's import draft.
   - A `.zip` is expanded first and its contents routed by type (#188).
   - A mixed selection does both halves, each down its own path.

## States

| State | The control |
|---|---|
| Rest | `--accent` glyph on `transparent` |
| Hover | `--hover` fill, as `New trip` |
| Pressed | `--pressed` fill, as `New trip` |
| Focus | The global 2px `--accent` outline at 2px offset. Never overridden |
| Signed out | **Rest. Not disabled** — see below |
| Chooser open | Rest. The control does not latch; the OS owns the screen |
| Import in flight | Rest. Progress is the toasts' and the draft's job, not the button's |

**The control is never disabled.** This is the one place the obvious answer is
wrong, and it is worth stating loudly because `TripImportPanel` — the thing
this control is modelled on — *does* disable itself when signed out.

The two surfaces are not the same. Everything a trip imports needs Drive. The
loose path does not: #81 and #120 deliberately keep the track draft working
while disconnected, and `importDroppedLoose` refuses only the photo half, with
`refuseLooseImport`'s single toast for the batch. Disabling the control would
take away a flow that currently works, in order to prevent half of one that is
already prevented at the right level.

So: no `disabled`, and no `Sign in to…` hint under the title row. The refusals
stay where they are, one layer down, where they can tell the two halves apart.

## Edge cases

- **The chooser is dismissed with nothing chosen.** Nothing happens. No
  progress, no toast, no state left behind.
- **The same file is chosen twice in a row.** The second import runs. The
  input's `value` is cleared on every change — `TripImportPanel` already does
  this, and without it a repeat selection fires no `change` event at all.
- **An HEIC is chosen.** `validateImageFile` refuses it by name, with its
  existing HEIC message, surfaced as a toast like any other rejection. It is
  never decoded — that is a recorded decision and this note does not reopen it.
  Naming concrete image extensions in `accept` rather than `image/*` is also
  what gives iOS its best chance of handing over a JPEG from the library in the
  first place; that is platform behaviour this repo cannot assert from a test,
  which is why the refusal path above is specified as the one that has to work.
- **An unsupported type is chosen** (a `.pdf`, a `.txt`). The existing
  unsupported-type message, same route.
- **A photo is chosen while signed out.** #120's one toast for the batch, and
  nothing is written.
- **A track is chosen while signed out.** The draft opens. This is the case the
  no-`disabled` decision exists to protect.
- **A very large selection.** Unchanged from a drop of the same size — this
  note adds no cap that the drop path does not already have.
- **A trip is open.** The world panel is not on screen, so this control is not
  either; `TripImportPanel` is the one in view and it already works on touch.
- **A draft or the placement queue is open.** The panel is showing a draft
  face, not the list face, so the title row and this control are not rendered —
  the same rule that hides the filter chips during a draft.

## Copy

| Where | String |
|---|---|
| Accessible name | `Import files` |
| Tooltip | `Import files` |
| Every refusal, progress and failure string | Unchanged. This note introduces none |

That last row is the point of the issue. A second doorway to one function
should not invent a second vocabulary for what goes wrong behind it.

## New tokens

**None.** `--hit-target`, `--radius-sm`, `--accent`, `--hover`, `--pressed` and
`--space-2` all exist and are all already used by the button this one sits
beside.

## What was measured, and what was not

Measured, and cited above: the two candidate widths, the title row's overflow
at 320 / 360 / 380 / 390px, and that the button's rendered height is `40px`,
equal to `--hit-target` and to `New trip`'s.

**This corrects an acceptance criterion.** The issue said the hit target should
be at least `--row-touch` (44px). The panel's own button standard is
`--hit-target` (40px) — `New trip` measures exactly 40px, and
`design-language.md` sets 44px as the minimum for *rows*, not for controls in
the chrome. Matching `New trip` is the consistent answer, and the criterion has
been revised to say so.

Not measured, and not measurable here: whether an OS file chooser on a real
iPhone hands back a JPEG or an HEIC for a library photo. The design is written
so that either outcome is handled and neither is silent.

## Decisions taken here

- **Icon-only, on measurement.** A labelled button overflows a 320px phone.
  #159's precedent, #159's reasoning.
- **In the title row, beside `New trip`.** The panel's creating actions belong
  together, and it is the one part of the list face that does not scroll away.
  The alternative — `TripImportPanel`'s full-width primary button under the
  header — was rejected because it is a heavier treatment than the world view's
  second-most-common action deserves, and it would push the list down on every
  screen to serve one.
- **Never disabled.** Argued above. This is the decision most likely to be
  wrong if the reasoning about #120 is wrong, so it is the one to check at the
  gate.
- **No `capture` attribute.** It forces the camera and removes the library,
  which is the opposite of the request that started this.

## Out of scope

- Everything behind `importDroppedLoose`. If building this edits that
  function's body rather than calling it, the scope was wrong.
- #339's control, on the cairn detail face. Same root cause, different surface,
  and it shares only the `accept` decision.
- The trip-scoped import control, beyond a possible extraction if the
  implementation takes the shared-component route.
- Auditing the rest of the app for desktop-only gestures. The rule at the top
  of this note is recorded so it can be written into
  `shell-and-content-model.md` later; this issue fixes one instance of it.

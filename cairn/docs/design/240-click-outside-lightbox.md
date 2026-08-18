# 240 — clicking outside the lightbox closes it

Standing documents: [design-language.md](design-language.md) (motion, states),
[cairns.md](cairns.md) (the surface). Prior notes:
[55-photo-list-lightbox.md](55-photo-list-lightbox.md) (the lightbox itself,
`Esc` closes it), [195-lightbox-controls.md](195-lightbox-controls.md) (the ×
control this note does not touch), [196-editing-a-cairn.md](196-editing-a-cairn.md)
(the blur-commits-first rule this note reuses rather than re-deciding), and
[197-seeing-the-photo.md](197-seeing-the-photo.md) (full-bleed mode).

This note adds one dismissal path — a click on the scrim — alongside `×` and
`Esc`. It does not touch #241, which is a separate bug: the lightbox's
`position: fixed` currently resolves against the sidebar panel instead of the
viewport, clipping the dialog (and, on the imageless layout, the × control)
against the panel's edge rather than centring it over the map. That is a CSS
containing-block bug, not a states/interaction question, and this note assumes
it fixed — once #241 lands, "the scrim" below means the true full-viewport
backdrop `55-photo-list-lightbox.md` already specifies, not the clipped one in
today's build.

## The main path

The lightbox is open, centred over the map with the `--scrim` backdrop visible
at the margins (`55-photo-list-lightbox.md`'s "not full-bleed" rule). Clicking
anywhere on that backdrop — outside `.lightbox__dialog` — closes it, landing
focus back on whatever opened it (the row or the marker), exactly as `Esc`
already does.

## Where the boundary is

`.lightbox` is the full-viewport container; `.lightbox__dialog` is the card.
The click handler lives on `.lightbox` itself and closes on any event whose
`target === currentTarget` — i.e. the click landed on the scrim and not on
anything the dialog rendered. This is the same test the dialog already needs
none of, since every interactive element inside it is a `button`/`input`
/`textarea` that would otherwise need its own `stopPropagation`. Testing
`target === currentTarget` avoids sprinkling that across every control.

## States

| Where the click lands | Result |
|---|---|
| The scrim, outside `.lightbox__dialog` | Closes, same as `Esc` from the detail face |
| Inside the dialog — the photo, name/description text, the icon grid, `Remove from trip`, the nav arrows | No effect on the lightbox; the control under the click does whatever it already does |
| Full-bleed mode, on the image | Existing behaviour: toggles back to the detail face (per #197's `lightbox__frame` click handler). The scrim is not visible in full-bleed (`lightbox__dialog--full-bleed` is `width: 100vw; height: 100vh`, no `--scrim` margin), so there is no separate scrim-click target to add here — full-bleed's only dismissal-by-click is already this toggle. |
| A name or description edit is in progress, scrim clicked | The field commits first (moving focus off it triggers the same `onBlur` commit `196-editing-a-cairn.md` already specifies for "Blur caused by closing the lightbox"), then the lightbox closes. Not a special case — a scrim click blurs the field exactly as `×` already does. |

## Edge cases

- **A `mousedown` on the scrim, dragged, `mouseup` inside the dialog (or vice
  versa).** Bind the close to `onClick`, not `onMouseDown` — a browser's native
  `click` event only fires when `mousedown` and `mouseup` land on the same
  target, so a drag that starts on the scrim and ends on the dialog (e.g.
  selecting description text and overshooting) does not close it. This is the
  same reason text selection near a dialog's edge does not accidentally
  dismiss it anywhere else in the app.
- **Full-bleed's own boundary.** Covered above — no new scrim target exists in
  that mode, so nothing changes there.
- **Rapid clicks during the close transition.** The dialog does not animate its
  position, only `padding`/`background-color`/`border-radius`
  (`Lightbox.css`'s existing transition list) — there is no window where a
  second click could land on a half-transitioned target.
- **Touch.** A tap on the scrim is a click; no separate touch handling needed.

## Copy

None. No new strings — this is a new way to trigger the existing close.

## Out of scope

- The clipping/containing-block bug itself (#241) — this note's acceptance
  criteria include confirming the × control is reachable once #241 ships, but
  the fix is #241's.
- Any change to what closing does once triggered — `onClose` is unchanged,
  only a new caller is added.
- Full-bleed gaining its own scrim-style dismissal — it has none to add, per
  the states table above.

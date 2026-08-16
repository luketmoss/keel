import { useRef, useState } from 'react'
import './DescriptionInput.css'

/** An editable cairn description, in place of the text it replaces —
    `NameInput`'s counterpart for the one field that is a `textarea`.
 *
 * Shared by the lightbox (a trip-owned cairn's detail face, #169) and
 * `LooseFace`, because `shell-and-content-model.md` is explicit that moving
 * a cairn into a trip is not a promotion: a capability that appears with
 * ownership breaks that in both directions. What is *not* shared is the
 * surrounding state — which field is open, the saved flash, the failure
 * line — which each face owns, the same split `NameInput` already lives
 * with.
 *
 * Unlike `NameInput`, an empty commit is a real value here. That rule is
 * the caller's to apply (`LooseStore.update` and `useCairnImport
 * .setCairnText` both do); this component only ever reports the raw
 * value. */
export function DescriptionInput({
  initial,
  onCommit,
  onCancel,
  className = 'description-input',
}: {
  initial: string
  onCommit: (value: string) => void
  onCancel: () => void
  className?: string
}) {
  const [value, setValue] = useState(initial)
  /* Escape must not also commit. It calls `onCancel`, which unmounts this —
     and unmounting a focused textarea fires `blur`, which would commit the
     value Escape just discarded. The flag is read by the blur handler and
     is the reason Escape reverts rather than saving. */
  const cancelled = useRef(false)

  return (
    <textarea
      autoFocus
      className={className}
      aria-label="Description"
      rows={3}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      // Caret at the end rather than the whole value selected: a
      // description is usually being added to, where a name is usually
      // being replaced.
      onFocus={(event) => event.target.setSelectionRange(value.length, value.length)}
      onBlur={() => {
        if (cancelled.current) return
        onCommit(value)
      }}
      onKeyDown={(event) => {
        /* Enter commits and Shift+Enter inserts a newline — the inverse of
           the conventional textarea contract, and chosen deliberately (see
           the design note): every other field on this surface commits on
           Enter, and a field whose commit key differs from its neighbour's
           is the kind of inconsistency discovered by losing an edit. */
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault()
          onCommit(value)
          return
        }
        if (event.key === 'Escape') {
          // One Escape, one effect, innermost first: this reverts the field
          // and the lightbox stays open. What keeps the dialog from closing
          // on the same keypress is `Lightbox`'s own listener ignoring
          // events aimed at a text field, not anything done here.
          event.preventDefault()
          cancelled.current = true
          onCancel()
        }
      }}
    />
  )
}

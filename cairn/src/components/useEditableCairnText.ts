import { useCallback, useEffect, useRef, useState } from 'react'
import { fieldRevertedMessage } from '../store/looseStore'

export type CairnTextField = 'name' | 'description'

/** #196's click-to-edit state machine, for a cairn's name and description.
 *
 * The design note says not to extract a shared *field* component yet, and
 * this is not one — the two faces render genuinely different markup (the
 * lightbox's name is an `h2`, `LooseFace`'s is already `NameInput` behind
 * a `⋮` action) and neither is shared. What is shared is the part that is
 * identical and easy to get subtly wrong: which field is open, the 300ms
 * saved flash and its timer's cleanup, and the failure line. Three copies
 * of a `setTimeout` that must be cleared on unmount is where a leak lives.
 *
 * The commit is optimistic at the store layer (`setCairnText`,
 * `LooseStore.update`), so nothing here holds a pending value — the record
 * has already changed by the time `onSave` resolves, and a `false` means
 * it has already changed back. */
export function useEditableCairnText(
  onSave: ((patch: { name?: string; description?: string }) => Promise<boolean>) | undefined,
) {
  const [editing, setEditing] = useState<CairnTextField | null>(null)
  const [error, setError] = useState<CairnTextField | null>(null)
  const [saved, setSaved] = useState<CairnTextField | null>(null)
  const savedTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    return () => clearTimeout(savedTimeoutRef.current)
  }, [])

  /** `undefined` while disconnected (#73) — the click does not start an
      edit, rather than opening an input over a store that will refuse the
      write. Same "control that would fail if used" rule the icon grid and
      the import button already apply. */
  const editable = onSave !== undefined

  const startEditing = useCallback(
    (field: CairnTextField) => {
      if (!editable) return
      // Starting a second edit closes the first rather than stacking two
      // inputs open at once; the first's own blur is what commits it.
      setEditing(field)
    },
    [editable],
  )

  const commit = useCallback(
    async (field: CairnTextField, patch: { name?: string; description?: string }) => {
      setEditing(null)
      if (!onSave) return
      const ok = await onSave(patch)
      if (!ok) {
        setError(field)
        return
      }
      setError(null)
      setSaved(field)
      clearTimeout(savedTimeoutRef.current)
      savedTimeoutRef.current = setTimeout(() => setSaved(null), 300)
    },
    [onSave],
  )

  return {
    editing,
    editable,
    startEditing,
    cancelEditing: useCallback(() => setEditing(null), []),
    commit,
    savedField: saved,
    /** The failure line for `field`, or `null`. Only ever one at a time:
        a second edit that succeeds clears it. */
    errorFor: (field: CairnTextField) => (error === field ? fieldRevertedMessage(field) : null),
  }
}

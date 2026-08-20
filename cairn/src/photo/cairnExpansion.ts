/* #250 — the shared decision behind a click on a cairn's row header or its
   marker. `TripDetail.selectCairn` is the one function both `CairnList`'s
   `onOpenRow` and `CairnLayer`'s `onOpenCairn` call, and this is the pure
   part of it: given what was clicked and what is expanded now, what should
   be expanded (or opened) next. Pulled out of the component so the "only
   one row expanded at a time" and "no image never expands" rules are
   testable without mounting anything, matching `cairnRules.ts`'s and
   `cairnAttachment.ts`'s precedent of logic living outside the component. */

export interface CairnClickOutcome {
  /** Set only for an icon-only cairn — the lightbox opens, exactly as
      `openCairn` always did, and expansion is left alone (there is nothing
      to expand). */
  openCairnId?: string
  /** Set only for a cairn with an image — the row's expansion after this
      click. Toggling the already-expanded cairn's own id collapses it;
      any other id implicitly collapses whatever was expanded before, since
      this is the single next value of one piece of state. */
  expandedCairnId?: string | null
}

/** A cairn with no image keeps today's single click to its detail face —
    there is nothing for a row to preview (issue's "Out of Scope" line,
    applied one level out from #197's same rule for full bleed). A cairn
    with an image never opens the lightbox from this click; only its own
    inline preview button does. */
export function cairnClickOutcome(
  cairnId: string,
  hasImage: boolean,
  currentExpandedId: string | null,
): CairnClickOutcome {
  if (!hasImage) return { openCairnId: cairnId }
  return { expandedCairnId: currentExpandedId === cairnId ? null : cairnId }
}

/** The lightbox's arrow navigation moves `expandedCairnId` to follow
    `selectedCairnId`/`openCairnId`, so closing the lightbox lands on an
    expanded row for the cairn arrived at — except an icon-only cairn, whose
    row cannot expand, in which case nothing is expanded rather than
    something stale from before the arrow press. */
export function expandedIdAfterNavigate(cairnId: string, hasImage: boolean): string | null {
  return hasImage ? cairnId : null
}

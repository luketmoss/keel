/* #250 — the shared decision behind a click on a cairn's row header or its
   marker. `TripDetail.selectCairn` is the one function both `CairnList`'s
   `onOpenRow` and `CairnLayer`'s `onOpenCairn` call, and this is the pure
   part of it: given what was clicked and what is expanded now, what should
   be expanded (or opened) next. Pulled out of the component so the "only
   one row expanded at a time" and "no image never expands" rules are
   testable without mounting anything, matching `cairnRules.ts`'s and
   `cairnAttachment.ts`'s precedent of logic living outside the component.

   #294 revises this: every cairn now has a row to expand, image or not —
   only the expanded *body* differs (the photo preview vs. the read-only
   summary), which `CairnList` decides, not this. Neither function below
   still needs to know whether a cairn has an image, so both drop that
   parameter along with the icon-only special case it existed for. */

export interface CairnClickOutcome {
  /** The row's expansion after this click. Toggling the already-expanded
      cairn's own id collapses it; any other id implicitly collapses
      whatever was expanded before, since this is the single next value of
      one piece of state. */
  expandedCairnId: string | null
}

/** #294: every cairn's row expands on click, image or not — the
    toggle-to-collapse behaviour #250 already gave a photo cairn now
    applies unchanged to every cairn. The lightbox is never opened from
    this click any more; only the expanded row's own body (the photo
    preview or the summary block) does that. */
export function cairnClickOutcome(cairnId: string, currentExpandedId: string | null): CairnClickOutcome {
  return { expandedCairnId: currentExpandedId === cairnId ? null : cairnId }
}

/** The lightbox's arrow navigation moves `expandedCairnId` to follow
    `selectedCairnId`/`openCairnId`, so closing the lightbox lands on an
    expanded row for the cairn arrived at. #294: this now holds for every
    cairn — an icon-only cairn's row expands into its summary the same way
    a photo cairn's expands into its preview, so there is no longer a case
    that returns `null`. */
export function expandedIdAfterNavigate(cairnId: string): string {
  return cairnId
}

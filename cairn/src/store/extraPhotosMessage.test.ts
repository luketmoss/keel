import { describe, expect, it } from 'vitest'
import { ONLY_ONE_PHOTO_MESSAGE, extraPhotosMessage } from './looseStore'

/* #188: a zip dropped onto an open cairn would otherwise emit one
   `ONLY_ONE_PHOTO_MESSAGE` per extra photo. Thirty identical toasts from a
   single gesture is not feedback. */
describe('extraPhotosMessage', () => {
  it('names how many were left out, in one line', () => {
    expect(extraPhotosMessage(29)).toBe("a cairn takes one photo; the other 29 weren't added")
  })

  it('reads correctly for a single extra', () => {
    expect(extraPhotosMessage(1)).toBe("a cairn takes one photo; the other 1 wasn't added")
  })

  it('is a different message from the per-file one it collapses', () => {
    expect(extraPhotosMessage(2)).not.toBe(ONLY_ONE_PHOTO_MESSAGE)
  })
})

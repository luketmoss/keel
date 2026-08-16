import { describe, expect, it } from 'vitest'
import { UNRECOGNISED } from './useLooseImport'
import { UNRECOGNISED_TYPE_MESSAGE } from '../components/TripDetail'

/* #188 criterion 13. The rejection row is where someone who drops the
   wrong thing finds out what the right things are, so it has to list the
   archive now that one is accepted — the picker's `accept` list is the
   only other place, and it is only seen by people who use the button. */
describe('unrecognised-file copy', () => {
  it('names archives alongside tracks and photos, loose', () => {
    expect(UNRECOGNISED).toBe(
      'cairn takes .kml, .kmz or .gpx tracks, JPEG, PNG or WebP photos, and .zip archives',
    )
  })

  it('names archives alongside tracks and photos, in a trip', () => {
    expect(UNRECOGNISED_TYPE_MESSAGE).toBe(
      'trips take .kml, .kmz or .gpx tracks, JPEG, PNG or WebP photos, and .zip archives',
    )
  })
})

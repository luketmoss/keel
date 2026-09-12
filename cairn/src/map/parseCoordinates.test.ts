import { describe, expect, it } from 'vitest'
import { formatCoordinate, parseCoordinate } from './parseCoordinates'

/** cairn/docs/design/337-pasting-a-coordinate.md — the note's "What parses"
    table, case for case, plus the edge cases it lists. */

const SEATTLE = { lat: 47.6205, lng: -122.3493 }

function expectClose(actual: ReturnType<typeof parseCoordinate>, expected: typeof SEATTLE, tolerance = 1e-9) {
  expect(actual).not.toBeNull()
  expect(actual!.lat).toBeCloseTo(expected.lat, -Math.log10(tolerance))
  expect(actual!.lng).toBeCloseTo(expected.lng, -Math.log10(tolerance))
}

describe('parseCoordinate', () => {
  it('reads a decimal pair latitude first', () => {
    expect(parseCoordinate('47.6205, -122.3493')).toEqual(SEATTLE)
  })

  it('accepts whitespace instead of a comma', () => {
    expect(parseCoordinate('47.6205 -122.3493')).toEqual(SEATTLE)
  })

  it('ignores surrounding whitespace and newlines', () => {
    expect(parseCoordinate('\n  47.6205, -122.3493  \n')).toEqual(SEATTLE)
  })

  it('accepts degree signs', () => {
    expect(parseCoordinate('47.6205°, -122.3493°')).toEqual(SEATTLE)
  })

  it('accepts hemisphere letters after each value', () => {
    expectClose(parseCoordinate('47.6205° N, 122.3493° W'), SEATTLE)
    expectClose(parseCoordinate('47.6205N, 122.3493W'), SEATTLE)
  })

  it('accepts hemisphere letters before each value', () => {
    expectClose(parseCoordinate('N 47.6205 W 122.3493'), SEATTLE)
    expectClose(parseCoordinate('N47.6205 W122.3493'), SEATTLE)
  })

  it('reads degrees, minutes and seconds', () => {
    expectClose(parseCoordinate(`47°37'13.8"N 122°20'57.5"W`), SEATTLE, 0.0001)
  })

  it('uses the letters to orient the pair, whichever order they come in', () => {
    expectClose(parseCoordinate('W 122.3493, N 47.6205'), SEATTLE)
  })

  it('reads longitude first when the first value cannot be a latitude', () => {
    expect(parseCoordinate('-122.3493, 47.6205')).toEqual(SEATTLE)
  })

  it('keeps latitude first when both values could be either', () => {
    expect(parseCoordinate('10, 20')).toEqual({ lat: 10, lng: 20 })
  })

  it('ignores a third value', () => {
    expect(parseCoordinate('47.6205, -122.3493, 812')).toEqual(SEATTLE)
  })

  it('places the antimeridian and the poles', () => {
    expect(parseCoordinate('0, 180')).toEqual({ lat: 0, lng: 180 })
    expect(parseCoordinate('90, 0')).toEqual({ lat: 90, lng: 0 })
    expect(parseCoordinate('0, 0')).toEqual({ lat: 0, lng: 0 })
  })

  it('refuses a pair out of range either way round', () => {
    expect(parseCoordinate('91, 181')).toBeNull()
    expect(parseCoordinate('100, 200')).toBeNull()
  })

  it('refuses a hemisphere letter that disagrees with a sign', () => {
    expect(parseCoordinate('N -47.6205, W 122.3493')).toBeNull()
  })

  it('refuses two letters naming the same axis', () => {
    expect(parseCoordinate('N 47.6205, S 12.0')).toBeNull()
    expect(parseCoordinate('E 47.6205, W 12.0')).toBeNull()
  })

  it('refuses minutes or seconds of sixty and over', () => {
    expect(parseCoordinate(`47°60'00"N 122°20'57"W`)).toBeNull()
    expect(parseCoordinate(`47°37'60"N 122°20'57"W`)).toBeNull()
  })

  it('refuses a name', () => {
    expect(parseCoordinate('Larapinta')).toBeNull()
    expect(parseCoordinate('')).toBeNull()
    expect(parseCoordinate('Ellery Creek camp')).toBeNull()
  })

  it('refuses a coordinate buried in other words', () => {
    // "Extracting a pair from inside arbitrary text means deciding which
    // numbers in a sentence are coordinates, and the failure mode is
    // placing a cairn from a phone number."
    expect(parseCoordinate('Camp 47.6205, -122.3493')).toBeNull()
  })

  it('refuses a single value', () => {
    expect(parseCoordinate('47.6205')).toBeNull()
  })
})

describe('formatCoordinate', () => {
  it('writes five decimal places, including trailing zeros', () => {
    expect(formatCoordinate(SEATTLE)).toBe('47.62050, -122.34930')
    expect(formatCoordinate({ lat: 0, lng: 0 })).toBe('0.00000, 0.00000')
  })

  it('writes the normalised point rather than the typed string', () => {
    const parsed = parseCoordinate('N47.6205 W122.3493')!
    expect(formatCoordinate(parsed)).toBe('47.62050, -122.34930')
  })
})

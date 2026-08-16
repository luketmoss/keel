import { describe, expect, it } from 'vitest'
import { iconLabel } from './iconLabel'

describe('iconLabel (#199)', () => {
  it('gives the tooltip and the accessible name the same string', () => {
    const props = iconLabel('Delete "Notch Mountain" permanently')

    expect(props.title).toBe('Delete "Notch Mountain" permanently')
    expect(props['aria-label']).toBe(props.title)
  })

  it('carries the subject through untouched, punctuation and all', () => {
    // The tooltip appears over a list where every row has the same glyphs,
    // so the row's own name is the whole point of it.
    const props = iconLabel('Reorder Day 3 — Kamikōchi → Yari.kml')

    expect(props.title).toBe('Reorder Day 3 — Kamikōchi → Yari.kml')
  })
})

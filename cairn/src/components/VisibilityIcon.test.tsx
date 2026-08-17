import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { VisibilityIcon } from './VisibilityIcon'
import { CAIRN_ICON_GLYPHS, EYE_PATH } from './CairnIcon'

// #235 — "the app has one eye": the toggle's visible-state path and the
// viewpoint cairn's glyph must be the same string, not two copies that
// happen to currently match. A hand-edit to either one alone would break
// this before it could drift into a visible near-match.
describe('VisibilityIcon', () => {
  it('shares its eye geometry with the viewpoint cairn icon', () => {
    expect(CAIRN_ICON_GLYPHS.viewpoint.d).toBe(EYE_PATH)
  })

  it('draws a single path — the eye — when visible', () => {
    const { container } = render(<VisibilityIcon visible />)

    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('aria-hidden')).toBe('true')
    const paths = svg?.querySelectorAll('path')
    expect(paths).toHaveLength(1)
    expect(paths?.[0].getAttribute('d')).toBe(EYE_PATH)
  })

  it('adds a second path — the slash — when hidden, keeping the same eye', () => {
    const { container } = render(<VisibilityIcon visible={false} />)

    const paths = container.querySelectorAll('svg path')
    expect(paths).toHaveLength(2)
    expect(paths[0].getAttribute('d')).toBe(EYE_PATH)
    expect(paths[1].getAttribute('d')).not.toBe(EYE_PATH)
  })
})

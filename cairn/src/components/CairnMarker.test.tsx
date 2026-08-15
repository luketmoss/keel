import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CairnMarker } from './CairnMarker'

describe('CairnMarker — the one marker predicate, drawn (#169)', () => {
  it('draws a thumbnail when it has an image and no icon', () => {
    const { container } = render(<CairnMarker icon={null} hasImage thumbnailUrl="thumb.jpg" selected={false} />)
    expect(container.querySelector('.cairn-marker--thumb')).not.toBeNull()
    expect(container.querySelector('.cairn-marker--pin')).toBeNull()
    expect(container.querySelector('img')?.getAttribute('src')).toBe('thumb.jpg')
  })

  it('draws a pin carrying its icon when it has one, whether or not it also has an image', () => {
    const { container } = render(<CairnMarker icon="campsite" hasImage selected={false} />)
    expect(container.querySelector('.cairn-marker--pin')).not.toBeNull()
    expect(container.querySelector('.cairn-marker--thumb')).toBeNull()
    expect(container.querySelector('.cairn-icon-glyph')).not.toBeNull()
  })

  it('a pin carrying an image shows a camera badge', () => {
    const { container } = render(<CairnMarker icon="campsite" hasImage selected={false} />)
    expect(container.querySelector('.cairn-marker__badge')).not.toBeNull()
  })

  it('a pin with no image shows no camera badge', () => {
    const { container } = render(<CairnMarker icon="campsite" hasImage={false} selected={false} />)
    expect(container.querySelector('.cairn-marker__badge')).toBeNull()
  })

  it('a cairn with neither an icon nor an image draws as an unmarked pin', () => {
    const { container } = render(<CairnMarker icon={null} hasImage={false} selected={false} />)
    expect(container.querySelector('.cairn-marker--pin')).not.toBeNull()
    expect(container.querySelector('.cairn-marker__pin-dot')).not.toBeNull()
  })

  it('selection inverts a pin to the accent fill', () => {
    const { container } = render(<CairnMarker icon="campsite" hasImage={false} selected />)
    expect(container.querySelector('.cairn-marker--selected')).not.toBeNull()
  })

  it('selection thickens a thumbnail ring rather than inverting its fill', () => {
    const { container } = render(<CairnMarker icon={null} hasImage selected source="exif" />)
    const marker = container.querySelector('.cairn-marker--thumb') as HTMLElement
    expect(marker.style.borderColor).toBe('var(--accent)')
  })

  it('a thumbnail still carries #54\'s provenance ring — solid for exif, dashed for interpolated', () => {
    const { container: exif } = render(<CairnMarker icon={null} hasImage selected={false} source="exif" />)
    const { container: interpolated } = render(
      <CairnMarker icon={null} hasImage selected={false} source="interpolated" />,
    )
    expect((exif.querySelector('.cairn-marker--thumb') as HTMLElement).style.borderStyle).toBe('solid')
    expect((interpolated.querySelector('.cairn-marker--thumb') as HTMLElement).style.borderStyle).toBe(
      'dashed',
    )
  })
})

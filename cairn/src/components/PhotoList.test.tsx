import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PhotoList } from './PhotoList'
import { orderPhotoListItems, type PhotoListRow } from '../photo/photoListGroups'

vi.mock('../photo/imageCache', () => ({
  photoImageCache: {
    acquire: vi.fn().mockResolvedValue({ url: 'blob:fake-thumb', release: vi.fn() }),
  },
}))

function row(overrides: Partial<PhotoListRow> = {}): PhotoListRow {
  return {
    id: 'p1',
    name: 'a.jpg',
    thumbnailDriveFileId: 'thumb-1',
    originalDriveFileId: 'orig-1',
    located: true,
    ...overrides,
  }
}

describe('PhotoList', () => {
  it('shows the empty state pointing at the import control when the trip has no photos (criterion 13)', () => {
    render(
      <PhotoList
        items={[]}
        totalCount={0}
        selectedPhotoId={null}
        accessToken="token"
        tripOffsetHours={0}
        onOpenRow={vi.fn()}
      />,
    )

    expect(screen.getByText('No photos yet')).toBeDefined()
    expect(screen.getByText('Drop photos onto this trip to see them here.')).toBeDefined()
    // No count shown next to the header when there are no photos.
    expect(screen.queryByText('0')).toBeNull()
  })

  it('renders one row per photo and the header count (criterion 1)', () => {
    const rows = [row({ id: 'a', captureInstantMs: 100 }), row({ id: 'b', captureInstantMs: 200 })]
    const items = orderPhotoListItems(rows)

    render(
      <PhotoList
        items={items}
        totalCount={2}
        selectedPhotoId={null}
        accessToken="token"
        tripOffsetHours={0}
        onOpenRow={vi.fn()}
      />,
    )

    expect(screen.getByText('2')).toBeDefined()
    expect(screen.getAllByRole('button')).toHaveLength(2)
  })

  it('renders a No date divider for an undated photo and never drops it (criterion 3)', () => {
    const rows = [row({ id: 'dated', name: 'z.jpg', captureInstantMs: 100 }), row({ id: 'undated', name: 'a.jpg' })]
    const items = orderPhotoListItems(rows)

    render(
      <PhotoList
        items={items}
        totalCount={2}
        selectedPhotoId={null}
        accessToken="token"
        tripOffsetHours={0}
        onOpenRow={vi.fn()}
      />,
    )

    expect(screen.getByText('No date')).toBeDefined()
    expect(screen.getByText('a.jpg')).toBeDefined()
    expect(screen.getByText('—')).toBeDefined()
  })

  it('renders a No location divider for an unlocated photo, reachable despite no marker (criterion 4)', () => {
    const rows = [row({ id: 'located', captureInstantMs: 100 }), row({ id: 'unlocated', located: false, name: 'no-gps.jpg' })]
    const items = orderPhotoListItems(rows)

    render(
      <PhotoList
        items={items}
        totalCount={2}
        selectedPhotoId={null}
        accessToken="token"
        tripOffsetHours={0}
        onOpenRow={vi.fn()}
      />,
    )

    expect(screen.getByText('No location')).toBeDefined()
    expect(screen.getByText('no-gps.jpg')).toBeDefined()
  })

  it('calls onOpenRow when a row is clicked (selection + open in one action)', () => {
    const onOpenRow = vi.fn()
    const rows = [row({ id: 'a', name: 'a.jpg', captureInstantMs: 100 })]
    const items = orderPhotoListItems(rows)

    render(
      <PhotoList
        items={items}
        totalCount={1}
        selectedPhotoId={null}
        accessToken="token"
        tripOffsetHours={0}
        onOpenRow={onOpenRow}
      />,
    )

    fireEvent.click(screen.getByText('a.jpg'))
    expect(onOpenRow).toHaveBeenCalledWith('a')
  })

  it('marks the selected row distinctly (design language selected state)', () => {
    const rows = [row({ id: 'a', captureInstantMs: 100 }), row({ id: 'b', captureInstantMs: 200 })]
    const items = orderPhotoListItems(rows)

    const { container } = render(
      <PhotoList
        items={items}
        totalCount={2}
        selectedPhotoId="b"
        accessToken="token"
        tripOffsetHours={0}
        onOpenRow={vi.fn()}
      />,
    )

    const listItems = container.querySelectorAll('.photo-row')
    expect(listItems[0].className).not.toContain('photo-row--selected')
    expect(listItems[1].className).toContain('photo-row--selected')
  })

  it('scrolls the selected row into view with block: nearest when selection changes (criterion 6)', () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    const rows = [row({ id: 'a', captureInstantMs: 100 }), row({ id: 'b', captureInstantMs: 200 })]
    const items = orderPhotoListItems(rows)

    const { rerender } = render(
      <PhotoList
        items={items}
        totalCount={2}
        selectedPhotoId={null}
        accessToken="token"
        tripOffsetHours={0}
        onOpenRow={vi.fn()}
      />,
    )
    expect(scrollIntoView).not.toHaveBeenCalled()

    rerender(
      <PhotoList
        items={items}
        totalCount={2}
        selectedPhotoId="b"
        accessToken="token"
        tripOffsetHours={0}
        onOpenRow={vi.fn()}
      />,
    )

    expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: 'nearest' }))
  })

  it('carries a derived caveat on an interpolated row but not on a recorded one', () => {
    const rows = [
      row({ id: 'recorded', source: 'exif', captureInstantMs: 100 }),
      row({ id: 'derived', source: 'interpolated', captureInstantMs: 200 }),
    ]
    const items = orderPhotoListItems(rows)

    render(
      <PhotoList
        items={items}
        totalCount={2}
        selectedPhotoId={null}
        accessToken="token"
        tripOffsetHours={0}
        onOpenRow={vi.fn()}
      />,
    )

    expect(screen.getByText('⟂ estimated')).toBeDefined()
    expect(screen.queryAllByText('⟂ estimated')).toHaveLength(1)
  })
})

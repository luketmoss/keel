import { createRef } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Lightbox } from './Lightbox'
import type { PhotoListRow } from '../photo/photoListGroups'

const { acquire } = vi.hoisted(() => ({ acquire: vi.fn() }))
vi.mock('../photo/imageCache', () => ({
  photoImageCache: { acquire },
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

beforeEach(() => {
  acquire.mockReset()
  acquire.mockResolvedValue({ url: 'blob:fake', release: vi.fn() })
})

describe('Lightbox', () => {
  it('renders as a modal dialog with an aria-label naming the photo (criterion 7)', async () => {
    render(
      <Lightbox
        row={row()}
        rows={[row()]}
        tripOffsetHours={0}
        accessToken="token"
        onClose={vi.fn()}
        onNavigate={vi.fn()}
        returnFocusRef={createRef<HTMLElement>()}
      />,
    )

    const dialog = screen.getByRole('dialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.getAttribute('aria-label')).toBe('a.jpg')

    await waitFor(() => expect(screen.getByAltText('a.jpg')).toBeDefined())
  })

  it('moves focus to the close button on open, and returns focus to the opener on unmount (criteria 9, 10)', async () => {
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    const returnFocusRef = { current: opener }

    const { unmount } = render(
      <Lightbox
        row={row()}
        rows={[row()]}
        tripOffsetHours={0}
        accessToken="token"
        onClose={vi.fn()}
        onNavigate={vi.fn()}
        returnFocusRef={returnFocusRef}
      />,
    )

    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close photo' })))

    unmount()
    expect(document.activeElement).toBe(opener)
    document.body.removeChild(opener)
  })

  it('calls onClose on Escape, even while the original is still loading (edge case)', async () => {
    acquire.mockReturnValue(new Promise(() => {})) // never resolves — still "loading"
    const onClose = vi.fn()

    render(
      <Lightbox
        row={row()}
        rows={[row()]}
        tripOffsetHours={0}
        accessToken="token"
        onClose={onClose}
        onNavigate={vi.fn()}
        returnFocusRef={createRef<HTMLElement>()}
      />,
    )

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('moves to the next/previous photo on ArrowRight/ArrowLeft, in list order (criterion 8)', () => {
    const onNavigate = vi.fn()
    const rows = [row({ id: 'a' }), row({ id: 'b' }), row({ id: 'c' })]

    render(
      <Lightbox
        row={rows[1]}
        rows={rows}
        tripOffsetHours={0}
        accessToken="token"
        onClose={vi.fn()}
        onNavigate={onNavigate}
        returnFocusRef={createRef<HTMLElement>()}
      />,
    )

    fireEvent.keyDown(document, { key: 'ArrowRight' })
    expect(onNavigate).toHaveBeenCalledWith('c')

    fireEvent.keyDown(document, { key: 'ArrowLeft' })
    expect(onNavigate).toHaveBeenCalledWith('a')
  })

  it('does not wrap at either boundary — arrows are disabled instead (edge case)', () => {
    const onNavigate = vi.fn()
    const rows = [row({ id: 'only' })]

    render(
      <Lightbox
        row={rows[0]}
        rows={rows}
        tripOffsetHours={0}
        accessToken="token"
        onClose={vi.fn()}
        onNavigate={onNavigate}
        returnFocusRef={createRef<HTMLElement>()}
      />,
    )

    fireEvent.keyDown(document, { key: 'ArrowRight' })
    fireEvent.keyDown(document, { key: 'ArrowLeft' })
    expect(onNavigate).not.toHaveBeenCalled()

    const prev = screen.getByRole('button', { name: 'Previous photo' }) as HTMLButtonElement
    const next = screen.getByRole('button', { name: 'Next photo' }) as HTMLButtonElement
    expect(prev.disabled).toBe(true)
    expect(next.disabled).toBe(true)
  })

  it('shows a distinct error line when the original fails to load, keeping the viewer open (criterion 11)', async () => {
    acquire.mockImplementation((_token: string, fileId: string) => {
      if (fileId === 'orig-1') return Promise.reject(new Error('gone'))
      return Promise.resolve({ url: 'blob:thumb', release: vi.fn() })
    })

    render(
      <Lightbox
        row={row()}
        rows={[row()]}
        tripOffsetHours={0}
        accessToken="token"
        onClose={vi.fn()}
        onNavigate={vi.fn()}
        returnFocusRef={createRef<HTMLElement>()}
      />,
    )

    await waitFor(() => expect(screen.getByText("Couldn't load this photo.")).toBeDefined())
    // The viewer itself stays up — dialog still present, arrows still there.
    expect(screen.getByRole('dialog')).toBeDefined()
  })

  it('shows the capture time and, for a derived photo, the estimated-position line', () => {
    render(
      <Lightbox
        row={row({ captureInstantMs: Date.parse('2024-06-01T09:14:00Z'), source: 'interpolated' })}
        rows={[row()]}
        tripOffsetHours={0}
        accessToken="token"
        onClose={vi.fn()}
        onNavigate={vi.fn()}
        returnFocusRef={createRef<HTMLElement>()}
      />,
    )

    expect(screen.getByText('09:14 · Position estimated from track')).toBeDefined()
  })
})

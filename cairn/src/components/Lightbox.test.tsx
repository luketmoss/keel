import { createRef } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Lightbox } from './Lightbox'
import type { CairnListRow } from '../photo/cairnListGroups'

const { acquire } = vi.hoisted(() => ({ acquire: vi.fn() }))
vi.mock('../photo/imageCache', () => ({
  photoImageCache: { acquire },
}))

function row(overrides: Partial<CairnListRow> = {}): CairnListRow {
  return {
    id: 'p1',
    name: 'a.jpg',
    icon: null,
    thumbnailDriveFileId: 'thumb-1',
    originalDriveFileId: 'orig-1',
    date: '2023-06-16',
    source: 'exif',
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
        description=""
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
        description=""
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
        description=""
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
        description=""
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
        description=""
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
        description=""
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

  describe('#169 — the detail face folded in', () => {
    it('shows the meta line, naming the icon and photo as separate clauses', () => {
      render(
        <Lightbox
          row={row({ icon: 'campsite' })}
          rows={[row()]}
          description=""
          accessToken="token"
          onClose={vi.fn()}
          onNavigate={vi.fn()}
          returnFocusRef={createRef<HTMLElement>()}
        />,
      )

      expect(screen.getByText(/campsite · photo/)).toBeDefined()
    })

    it('shows the description when present', () => {
      render(
        <Lightbox
          row={row()}
          rows={[row()]}
          description="A good spot to camp."
          accessToken="token"
          onClose={vi.fn()}
          onNavigate={vi.fn()}
          returnFocusRef={createRef<HTMLElement>()}
        />,
      )

      expect(screen.getByText('A good spot to camp.')).toBeDefined()
    })

    it('shows "No description." when empty', () => {
      render(
        <Lightbox
          row={row()}
          rows={[row()]}
          description=""
          accessToken="token"
          onClose={vi.fn()}
          onNavigate={vi.fn()}
          returnFocusRef={createRef<HTMLElement>()}
        />,
      )

      expect(screen.getByText('No description.')).toBeDefined()
    })

    it("shows the position-source sentence, matching the cairn's actual source", () => {
      render(
        <Lightbox
          row={row({ source: 'interpolated' })}
          rows={[row()]}
          description=""
          accessToken="token"
          onClose={vi.fn()}
          onNavigate={vi.fn()}
          returnFocusRef={createRef<HTMLElement>()}
        />,
      )

      expect(
        screen.getByText(/positioned by timestamp against this trip’s tracks/),
      ).toBeDefined()
    })

    it('offers Remove from trip when the caller supplies it, and calls it on click', () => {
      const onRemoveFromTrip = vi.fn()
      render(
        <Lightbox
          row={row()}
          rows={[row()]}
          description=""
          accessToken="token"
          onClose={vi.fn()}
          onNavigate={vi.fn()}
          onRemoveFromTrip={onRemoveFromTrip}
          returnFocusRef={createRef<HTMLElement>()}
        />,
      )

      fireEvent.click(screen.getByRole('button', { name: 'Remove from trip' }))
      expect(onRemoveFromTrip).toHaveBeenCalled()
    })

    it('offers no Remove from trip control when the caller has nowhere to put a detached cairn', () => {
      render(
        <Lightbox
          row={row()}
          rows={[row()]}
          description=""
          accessToken="token"
          onClose={vi.fn()}
          onNavigate={vi.fn()}
          returnFocusRef={createRef<HTMLElement>()}
        />,
      )

      expect(screen.queryByRole('button', { name: 'Remove from trip' })).toBeNull()
    })
  })

  describe('#158 dragging a cairn', () => {
    it('shows the disconnected sentence', () => {
      render(
        <Lightbox
          row={row()}
          rows={[row()]}
          description=""
          accessToken="token"
          onClose={vi.fn()}
          onNavigate={vi.fn()}
          signedOut={true}
          returnFocusRef={createRef<HTMLElement>()}
        />,
      )

      expect(screen.getByText('Sign in to move cairns.')).toBeDefined()
    })

    it('shows the move-write failure line', () => {
      render(
        <Lightbox
          row={row()}
          rows={[row()]}
          description=""
          accessToken="token"
          onClose={vi.fn()}
          onNavigate={vi.fn()}
          moveError="Couldn't move it — put back where it was."
          returnFocusRef={createRef<HTMLElement>()}
        />,
      )

      expect(screen.getByText("Couldn't move it — put back where it was.")).toBeDefined()
    })

    it('shows neither line by default', () => {
      render(
        <Lightbox
          row={row()}
          rows={[row()]}
          description=""
          accessToken="token"
          onClose={vi.fn()}
          onNavigate={vi.fn()}
          returnFocusRef={createRef<HTMLElement>()}
        />,
      )

      expect(screen.queryByText('Sign in to move cairns.')).toBeNull()
      expect(screen.queryByText("Couldn't move it — put back where it was.")).toBeNull()
    })
  })
})

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

  /* #195 — the controls were painted behind the image, so on a photo wide
     enough to reach the corner there was nothing to click and Escape was the
     only way out. Whether they are *visible* is a CSS question jsdom cannot
     answer; that they respond to a click is this half of it, and it had no
     coverage at all — every existing test drove the viewer by keyboard. */
  it('closes on a click of the close control, not only on Escape (#195)', () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Close photo' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('navigates on a click of the previous and next controls (#195)', () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Next photo' }))
    expect(onNavigate).toHaveBeenLastCalledWith('c')

    fireEvent.click(screen.getByRole('button', { name: 'Previous photo' }))
    expect(onNavigate).toHaveBeenLastCalledWith('a')
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

    // #196 replaced `No description.` — a statement rather than an
    // invitation, which is why an empty description read as a field that
    // does not exist.
    it('shows the "Add a description" placeholder when empty', () => {
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

      expect(screen.getByText('Add a description')).toBeDefined()
      expect(screen.queryByText('No description.')).toBeNull()
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
  /* #197 — the photo gets the space that exists, and a mode for when even
     that is not enough. The two-column split itself is CSS-only and is
     verified in the browser; what is behavioural is the mode. */
  describe('#197 full bleed', () => {
    function renderBox(props: Partial<Parameters<typeof Lightbox>[0]> = {}) {
      const merged = {
        row: row(),
        rows: [row()],
        description: '',
        accessToken: 'token',
        onClose: vi.fn(),
        onNavigate: vi.fn(),
        returnFocusRef: createRef<HTMLElement>(),
        ...props,
      }
      return { ...render(<Lightbox {...merged} />), props: merged }
    }

    const photo = () => screen.getByRole('button', { name: /full size$/ })

    it('clicking the photo enters full bleed, and clicking it again returns', () => {
      renderBox()

      expect(screen.getByRole('button', { name: 'View full size' })).toBeDefined()
      fireEvent.click(photo())

      // Nothing but the photo and its controls: no name, no meta, no
      // description.
      expect(screen.getByRole('button', { name: 'Exit full size' })).toBeDefined()
      expect(screen.getByRole('dialog').className).toContain('lightbox__dialog--full-bleed')

      fireEvent.click(photo())
      expect(screen.getByRole('button', { name: 'View full size' })).toBeDefined()
      expect(screen.getByRole('dialog').className).not.toContain('lightbox__dialog--full-bleed')
    })

    it('Escape leaves full bleed first and closes only on the second press', () => {
      const onClose = vi.fn()
      renderBox({ onClose })

      fireEvent.click(photo())
      fireEvent.keyDown(document, { key: 'Escape' })

      // Innermost first — the detail face is back and nothing closed.
      expect(onClose).not.toHaveBeenCalled()
      expect(screen.getByRole('button', { name: 'View full size' })).toBeDefined()

      fireEvent.keyDown(document, { key: 'Escape' })
      expect(onClose).toHaveBeenCalled()
    })

    it('arrows navigate from inside full bleed and stay in it', () => {
      const onNavigate = vi.fn()
      const rows = [row({ id: 'a' }), row({ id: 'b' })]
      renderBox({ row: rows[0], rows, onNavigate })

      fireEvent.click(photo())
      fireEvent.keyDown(document, { key: 'ArrowRight' })

      expect(onNavigate).toHaveBeenCalledWith('b')
      expect(screen.getByRole('dialog').className).toContain('lightbox__dialog--full-bleed')
    })

    it('leaves full bleed when the cairn arrowed to has no image', () => {
      const withImage = row({ id: 'a' })
      const iconOnly = row({ id: 'b', icon: 'campsite', thumbnailDriveFileId: null, originalDriveFileId: null })
      const rows = [withImage, iconOnly]
      const { rerender } = renderBox({ row: withImage, rows })

      fireEvent.click(photo())
      expect(screen.getByRole('dialog').className).toContain('lightbox__dialog--full-bleed')

      // The list mixes photo cairns and icon-only ones, so this is
      // reachable rather than theoretical.
      rerender(
        <Lightbox
          row={iconOnly}
          rows={rows}
          description=""
          accessToken="token"
          onClose={vi.fn()}
          onNavigate={vi.fn()}
          returnFocusRef={createRef<HTMLElement>()}
        />,
      )

      expect(screen.getByRole('dialog').className).not.toContain('lightbox__dialog--full-bleed')
    })

    it('leaves full bleed when a photo is dropped onto the cairn', () => {
      const only = row()
      const { rerender } = renderBox()

      fireEvent.click(photo())
      expect(screen.getByRole('dialog').className).toContain('lightbox__dialog--full-bleed')

      rerender(
        <Lightbox
          row={only}
          rows={[only]}
          description=""
          accessToken="token"
          onClose={vi.fn()}
          onNavigate={vi.fn()}
          returnFocusRef={createRef<HTMLElement>()}
          attaching
        />,
      )

      // The upload's progress belongs on the detail face, where #157 put it.
      expect(screen.getByRole('dialog').className).not.toContain('lightbox__dialog--full-bleed')
    })

    it('gives an icon-only cairn no image slot and no way into the mode', () => {
      const iconOnly = row({ icon: 'campsite', thumbnailDriveFileId: null, originalDriveFileId: null })
      const { container } = renderBox({ row: iconOnly, rows: [iconOnly] })

      expect(screen.queryByRole('button', { name: /full size$/ })).toBeNull()
      expect(container.querySelector('.lightbox__media')).toBeNull()
      // The detail face is otherwise unaffected.
      expect(screen.getByText('a.jpg')).toBeDefined()
    })

    /* The detail column is `display: none` in full bleed but its controls
       stay in the DOM, so the trap has to exclude them by hand — left in,
       they take the `last` slot and focus walks out of an `aria-modal`
       dialog in both directions. */
    describe('the focus trap', () => {
      it('wraps within the controls still on screen in full bleed', () => {
        renderBox({ onRemoveFromTrip: vi.fn() });
        fireEvent.click(photo());

        const dialog = screen.getByRole('dialog');
        const close = screen.getByRole('button', { name: 'Close photo' });
        const removeFromTrip = screen.getByRole('button', { name: 'Remove from trip' });

        // Forward off the last on-screen control lands back on the first.
        photo().focus();
        fireEvent.keyDown(dialog, { key: 'Tab' });
        expect(document.activeElement).toBe(close);

        // Backwards off the first lands on the photo, never on the hidden
        // `Remove from trip` that closes the DOM order.
        close.focus();
        fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
        expect(document.activeElement).toBe(photo());
        expect(document.activeElement).not.toBe(removeFromTrip);
      });

      it('still includes the detail column on the detail face', () => {
        renderBox({ onRemoveFromTrip: vi.fn() });

        const dialog = screen.getByRole('dialog');
        const close = screen.getByRole('button', { name: 'Close photo' });
        const removeFromTrip = screen.getByRole('button', { name: 'Remove from trip' });

        close.focus();
        fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
        expect(document.activeElement).toBe(removeFromTrip);
      });
    });

    it('keeps the detail face reachable while a photo uploads onto a cairn with none', () => {
      const blank = row({ thumbnailDriveFileId: null, originalDriveFileId: null })
      renderBox({ row: blank, rows: [blank], attaching: true })

      // #157's slot still needs somewhere to show progress. #241 — the
      // dialog is portaled to `document.body`, not RTL's `container`.
      expect(document.querySelector('.lightbox__media')).not.toBeNull()
      expect(screen.getByText('uploading…')).toBeDefined()
      expect(photo()).toHaveProperty('disabled', true)
    })
  })
})

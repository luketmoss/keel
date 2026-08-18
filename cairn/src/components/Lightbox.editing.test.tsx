import { createRef } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Lightbox } from './Lightbox'
import type { CairnListRow } from '../photo/cairnListGroups'

/* #196 — click-to-edit on a trip-owned cairn's name and description. Its
   own file rather than an addition to `Lightbox.test.tsx`, which is #55's
   viewer suite: these tests are all about a surface that only exists
   because #169 made the lightbox a detail face, and they need an
   `onSaveText` on every render where that suite deliberately passes none. */
const { acquire } = vi.hoisted(() => ({ acquire: vi.fn() }))
vi.mock('../photo/imageCache', () => ({ photoImageCache: { acquire } }))

function row(overrides: Partial<CairnListRow> = {}): CairnListRow {
  return {
    id: 'p1',
    name: 'Notch Mountain',
    icon: null,
    thumbnailDriveFileId: 'thumb-1',
    originalDriveFileId: 'orig-1',
    date: '2023-06-16',
    source: 'exif',
    ...overrides,
  }
}

function renderLightbox(
  options: {
    description?: string
    onSaveText?: (patch: { name?: string; description?: string }) => Promise<boolean>
    onClose?: () => void
    onNavigate?: (id: string) => void
    rows?: CairnListRow[]
  } = {},
) {
  const onSaveText = options.onSaveText ?? vi.fn().mockResolvedValue(true)
  const onClose = options.onClose ?? vi.fn()
  const onNavigate = options.onNavigate ?? vi.fn()
  const view = render(
    <Lightbox
      row={row()}
      rows={options.rows ?? [row(), row({ id: 'p2', name: 'Camp two' })]}
      description={options.description ?? ''}
      accessToken="token"
      onClose={onClose}
      onNavigate={onNavigate}
      onSaveText={onSaveText}
      returnFocusRef={createRef<HTMLElement>()}
    />,
  )
  return { ...view, onSaveText, onClose, onNavigate }
}

function nameField(): HTMLElement {
  return screen.getByRole('heading', { level: 2 })
}

function nameInput(): HTMLInputElement {
  return screen.getByRole('textbox', { name: 'Cairn name' }) as HTMLInputElement
}

function descriptionField(): HTMLElement {
  return document.querySelector('.lightbox__description') as HTMLElement
}

function descriptionInput(): HTMLTextAreaElement {
  return screen.getByRole('textbox', { name: 'Description' }) as HTMLTextAreaElement
}

beforeEach(() => {
  acquire.mockReset().mockResolvedValue({ url: 'blob:fake', release: vi.fn() })
})

describe('Lightbox — #196 editing a cairn', () => {
  describe('the name', () => {
    it('becomes a focused input holding the current name, with the text selected', () => {
      renderLightbox()

      fireEvent.click(nameField())

      const input = nameInput()
      expect(input.value).toBe('Notch Mountain')
      expect(document.activeElement).toBe(input)
      // Selected, so the first keystroke replaces rather than appends.
      expect(input.selectionStart).toBe(0)
      expect(input.selectionEnd).toBe('Notch Mountain'.length)
    })

    it('commits on Enter', async () => {
      const { onSaveText } = renderLightbox()

      fireEvent.click(nameField())
      fireEvent.change(nameInput(), { target: { value: 'Notch Mountain hazard' } })
      fireEvent.keyDown(nameInput(), { key: 'Enter' })

      await waitFor(() => expect(onSaveText).toHaveBeenCalledWith({ name: 'Notch Mountain hazard' }))
    })

    it('commits on blur', async () => {
      const { onSaveText } = renderLightbox()

      fireEvent.click(nameField())
      fireEvent.change(nameInput(), { target: { value: 'Renamed by blur' } })
      fireEvent.blur(nameInput())

      await waitFor(() => expect(onSaveText).toHaveBeenCalledWith({ name: 'Renamed by blur' }))
    })

    it('reverts on Escape and writes nothing', () => {
      const { onSaveText, onClose } = renderLightbox()

      fireEvent.click(nameField())
      fireEvent.change(nameInput(), { target: { value: 'Discarded' } })
      fireEvent.keyDown(nameInput(), { key: 'Escape' })

      expect(onSaveText).not.toHaveBeenCalled()
      expect(nameField().textContent).toBe('Notch Mountain')
      // One Escape, one effect, innermost first — the dialog stays open.
      expect(onClose).not.toHaveBeenCalled()
    })

    it('treats an empty or whitespace-only commit as an aborted edit', async () => {
      const { onSaveText } = renderLightbox()

      fireEvent.click(nameField())
      fireEvent.change(nameInput(), { target: { value: '   ' } })
      fireEvent.keyDown(nameInput(), { key: 'Enter' })

      await waitFor(() => expect(nameField().textContent).toBe('Notch Mountain'))
      expect(onSaveText).not.toHaveBeenCalled()
    })

    it('flashes the saved treatment on that field only', async () => {
      renderLightbox({ description: 'A good spot.' })

      fireEvent.click(nameField())
      fireEvent.change(nameInput(), { target: { value: 'Saved name' } })
      fireEvent.keyDown(nameInput(), { key: 'Enter' })

      await waitFor(() => expect(nameField().className).toContain('lightbox__field--saved'))
      expect(descriptionField().className).not.toContain('lightbox__field--saved')
    })

    it('shows a failure line beneath the field on a failed write, keeping the face open', async () => {
      const onSaveText = vi.fn().mockResolvedValue(false)
      renderLightbox({ onSaveText })

      fireEvent.click(nameField())
      fireEvent.change(nameInput(), { target: { value: 'Doomed' } })
      fireEvent.keyDown(nameInput(), { key: 'Enter' })

      expect(await screen.findByText("Couldn't save — name reverted.")).toBeDefined()
      expect(screen.getByRole('dialog')).toBeDefined()
    })
  })

  describe('the description', () => {
    it('shows a clickable placeholder when empty, so the field is discoverable', () => {
      renderLightbox({ description: '' })

      expect(descriptionField().textContent).toBe('Add a description')

      fireEvent.click(descriptionField())
      expect(descriptionInput()).toBeDefined()
    })

    it('opens a multi-line input holding the current description', () => {
      renderLightbox({ description: 'Loose slab, crossed high on the left.' })

      fireEvent.click(descriptionField())

      const input = descriptionInput()
      expect(input.tagName).toBe('TEXTAREA')
      expect(input.value).toBe('Loose slab, crossed high on the left.')
      expect(document.activeElement).toBe(input)
    })

    it('saves an empty description — clearing one is a real value, unlike a name', async () => {
      const { onSaveText } = renderLightbox({ description: 'To be cleared.' })

      fireEvent.click(descriptionField())
      fireEvent.change(descriptionInput(), { target: { value: '' } })
      fireEvent.keyDown(descriptionInput(), { key: 'Enter' })

      // That the placeholder returns once the record holds `''` is the
      // store's half — `useCairnImport.test.ts` covers the write, and the
      // placeholder test above covers the render. This surface only owns
      // sending the empty value at all, which is the half a name would
      // have swallowed.
      await waitFor(() => expect(onSaveText).toHaveBeenCalledWith({ description: '' }))
    })

    it('commits on Enter rather than inserting a newline', async () => {
      const { onSaveText } = renderLightbox()

      fireEvent.click(descriptionField())
      fireEvent.change(descriptionInput(), { target: { value: 'One line' } })
      fireEvent.keyDown(descriptionInput(), { key: 'Enter' })

      await waitFor(() => expect(onSaveText).toHaveBeenCalledWith({ description: 'One line' }))
    })

    it('leaves Shift+Enter to the textarea, so a multi-line description is reachable', () => {
      const { onSaveText } = renderLightbox()

      fireEvent.click(descriptionField())
      fireEvent.change(descriptionInput(), { target: { value: 'First line' } })
      fireEvent.keyDown(descriptionInput(), { key: 'Enter', shiftKey: true })

      expect(onSaveText).not.toHaveBeenCalled()
      expect(descriptionInput()).toBeDefined()
    })

    it('reverts on Escape without writing or closing the dialog', () => {
      const { onSaveText, onClose } = renderLightbox({ description: 'Original.' })

      fireEvent.click(descriptionField())
      fireEvent.change(descriptionInput(), { target: { value: 'Discarded.' } })
      fireEvent.keyDown(descriptionInput(), { key: 'Escape' })

      expect(onSaveText).not.toHaveBeenCalled()
      expect(descriptionField().textContent).toBe('Original.')
      expect(onClose).not.toHaveBeenCalled()
    })

    it('shows its own failure line on a failed write', async () => {
      const onSaveText = vi.fn().mockResolvedValue(false)
      renderLightbox({ onSaveText })

      fireEvent.click(descriptionField())
      fireEvent.change(descriptionInput(), { target: { value: 'Doomed.' } })
      fireEvent.keyDown(descriptionInput(), { key: 'Enter' })

      expect(await screen.findByText("Couldn't save — description reverted.")).toBeDefined()
    })
  })

  it('never leaves two inputs open at once — a second edit closes the first', async () => {
    const { onSaveText } = renderLightbox({ description: 'A good spot.' })

    fireEvent.click(nameField())
    expect(nameInput()).toBeDefined()

    // The click lands on the description while the name input is open; the
    // browser blurs the name input on the way, which is what commits it.
    fireEvent.blur(nameInput())
    fireEvent.click(descriptionField())

    await waitFor(() => expect(descriptionInput()).toBeDefined())
    expect(screen.queryByRole('textbox', { name: 'Cairn name' })).toBeNull()
    // Committed, not discarded — the value was unchanged, so nothing more
    // is claimed here than that the first edit was closed by the second.
    expect(onSaveText).toHaveBeenCalledWith({ name: 'Notch Mountain' })
  })

  it('takes both fields to Disabled while disconnected, and clicking does not start an edit', () => {
    render(
      <Lightbox
        row={row()}
        rows={[row()]}
        description="A good spot."
        accessToken={null}
        onClose={vi.fn()}
        onNavigate={vi.fn()}
        returnFocusRef={createRef<HTMLElement>()}
      />,
    )

    fireEvent.click(nameField())
    fireEvent.click(descriptionField())

    expect(screen.queryByRole('textbox', { name: 'Cairn name' })).toBeNull()
    expect(screen.queryByRole('textbox', { name: 'Description' })).toBeNull()
    // No hover affordance either — the field does not advertise a click it
    // will not honour.
    expect(nameField().className).not.toContain('lightbox__name--editable')
    expect(descriptionField().className).not.toContain('lightbox__description--editable')
  })

  describe('the arrow keys, while a field is being edited', () => {
    it('leaves the caret alone rather than navigating to another cairn', () => {
      const { onNavigate } = renderLightbox({ description: 'Some text.' })

      fireEvent.click(descriptionField())
      fireEvent.keyDown(descriptionInput(), { key: 'ArrowRight' })
      fireEvent.keyDown(descriptionInput(), { key: 'ArrowLeft' })

      expect(onNavigate).not.toHaveBeenCalled()
    })

    it('still navigates when no field is being edited', () => {
      const { onNavigate } = renderLightbox()

      fireEvent.keyDown(document, { key: 'ArrowRight' })

      expect(onNavigate).toHaveBeenCalledWith('p2')
    })
  })

  it('keeps the inputs inside the focus trap', () => {
    // #241 — the dialog is portaled to `document.body`, so it's a sibling of
    // RTL's own `container` rather than inside it; query the document.
    renderLightbox()

    fireEvent.click(descriptionField())

    const trapped = document.querySelectorAll('.lightbox__dialog button:not(:disabled), .lightbox__dialog input, .lightbox__dialog textarea')
    expect(Array.from(trapped)).toContain(descriptionInput())
  })

  /* #240 — a scrim click blurs whatever is focused before the click event
     itself reaches `.lightbox`, exactly as clicking `×` already does per
     `240-click-outside-lightbox.md`'s "Blur caused by closing" parity —
     that's a fact about browsers moving focus on `mousedown`, so the test
     drives it the same way: a `blur` on the field, then the scrim `click`. */
  it('commits an in-progress edit before closing, on a scrim click — the same order a blur-then-click already commits in', async () => {
    const { onSaveText, onClose } = renderLightbox()

    fireEvent.click(nameField())
    fireEvent.change(nameInput(), { target: { value: 'Renamed via scrim' } })
    fireEvent.blur(nameInput())
    fireEvent.click(screen.getByTestId('lightbox'))

    await waitFor(() => expect(onSaveText).toHaveBeenCalledWith({ name: 'Renamed via scrim' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

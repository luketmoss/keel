import { fireEvent, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CairnCreatePanel, type CairnDraftFields } from './CairnCreatePanel'
import { HEIC_ERROR, UNSUPPORTED_TYPE_ERROR } from '../photo/thumbnail'

function fields(overrides: Partial<CairnDraftFields> = {}): CairnDraftFields {
  return { name: '', icon: null, description: '', date: '2026-08-15', photo: null, ...overrides }
}

function renderPanel(props: Partial<Parameters<typeof CairnCreatePanel>[0]> = {}) {
  const onChange = vi.fn()
  const onCreate = vi.fn()
  const onCancel = vi.fn()
  const result = render(
    <CairnCreatePanel
      fields={fields()}
      onChange={onChange}
      tripId={null}
      onCreate={onCreate}
      onCancel={onCancel}
      {...props}
    />,
  )
  return { ...result, onChange, onCreate, onCancel }
}

describe('CairnCreatePanel — the form', () => {
  it('offers name, the eight icons plus none, description and a date', () => {
    const { getByLabelText, getAllByRole } = renderPanel()

    expect(getByLabelText('Name')).toBeDefined()
    expect(getByLabelText('Description')).toBeDefined()
    expect((getByLabelText('Date') as HTMLInputElement).value).toBe('2026-08-15')

    const grid = getAllByRole('group', { name: 'What is this place' })[0]
    // Eight icons and `none`, and not a cell more — the set is fixed.
    expect(grid.querySelectorAll('button')).toHaveLength(9)
  })

  it('focuses the name field on open', () => {
    const { getByLabelText } = renderPanel()

    expect(document.activeElement).toBe(getByLabelText('Name'))
  })

  it('defaults the icon to none rather than pre-selecting one', () => {
    const { getByRole } = renderPanel()

    expect(getByRole('button', { name: 'none' }).getAttribute('aria-pressed')).toBe('true')
    expect(getByRole('button', { name: 'campsite' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('reports a chosen icon up rather than holding it itself', () => {
    const { getByRole, onChange } = renderPanel()

    fireEvent.click(getByRole('button', { name: 'campsite' }))

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ icon: 'campsite' }))
  })
})

describe('CairnCreatePanel — ownership is stated before you commit', () => {
  it('says the cairn will be loose when nothing was open', () => {
    const { getByText } = renderPanel({ tripId: null })

    expect(getByText('(nothing was open — this will be loose)')).toBeDefined()
    expect(getByText('null')).toBeDefined()
  })

  it('names the trip when one was open', () => {
    const { getByText } = renderPanel({ tripId: 'trip-7' })

    expect(getByText('(a trip was open when you clicked)')).toBeDefined()
    expect(getByText('trip-7')).toBeDefined()
  })

  it('always states the position source as placed', () => {
    const { getByText } = renderPanel()

    expect(getByText('placed')).toBeDefined()
  })
})

describe('CairnCreatePanel — the exits', () => {
  it('commits on Create', () => {
    const { getByRole, onCreate } = renderPanel()

    fireEvent.click(getByRole('button', { name: 'Create' }))

    expect(onCreate).toHaveBeenCalled()
  })

  it('cancels on Cancel', () => {
    const { getByRole, onCancel } = renderPanel()

    fireEvent.click(getByRole('button', { name: 'Cancel' }))

    expect(onCancel).toHaveBeenCalled()
  })

  it('treats Escape as Cancel', () => {
    const { onCancel } = renderPanel()

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onCancel).toHaveBeenCalled()
  })
})

describe('CairnCreatePanel — disconnected (#73)', () => {
  it('disables Create with one sentence, and still fills in', () => {
    const { getByRole, getByLabelText, getByText, onChange } = renderPanel({ disabled: true })

    expect((getByRole('button', { name: 'Create' }) as HTMLButtonElement).disabled).toBe(true)
    expect(getByText('Sign in to keep cairns.')).toBeDefined()

    fireEvent.change(getByLabelText('Name'), { target: { value: 'Ellery Creek camp' } })
    fireEvent.click(getByRole('button', { name: 'campsite' }))

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ name: 'Ellery Creek camp' }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ icon: 'campsite' }))
  })

  it('still cancels', () => {
    const { getByRole, onCancel } = renderPanel({ disabled: true })

    fireEvent.click(getByRole('button', { name: 'Cancel' }))

    expect(onCancel).toHaveBeenCalled()
  })
})

/* #347 — the photograph is a draft field like the typed ones. Nothing here
   uploads: everything below stops at what `onChange` is handed. */
describe('CairnCreatePanel — the photo (#347)', () => {
  beforeEach(() => {
    // jsdom implements neither, and the preview calls both.
    URL.createObjectURL = vi.fn(() => 'blob:preview')
    URL.revokeObjectURL = vi.fn()
  })

  function photoInput() {
    return document.querySelector('.add-photo__input') as HTMLInputElement
  }

  function choose(files: File[]) {
    const element = photoInput()
    Object.defineProperty(element, 'files', { value: files, configurable: true })
    fireEvent.change(element)
  }

  const jpeg = (name = 'IMG_4417.JPG') => new File(['x'], name, { type: 'image/jpeg' })

  it('offers a Photo field reading "Add a photo" before one is chosen', () => {
    const { getByText, getByRole } = renderPanel()

    expect(getByText('Photo')).toBeDefined()
    expect(getByRole('button', { name: 'Add a photo' })).toBeDefined()
  })

  it('hands the chosen file to the draft rather than uploading it', () => {
    const { onChange } = renderPanel()
    const file = jpeg()

    choose([file])

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ photo: file }))
  })

  it('shows the file it will attach, by name and by preview', () => {
    const file = jpeg('IMG_4417.JPG')
    const { container, getByText, getByRole } = renderPanel({ fields: fields({ photo: file }) })

    expect(container.querySelector('.cairn-create__photo')?.getAttribute('src')).toBe('blob:preview')
    expect(getByText('IMG_4417.JPG')).toBeDefined()
    // The label follows whether a file is chosen, not whether a record has
    // an image — there is no record yet.
    expect(getByRole('button', { name: 'Replace the photo' })).toBeDefined()
  })

  it('Remove clears the choice and uploads nothing', () => {
    const { getByRole, onChange } = renderPanel({ fields: fields({ photo: jpeg() }) })

    fireEvent.click(getByRole('button', { name: 'Remove' }))

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ photo: null }))
  })

  it('#344 — refuses an unsupported type when it is chosen, before anything is saved', () => {
    const { getByText, onChange } = renderPanel()

    choose([new File(['x'], 'notes.txt', { type: 'text/plain' })])

    expect(getByText(UNSUPPORTED_TYPE_ERROR)).toBeDefined()
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ photo: null }))
  })

  it('#344 — refuses an HEIC the same way, with the setting to change', () => {
    const { getByText } = renderPanel()

    choose([new File(['x'], 'IMG_0001.HEIC', { type: 'image/heic' })])

    expect(getByText(HEIC_ERROR)).toBeDefined()
  })

  it('#156 — the form still fills in while disconnected: only Create is refused', () => {
    const { getByRole, onChange } = renderPanel({ disabled: true })

    // Unlike the detail faces' copy of this control (#339), which *is* the
    // write. Here it only fills in a draft field.
    expect((getByRole('button', { name: 'Add a photo' }) as HTMLButtonElement).disabled).toBe(false)
    choose([jpeg()])
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ photo: expect.any(File) }))
    expect((getByRole('button', { name: 'Create' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('cannot be changed while the save is in flight', () => {
    const { getByRole } = renderPanel({ fields: fields({ photo: jpeg() }), busy: true })

    expect((getByRole('button', { name: 'Replace the photo' }) as HTMLButtonElement).disabled).toBe(true)
    expect((getByRole('button', { name: 'Remove' }) as HTMLButtonElement).disabled).toBe(true)
  })
})

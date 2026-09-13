import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AddPhotoButton, PHOTO_ACCEPT } from './AddPhotoButton'

function input() {
  return document.querySelector('.add-photo__input') as HTMLInputElement
}

function choose(files: File[]) {
  const element = input()
  Object.defineProperty(element, 'files', { value: files, configurable: true })
  fireEvent.change(element)
}

function jpeg(name = 'a.jpg') {
  return new File(['x'], name, { type: 'image/jpeg' })
}

describe('AddPhotoButton (#339)', () => {
  it('says what it will do, and the label follows whether there is a photo', () => {
    const { rerender } = render(<AddPhotoButton hasImage={false} onChoose={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Add a photo' })).toBeDefined()

    rerender(<AddPhotoButton hasImage onChoose={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Replace the photo' })).toBeDefined()
  })

  it('offers one image, not a selection of them', () => {
    render(<AddPhotoButton hasImage={false} onChoose={vi.fn()} />)
    // `cairns.md` allows one image per cairn — an input that accepts five
    // to refuse four is a worse refusal than not offering it.
    expect(input().hasAttribute('multiple')).toBe(false)
    expect(input().getAttribute('accept')).toBe(PHOTO_ACCEPT)
    // Never `capture`: it forces the camera and removes the library.
    expect(input().hasAttribute('capture')).toBe(false)
  })

  it('hands the chosen file up', () => {
    const onChoose = vi.fn()
    render(<AddPhotoButton hasImage={false} onChoose={onChoose} />)
    choose([jpeg('camp.jpg')])
    expect(onChoose).toHaveBeenCalledTimes(1)
    expect(onChoose.mock.calls[0][0].name).toBe('camp.jpg')
  })

  it('clicking the button reaches the input', () => {
    render(<AddPhotoButton hasImage={false} onChoose={vi.fn()} />)
    const clicked = vi.fn()
    input().addEventListener('click', clicked)
    fireEvent.click(screen.getByRole('button', { name: 'Add a photo' }))
    expect(clicked).toHaveBeenCalledTimes(1)
  })

  it('does nothing when the chooser is dismissed with no selection', () => {
    const onChoose = vi.fn()
    render(<AddPhotoButton hasImage={false} onChoose={onChoose} />)
    choose([])
    expect(onChoose).not.toHaveBeenCalled()
  })

  it('clears the input so the same file chosen twice attaches twice', () => {
    const onChoose = vi.fn()
    render(<AddPhotoButton hasImage={false} onChoose={onChoose} />)
    const element = input()

    /* A file input's `value` cannot be assigned a real path from script,
       so asserting `value === ''` is true whether or not the handler
       clears it — #338 shipped that mistake and caught it by mutation.
       Spying on the setter asserts the assignment itself, which is what a
       browser needs to fire a second `change`. */
    const cleared: string[] = []
    Object.defineProperty(element, 'value', {
      configurable: true,
      get: () => '',
      set: (next: string) => cleared.push(next),
    })

    choose([jpeg('same.jpg')])
    choose([jpeg('same.jpg')])

    expect(cleared).toEqual(['', ''])
    expect(onChoose).toHaveBeenCalledTimes(2)
  })

  it('is disabled while an attach is in flight, so a second upload cannot start', () => {
    const onChoose = vi.fn()
    render(<AddPhotoButton hasImage={false} attaching onChoose={onChoose} />)
    const button = screen.getByRole('button', { name: 'Add a photo' })
    expect(button.hasAttribute('disabled')).toBe(true)
    fireEvent.click(button)
    expect(onChoose).not.toHaveBeenCalled()
  })

  it('is disabled when there is nothing to write through', () => {
    render(<AddPhotoButton hasImage={false} disabled onChoose={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Add a photo' }).hasAttribute('disabled')).toBe(true)
  })
})

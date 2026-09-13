import { useRef, type ChangeEvent } from 'react'
import './AddPhotoButton.css'

/** #339: one image per cairn (`cairns.md`), so the input is deliberately
    not `multiple` — an input that accepts five files to refuse four is a
    worse refusal than not offering it. Concrete extensions rather than
    `image/*` for the reason #338 records: it is what gives iOS its best
    chance of handing back a JPEG from the library rather than an HEIC. */
export const PHOTO_ACCEPT = '.jpg,.jpeg,.png,.webp'

export const ADD_PHOTO_LABEL = 'Add a photo'
export const REPLACE_PHOTO_LABEL = 'Replace the photo'

interface AddPhotoButtonProps {
  /** Drives the label. #157's two cases, in their short form — the
      overlay's longer `Add a photo to <name>` stays the overlay's, since a
      button inside a cairn's own face has no target to disambiguate. */
  hasImage: boolean
  /** #157's upload is in flight. The face's image slot carries the
      progress, so this only goes Disabled — a second spinner here would be
      two answers to one question. */
  attaching?: boolean
  /** #73: no usable token. An attach is a Drive upload and nothing else,
      so unlike #338's import control there is no half of this that works
      while disconnected. Disabled, like every other writing control on
      these two faces. */
  disabled?: boolean
  className?: string
  onChoose: (file: File) => void
}

/** The control #157 never had. Both detail faces need it and both would
    otherwise grow their own copy of the same hidden input, the same
    `value` reset and the same two labels. */
export function AddPhotoButton({
  hasImage,
  attaching,
  disabled,
  className,
  onChoose,
}: AddPhotoButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const label = hasImage ? REPLACE_PHOTO_LABEL : ADD_PHOTO_LABEL
  const blocked = disabled === true || attaching === true

  /* Clearing `value` is what makes choosing the same file twice in a row
     attach it twice — without it the second selection fires no `change`
     event at all. */
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const [file] = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (file) onChoose(file)
  }

  return (
    <>
      <button
        type="button"
        className={className ? `add-photo ${className}` : 'add-photo'}
        disabled={blocked}
        onClick={() => inputRef.current?.click()}
      >
        {label}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={PHOTO_ACCEPT}
        className="add-photo__input"
        onChange={handleChange}
      />
    </>
  )
}

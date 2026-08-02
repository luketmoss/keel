import { describe, expect, it, vi } from 'vitest'
import {
  HEIC_ERROR,
  THUMBNAIL_MAX_EDGE,
  UNREADABLE_IMAGE_ERROR,
  UNSUPPORTED_TYPE_ERROR,
  computeScaledDimensions,
  generateThumbnail,
  orientationMatrix,
  orientationSwapsDimensions,
  orientedDisplayDimensions,
  validateImageFile,
  type ThumbnailCanvas,
  type ThumbnailCanvasContext,
  type ThumbnailDependencies,
} from './thumbnail'

describe('validateImageFile', () => {
  it('accepts JPEG, PNG, and WebP by extension', () => {
    expect(validateImageFile('IMG_0001.jpg')).toBeUndefined()
    expect(validateImageFile('IMG_0001.JPEG')).toBeUndefined()
    expect(validateImageFile('shot.png')).toBeUndefined()
    expect(validateImageFile('shot.webp')).toBeUndefined()
  })

  it('rejects HEIC/HEIF by name, naming the iOS Camera setting, without attempting to decode', () => {
    expect(validateImageFile('IMG_0001.heic')).toBe(HEIC_ERROR)
    expect(validateImageFile('IMG_0001.HEIC')).toBe(HEIC_ERROR)
    expect(validateImageFile('IMG_0001.heif')).toBe(HEIC_ERROR)
    expect(HEIC_ERROR).toContain('Settings → Camera → Formats → Most Compatible')
  })

  it('rejects any other extension, naming the accepted types', () => {
    expect(validateImageFile('notes.txt')).toBe(UNSUPPORTED_TYPE_ERROR)
    expect(validateImageFile('clip.mov')).toBe(UNSUPPORTED_TYPE_ERROR)
    expect(UNSUPPORTED_TYPE_ERROR).toBe('only JPEG, PNG, and WebP photos can be imported')
  })
})

describe('computeScaledDimensions', () => {
  it('scales a landscape image down to a 512px longest edge, preserving aspect', () => {
    const result = computeScaledDimensions(4000, 3000, THUMBNAIL_MAX_EDGE)
    expect(result.width).toBe(512)
    expect(result.height).toBe(384)
  })

  it('scales a portrait image down by its longest (vertical) edge', () => {
    const result = computeScaledDimensions(3000, 4000, THUMBNAIL_MAX_EDGE)
    expect(result.height).toBe(512)
    expect(result.width).toBe(384)
  })

  it('never upscales an image already under the max edge', () => {
    const result = computeScaledDimensions(200, 100, THUMBNAIL_MAX_EDGE)
    expect(result).toEqual({ width: 200, height: 100 })
  })

  it('produces the exact max edge for a square image', () => {
    const result = computeScaledDimensions(1000, 1000, THUMBNAIL_MAX_EDGE)
    expect(result).toEqual({ width: 512, height: 512 })
  })
})

describe('orientationSwapsDimensions', () => {
  it('is true only for orientations 5 through 8', () => {
    for (let o = 1; o <= 8; o++) {
      expect(orientationSwapsDimensions(o)).toBe(o >= 5 && o <= 8)
    }
  })

  it('is false when orientation is absent', () => {
    expect(orientationSwapsDimensions(undefined)).toBe(false)
  })
})

describe('orientedDisplayDimensions', () => {
  it('leaves a portrait photo portrait for orientation 1 (or no tag)', () => {
    expect(orientedDisplayDimensions(1, 3024, 4032)).toEqual({ width: 3024, height: 4032 })
    expect(orientedDisplayDimensions(undefined, 3024, 4032)).toEqual({ width: 3024, height: 4032 })
  })

  it('swaps width and height for orientation 6 — the classic "camera rotated 90°" case', () => {
    // A camera held in portrait writes landscape pixels (wider than tall)
    // tagged orientation 6; the *display* dimensions are the swap, i.e.
    // what actually renders upright.
    expect(orientedDisplayDimensions(6, 4032, 3024)).toEqual({ width: 3024, height: 4032 })
  })

  it('swaps width and height for orientations 5, 7, and 8 too', () => {
    for (const o of [5, 7, 8]) {
      expect(orientedDisplayDimensions(o, 4032, 3024)).toEqual({ width: 3024, height: 4032 })
    }
  })

  it('does not swap for orientations 2, 3, and 4 (mirror/180° only, no rotation)', () => {
    for (const o of [2, 3, 4]) {
      expect(orientedDisplayDimensions(o, 4032, 3024)).toEqual({ width: 4032, height: 3024 })
    }
  })
})

describe('orientationMatrix', () => {
  it('is the identity for orientation 1, an absent tag, or an out-of-range value', () => {
    const identity: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0]
    expect(orientationMatrix(1, 100, 200)).toEqual(identity)
    expect(orientationMatrix(undefined, 100, 200)).toEqual(identity)
    expect(orientationMatrix(0, 100, 200)).toEqual(identity)
    expect(orientationMatrix(99, 100, 200)).toEqual(identity)
  })

  it('produces the standard EXIF-orientation transform for each of 2-8', () => {
    const w = 100
    const h = 200
    expect(orientationMatrix(2, w, h)).toEqual([-1, 0, 0, 1, w, 0])
    expect(orientationMatrix(3, w, h)).toEqual([-1, 0, 0, -1, w, h])
    expect(orientationMatrix(4, w, h)).toEqual([1, 0, 0, -1, 0, h])
    expect(orientationMatrix(5, w, h)).toEqual([0, 1, 1, 0, 0, 0])
    expect(orientationMatrix(6, w, h)).toEqual([0, 1, -1, 0, h, 0])
    expect(orientationMatrix(7, w, h)).toEqual([0, -1, -1, 0, h, w])
    expect(orientationMatrix(8, w, h)).toEqual([0, -1, 1, 0, 0, w])
  })

  it('maps a point through orientation 6 (90° CW) landing where a rotated photo puts it', () => {
    // A 100x200-drawn source's top-left corner (0,0) should land at the
    // canvas's top-right after a 90°-clockwise rotation into a 200x100
    // canvas: apply [a,b,c,d,e,f] as (x' = a*x + c*y + e, y' = b*x + d*y + f).
    const [a, b, c, d, e, f] = orientationMatrix(6, 100, 200)
    const x = 0
    const y = 0
    expect(a * x + c * y + e).toBe(200) // top-right corner of the 200x100 canvas
    expect(b * x + d * y + f).toBe(0)
  })
})

describe('generateThumbnail — wiring (decode -> scale -> orient -> encode)', () => {
  function fakeCanvasFactory(): {
    dependencies: ThumbnailDependencies
    calls: { transform?: number[]; drawImage?: number[]; canvasSize?: { width: number; height: number } }
  } {
    const calls: {
      transform?: number[]
      drawImage?: number[]
      canvasSize?: { width: number; height: number }
    } = {}

    const ctx: ThumbnailCanvasContext = {
      transform: (a, b, c, d, e, f) => {
        calls.transform = [a, b, c, d, e, f]
      },
      drawImage: (_image, dx, dy, dw, dh) => {
        calls.drawImage = [dx, dy, dw, dh]
      },
    }

    const canvas: ThumbnailCanvas = {
      width: 0,
      height: 0,
      getContext: () => ctx,
      toBlob: (callback, type) => callback(new Blob(['fake'], { type })),
    }

    const dependencies: ThumbnailDependencies = {
      decode: vi
        .fn()
        .mockResolvedValue({ naturalWidth: 4032, naturalHeight: 3024, source: {} as CanvasImageSource }),
      createCanvas: (width, height) => {
        calls.canvasSize = { width, height }
        canvas.width = width
        canvas.height = height
        return canvas
      },
    }

    return { dependencies, calls }
  }

  it('scales, orients, and encodes a landscape-shot, portrait-tagged (orientation 6) photo', async () => {
    const { dependencies, calls } = fakeCanvasFactory()
    const file = new File(['x'], 'IMG_1.jpg', { type: 'image/jpeg' })

    const result = await generateThumbnail(file, 6, dependencies)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    // Natural pixels are 4032x3024 (landscape); orientation 6 means the
    // upright *display* is the swap — portrait, longest edge (height)
    // capped at 512.
    expect(result.width).toBe(384)
    expect(result.height).toBe(512)
    expect(calls.canvasSize).toEqual({ width: 384, height: 512 })
    // Drawn (pre-rotation) size matches the source's own aspect, not the
    // display's.
    expect(calls.drawImage).toEqual([0, 0, 512, 384])
    expect(calls.transform).toEqual(orientationMatrix(6, 512, 384))
    expect(result.blob.type).toBe('image/jpeg')
  })

  it('produces a landscape thumbnail unchanged for orientation 1', async () => {
    const { dependencies, calls } = fakeCanvasFactory()
    const file = new File(['x'], 'IMG_2.jpg', { type: 'image/jpeg' })

    const result = await generateThumbnail(file, 1, dependencies)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.width).toBe(512)
    expect(result.height).toBe(384)
    expect(calls.canvasSize).toEqual({ width: 512, height: 384 })
  })

  it('returns a typed failure, without throwing, when decoding fails', async () => {
    const { dependencies } = fakeCanvasFactory()
    dependencies.decode = vi.fn().mockRejectedValue(new Error('not an image'))
    const file = new File(['x'], 'broken.jpg', { type: 'image/jpeg' })

    const result = await generateThumbnail(file, undefined, dependencies)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe(UNREADABLE_IMAGE_ERROR)
  })

  it('returns a typed failure when the canvas cannot produce a blob', async () => {
    const { dependencies, calls } = fakeCanvasFactory()
    const originalCreate = dependencies.createCanvas
    dependencies.createCanvas = (w, h) => {
      const canvas = originalCreate(w, h)
      canvas.toBlob = (callback) => callback(null)
      return canvas
    }
    const file = new File(['x'], 'IMG_3.jpg', { type: 'image/jpeg' })

    const result = await generateThumbnail(file, undefined, dependencies)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe(UNREADABLE_IMAGE_ERROR)
    expect(calls.transform).toBeDefined() // it did get as far as drawing
  })
})

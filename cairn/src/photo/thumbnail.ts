/* Thumbnail generation for imported photos (#51). Longest edge 512px,
   aspect preserved, JPEG quality 0.82, EXIF orientation (1-8) applied to
   pixels so every consumer downstream can render the output with no
   knowledge that EXIF orientation exists (see design doc).

   The geometry — scaling and the EXIF orientation matrix — is pure and
   exported separately from the DOM-touching decode/draw/encode pipeline,
   because jsdom (this suite's test environment) does not implement
   `Image`, `HTMLCanvasElement#getContext('2d')`, or `canvas.toBlob`. Pure
   functions get exhaustive unit tests; `generateThumbnail` itself accepts
   an injectable `CanvasFactory`/decoder so its wiring (decode → scale →
   orient → encode) can be proven too, without needing real pixel
   rendering in jsdom. */

export const THUMBNAIL_MAX_EDGE = 512
export const THUMBNAIL_JPEG_QUALITY = 0.82

/** Appended to the original's filename to name its thumbnail beside it.
    Lives here rather than in the trip's import hook because a loose photo
    is uploaded by a store, not by that hook, and both have to agree on the
    name or a moved photo's thumbnail stops being findable. */
export const THUMBNAIL_SUFFIX = '.thumb.jpg'

const ACCEPTED_TYPES = ['.jpg', '.jpeg', '.png', '.webp']
const HEIC_TYPES = ['.heic', '.heif']

export const HEIC_ERROR =
  "iPhone HEIC photos aren't supported. In iOS, Settings → Camera → Formats → Most Compatible."
export const UNSUPPORTED_TYPE_ERROR = 'only JPEG, PNG, and WebP photos can be imported'
export const UNREADABLE_IMAGE_ERROR = 'could not be read as an image'

export interface ThumbnailSuccess {
  ok: true
  blob: Blob
  width: number
  height: number
}

export interface ThumbnailFailure {
  ok: false
  error: string
}

export type ThumbnailResult = ThumbnailSuccess | ThumbnailFailure

function extensionOf(name: string): string {
  const lower = name.toLowerCase()
  const dot = lower.lastIndexOf('.')
  return dot === -1 ? '' : lower.slice(dot)
}

/** Rejects HEIC/HEIF by name before ever attempting to decode (they are
    never decoded — see the design doc's Out of Scope), and rejects
    anything else that isn't JPEG/PNG/WebP. `undefined` means the file is
    fine to decode. */
export function validateImageFile(name: string): string | undefined {
  const extension = extensionOf(name)
  if (HEIC_TYPES.includes(extension)) return HEIC_ERROR
  if (!ACCEPTED_TYPES.includes(extension)) return UNSUPPORTED_TYPE_ERROR
  return undefined
}

/** Scales `width`x`height` proportionally so its longest edge is at most
    `maxEdge`. An image already at or under `maxEdge` on both edges is
    returned unchanged — thumbnails never upscale. Dimensions are rounded
    to whole pixels (a canvas can't have fractional ones), with a floor of
    1px so a degenerate 0-height/width input can't produce an unusable
    canvas size. */
export function computeScaledDimensions(
  width: number,
  height: number,
  maxEdge: number = THUMBNAIL_MAX_EDGE,
): { width: number; height: number } {
  const longest = Math.max(width, height)
  if (longest <= maxEdge) return { width, height }

  const scale = maxEdge / longest
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/** True for the four orientation values that carry a 90°-rotation
    component (5-8), which is what swaps width and height rather than
    just flipping or rotating 180°. */
export function orientationSwapsDimensions(orientation: number | undefined): boolean {
  return orientation !== undefined && orientation >= 5 && orientation <= 8
}

/** The upright, on-screen dimensions for an image whose *natural* (as
    decoded, ignoring EXIF) pixel size is `naturalWidth`x`naturalHeight`
    and whose EXIF orientation tag is `orientation`. Orientations 5-8 swap
    width and height; everything else (including a missing tag, treated as
    orientation 1) leaves them as-is. */
export function orientedDisplayDimensions(
  orientation: number | undefined,
  naturalWidth: number,
  naturalHeight: number,
): { width: number; height: number } {
  return orientationSwapsDimensions(orientation)
    ? { width: naturalHeight, height: naturalWidth }
    : { width: naturalWidth, height: naturalHeight }
}

/** The standard EXIF-orientation-to-canvas-transform matrix, as the six
    values `CanvasRenderingContext2D#transform(a, b, c, d, e, f)` takes.
    `drawnWidth`/`drawnHeight` are the dimensions the source image is drawn
    at *before* this transform is applied (i.e. in the source's natural,
    un-rotated aspect) — the transform then rotates/mirrors that draw into
    the canvas's final, already-oriented dimensions. Orientation 1 (or an
    absent tag) is the identity matrix. An orientation outside 1-8 is
    treated as 1 rather than thrown — a corrupt/unknown tag should not
    crash a thumbnail. */
export function orientationMatrix(
  orientation: number | undefined,
  drawnWidth: number,
  drawnHeight: number,
): [number, number, number, number, number, number] {
  switch (orientation) {
    case 2:
      return [-1, 0, 0, 1, drawnWidth, 0]
    case 3:
      return [-1, 0, 0, -1, drawnWidth, drawnHeight]
    case 4:
      return [1, 0, 0, -1, 0, drawnHeight]
    case 5:
      return [0, 1, 1, 0, 0, 0]
    case 6:
      return [0, 1, -1, 0, drawnHeight, 0]
    case 7:
      return [0, -1, -1, 0, drawnHeight, drawnWidth]
    case 8:
      return [0, -1, 1, 0, 0, drawnWidth]
    default:
      return [1, 0, 0, 1, 0, 0]
  }
}

/** Everything `generateThumbnail` needs from a decoded image — satisfied
    by an `ImageBitmap` in real use, and by a plain object in tests. */
export interface DecodedImage {
  naturalWidth: number
  naturalHeight: number
  /** What actually gets handed to `drawImage` — separate from the
      width/height above because a real `ImageBitmap` carries both, but a
      test's fake decode result only needs to satisfy `drawImage`'s type,
      never actually be drawn. */
  source: CanvasImageSource
}

/** The subset of `CanvasRenderingContext2D` the drawing step uses —
    narrowed so a test can supply a recording fake instead of a real
    canvas context. */
export interface ThumbnailCanvasContext {
  transform(a: number, b: number, c: number, d: number, e: number, f: number): void
  drawImage(image: CanvasImageSource, dx: number, dy: number, dw: number, dh: number): void
}

export interface ThumbnailCanvas {
  width: number
  height: number
  getContext(kind: '2d'): ThumbnailCanvasContext | null
  toBlob(callback: (blob: Blob | null) => void, type: string, quality: number): void
}

export interface ThumbnailDependencies {
  /** Decodes `file` into pixels without applying EXIF orientation — real
      use passes `imageOrientation: 'none'` to `createImageBitmap` so
      orientation is applied exactly once, by this module, rather than
      twice (once by the browser, once by us). */
  decode(file: File): Promise<DecodedImage>
  createCanvas(width: number, height: number): ThumbnailCanvas
}

async function realDecode(file: File): Promise<DecodedImage> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'none' })
  return { naturalWidth: bitmap.width, naturalHeight: bitmap.height, source: bitmap }
}

function realCreateCanvas(width: number, height: number): ThumbnailCanvas {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas as unknown as ThumbnailCanvas
}

const realDependencies: ThumbnailDependencies = {
  decode: realDecode,
  createCanvas: realCreateCanvas,
}

function canvasToBlob(canvas: ThumbnailCanvas, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

/** Decodes `file`, draws it to a canvas at longest-edge-`maxEdge`px with
    `orientation` applied to the pixels, and encodes the result as JPEG at
    `quality`. `file`'s name must already have passed `validateImageFile` —
    this function does not re-check extension, only that decoding and
    encoding actually succeed. */
export async function generateThumbnail(
  file: File,
  orientation: number | undefined,
  deps: ThumbnailDependencies = realDependencies,
  maxEdge: number = THUMBNAIL_MAX_EDGE,
  quality: number = THUMBNAIL_JPEG_QUALITY,
): Promise<ThumbnailResult> {
  let decoded: DecodedImage
  try {
    decoded = await deps.decode(file)
  } catch {
    return { ok: false, error: UNREADABLE_IMAGE_ERROR }
  }

  const display = orientedDisplayDimensions(orientation, decoded.naturalWidth, decoded.naturalHeight)
  const scaledDisplay = computeScaledDimensions(display.width, display.height, maxEdge)
  const scaledSource = orientationSwapsDimensions(orientation)
    ? { width: scaledDisplay.height, height: scaledDisplay.width }
    : scaledDisplay

  const canvas = deps.createCanvas(scaledDisplay.width, scaledDisplay.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) return { ok: false, error: UNREADABLE_IMAGE_ERROR }

  const matrix = orientationMatrix(orientation, scaledSource.width, scaledSource.height)
  ctx.transform(...matrix)
  ctx.drawImage(decoded.source, 0, 0, scaledSource.width, scaledSource.height)

  let blob: Blob | null
  try {
    blob = await canvasToBlob(canvas, 'image/jpeg', quality)
  } catch {
    return { ok: false, error: UNREADABLE_IMAGE_ERROR }
  }
  if (!blob) return { ok: false, error: UNREADABLE_IMAGE_ERROR }

  return { ok: true, blob, width: scaledDisplay.width, height: scaledDisplay.height }
}

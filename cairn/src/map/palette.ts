/* High-chroma and deliberately free of green or brown — satellite imagery is
   desaturated earth tone, so these separate from it and from each other.
   Eight colours, cycling after the eighth; nine tracks aren't distinguishable
   by colour alone regardless. */
export const TRACK_COLORS = [
  '#FF3B30', // red
  '#00D4FF', // cyan
  '#FFCC00', // yellow
  '#FF00A8', // magenta
  '#FF8A00', // orange
  '#7CFF00', // chartreuse
  '#B47CFF', // violet
  '#00FFB2', // spring green
] as const

/** Index-aligned with `TRACK_COLORS` — #46's recolour popover uses these as
    each swatch option's `aria-label`, since the swatches carry no visible
    text of their own. */
export const TRACK_COLOR_NAMES = [
  'Red',
  'Cyan',
  'Yellow',
  'Magenta',
  'Orange',
  'Chartreuse',
  'Violet',
  'Spring green',
] as const

export function trackColor(colorIndex: number): string {
  return TRACK_COLORS[colorIndex % TRACK_COLORS.length]
}

/* Ring styling and copy for a photo-carrying cairn marker's provenance —
   pure, no React — per cairn/docs/design/54-photo-markers.md's "Marker
   form", "Selection" and "Copy" sections, extended to `cairns.md`'s third
   `positionSource`. Kept separate from CairnLayer.tsx so the ring/label
   rules are testable without mounting a map.

   `placed` (a person put it here) takes the same solid-ring treatment as
   `exif` — both are a definite claim about where the thing is, as against
   `interpolated`'s dashed "estimated" ring. The marker/list rework
   (`cairn: cairn markers, list and detail replace photo UI`) owns whether
   that stays true once a cairn can be dragged. */

import type { PositionSource } from '../store/looseStore'

export interface RingStyle {
  borderStyle: 'solid' | 'dashed'
  /** A CSS custom property name (without `var()`), never a literal colour —
      the design doc's whole point is that provenance is carried by the ring
      shape, not by hue, so the two non-selected colours are close in
      lightness rather than a red/green pair. */
  colorVar: '--text' | '--text-muted' | '--accent'
  widthVar: '--marker-ring' | '--marker-ring-selected'
  /** `drop-shadow(0 0 7px)` in `--accent`, licensed by the design language
      for exactly one marker at a time (the selected one). */
  glow: boolean
}

/** Selection always wins over provenance — "the ring is spent on selection"
    (design doc, Selection section): a selected marker shows the accent ring
    and glow regardless of whether the photo was recorded or derived.

    #251: `hovered` sits between the two — the orange moves, at the
    *thinner* `--marker-ring` width, and carries no glow, so a hovered
    marker reads apart from a selected one at a glance even side by side
    (251-linked-hover.md's "The marker, hovered" table). Selected still
    wins over hovered, the same way it already wins over provenance: a
    selected marker that also happens to be hovered keeps its selected ring
    and glow in full — hover only ever adds the scale, which lives outside
    this ring computation, in the caller's own CSS class. */
export function ringStyleForPhoto(source: PositionSource, selected: boolean, hovered = false): RingStyle {
  if (selected) {
    return { borderStyle: 'solid', colorVar: '--accent', widthVar: '--marker-ring-selected', glow: true }
  }
  if (hovered) {
    return { borderStyle: 'solid', colorVar: '--accent', widthVar: '--marker-ring', glow: false }
  }
  return source === 'interpolated'
    ? { borderStyle: 'dashed', colorVar: '--text-muted', widthVar: '--marker-ring', glow: false }
    : { borderStyle: 'solid', colorVar: '--text', widthVar: '--marker-ring', glow: false }
}

/** "A cluster containing both recorded and derived photos takes the dashed
    ring — the weaker claim wins" (design doc, Clustering section). Any
    interpolated member downgrades the whole cluster; only a cluster whose
    members are entirely recorded gets the solid ring. A cluster is never
    itself "selected" (design doc: clicking one zooms rather than selects),
    so this has no selected branch. */
export function clusterProvenance(members: { source: PositionSource }[]): PositionSource {
  return members.some((member) => member.source === 'interpolated') ? 'interpolated' : 'exif'
}

export function clusterAriaLabel(count: number): string {
  return `${count} photos`
}

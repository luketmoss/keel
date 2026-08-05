import { BASE_MAP_TYPES, type BaseMapType } from '../map/useBaseMapType'
import './BaseMapControl.css'

const LABELS: Record<BaseMapType, string> = {
  roadmap: 'Map',
  satellite: 'Satellite',
  hybrid: 'Hybrid',
  terrain: 'Terrain',
}

/** Same segmented-control pattern as `WorldMap`'s `StatusFilterRow`, built as
    its own component so both `MapView` and `WorldMap` can mount it without
    one importing the other's internals — see #104's design note. */
export function BaseMapControl({
  value,
  onChange,
}: {
  value: BaseMapType
  onChange: (next: BaseMapType) => void
}) {
  return (
    <div className="basemap-control">
      {BASE_MAP_TYPES.map((type) => (
        <button
          key={type}
          type="button"
          className={`basemap-control__segment${
            value === type ? ' basemap-control__segment--active' : ''
          }`}
          onClick={() => onChange(type)}
        >
          {LABELS[type]}
        </button>
      ))}
    </div>
  )
}

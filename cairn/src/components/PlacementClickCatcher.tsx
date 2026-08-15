import { useEffect } from 'react'
import { useMap } from '@vis.gl/react-google-maps'
import type { LatLng } from '../map/geo'

interface PlacementClickCatcherProps {
  active: boolean
  onPlace: (position: LatLng) => void
}

/** While the placement queue is open, the map itself becomes the input —
    `cairns.md`'s "The map takes a crosshair cursor". A click anywhere
    places the current file at that coordinate; placing one outside the
    current viewport is impossible by construction, since the click *is*
    the coordinate (`155-cairns-replace-photos.md`'s edge case). Renders
    nothing itself — it only attaches and detaches a listener and a cursor
    option on the shared map instance. */
export function PlacementClickCatcher({ active, onPlace }: PlacementClickCatcherProps) {
  const map = useMap()

  useEffect(() => {
    if (!map || !active) return

    map.setOptions({ draggableCursor: 'crosshair' })
    const listener = google.maps.event.addListener(
      map,
      'click',
      (event: google.maps.MapMouseEvent) => {
        if (!event.latLng) return
        onPlace({ lat: event.latLng.lat(), lng: event.latLng.lng() })
      },
    )

    return () => {
      listener.remove()
      map.setOptions({ draggableCursor: null })
    }
  }, [map, active, onPlace])

  return null
}

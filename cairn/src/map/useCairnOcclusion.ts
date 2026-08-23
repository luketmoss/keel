import { useEffect, useRef, useState } from 'react'
import type { ElevationSampler } from '../geo/elevation'
import { isCairnOccluded, OCCLUSION_MAX_CAIRNS, type CameraPosition } from './cairnOcclusion'

export interface OccludableCairn {
  id: string
  latitude: number
  longitude: number
}

/** #285 — which of `cairns` are hidden behind terrain on `map3d`, recomputed
    each time the camera comes to rest (`gmp-steadychange` with
    `isSteady: true`). Verdicts hold for the duration of a gesture and never
    trigger a request while the camera moves — the design note's "While the
    camera moves".

    `selectedCairnId` never appears in the result: a selected cairn always
    draws, the one exception to the rule, because #270's whole promise is
    that selecting a cairn reveals it on the map. */
export function useCairnOcclusion(
  map3d: google.maps.maps3d.Map3DElement | null,
  cairns: OccludableCairn[],
  selectedCairnId: string | null,
  getSampler: () => ElevationSampler | null,
): ReadonlySet<string> {
  const [occludedIds, setOccludedIds] = useState<ReadonlySet<string>>(() => new Set())

  /* Read fresh inside the listener without re-subscribing it — the
     listener is attached once per `map3d` instance, not once per render. */
  const cairnsRef = useRef(cairns)
  cairnsRef.current = cairns
  const selectedRef = useRef(selectedCairnId)
  selectedRef.current = selectedCairnId

  useEffect(() => {
    if (!map3d) return
    let cancelled = false

    function handleSteadyChange(event: Event) {
      if (!(event as google.maps.maps3d.SteadyChangeEvent).isSteady) return

      const camera = map3d!.cameraPosition
      if (!camera) return
      const position: CameraPosition = { lat: camera.lat, lng: camera.lng, altitude: camera.altitude }
      const sampler = getSampler()

      const candidates = cairnsRef.current
        .filter((cairn) => cairn.id !== selectedRef.current)
        .slice(0, OCCLUSION_MAX_CAIRNS)

      void Promise.all(
        candidates.map(async (cairn) => {
          const occluded = await isCairnOccluded(
            position,
            cairn.id,
            { lat: cairn.latitude, lng: cairn.longitude },
            sampler,
          )
          return [cairn.id, occluded] as const
        }),
      ).then((verdicts) => {
        if (cancelled) return
        setOccludedIds(new Set(verdicts.filter(([, occluded]) => occluded).map(([id]) => id)))
      })
    }

    map3d.addEventListener('gmp-steadychange', handleSteadyChange)
    return () => {
      cancelled = true
      map3d.removeEventListener('gmp-steadychange', handleSteadyChange)
    }
  }, [map3d, getSampler])

  if (selectedCairnId && occludedIds.has(selectedCairnId)) {
    const withoutSelected = new Set(occludedIds)
    withoutSelected.delete(selectedCairnId)
    return withoutSelected
  }

  return occludedIds
}

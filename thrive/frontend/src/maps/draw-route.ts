// Draws a stored track on a Google map (#407). Geometry comes from @keel/geo
// (invalid latitudes, the antimeridian, fitting to bounds), never copies of it.
//
// Two polylines, a casing under the line, so the route stays readable over
// satellite imagery and over Google's own blue water and roads; the start and
// end are circle symbols riding the top line. The colours and sizes are the
// `--map-*` tokens in global.css, read from the container when it draws, so the
// values live in the stylesheet alone.

import { dropInvalidLatitudes, fitTracksToBounds, normalizeAntimeridian, type LatLng } from '@keel/geo';
import type { WorkoutTrack } from '../api/types';

/** The route's points, ready to draw: bad latitudes dropped, the date line unwrapped. */
export function routePoints(track: WorkoutTrack): LatLng[] {
  const coordinates = track.geometry?.coordinates ?? [];
  return normalizeAntimeridian(dropInvalidLatitudes(coordinates.map(([lon, lat]) => ({ lat, lon }))));
}

interface Tokens {
  line: string;
  casing: string;
  lineWidth: number;
  casingWidth: number;
  dot: number;
}

function readTokens(container: Element): Tokens {
  const style = getComputedStyle(container);
  const px = (name: string, fallback: number) => {
    const n = parseFloat(style.getPropertyValue(name));
    return Number.isFinite(n) ? n : fallback;
  };
  const colour = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    line: colour('--map-track', '#2f66f0'),
    casing: colour('--map-track-casing', '#ffffff'),
    lineWidth: px('--map-track-width', 4),
    casingWidth: px('--map-track-width-casing', 7),
    dot: px('--map-dot-size', 12),
  };
}

/** The Map options: touch scrolls the page, and nothing here needs Street View, tilt or POIs. */
export const MAP_OPTIONS: google.maps.MapOptions = {
  gestureHandling: 'cooperative',
  streetViewControl: false,
  rotateControl: false,
  tilt: 0,
  clickableIcons: false,
  mapTypeControl: true,
  fullscreenControl: true,
  zoomControl: true,
};

/**
 * Create the map in `container` and draw `track` on it, fitted to the route
 * (at most zoom 16) with `--space-lg` of padding. Returns the points drawn, or
 * null when fewer than two usable points remain, which the caller shows as an
 * error rather than an empty map.
 */
export function drawRoute(container: HTMLElement, track: WorkoutTrack): LatLng[] | null {
  const points = routePoints(track);
  if (points.length < 2) return null;

  const tokens = readTokens(container);
  const map = new google.maps.Map(container, { ...MAP_OPTIONS, center: points[0], zoom: 12 });

  new google.maps.Polyline({
    map,
    path: points,
    clickable: false,
    strokeColor: tokens.casing,
    strokeOpacity: 1,
    strokeWeight: tokens.casingWidth,
    zIndex: 1,
  });

  const circle = (fill: string, stroke: string, strokeWeight: number): google.maps.Symbol => ({
    path: google.maps.SymbolPath.CIRCLE,
    scale: tokens.dot / 2,
    fillColor: fill,
    fillOpacity: 1,
    strokeColor: stroke,
    strokeWeight,
  });

  new google.maps.Polyline({
    map,
    path: points,
    clickable: false,
    strokeColor: tokens.line,
    strokeOpacity: 1,
    strokeWeight: tokens.lineWidth,
    zIndex: 2,
    icons: [
      // Start: solid. End: hollow ring. A loop puts one over the other, and colour alone never tells them apart.
      { icon: circle(tokens.line, tokens.casing, 2), offset: '0%' },
      { icon: circle(tokens.casing, tokens.line, 3), offset: '100%' },
    ],
  });

  const padding = parseFloat(getComputedStyle(container).getPropertyValue('--space-lg')) || 24;
  fitTracksToBounds(map, points, padding);
  return points;
}

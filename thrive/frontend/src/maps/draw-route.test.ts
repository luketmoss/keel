// #407: how a stored track is drawn.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { WorkoutTrack } from '../api/types';
import { MAP_OPTIONS, drawRoute, routePoints } from './draw-route';
import { installFakeGoogleMaps, removeFakeGoogleMaps, type FakeMapState } from './fake-google-maps';

const track = (coordinates: [number, number][]): WorkoutTrack => ({
  type: 'Feature',
  bbox: [0, 0, 0, 0],
  properties: {
    format: 'thrive-track', version: 1, source: 'coros', activity_id: '1', start_utc: '2026-06-01T14:00:00.000Z',
    t: coordinates.map((_, i) => i), ele: coordinates.map(() => null), simplify: { algorithm: 'rdp', tolerance_m: 5 },
    points_in: coordinates.length,
  },
  geometry: { type: 'LineString', coordinates },
});

let state: FakeMapState;
let container: HTMLElement;
beforeEach(() => {
  state = installFakeGoogleMaps();
  container = document.createElement('div');
  container.style.setProperty('--map-track', '#112233');
  container.style.setProperty('--map-track-casing', '#fefefe');
  container.style.setProperty('--map-track-width', '5px');
  container.style.setProperty('--map-track-width-casing', '9px');
  container.style.setProperty('--map-dot-size', '14px');
  document.body.appendChild(container);
});
afterEach(() => {
  removeFakeGoogleMaps();
  container.remove();
});

const LOOP: [number, number][] = [[-100, 45], [-100.01, 45.002], [-100.02, 45], [-100, 45]];

describe('routePoints: geometry comes from @keel/geo', () => {
  it('turns [lon, lat] into {lat, lng}', () => {
    expect(routePoints(track(LOOP))[1]).toEqual({ lat: 45.002, lng: -100.01 });
  });

  it('drops invalid latitudes and unwraps the antimeridian', () => {
    const points = routePoints(track([[179.9, 10], [-179.9, 10.1], [0, 95], [-179.8, 10.2]]));
    expect(points).toHaveLength(3);
    // The second point is carried across the date line instead of jumping the long way round.
    expect(points[1].lng).toBeCloseTo(180.1, 5);
    expect(points[2].lng).toBeCloseTo(180.2, 5);
  });
});

describe('drawRoute', () => {
  it('draws a casing under the line, from the --map-* tokens', () => {
    expect(drawRoute(container, track(LOOP))).toHaveLength(4);
    expect(state.polylines).toHaveLength(2);
    const [casing, line] = state.polylines.map((p) => p.options);
    expect(casing).toMatchObject({ strokeColor: '#fefefe', strokeWeight: 9, clickable: false });
    expect(line).toMatchObject({ strokeColor: '#112233', strokeWeight: 5, clickable: false });
    expect(line.zIndex).toBeGreaterThan(casing.zIndex);
    expect(line.path).toEqual(casing.path);
  });

  it('marks the start with a filled dot and the end with a ringed one, at 0% and 100%', () => {
    drawRoute(container, track(LOOP));
    const { icons } = state.polylines[1].options;
    expect(icons.map((i: any) => i.offset)).toEqual(['0%', '100%']);
    const [start, end] = icons.map((i: any) => i.icon);
    for (const symbol of [start, end]) {
      expect(symbol.scale).toBe(7); // half --map-dot-size
      expect(symbol.path).toBe(0); // SymbolPath.CIRCLE
    }
    expect(start).toMatchObject({ fillColor: '#112233', strokeColor: '#fefefe', strokeWeight: 2 });
    expect(end).toMatchObject({ fillColor: '#fefefe', strokeColor: '#112233', strokeWeight: 3 });
  });

  it('creates the map with cooperative gestures and none of Street View, tilt, rotate or POIs', () => {
    drawRoute(container, track(LOOP));
    expect(state.maps).toHaveLength(1);
    expect(state.maps[0].container).toBe(container);
    expect(MAP_OPTIONS).toMatchObject({
      gestureHandling: 'cooperative', streetViewControl: false, rotateControl: false, tilt: 0, clickableIcons: false,
      zoomControl: true, mapTypeControl: true, fullscreenControl: true,
    });
    expect(state.maps[0].options).toMatchObject(MAP_OPTIONS);
  });

  it('fits the map to the route, and does not fit again', () => {
    drawRoute(container, track(LOOP));
    expect(state.maps[0].fitted).toBeDefined();
    expect(typeof state.maps[0].fitted!.padding).toBe('number');
  });

  it('refuses a track with fewer than two usable points, drawing nothing', () => {
    expect(drawRoute(container, track([[-100, 45]]))).toBeNull();
    expect(drawRoute(container, track([[-100, 95], [-100.1, 96]]))).toBeNull();
    expect(state.maps).toHaveLength(0);
    expect(state.polylines).toHaveLength(0);
  });

  it('falls back to the design values when a token is missing', () => {
    const bare = document.createElement('div');
    document.body.appendChild(bare);
    drawRoute(bare, track(LOOP));
    const [casing, line] = state.polylines.map((p) => p.options);
    expect([casing.strokeWeight, line.strokeWeight]).toEqual([7, 4]);
    expect(line.strokeColor).toBe('#2f66f0');
    bare.remove();
  });
});

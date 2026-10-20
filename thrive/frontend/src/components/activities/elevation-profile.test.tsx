// #532: the Elevation card on the activity detail screen.

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/preact';
import { h } from 'preact';
import { ElevationProfile, axisLabels, elevationData } from './elevation-profile';
import type { WorkoutTrack } from '../../api/types';

const FT = 0.3048;

/** A north-going track, ~1.11 km between points, with the given elevations in metres. */
function track(ele: (number | null)[]): WorkoutTrack {
  return {
    type: 'Feature',
    bbox: [-100, 45, -100, 45.1],
    properties: {
      format: 'thrive-track',
      version: 1,
      source: 'coros',
      activity_id: '1',
      start_utc: '2026-06-01T14:00:00.000Z',
      t: ele.map((_, i) => i * 60),
      ele,
      simplify: { algorithm: 'rdp', tolerance_m: 5 },
      points_in: 99,
    },
    geometry: { type: 'LineString', coordinates: ele.map((_, i) => [-100, 45 + i * 0.01]) },
  };
}

afterEach(cleanup);

describe('elevationData', () => {
  it('is null under two points with an elevation', () => {
    expect(elevationData(track([null, null, null]))).toBeNull();
    expect(elevationData(track([1000, null, null]))).toBeNull();
    expect(elevationData(track([]))).toBeNull();
  });

  it('measures distance along the track in miles and elevation in feet, keeping nulls as gaps', () => {
    const data = elevationData(track([1000, null, 1100]))!;
    expect(data.points).toHaveLength(3);
    expect(data.points[1].feet).toBeNull();
    expect(data.points[0].miles).toBe(0);
    expect(data.totalMiles).toBeCloseTo(1.38, 1); // 0.02 degrees of latitude
    expect(data.lowFt).toBeCloseTo(1000 / FT, 5);
    expect(data.highFt).toBeCloseTo(1100 / FT, 5);
  });
});

describe('axisLabels', () => {
  it('is 0 and thirds of the distance, in whole miles', () => {
    expect(axisLabels(15)).toEqual(['0', '5 mi', '10 mi', '15 mi']);
  });
  it('is to one decimal under 3 mi', () => {
    expect(axisLabels(2.4)).toEqual(['0', '0.8 mi', '1.6 mi', '2.4 mi']);
  });
});

describe('ElevationProfile', () => {
  const ele = [1655, 1700, 1800, 1750, 1850]; // 5,430 to 6,070 ft

  it('names the chart with its lowest and highest point and its distance', () => {
    const { getByRole } = render(h(ElevationProfile, { track: track(ele), ascentM: '' }));
    const chart = getByRole('img');
    const data = elevationData(track(ele))!;
    const grouped = (n: number) => Math.round(n).toLocaleString('en-US');
    expect(chart.getAttribute('aria-label')).toBe(
      `Elevation from ${grouped(data.lowFt)} to ${grouped(data.highFt)} ft over ${data.totalMiles.toFixed(1)} mi`,
    );
    expect(chart.getAttribute('aria-label')).toMatch(/^Elevation from 5,430 to 6,070 ft over \d+\.\d mi$/);
  });

  it('shows the low and high in the sub-line, and the ascent from ascent_m in the heading row', () => {
    const { container } = render(h(ElevationProfile, { track: track(ele), ascentM: '494' }));
    expect(container.querySelector('h2')?.textContent).toBe('Elevation');
    expect(container.querySelector('.detail-elevation-range')?.textContent).toBe('5,430 – 6,070 ft');
    expect(container.querySelector('.detail-elevation-ascent')?.textContent).toBe('↑ 1,621 ft');
  });

  it('leaves the ascent out when blank or zero', () => {
    for (const ascentM of ['', '  ', '0']) {
      const { container, unmount } = render(h(ElevationProfile, { track: track(ele), ascentM }));
      expect(container.querySelector('.detail-elevation-ascent'), ascentM).toBeNull();
      unmount();
    }
  });

  it('draws one line and area when the elevations are unbroken', () => {
    const { container } = render(h(ElevationProfile, { track: track(ele), ascentM: '' }));
    const line = container.querySelector('.detail-elevation-line')!.getAttribute('d')!;
    expect(line.match(/M/g)).toHaveLength(1);
    expect(line.match(/L/g)).toHaveLength(4);
    expect(container.querySelector('.detail-elevation-area')!.getAttribute('d')).toContain('Z');
  });

  it('breaks the line and the area at a null elevation', () => {
    const { container } = render(
      h(ElevationProfile, { track: track([1000, 1010, 1020, null, 1030, 1040, 1050]), ascentM: '' }),
    );
    expect(container.querySelector('.detail-elevation-line')!.getAttribute('d')!.match(/M/g)).toHaveLength(2);
    expect(container.querySelector('.detail-elevation-area')!.getAttribute('d')!.match(/Z/g)).toHaveLength(2);
  });

  it('puts the lowest point on the baseline and the highest below the top, with headroom', () => {
    const { container } = render(h(ElevationProfile, { track: track([1000, 1100]), ascentM: '' }));
    const ys = [
      ...container
        .querySelector('.detail-elevation-line')!
        .getAttribute('d')!
        .matchAll(/,([\d.]+)/g),
    ].map((m) => Number(m[1]));
    expect(ys[0]).toBe(96);
    expect(ys[1]).toBeGreaterThan(0);
    expect(ys[1]).toBeCloseTo(96 - 96 / 1.08, 0);
  });

  it('draws a flat track without dividing by zero', () => {
    const { container } = render(h(ElevationProfile, { track: track([500, 500, 500]), ascentM: '' }));
    expect(container.querySelector('.detail-elevation-line')!.getAttribute('d')).not.toContain('NaN');
  });

  it('renders nothing for a track with fewer than two elevations', () => {
    const { container } = render(h(ElevationProfile, { track: track([500, null, null]), ascentM: '' }));
    expect(container.querySelector('.detail-elevation-card')).toBeNull();
  });

  it('has four axis labels', () => {
    const { container } = render(h(ElevationProfile, { track: track(ele), ascentM: '' }));
    expect(container.querySelectorAll('.detail-elevation-axis span')).toHaveLength(4);
  });
});

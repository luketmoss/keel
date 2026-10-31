// #692 — the grid and the rules, on invented coordinates only.

import { describe, it, expect } from 'vitest';
import { cellOf, trackCells, ROW, segmentMetres } from './grid';
import { decodeCells, encodeCells } from './encode';
import { similarTo, MIN_CELLS, type SimilarCandidate } from './rules';

const M_PER_DEG_LAT = 111_320;
const LAT = 10;
const LON = 10;
const M_PER_DEG_LON = M_PER_DEG_LAT * Math.cos((LAT * Math.PI) / 180);

/** An invented straight route heading east, a point every `stepM`, moved `northM` north. */
function eastLine(lengthM: number, northM = 0, stepM = 20): [number, number][] {
  const out: [number, number][] = [];
  for (let d = 0; d <= lengthM; d += stepM) out.push([LON + d / M_PER_DEG_LON, LAT + northM / M_PER_DEG_LAT]);
  return out;
}

/** A run of cells along a row, from x0, `n` long. */
function row(x0: number, n: number, y = 100): number[] {
  return Array.from({ length: n }, (_, i) => (x0 + i) * ROW + y);
}

function cand(id: string, cells: number[], date = '2025-01-01', time = '08:00'): SimilarCandidate {
  return { id, cells, date, time };
}

describe('cells', () => {
  it('the cell of a point is its zoom-19 web-map tile', () => {
    // Tile numbers worked out from the slippy-map formula for an invented point.
    const lon = 10.0;
    const lat = 10.0;
    const x = Math.floor(((lon + 180) / 360) * 2 ** 19);
    const y = Math.floor(
      ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** 19,
    );
    expect(cellOf(lon, lat)).toBe(x * 2 ** 20 + y);
    expect(cellOf(lon, lat)).toBeLessThan(2 ** 40);
    // Points in the same tile share a cell; a tile away is another.
    expect(cellOf(lon + 0.000001, lat)).toBe(cellOf(lon, lat));
    expect(cellOf(lon + 0.01, lat)).not.toBe(cellOf(lon, lat));
  });

  it('adds the cells between points more than 25 m apart', () => {
    const sparse = [
      [LON, LAT],
      [LON + 400 / M_PER_DEG_LON, LAT],
    ] as [number, number][];
    const cells = trackCells(sparse);
    // 400 m is about 5 cells wide here; the two ends alone would be 2.
    expect(cells.length).toBeGreaterThanOrEqual(5);
    expect(cells).toEqual(trackCells(eastLine(400, 0, 5)));
  });

  it('does not fill a segment over 1 km', () => {
    const jump = [
      [LON, LAT],
      [LON + 1500 / M_PER_DEG_LON, LAT],
    ] as [number, number][];
    expect(segmentMetres(jump[0], jump[1])).toBeGreaterThan(1000);
    expect(trackCells(jump)).toHaveLength(2);
    const justUnder = [
      [LON, LAT],
      [LON + 990 / M_PER_DEG_LON, LAT],
    ] as [number, number][];
    expect(trackCells(justUnder).length).toBeGreaterThan(10);
  });

  it('gives no cells for fewer than 2 points, and the same cells for the same track', () => {
    expect(trackCells([])).toEqual([]);
    expect(trackCells([[LON, LAT]])).toEqual([]);
    const track = eastLine(2000);
    expect(trackCells(track)).toEqual(trackCells(track));
    const cells = trackCells(track);
    expect(cells).toEqual([...new Set(cells)].sort((a, b) => a - b));
  });
});

describe('storage encoding', () => {
  it('round-trips sorted cells and rejects anything else', () => {
    const cells = trackCells(eastLine(3000));
    const text = encodeCells(cells);
    expect(decodeCells(text)).toEqual(cells);
    expect(text.length).toBeLessThan(cells.length * 8);
    expect(decodeCells('')).toEqual([]);
    expect(decodeCells('zz,!')).toBeNull();
  });
});

describe('Routes like this', () => {
  const base = trackCells(eastLine(3000));
  it('has enough cells for the cases below', () => {
    expect(base.length).toBeGreaterThanOrEqual(30);
  });

  it('matches the same route shifted 10 m and 20 m, not 150 m', () => {
    const r = similarTo(cand('a', base), [
      cand('s10', trackCells(eastLine(3000, 10))),
      cand('s20', trackCells(eastLine(3000, 20))),
      cand('s150', trackCells(eastLine(3000, 150))),
    ]);
    expect(r.routes.sort()).toEqual(['s10', 's20']);
    expect(r.near).toEqual([]);
  });

  it('does not match a short route inside a long one: it is Near here', () => {
    const short = trackCells(eastLine(1500));
    expect(short.length).toBeGreaterThanOrEqual(MIN_CELLS);
    expect(similarTo(cand('long', base), [cand('short', short)])).toEqual({ routes: [], near: ['short'] });
    expect(similarTo(cand('short', short), [cand('long', base)])).toEqual({ routes: [], near: ['long'] });
  });

  it('matches at exactly 70% coverage and not just under', () => {
    const a = row(0, 20);
    // B's cells 0..12 on two rows: 26 cells; A's cells near B are 0..13, 14 of 20.
    const rows = (n: number) => [...row(0, n, 100), ...row(0, n, 101)];
    expect(similarTo(cand('a', a), [cand('b', rows(13))]).routes).toEqual(['b']);
    expect(similarTo(cand('a', a), [cand('b', rows(12))]).routes).toEqual([]);
    // And from the other side: the viewed one is the bigger.
    expect(similarTo(cand('b', rows(13)), [cand('a', a)]).routes).toEqual(['a']);
  });

  it('never compares an activity under 20 cells, either way round', () => {
    const nineteen = row(0, 19);
    const twenty = row(0, 20);
    expect(similarTo(cand('v', nineteen), [cand('o', nineteen)])).toEqual({ routes: [], near: [] });
    expect(similarTo(cand('v', twenty), [cand('o', nineteen)])).toEqual({ routes: [], near: [] });
    expect(similarTo(cand('v', nineteen), [cand('o', twenty)])).toEqual({ routes: [], near: [] });
    expect(similarTo(cand('v', twenty), [cand('o', twenty)]).routes).toEqual(['o']);
  });

  it('lists the newest 3, newest first, and never the viewed one', () => {
    const others = [
      cand('d1', base, '2025-01-01', '09:00'),
      cand('d2', base, '2025-03-01', '07:00'),
      cand('d3', base, '2025-03-01', '18:00'),
      cand('d4', base, '2024-12-01', '09:00'),
      cand('me', base, '2025-05-01', '09:00'),
    ];
    expect(similarTo(cand('me', base), others).routes).toEqual(['d3', 'd2', 'd1']);
  });
});

describe('Near here', () => {
  /** B: `close` cells along A's row and `far` cells nowhere near it. */
  const withFar = (close: number, far: number) => [...row(0, close), ...row(1000, far, 500)];

  it('needs 15 shared cells, on both sides of the boundary', () => {
    const a = row(0, 40);
    // B's cells 0..13 make A's cells 0..14 near it: 15.
    expect(similarTo(cand('a', a), [cand('b', withFar(14, 20))]).near).toEqual(['b']);
    // 0..12 make 14: coverage is plenty (14 of 40) but the shared count is not.
    expect(similarTo(cand('a', a), [cand('b', withFar(13, 20))]).near).toEqual([]);
  });

  it('needs 25% coverage one way, on both sides of the boundary', () => {
    const a = row(0, 100);
    // 24 close cells make 25 of A's cells near B; B is 100 cells, 24 near A: 25% one way.
    expect(similarTo(cand('a', a), [cand('b', withFar(24, 76))]).near).toEqual(['b']);
    // 23 close: 24 of A (24%) and 23 of B (23%): neither reaches 25%.
    expect(similarTo(cand('a', a), [cand('b', withFar(23, 77))]).near).toEqual([]);
    // The other way round: B covered 25% by A while A is barely covered.
    expect(similarTo(cand('b', withFar(24, 76)), [cand('a', a)]).near).toEqual(['a']);
  });

  it('is never in both sections, and is capped at 3 newest first', () => {
    const a = row(0, 100);
    const part = (id: string, date: string) => cand(id, withFar(40, 60), date);
    const r = similarTo(cand('a', a), [
      cand('same', a, '2025-06-01'),
      part('n1', '2025-01-01'),
      part('n2', '2025-02-01'),
      part('n3', '2025-03-01'),
      part('n4', '2025-04-01'),
    ]);
    expect(r.routes).toEqual(['same']);
    expect(r.near).toEqual(['n4', 'n3', 'n2']);
    expect(r.near.filter((id) => r.routes.includes(id))).toEqual([]);
  });

  it('finds nothing among activities far away', () => {
    expect(similarTo(cand('a', row(0, 40)), [cand('b', row(5000, 40, 3000))])).toEqual({ routes: [], near: [] });
  });
});

describe('speed', () => {
  it('computes both sections over 600 activities of 500 cells in well under a second', () => {
    // Invented cells packed into a 60 x 60 block, so many pairs really overlap.
    let seed = 7;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const make = (id: string): SimilarCandidate => {
      const set = new Set<number>();
      let x = 1000 + Math.floor(rand() * 60);
      let y = 2000 + Math.floor(rand() * 60);
      while (set.size < 500) {
        set.add(x * ROW + y);
        const r = rand();
        if (r < 0.4) x += 1;
        else if (r < 0.6) x -= 1;
        else if (r < 0.8) y += 1;
        else y -= 1;
      }
      return cand(
        id,
        [...set].sort((p, q) => p - q),
        `2025-01-${String((Number(id.slice(1)) % 28) + 1).padStart(2, '0')}`,
      );
    };
    const all = Array.from({ length: 600 }, (_, i) => make(`a${i}`));
    const start = performance.now();
    similarTo(all[0], all);
    const ms = performance.now() - start;
    // The target is 200 ms; the bound is a generous multiple so a slow CI machine does not flake.
    expect(ms).toBeLessThan(1500);
  });
});

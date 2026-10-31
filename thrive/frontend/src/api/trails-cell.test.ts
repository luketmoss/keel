// #688: parseTrailsCell decodes Workouts!AD into #682's TrailPass shape, and
// never throws. The golden value is the sync's, committed once in
// sync/test/fixtures and encoded there from a synthetic activity.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseTrailsCell } from './trails-cell';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GOLDEN = readFileSync(resolve(__dirname, '../../../sync/test/fixtures/trails-688-golden.txt'), 'utf-8').trim();

describe('parseTrailsCell', () => {
  it('reads a blank cell as untagged', () => {
    expect(parseTrailsCell('')).toEqual({ status: 'untagged' });
  });

  it('decodes the committed golden value into TrailPass objects, by the #688 mapping', () => {
    expect(parseTrailsCell(GOLDEN)).toEqual({
      status: 'tagged',
      matcherVersion: 1,
      unmatchedM: 395,
      omitted: 0,
      passes: [
        {
          trail: 'Heron Ridge Trail',
          startPct: 0,
          endPct: 100,
          direction: 'forward',
          metres: 1015,
          durationS: 254,
          climbM: 30,
          entryOffsetS: 70,
        },
        {
          trail: 'Aspen Draw;Kestrel Connector',
          startPct: 3,
          endPct: 97,
          direction: 'forward',
          metres: 140,
          durationS: 35,
          climbM: null,
          entryOffsetS: 326,
        },
        {
          trail: 'Aspen Draw;Kestrel Connector',
          startPct: 97,
          endPct: 3,
          direction: 'reverse',
          metres: 140,
          durationS: null,
          climbM: null,
          entryOffsetS: null,
        },
        {
          trail: 'Heron Ridge Trail',
          startPct: 100,
          endPct: 41,
          direction: 'reverse',
          metres: 590,
          durationS: null,
          climbM: null,
          entryOffsetS: null,
        },
        {
          trail: 'Lower Heron',
          startPct: 0,
          endPct: 100,
          direction: 'forward',
          metres: 420,
          durationS: null,
          climbM: null,
          entryOffsetS: null,
        },
      ],
    });
  });

  it('reads no named trail as tagged with no passes, and x as omitted', () => {
    expect(parseTrailsCell('{"v":1,"m":1,"u":2700,"n":[],"p":[]}')).toEqual({
      status: 'tagged',
      matcherVersion: 1,
      unmatchedM: 2700,
      passes: [],
      omitted: 0,
    });
    const withX = parseTrailsCell('{"v":1,"m":2,"u":0,"n":[["Invented Path",400]],"p":[[0,0,100,1,400,90,5,0]],"x":4}');
    expect(withX).toMatchObject({ status: 'tagged', matcherVersion: 2, omitted: 4 });
  });

  const golden = () => JSON.parse(GOLDEN);
  const bad: Record<string, string> = {
    'not JSON': '{"v":1',
    'a number': '7',
    null: 'null',
    'an array': '[]',
    'a missing key': '{"v":1,"m":1,"u":0,"n":[]}',
    'an unknown key': JSON.stringify({ ...golden(), z: 1 }),
    'v 2': JSON.stringify({ ...golden(), v: 2 }),
    'm 0': JSON.stringify({ ...golden(), m: 0 }),
    'u negative': JSON.stringify({ ...golden(), u: -3 }),
    'an empty name': JSON.stringify({ ...golden(), n: [['', 1], ...golden().n.slice(1)] }),
    'an unused name': JSON.stringify({ ...golden(), n: [...golden().n, ['Unused Path', 1]] }),
    'an index out of range': JSON.stringify({ ...golden(), p: [[9, 0, 100, 1, 1, null, null, null]] }),
    'a percent over 100': JSON.stringify({
      ...golden(),
      p: [[0, 0, 101, 1, 1, null, null, null], ...golden().p.slice(1)],
    }),
    'd 0': JSON.stringify({ ...golden(), p: [[0, 0, 100, 0, 1, null, null, null], ...golden().p.slice(1)] }),
    'a short pass': JSON.stringify({ ...golden(), p: [[0, 0, 100, 1, 1, null, null], ...golden().p.slice(1)] }),
    'a fractional metres': JSON.stringify({
      ...golden(),
      p: [[0, 0, 100, 1, 1.5, null, null, null], ...golden().p.slice(1)],
    }),
    'x 0': JSON.stringify({ ...golden(), x: 0 }),
  };
  for (const [name, cell] of Object.entries(bad)) {
    it(`reads ${name} as unreadable, without throwing`, () => {
      expect(() => parseTrailsCell(cell)).not.toThrow();
      expect(parseTrailsCell(cell)).toEqual({ status: 'unreadable' });
    });
  }
});

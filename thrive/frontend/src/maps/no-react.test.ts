// #407: Thrive is Preact. The map, its loader and the track fetch import no
// React, and take their geometry from @keel/geo rather than copies of it.

import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(resolve(here, rel), 'utf-8');

const FILES = [
  'google-maps.ts',
  'draw-route.ts',
  '../components/activities/route-section.tsx',
  '../api/thrive-api.ts',
  '../api/demo-track.ts',
];

describe('the route map is Preact, over @keel/geo', () => {
  it.each(FILES)('%s imports no React', (file) => {
    expect(read(file)).not.toMatch(/from\s+['"](react|react-dom|@vis\.gl\/[^'"]*)['"]/);
  });

  it('draws with @keel/geo and does not re-implement its helpers', () => {
    const draw = read('draw-route.ts');
    expect(draw).toMatch(/from '@keel\/geo'/);
    for (const name of ['dropInvalidLatitudes', 'normalizeAntimeridian', 'fitTracksToBounds']) {
      expect(draw).toContain(name);
      expect(draw).not.toMatch(new RegExp(`function\s+${name}\b`));
    }
  });
});

// #706 Parsing: the line parser in the real src/importer.js, one test per
// acceptance bullet, and the rate over every line of the two spike runs.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadApi } from './apps-script-sandbox';

const { sandbox } = loadApi();
const parse = (line: string) => sandbox.parseLine(line);

describe('AC: ranges and hyphenated mixed numbers', () => {
  it('1-1/2 pounds is 1.5 lb, not a range; 1-2 cups, 1 to 2 tbsp and 1/2-3/4 tsp are ranges at the low end', () => {
    expect(parse('1-1/2 pounds beef')).toMatchObject({ qty: 1.5, unit: 'lb', name: 'beef' });
    expect(parse('1-1/2 pounds beef').flags).not.toContain('range');
    expect(parse('1-2 cups stock')).toMatchObject({ qty: 1, unit: 'cup', name: 'stock' });
    expect(parse('1-2 cups stock').flags).toContain('range');
    expect(parse('1 to 2 tbsp honey')).toMatchObject({ qty: 1, unit: 'tbsp', name: 'honey' });
    expect(parse('1 to 2 tbsp honey').flags).toContain('range');
    expect(parse('1/2-3/4 tsp salt')).toMatchObject({ qty: 0.5, unit: 'tsp', name: 'salt' });
    expect(parse('1/2-3/4 tsp salt').flags).toContain('range');
    expect(parse('1–2 cups stock')).toMatchObject({ qty: 1, flags: ['range'] });
  });
});

describe('AC: fractions and normalising', () => {
  it.each([
    ['½ cup milk', 0.5],
    ['1½ cups milk', 1.5],
    ['1 ½ cups milk', 1.5],
    ['1 1/2 cups milk', 1.5],
    ['1cup milk', 1],
    ['1/3 cup milk', 0.333],
  ])('%s is %s cup', (line, qty) => {
    expect(parse(line)).toMatchObject({ qty, unit: 'cup', name: 'milk' });
  });

  it('lbs., Tbsp. and a non-breaking space normalise', () => {
    expect(parse('2 lbs. potatoes')).toMatchObject({ qty: 2, unit: 'lb', name: 'potatoes' });
    expect(parse('1 Tbsp. butter')).toMatchObject({ qty: 1, unit: 'tbsp', name: 'butter' });
    expect(parse('2 cups flour')).toMatchObject({ qty: 2, unit: 'cup', name: 'flour' });
  });
});

describe('AC: package sizes', () => {
  it('1 (15 oz) can black beans is 1 can, 425.2 g, the size in the note', () => {
    const line = parse('1 (15 oz) can black beans');
    expect(line).toMatchObject({ qty: 1, unit: 'can', grams: 425.2, name: 'black beans' });
    expect(line.note).toContain('15 oz');
    expect(line.flags).toContain('package');
  });

  it('2 (14.5-ounce) cans is two cans of 14.5 oz', () => {
    // The issue body says 821.8; 2 × 14.5 × 28.3495 (#703's ounce) is 822.1.
    expect(parse('2 (14.5-ounce) cans diced tomatoes')).toMatchObject({ qty: 2, unit: 'can', grams: 822.1 });
  });

  it('1 can (15 oz) is the same as the first', () => {
    const a = parse('1 (15 oz) can black beans');
    const b = parse('1 can (15 oz) black beans');
    expect([b.qty, b.unit, b.grams, b.name]).toEqual([a.qty, a.unit, a.grams, a.name]);
  });

  it('a (12 fl oz) size sets no grams', () => {
    expect(parse('1 (12 fl oz) can evaporated milk')).toMatchObject({ qty: 1, unit: 'can', grams: null });
  });
});

describe('AC: plus, or and /', () => {
  it('plus keeps the first amount and the rest goes to the note', () => {
    const line = parse('1/2 cup sugar plus 1 tbsp');
    expect(line).toMatchObject({ qty: 0.5, unit: 'cup', name: 'sugar' });
    expect(line.note).toContain('plus 1 tbsp');
  });

  it('or keeps the first ingredient, the alternative in the note', () => {
    const line = parse('3 tbsp tamari or soy sauce');
    expect(line).toMatchObject({ name: 'tamari', flags: ['alternative'] });
    expect(line.note).toContain('or soy sauce');
  });

  it('/ keeps the first ingredient, the alternative in the note', () => {
    const line = parse('1 tbsp cornflour / corn starch');
    expect(line).toMatchObject({ name: 'cornflour', flags: ['alternative'] });
    expect(line.note).toContain('corn starch');
  });

  it('1 cup fresh or frozen peas is named peas: both sides describe', () => {
    const line = parse('1 cup fresh or frozen peas');
    expect(line).toMatchObject({ qty: 1, unit: 'cup', name: 'peas' });
    expect(line.flags).not.toContain('alternative');
  });
});

describe('AC: commas', () => {
  it('onion, finely diced: name onion, note finely diced', () => {
    expect(parse('onion, finely diced')).toMatchObject({ name: 'onion', note: 'finely diced' });
  });

  it('boneless, skinless chicken breasts stays whole', () => {
    expect(parse('4 boneless, skinless chicken breasts')).toMatchObject({
      qty: 4,
      unit: '',
      name: 'boneless, skinless chicken breasts',
      note: '',
    });
  });
});

describe('AC: pints, pinches and counts', () => {
  it('1 pint is 2 cup; 1 pinch salt is 0.0625 tsp; 2 large eggs is unit large; 4 chicken breasts has a blank unit', () => {
    expect(parse('1 pint cream')).toMatchObject({ qty: 2, unit: 'cup', name: 'cream' });
    expect(parse('1 quart stock')).toMatchObject({ qty: 4, unit: 'cup' });
    expect(parse('1 pinch salt')).toMatchObject({ qty: 0.0625, unit: 'tsp', name: 'salt' });
    expect(parse('1 dash bitters')).toMatchObject({ qty: 0.125, unit: 'tsp' });
    expect(parse('2 large eggs')).toMatchObject({ qty: 2, unit: 'large', name: 'eggs' });
    expect(parse('4 chicken breasts')).toMatchObject({ qty: 4, unit: '', name: 'chicken breasts' });
    expect(parse('1 whole chicken')).toMatchObject({ qty: 1, unit: '', name: 'chicken' });
  });
});

describe('AC: to taste and optional', () => {
  it('salt, to taste and parsley, for garnish are optional, to_taste, with no quantity', () => {
    for (const text of ['salt, to taste', 'parsley, for garnish']) {
      const line = parse(text);
      expect(line.optional, text).toBe(true);
      expect(line.flags, text).toContain('to_taste');
      expect(line.qty, text).toBeNull();
    }
    expect(parse('salt, to taste').name).toBe('salt');
  });

  it('a line with a quantity and the word optional is optional', () => {
    expect(parse('1/2 tsp sesame oil (optional)')).toMatchObject({ qty: 0.5, optional: true, name: 'sesame oil' });
  });

  it('a line with no quantity is flagged no_qty', () => {
    expect(parse('Olive oil')).toMatchObject({ qty: null, flags: ['no_qty'], optional: false });
  });

  it('salt or pepper with no quantity is to taste too', () => {
    for (const text of ['Kosher salt', 'Freshly ground black pepper', 'salt and pepper']) {
      expect(parse(text), text).toMatchObject({ qty: null, optional: true, flags: ['no_qty', 'to_taste'] });
    }
    expect(parse('1 tsp kosher salt')).toMatchObject({ qty: 1, optional: false, flags: [] });
  });
});

describe('AC: the spike runs', () => {
  const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'import', 'spike-lines.txt');
  const runs: Record<string, string[]> = {};
  let current = '';
  for (const row of readFileSync(file, 'utf8').split('\n')) {
    if (row.startsWith('# ')) runs[(current = row.slice(2))] = [];
    else if (row) runs[current].push(row);
  }

  it('the fixture holds the 147 and 95 lines of run-first and run-heldout', () => {
    expect(runs['run-first']).toHaveLength(147);
    expect(runs['run-heldout']).toHaveLength(95);
  });

  it.each(['run-first', 'run-heldout'])('%s: at least 94%% parse a quantity or are to_taste, and no name is empty', (run) => {
    const lines = runs[run].map(parse);
    const good = lines.filter((l: any) => l.qty !== null || l.flags.includes('to_taste')).length;
    expect(good / lines.length).toBeGreaterThanOrEqual(0.94);
    for (const l of lines) expect(l.name.trim(), l.text).not.toBe('');
  });
});

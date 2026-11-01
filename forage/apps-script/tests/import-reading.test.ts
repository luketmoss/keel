// #706 Reading: JSON-LD from saved fixtures, a URL through the fake
// UrlFetchApp, the plain-text format, and a recipe a caller structured.
//
// The fixtures are trimmed JSON-LD from seven of the spike's 18 pages: every
// ingredient line as the page sent it, and steps cut to their first words
// (they test structure, not prose). Two shapes no page in the set had were
// made from real ones: King Arthur's @type is an array here, and Skinnytaste's
// totalTime was removed so time comes from prepTime + cookTime.

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadApi, type FetchReply } from './apps-script-sandbox';

const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'import');

interface Fixture {
  url: string;
  jsonld: unknown;
}

function fixture(name: string): Fixture {
  return JSON.parse(readFileSync(path.join(FIXTURES, `${name}.json`), 'utf8'));
}

/** The Recipe node's own ingredient lines, for comparing with what came back. */
function ingredientsOf(data: any): string[] {
  const nodes = Array.isArray(data) ? data : data['@graph'] ?? [data];
  const recipe = nodes.find((n: any) => n['@type'] === 'Recipe' || (Array.isArray(n['@type']) && n['@type'].includes('Recipe')));
  return recipe.recipeIngredient;
}

const EXPECTED: Record<string, { name: string; servings: number; minutes: number; steps: number; sections: string[] }> = {
  'pinchofyum-cookies': { name: 'The Best Soft Chocolate Chip Cookies', servings: 12, minutes: 20, steps: 5, sections: [''] },
  'recipetineats-stir-fry': {
    name: 'Chop Suey - Chicken Stir Fry',
    servings: 2,
    minutes: 14,
    steps: 9,
    sections: ['"Velvet" Chicken (optional, Note 1)', 'Prep Ingredients:', 'Stir Fry:'],
  },
  'foodnetwork-mac-cheese': { name: 'Baked Macaroni and Cheese', servings: 6, minutes: 65, steps: 6, sections: [''] },
  'tasteofhome-beef-stew': { name: 'Beef Stew', servings: 6, minutes: 150, steps: 6, sections: [''] },
  'kingarthur-brownies': { name: 'Fudge Brownies', servings: 24, minutes: 40, steps: 13, sections: [''] },
  'skinnytaste-taco-wraps': { name: 'Turkey Taco Lettuce Wraps', servings: 4, minutes: 45, steps: 5, sections: [''] },
  'bonappetit-cookies': { name: 'BA’s Best Chocolate Chip Cookies', servings: 16, minutes: 40, steps: 4, sections: [''] },
};

describe('AC: importRecipe with jsonld reads every fixture', () => {
  it('the fixtures cover @graph, an array @type, HowToSection, a yield array, prep + cook, and entities', () => {
    const files = readdirSync(FIXTURES).filter((f) => f.endsWith('.json'));
    expect(files.length).toBeGreaterThanOrEqual(6);
    const raw = (n: string) => readFileSync(path.join(FIXTURES, `${n}.json`), 'utf8');
    expect(raw('pinchofyum-cookies')).toContain('"@graph"');
    expect(raw('kingarthur-brownies')).toMatch(/"@type": \[\s*"Recipe"/);
    expect(raw('recipetineats-stir-fry')).toContain('HowToSection');
    expect(raw('pinchofyum-cookies')).toMatch(/"recipeYield": \[/);
    expect(raw('skinnytaste-taco-wraps')).not.toContain('totalTime');
    expect(raw('bonappetit-cookies')).toMatch(/&#8217;|&frac14;/);
  });

  for (const [name, want] of Object.entries(EXPECTED)) {
    it(`${name}: name, servings, minutes, every line verbatim, every step with its section`, () => {
      const fx = fixture(name);
      const api = loadApi();
      const preview = api.ok('importRecipe', { payload: { jsonld: [JSON.stringify(fx.jsonld)], url: fx.url } });
      expect(preview.recipe).toMatchObject({
        name: want.name,
        servings: want.servings,
        total_min: want.minutes,
        source_url: fx.url,
      });
      const lines = ingredientsOf(fx.jsonld).map((l) => api.sandbox.decodeText(l));
      expect(preview.lines.map((l: { text: string }) => l.text)).toEqual(lines);
      expect(preview.steps).toHaveLength(want.steps);
      expect([...new Set(preview.steps.map((s: { section: string }) => s.section))]).toEqual(want.sections);
      expect(preview.steps.every((s: { text: string }) => s.text.length > 0)).toBe(true);
      expect(preview.needs).toEqual([]);
    });
  }

  it('entities and tags are decoded out of the name, lines and steps', () => {
    const fx = fixture('bonappetit-cookies');
    const preview = loadApi().ok('importRecipe', { payload: { jsonld: JSON.stringify(fx.jsonld) } });
    expect(preview.recipe.name).toBe('BA’s Best Chocolate Chip Cookies');
    expect(preview.lines[1].text).toBe('1¼ tsp. (4 g) Diamond Crystal or ¾ tsp. (4 g) Morton kosher salt');
    expect(preview.lines[9].text).toContain('60%–70% cacao');
    expect(preview.steps[1].text).toBe('Cook ½ cup (1 stick; 113 g) unsalted …');
  });

  it('source_site is the host without www.', () => {
    const fx = fixture('tasteofhome-beef-stew');
    const preview = loadApi().ok('importRecipe', { payload: { jsonld: [JSON.stringify(fx.jsonld)], url: fx.url } });
    expect(preview.recipe.source_site).toBe('tasteofhome.com');
  });

  it('jsonld with no Recipe node is no_recipe', () => {
    const res = loadApi().call('importRecipe', { payload: { jsonld: ['{"@type":"WebSite","name":"x"}'] } });
    expect(res).toMatchObject({ success: false, code: 'no_recipe' });
  });
});

/** A page with the fixture's JSON-LD among other scripts. */
function page(jsonld: unknown): string {
  return [
    '<!doctype html><html><head><title>x</title>',
    '<script type="application/ld+json">{"@type":"WebSite","name":"Site"}</script>',
    `<script type="application/ld+json">${JSON.stringify(jsonld)}</script>`,
    '</head><body><p>Recipe</p></body></html>',
  ].join('\n');
}

describe('AC: importRecipe with url, against the fake UrlFetchApp', () => {
  const reading = (reply: (url: string) => FetchReply) => loadApi({ pages: reply });

  it('a page with a recipe previews, fetched with a browser-like User-Agent and redirects followed', () => {
    const fx = fixture('tasteofhome-beef-stew');
    let options: Record<string, any> = {};
    const api = loadApi({
      pages: (_url, opts) => {
        options = opts;
        return { status: 200, body: page(fx.jsonld) };
      },
    });
    const preview = api.ok('importRecipe', { payload: { url: fx.url } });
    expect(preview.recipe).toMatchObject({ name: 'Beef Stew', servings: 6, source_url: fx.url });
    expect(preview.lines).toHaveLength(19);
    expect(options.followRedirects).toBe(true);
    expect(options.muteHttpExceptions).toBe(true);
    expect(options.headers['User-Agent']).toMatch(/^Mozilla\/5\.0/);
  });

  it.each([
    [402, 'blocked'],
    [403, 'blocked'],
    [500, 'unreachable'],
  ])('HTTP %i is %s, with no stack trace', (status, code) => {
    const res = reading(() => ({ status, body: 'nope' })).call('importRecipe', { payload: { url: 'https://example.com/r' } });
    expect(res.success).toBe(false);
    expect(res.code).toBe(code);
    expect(res.error).not.toMatch(/\bat\b.*\.js|Error:|nope/);
  });

  it('a thrown fetch is unreachable, and its message is not passed on', () => {
    const res = reading(() => ({ throws: 'Address unavailable: https://example.com/r secret-detail' })).call(
      'importRecipe',
      { payload: { url: 'https://example.com/r' } },
    );
    expect(res).toMatchObject({ success: false, code: 'unreachable' });
    expect(res.error).not.toContain('secret-detail');
  });

  it('a page without a Recipe node is no_recipe', () => {
    const res = reading(() => ({ status: 200, body: '<html><script type="application/ld+json">{"@type":"WebSite"}</script></html>' })).call(
      'importRecipe',
      { payload: { url: 'https://example.com/r' } },
    );
    expect(res).toMatchObject({ success: false, code: 'no_recipe' });
  });

  it.each(['ftp://x', 'http://localhost/a', 'http://10.0.0.1/a', 'http://[::1]/a', 'http://user@example.com/a', 'nonsense'])(
    '%s is bad_url, and nothing is fetched',
    (url) => {
      const api = reading(() => {
        throw new Error('must not fetch');
      });
      const res = api.call('importRecipe', { payload: { url } });
      expect(res).toMatchObject({ success: false, code: 'bad_url' });
      expect(api.fetches).toEqual([]);
    },
  );
});

const TEXT = `Beef Stew
Serves 6
Time: 2 hours
Source: https://example.com/beef-stew

Ingredients
2 lb beef chuck, cubed
For the gravy:
2 tbsp flour

Steps
1. Brown the beef.
Make the gravy:
2. Whisk in the flour.
`;

describe('AC: the plain-text format round-trips', () => {
  it('name, servings 6, 120 minutes, the source, two ingredient sections, numbered steps with their section', () => {
    const preview = loadApi().ok('importRecipe', { payload: { text: TEXT } });
    expect(preview.recipe).toMatchObject({
      name: 'Beef Stew',
      servings: 6,
      total_min: 120,
      source_url: 'https://example.com/beef-stew',
      source_site: 'example.com',
    });
    expect(preview.lines.map((l: any) => [l.section, l.text])).toEqual([
      ['', '2 lb beef chuck, cubed'],
      ['For the gravy', '2 tbsp flour'],
    ]);
    expect(preview.steps).toEqual([
      { position: 1, section: '', name: '', text: 'Brown the beef.' },
      { position: 2, section: 'Make the gravy', name: '', text: 'Whisk in the flour.' },
    ]);
  });

  it('times read as 45 min and 1h 30m; headings may be # or end in :', () => {
    const preview = loadApi().ok('importRecipe', {
      payload: { text: '# Soup\nMakes 4\nTotal time: 1h 30m\n\n## Ingredients:\n1 onion\n\n## Method\nChop.\nBoil.\n' },
    });
    expect(preview.recipe).toMatchObject({ name: 'Soup', servings: 4, total_min: 90 });
    expect(preview.steps.map((s: { text: string }) => s.text)).toEqual(['Chop.', 'Boil.']);
    expect(loadApi().ok('importRecipe', { payload: { text: 'X\nTime: 45 min\nIngredients\n1 egg' } }).recipe.total_min).toBe(45);
  });

  it('steps split on blank lines when not numbered', () => {
    const preview = loadApi().ok('importRecipe', {
      payload: { text: 'Toast\nServes 1\nIngredients\n1 slice bread\nDirections\nPut bread in.\nWait.\n\nEat it.\n' },
    });
    expect(preview.steps.map((s: { text: string }) => s.text)).toEqual(['Put bread in. Wait.', 'Eat it.']);
  });

  it('a Source that is not a link is kept as a note', () => {
    const preview = loadApi().ok('importRecipe', { payload: { text: 'Toast\nSource: Grandma\nIngredients\n1 slice bread' } });
    expect(preview.recipe).toMatchObject({ source_url: '', notes: 'Source: Grandma' });
  });

  it('a file with no Ingredients heading is no_recipe', () => {
    const res = loadApi().call('importRecipe', { payload: { text: 'Beef Stew\nServes 6\n2 lb beef\nBrown it.' } });
    expect(res).toMatchObject({ success: false, code: 'no_recipe' });
  });
});

describe('AC: a recipe input of strings and of structured lines', () => {
  it('string lines are parsed; structured lines are taken as given', () => {
    const api = loadApi();
    const food = api.ok('upsertFood', { payload: { id: 'fd_beef', name: 'Beef chuck' } });
    const preview = api.ok('importRecipe', {
      payload: {
        recipe: {
          name: 'Stew',
          servings: 4,
          lines: ['2 lb beef chuck, cubed', { text: '1 onion', qty: 1, unit: '', food_id: food.id, section: 'Veg' }],
          steps: ['Brown the beef.', { text: 'Add the onion.', section: 'Veg', name: 'Onion' }],
        },
      },
    });
    expect(preview.lines[0]).toMatchObject({ qty: 2, unit: 'lb', name: 'beef chuck', note: 'cubed', food_id: 'fd_beef', match: 'exact' });
    expect(preview.lines[1]).toMatchObject({ text: '1 onion', qty: 1, section: 'Veg', food_id: 'fd_beef', match: null });
    expect(preview.steps).toEqual([
      { position: 1, section: '', name: '', text: 'Brown the beef.' },
      { position: 2, section: 'Veg', name: 'Onion', text: 'Add the onion.' },
    ]);
  });

  it('a structured line naming a food that does not exist is refused, and named', () => {
    const res = loadApi().call('importRecipe', {
      payload: { recipe: { name: 'X', servings: 1, lines: [{ text: '1 egg', food_id: 'fd_missing' }] } },
    });
    expect(res.success).toBe(false);
    expect(res.error).toContain('fd_missing');
  });

  it('exactly one input', () => {
    const api = loadApi();
    expect(api.call('importRecipe', { payload: {} }).error).toMatch(/exactly one/);
    expect(api.call('importRecipe', { payload: { text: TEXT, recipe: { name: 'x' } } }).error).toMatch(/exactly one/);
  });
});

// #711: walkthrough format v1, its validator (walkthroughs.js) and the recipe
// reads that check a stored walkthrough against the current lines. The
// fixture is the Beef Stew pair the format was tried on, copied from the
// owner's scratchpad (forage-rebuild/walkthrough/) into tests/fixtures/.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadApi, type Api } from './apps-script-sandbox';
import { STEW_FOODS } from './fixtures/beef-stew';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const read = (name: string) => JSON.parse(readFileSync(path.join(FIXTURES, name), 'utf8'));

interface FixtureLine {
  id: string;
  text: string;
  q: number | null;
  u: string;
  food: string;
  optional?: boolean;
}
const RECIPE_FILE = read('beef-stew.recipe.json') as {
  id: string;
  name: string;
  servings: number;
  lines: FixtureLine[];
  steps: { name: string; text: string }[];
};
const WALKTHROUGH = read('beef-stew.walkthrough.json');

/** The fixture recipe as `upsertRecipe` takes it. */
const RECIPE = {
  id: RECIPE_FILE.id,
  name: RECIPE_FILE.name,
  servings: RECIPE_FILE.servings,
  lines: RECIPE_FILE.lines.map((l) => ({
    line_id: l.id,
    text: l.text,
    qty: l.q,
    unit: l.u,
    food_id: l.food,
    optional: !!l.optional,
  })),
  steps: RECIPE_FILE.steps,
};

/** A deep copy of the fixture walkthrough to break. */
const copy = (): any => JSON.parse(JSON.stringify(WALKTHROUGH));

function stew(): Api {
  const api = loadApi();
  for (const food of STEW_FOODS) api.ok('upsertFood', { payload: food });
  api.ok('upsertRecipe', { payload: RECIPE });
  return api;
}

const set = (api: Api, walkthrough: unknown, recipeId = 'stew') =>
  api.call('setWalkthrough', { payload: { recipe_id: recipeId, walkthrough } });

/** The validator alone, over the fixture's lines. */
function check(doc: unknown) {
  const api = stew();
  const lines = api.ok('getRecipe', { id: 'stew' }).lines;
  return api.sandbox.validateWalkthrough('stew', lines, doc);
}

// The four mistakes of the issue's table, each on its own copy.
function sharesHalf(w: any) {
  const thicken = w.prep.find((p: any) => p.id === 'thicken');
  thicken.uses = thicken.uses.filter((u: any) => u.line !== 'L2');
}
function bloomUsesVeg(w: any) {
  w.cook.find((c: any) => c.id === 'bloom').uses.push({ prep: 'veg' });
}
function thickenNotListed(w: any) {
  delete w.cook.find((c: any) => c.id === 'veg-in').meanwhile;
}
function beefTwice(w: any) {
  w.cook.find((c: any) => c.id === 'finish').uses.push({ prep: 'beef' });
}

const SHARES = 'line L2 (salt): shares add up to 0.5, not 1 (used in prep beef 0.5)';
const EARLY = 'cook bloom "Cook the flavor base": uses prep veg, which is only made during simmer, a later step';
const NOT_LISTED = `prep thicken "Mix the thickener": its wait step veg-in doesn't list it under meanwhile`;
const TWICE = 'cook finish "Thicken and finish": prep beef was already used in cook brown';

describe('the Beef Stew fixture', () => {
  it('passes setWalkthrough, and getRecipe returns it with walkthrough_check.ok', () => {
    const api = stew();
    const saved = set(api, WALKTHROUGH);
    expect(saved.success).toBe(true);
    expect(saved.data).toMatchObject({
      recipe_id: 'stew',
      recipe_name: 'Beef Stew',
      format: 1,
      warnings: [],
      summary: { prep_groups: 6, tasks: 15, cook_steps: 7, active: 19, waited: 120 },
    });
    const recipe = api.ok('getRecipe', { id: 'stew' });
    expect(recipe.walkthrough).toEqual(WALKTHROUGH);
    expect(recipe.walkthrough_check).toEqual({ ok: true, problems: [], warnings: [] });
    expect(recipe).toMatchObject({ has_walkthrough: true, walkthrough_ok: true });
    expect(api.ok('getRecipes')[0]).toMatchObject({ id: 'stew', has_walkthrough: true, walkthrough_ok: true });
  });

  it('a recipe with no walkthrough reads null, and walkthrough_ok false', () => {
    const api = stew();
    expect(api.ok('getRecipe', { id: 'stew' })).toMatchObject({
      walkthrough: null,
      walkthrough_check: null,
      walkthrough_ok: false,
    });
    expect(api.ok('getRecipes')[0].walkthrough_ok).toBe(false);
  });

  it('also takes the walkthrough as JSON text', () => {
    const api = stew();
    expect(set(api, JSON.stringify(WALKTHROUGH)).success).toBe(true);
  });
});

describe('the four mistakes are refused with every problem, and nothing is stored', () => {
  const cases: [string, (w: any) => void, string][] = [
    ['shares summing to 0.5', sharesHalf, SHARES],
    ['bloom using veg, made later', bloomUsesVeg, EARLY],
    ['thicken missing from meanwhile', thickenNotListed, NOT_LISTED],
    ['beef used by two steps', beefTwice, TWICE],
  ];
  for (const [name, breakIt, message] of cases) {
    it(name, () => {
      const api = stew();
      const w = copy();
      breakIt(w);
      const res = set(api, w);
      expect(res).toMatchObject({ success: false, code: 'invalid_walkthrough' });
      expect(res.problems).toContain(message);
      expect(res.error).toContain(message);
      expect(api.rows('Walkthroughs')).toEqual([]);
    });
  }

  it('the early use also reports veg used twice, since veg-in uses it after bloom', () => {
    const w = copy();
    bloomUsesVeg(w);
    expect(check(w).problems).toEqual([EARLY, 'cook veg-in "Add the vegetables": prep veg was already used in cook bloom']);
  });

  it('a copy with all four reports all four', () => {
    const w = copy();
    [sharesHalf, bloomUsesVeg, thickenNotListed, beefTwice].forEach((f) => f(w));
    const res = set(stew(), w);
    expect(res.success).toBe(false);
    for (const m of [SHARES, EARLY, NOT_LISTED, TWICE]) expect(res.problems).toContain(m);
  });

  it('an existing walkthrough is left as it was when a new one is refused', () => {
    const api = stew();
    set(api, WALKTHROUGH);
    const w = copy();
    beefTwice(w);
    expect(set(api, w).success).toBe(false);
    expect(api.ok('getRecipe', { id: 'stew' }).walkthrough).toEqual(WALKTHROUGH);
  });
});

describe('the structural refusals each name the part to fix', () => {
  const cases: [string, (w: any) => void, string][] = [
    ['wrong format', (w) => (w.format = 2), 'format: expected 1, got 2'],
    ['another recipe', (w) => (w.recipe = 'rc_other'), 'recipe: this walkthrough is for "rc_other", not "stew"'],
    ['a duplicate id', (w) => (w.cook[1].id = 'beef'), 'cook beef: id is used twice'],
    ['a group with no id', (w) => delete w.prep[2].id, 'prep: a group has no id'],
    ['an unknown line', (w) => (w.prep[0].uses[0].line = 'L99'), 'prep beef: no ingredient line L99'],
    ['an unknown prep id', (w) => (w.cook[0].uses[0].prep = 'beff'), 'cook brown: no prep group "beff"'],
    ['a share out of range', (w) => (w.prep[0].uses[1].share = 1.5), 'prep beef: share of L2 must be above 0 and at most 1'],
    [
      'timer and wait',
      (w) => (w.cook[3].timer = { min: 5, label: 'x' }),
      'cook simmer: a step has a timer or a wait, not both',
    ],
    ['minutes not above 0', (w) => (w.cook[0].timer.min = 0), 'cook brown: timer minutes must be above 0'],
    ['a prep group with no tasks', (w) => (w.prep[0].tasks = []), 'prep beef: needs at least one task'],
    ['a cook step with no do', (w) => delete w.cook[0].do, 'cook brown: needs "do" text'],
    [
      'a group made but never used',
      (w) => (w.cook[2].uses = [{ line: 'L9' }]),
      'prep wine "Measure the wine": made but never used in a cook step',
    ],
    [
      'a line never used',
      (w) => (w.cook[0].uses = [{ prep: 'beef' }]),
      'line L5 (canola oil): never used in any prep group or cook step',
    ],
    [
      'meanwhile on a step without a wait',
      (w) => (w.cook[0].meanwhile = ['veg']),
      'cook brown: meanwhile is only for steps with a wait',
    ],
    [
      'meanwhile listing a group with another when',
      (w) => w.cook[3].meanwhile.push('wine'),
      'cook simmer: meanwhile lists wine, whose when is "start"',
    ],
    [
      'when naming a step without a wait',
      (w) => (w.prep[4].when = 'brown'),
      'prep veg: when must be "start" or the id of a cook step with a wait, not "brown"',
    ],
    ['a prep group using a group', (w) => w.prep[1].uses.push({ prep: 'beef' }), 'prep base: prep groups use ingredient lines, not other groups'],
  ];
  for (const [name, breakIt, message] of cases) {
    it(name, () => {
      const w = copy();
      breakIt(w);
      const v = check(w);
      expect(v.ok).toBe(false);
      expect(v.problems).toContain(message);
    });
  }

  it('shares over 1 list every use', () => {
    const w = copy();
    w.cook[0].uses.push({ line: 'L2' });
    expect(check(w).problems).toContain('line L2 (salt): shares add up to 2, not 1 (used in prep beef 0.5, prep thicken 0.5, cook brown 1)');
  });

  it('shares of a third pass within 0.02', () => {
    expect(check(copy()).ok).toBe(true); // L3 is 0.6667 + 0.3333, L11 the same
  });

  it('a field the format does not define is refused by its path', () => {
    const w = copy();
    w.cook[0].lookfor = w.cook[0].lookFor;
    w.prep[0].uses[1].shares = 0.5;
    w.cook[1].timer.minutes = 2;
    w.steps = [];
    const v = check(w);
    expect(v.problems).toEqual(
      expect.arrayContaining([
        'cook brown: unknown field "lookfor"',
        'prep beef.uses[1]: unknown field "shares"',
        'cook bloom.timer: unknown field "minutes"',
        'walkthrough: unknown field "steps"',
      ]),
    );
  });

  it('a wrong type names the field', () => {
    const w = copy();
    w.cook[0].do = 5;
    w.prep[0].tasks[0] = 7;
    const v = check(w);
    expect(v.problems).toEqual(expect.arrayContaining(['cook brown: needs "do" text', 'prep beef.tasks[0]: must be text']));
  });

  it('lists at most 20 problems, then "and N more"', () => {
    const w = copy();
    for (const p of w.prep) p.tasks = [];
    for (const c of w.cook) Object.assign(c, { oops: 1, oops2: 2 });
    w.format = 2;
    const v = check(w);
    expect(v.problems).toHaveLength(21);
    expect(v.problems[20]).toMatch(/^and \d+ more$/);
  });

  it('something that is not an object is refused', () => {
    expect(check([]).problems).toEqual(['walkthrough: must be a JSON object']);
    expect(set(stew(), 'not json').error).toBe('walkthrough is not valid JSON');
  });

  it('a recipe that does not exist is refused by name', () => {
    expect(set(stew(), { ...copy(), recipe: 'rc_none' }, 'rc_none')).toMatchObject({
      success: false,
      code: 'not_found',
      error: 'There is no recipe rc_none',
    });
  });
});

describe('warnings save anyway', () => {
  it('a quantity in free text is a warning on a saved walkthrough', () => {
    const api = stew();
    const w = copy();
    w.cook[0].do = 'Heat 2 tbsp of the oil, then brown the beef.';
    w.prep[1].tasks[0] = 'Mince ½ cup of garlic';
    const res = set(api, w);
    expect(res.success).toBe(true);
    expect(res.data.warnings).toEqual([
      'prep base: task 1 seems to give an amount ("½ cup"); amounts come from the recipe lines and would not scale',
      'cook brown: "do" seems to give an amount ("2 tbsp"); amounts come from the recipe lines and would not scale',
    ]);
  });

  it('"90 minutes", "1-inch" and "medium heat" are not amounts', () => {
    const w = copy();
    w.cook[0].do = 'Simmer 90 minutes over medium heat, in 1-inch cubes, in 2 small bowls.';
    expect(check(w).warnings).toEqual([]);
  });

  it('other amounts are: 1/2 cup, 1½ cups, 3 cloves, 100 g, 250 ml, 2 teaspoons', () => {
    for (const t of ['add 1/2 cup', 'add 1½ cups', 'add 3 cloves', 'add 100 g', 'add 250 ml', 'add 2 teaspoons', 'add 1 lb']) {
      const w = copy();
      w.cook[0].do = t;
      expect(check(w).warnings, t).toHaveLength(1);
    }
  });

  it('no step with a lookFor is a warning', () => {
    const w = copy();
    for (const c of w.cook) delete c.lookFor;
    expect(check(w)).toMatchObject({ ok: true, warnings: ['no step says what to look for'] });
  });
});

describe('a recipe edit makes a walkthrough stale, never refused', () => {
  it('removing a cited line saves the edit and names the line', () => {
    const api = stew();
    set(api, WALKTHROUGH);
    const edited = api.call('upsertRecipe', {
      payload: { id: 'stew', lines: RECIPE.lines.filter((l) => l.line_id !== 'L5') },
    });
    expect(edited.success).toBe(true);
    const recipe = api.ok('getRecipe', { id: 'stew' });
    expect(recipe.walkthrough_check.ok).toBe(false);
    expect(recipe.walkthrough_check.problems).toEqual(['cook brown: no ingredient line L5']);
    expect(recipe.walkthrough_ok).toBe(false);
    expect(api.ok('getRecipes')[0].walkthrough_ok).toBe(false);
  });
});

describe('undo', () => {
  it('setWalkthrough and deleteWalkthrough are logged and undone', () => {
    const api = stew();
    api.ok('setWalkthrough', { payload: { recipe_id: 'stew', walkthrough: WALKTHROUGH, call_id: 'set-1' } });
    api.ok('undoCall', { payload: { call_id: 'set-1', confirm: true } });
    expect(api.rows('Walkthroughs')).toEqual([]);

    api.ok('setWalkthrough', { payload: { recipe_id: 'stew', walkthrough: WALKTHROUGH } });
    api.ok('deleteWalkthrough', { payload: { recipe_id: 'stew', call_id: 'del-1' } });
    expect(api.rows('Walkthroughs')).toEqual([]);
    api.ok('undoCall', { payload: { call_id: 'del-1', confirm: true } });
    expect(api.ok('getRecipe', { id: 'stew' }).walkthrough).toEqual(WALKTHROUGH);
  });
});

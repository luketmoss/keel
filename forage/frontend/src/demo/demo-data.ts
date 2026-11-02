// The demo layer's sample data: the user, and the one recipe every demo
// import answers with (#706), an original written for Forage.
import type { AuthUser } from '@keel/auth';
import type { Food, ImportLine, ImportPreview, Slot, StarterFood } from '../api/types';

export const DEMO_USER: AuthUser = {
  name: 'Demo User',
  email: 'demo@forage.local',
  picture: '',
};

function line(
  n: number,
  text: string,
  qty: number | null,
  unit: string,
  name: string,
  extra: Partial<ImportLine> = {},
): ImportLine {
  return {
    line_id: `L${n}`,
    section: '',
    text,
    qty,
    unit,
    name,
    note: '',
    grams: null,
    optional: false,
    flags: qty === null ? ['no_qty'] : [],
    food_id: '',
    match: null,
    suggestions: [],
    ...extra,
  };
}

/** What a demo import reads, whichever route it came by. */
export const DEMO_IMPORT: ImportPreview = {
  recipe: {
    name: 'Weeknight Lentil Soup',
    source_url: 'https://example.com/weeknight-lentil-soup',
    source_site: 'example.com',
    servings: 4,
    total_min: 45,
    notes: '',
  },
  lines: [
    line(1, '2 tbsp olive oil', 2, 'tbsp', 'olive oil'),
    line(2, '1 large onion, diced', 1, 'large', 'onion', { note: 'diced' }),
    line(3, '2 carrots, sliced', 2, '', 'carrots', { note: 'sliced' }),
    line(4, '3 cloves garlic, minced', 3, 'clove', 'garlic', { note: 'minced' }),
    line(5, '1 cup red lentils, rinsed', 1, 'cup', 'red lentils', { note: 'rinsed' }),
    line(6, '1 (15 oz) can diced tomatoes', 1, 'can', 'diced tomatoes', {
      note: '15 oz',
      grams: 425.2,
      flags: ['package'],
    }),
    line(7, '4-5 cups vegetable broth', 4, 'cup', 'vegetable broth', { flags: ['range'] }),
    line(8, 'salt, to taste', null, '', 'salt', { note: 'to taste', optional: true, flags: ['to_taste', 'no_qty'] }),
    line(9, 'Lemon wedges, for serving', null, '', 'Lemon wedges', {
      section: 'To serve',
      note: 'for serving',
      optional: true,
      flags: ['to_taste', 'no_qty'],
    }),
  ],
  steps: [
    { position: 1, section: '', name: '', text: 'Warm the oil in a large pot and soften the onion and carrots.' },
    {
      position: 2,
      section: '',
      name: '',
      text: 'Stir in the garlic for a minute, then the lentils, tomatoes and broth.',
    },
    { position: 3, section: '', name: '', text: 'Simmer until the lentils fall apart, about 25 minutes. Season.' },
    { position: 4, section: 'To serve', name: '', text: 'Ladle into bowls with a lemon wedge each.' },
  ],
  nutrition: {
    per_serving: { kcal: null, protein_g: null, carbs_g: null, fat_g: null },
    missing: [],
    partial: true,
  },
  duplicate_of: null,
  needs: [],
};

// ---- #707: the demo library, starter sample and barcode product

const NOW = '2026-11-01T12:00:00.000Z';

function food(id: string, name: string, extra: Partial<Food>): Food {
  return {
    id,
    name,
    kind: 'ingredient',
    brand: '',
    category: '',
    kcal_100g: null,
    protein_100g: null,
    carbs_100g: null,
    fat_100g: null,
    servings_json: null,
    source: 'manual',
    created: NOW,
    updated: NOW,
    usual_store: '',
    usually_have: false,
    regular: false,
    never_shop: false,
    packs_json: null,
    buy_unit: '',
    buy_unit_plural: '',
    buy_unit_g: null,
    source_ref: '',
    verified: false,
    barcode: '',
    ...extra,
  };
}

/** The Foods list's six sample foods. Made-up brands, never real ones. */
export const DEMO_FOODS: Food[] = [
  food('fd_demo_flour', 'Flour, all-purpose', {
    kcal_100g: 364,
    protein_100g: 10.3,
    carbs_100g: 76.3,
    fat_100g: 0.98,
    servings_json: [{ name: 'cup', g: 125 }],
    source: 'usda',
    source_ref: '168894',
    usually_have: true,
  }),
  food('fd_demo_onion', 'Onion', {
    kcal_100g: 40,
    protein_100g: 1.1,
    carbs_100g: 9.34,
    fat_100g: 0.1,
    servings_json: [
      { name: 'medium', g: 110 },
      { name: 'cup', g: 160 },
    ],
    buy_unit: 'onion',
    buy_unit_plural: 'onions',
    buy_unit_g: 110,
    usual_store: 'ks',
    source: 'usda',
    source_ref: '170000',
  }),
  food('fd_demo_butter', 'Butter, unsalted', {
    kcal_100g: 717,
    protein_100g: 0.85,
    carbs_100g: 0.06,
    fat_100g: 81.1,
    servings_json: [{ name: 'tbsp', g: 14.2 }],
    usual_store: 'costco',
    source: 'usda',
    source_ref: '173430',
  }),
  food('fd_demo_bar', 'Oat and Honey bar', {
    kind: 'packaged',
    brand: 'Meadowfield',
    kcal_100g: 450,
    protein_100g: 10,
    carbs_100g: 62.5,
    fat_100g: 17.5,
    servings_json: [{ name: 'bar', g: 40 }],
    source: 'label',
    regular: true,
  }),
  food('fd_demo_yogurt', 'Plain yogurt', {
    kind: 'packaged',
    brand: 'Hilltop Dairy',
    kcal_100g: 61,
    protein_100g: 3.5,
    carbs_100g: 4.7,
    fat_100g: 3.3,
    servings_json: [{ name: 'cup', g: 245 }],
    source: 'off',
    source_ref: '0012345678905',
    barcode: '0012345678905',
  }),
  food('fd_demo_herbs', 'Herbes de Provence', {}),
];

function starter(
  id: string,
  name: string,
  n: [number, number, number, number],
  servings: Food['servings_json'],
): Omit<StarterFood, 'in_library' | 'can_fill'> {
  return {
    id,
    name,
    category: 'Pantry',
    fdc: 0,
    kcal_100g: n[0],
    protein_100g: n[1],
    carbs_100g: n[2],
    fat_100g: n[3],
    servings: servings ?? [],
    aliases: [name.split(',')[0].toLowerCase()],
  };
}

/** A sample of 8 from the starter list (the real list has 77, in apps-script/src/starter.js). */
export const DEMO_STARTERS = [
  starter('flour-all-purpose', 'Flour, all-purpose', [364, 10.3, 76.3, 0.98], [{ name: 'cup', g: 125 }]),
  starter('sugar-granulated', 'Sugar, granulated', [387, 0, 100, 0], [{ name: 'cup', g: 200 }]),
  starter('garlic', 'Garlic', [149, 6.36, 33.1, 0.5], [{ name: 'clove', g: 3 }]),
  starter('olive-oil', 'Olive oil', [884, 0, 0, 100], [{ name: 'tbsp', g: 13.5 }]),
  starter('egg', 'Egg', [143, 12.6, 0.72, 9.51], [{ name: 'large', g: 50 }]),
  starter('rice-white', 'Rice, white, long-grain', [365, 7.13, 80, 0.66], [{ name: 'cup', g: 185 }]),
  starter('carrot', 'Carrot', [41, 0.93, 9.58, 0.24], [{ name: 'medium', g: 61 }]),
  starter('salt', 'Salt', [0, 0, 0, 0], [{ name: 'tsp', g: 6 }]),
];

/** The one made-up product every demo barcode but 0000000000000 finds, with calories that don't match its macros. */
export const DEMO_PRODUCT: Food = food('', 'Crunchy Cocoa Squares', {
  kind: 'packaged',
  brand: 'Brightfield',
  kcal_100g: 300,
  protein_100g: 8,
  carbs_100g: 70,
  fat_100g: 12,
  servings_json: [{ name: 'cup', g: 30 }],
  source: 'off',
});

// ---- #708: sample recipes with ratings and cooks

type DemoLine = {
  text: string;
  food_id?: string;
  qty?: number | null;
  unit?: string;
  section?: string;
  optional?: boolean;
};
type DemoStep = { text: string; name?: string; section?: string };

export interface DemoRecipe {
  id: string;
  name: string;
  source_site: string;
  servings: number;
  total_min: number | null;
  has_walkthrough: boolean;
  /** Days before today it was added: the larger, the older. */
  added_days_ago: number;
  lines: DemoLine[];
  steps: DemoStep[];
}

/** Seven made-up recipes, originals written for Forage. */
export const DEMO_RECIPES: DemoRecipe[] = [
  {
    id: 'rc_demo_stew',
    name: 'Beef Stew',
    source_site: 'example.com',
    servings: 6,
    total_min: 150,
    has_walkthrough: true,
    added_days_ago: 40,
    lines: [
      { text: '2 lb beef chuck, in 1 1/2 inch cubes', qty: 2, unit: 'lb' },
      { text: '2 tbsp flour', qty: 2, unit: 'tbsp', food_id: 'fd_demo_flour' },
      { text: '2 tbsp butter', qty: 2, unit: 'tbsp', food_id: 'fd_demo_butter' },
      { text: '1 medium onion, chopped', qty: 1, unit: 'medium', food_id: 'fd_demo_onion' },
      { text: '3 carrots, in chunks', qty: 3, unit: '' },
      { text: '4 cups beef broth', qty: 4, unit: 'cup' },
      { text: '1 tsp herbes de Provence', qty: 1, unit: 'tsp', food_id: 'fd_demo_herbs' },
      { text: 'Chopped parsley', section: 'To serve', optional: true },
    ],
    steps: [
      { name: 'Brown the beef', text: 'Toss the beef in the flour and brown it in the butter in batches.' },
      { name: 'Soften the onion', text: 'Cook the onion in the same pot until soft, about 5 minutes.' },
      { name: 'Simmer', text: 'Add the broth, herbs and beef back, cover and simmer for 90 minutes.' },
      { text: 'Add the carrots and simmer 30 minutes more, until tender.' },
      { section: 'To serve', text: 'Ladle into bowls and scatter with parsley.' },
    ],
  },
  {
    id: 'rc_demo_wraps',
    name: 'Turkey Taco Lettuce Wraps',
    source_site: 'example.org',
    servings: 4,
    total_min: 25,
    has_walkthrough: false,
    added_days_ago: 30,
    lines: [
      { text: '1 lb ground turkey', qty: 1, unit: 'lb' },
      { text: '1/2 medium onion, diced', qty: 0.5, unit: 'medium', food_id: 'fd_demo_onion' },
      { text: '2 tsp chili powder', qty: 2, unit: 'tsp' },
      { text: '1 head butter lettuce', qty: 1, unit: 'head' },
      { text: 'Plain yogurt, to top', food_id: 'fd_demo_yogurt', optional: true },
    ],
    steps: [
      { text: 'Brown the turkey with the onion, breaking it up.' },
      { text: 'Stir in the chili powder and a splash of water; cook 2 minutes.' },
      { text: 'Spoon into lettuce leaves and top with yogurt.' },
    ],
  },
  {
    id: 'rc_demo_chicken',
    name: 'Sheet-Pan Chicken',
    source_site: 'example.net',
    servings: 4,
    total_min: 45,
    has_walkthrough: false,
    added_days_ago: 20,
    lines: [
      { text: '2 lb chicken thighs', qty: 2, unit: 'lb' },
      { text: '1 lb small potatoes, halved', qty: 1, unit: 'lb' },
      { text: '1 medium onion, in wedges', qty: 1, unit: 'medium', food_id: 'fd_demo_onion' },
      { text: '1 tsp herbes de Provence', qty: 1, unit: 'tsp', food_id: 'fd_demo_herbs' },
    ],
    steps: [
      { text: 'Heat the oven to 425°F.' },
      { text: 'Toss everything on a sheet pan with oil, salt and the herbs.' },
      { text: 'Roast 35 to 40 minutes, until the chicken is cooked through.' },
    ],
  },
  {
    id: 'rc_demo_bread',
    name: 'Banana Bread',
    source_site: 'example.com',
    servings: 10,
    total_min: 75,
    has_walkthrough: false,
    added_days_ago: 10,
    lines: [
      { text: '3 ripe bananas', qty: 3, unit: '' },
      { text: '1/3 cup butter, melted', qty: 0.33, unit: 'cup', food_id: 'fd_demo_butter' },
      { text: '1 1/2 cups flour', qty: 1.5, unit: 'cup', food_id: 'fd_demo_flour' },
      { text: '3/4 cup sugar', qty: 0.75, unit: 'cup' },
    ],
    steps: [
      { text: 'Mash the bananas and stir in the butter.' },
      { text: 'Fold in the flour and sugar.' },
      { text: 'Bake in a loaf pan at 350°F for an hour.' },
    ],
  },
  {
    id: 'rc_demo_chili',
    name: 'One-Pot Chili',
    source_site: 'example.org',
    servings: 6,
    total_min: 60,
    has_walkthrough: false,
    added_days_ago: 5,
    lines: [
      { text: '1 lb ground beef', qty: 1, unit: 'lb' },
      { text: '1 medium onion, chopped', qty: 1, unit: 'medium', food_id: 'fd_demo_onion' },
      { text: '2 cans kidney beans, drained', qty: 2, unit: 'can' },
      { text: '1 can crushed tomatoes', qty: 1, unit: 'can' },
      { text: '2 tbsp chili powder', qty: 2, unit: 'tbsp' },
    ],
    steps: [
      { text: 'Brown the beef and onion in a large pot.' },
      { text: 'Add the beans, tomatoes and chili powder.' },
      { text: 'Simmer 40 minutes, stirring now and then.' },
    ],
  },
  // #709: two more, every line matched, so the plan's sample shows one partial meal and the rest counted.
  {
    id: 'rc_demo_weeknight',
    name: 'Weeknight chili',
    source_site: 'example.net',
    servings: 4,
    total_min: 40,
    has_walkthrough: false,
    added_days_ago: 3,
    lines: [
      { text: '2 medium onions, chopped', qty: 2, unit: 'medium', food_id: 'fd_demo_onion' },
      { text: '2 tbsp butter', qty: 2, unit: 'tbsp', food_id: 'fd_demo_butter' },
      { text: '1/2 cup flour', qty: 0.5, unit: 'cup', food_id: 'fd_demo_flour' },
      { text: '1 cup plain yogurt, to serve', qty: 1, unit: 'cup', food_id: 'fd_demo_yogurt' },
    ],
    steps: [
      { text: 'Soften the onions in the butter.' },
      { text: 'Stir in the flour, add water and simmer 30 minutes.' },
      { text: 'Serve with a spoon of yogurt.' },
    ],
  },
  {
    id: 'rc_demo_oats',
    name: 'Overnight oats',
    source_site: 'example.com',
    servings: 1,
    total_min: 5,
    has_walkthrough: false,
    added_days_ago: 2,
    lines: [
      { text: '1 cup plain yogurt', qty: 1, unit: 'cup', food_id: 'fd_demo_yogurt' },
      { text: '1 Oat and Honey bar, crumbled', qty: 1, unit: 'bar', food_id: 'fd_demo_bar' },
    ],
    steps: [{ text: 'Stir the bar into the yogurt and leave it in the fridge overnight.' }],
  },
];

/** Sample cooks, by days before today: Beef Stew twice (4 stars), the wraps once (5), the chicken once unrated, the chili once (3). */
export const DEMO_COOKS: { id: string; recipe_id: string; days_ago: number; rating: number | null; note: string }[] = [
  { id: 'ck_demo_1', recipe_id: 'rc_demo_stew', days_ago: 24, rating: 3, note: '' },
  { id: 'ck_demo_2', recipe_id: 'rc_demo_stew', days_ago: 4, rating: 4, note: 'More carrots next time.' },
  { id: 'ck_demo_3', recipe_id: 'rc_demo_wraps', days_ago: 9, rating: 5, note: '' },
  { id: 'ck_demo_4', recipe_id: 'rc_demo_chicken', days_ago: 1, rating: null, note: '' },
  { id: 'ck_demo_5', recipe_id: 'rc_demo_chili', days_ago: 14, rating: 3, note: '' },
];

/**
 * #709: the sample plan, by days after today. Weeknight chili tomorrow is on the
 * open trip, the oats tomorrow on an earlier, closed one; Beef Stew is the
 * partial meal; today's lunch is a note.
 */
export const DEMO_PLAN: {
  id: string;
  in_days: number;
  slot: Slot;
  recipe_id?: string;
  note?: string;
  trip_id?: string;
}[] = [
  { id: 'pl_demo_1', in_days: 0, slot: 'Lunch', note: 'Leftovers' },
  { id: 'pl_demo_2', in_days: 1, slot: 'Breakfast', recipe_id: 'rc_demo_oats', trip_id: 'tr_demo_closed' },
  { id: 'pl_demo_3', in_days: 1, slot: 'Dinner', recipe_id: 'rc_demo_weeknight', trip_id: 'tr_demo_open' },
  { id: 'pl_demo_4', in_days: 3, slot: 'Lunch', recipe_id: 'rc_demo_weeknight' },
  { id: 'pl_demo_5', in_days: 3, slot: 'Dinner', recipe_id: 'rc_demo_stew' },
  { id: 'pl_demo_6', in_days: 5, slot: 'Dinner', recipe_id: 'rc_demo_weeknight' },
];

/** The two sample trips the plan's chips read. */
export const DEMO_TRIPS: Record<string, 'open' | 'closed'> = { tr_demo_open: 'open', tr_demo_closed: 'closed' };

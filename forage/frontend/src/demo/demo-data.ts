// The demo layer's sample data: the user, and the one recipe every demo
// import answers with (#706), an original written for Forage.
import type { AuthUser } from '@keel/auth';
import type { Food, ImportLine, ImportPreview, StarterFood } from '../api/types';

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

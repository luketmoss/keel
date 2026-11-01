// The demo layer's sample data: the user, and the one recipe every demo
// import answers with (#706), an original written for Forage.
import type { AuthUser } from '@keel/auth';
import type { ImportLine, ImportPreview } from '../api/types';

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

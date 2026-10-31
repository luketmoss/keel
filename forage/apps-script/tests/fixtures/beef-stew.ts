// The beef stew fixture (#703 AC6): the 19 lines of
// `D:/Projects/code/keel/scratchpad/forage-rebuild/walkthrough/beef-stew.recipe.json`
// (the owner's machine; worktrees have no scratchpad) with the prototype's
// food table `F` and its line weights as `grams`. The prototype's `recipeNut`
// gives 475.9 kcal a serving for these figures.

type N = [number, number, number, number] | null;

function food(id: string, name: string, n: N, extra: Record<string, unknown> = {}) {
  return {
    id,
    name,
    kind: 'ingredient',
    ...(n ? { kcal_100g: n[0], protein_100g: n[1], carbs_100g: n[2], fat_100g: n[3] } : {}),
    source: n ? 'usda' : '',
    ...extra,
  };
}

export const STEW_FOODS = [
  food('beefstew', 'Beef stew meat', [190, 19.4, 0, 12], { usual_store: 'costco' }),
  food('salt', 'Salt', [0, 0, 0, 0], { usually_have: true }),
  food('flour', 'All-purpose flour', [364, 10.3, 76.3, 1], { servings_json: [{ name: 'cup', g: 125 }] }),
  food('paprika', 'Smoked paprika', [282, 14, 54, 13]),
  food('canola', 'Canola oil', [884, 0, 0, 100]),
  food('tpaste', 'Tomato paste', [82, 4.3, 18.9, 0.5], {
    buy_unit: 'can (6 oz)',
    buy_unit_plural: 'cans (6 oz)',
    buy_unit_g: 170,
  }),
  food('herbes', 'Herbes de Provence', null),
  food('garlic', 'Garlic', [149, 6.4, 33, 0.5], {
    servings_json: [{ name: 'clove', g: 3 }],
    buy_unit: 'head',
    buy_unit_plural: 'heads',
    buy_unit_g: 45,
  }),
  food('redwine', 'Dry red wine', [85, 0.1, 2.6, 0]),
  food('broth', 'Beef broth', [7, 1.1, 0.1, 0.2]),
  food('rosemary', 'Fresh rosemary', [131, 3.3, 20.7, 5.9]),
  food('bay', 'Bay leaves', [313, 7.6, 75, 8.4]),
  food('potato', 'Potatoes', [77, 2, 17.5, 0.1]),
  food('onion', 'Yellow onion', [40, 1.1, 9.3, 0.1], {
    servings_json: [
      { name: 'medium', g: 110 },
      { name: 'cup, chopped', g: 160 },
    ],
  }),
  food('carrot', 'Carrots', [41, 0.9, 9.6, 0.2], { servings_json: [{ name: 'medium', g: 61 }] }),
  food('water', 'Water', [0, 0, 0, 0], { never_shop: true }),
  food('balsamic', 'Balsamic vinegar', [88, 0.5, 17, 0]),
  food('peas', 'Frozen peas', [77, 5.2, 13.6, 0.4]),
];

function line(id: string, text: string, qty: number | null, unit: string, food_id: string, grams: number | null) {
  return { line_id: id, text, qty, unit, food_id, grams };
}

export const STEW_RECIPE = {
  id: 'stew',
  name: 'Beef Stew',
  source_url: 'https://www.tasteofhome.com/recipes/classic-beef-stew/',
  source_site: 'tasteofhome.com',
  servings: 6,
  lines: [
    line('L1', '1-1/2 pounds beef stew meat, cut into 1-inch cubes', 1.5, 'lb', 'beefstew', 680),
    line('L2', '1/2 teaspoon salt, divided', 0.5, 'tsp', 'salt', 3),
    line('L3', '6 tablespoons all-purpose flour, divided', 6, 'tbsp', 'flour', 47),
    line('L4', '1/2 teaspoon smoked paprika', 0.5, 'tsp', 'paprika', 1),
    line('L5', '1 tablespoon canola oil', 1, 'tbsp', 'canola', 14),
    line('L6', '3 tablespoons tomato paste', 3, 'tbsp', 'tpaste', 50),
    line('L7', '2 teaspoons herbes de Provence', 2, 'tsp', 'herbes', 3),
    line('L8', '2 garlic cloves, minced', 2, 'clove', 'garlic', 6),
    line('L9', '2 cups dry red wine', 2, 'cup', 'redwine', 470),
    line('L10', '2 cups beef broth', 2, 'cup', 'broth', 480),
    line('L11', '1-1/2 teaspoons minced fresh rosemary, divided', 1.5, 'tsp', 'rosemary', 1),
    line('L12', '2 bay leaves', 2, '', 'bay', 1),
    line('L13', '3 cups cubed peeled potatoes', 3, 'cup', 'potato', 450),
    line('L14', '3 cups coarsely chopped onions (about 2 large)', 3, 'cup', 'onion', 480),
    line('L15', '2 cups sliced carrots', 2, 'cup', 'carrot', 244),
    line('L16', '2 tablespoons cold water', 2, 'tbsp', 'water', 30),
    line('L17', '2 tablespoons balsamic or red wine vinegar', 2, 'tbsp', 'balsamic', 32),
    line('L18', '1 cup fresh or frozen peas', 1, 'cup', 'peas', 145),
    { ...line('L19', 'Additional fresh rosemary, optional', null, '', 'rosemary', null), optional: true },
  ],
  steps: [
    { name: 'Prep the beef', text: 'Toss the beef with salt, then coat it in the flour and paprika.' },
    { name: 'Brown the beef', text: 'Brown the beef in oil, then stir in the paste, herbs and garlic.' },
    { name: 'Deglaze the pan', text: 'Pour in the wine and reduce by half.' },
    { name: 'Simmer the stew', text: 'Add the broth, bay and rosemary; simmer covered for 1 hour 30 minutes.' },
    { name: 'Add the veggies', text: 'Add the potatoes, onions and carrots; simmer 30 minutes longer.' },
    { name: 'Add the finishing touches', text: 'Thicken, add the peas and serve.' },
  ],
};

/** The prototype's per-serving kcal for these weights (recipeNut, 475.91). */
export const PROTOTYPE_KCAL_PER_SERVING = 475.9;

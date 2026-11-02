#!/usr/bin/env node
/**
 * build-starter-foods.mjs - writes apps-script/src/starter.js, the starter list (#707).
 *
 * About 75 pantry staples, each with USDA SR Legacy nutrition per 100 g, the
 * kitchen weights recipes use (cup, clove, medium), and the ingredient names
 * that mean it. SR Legacy is public domain. Forage makes no USDA call and has
 * no USDA key: this script is run by hand when the list changes, and the file
 * it writes is committed.
 *
 * Inputs:
 *   - the SR Legacy JSON download ("SR Legacy", JSON, from
 *     https://fdc.nal.usda.gov/download-datasets), unzipped: one object,
 *     `{ "SRLegacyFoods": [...] }`. Only the foods in FOODS below are read.
 *   - starter-aliases.json beside this file: ingredient name -> FDC id, from
 *     the #700 spike's aliases.json. An alias naming an FDC id that is not in
 *     FOODS is an error, so the two lists cannot drift apart.
 *
 * Usage (PowerShell, from forage/):
 *   $sr = Read-Host 'Path to the SR Legacy JSON file'
 *   node scripts/build-starter-foods.mjs $sr
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '..', 'apps-script', 'src', 'starter.js');

// Each starter food: its id (stable: the app and agents send it), the name it
// gets in the library, a category, its FDC id, and the weights to keep, in
// order, each as [name, a pattern on the SR portion "<amount> <modifier>"].
// The first weight is the default one a bare count ("2 eggs") uses.
const FOODS = [
  // Baking
  ['flour-all-purpose', 'Flour, all-purpose', 'Baking', 168894, [['cup', /^1 cup$/]]],
  ['flour-bread', 'Flour, bread', 'Baking', 168896, [['cup', /^1 cup$/]]],
  ['sugar-granulated', 'Sugar, granulated', 'Baking', 169655, [['cup', /^1 cup$/], ['tsp', /^1 tsp$/]]],
  ['sugar-brown', 'Sugar, brown', 'Baking', 168833, [['cup', /^1 cup packed$/], ['tsp', /^1 tsp packed$/]]],
  ['sugar-powdered', 'Sugar, powdered', 'Baking', 169656, [['cup', /^1 cup unsifted$/], ['tbsp', /^1 tbsp unsifted$/]]],
  ['baking-powder', 'Baking powder', 'Baking', 172803, [['tsp', /^1 tsp$/]]],
  ['baking-soda', 'Baking soda', 'Baking', 175040, [['tsp', /^1 tsp$/]]],
  ['cornstarch', 'Cornstarch', 'Baking', 169698, [['cup', /^1 cup$/]]],
  ['cocoa-powder', 'Cocoa powder, unsweetened', 'Baking', 169593, [['cup', /^1 cup$/], ['tbsp', /^1 tbsp$/]]],
  ['chocolate-chips', 'Chocolate chips, semisweet', 'Baking', 167976, [['cup', /^1 cup large chips$/]]],
  ['honey', 'Honey', 'Baking', 169640, [['cup', /^1 cup$/], ['tbsp', /^1 tbsp$/]]],
  ['maple-syrup', 'Maple syrup', 'Baking', 169661, [['cup', /^1 cup$/], ['tbsp', /^1 tbsp$/]]],
  ['vanilla-extract', 'Vanilla extract', 'Baking', 173471, [['tsp', /^1 tsp$/], ['tbsp', /^1 tbsp$/]]],
  ['yeast', 'Yeast, active dry', 'Baking', 175043, [['tsp', /^1 tsp$/], ['packet', /^1 packet$/]]],
  ['oats-rolled', 'Oats, rolled', 'Baking', 173904, [['cup', /^1 cup$/]]],
  // Dairy and eggs
  ['butter-unsalted', 'Butter, unsalted', 'Dairy and eggs', 173430, [['tbsp', /^1 tbsp$/], ['cup', /^1 cup$/], ['stick', /^1 stick$/]]],
  ['butter-salted', 'Butter, salted', 'Dairy and eggs', 173410, [['tbsp', /^1 tbsp$/], ['cup', /^1 cup$/], ['stick', /^1 stick$/]]],
  ['egg', 'Egg', 'Dairy and eggs', 171287, [['large', /^1 large$/], ['medium', /^1 medium$/], ['small', /^1 small$/]]],
  ['milk-whole', 'Milk, whole', 'Dairy and eggs', 171265, [['cup', /^1 cup$/], ['tbsp', /^1 tbsp$/]]],
  ['cream-heavy', 'Cream, heavy', 'Dairy and eggs', 170859, [['cup', /^1 cup, fluid/], ['tbsp', /^1 tbsp$/]]],
  ['sour-cream', 'Sour cream', 'Dairy and eggs', 171257, [['cup', /^1 cup$/], ['tbsp', /^1 tbsp$/]]],
  ['cream-cheese', 'Cream cheese', 'Dairy and eggs', 173418, [['cup', /^1 cup$/], ['tbsp', /^1 tbsp$/]]],
  ['cheddar', 'Cheese, cheddar', 'Dairy and eggs', 173414, [['cup', /^1 cup, shredded$/], ['slice', /^1 slice/]]],
  ['parmesan', 'Cheese, parmesan, grated', 'Dairy and eggs', 171247, [['cup', /^1 cup$/], ['tbsp', /^1 tbsp$/]]],
  ['mozzarella', 'Cheese, mozzarella', 'Dairy and eggs', 170845, [['cup', /^1 cup, shredded$/]]],
  ['ricotta', 'Cheese, ricotta', 'Dairy and eggs', 170851, [['cup', /^1 cup$/]]],
  ['greek-yogurt', 'Yogurt, Greek, plain', 'Dairy and eggs', 171304, []],
  // Oils and condiments
  ['olive-oil', 'Olive oil', 'Oils and condiments', 171413, [['tbsp', /^1 tablespoon$/], ['cup', /^1 cup$/], ['tsp', /^1 tsp$/]]],
  ['vegetable-oil', 'Vegetable oil (canola)', 'Oils and condiments', 172336, [['tbsp', /^1 tbsp$/], ['cup', /^1 cup$/], ['tsp', /^1 tsp$/]]],
  ['vinegar', 'Vinegar, white', 'Oils and condiments', 172237, [['tbsp', /^1 tbsp$/], ['cup', /^1 cup$/], ['tsp', /^1 tsp$/]]],
  ['soy-sauce', 'Soy sauce', 'Oils and condiments', 174277, [['tbsp', /^1 tbsp$/], ['tsp', /^1 tsp$/], ['cup', /^1 cup$/]]],
  ['mayonnaise', 'Mayonnaise', 'Oils and condiments', 171009, [['tbsp', /^1 tbsp$/], ['cup', /^1 cup$/]]],
  ['ketchup', 'Ketchup', 'Oils and condiments', 168556, [['tbsp', /^1 tbsp$/], ['cup', /^1 cup$/]]],
  ['mustard', 'Mustard, yellow', 'Oils and condiments', 172234, [['tsp', /^1 tsp/], ['cup', /^1 cup$/]]],
  ['peanut-butter', 'Peanut butter', 'Oils and condiments', 172470, [['tbsp', /^2 tbsp$/], ['cup', /^1 cup$/]]],
  // Spices
  ['salt', 'Salt', 'Spices', 173468, [['tsp', /^1 tsp$/], ['tbsp', /^1 tbsp$/]]],
  ['black-pepper', 'Black pepper', 'Spices', 170931, [['tsp', /^1 tsp, ground$/], ['tbsp', /^1 tbsp, ground$/]]],
  ['garlic-powder', 'Garlic powder', 'Spices', 171325, [['tsp', /^1 tsp$/], ['tbsp', /^1 tbsp$/]]],
  ['chili-powder', 'Chili powder', 'Spices', 171319, [['tsp', /^1 tsp$/], ['tbsp', /^1 tbsp$/]]],
  ['cumin', 'Cumin', 'Spices', 170923, [['tsp', /^1 tsp/], ['tbsp', /^1 tbsp/]]],
  ['paprika', 'Paprika', 'Spices', 171329, [['tsp', /^1 tsp$/], ['tbsp', /^1 tbsp$/]]],
  ['cinnamon', 'Cinnamon, ground', 'Spices', 171320, [['tsp', /^1 tsp$/], ['tbsp', /^1 tbsp$/]]],
  ['oregano-dried', 'Oregano, dried', 'Spices', 171328, [['tsp', /^1 tsp, leaves$/]]],
  ['basil-dried', 'Basil, dried', 'Spices', 171317, [['tsp', /^1 tsp, leaves$/], ['tbsp', /^1 tbsp, leaves$/]]],
  // Produce
  ['onion', 'Onion', 'Produce', 170000, [['medium', /^1 medium/], ['large', /^1 large$/], ['small', /^1 small$/], ['cup', /^1 cup, chopped$/]]],
  ['garlic', 'Garlic', 'Produce', 169230, [['clove', /^1 clove$/], ['tsp', /^1 tsp$/]]],
  ['carrot', 'Carrot', 'Produce', 170393, [['medium', /^1 medium$/], ['large', /^1 large/], ['small', /^1 small/], ['cup', /^1 cup chopped$/]]],
  ['celery', 'Celery', 'Produce', 169988, [['stalk', /^1 stalk, medium/], ['cup', /^1 cup chopped$/]]],
  ['potato', 'Potato', 'Produce', 170026, [['medium', /^1 Potato medium/], ['large', /^1 Potato large/], ['small', /^1 Potato small/], ['cup', /^0\.5 cup, diced$/]]],
  ['sweet-potato', 'Sweet potato', 'Produce', 168482, [['medium', /^1 sweetpotato/], ['cup', /^1 cup, cubes$/]]],
  ['tomato', 'Tomato', 'Produce', 170457, [['medium', /^1 medium whole/], ['large', /^1 large whole/], ['cup', /^1 cup, chopped or sliced$/]]],
  ['bell-pepper-red', 'Bell pepper, red', 'Produce', 170108, [['medium', /^1 medium/], ['large', /^1 large/], ['small', /^1 small$/], ['cup', /^1 cup, chopped$/]]],
  ['spinach', 'Spinach', 'Produce', 168462, [['cup', /^1 cup$/], ['bunch', /^1 bunch$/]]],
  ['broccoli', 'Broccoli', 'Produce', 170379, [['cup', /^1 cup chopped$/], ['bunch', /^1 bunch$/]]],
  ['mushrooms', 'Mushrooms, white', 'Produce', 169251, [['cup', /^1 cup, pieces or slices$/], ['medium', /^1 medium$/]]],
  ['lemon', 'Lemon', 'Produce', 167746, [['medium', /^1 fruit \(2-1\/8" dia\)$/]]],
  ['lemon-juice', 'Lemon juice', 'Produce', 167747, [['cup', /^1 cup$/]]],
  ['green-onion', 'Green onion', 'Produce', 170005, [['medium', /^1 medium/], ['cup', /^1 cup, chopped$/]]],
  ['ginger', 'Ginger root', 'Produce', 169231, [['tsp', /^1 tsp$/]]],
  ['avocado', 'Avocado', 'Produce', 171706, [['medium', /^1 fruit, without skin and seed$/], ['cup', /^1 cup, pureed$/]]],
  ['banana', 'Banana', 'Produce', 173944, [['medium', /^1 medium/], ['large', /^1 large/], ['small', /^1 small/], ['cup', /^1 cup, mashed$/]]],
  // Meat, fish and tofu
  ['chicken-breast', 'Chicken breast, boneless, skinless', 'Meat, fish and tofu', 171077, []],
  ['ground-beef', 'Ground beef, 85% lean', 'Meat, fish and tofu', 171796, []],
  ['ground-turkey', 'Ground turkey, 93% lean', 'Meat, fish and tofu', 172850, []],
  ['salmon', 'Salmon, Atlantic', 'Meat, fish and tofu', 175167, []],
  ['tofu', 'Tofu, firm', 'Meat, fish and tofu', 172475, [['block', /^0\.25 block$/], ['cup', /^0\.5 cup$/]]],
  // Pantry
  ['rice-white', 'Rice, white, long-grain', 'Pantry', 169756, [['cup', /^1 cup$/]]],
  ['rice-brown', 'Rice, brown, long-grain', 'Pantry', 169703, [['cup', /^1 cup$/]]],
  ['pasta', 'Pasta, dry', 'Pantry', 169736, []],
  ['bread-crumbs', 'Bread crumbs', 'Pantry', 174928, [['cup', /^1 cup$/]]],
  ['chickpeas', 'Chickpeas, canned, drained', 'Pantry', 173800, [['can', /^1 can drained$/]]],
  ['black-beans', 'Black beans, canned', 'Pantry', 175188, [['cup', /^1 cup$/]]],
  ['lentils', 'Lentils, dry', 'Pantry', 172420, [['cup', /^1 cup$/], ['tbsp', /^1 tablespoon$/]]],
  ['tomato-paste', 'Tomato paste', 'Pantry', 170459, [['tbsp', /^1 tbsp$/], ['can', /^1 can \(6 oz\)$/], ['cup', /^1 cup$/]]],
  ['crushed-tomatoes', 'Tomatoes, crushed, canned', 'Pantry', 170501, [['cup', /^0\.5 cup$/]]],
  ['chicken-broth', 'Chicken broth', 'Pantry', 174536, [['cup', /^1 cup$/]]],
  ['water', 'Water', 'Pantry', 173647, [['cup', /8 fl oz$/], ['fl oz', /^1 fl oz$/]]],
];

/** SR Legacy nutrient numbers: energy (kcal), protein, carbohydrate by difference, total fat. */
const NUTRIENTS = { kcal_100g: '208', protein_100g: '203', carbs_100g: '205', fat_100g: '204' };

const round = (n, places) => Math.round(n * 10 ** places) / 10 ** places;

function fail(message) {
  console.error(message);
  process.exit(1);
}

const srPath = process.argv[2];
if (!srPath) fail('Pass the path to the SR Legacy JSON download (see the usage at the top of this file).');
const sr = JSON.parse(fs.readFileSync(srPath, 'utf8'));
const records = new Map((sr.SRLegacyFoods ?? []).map((f) => [f.fdcId, f]));
const aliasMap = JSON.parse(fs.readFileSync(path.join(HERE, 'starter-aliases.json'), 'utf8'));

const byFdc = new Map(FOODS.map((f) => [f[3], f]));
for (const [alias, fdc] of Object.entries(aliasMap)) {
  if (!byFdc.has(fdc)) fail(`starter-aliases.json: "${alias}" names FDC ${fdc}, which is not a starter food`);
}

const ids = new Set();
const foods = FOODS.map(([id, name, category, fdc, weights]) => {
  if (ids.has(id)) fail(`${id} is listed twice`);
  ids.add(id);
  const record = records.get(fdc);
  if (!record) fail(`FDC ${fdc} (${name}) is not in ${srPath}`);

  const food = { id, name, category, fdc };
  for (const [field, number] of Object.entries(NUTRIENTS)) {
    const n = record.foodNutrients.find(
      (x) => x.nutrient?.number === number && (number !== '208' || /kcal/i.test(x.nutrient.unitName ?? '')),
    );
    if (!n || typeof n.amount !== 'number') fail(`FDC ${fdc} (${name}) has no ${field}`);
    food[field] = round(n.amount, 2);
  }

  const portions = (record.foodPortions ?? [])
    .slice()
    .sort((a, b) => (a.sequenceNumber ?? 0) - (b.sequenceNumber ?? 0))
    .map((p) => ({ label: `${p.amount} ${p.modifier || p.measureUnit?.name || ''}`.trim(), g: p.gramWeight / p.amount }));
  food.servings = weights.map(([wname, pattern]) => {
    const p = portions.find((x) => pattern.test(x.label));
    if (!p) fail(`FDC ${fdc} (${name}) has no portion matching ${pattern}: ${portions.map((x) => x.label).join('; ')}`);
    return { name: wname, g: round(p.g, 1) };
  });

  food.aliases = Object.keys(aliasMap).filter((a) => aliasMap[a] === fdc);
  return food;
});

const header = `// GENERATED by forage/scripts/build-starter-foods.mjs from USDA SR Legacy
// (public domain) and forage/scripts/starter-aliases.json. Do not edit by
// hand: change the script or the aliases and run it again (#707).
//
// The starter list: ${foods.length} pantry staples, nutrition per 100 g, weights in
// grams (the first is the default), and the ingredient names that mean each.
// Forage makes no USDA call; this file is all of USDA it has.

`;
const body = `var STARTER_FOODS = [\n${foods.map((f) => `  ${JSON.stringify(f)},`).join('\n')}\n];\n`;
fs.writeFileSync(OUT, header + body);
console.log(`Wrote ${foods.length} foods to ${path.relative(process.cwd(), OUT)}`);

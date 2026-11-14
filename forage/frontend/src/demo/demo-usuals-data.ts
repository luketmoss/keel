// #881: the demo's usuals, combos and the foods they need. The food names and the shape of the usuals copy the
// prototype (docs/design/876-usuals-prototype.html); the amounts are examples.
import type { Food, Slot } from '../api/types';
import { food } from './demo-data';

const W = (name: string, g: number) => ({ name, g });

/** The foods the sample usuals and combos use. Appended after DEMO_FOODS, so the first foods are unchanged. */
export const DEMO_USUAL_FOODS: Food[] = [
  food('fd_demo_oats', 'Rolled oats', {
    kcal_100g: 389,
    protein_100g: 16.9,
    carbs_100g: 66,
    fat_100g: 6.9,
    servings_json: [W('cup', 80)],
    source: 'usda',
  }),
  food('fd_demo_almond', 'Almond butter', {
    kcal_100g: 614,
    protein_100g: 21,
    carbs_100g: 19,
    fat_100g: 56,
    servings_json: [W('serving', 32)],
    source: 'usda',
  }),
  food('fd_demo_blueberries', 'Blueberries', {
    kcal_100g: 57,
    protein_100g: 0.7,
    carbs_100g: 14,
    fat_100g: 0.3,
    servings_json: [W('cup', 148)],
    source: 'usda',
  }),
  food('fd_demo_banana', 'Banana', {
    kcal_100g: 89,
    protein_100g: 1.1,
    carbs_100g: 23,
    fat_100g: 0.3,
    servings_json: [W('medium', 118)],
    source: 'usda',
  }),
  food('fd_demo_strawberries', 'Strawberries', {
    kcal_100g: 32,
    protein_100g: 0.7,
    carbs_100g: 7.7,
    fat_100g: 0.3,
    servings_json: [W('cup', 152)],
    source: 'usda',
  }),
  food('fd_demo_milk2', 'Milk, 2%', {
    kcal_100g: 50,
    protein_100g: 3.3,
    carbs_100g: 4.8,
    fat_100g: 2,
    servings_json: [W('cup', 244)],
    source: 'usda',
  }),
  food('fd_demo_cheerios', 'Cinnamon Cheerios Protein', {
    kind: 'packaged',
    brand: 'General Mills',
    kcal_100g: 405,
    protein_100g: 21.6,
    carbs_100g: 64.9,
    fat_100g: 6.8,
    servings_json: [W('cup', 44)],
    source: 'label',
  }),
  food('fd_demo_raisinbran', 'Raisin Bran Crunch', {
    kind: 'packaged',
    brand: "Kellogg's",
    kcal_100g: 345,
    protein_100g: 7.3,
    carbs_100g: 83.6,
    fat_100g: 1.8,
    servings_json: [W('cup', 55)],
    source: 'label',
  }),
  food('fd_demo_kyogurt', 'organic GREEK YOGURT plain', {
    kind: 'packaged',
    brand: 'KIRKLAND Signature',
    kcal_100g: 59,
    protein_100g: 10.6,
    carbs_100g: 4.1,
    fat_100g: 0,
    servings_json: [W('cup', 227)],
    source: 'label',
  }),
  food('fd_demo_chobani', 'Yogurt - 20g Protein No Sugar Added', {
    kind: 'packaged',
    brand: 'Chobani',
    kcal_100g: 74,
    protein_100g: 10.5,
    carbs_100g: 4.7,
    fat_100g: 1.6,
    servings_json: [W('container', 150)],
    source: 'label',
  }),
  food('fd_demo_kalmond', 'Creamy Almond Butter', {
    kind: 'packaged',
    brand: 'Kirkland Signature',
    kcal_100g: 625,
    protein_100g: 21.9,
    carbs_100g: 18.8,
    fat_100g: 56.3,
    servings_json: [W('tbsp', 16)],
    source: 'label',
  }),
  food('fd_demo_kpbcreamy', 'Natural Creamy Peanut Butter', {
    kind: 'packaged',
    brand: 'Kroger',
    kcal_100g: 594,
    protein_100g: 25,
    carbs_100g: 21.9,
    fat_100g: 50,
    servings_json: [W('tbsp', 16)],
    source: 'label',
  }),
  food('fd_demo_kpbcrunchy', 'Natural Crunchy Peanut Butter', {
    kind: 'packaged',
    brand: 'Kroger',
    kcal_100g: 563,
    protein_100g: 25,
    carbs_100g: 15.6,
    fat_100g: 50,
    servings_json: [W('tbsp', 16)],
    source: 'label',
  }),
  food('fd_demo_nuttzo', 'NuttZo Organic 7 Nut & Seed Butter POWER FUEL Crunchy', {
    kind: 'packaged',
    brand: 'NuttZo',
    kcal_100g: 562,
    protein_100g: 18.2,
    carbs_100g: 24.2,
    fat_100g: 45.5,
    servings_json: [W('tbsp', 16)],
    source: 'label',
  }),
  food('fd_demo_pbfit', 'Organic PBfit peanut butter powder', {
    kind: 'packaged',
    brand: 'PBfit',
    kcal_100g: 375,
    protein_100g: 43.8,
    carbs_100g: 37.5,
    fat_100g: 12.5,
    servings_json: [W('tbsp', 8)],
    source: 'label',
  }),
  // The combos' foods.
  food('fd_demo_bread', 'Sourdough bread', {
    kcal_100g: 274,
    protein_100g: 11,
    carbs_100g: 51,
    fat_100g: 2.4,
    servings_json: [W('slice', 50)],
    source: 'usda',
  }),
  food('fd_demo_turkey', 'Deli turkey', {
    kcal_100g: 104,
    protein_100g: 17,
    carbs_100g: 4,
    fat_100g: 2,
    servings_json: [W('slice', 28)],
    source: 'usda',
  }),
  food('fd_demo_cheddar', 'Cheddar', {
    kcal_100g: 403,
    protein_100g: 25,
    carbs_100g: 1.3,
    fat_100g: 33,
    servings_json: [W('slice', 21)],
    source: 'usda',
  }),
  food('fd_demo_swiss', 'Swiss cheese', {
    kcal_100g: 380,
    protein_100g: 27,
    carbs_100g: 1.5,
    fat_100g: 28,
    servings_json: [W('slice', 21)],
    source: 'usda',
  }),
  food('fd_demo_apple', 'Apple', {
    kcal_100g: 52,
    protein_100g: 0.3,
    carbs_100g: 14,
    fat_100g: 0.2,
    servings_json: [W('medium', 182)],
    source: 'usda',
  }),
  food('fd_demo_pb', 'Peanut butter', {
    kcal_100g: 588,
    protein_100g: 25,
    carbs_100g: 20,
    fat_100g: 50,
    servings_json: [W('tbsp', 16)],
    source: 'usda',
  }),
];

type Amount = { food_id: string; qty: number; unit: string };

/** A sample usual. `used` and `last_used_days_ago` are its history before the session; the session's own logs add to them. */
export interface DemoUsual {
  id: string;
  name: string;
  slot: Slot;
  used: number;
  last_used_days_ago: number;
  lines: (Amount | { options: Amount[]; last_pick: string })[];
}

export const DEMO_USUALS: DemoUsual[] = [
  {
    id: 'us_demo_oatmeal',
    name: 'Oatmeal',
    slot: 'Breakfast',
    used: 12,
    last_used_days_ago: 1,
    lines: [
      { food_id: 'fd_demo_oats', qty: 0.5, unit: 'cup' },
      { food_id: 'fd_demo_almond', qty: 0.5, unit: 'serving' },
      {
        options: [
          { food_id: 'fd_demo_blueberries', qty: 0.5, unit: 'cup' },
          { food_id: 'fd_demo_banana', qty: 0.5, unit: 'medium' },
          { food_id: 'fd_demo_strawberries', qty: 0.5, unit: 'cup' },
        ],
        last_pick: 'fd_demo_blueberries',
      },
      { food_id: 'fd_demo_milk2', qty: 1, unit: 'cup' },
    ],
  },
  {
    id: 'us_demo_cereal',
    name: 'After dinner cereal',
    slot: 'After dinner',
    used: 9,
    last_used_days_ago: 1,
    lines: [
      {
        options: [
          { food_id: 'fd_demo_cheerios', qty: 1.25, unit: 'cup' },
          { food_id: 'fd_demo_raisinbran', qty: 1, unit: 'cup' },
        ],
        last_pick: 'fd_demo_cheerios',
      },
      { food_id: 'fd_demo_milk2', qty: 0.75, unit: 'cup' },
    ],
  },
  {
    id: 'us_demo_yogurtbowl',
    name: 'Yogurt bowl',
    slot: 'Breakfast',
    used: 5,
    last_used_days_ago: 3,
    lines: [
      {
        options: [
          { food_id: 'fd_demo_kyogurt', qty: 0.75, unit: 'cup' },
          { food_id: 'fd_demo_chobani', qty: 1, unit: 'container' },
        ],
        last_pick: 'fd_demo_chobani',
      },
      {
        options: [
          { food_id: 'fd_demo_kalmond', qty: 1, unit: 'tbsp' },
          { food_id: 'fd_demo_kpbcreamy', qty: 1, unit: 'tbsp' },
          { food_id: 'fd_demo_kpbcrunchy', qty: 1, unit: 'tbsp' },
          { food_id: 'fd_demo_nuttzo', qty: 1, unit: 'tbsp' },
          { food_id: 'fd_demo_pbfit', qty: 2, unit: 'tbsp' },
        ],
        last_pick: 'fd_demo_kpbcreamy',
      },
      { food_id: 'fd_demo_blueberries', qty: 0.5, unit: 'cup' },
    ],
  },
];

/** A sample combo as the demo answers it: the prototype's three, plus the one the Oatmeal usual covers (so it is not shown). */
export interface DemoCombo {
  key: string;
  name: string;
  slot: Slot;
  meals: number;
  last_days_ago: number;
  meal_days_ago: number[];
  lines: (Amount | { options: Amount[]; default: string })[];
}

export const DEMO_COMBOS: DemoCombo[] = [
  {
    key: 'fd_demo_granola+fd_demo_yogurt',
    name: 'Plain yogurt + Granola',
    slot: 'Breakfast',
    meals: 9,
    last_days_ago: 4,
    meal_days_ago: [4, 7, 10, 15, 19, 23, 30, 35, 41],
    lines: [
      { food_id: 'fd_demo_yogurt', qty: 1, unit: 'cup' },
      { food_id: 'fd_demo_granola', qty: 0.5, unit: 'cup' },
    ],
  },
  {
    key: 'fd_demo_bread+fd_demo_turkey|fd_demo_cheddar/fd_demo_swiss',
    name: 'Sourdough bread + Deli turkey + Cheddar / Swiss cheese',
    slot: 'Lunch',
    meals: 7,
    last_days_ago: 4,
    meal_days_ago: [4, 6, 11, 14, 21, 27, 33],
    lines: [
      { food_id: 'fd_demo_bread', qty: 2, unit: 'slice' },
      { food_id: 'fd_demo_turkey', qty: 3, unit: 'slice' },
      {
        options: [
          { food_id: 'fd_demo_cheddar', qty: 1, unit: 'slice' },
          { food_id: 'fd_demo_swiss', qty: 1, unit: 'slice' },
        ],
        default: 'fd_demo_cheddar',
      },
    ],
  },
  {
    key: 'fd_demo_apple+fd_demo_pb',
    name: 'Apple + Peanut butter',
    slot: 'Snacks',
    meals: 5,
    last_days_ago: 2,
    meal_days_ago: [2, 6, 9, 16, 22],
    lines: [
      { food_id: 'fd_demo_apple', qty: 1, unit: 'medium' },
      { food_id: 'fd_demo_pb', qty: 1, unit: 'tbsp' },
    ],
  },
  {
    key: 'fd_demo_almond+fd_demo_milk2+fd_demo_oats|fd_demo_banana/fd_demo_blueberries',
    name: 'Rolled oats + Almond butter + Milk, 2% + Banana / Blueberries',
    slot: 'Breakfast',
    meals: 11,
    last_days_ago: 1,
    meal_days_ago: [1, 2, 3, 5, 6, 8, 9, 12, 13, 17, 20],
    lines: [
      { food_id: 'fd_demo_oats', qty: 0.5, unit: 'cup' },
      { food_id: 'fd_demo_almond', qty: 0.5, unit: 'serving' },
      { food_id: 'fd_demo_milk2', qty: 1, unit: 'cup' },
      {
        options: [
          { food_id: 'fd_demo_blueberries', qty: 0.5, unit: 'cup' },
          { food_id: 'fd_demo_banana', qty: 0.5, unit: 'medium' },
        ],
        default: 'fd_demo_blueberries',
      },
    ],
  },
];

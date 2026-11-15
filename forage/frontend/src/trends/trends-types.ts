// #913: the names the Trends screen shares with the router. Kept free of imports so routes.ts can read them.

export const RANGES = ['1W', '1M', '3M', '6M', '1Y', 'All'] as const;
export type RangeId = (typeof RANGES)[number];
export const DEFAULT_RANGE: RangeId = '1M';

export const AVERAGES = ['Off', '7d', '14d', '30d'] as const;
export type AverageId = (typeof AVERAGES)[number];
export const DEFAULT_AVERAGE: AverageId = '7d';

/** The tabs the screen will have (#915, #916 add the rest); only `BUILT_TABS` show. */
export const TREND_TABS = ['energy', 'macros', 'nutrients', 'meals', 'foods'] as const;
export type TrendTab = (typeof TREND_TABS)[number];
export const BUILT_TABS: readonly TrendTab[] = ['energy', 'macros', 'nutrients'];

/** #914: the macro a Grams per day chart shows, and the seven nutrients, as the hash's `metric` names them. */
export const MACRO_METRICS = ['protein', 'carbs', 'fat'] as const;
export type MacroMetric = (typeof MACRO_METRICS)[number];
export const DEFAULT_MACRO: MacroMetric = 'protein';
export const NUTRIENT_METRICS = [
  'satfat',
  'transfat',
  'cholesterol',
  'sodium',
  'fiber',
  'sugars',
  'added_sugars',
] as const;
export type NutrientMetric = (typeof NUTRIENT_METRICS)[number];

/** `metric` in the hash names a chart and implies its tab. */
export const METRIC_TAB: Record<string, TrendTab> = {
  kcal: 'energy',
  protein: 'macros',
  carbs: 'macros',
  fat: 'macros',
  satfat: 'nutrients',
  transfat: 'nutrients',
  cholesterol: 'nutrients',
  sodium: 'nutrients',
  fiber: 'nutrients',
  sugars: 'nutrients',
  added_sugars: 'nutrients',
};

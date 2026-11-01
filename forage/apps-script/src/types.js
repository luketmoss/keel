// The Forage Sheet's layout (#703). Each `<TAB>_FIELDS` array is the only
// definition of its tab: the migration writes its header from it and the row
// layer maps cells by it. Columns are appended, never moved: agents, the API
// and the Worker read tabs by column position.
//
// `TABS` adds what the row layer needs beyond the order: the key columns, and
// the kind of each non-text column. A field not named in `kinds` is text.
//   num  — a number, or blank (unknown). Blank is never read back as 0.
//   bool — stored TRUE or blank.
//   json — one cell of JSON text.

var TIMEZONE = 'America/Denver';

/** A `payload` longer than this is refused, which keeps a cell under Sheets' 50,000 limit. */
var MAX_PAYLOAD_CHARS = 45000;

var SCHEMA_VERSION = '1';

var FOOD_FIELDS = [
  'id', 'name', 'kind', 'brand', 'category',
  'kcal_100g', 'protein_100g', 'carbs_100g', 'fat_100g',
  'servings_json', 'buy_unit', 'buy_unit_plural', 'buy_unit_g',
  'usual_store', 'usually_have', 'regular', 'packs_json', 'last_buy', 'last_bought_on',
  'never_shop', 'source', 'source_ref', 'verified', 'barcode', 'created', 'updated',
];

var RECIPE_FIELDS = [
  'id', 'name', 'source_url', 'source_site', 'servings', 'total_min', 'notes', 'created', 'updated',
];

var RECIPE_LINE_FIELDS = [
  'recipe_id', 'line_id', 'position', 'section', 'text', 'qty', 'unit', 'food_id', 'grams', 'optional',
];

var STEP_FIELDS = ['recipe_id', 'position', 'section', 'name', 'text'];

var WALKTHROUGH_FIELDS = ['recipe_id', 'format', 'walkthrough_json', 'updated'];

var PLAN_FIELDS = ['id', 'date', 'slot', 'recipe_id', 'note', 'trip_id', 'created', 'updated'];

var TRIP_FIELDS = ['id', 'status', 'through', 'created', 'closed_at'];

var TRIP_ITEM_FIELDS = ['trip_id', 'food_id', 'lines_json', 'mine', 'choice', 'suggested', 'buy', 'bought'];

var FOOD_LOG_FIELDS = [
  'id', 'date', 'slot', 'food_id', 'recipe_id', 'qty', 'unit', 'grams',
  'kcal', 'protein_g', 'carbs_g', 'fat_g', 'partial', 'source', 'logged_at', 'created', 'updated',
];

var COOK_FIELDS = ['id', 'recipe_id', 'date', 'rating', 'note', 'plan_id', 'created'];

var CONFIG_FIELDS = ['key', 'value', 'updated'];

/** Every tab, in the order `ensureSchema` creates them. */
var TABS = {
  Foods: {
    fields: FOOD_FIELDS,
    key: ['id'],
    kinds: {
      kcal_100g: 'num', protein_100g: 'num', carbs_100g: 'num', fat_100g: 'num',
      servings_json: 'json', buy_unit_g: 'num', usually_have: 'bool', regular: 'bool',
      packs_json: 'json', never_shop: 'bool', verified: 'bool',
    },
  },
  Recipes: { fields: RECIPE_FIELDS, key: ['id'], kinds: { servings: 'num', total_min: 'num' } },
  RecipeLines: {
    fields: RECIPE_LINE_FIELDS,
    key: ['recipe_id', 'line_id'],
    kinds: { position: 'num', qty: 'num', grams: 'num', optional: 'bool' },
  },
  Steps: { fields: STEP_FIELDS, key: ['recipe_id', 'position'], kinds: { position: 'num' } },
  Walkthroughs: { fields: WALKTHROUGH_FIELDS, key: ['recipe_id'], kinds: { format: 'num', walkthrough_json: 'json' } },
  Plan: { fields: PLAN_FIELDS, key: ['id'], kinds: {} },
  Trips: { fields: TRIP_FIELDS, key: ['id'], kinds: {} },
  TripItems: {
    fields: TRIP_ITEM_FIELDS,
    key: ['trip_id', 'food_id'],
    kinds: { lines_json: 'json', mine: 'bool', suggested: 'bool', bought: 'bool' },
  },
  FoodLog: {
    fields: FOOD_LOG_FIELDS,
    key: ['id'],
    kinds: {
      qty: 'num', grams: 'num', kcal: 'num', protein_g: 'num', carbs_g: 'num', fat_g: 'num', partial: 'bool',
    },
  },
  Cooks: { fields: COOK_FIELDS, key: ['id'], kinds: { rating: 'num' } },
  Config: { fields: CONFIG_FIELDS, key: ['key'], kinds: {} },
};

var TAB_ORDER = [
  'Foods', 'Recipes', 'RecipeLines', 'Steps', 'Walkthroughs', 'Plan', 'Trips', 'TripItems', 'FoodLog', 'Cooks',
  'Config',
];

/** The prefix an API-made id gets, by entity. */
var ID_PREFIXES = { food: 'fd', recipe: 'rc', plan: 'pl', trip: 'tr', log: 'lg', cook: 'ck' };

var FOOD_KINDS = ['ingredient', 'packaged'];
var STORES = ['ks', 'costco', 'other'];
var FOOD_SOURCES = ['usda', 'off', 'label', 'manual'];
var SLOTS = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];
var TRIP_STATUSES = ['open', 'closed'];
var TRIP_CHOICES = ['have', 'ks', 'costco', 'other'];
var LOG_SOURCES = ['app', 'mcp'];

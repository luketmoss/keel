# CLAUDE.md — forage

Menu planning, recipes, shopping and a food log for two people, with a Google
Sheet as the data layer, in two components:

- **frontend/** — a Preact SPA (Vite)
- **apps-script/** — a Google Apps Script API (clasp), the one Forage API that
  the app and the MCP tools both write through

Workspace rules live in the root `CLAUDE.md` and `CONVENTIONS.md`: the board,
the pipeline and its skills, and CI. This file covers only what is specific to
Forage.

## History

Forage is a rebuild inside Keel (epic #700), not a port. It began in
`luketmoss/forage`, which is frozen. Since the cutover (#715) the old URL,
`https://luketmoss.github.io/forage/`, is only a redirect: that repo's Pages
site now publishes a single redirect page (luketmoss/forage#13), which sends
every path, query and hash to the same place under
`https://luketmoss.github.io/keel/forage/`. The old repo's open issues,
luketmoss/forage#2 to luketmoss/forage#7, were closed as not planned,
superseded by the rebuild, and were not transferred; its board, Project 5, is
closed. No git history was imported: the code here is written fresh, and the
only files carried over are reference copies in `docs/reference/` (below). A bare `#N` in Keel is a
Keel issue; the old repo's issues are cited `luketmoss/forage#N`.

`docs/reference/` holds, as reference only, the old Worker's JSON-LD recipe
extractor and its test (`parsing.ts`, `parsing.test.ts`, from
`worker/src/` at `luketmoss/forage@e6dc1ae`) and the old app's five icons
(`icons/`). Neither component compiles or tests them. #706 moves the extractor
into code and #702 starts from the icons.

`frontend/` is published to `https://luketmoss.github.io/keel/forage/` by
`.github/workflows/forage-pages.yml` (#705) on every push to `main` that
touches it, `auth/` or `ui/`. The build gets `FORAGE_GOOGLE_CLIENT_ID` and
`FORAGE_API_URL` only; the API key and Sheet ID never reach the client.
`apps-script/` is deployed by the owner (`clasp`), never by CI or a session.

## Stacks

| Path | Stack |
|---|---|
| `frontend/` | web |
| `apps-script/` | apps-script |

**View library:** preact

The authoritative conventions for each component are in its stack skill:
`.claude/skills/stack-web/SKILL.md` and
`.claude/skills/stack-apps-script/SKILL.md`. Paths outside both, such as
`docs/` and this file, get the workspace rules and this file.

## Data model

A Google Sheet behind the Apps Script API (#703). `apps-script/src/types.js`
holds each tab's `<TAB>_FIELDS`, the only definition of its layout. **Columns
are appended, never moved**: agents, the API and the Worker read by position.
Booleans are stored `TRUE` or blank. **Blank means unknown, never `0`**: no
code path defaults a nutrition value or a weight to `0`. "JSON" is one cell of
JSON text. Ids a caller sends are kept (sending one again upserts); otherwise
the API makes `<prefix>_` + 8 hex: `fd_`, `rc_`, `pl_`, `tr_`, `lg_`, `ck_`.
The tabs are created by `scripts/migrate-703-create-tabs.mjs`, which calls the
key-only `ensureSchema`; run it again after a release that adds a tab (#713) or
columns (#755): an existing tab whose header row is exactly a prefix of its
fields gets the missing header names appended, and one that is not is left
alone and named.
Nutrition (unit conversion, per serving, the partial rule) is computed only in `apps-script/src/nutrition.js`; the
plan's derived fields (a meal's kcal a serving, partial, trip status) and the Plan banner's count, `not_on_trip`, only in
`apps-script/src/plan.js` (#709); a trip's items, what the meals need, the default choices and the stale-line
prune only in `apps-script/src/trips.js` (#718, behind `startTrip`, `setTripItem`, `closeTrip`, `discardTrip`,
`getTrip`; #719 adds `addToTrip`, `removeTripItem`, `buy`, late meals and the last-buy write on close); and recipe import
(reading pages, the ingredient line parser, matching lines to foods) only in
`apps-script/src/importer.js`, behind the one `importRecipe` action (#706).
The food library (#707): the Open Food Facts lookup is `barcode.js` (`lookupBarcode`, writes nothing), and
the starter list is `starter.js`, about 75 USDA SR Legacy foods **generated** by
`scripts/build-starter-foods.mjs` from the SR Legacy JSON download and `scripts/starter-aliases.json`
(run by hand, output committed; never edit it), served by `starters.js` (`getStarterFoods`,
`addStarterFoods`, and the import's starter suggestions). Forage makes no USDA call and has no USDA key.

| Tab | Key | Columns |
|---|---|---|
| **Foods** | `id` | id, name, kind, brand, category, kcal_100g, protein_100g, carbs_100g, fat_100g, servings_json, buy_unit, buy_unit_plural, buy_unit_g, usual_store, usually_have, regular, packs_json, last_buy, last_bought_on, never_shop, source, source_ref, verified, barcode, created, updated, satfat_100g, transfat_100g, cholesterol_mg_100g, sodium_mg_100g, fiber_100g, sugars_100g, added_sugars_100g |
| **Recipes** | `id` | id, name, source_url, source_site, servings, total_min, notes, created, updated |
| **RecipeLines** | `recipe_id` + `line_id` | recipe_id, line_id, position, section, text, qty, unit, food_id, grams, optional |
| **Steps** | `recipe_id` + `position` | recipe_id, position, section, name, text |
| **Walkthroughs** | `recipe_id` | recipe_id, format, walkthrough_json, updated |
| **Plan** | `id` | id, date, slot, recipe_id, note, trip_id, created, updated |
| **Trips** | `id` | id, status, through, created, closed_at |
| **TripItems** | `trip_id` + `food_id` | trip_id, food_id, lines_json, mine, choice, suggested, buy, bought |
| **FoodLog** | `id` | id, date, slot, food_id, recipe_id, qty, unit, grams, kcal, protein_g, carbs_g, fat_g, partial, source, logged_at, created, updated, satfat_g, transfat_g, cholesterol_mg, sodium_mg, fiber_g, sugars_g, added_sugars_g |
| **Cooks** | `id` | id, recipe_id, date, rating, note, plan_id, created |
| **Config** | `key` | key, value, updated |
| **MCPChangeLog** | — | logged_at, call_id, action, tab, row_key, before, after |

What the columns mean:

- **Foods.** `kind` is `ingredient` or `packaged`. The four nutrition columns
  are per 100 g, all set or all blank; all blank is "no nutrition yet". A
  packaged food's label serving is stored per 100 g. `servings_json` is
  `[{"name":"cup","g":125},{"name":"clove","g":3}]`, named servings in grams,
  in order. `buy_unit` / `buy_unit_plural` / `buy_unit_g` is the shopping unit
  (`can (6 oz)` / `cans (6 oz)` / `170`). `usual_store` is `ks`, `costco`,
  `other` or blank; `usually_have` is a staple, which shopping defaults to
  "have". `regular` lists the food in "your regulars"; `packs_json` is its pack
  sizes, a JSON array of text; `last_buy` is the pack or amount bought last
  time and `last_bought_on` its date. `never_shop` keeps it off shopping lists
  (water). `source` is `usda`, `off`, `label` or `manual`; `source_ref` the FDC
  id or Open Food Facts code; `verified` means checked against the label,
  which shared Open Food Facts data needs. The seven after `updated` (#755) are
  saturated fat, trans fat, cholesterol (mg), sodium (mg), fiber, sugars and
  added sugars, per 100 g (`EXTRA_NUTRIENTS` in `nutrition.js`). Each is blank
  (unknown) or a number ≥ 0, independently, and can be set only on a food with
  the core four; a food with the four and none of the seven still has
  nutrition. `upsertFood` refuses, naming the fields, saturated + trans more
  than fat, fiber more than carbs, sugars more than carbs, added sugars more
  than sugars (or carbs), and cholesterol or sodium over 100,000 mg, each
  checked only when both sides are set. Open Food Facts gives cholesterol and
  sodium in g, stored ×1000; the starter list has six from SR Legacy (no
  added sugars), and `scripts/backfill-755-starter-nutrition.mjs` filled them
  in for starter foods added before.
- **Recipes.** Rating and last cooked are not stored: reads derive them from
  Cooks (the latest non-blank rating, the latest date).
- **RecipeLines.** `line_id` is `L1`, `L2`… and stable for the life of the
  recipe, because walkthroughs cite it; a replace keeps the ids sent, and new
  lines are numbered after the highest used. `text` is the source's line,
  verbatim. `qty` is a number, blank when there is none. `unit` is normalised
  (`lb`, `tsp`, `cup`, `clove`, or blank for a bare count). `food_id` is blank
  until the line is matched. `grams` is an explicit weight that overrides
  conversion. `optional` lines count toward neither nutrition nor shopping.
- **Steps.** `section` is the source's heading ("For the sauce"), blank when
  none; `name` is the step's own title ("Brown the beef").
- **Walkthroughs.** `format` is `1`; `walkthrough_json` is the whole document,
  format v1 (#711, `forage/docs/design/711-walkthroughs.md`). Its rules are only
  in `apps-script/src/walkthroughs.js` (`validateWalkthrough`): `setWalkthrough`
  refuses a document that fails, listing every problem and saving nothing, and
  `getRecipe` (`walkthrough`, `walkthrough_check`) and `getRecipes`
  (`walkthrough_ok`) check the stored one against the current lines on read, so
  a recipe edit makes it stale rather than being refused. The app never runs it.
- **Plan.** `slot` is `Breakfast`, `Lunch`, `Dinner` or `Snacks`. Exactly one
  of `recipe_id` and `note` is set (a note is a night out or leftovers).
  `trip_id` is the trip the meal is on; "shopped" (its trip closed) is derived,
  never stored.
- **Trips.** `status` is `open` or `closed`, and at most one is open.
  `through` is the last date the trip shops for.
- **TripItems.** `lines_json` is `[{"plan_id","line_id","amt","grams"}]`, a
  snapshot of the meal lines taken when the item was built. `mine` means added
  by hand. `choice` is `have`, `ks`, `costco`, `other` or blank (not sorted);
  `suggested` means the choice came from the food's defaults. `buy` is the
  buying amount as text; `bought` a boolean.
  Only the trip actions write Trips and TripItems (#718): #703's row-level `createTrip`, `updateTrip`,
  `upsertTripItems` and `deleteTripItem` are gone, since they bypassed the trip rules.
- **FoodLog.** Exactly one of `food_id` and `recipe_id`. A food's `unit` is a
  serving name from `servings_json` or `g`; a recipe's is `serving`. `grams` is
  resolved for a food, blank for a recipe. `kcal`/`protein_g`/`carbs_g`/`fat_g`
  and `partial` are a **snapshot** the API computes when the entry is written
  and recomputes only when that entry's `qty`, `unit` or food changes (#712):
  editing a food or recipe later does not rewrite past days, and moving an
  entry to another meal keeps its numbers. `logFood` and `updateLogEntry` take
  `dry_run` (the entry as it would be stored, nothing written), the app's amount
  preview. `getFoodLogTotals` is the one read Thrive (#714) relies on, shaped in
  `forage/docs/design/712-food-log.md`: a date with nothing logged is absent, a
  sum is null only when every entry that day is blank, and `unknown_entries`
  counts the blank ones. `source` is `app` (token) or `mcp` (key), set by
  the API. `logged_at` is ISO UTC. The seven after `updated` (#755) are part of
  the snapshot by the same rule, each blank where the food or recipe lacks it
  (never 0); entries from before #755 keep them blank. A recipe's per serving
  and a day's totals sum each over the lines or entries that have it (null when
  none does) and count the rest in `per_serving_unknown` / `unknown`; none of
  the seven makes anything partial.
- **Cooks.** `rating` is 1–5, or blank when not rated. `plan_id` is set when
  the cook was the plan's meal.
- **Config.** `schema_version` (`2` since #713's MCPChangeLog, `3` since #755's nutrient columns), and `ingredient_aliases` (#706): a JSON
  object from a normalised ingredient name to the `food_id` a saved import
  matched it to. Later issues add keys here, not tabs.
- **MCPChangeLog** (#713). One row per sheet row a key-caller write created,
  changed or deleted: `row_key` is its key fields as JSON, `before` and `after`
  the whole row (field to display text), blank for a row that did not exist.
  Written only by `change-log.js`; nothing else reads it.

**Referential rules.** A write naming a food, recipe, plan entry or trip that
does not exist is refused, naming the id. Deleting a food used by a recipe
line or trip item is refused, listing the uses. Deleting a recipe deletes its
lines, steps, walkthrough and cooks (#708), and is refused while a plan or log entry uses it.

**Callers.** The MCP Worker sends `key` (the `API_KEY` script property, held
as `FORAGE_API_KEY`) and may run every action. The app sends `access_token`,
checked against `TOKEN_CLIENT_ID` and `TOKEN_ALLOWED_EMAIL`, and may run
`TOKEN_ACTIONS` in `auth.js`: everything but `getConfig`, `setConfig`,
`ensureSchema`, `getChangeLog` and `undoCall`. Either may POST form-encoded; a
`payload` over 45,000 characters is refused. A third caller (#714) is Thrive's
Day screen: an `access_token` issued to `TOKEN_THRIVE_CLIENT_ID` (Thrive's OAuth
client ID, an identifier) for the same `TOKEN_ALLOWED_EMAIL`, which may run
`THRIVE_TOKEN_ACTIONS` in `auth.js`, only `getFoodLogTotals`, and is refused
every other action. With the property unset there is no such caller.

## MCP tools

Agents reach Forage through two connectors in the Keel MCP Worker (#713):
`Forage` (read, `/forage/mcp`) and `Forage (write)` (`/forage/write/mcp`),
normally off. Anything the app can do, an agent can do through them, and the
tests hold that true:

- **Where a tool is registered:** `mcp/src/forage/tools.ts`. A tool is a write
  tool unless it is in `FORAGE_READ_TOOLS` there. `mcp/docs/forage-tools.md`
  is the table of every tool and the steps for adding one. A PR adding one
  changes `mcp/**` and is human-reviewed.
- **Undo.** Every key-caller write is logged by `withChangeLog`
  (`apps-script/src/change-log.js`) for the tabs `CHANGE_LOGGED_ACTIONS` names;
  `getChangeLog` and `undoCall` (key-only) read and revert it, all or nothing.
  Token callers (the app) are never logged. `undoCall` refuses a row changed
  since, and refuses to remove a food, recipe, plan entry or trip that a row
  outside the call still uses. A key write is refused while the tab is missing.
- **Parity.** `apps-script/tests/mcp-parity.test.ts` fails when an action in
  `main.js` has no tool and is on neither `NO_TOOL` (with a reason) nor
  `PENDING_TOOLS` (with its feature issue), when a pending action already has a
  tool, and when a write action is on neither `CHANGE_LOGGED_ACTIONS` nor
  `NOT_LOGGED`. A feature issue (#707 foods, #708 recipes and cooks, #709 plan,
  #710 trips, #711 walkthroughs, #712 food log) removes its actions from
  `PENDING_TOOLS` in the PR that adds their tools; since #712 the list is empty. `forage.yml` runs on
  `mcp/src/forage/**` as well, so a Worker change runs it too.

## Key commands

- `npm --prefix frontend run dev` — Vite dev server on port 5177, at
  `http://localhost:5177/` (the `forage` entry in the root `.claude/launch.json`)
- `cd frontend && npm run format` before committing (Prettier: single quotes,
  semicolons; CI runs `format:check`)
- `cd frontend && npm test` / `npm run typecheck` / `npm run build`
- `frontend/.env.local` (gitignored, from `.env.example`): `VITE_GOOGLE_CLIENT_ID`
  for sign-in, whose OAuth client must list the origin as an authorized
  JavaScript origin (`http://localhost:5177` for dev); `VITE_DEMO_MODE=true`
  lets `?demo=true` open signed in as the demo user with no request to Google
- `cd apps-script && npm test` / `npm run typecheck` — sandboxed `node:vm`
- `node scripts/check-import-urls.mjs scripts/import-urls/urls.txt scripts/import-urls/heldout.txt`
  — dry-runs `importRecipe` against the deployed API for each URL (the owner's,
  with `FORAGE_API_URL` and `FORAGE_API_KEY` prompted for; usage in the file)
- A session never runs `clasp`; `apps-script/.clasp.json` is gitignored and
  `.clasp.json.example` is the template
- The user's terminal is PowerShell 5.1 — no `&&`; use `;` or separate commands

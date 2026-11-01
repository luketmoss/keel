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
`luketmoss/forage`, which is frozen and still serves the old app at
`https://luketmoss.github.io/forage/` until the cutover (#715). No git history
was imported: the code here is written fresh, and the only files carried over
are reference copies in `docs/reference/` (below). A bare `#N` in Keel is a
Keel issue; the old repo's issues are cited `luketmoss/forage#N`.

`docs/reference/` holds, as reference only, the old Worker's JSON-LD recipe
extractor and its test (`parsing.ts`, `parsing.test.ts`, from
`worker/src/` at `luketmoss/forage@e6dc1ae`) and the old app's five icons
(`icons/`). Neither component compiles or tests them. #706 moves the extractor
into code and #702 starts from the icons.

Nothing is deployed from this folder yet: there is no Pages workflow (#705), no
Apps Script project and no Sheet (the owner's steps in #700).

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
key-only `ensureSchema`. Nutrition (unit conversion, per serving, the partial
rule) is computed only in `apps-script/src/nutrition.js`.

| Tab | Key | Columns |
|---|---|---|
| **Foods** | `id` | id, name, kind, brand, category, kcal_100g, protein_100g, carbs_100g, fat_100g, servings_json, buy_unit, buy_unit_plural, buy_unit_g, usual_store, usually_have, regular, packs_json, last_buy, last_bought_on, never_shop, source, source_ref, verified, barcode, created, updated |
| **Recipes** | `id` | id, name, source_url, source_site, servings, total_min, notes, created, updated |
| **RecipeLines** | `recipe_id` + `line_id` | recipe_id, line_id, position, section, text, qty, unit, food_id, grams, optional |
| **Steps** | `recipe_id` + `position` | recipe_id, position, section, name, text |
| **Walkthroughs** | `recipe_id` | recipe_id, format, walkthrough_json, updated |
| **Plan** | `id` | id, date, slot, recipe_id, note, trip_id, created, updated |
| **Trips** | `id` | id, status, through, created, closed_at |
| **TripItems** | `trip_id` + `food_id` | trip_id, food_id, lines_json, mine, choice, suggested, buy, bought |
| **FoodLog** | `id` | id, date, slot, food_id, recipe_id, qty, unit, grams, kcal, protein_g, carbs_g, fat_g, partial, source, logged_at, created, updated |
| **Cooks** | `id` | id, recipe_id, date, rating, note, plan_id, created |
| **Config** | `key` | key, value, updated |

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
  which shared Open Food Facts data needs.
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
- **Walkthroughs.** `format` is `1`; `walkthrough_json` is the whole document.
  The API checks only that it is JSON with `format` 1 and the right `recipe`;
  its structure is #711's.
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
- **FoodLog.** Exactly one of `food_id` and `recipe_id`. A food's `unit` is a
  serving name from `servings_json` or `g`; a recipe's is `serving`. `grams` is
  resolved for a food, blank for a recipe. `kcal`/`protein_g`/`carbs_g`/`fat_g`
  and `partial` are a **snapshot** the API computes when the entry is written
  and recomputes only when that entry is edited: editing a food or recipe later
  does not rewrite past days. `source` is `app` (token) or `mcp` (key), set by
  the API. `logged_at` is ISO UTC.
- **Cooks.** `rating` is 1–5, or blank when not rated. `plan_id` is set when
  the cook was the plan's meal.
- **Config.** `schema_version` (`1`). Later issues add keys here, not tabs.

**Referential rules.** A write naming a food, recipe, plan entry or trip that
does not exist is refused, naming the id. Deleting a food used by a recipe
line or trip item is refused, listing the uses. Deleting a recipe deletes its
lines, steps and walkthrough, and is refused while a plan or log entry uses it.

**Callers.** The MCP Worker sends `key` (the `API_KEY` script property, held
as `FORAGE_API_KEY`) and may run every action. The app sends `access_token`,
checked against `TOKEN_CLIENT_ID` and `TOKEN_ALLOWED_EMAIL`, and may run
`TOKEN_ACTIONS` in `auth.js`: everything but `getConfig`, `setConfig` and
`ensureSchema`. Either may POST form-encoded; a `payload` over 45,000
characters is refused.

## Key commands

- `npm --prefix frontend run dev` — Vite dev server on port 5177, at
  `http://localhost:5177/` (the `forage` entry in the root `.claude/launch.json`)
- `cd frontend && npm run format` before committing (Prettier: single quotes,
  semicolons; CI runs `format:check`)
- `cd frontend && npm test` / `npm run typecheck` / `npm run build`
- `cd apps-script && npm test` / `npm run typecheck` — sandboxed `node:vm`
- A session never runs `clasp`; `apps-script/.clasp.json` is gitignored and
  `.clasp.json.example` is the template
- The user's terminal is PowerShell 5.1 — no `&&`; use `;` or separate commands

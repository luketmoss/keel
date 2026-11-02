# Forage tools

Reference for the `forage_*` tools served at `/forage/mcp` (read) and `/forage/write/mcp` (write), #713. Every Forage
tool is added to the table below by the issue that registers it. The tool descriptions in `src/forage/tools.ts` are what
an agent actually sees, and are the source of truth; the wording of their results is fixed by
[`docs/design/713-forage-connectors.md`](design/713-forage-connectors.md).

## How it works

The tools are a **thin client of the Forage Apps Script API** (`forage/apps-script/`, #703), called with the Worker's
`FORAGE_API_KEY`. They hold no row mapping and never touch the sheet: `src/forage/api.ts` is the only file that talks to
the outside world. Recipe parsing, ingredient matching and nutrition are all the API's (#706, `importer.js` and
`nutrition.js`), so the app and an agent cannot disagree about what a line means. **A change to `forage/apps-script/` that
alters a response shape needs a matching change here.**

Every request is a form-encoded POST: the key and the payload stay out of the URL. Writes are sent once and never
retried, carry the tool call's `call_id` so the API logs their rows for `forage_undo`, and count against the write limits
(`mcp/CLAUDE.md`, "Write limits"). Reads and dry runs carry no `call_id` and are never counted.

## Tools

| Tool | Endpoint | Calls | Description |
|------|----------|-------|-------------|
| `forage_status` | read | `getConfig` | Whether the API answers, and its schema version |
| `forage_import_recipe` | write | `importRecipe` | Import from exactly one of `url`, `jsonld`, `text` or `recipe` (structured, e.g. from a photo). A dry run by default (`dry_run` true): the recipe as read, each line's match or suggestions, nutrition per serving. `dry_run: false` saves it, unmatched lines as unmatched; `allow_duplicate` saves a link already in Forage. Over `MAX_ROWS_PER_CALL` rows (recipe + lines + steps) it previews until `confirm: true` |
| `forage_search_foods` | read | `getFoods`, `getStarterFoods` | Foods by `q`, `kind`, `regular`, `barcode`, up to `limit` (20): compact rows (`id, name, brand, kind`, the four per-100 g values, `has_nutrition, verified, source`), as JSON. `include_starter` adds the starter list's matches with `starter_id`, `in_library` and `can_fill` (#707) |
| `forage_get_food` | read | `getFood` | One food, whole: weights, shopping fields, source, `verified` and `used_by` (#707) |
| `forage_add_food` | write | `lookupBarcode`, `addStarterFoods`, `upsertFood` | Exactly one of `barcode` (Open Food Facts, a read), `starter_id`, `food` (the form's fields: `per_serving` with `serving`, or `per_100g`; `source` `usda` needs `source_ref`, `off` only through `barcode`) or `foods` (up to 20, one `upsertFood` each under the call's one `call_id`: one write, its rows counted, one `forage_undo`). A dry run by default; `verified` only when the owner checked the label (#707) |
| `forage_update_food` | write | `upsertFood`, `setFoodWeight` | `id` plus the fields to change; `weights` sets or replaces each named weight it lists (#707) |
| `forage_delete_food` | write | `deleteFood` | Refused while a recipe or trip uses the food, naming the recipes. `destructiveHint` (#707) |
| `forage_undo` | write | `getChangeLog`, `undoCall` | No arguments: the last 20 calls. `call_id`: a dry run listing every row it would restore, remove or recreate. `confirm: true`: reverts, all or nothing. Refused when a row changed since, or when a row it would remove is now used elsewhere. `destructiveHint` |

## Adding a tool

A Forage feature issue (#707 foods, #708 recipes and cooks, #709 plan, #710 trips, #711 walkthroughs, #712 food log)
that registers a tool, in the same PR:

1. Registers it in `src/forage/tools.ts`, and adds it to `FORAGE_READ_TOOLS` if it only reads. Anything not in that set
   is served on the write endpoint.
2. Removes the actions it calls from `PENDING_TOOLS` in `forage/apps-script/tests/mcp-parity.test.ts`, which fails while
   an action with a tool is still pending, or an action has neither.
3. Checks that its write actions are in `CHANGE_LOGGED_ACTIONS` (`forage/apps-script/src/change-log.js`) with every tab
   they can change, so `forage_undo` can revert them.
4. Adds a row to the table above.

The PR changes `mcp/**`, so it is human-reviewed.

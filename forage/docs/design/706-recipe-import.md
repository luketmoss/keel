# 706 — Forage recipe import

Specifies [#706](https://github.com/luketmoss/keel/issues/706). Tokens, spacing and touch targets come from
[`suite-language.md`](../../../ui/docs/design/suite-language.md); the shell, header and account button from
[`704-app-shell.md`](704-app-shell.md). The layout reference is the approved prototype
(https://claude.ai/artifact/JYyHpvdbgohjmzZZsN7jY1), whose Library header carries an **Import** button and whose
sheets rise from the bottom. There are no standing documents in `forage/docs/design/` beyond #702 and #704.

The behaviour of parsing and matching is in the issue body; this note is what the person sees. Every length is a
token (`--space-md`, `--radius-lg`, `--text-sm`…); nothing here introduces a new one.

## Main path

1. Library → **Import** (primary, small, in the header beside the account button).
2. The import sheet opens with the link field focused. The person pastes a link and taps **Read recipe**, or
   chooses another route (below).
3. "Reading the recipe…" with a spinner, up to 30 seconds. The review screen replaces the sheet.
4. The person checks the lines, answers "Which food is this?" for any unmatched one (or taps **Add N new foods**),
   fixes the servings if it is blank, and taps **Save recipe**.
5. Back in Library the new recipe is at the top of the list, with "Saved <name>" in a status line for four seconds.

## Import sheet

A bottom sheet, `--radius-lg` on the top corners, on `--color-surface-raised`, over `--color-overlay`. Title
"Import a recipe". Close button top right (44px) and Escape.

| Part | Content |
|---|---|
| Link | Label "Recipe link", URL input (`inputmode="url"`, no autocorrect), primary button "Read recipe", disabled until the field holds an `http(s)` URL |
| Divider | "Site won't open? Use the page itself" in `--color-text-secondary` |
| Bookmarklet | A draggable link "Forage import" with one line under it: "Drag this to your bookmarks bar. On a recipe page, tap it, then come back here and paste." |
| File or paste | A "Choose a file" button (`.html .htm .json .txt .md`) and a paste box labelled "Or paste the copied recipe, or the recipe as text", 6 rows, button "Read pasted recipe", disabled while empty |

The bookmarklet is shown collapsed under the divider until a link fails or the person opens it (a disclosure
button, `aria-expanded`), so the common path is one field and one button. After a `blocked` answer it is open.

### Sheet states

| State | Shows |
|---|---|
| Idle | as above |
| Reading | the form is disabled, a `role="status"` line "Reading the recipe…", spinner; a "Cancel" text button closes the request |
| `blocked` | `role="status"` in `--color-warning` on `--color-warning-light`: "That site won't let Forage read the page. Open the recipe in your browser, tap the Forage import bookmark, then paste here." The bookmarklet disclosure opens and the paste box is focused |
| `unreachable` | "Couldn't reach that page. Check the link and try again." Buttons: "Try again" (primary), and the open-page route stays available |
| `no_recipe` | "No recipe found on that page. Try the saved page, or paste the recipe as text." The file and paste area is focused |
| `bad_url` | "That doesn't look like a web link." under the field in `--color-danger-text`; nothing is sent |
| Too large | "That page's recipe data is too big to send. Paste just the recipe text instead." |
| Not signed in / expired | The shell's existing sign-in handling; the sheet stays open with the field kept |
| Offline | "You're offline. Importing needs a connection." The Read buttons stay disabled |

The messages are fixed strings keyed on the API's reason; the app never shows an API error body.

### Paste detection

The paste box and the file picker share one reader. Text that starts with `{` or `[` is JSON: an object with
`"forage":1` is a bookmarklet payload, one with `@type` or `@graph` is JSON-LD, one with `lines` is a structured
recipe. Text containing `<script` or `<html` is parsed as a page. Anything else is the plain-text format. A file
the reader can make nothing of gives `no_recipe`.

## Review screen

A full screen over the shell (no tab bar), with a header: **Back** (44px) left, "Review recipe" centred, and
nothing on the right. Back asks "Discard this import?" with **Discard** and **Keep editing** only when something
has been edited.

Top to bottom, in one scrolling column with `--space-md` padding and the actions pinned at the bottom:

1. **Notice (only if present).** "Already in your library" in `--color-warning` on `--color-warning-light`, with the
   existing recipe's name and the buttons "Import again" and "Cancel". Save stays disabled until "Import again".
2. **Recipe card.** Name (editable text), **Servings** (number input, `inputmode="numeric"`), **Time** in minutes
   (optional), and the source host as a link. A blank servings field shows "How many does it serve?" under it in
   `--color-danger-text`, and blocks Save.
3. **Nutrition line.** "About 520 kcal a serving" in `--text-lg`, and under it, in `--text-sm`
   `--color-text-secondary`, either "Every line is counted" or "Partial: 3 lines have no food or weight". While no
   food has nutrition (always true until #707): "No nutrition yet. Foods get theirs from the library." The line
   updates when lines are matched or edited, from a fresh dry run.
4. **Ingredients.** A card per section; the section heading is the card's label, and the first card has none when
   the source gave no heading. One row per line (44px minimum, the whole row is a button that opens line edit):
   - Line 1: the parsed amount and name, `1.5 cup · all-purpose flour`, in `--text-base`.
   - Line 2, `--text-sm` `--color-text-secondary`: the original text if it differs from line 1, and the note.
   - Right side, the status, always text as well as colour:
     - matched: the food's name with a check, `--color-success`;
     - unmatched: **Which food is this?** in `--color-primary`;
     - optional or to taste: "To taste, not counted" / "Optional, not counted" in `--color-text-muted`;
     - a flagged line adds a small tag next to its amount: "range" (title: "Used the low end, 1–2"),
       "package" ("1 can, 425 g"), or "or <alternative>".
5. **Add N new foods.** A secondary full-width button above the ingredient cards, shown only while N ≥ 1:
   "Add 12 new foods". It creates a food with just a name for each distinct unmatched name and matches the lines.
   While it runs the button reads "Adding…" and is disabled. If some creations fail, the lines that did match
   stay matched and a status line says "Added 9 of 12. Try again for the rest."
6. **Steps.** A card per section, collapsed behind one row, "Steps (10)", expandable (`aria-expanded`); expanded,
   a numbered list of the step text. Steps are read-only in this screen.
7. **Actions.** Pinned above the safe-area inset and clear of any tab bar (there is none here): **Save recipe**
   (primary, full width) with "3 lines still need a food" in `--text-sm` above it when N ≥ 1. Saving with those
   lines is allowed; the copy states the consequence rather than blocking.

### Which food is this? (chooser)

Opened from a line's status or from line edit. A bottom sheet with the line's text at the top, a search field
(focused, filters library foods by name as you type, case-insensitive, substring), then:

- **Suggested** (if any, from the API): up to three foods.
- **Your foods**: matches for the search, 8 shown, "Show more" for the rest.
- **New food: <cleaned name>** at the top of the results whenever the search text is not an existing food's exact
  name; creates a food with just that name.
- **Leave unmatched** at the bottom.

Choosing returns to the review screen with the line matched, and the preview line refreshes. An empty library
shows only the New food row and the sentence "Your library is empty. The first foods you add here are kept for the
next recipe."

### Line edit

A bottom sheet from tapping a row. Fields: Amount (text, accepts `1 1/2`, `½` and `1-2`; reparsed the same way
the API does), Unit (a list of the unit vocabulary plus "none"), Name, Food (a row opening the chooser), and an
**Optional** switch ("Not counted in nutrition or on shopping lists"). Buttons: **Done** and **Remove line**
(danger text; removes with no confirm because Back-and-reimport recovers it). The verbatim source text is shown
read-only at the top and is never changed by editing, because walkthroughs cite the line.

### Review states

| State | Shows |
|---|---|
| Loading a refresh | The nutrition line shows "Updating…"; nothing else moves |
| Saving | Save disabled, "Saving…", the screen inert |
| Save refused | `role="status"` above Save in `--color-danger-text`: "Couldn't save: <fixed reason>", for example "servings is required" or "a food for line 4 no longer exists". The screen stays editable |
| Save failed (network) | "Couldn't save. Your edits are kept here. Try again." |
| Saved | Closes to Library with "Saved <name>" |
| Zero lines | Cannot occur from a successful read; if every line is removed, Save is disabled with "A recipe needs at least one ingredient" |

## Library

The Library tab (#704) keeps its header and account button and gains **Import**. Its empty state (copy by #704)
is unchanged until a recipe exists. With recipes: one card of rows, newest first, each row 44px or more:
name, then `serves 6 · example.com · 520 kcal` (`partial` replacing the figure when partial; nothing for
nutrition when no food has any). Rows are not links until #708; each has a "…" button (44px) with one action,
**Delete recipe**, which asks "Delete <name>? Its ingredients and steps go with it." with **Delete** (danger) and
**Cancel**. A recipe used by a planned or logged meal cannot be deleted, and the answer names it: "Used by 2
planned meals. Remove those first."

## Demo mode

The demo layer answers a URL import with one bundled sample recipe (a short, original recipe, not copied from a
site), and every route reaches the same review screen. Saving adds the recipe to the in-memory list. Reload
resets it. The demo banner of #704 stays visible on the review screen.

## Accessibility and layout

- 375px: no horizontal scroll; long ingredient names wrap; the amount tag row wraps rather than truncates.
- Every control is at least 44px. Sheets trap focus, restore it to the opener on close, and close on Escape.
- Status changes are in `role="status"` regions. The matched/unmatched status is text, not colour alone.
- Reduced motion: the sheet appears without sliding.

## MCP tool `forage_import_recipe` (registered by #713)

Specified here so #713 can build it without rereading the issue.

- **Endpoint:** the write connector. It writes only when `dry_run` is false; it is still listed there so the
  preview and the save are one tool.
- **Inputs:** `url`, `jsonld`, `text` or `recipe` (exactly one), `dry_run` (default true), `allow_duplicate`.
  `recipe` is the structured form: `{name, servings, total_min?, source_url?, notes?, lines, steps}`.
- **Result:** the preview of the issue body with `dry_run` true; the stored recipe with it false. On a refusal,
  the API's fixed text and, for `duplicate_of`, the existing recipe's id and name.
- **Reminder text:** a successful save ends with the connector's "Forage (write) is on" reminder (#713), naming the
  recipe saved and how many lines are unmatched.
- **Undo:** a save is undone by `forage_undo` removing the recipe (#713 decides how).
- **A photo or a PDF** is turned into a `recipe` by Claude, then previewed with `dry_run`, then saved.

## New tokens

None.

## Measured

Nothing is measurable yet: there is no running Forage app, and the 44px and 375px criteria are checked in `/test`
against the built app. The parse and match rates cited in the issue are from the spike runs
(`scratchpad/forage-rebuild/spike/run-first.txt` and `run-heldout.txt`: 141 of 147 and 89 of 95 lines with a
quantity).

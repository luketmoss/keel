# 33 — Create, list, and delete trips

Tokens and layout from [2-map-shell.md](2-map-shell.md). Route and shell
structure from [30-route-shell.md](30-route-shell.md) — this issue fills in
what `/trips` actually renders, replacing that issue's placeholder. Status
pill styling matches what [35-trip-detail-view.md](35-trip-detail-view.md)
already commits to, so a trip looks the same whether you're looking at the
list or the detail header.

Only the main content region changes — the sidebar (brand, nav, import panel,
track list) is unaffected, per #30.

## Layout

```
┌──────────────────────────────────────┐
│  Trips                                │
│  [ Trip name______________ ] [ Create ]│
├──────────────────────────────────────┤
│  Hokkaido                    planned  │
│  No dates set                      ×  │
├──────────────────────────────────────┤
│  Iceland ring road           planned  │
│  No dates set                      ×  │
└──────────────────────────────────────┘
```

Same region `MapView` occupies on `/`: remaining width beside the sidebar,
full viewport height, `--surface-solid` background. Content is a single
column, `max-width: 480px`, left-aligned, `padding: 32px`, not centered like
#30's placeholder was — a form and a list read as a document, not a status
message. The list scrolls internally past the bottom of the viewport; the
create form stays put above it (same "header fixed, body scrolls" split as
the sidebar in #2).

## Create form

Always visible, above the list, never a modal — nothing else in cairn opens
one, and a trip is too lightweight a thing to warrant an interruption.

Text input (placeholder `Trip name`) plus a `Create` button, laid out in a
row. Enter in the input submits, same as clicking `Create`.

## Trip row

- **Name** — 14px `--text`, truncated with ellipsis past the row width, full
  name in `title` (same rule as file rows in #6 and the trip name in #34/#35)
- **Status pill** — every trip created here starts `planned`, styled exactly
  as #35 defines it: small pill, `--accent`
- **Dates** — `No dates set`, 12px `--text-muted` (dates aren't captured at
  creation; setting them is #35's job). Second line, under the name
- **Remove** — `×` icon button, `--text-muted` going `--danger` on hover,
  `aria-label="Delete <name>"` — same treatment as the file-row remove
  control in #6

Rows separated by a 1px `--border` rule, matching #6. No hover highlight on
the row itself — clicking anywhere but the row navigates to `/trips/:id`
(#30's existing route; it shows that issue's placeholder until #35 ships),
so a highlight belongs on the row, not implying the whole row is one control
distinct from its buttons... concretely: the name and dates area is a link to
`/trips/:id`, hover shows `--text` on the name only, `×` is a separate hit
target that stops propagation so deleting never triggers navigation.

Newest-created trip at the **top** of the list. Unlike the track list (#6,
which orders by import so early files don't shift), a trips list is
something you come back to over weeks — the trip you just planned is the one
you're most likely to open next.

## Main path

1. `/trips` loads. List reads the local trip index, renders every trip as a
   row, newest first.
2. User types a name into the create form and presses Enter or clicks
   `Create`.
3. The new trip is written to storage (record + index) and its row appears
   at the top of the list immediately — no confirmation toast, the row
   appearing is the confirmation (same stance as #4's import).
4. The input clears and keeps focus, so creating several trips in a row
   doesn't require re-clicking into the field.

## States

**Empty** — no trips exist yet. Create form is unchanged (always visible).
Below it, centred in the remaining column width, 14px `--text-muted`:

> **No trips yet**
> Create one above to start organizing your tracks.

**Populated** — rows as above.

**Validation error** — submitting with an empty or whitespace-only name.
The input gets a `--danger` border and, beneath it, 12px `--danger`:

> A trip needs a name.

No round trip: this is a client-side check before anything is written. The
message clears as soon as the user types a non-whitespace character, and the
input keeps focus rather than the failed submission losing the user's place.

**Deleting** — clicking `×` replaces that row's content in place (row stays
in the list, at its same position) with a confirmation, rather than a native
`confirm()` dialog — nothing else in cairn uses one, and an OS dialog over a
dark satellite-map UI is a jarring visual break:

> Delete "Hokkaido"? [ Delete ] [ Cancel ]

`Delete` is `--danger`, `Cancel` is `--text-muted`. Cancel, Escape, or
clicking anywhere else reverts the row to its normal display without
deleting. Only one row can be in this state at a time — opening a second
row's confirmation while one is already open reverts the first, same rule
#35 uses for its single-field-editing-at-a-time header.

**Deleted** — confirming removes the row immediately (record and index entry
both gone from storage) and, if that was the last trip, the view drops
straight to the Empty state.

## Copy

| Context | Copy |
|---|---|
| Input placeholder | `Trip name` |
| Submit button | `Create` |
| Empty-name error | `A trip needs a name.` |
| Delete confirm | `Delete "<name>"?` |
| Delete confirm buttons | `Delete` / `Cancel` |
| Empty list heading | `No trips yet` |
| Empty list subtext | `Create one above to start organizing your tracks.` |

## Edge cases

- **Duplicate trip names** — allowed, no uniqueness check. Matches the
  track list's stance on duplicate file imports (#4) — the user's own
  naming, not the app's to police.
- **Whitespace-only name** (`"   "`) — treated as empty; same validation
  error as a fully empty submission, name is trimmed before it's ever
  compared or stored.
- **Very long trip name** — truncates with ellipsis in the row, same as file
  names in #6 and the header name in #34/#35; full name still in `title`.
- **Rapid double-submit** (pressing Enter twice fast, or double-clicking
  Create) — each submit with a non-empty field creates a separate trip. No
  debounce: two trips named the same thing from a double-click is a rare,
  cheap-to-fix mistake (delete one), and guessing at "was that a duplicate
  submit or two intentional trips" is worse than doing what was asked twice.
- **Deleting while the create form has an error showing** — independent
  state; deleting a row doesn't touch the form's validation message.
- **Reload immediately after create or delete** — the write to storage
  happens synchronously before the row updates, so there's no window where a
  reload could lose or resurrect a trip.
- **Many trips (20+)** — list scrolls within its column, form stays fixed
  above it, same pattern as the sidebar's own scroll behaviour in #2.
- **Corrupted or unreadable local storage** (manually edited, quota
  exceeded, a future migration mismatch) — treated as empty: the list shows
  the Empty state rather than throwing, since a broken index is
  indistinguishable from "no trips" without a dedicated recovery flow this
  issue doesn't build. Out of scope beyond that: #33's proposal notes the
  index is a cache, not the truth, and reconciling it against real data
  becomes meaningful once #32/#34 give it something to reconcile against.

## Not decided here

Whether the create form and list live in one component or split is an
implementation detail. Whether row navigation to `/trips/:id` prefetches
anything is moot until #35 gives that route real content — today it's
still #30's placeholder.

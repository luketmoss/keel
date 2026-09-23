# 353 — To do: what's due, and what got done

Tokens are from the standing [design-language.md](design-language.md), the ones
#350 and #351 added are in [350-foundation.md](350-foundation.md#new-tokens) and
[351-day-screen.md](351-day-screen.md#new-tokens), and the three this issue adds
are under [New tokens](#new-tokens). The spec is [../spec.md](../spec.md) (§2,
§4, §5, §8, §9.2, §9.4, §9.13). The behavioural reference is the prototype,
[../prototype.html](../prototype.html): `cardTodo()`, `group()`, `todoRow()`,
`todoDone()`, `openItems()` and the `.tg`, `.todo`, `.bdot`, `.more` and
`.note-line` rules. Where the prototype and the design language disagree, the
design language wins, and this note says where that happened.

This note builds on three settled seams:

- **#350's data interface** — `getDataSource()`, the day-keyed reads, and the
  `HiveBoard`, `HiveItem` and `HiveCompletion` shapes. This issue needs no field
  added to any of the three.
- **#351's panel contract** — `slots.todo`, `Panel`, `PanelAction`, `PanelNote`,
  `PanelStatus`, and a `useDayRead` that shares a call still in flight between
  hooks asking for the same read. Panels remount on every day change and
  whenever the layout crosses 960px.
- **#355's client** — `hiveConfigured()` and `callHive<T>(action, params?)`, the
  `ApiError` kinds, and the mapping from a refusal onto a `DayRead` status.

It also asks for one widening of #350's and #351's signatures, in
[What this needs from #350 and #351](#what-this-needs-from-350-and-351).

Nothing in this note exists yet to measure. See [Numbers](#numbers).

---

## Where it sits

`slots.todo`, the third card on a phone and the second in the right column from
960px (#351's layout). It renders the whole card on every day, and it is the
only slot whose *title* changes with the day state.

Today, on a phone:

```
┌──────────────────────────────────────────────┐
│ TO DO   ● Hive                       [ + Add ]│
│                                              │
│ OVERDUE ②                                    │
│ Renew vehicle registration    4 days late  ↗ │
│ ■ Home · Errands                             │
│ Submit expense report          1 day late  ↗ │
│ ■ Work                                       │
│                                              │
│ DUE TODAY ③                                  │
│ Refresh tubeless sealant                   ↗ │
│ ■ Home · Bike                                │
│ …                                            │
│                                              │
│ NEXT 3 DAYS ⑤                                │
│ Thu, Sep 24                                  │
│ Call about furnace tune-up                 ↗ │
│ ■ Home                                       │
│ Fri, Sep 25                                  │
│ …                                            │
│              Show 1 more                     │
└──────────────────────────────────────────────┘
```

A past day:

```
┌──────────────────────────────────────────────┐
│ COMPLETED   ● Hive                           │
│                                              │
│ Mow the lawn                    ✓ 8:12 AM  ↗ │
│ ■ Home                                       │
│ ~Fix garage door sensor~          9:14 AM  ↗ │
│ ■ Home · reopened 6:02 PM                    │
│                                              │
│ ⓘ Completions before Sep 20 are approximate  │
│   — rebuilt from Hive's status changes.      │
└──────────────────────────────────────────────┘
```

## The three day states

| | Past | Today | Future |
|---|---|---|---|
| Title | **Completed** | **To do** | **To do** |
| Chip | Hive | Hive | Hive |
| Sub | none | none | none |
| Header action | none | **Add** | **Add** |
| Body | what was completed that day | Overdue · Due today · Next 3 days | what is due that day |
| Reads | `readHiveCompleted(date, date)` | `readHiveDue(null, date + 3)` | `readHiveDue(date, date)` |

The titles, the chip and the absence of a sub are #351's table, unchanged.

**Two components, not one.** `Todo` in `src/panels/todo/Todo.tsx` is the slot
component; it renders `<TodoCompleted>` on a past day and `<TodoDue>` otherwise,
and holds no hook of its own. The two call different reads, and a hook cannot be
called conditionally, so the choice has to be a component boundary rather than a
branch. It also makes the midnight case free: when the `today` signal rolls over
while today's date is on screen, the state goes from today to past, Preact
swaps one component type for the other, and the new one reads the completions.

---

## Today

### The three groups

In this order, each rendered only when it has items — header, count and all:

| Group | Holds | Header colour |
|---|---|---|
| **Overdue** | due before today, not in a terminal Hive status, however far back | `--color-overdue` |
| **Due today** | due today | `--color-text-secondary` |
| **Next 3 days** | due tomorrow through three days ahead | `--color-text-secondary` |

Three days is fixed (spec §9.2) and there is no setting for it — §5 leaves
almanac with no settings surface at all.

**Order inside a group:** due date ascending, then board name, then title. So
the most overdue item is at the top of Overdue, and two items with the same due
date and board never swap places between renders. Hive's own `sort_order` is
deliberately not used: it is a per-column ordering inside one board, and it
means nothing across boards.

**Next 3 days is headed by day.** Above the first row of each due date, a day
heading: `--text-xs`, weight 600, `--color-text-muted`, `--space-md` padding at
the sides and `--space-xs` on top. The words are the short date — "Thu, Sep 24".
Overdue and Due today have no day headings; "4 days late" and the group name
already say when.

### A group

A `section` holding an `h3` and a `ul` of rows.

- **Header:** `--space-sm` padding on top, `--space-xs` at the bottom,
  `--space-md` at the sides. The label at `--text-xs`, weight 700, upper case,
  `--tracking-caps` — the same treatment as a card title (#351), one level down.
  After it, `--space-sm` away, the **count**: the group's total item count at
  `--text-xs` in `--color-text-secondary`, `--space-xs` padding at the sides,
  `--pill-h` tall, `--radius-full`, `--color-sunken` fill, with a visually
  hidden " items" so it is heard as "Overdue 2 items".
- **Rows:** a `ul`, so a screen reader announces how many are showing.

### Collapsing

A group shows at most **four** rows. With more than four, a control follows the
list:

- Collapsed: "Show 3 more" — the number hidden, not the total.
- Expanded: "Show fewer".

It is a button, full width less `--space-md` each side, at least 40px tall,
`--radius-md`, `--text-sm` weight 700 in `--color-primary`, centred, with
`--color-primary-light` on hover. It carries `aria-expanded` and `aria-controls`
pointing at the group's `ul`, and a visually hidden group name so it is heard as
"Show 3 more overdue items" / "Show fewer overdue items" rather than three
identical buttons.

**The state is the component's, and it resets.** Each group holds its own open
flag in component state. Panels remount on every day change and whenever the
layout crosses 960px (#351), so both reset it. That is right for a day change —
a different day is a different list — and acceptable for the 960px crossing,
which only happens on a resize or a rotation.

**Only today collapses.** A future day and a past day are one flat list with no
limit. Today is the only state that can stack three groups on top of each other,
which is what the limit is for.

### Nothing due

All three groups empty — which is `ready` with an empty result, not an error
(#351) — is one `PanelNote`, no icon, in `--color-text-secondary`:

> Nothing due in the next 3 days.

The **Add** action stays in the header. An empty day is exactly when you want it.

---

## A future day

One flat list of what is due that day, in the same row form, ordered by board
name then title. No groups, no headings, no counts, no collapsing, no "N days
late" — a future day cannot be late.

Empty: one `PanelNote`, "Nothing due.". **Add** stays in the header.

---

## A past day

### From events to rows

Hive returns raw events and does not interpret them (hive#239, spec §4). Three
rules turn one Denver day's events into rows, and all three are this panel's:

1. **One row per item.** Group the day's `completed` events by `item_id` and
   keep the **last** one of the day. An item completed at 9:14 and again at
   16:40 is one row reading 16:40 — the day ended with it done, at 16:40.
   This is the issue's "dedupe on `item_id`", made exact.
2. **Reopened after that last completion → struck through.** If a `reopened`
   event for the same item follows that completion later the same day, the row
   is struck and carries the reopen time. §9.4.
3. **Reopened but not completed that day is not a row.** The card lists what was
   completed; an item finished last week and reopened today was not.

An item completed on more than one day appears on each of them, with whatever it
was called then — that is spec §4's point, and it falls out of reading one day
at a time rather than being special-cased.

**Order:** by the completion the row shows, earliest first. The audit log is
chronological by construction, so this is the order the events arrived in.

### A completed row

Same row shape as the due side, with the right-hand slot showing the time:

- **Not reopened:** a check at `--icon-sm` in `--color-success`, `--space-xs`
  before the time. "8:12 AM".
- **Reopened:** no check — the item is not done now — and the time stays, in
  `--color-text-secondary`. The title is `line-through` in `--color-text-muted`,
  and the meta line gains "· reopened 6:02 PM".

The strike and the reopen time tell both truths at once: the day's record says
it *was* completed, and nobody scanning yesterday reads it as still done. Hiding
it would lose an event that happened; showing it plainly would mislead (§9.4).

Times are 12-hour, Denver, with no leading zero on the hour: "8:12 AM",
"6:02 PM". They come from the audit row's timestamp converted to
`America/Denver` — never by slicing the ISO string, which is the mistake
hive#239 exists to prevent.

### Before 20 September 2026

`completed` and `reopened` events start the day hive#239 shipped. For a date
strictly before **2026-09-20** the rows are rebuilt from `status_changed`
events instead: an event is a completion when its `new_value` names a status
that is terminal on that item's board **today**, and a reopening when its
`old_value` does and its `new_value` does not. Rules 1 to 3 above then apply
unchanged.

That reading is approximate, and misreads history whenever a column's
`is_terminal` flag has been changed since — which is exactly why hive#239 added
a self-describing event. So those days say so, at the foot of the card, in a
`PanelNote` with the info icon and `tone="muted"`:

> Completions before Sep 20 are approximate — rebuilt from Hive's status changes.

The wording is settled in the design language's § Words. The line is a function
of the date alone: it shows on every day before 2026-09-20, including one with
nothing on it, and in demo mode as well as live. Demo rows are generated rather
than rebuilt, so the line is strictly true only in live mode — showing it in
both is deliberate, because demo mode exists to show the app's states and this
is one of them.

The date is a fact about Hive's deployment, not sample data, so it is a real
constant — `HIVE_COMPLETION_LOG_START = '2026-09-20'` — and does not slide with
today the way #350's generated dates do.

### Nothing completed

One `PanelNote`, no icon: "Nothing completed." Before 2026-09-20 the
approximate line follows it, because "nothing" is itself an approximation on
those days.

---

## A row

One row, the same on every day:

```
┌─────────────────────────────────────────────────────┐
│ Renew vehicle registration        4 days late    ↗  │
│ ■ Home · Errands                                    │
└─────────────────────────────────────────────────────┘
```

- An `a`, the whole row, at least `--row-min-h` tall, `--space-sm` padding top
  and bottom and `--space-md` at the sides. Two columns: the text, and an auto
  column holding the right-hand slot and the out-arrow. Rows are separated from
  each other by a 1px `--color-border-light` hairline, not nested cards (design
  language). `--color-surface-raised` on hover, `--focus-ring` on focus.
- **Title:** `--text-sm`, weight 550, `--color-text`, wrapping on any character
  so a long unbroken title cannot push the row sideways.
- **Meta**, under it at `--text-xs` in `--color-text-secondary`: the board
  square, the board name, then the labels after a "·". On a completed row the
  labels are not shown, and a reopened one ends "· reopened 6:02 PM".
- **Right-hand slot:** "4 days late" on an overdue row, the completion time on a
  past one, nothing otherwise. `--text-xs`, weight 700, `tabular-nums`, on one
  line. `--color-overdue` when late, `--color-text-secondary` otherwise.
- **Out-arrow:** the prototype's `ext` icon at `--icon-sm` in
  `--color-text-muted`, `aria-hidden`. The design language's rule — anything
  owned by Thrive or Hive opens there, and its rows carry an out-arrow — so it
  is on every row, including the ones with nothing in the right-hand slot. It is
  the only thing marking the row as a way out of almanac.

**"N days late"** is whole Denver days between the due date and today: "1 day
late" at one, "4 days late" after that. It is never shown on today's own items
or on a future day.

### The board square

Spec §9.13 — every board appears, each item tagged with its board's own colour
from Hive. A `--board-square-size` square with `--radius-xs` corners, filled
with the board's `color`, `--space-xs` before the name, `aria-hidden`. Never a
fill behind anything (design language).

- **A board with no usable colour** — the Boards sheet's cell is empty, or holds
  something that is not a CSS colour — gets a `--color-text-muted` square. The
  name is always there, so the colour never carries meaning on its own and a
  missing one costs nothing.
- **An item on no board** — Hive allows an empty `board_id` — shows neither
  square nor name. Its labels, if any, start the meta line; with no labels
  either, the row is just its title.

### The link

Every row links to the item in Hive (hive#240):

```
<VITE_HIVE_APP_URL>?item=<id>
```

Only `item`. hive#240's AC2 makes the item's own board active whatever the
`board` parameter says, so the prototype's `?board=<name>&item=<id>` is one
parameter more than the shipped behaviour needs.

**Same tab, no `target`.** `sessionStorage` is per-tab and survives a
navigation, so coming back lands on the same day (it is in the URL) with the
session intact, and on a phone a new tab is the worse of the two. A visually
hidden "Opens in Hive." inside the link says where it goes, since the out-arrow
is decorative.

With `VITE_HIVE_APP_URL` empty the row renders as a `div` with the same layout
and no out-arrow, rather than an anchor with nowhere to go.

---

## The header action: Add

A `PanelAction` (#351) on today and future days: the prototype's `plus` icon at
`--icon-sm` and the word **Add**. A past day has none — you cannot add work to a
day that has gone.

```
<VITE_HIVE_APP_URL>?new=1&due=<the day's date>
```

That link is hive#263, which has not shipped. **almanac sends the full link
now anyway.** Hive's frontend reads `board`, `view` and `item` and ignores
anything else, so until #263 lands the link opens Hive's board — which is
exactly the fallback the issue asks for — and the day it lands the create
screen opens with the date filled in, with no change here. Writing the fallback
instead would mean a second change later, and the two behaviours are
indistinguishable in the meantime.

No `board` parameter: almanac has no basis for choosing one, and hive#263's own
open question is what a link with no board should do.

With `VITE_HIVE_APP_URL` empty the action is not rendered.

---

## Reading Hive

### The two reads

Both are `DataSource` methods (#350), attached in `src/data/live.ts` only when
`hiveConfigured()` is true, and both live in **`src/data/liveHive.ts`** — a new
file this issue owns, holding the Hive row types, the mapping and the board
lookup. `live.ts`'s whole diff is importing them and attaching them. The panel
reads only through `getDataSource()` and never calls `callHive` itself.

| Read | Signature | Keyed by | Calls |
|---|---|---|---|
| `readHiveDue` | `(from: IsoDate \| null, to: IsoDate)` | due date | `getBoards`, `getItems` |
| `readHiveCompleted` | `(from: IsoDate, to: IsoDate)` | the Denver date of the completion | `getBoards`, `getAuditLog`, `getItems`, and `getStatuses` per board before 2026-09-20 |

Every action is on hive#264's allow-list for a token caller, so nothing here
needs a capability that issue does not already give.

### `readHiveDue`

```
getItems({ due_after: from ?? undefined, due_before: to })
```

`from` is `null` for today's card, because "overdue" has no floor — there is no
date before which an overdue item stops counting. Omitting `due_after` is how
Hive expresses that; a sentinel date would be a guess wearing a number. A future
day passes the date as both ends. Hive's filter drops items with no due date
already (hive#241), so nothing undated arrives.

Then, in this order:

1. **Drop terminal items.** An item is in a terminal status exactly when its
   `completed_at` is non-empty: Hive sets it on the way into a terminal column
   and clears it on the way out, in both of its write paths
   (`apps-script/src/rules.js` and `frontend/src/state/rules.ts`, kept in step
   by Hive's own CLAUDE.md). Reading it costs nothing, where asking `getStatuses`
   what is terminal costs one call per board after a `getBoards` call. The one
   case it gets wrong is a column whose `is_terminal` flag was flipped after
   items were already sitting in it — the same fragility spec §8 already names,
   and not one worth five extra Apps Script executions on every day view.
2. **Drop anything whose `due_date` is not `YYYY-MM-DD`.** It cannot be keyed by
   day, and Hive's own filter compares due dates as strings, so a stray value
   would already have been filtered wrongly upstream. A dev build logs one
   warning naming the count; a production build says nothing.
3. **Map** each row to a `HiveItem`: `id`, `title`, `board` (the `HiveBoard`
   resolved from `board_id`, or `null` when there is none), `due_date`, and
   `labels` — Hive's comma-separated string, each entry trimmed and rejoined
   with ", " so the spacing on screen does not depend on how it was typed.
4. **Key by `due_date`** into a `Map<IsoDate, HiveItem[]>`, with no key at all
   for a date with nothing (#350).

### `readHiveCompleted`

```
getAuditLog({ from, to })
```

**No `audit_action` filter.** `completed` alone would lose the `reopened` events
§9.4 needs, and two filtered calls would cost two Apps Script executions to
learn what one unfiltered one already says. The rows come back chronologically,
which rules 1 to 3 rely on.

The audit row carries `item_id` but not the item's title or board, so the titles
and boards are joined from an unfiltered `getItems()` read. `getItems` has no
id filter, so that is the whole table; luketmoss/hive#265 asks for the two
fields on the audit row, which removes this read entirely. This issue does not
wait for it.

**A completion whose item no longer exists is dropped.** Deleting an item leaves
its `completed` row in the append-only log forever, with nothing left to name it
— and nothing to open, since every row is a link into Hive. A nameless,
untappable row is worse than a missing one. hive#265 is what would let it come
back.

Each surviving row becomes a `HiveCompletion`: `item_id`, `title`, `board`,
`completed_time` and `reopened_time` — both `'HH:MM'`, 24-hour, Denver (#350's
rule for times), formatted for display by the panel. Keyed by the Denver date of
the completion.

### Boards

`getBoards()` gives `id`, `name` and `color`. It is read **once per page** and
held for the life of the tab, cleared when #350's `session` signal changes so a
different account never inherits another's boards.

Board names and colours are the panel's chrome, not the day's data: they change
perhaps once a year, and re-reading them on every swipe would double the
panel's call count against a 60-reads-a-minute quota for information that cannot
have changed. #351's "no cache of landed answers" is about day-keyed answers,
and this is not one. The cost is that a board renamed or recoloured mid-session
shows its old name until the page is reloaded.

A failed boards read fails the whole `DayRead`, and is not held. Without the
boards there is no name and no colour, and §9.13 wants both on every row — so
the card says "Couldn't load from Hive." with **Try again** rather than showing
a list of unattributed titles.

### What a failure looks like

Straight from #355 and #351, with `source` as the string **"Hive"**:

| Cause | `DayRead` | The card shows |
|---|---|---|
| `VITE_HIVE_API_URL` empty → the method is never attached | `not-connected` | "Hive isn't connected yet." |
| The session expired, or `code: 'token_invalid'` | `session-expired` | "Reconnect to load this." |
| `token_forbidden`, `read_only`, `token_unavailable`, any other `success: false` | `error` | "Couldn't load from Hive." · Try again |
| `fetch` rejected with `navigator.onLine` false | `error`, `offline` | "You're offline — couldn't load from Hive." · Try again |
| Non-200, non-JSON after one retry, or 20s | `error` | "Couldn't load from Hive." · Try again |

**Until hive#264 ships**, a live request carrying an access token and no `key`
is refused by Hive's current `validateApiKey`, which lands as `error` —
"Couldn't load from Hive." with Try again. That is the correct thing to show:
the source is connected and is saying no. Demo mode meanwhile shows all three
day states in full, so the panel can be built, tested and merged before the
token check exists.

**Never an empty day on a failure.** An empty result is `ready` and says
"Nothing due."; a refusal says it could not load. #350's rule that absent means
"not connected", never an empty day, is the same rule one level up.

### What this needs from #350 and #351

One widening, in two places, so that "overdue, with no floor" can be expressed:

- **#350, `src/data/source.ts`:** `readHiveDue(from: IsoDate | null, to: IsoDate)`.
  `null` means no lower bound — every item due on or before `to`. Every other
  read keeps `IsoDate`.
- **#351, `src/day/useDayRead.ts`:** `useDayRead(name, from: IsoDate | null, to:
  IsoDate)`. `null` takes part in the shared-call key like any other value, so
  two panels asking for `readHiveDue(null, T+3)` still share one call, and
  `(null, T+3)` and `(T, T+3)` are different keys, as exact comparison already
  implies.

Nothing else changes: not the `Map<IsoDate, T>` return, not the inclusive-range
rule for every other read, not the demo implementations' shapes. The alternative
— passing an epoch date as a sentinel — keeps both signatures and puts a magic
number in the one place a design note is meant to remove them from.

**No shape changes.** `HiveBoard`, `HiveItem` and `HiveCompletion` carry exactly
what this panel draws. `HiveItem.board` becomes nullable, which #350's
"demo-first shapes the panel issues own the live mapping for" already allows for.

---

## What #358 can reuse

#358's calendar day summary wants "3 Hive items due" and "2 Hive items
completed". Both reads take a range, so a month is one call of each, and the
Map is already day-keyed.

One thing to know before it does: **`readHiveDue` answers "what is open and due
on these dates, as of now"**, not "what was due then". A past date in its range
returns the items still open with that due date — which is what an overdue list
is made of, and not a record of that day. For a past day #358 wants
`readHiveCompleted`, as the prototype's own day summary does.

---

## Edge cases

- **Everything due today is done.** The completed items are terminal, so they
  leave the due side, and the card can read "Nothing due in the next 3 days."
  on a day you finished five things. That is the question today asks — what is
  outstanding (spec §2) — and the day's completions are on tomorrow's view of
  it, once it is a past day.
- **Midnight, with today on screen.** The `today` signal rolls over, the day
  state goes from today to past, `Todo` swaps `TodoDue` for `TodoCompleted`, and
  the card retitles itself "Completed" and reads the completions. Nothing is
  cached across the swap.
- **An item completed in Hive, then back to almanac.** The tab becoming visible
  re-reads in the background (#351): the item leaves Due today, and appears on
  that day's Completed card once the day has passed.
- **A very long Overdue group.** Four rows and "Show 46 more". There is no cap
  and no paging; the count on the header is the honest number.
- **A title with no spaces.** The title wraps on any character, so the row grows
  taller rather than the card growing wider.
- **Two items with the same title on the same board.** Two rows. They are
  different items with different links, and nothing dedupes on title.
- **An item due today whose board was deleted.** `board_id` resolves to no
  board; the row shows its title and labels and still links into Hive.
- **A day with `reopened` events and no completions.** "Nothing completed." —
  rule 3.
- **Demo mode before 2026-09-20.** The approximate line shows, over generated
  rows that were never rebuilt from anything. Deliberate: the state is real and
  worth seeing.
- **Offline.** The card shows the offline line and Try again; every other card
  does the same at the same moment, which is why #351 does not make it an alert.
- **A `getBoards` that succeeds and a `getItems` that fails.** The read fails.
  Both calls go out together and the `DayRead` is one answer.
- **Swiping fast across days.** #351 drops answers for days you have left and
  rejoins calls still in flight; this panel adds nothing to that. The boards
  read happens once regardless of how many days are crossed.

---

## Copy

| Where | String |
|---|---|
| Card title, today and future | To do |
| Card title, a past day | Completed |
| Chip | Hive |
| Header action | Add |
| Group headers | Overdue · Due today · Next 3 days |
| Day heading | Thu, Sep 24 |
| Late, one day | 1 day late |
| Late, more | 4 days late |
| Completion time | 8:12 AM · 6:02 PM |
| Reopened | reopened 6:02 PM |
| Collapsed | Show 3 more |
| Expanded | Show fewer |
| Collapse control, heard | Show 3 more overdue items · Show fewer overdue items |
| Count, heard | Overdue 2 items |
| Row, heard | …Opens in Hive. |
| Approximate | Completions before Sep 20 are approximate — rebuilt from Hive's status changes. |
| Empty, today | Nothing due in the next 3 days. |
| Empty, a future day | Nothing due. |
| Empty, a past day | Nothing completed. |
| Not connected | Hive isn't connected yet. |
| Loading | Loading… |
| Error | Couldn't load from Hive. |
| Error, offline | You're offline — couldn't load from Hive. |
| Error action | Try again |
| Session ended | Reconnect to load this. |

The last five are #351's `PanelStatus` sentences with "Hive" in them, not new
strings. Sentence case throughout, and nothing in the card is a verdict — it
lists, it never concludes (spec §1).

---

## Numbers

almanac is still the scaffold #350 will replace: `almanac/src` holds
`main.tsx`, `App.tsx`, `App.test.tsx` and `test-setup.ts` and nothing else, so
nothing in this note could be measured against a running app. Every number is
**unmeasured until built**, and each comes from a source:

| Number | Source |
|---|---|
| Four rows before a group collapses | the prototype's `group()` (`lim = 4`); the issue body |
| Three days, fixed | spec §9.2 |
| 2026-09-20, where the approximation stops | the date hive#239 shipped; design-language § Words |
| 48px minimum row height | the prototype's `.todo` |
| 8px board square, 2px corners | the prototype's `.bdot` |
| Rows at least 44px, touch targets at least 40px | design-language § Scale |
| The 960px two-column breakpoint | design-language § Layout; #351 renders it |
| 300ms before "Loading…" | #351 |
| 60 read requests a minute per user | the Google Sheets read quota, as #351 and #352 cite it |
| A second or more per Apps Script call | implementation-plan.md § Risks |

`/test` checks the row height and the tap targets in the running app, in demo
mode, with `getBoundingClientRect()` at a 360px-wide viewport — the width #351
already checks at.

---

## New tokens

The design language, #350 and #351 have no token for these three. Each value
comes from the source named, and `global.css` defines it on `:root` like the
rest.

| Token | Value | For | Source |
|---|---|---|---|
| `--row-min-h` | `48px` | the minimum height of a tappable list row inside a card. #356's and #357's rows want the same one | prototype `.todo` |
| `--board-square-size` | `8px` | the board mark beside a board name (spec §9.13) | prototype `.bdot` |
| `--radius-xs` | `2px` | the board square's corners, and anything else this small. `--radius-sm` at 4px on an 8px square reads as a dot, and the design language calls it a square | prototype `.bdot` |

Sizes the prototype uses off the scale are brought onto it instead of getting
tokens, as #351 did: the group header's `.05em` tracking becomes
`--tracking-caps`, the count pill's 11px becomes `--text-xs` and its height
`--pill-h`, the check mark's 16px becomes `--icon-sm`, and the "Show N more"
control's 36px becomes the design language's 40px minimum.

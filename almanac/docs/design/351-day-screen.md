# 351 — The day screen: one date, three day states

Tokens are from the standing [design-language.md](design-language.md), the ones
#350 added are in [350-foundation.md](350-foundation.md#new-tokens), and the few
this issue adds are under [New tokens](#new-tokens). The spec is
[../spec.md](../spec.md) (§2, §9.3, §9.14). The behavioural reference is the
prototype, [../prototype.html](../prototype.html): `viewDay()`, `weekStrip()`,
`rel()`, `sun()`, the card functions, and the swipe and key handlers. Where the
prototype and the design language disagree, the design language wins, and this
note says where that happened.

Nothing in this note exists yet to measure. See [Numbers](#numbers).

---

## The route

The Day tab gets whatever path #350's router hands it (the whole path, since
its first segment isn't `calendar` or `trends`).

| Path | Shows | URL |
|---|---|---|
| `#/` (or no hash) | Today | stays `#/` |
| `#/YYYY-MM-DD`, a date `isIsoDate()` accepts | That date, whichever state it is in | stays |
| `#/YYYY-MM-DD` that happens to be today | Today | stays as written |
| Anything else: `#/2026-02-30`, `#/2026-9-12`, `#/foo`, `#/2026-09-12/x` | Today | replaced with `#/`, no new history entry |

- **Today follows Denver.** `today` is a signal in `src/day/today.ts`, set from
  #350's `todayInDenver()` at load and checked again every minute and whenever
  the page becomes visible (`visibilitychange`). The device's own time zone
  plays no part: at 23:30 on 22 September in Denver it is already the 23rd in
  UTC, and `#/` still shows Tuesday the 22nd as Today.
- **When today changes** (midnight in Denver, or coming back to a tab left open
  overnight): `#/` moves to the new day, because `#/` means "today, whatever
  day that is". A page open at an explicit date keeps its date; its pill, its
  day state and the Today control update. The demo data isn't regenerated — it
  stays anchored to the day the page loaded, as #350 specifies.
- **Day state** is `dayStateOf(date, today)`: `'past'` before today,
  `'today'`, `'future'` after. It is the one comparison every panel uses.
- **Moving between days replaces the history entry**; it never pushes one.
  Swiping through ten days and pressing Back returns to wherever you were
  before the Day screen, not to the ninth day. (`location.replace` on the hash
  does this and fires `hashchange`, so #350's router follows it unchanged.)
  Arriving at the Day screen from another tab or a link still pushes, as #350
  does.
- **Links to a day** use `dayHref(date)` from `src/day/routes.ts`: `#/` when the
  date is today, `#/YYYY-MM-DD` otherwise. Every move this note describes goes
  through it, and #358 and #359 use it for "open this day".
- **Document title:** "almanac" when today is showing (#350's title, unchanged),
  and "Sep 12, 2026 · almanac" for any other date.

## The screen, top to bottom

Phone, below 960px, on Saturday 12 September 2026 (ten days before today):

```
┌─────────────────────────────────┐
│ ⬡ almanac          [Today]  (👤) │  top bar (#350), Today control (#351)
├─────────────────────────────────┤
│ Saturday                  ‹   › │  heading, Previous day, Next day
│ September 12, 2026 (10 days ago)│  date and relative pill
│ ↑ 6:37 AM  ↓ 7:16 PM  12h 39m … │  sun line
│  M   T   W   T   F   S   S      │  week strip, Monday first
│  7   8   9  10  11 [12] 13      │  the viewed day filled
│  •  ••       ○   •              │  marks: • done, ○ planned
│ ┌─────────────────────────────┐ │
│ │ OVERNIGHT  COROS            │ │  cards, one column
│ └─────────────────────────────┘ │
│ ┌─────────────────────────────┐ │
│ │ TRAINING  ● Thrive          │ │
│ └─────────────────────────────┘ │
│ ┌─────────────────────────────┐ │
│ │ COMPLETED  ● Hive           │ │
│ └─────────────────────────────┘ │
│ ┌─────────────────────────────┐ │
│ │ ACTIVITY  COROS             │ │
│ └─────────────────────────────┘ │
│ ┌─────────────────────────────┐ │
│ │ JOURNAL                     │ │
│ └─────────────────────────────┘ │
│            foot line            │
├─────────────────────────────────┤
│    Day     Calendar    Trends   │  bottom bar (#350)
└─────────────────────────────────┘
```

Wide, 960px and up:

```
┌──────────────────────────────────────────────────────────────────────┐
│ ⬡ almanac        ( Day | Calendar | Trends )          [Today]  (👤)   │
├──────────────────────────────────────────────────────────────────────┤
│ Saturday                         ‹   ›                                │
│ September 12, 2026 (10 days ago)                                      │
│ ↑ 6:37 AM   ↓ 7:16 PM   12h 39m of daylight (−2 min)                  │
│  M    T    W    T    F    S    S                                      │
│ ┌────────────────────────────────┐  ┌────────────────────────────────┐│
│ │ OVERNIGHT                      │  │ TRAINING                       ││
│ └────────────────────────────────┘  └────────────────────────────────┘│
│ ┌────────────────────────────────┐  ┌────────────────────────────────┐│
│ │ ACTIVITY                       │  │ COMPLETED                      ││
│ └────────────────────────────────┘  └────────────────────────────────┘│
│ ┌────────────────────────────────┐                                    │
│ │ JOURNAL                        │                                    │
│ └────────────────────────────────┘                                    │
│                              foot line                                │
└──────────────────────────────────────────────────────────────────────┘
```

On wide screens the header and the week strip are at most `--content-max` wide,
aligned to the left of the main column; the panels use the column's full
`--content-max-wide`.

---

## Header

Three lines, with `--space-sm` above the first.

1. **The day's name**, e.g. "Saturday": the page's only `h1`, `--text-3xl`,
   weight 700, `--color-text`, with `tabindex="-1"` so focus can be moved to it.
   At the right of the same row, `--space-xs` apart, two icon buttons:
   **Previous day** and **Next day**. Each is a chevron at `--icon-md` in
   `--color-text-secondary`, centred in a square `--icon-btn-size` target with
   `--radius-full`; hover fills it with `--color-sunken` and turns the chevron
   `--color-text` (the account button's treatment in #350).
2. **The date and the relative pill:** "September 12, 2026" at `--text-base` in
   `--color-text-secondary`, then the pill, `--space-sm` apart, wrapping onto a
   second line if the row is too narrow.
3. **The sun line**, `--space-xs` below: sunrise, sunset and daylight at
   `--text-sm` in `--color-text-secondary` with `tabular-nums`, `--space-md`
   between the three and `--space-xs` between lines if it wraps.

### The relative pill

`--pill-h` tall at least, `--space-sm` padding at the sides, `--radius-full`,
`--text-xs` weight 700. Today's pill is `--color-primary-light` with
`--color-primary` text (design language). Every other pill is `--color-sunken`
with `--color-text-secondary` text.

The words are the prototype's `rel()`, where *n* is the number of days between
the date and today:

| *n* | Pill |
|---|---|
| 0 | Today |
| 1 before / after | Yesterday / Tomorrow |
| 2–13 | "5 days ago" / "In 5 days" |
| 14–59 | weeks, *n* ÷ 7 rounded: "2 weeks ago" / "In 8 weeks" |
| 60 and more | months, *n* ÷ 30.4 rounded: "2 months ago" / "In 19 months" |

Every count from 2 up, so the words are always plural. Nothing turns into
years; a hand-typed date from decades ago says "437 months ago", which is
accurate and harmless.

### The sun line

```
[sunrise icon] 6:37 AM   [sunset icon] 7:16 PM   12h 39m of daylight (−2 min)
```

- **Worked out on the device** by `sun(date)` in `src/day/sun.ts`, a TypeScript
  port of the prototype's `sun()` and `tzOffset()`: NOAA's approximation, for
  Denver (latitude 39.7392, longitude −104.9903), with the sun's centre at
  90.833° from the zenith. It returns `{ sunrise, sunset, daylight }` in
  minutes: sunrise and sunset after that date's local midnight, daylight as a
  length. No request, no data source, and it works offline and in demo mode.
- **The UTC offset is the date's own**, read from `Intl` for Denver at 18:00
  UTC that day, so the day DST starts or ends shows that day's clock times.
- **Times** are 12-hour with AM/PM, rounded to the minute: `formatClock()` in
  `src/day/format.ts`. **Daylight** is hours and zero-padded minutes, "9h 05m":
  `formatHoursMinutes()`, the same file. Both are exported for the panels,
  which need the same formats (#353's completion times, #356's start times,
  #357's sync time and sleep length).
- **The change** is today's daylight minus the day before's, each rounded to
  the minute first: "(+3 min)", "(−2 min)" with a true minus sign, or
  "(no change)" when it rounds to zero, as it does at both solstices.
- **Icons** are the prototype's `sunrise` and `sunset`, at `--icon-sm`,
  `--space-xs` before their time, `aria-hidden`. A visually hidden word gives
  each time its meaning: a screen reader hears "Sunrise 6:37 AM", "Sunset
  7:16 PM", "12h 39m of daylight (−2 min)".

---

## Week strip

`--space-md` above and below. A `role="group"` labelled "Week of September 7,
2026" (its Monday). Seven equal columns, Monday first, `--space-xs` apart,
spanning the header's width.

*A departure from the prototype.* The prototype flanks the strip with two week
arrows 28px wide. Nine columns at the design language's 40px minimum, plus
their gaps, need more than the 328px a 360px phone leaves inside the main
column's padding; seven columns get about 43px each. So the strip is the seven
days only, and the header's Previous day / Next day buttons are the one-tap way
to move that swiping otherwise provides.

### A day

A `button`, at least `--week-day-h` tall, `--radius-md` (the prototype's 12px
isn't on the scale), with `--space-xs` padding top and bottom, holding three
things stacked and centred:

- the weekday's letter (M T W T F S S) at `--text-xs`, weight 700,
  `--color-text-secondary`
- the day of the month at `--text-lg`, weight 600, `--color-text`,
  `tabular-nums`
- the marks row, always `--week-dot-size` tall, so a day with no marks is the
  same height as one with three

| State | Look |
|---|---|
| Default | No fill |
| Hover | `--color-sunken` fill |
| Viewed (the date on screen) | `--color-primary` fill; letter, number and marks in `--color-on-primary` |
| Today, not viewed | `--today-ring`, and the number in `--color-primary` |
| Today and viewed | As viewed (the ring is lost in the fill) |
| Keyboard focus | `--focus-ring` |

It has `aria-pressed="true"` when viewed and `"false"` otherwise, and
`aria-current="date"` when it is today. The letter, number and marks are
`aria-hidden`; its accessible name is the full date, then its workouts when the
week's read has any for it:

- "Saturday, September 12"
- "Saturday, September 12 — workouts: 2 done, 1 planned"
- "Tuesday, September 15 — workouts: 1 planned"

Counts are of every workout that day, not just the marks shown, and a zero
count is left out.

### Marks

- **What they are:** the day's Thrive workouts. A workout with
  `status === 'complete'` is a filled dot, `--week-dot-size` across, in
  `--color-text-muted`. One with `status === 'planned'` is a ring of the same
  size, `--week-dot-ring` wide, in the same colour. On the viewed day both are
  `--color-on-primary`. They sit `--space-xs` apart.
- **Order and limit:** done ones first, then planned, at most three in all.
  A fourth still counts in the label.
- **A planned workout on a past day** (one that never happened) stays hollow.
  The Training panel says "Planned · not done"; the strip just shows it wasn't
  done.
- **Where they come from:** one `useDayRead('readWorkouts', monday, sunday)`
  for the week (below), read again whenever the week changes. Moving between
  days inside a week doesn't read again.

| The week's read | The strip |
|---|---|
| `readWorkouts` absent (live mode until #356) | No marks. No message: the Training card is where a missing source is explained. |
| Loading | No marks yet. The row keeps its height. |
| Ready | Marks, and counts in the labels. |
| Failed, or the session has ended | No marks and no message. It reads again on Reconnect or when the page comes back into view, like any `useDayRead`. |

### Interaction

- **Tap or click a day** to show it.
- **Swipe the strip** sideways to move a week: to the same weekday a week
  later (swiping left) or earlier (swiping right). The same swipe rules as the
  day body, below.
- The strip has `touch-action: pan-y` and no text selection.

---

## Moving between days

| Input | Moves to | Where |
|---|---|---|
| Swipe the day body left / right | The next day / the previous day | Touch and pen only |
| Swipe the week strip left / right | Seven days later / earlier | Touch and pen only |
| Tap a day in the strip | That day | Any pointer |
| **Previous day** / **Next day** | One day back / forward | Any pointer, and keyboard |
| ← / → | One day back / forward | Keyboard, on the Day screen |
| `t` or `T` | Today | Keyboard, on the Day screen |
| **Today** in the top bar | Today | Shown only away from today |

### Swipes

A swipe counts when, between touching down and lifting off, the pointer moves
more than 60px sideways, the sideways travel is more than 1.6 times the
vertical, and it takes under 900ms (the prototype's thresholds).

- **Touch and pen only.** A mouse drag across the day body is how text gets
  selected, so it never changes the day. Mouse users have the buttons, the
  strip and the keys.
- **Not from a text field.** A swipe that starts in an `input`, `textarea`,
  `select` or anything `contenteditable` is left to it (#352's hours field and
  journal).
- **Vertical scrolling is untouched:** the day body and strip are
  `touch-action: pan-y`.
- **A swipe is never also a tap.** For 350ms after a swipe, the click that ends
  it is swallowed, so a swipe that starts on a row or a day doesn't also open it.

### Keys

← and → move one day and `t` goes to today, only while the Day screen is
showing, and not when:

- focus is in an `input`, `textarea`, `select` or `contenteditable`, or inside
  an open `role="menu"` (#350's account menu uses the arrow keys),
- Ctrl, Alt or Meta is held (Alt+← is the browser's Back),
- the key is repeating from being held down. Holding → moves one day, not
  thirty a second; each move reads every panel, and in live mode those are
  Apps Script executions.

`t` on today does nothing.

### The Today control

`TodayControl` in `src/day/TodayControl.tsx`, placed in #350's top bar just
before the account button, as #350's note reserves. It shows only while the Day
tab is current **and** the date showing isn't today. #358 extends the same
condition for the Calendar.

It is a `button` labelled **Today**: at least 40px tall, `--space-md` padding
at the sides, `--radius-full`, `--color-primary-light` fill, `--color-primary`
label at `--text-sm` weight 700, and on hover the label turns
`--color-primary-hover`. It sits in the same place on phones and wide screens.

Activating it goes to today (`#/`). The control then disappears, so if it had
keyboard focus, focus moves to the day's heading rather than falling to the
page.

### What happens on a move

1. The URL is replaced (above), and the title follows.
2. The header, pill, sun line and week strip change at once. If the new date is
   in another week, the strip shows that week, with no marks until its read
   returns.
3. The panels are mounted fresh for the new date and each asks for its reads.
   Panels asking for the same read over the same range share one call
   ([Shared calls](#shared-calls)).
4. The panel area (not the header or the strip) slides in from the side moved
   toward — from the right when going later, from the left when going earlier —
   by `--motion-day-shift`, fading in, over `--motion-day`. Under
   `prefers-reduced-motion: reduce` it just appears.
5. A visually hidden `role="status"` region in the day screen announces the new
   day once, politely: "Saturday, September 12, 2026, 10 days ago". It
   announces moves you made, not the first load and not a midnight rollover.
6. The scroll position stays where it was, so swiping from one day's Training
   to the next day's lands on the next day's Training. A move from another tab
   scrolls to the top (#350).
7. Focus stays on the control that moved, except as the Today control says.

Another move while the slide is running starts a new one. A response for a date
that is no longer showing is dropped.

---

## Panels

### Layout

| Width | Arrangement | DOM and focus order |
|---|---|---|
| Below 960px | One column, `--space-md` apart: Last night, Training, To do, Activity, Journal | The same |
| 960px and up | Two equal columns, `--space-md` apart, top-aligned. Left: Last night, Activity, Journal. Right: Training, To do. Each column stacks on its own, `--space-md` apart. | Left column, then right: Last night, Activity, Journal, Training, To do |

The order is the design language's, the same in every day state. On a future
day there is no Activity card and the rest close up.

*Why the structure changes with the width:* the prototype keeps the two-column
markup on phones and reorders it with CSS `order`, which leaves the tab and
reading order different from what's on screen on the phone, the primary
device. Here the day screen renders one list below 960px and two column
containers from 960px, from a `(min-width: 960px)` media-query signal, so the
DOM always matches what you see. The cost is that crossing 960px, by resizing
or rotating a tablet, rebuilds the panel area. Panels already remount on every
day change, so this asks nothing new of them.

### The card: `Panel`

```
┌──────────────────────────────────────────────┐
│ TRAINING  (● Thrive)                [+ Plan] │  header: title, chip, sub, action
│                                              │
│ body                                         │
└──────────────────────────────────────────────┘
```

`Panel` in `src/day/Panel.tsx`. Props: `slot`, `title`, `source?` (`'COROS'`,
`'Thrive'` or `'Hive'`; none for the journal), `sub?`, `action?`, and
`children` (the body).

- A `section` labelled by its title, with `data-slot` set to its slot.
  `--color-surface`, a 1px `--color-border` border, `--radius-md`, and content
  clipped to the corners. Rows inside are separated by hairlines, not nested
  cards (design language).
- **Header:** one row, at least `--icon-btn-size` tall so a card's header is
  the same height with or without an action. `--space-xs` padding top and
  bottom, `--space-md` at the left, `--space-sm` at the right, `--space-sm`
  between items. In order:
  - **Title**, an `h2`: `--text-xs`, weight 700, upper case, `--tracking-caps`,
    `--color-text-secondary`.
  - **Source chip:** `--space-sm` padding at the sides, `--radius-full`, a 1px
    `--color-border-light` border, `--color-surface-raised` fill, the source's
    name at `--text-xs` weight 600 in `--color-text-secondary`. Thrive and
    Hive lead with a `--source-dot-size` dot in `--color-app-thrive` or
    `--color-app-hive`, `--space-xs` before the name. COROS has no dot. The
    name is always there, so the dot never carries meaning alone.
  - **Sub**, pushed to the right: `--text-xs` in `--color-text-muted`, on one
    line. The past Overnight card's "Fri night → Sat", #357's "synced 8:17 AM",
    #352's "Saving…".
  - **Action**, at the right: a `PanelAction`.
- **Body:** whatever the panel renders.

**`PanelAction`**, for the header's "Plan" (#356) and "Add" (#353): a link or a
button, an icon at `--icon-sm` then the label, `--space-xs` apart, at
`--text-sm` weight 700 in `--color-primary`, at least 40px tall, `--space-sm`
padding at the sides, `--radius-full`, and `--color-primary-light` fill on
hover. Where it links to is the panel issue's.

**`PanelNote`**, the one-line body for empty states and messages: an optional
icon at `--icon-sm`, aligned to the first line, then the words, `--space-sm`
apart, at `--text-sm` in `--color-text-secondary` (or `--color-text-muted` with
`tone="muted"`). `--space-xs` padding on top, `--space-md` at the sides and
bottom. "No activities.", "Nothing due." and the rest are the panel issues'
words in this component.

### What each card is called, per day state

| Slot | Past | Today | Future | Chip | Sub |
|---|---|---|---|---|---|
| `lastNight` | **Overnight** | **Last night** | **Overnight** — #351's own card, below | COROS | Past: "Fri night → Sat" (the day before's short weekday, then the date's). Today: #357's. |
| `training` | Training | Training | Training | Thrive | — |
| `todo` | **Completed** | To do | To do | Hive | — |
| `activity` | Activity | Activity | *No card* | COROS | — |
| `journal` | Journal | Journal | Journal | *none* | #352's |

"Last night" only makes sense of the night just gone, so past days say
"Overnight" and give the nights in the sub; a past day's Hive card lists what
was finished, so it is "Completed" (both from the prototype). The Activity card
is "Activity", with the COROS chip, as the prototype shows it with Withings
off; #354 renames it "Body & activity" when weight and blood pressure arrive.

### The two rules that are final here

These don't change when content arrives, so the day screen renders them itself
and the slot components never see a future day for these two slots.

- **Future: the Overnight card** is `Panel` with title "Overnight", the COROS
  chip, and one `PanelNote` with the prototype's moon icon: "Sleep, resting HR
  and HRV for the night before Tue, Sep 29 arrive that morning." There is no
  check-in: you can't rate a night that hasn't happened (#352).
- **Future: no Activity card.** Spec §2: health on a future day is "nothing
  yet".

### Placeholders

Until a panel issue replaces it, each slot shows its card with the title, chip
and sub above, and one `PanelNote` with `tone="muted"` and no icon. The line
changes with the day state, so all three states are visible from this issue on.
They make no reads.

| Card | Past | Today | Future |
|---|---|---|---|
| Overnight / Last night | That night's sleep, resting HR and HRV — coming soon. | Last night's sleep, resting HR and HRV — coming soon. | *(the final card above)* |
| Training | What you did this day — coming soon. | What's planned today, and what you've done — coming soon. | What's planned for this day — coming soon. |
| Completed / To do | What you finished this day — coming soon. | Overdue, due today and the next 3 days — coming soon. | What's due this day — coming soon. |
| Activity | The day's steps — coming soon. | Steps so far today — coming soon. | *(no card)* |
| Journal | The day's journal entry — coming soon. | Today's journal entry — coming soon. | Plans or reminders for this day — coming soon. |

The Last night placeholder renders the `checkIn` slot at its foot on past days
and today, once #352 fills it.

### Reading: `useDayRead` and `PanelStatus`

Every panel reads the same way, so every panel loads, fails and recovers the
same way.

`useDayRead(name, from: IsoDate | null, to: IsoDate)` in
`src/day/useDayRead.ts` takes the name of a `DataSource` read (`'readEntries'`,
`'readWorkouts'`, `'readHealth'`, `'readHiveDue'` or `'readHiveCompleted'`) and
an inclusive range, calls it on `getDataSource()` — or joins a call for the same
read already in flight, as [Shared calls](#shared-calls) describes — and returns
one of:

| Status | When | Carries |
|---|---|---|
| `not-connected` | The read is absent in this mode (#350: absent is "not connected", never an empty day). No call is made. | — |
| `loading` | The hook has no answer yet: the call it is waiting on, sent or joined, is in flight | — |
| `ready` | That call resolved | `data`: the `Map<IsoDate, T>`. `sentAt`: when the call behind `data` was sent, as a `performance.now()` value |
| `error` | It rejected with anything but `SessionExpiredError` | `offline` (`navigator.onLine` was false), `retry()` |
| `session-expired` | It rejected with `SessionExpiredError` | — |

- **One range, one call.** The range is whatever the content needs, still
  keyed by day (spec §9.3): usually the panel's date as both `from` and `to`;
  the week strip's Monday to Sunday; wider where a panel's rule says so, such
  as #357's range over the 30 days before the date (spec §9.8) or #353's
  overdue items and next three days. A panel needing two sources calls the
  hook twice.
- **A lower bound that may be absent.** `from` is `IsoDate | null`, and `null`
  means no lower bound: `useDayRead('readHiveDue', null, to)` asks for every
  open item due on or before `to`, however far back it goes. #353's To do card
  is why — overdue has no floor, and its card wants everything due on or before
  three days ahead in one call — and `readHiveDue` is the only read whose `from`
  #350 made nullable; every other read is asked with a date at both ends. The
  hook passes `from` to the read exactly as given, and never puts today or any
  other date in place of `null`, which would silently drop the overdue items the
  panel asked for. `to` is always a date.
- **Stale answers are dropped, per hook.** A response for a range the hook no
  longer has, or after its component has gone, is ignored by that hook, however
  many other hooks are still waiting on the same call.
- **After Reconnect** (#350's `session` signal becomes valid again), a
  `session-expired` read runs again by itself and goes through `loading`: one
  call per read and range, however many hooks hold it.
- **Coming back into view.** When `visibilitychange` reports the page visible,
  a `ready` read runs again in the background: what's showing stays until the
  new answer replaces it, and if the new call fails, what's showing stays and
  no error appears. An `error` read runs again through `loading`. Either way it
  is one call per read and range, however many hooks hold it. This is what
  makes a tab left open since before the morning sync show the sync, and what
  brings back a change made in Thrive or Hive. It never starts a sync (#360).
- A `SheetError` of kind `missing` still sends the app to #350's "Couldn't
  open" card; the hook sees it only as `error`.

#### Shared calls

Several panels often want the same read at the same moment. On a past day or
today, #352's check-in and journal each read the day's entry (through
`useEntry`), #357's Sleep row reads it a third time, and #357's Last night and
Activity cards both read the day's health. Google Sheets allows 60 read
requests a minute per user, and each Apps Script call takes a second or more,
so a request per hook lets fast swiping reach the limit, and the panels then say
"Couldn't load". So hooks asking for the same read share one call:

- **The same read** is the same `name`, `from` and `to`, compared exactly — the
  read's *key* — within one session (below). Nothing looser shares: a one-day
  `readEntries` and a seven-day one are two calls even though one contains the
  other, and `readHealth` and `readWorkouts` over the same day are two calls.
  A `null` `from` is a value in the key like any other, not a missing part of
  one: two panels asking for `readHiveDue(null, T+3)` share one call, while
  `(null, T+3)` and `(T, T+3)` are different keys and never share one — exact
  comparison already says so, and an unbounded read and a bounded one are
  different questions. A key written as a string writes the absent bound as
  something no `YYYY-MM-DD` can be, so it cannot collide with a date.
- **At most one call in flight per key.** Whenever a hook needs to read — it
  mounts, its range changes, **Try again**, the page comes back into view,
  Reconnect — it joins the key's call if one is in flight, and otherwise sends
  one, which is then the key's call until it settles. A hook that joins is
  `loading` like one that sent the call, and takes the same answer.
  `PanelStatus`'s 300ms before "Loading…" counts from when that panel started
  waiting, so a panel joining a call already under way still stays quiet for
  its first 300ms.
- **Only calls in flight are shared.** Once a call settles, nothing keeps its
  answer except the hooks that were waiting on it, and the next hook to ask for
  the key sends a new call. *Why not hand a just-landed answer to a hook that
  mounts a moment later:* that is a cache, and a cache needs an expiry rule
  when every read is meant to be fresh. The cases that matter already ask
  together — a day's panels mount in one render, and a refresh or Reconnect
  asks for every key at once — so in-flight sharing makes each of them one
  call. A part that mounts later, such as a row that appears once another read
  is ready, makes a call of its own; a panel that wants its reads shared asks
  for them when it mounts.
- **A re-read reaches every hook holding the key.** Each of these reads a key
  once and puts every hook it applies to on that call:

  | Trigger | Hooks holding the key that take the call | Requests |
  |---|---|---|
  | `retry()`, from any of them | All of them: those without data through `loading`, those with data in the background | One. A second **Try again** while it is in flight joins it |
  | The page becomes visible | `ready` ones in the background, `error` ones through `loading` | One per key |
  | Reconnect | `session-expired` ones, through `loading` | One per key |

  "In the background" is as above: what's showing stays until the answer
  replaces it, and stays, with no error, if the call fails.
- **Each hook takes only the answer of the call it is waiting on.** A hook
  that moves to another range or unmounts stops waiting (the stale-answer rule,
  per hook). The call isn't cancelled — its request is already made — and
  carries on for any hooks still waiting; if none are, its answer is dropped.
  Until it settles it can still be joined, so going back to a day before its
  reads land, or crossing 960px while they are in flight, joins those calls
  rather than sending new ones.
- **An absent read** is `not-connected` for every hook that asks for it, with
  no call and so nothing to share.
- **One session.** A call is joined only in the session it was sent in. Once
  #350's `session` signal changes — the session ends, Reconnect brings a new
  token, another account signs in — calls already in flight are no longer
  joined, and the next read of each key sends a new call. Hooks already waiting
  on an older call still take its answer. In demo mode there is no session, so
  this never applies. *Why:* a call sent just before the session ended can
  still reject with `SessionExpiredError` after Reconnect, and a hook that
  joined it would ask you to reconnect with the session already back; and a
  call made for one account must never answer for another.
- **`sentAt`.** With sharing, the moment a hook asks and the moment the call
  behind its answer was sent can differ: a hook that joined a call, or took the
  answer to another hook's **Try again**, didn't send it. `ready` therefore
  carries when the call behind `data` was sent. A panel that orders reads against its own writes
  compares with that, not with when its hook mounted: #352's rule that a read
  asked for before a save landed never undoes that save needs it, since a
  panel can join a read that went out before the save landed. A background
  refresh changes `data` and `sentAt` together; a failed one leaves both.

`PanelStatus` in `src/day/Panel.tsx` takes a `DayRead` and `source`, the name
it puts into its sentences, and renders the body for every status except
`ready`, for which it renders nothing. `source` is a plain `string`, used as
given — "Thrive", "Hive", "COROS", or #352's "your almanac sheet" — not a fixed
list like `Panel`'s chip, so a panel names its source in its own words:

| Status | Body |
|---|---|
| `not-connected` | `PanelNote` with the info icon: "Thrive isn't connected yet." |
| `loading` | For the first 300ms, an empty line of one `PanelNote`'s height, so demo mode's near-instant reads don't flash. Then "Loading…" in `--color-text-muted`, no icon, `role="status"`. The card's `section` has `aria-busy="true"` throughout. |
| `error` | `PanelNote` with the alert icon in `--color-danger`: "Couldn't load from Thrive.", or when offline "You're offline — couldn't load from Thrive." Under it, **Try again**: link-styled, `--text-sm` weight 600 in `--color-primary`, at least 40px tall, aligned with the words. It calls `retry()`. Not `role="alert"`: offline, every card fails at once. |
| `session-expired` | `PanelNote` with the alert icon in `--color-warning`: "Reconnect to load this." No button of its own; #350's Session ended banner has it. |

"Empty" is not a status: an empty `Map`, or no key for the date, is `ready`,
and what an empty day says is the panel's own words in a `PanelNote`.

### The slots: where panel issues plug in

`src/day/slots.ts` is the one file in `src/day/` that panel issues change. Each
points its slot at its own component (in its own folder, plan §2) and deletes
the placeholder it replaces.

| Slot | #351's placeholder | Replaced by | Rendered on | Renders |
|---|---|---|---|---|
| `lastNight` | `LastNightPlaceholder` | #357 | past, today | The whole card, with `slots.checkIn` at its foot |
| `checkIn` | none (`null`) | #352 | past, today | A block inside the Last night card, under its rows |
| `training` | `TrainingPlaceholder` | #356 | every day | The whole card |
| `todo` | `TodoPlaceholder` | #353 | every day | The whole card |
| `activity` | `ActivityPlaceholder` | #357 | past, today | The whole card |
| `journal` | `JournalPlaceholder` | #352 | every day | The whole card |

The contract, for every slot component:

1. It is a `ComponentType<DayPanelProps>`: `{ date: IsoDate, state: DayState,
   today: IsoDate }`, from `src/day/types.ts`.
2. It renders its card with `Panel`, following the title, chip and sub table
   above, and reads its data with `useDayRead` for the days it needs, showing
   `PanelStatus` until the read is `ready`. It reads only through
   `getDataSource()`. Panels asking for the same read over the same range at
   the same time share one call ([Shared calls](#shared-calls)).
3. It is mounted fresh for each date and again when the layout crosses 960px.
   Anything it can't lose on a remount, such as text being typed, has to be
   saved or held outside it. That is #352's to design.
4. A background refresh, or **Try again** in another panel sharing its read,
   may hand it new data at any time; a panel holding unsaved input must not let
   that overwrite it (#352).
5. `lastNight` renders `slots.checkIn` at its foot on past days and today.
6. It never renders `lastNight` or `activity` content for a future day; the day
   screen doesn't ask it to.

---

## The foot of the day

After the panels, `--space-lg` below the last card: one line at `--text-xs` in
`--color-text-muted`, centred, with `--space-md` padding at the sides. It's the
prototype's, without Withings:

- With a coarse pointer (`(pointer: coarse)`): "almanac reads COROS, Thrive and
  Hive, and writes only your check-in and journal. Swipe sideways to change the
  day."
- Otherwise: "almanac reads COROS, Thrive and Hive, and writes only your
  check-in and journal. ← and → change the day, and t goes to today."

---

## Edge cases

- **The device is in another time zone.** Everything is Denver: today, the day
  state, the pill and the sun. Travelling doesn't move the day.
- **Across a year end.** The week of Monday 28 December 2026 runs to Sunday 3
  January 2027, and its label is "Week of December 28, 2026".
- **DST.** The day it starts and the day it ends each show their own clock
  times, and the daylight change is the true one ("(+3 min)" on 8 March 2026,
  since daylight's length doesn't depend on the offset).
- **Far from today.** Any date `isIsoDate()` accepts works, with no limit
  either way. Months keep counting (see the pill).
- **Live mode, now.** Only `readEntries` exists, so the strip has no marks and
  the placeholders show; nothing says "not connected" yet, because no panel
  that reads Thrive or Hive exists. From #353, #356 and #357, a missing read
  shows `PanelStatus`'s "isn't connected yet".
- **Offline.** The header, sun, strip, moves and placeholders all work. A
  panel's read fails with the offline line and Try again. The strip has no
  marks.
- **The session has ended.** The screen stays usable; panels that read say
  "Reconnect to load this."; after Reconnect they, and the strip, read again by
  themselves.
- **Rapid moves.** Taps, swipes and buttons each move once; held keys move once.
  Each move mounts fresh panels, and answers for dates you've moved past are
  dropped, so the last date you stop on is the one that shows. The calls for a
  day you've left carry on until they land, so swiping back to it before then
  joins them rather than reading it again.
- **Crossing 960px while a read is in flight.** The rebuilt panels ask for the
  same reads and join the calls still in flight; nothing is read twice.
- **Several panels read the same thing.** On a past day or today, the check-in,
  the journal and #357's Sleep row reading the day's entry send one request
  between them, and so do #357's two cards reading the day's health over the
  same range. The week strip's `readWorkouts(monday, sunday)` and #356's
  one-day `readWorkouts` are different ranges, so two calls.
- **Today's date written out** (`#/2026-09-22` on the 22nd) shows as today, with
  no Today control. After midnight it is yesterday, and the control appears.
- **Demo mode across midnight.** The screen moves to the new day, but the
  demo data stays anchored to the day the page loaded, so today's
  hand-placed examples are off by one until a reload.

---

## Copy

| Where | String |
|---|---|
| Title, today | almanac |
| Title, another day | Sep 12, 2026 · almanac |
| Heading | *(weekday)*: Saturday |
| Date line | September 12, 2026 |
| Pill | Today · Yesterday · Tomorrow · 5 days ago · In 5 days · 2 weeks ago · In 8 weeks · 2 months ago · In 19 months |
| Sun line | Sunrise 6:37 AM · Sunset 7:16 PM · 12h 39m of daylight (−2 min) · (+3 min) · (no change) |
| Header buttons | Previous day · Next day |
| Week group label | Week of September 7, 2026 |
| Week day label | Saturday, September 12 · Saturday, September 12 — workouts: 2 done, 1 planned |
| Top bar | Today |
| Move announcement | Saturday, September 12, 2026, 10 days ago |
| Card titles | Last night · Overnight · Training · To do · Completed · Activity · Journal |
| Chips | COROS · Thrive · Hive |
| Past Overnight sub | Fri night → Sat |
| Future Overnight | Sleep, resting HR and HRV for the night before Tue, Sep 29 arrive that morning. |
| Placeholders | *(the table under Placeholders)* |
| Not connected | Thrive isn't connected yet. *(Hive, COROS)* |
| Loading | Loading… |
| Error | Couldn't load from Thrive. |
| Error, offline | You're offline — couldn't load from Thrive. |
| Error action | Try again |
| Session ended | Reconnect to load this. |
| Foot, touch | almanac reads COROS, Thrive and Hive, and writes only your check-in and journal. Swipe sideways to change the day. |
| Foot, mouse | almanac reads COROS, Thrive and Hive, and writes only your check-in and journal. ← and → change the day, and t goes to today. |

## Numbers

almanac is a scaffold, so nothing here could be measured. Every number is
**unmeasured until built**, and each comes from a source:

| Number | Source |
|---|---|
| The 960px breakpoint; touch targets at least 40px | design-language.md, § Layout and § Scale |
| 360px, the narrowest phone this is checked at, leaving a 328px column | chosen here: the narrowest common phone width, less #350's `--space-md` column padding |
| Sunrise and sunset to the minute, below | the prototype's `sun()`, run in Node 24 on 22 September 2026 |
| 39.7392, −104.9903; 90.833° | the prototype's `LAT`/`LON`; NOAA's sunrise zenith |
| 14, 60, 7 and 30.4 in the pill | the prototype's `rel()` |
| 60px, 1.6× and 900ms for a swipe; 350ms swallowing its click | the prototype's swipe handler |
| Three marks a day | the prototype's `weekStrip()` |
| Checking today every minute | chosen here: a rollover shows within a minute, for one cheap comparison |
| 300ms before "Loading…" | chosen here: longer than an in-memory demo read, shorter than an Apps Script call |
| 60 read requests a minute per user | Google Sheets API's per-user read quota, as #352's note cites it; the reason for [Shared calls](#shared-calls) |
| A second or more per Apps Script call | implementation-plan.md § Risks |

`sun()` gives these for Denver, and the port must too:

| Date | Sunrise | Sunset | Daylight |
|---|---|---|---|
| 2026-06-21 | 5:32 AM | 8:31 PM | 14h 59m (no change) |
| 2026-09-22 | 6:46 AM | 6:59 PM | 12h 13m (−2 min) |
| 2026-12-21 | 7:17 AM | 4:38 PM | 9h 21m (no change) |
| 2026-03-08, DST starts | 7:24 AM | 6:58 PM | 11h 34m (+3 min) |
| 2026-11-01, DST ends | 6:28 AM | 5:00 PM | 10h 32m (−2 min) |

`/test` checks the sizes and the breakpoint in the running app, in demo mode,
with `getBoundingClientRect()` at a 360px-wide viewport and at 960px.

## New tokens

The design language and #350 have no token for these. Each value comes from
the source named, and `global.css` defines it on `:root` like the rest.

| Token | Light | Dark | For | Source |
|---|---|---|---|---|
| `--pill-h` | `22px` | | the relative pill's minimum height | prototype `.rel-pill` |
| `--week-day-h` | `62px` | | a week-strip day's minimum height | prototype `.wk-day` |
| `--week-dot-size` | `5px` | | a week-strip mark | prototype `.wk-marks i` |
| `--week-dot-ring` | `1.3px` | | a planned mark's ring | prototype `.wk-marks i.plan` |
| `--today-ring` | `inset 0 0 0 1.5px var(--color-primary)` | the same | today's outline in the strip; the Calendar (#358) may reuse it | prototype `.wk-day.is-today` |
| `--source-dot-size` | `7px` | | the dot in a Thrive or Hive chip | prototype `.src i` |
| `--color-app-thrive` | `#2F66F0` | `#6E97FF` | Thrive's chip dot | prototype `--thrive` |
| `--color-app-hive` | `#F5B700` | `#F5B700` | Hive's chip dot | prototype `--hive` |
| `--tracking-caps` | `0.06em` | | upper-case card titles | prototype `.card-title` |
| `--motion-day` | `220ms` | | the panel area's slide on a move | prototype `.anim-l`, `.anim-r` |
| `--motion-day-shift` | `28px` | | how far it slides | prototype `slideL`, `slideR` |

Sizes the prototype uses off the scale are brought onto it instead of getting
tokens: the week day's 12px radius is `--radius-md`, its 11px letter
`--text-xs`, the sun line's 16px icons `--icon-sm`, and the chip's 11px text
`--text-xs`. The prototype's 36px Today chip and header actions become at least
40px, as #350 did for the top tabs.

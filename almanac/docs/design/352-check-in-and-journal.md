# 352 — Check-in and journal: the day's entry

Tokens are from the standing [design-language.md](design-language.md), the ones
#350 and #351 added are in [350-foundation.md](350-foundation.md#new-tokens) and
[351-day-screen.md](351-day-screen.md#new-tokens), and the one this issue adds is
under [New tokens](#new-tokens). The spec is [../spec.md](../spec.md) (§2, §5,
§6). The behavioural reference is the prototype,
[../prototype.html](../prototype.html): `checkinStrip()`, `cardJournal()`,
`qh()`, and the `ck`, `ck-clear`, `note` and `ck-hours` handlers. Where the
prototype and the design language disagree, the design language wins, and this
note says where that happened.

This note builds on two settled seams: #350's `writeEntry(date, patch)`, which
patches only the cells it is given, queues writes, never retries, and rejects
with `SessionExpiredError` or a `SheetError`; and #351's panel contract —
`slots.checkIn` and `slots.journal`, `Panel`, `PanelNote`, `PanelStatus` and
`useDayRead`, with panels remounting on every day change and whenever the layout
crosses 960px.

Nothing in this note exists yet to measure. See [Numbers](#numbers).

---

## Where they sit

Phone, a past day (the Last night card's rows are #357's; until then #351's
placeholder line stands in):

```
┌────────────────────────────────────────────┐
│ OVERNIGHT  COROS            Fri night → Sat │  #351's card, #357's rows
│ …                                          │
├────────────────────────────────────────────┤  1px --color-border-light
│ YOUR CHECK-IN  not filled in        Saved  │  --color-surface-raised from here down
│ Hours slept                 [  7.5 ] h  (×) │
│ Sleep quality         ( Poor )( OK )( Good )│
│ Energy                ( Low  )( OK )( High )│
│ Tap a choice again to clear it. Blank means │
│ you didn't say — it never counts as OK.     │
└────────────────────────────────────────────┘
        … Training, To do / Completed, Activity …
┌────────────────────────────────────────────┐
│ JOURNAL                           Saving…  │  Panel, no chip; the state is its sub
│ What happened this day?                    │  the text box, four lines to start
│                                            │
│                                            │
│                                            │
└────────────────────────────────────────────┘
```

| Day state | Check-in | Journal |
|---|---|---|
| Past | At the foot of the Overnight card | Its own card, last |
| Today | At the foot of the Last night card | Its own card, last |
| Future | None. #351's future Overnight card has no check-in: you can't rate a night that hasn't happened | Its own card, last |

On wide screens the Journal is the last card in the left column, under
Activity (#351), and the check-in stays inside Last night.

---

## One set of values per day

The check-in and the journal are two views of one sheet row, and #357's Sleep
row reads the same `sleep_hours`. They share one model, held outside the
components in `src/panels/entry/`, so that nothing depends on a component
staying mounted.

**For each date, the page holds:**

- **the read** — the day's entry from `useDayRead('readEntries', date, date)`,
  refreshed in the background when the page comes back into view (#351);
- **the last save's answer** — what `writeEntry` resolved to, which is the whole
  row as it stood when the save landed (#350);
- **unsaved changes** — a value per field you've changed that hasn't landed yet:
  waiting to be sent, in flight, or failed. Plus, for the hours field only, text
  that didn't parse (below).

**What a field shows**, in this order:

1. Its unsaved change, if it has one.
2. Otherwise the newest answer about it — a read or a save's answer — where
   "newest" is by when it was *asked for*. A read asked for before a save landed
   never undoes that save, even if it arrives after it.
3. Otherwise blank, shown as blank: unselected, or an empty field. Never `0`,
   never `OK`.

One more rule for the text box: while it has focus, its text is never replaced
by a read, even for a field with nothing unsaved. Text doesn't move under the
caret.

*How, for `/develop`:* the store keeps, per date, when the last save landed;
`useEntry` notes the moments its read is asked for — mounting, the page coming
back into view, **Try again**, and the session becoming valid again, the same
moments `useDayRead` reads — and trusts an answer only if it was asked for after
that save landed. A remount always asks afresh, so returning to a day always
shows the sheet as it is.

The held values last for the page's life. They are dropped on sign-out and when
a Reconnect brings back a different Google account (#350 treats that as a fresh
sign-in), so nothing changed under one account is ever written to another's
sheet.

### `useEntry(date)`

In `src/panels/entry/useEntry.ts`. The check-in and the journal use it, and so
does #357's Sleep row. It returns what `useDayRead` returns for the day —
`not-connected`, `loading`, `error` with `offline` and `retry()`, or
`session-expired` — except that `ready` carries `values`:

```
values: { notes, sleep_hours, sleep_quality, energy }   // each null when blank
```

These are the values as the blocks show them, by the rule above, unsaved changes
included. They update the moment either block changes one, so a Sleep row
reading `sleep_hours` stays in step with the check-in under it.

Each call reads through `useDayRead`, as #351's contract says. A past day or
today therefore asks for the same entry twice (the check-in and the journal),
and three times once #357's Sleep row uses it. See
[Numbers](#numbers) for why that's worth coalescing in `useDayRead` itself.

---

## The check-in

`CheckIn` in `src/panels/checkin/CheckIn.tsx`, pointed to by `slots.checkIn`. It
is a block inside the Last night card, not a card: the card that hosts it
(#351's placeholder now, #357's card later) renders it as its last child, full
width, and the block draws its own top edge.

### Its look

- **The block:** a 1px `--color-border-light` top border, `--color-surface-raised`
  background, `--space-sm` padding on top and `--space-md` at the bottom. Rows
  inside have `--space-md` at the sides, which lines them up with the card's
  title and with `PanelNote`.
- **Head row:** "Your check-in" as an `h3` in the card-title style (`--text-xs`,
  weight 700, upper case, `--tracking-caps`, `--color-text-secondary`), then
  "not filled in" when every field shows blank, `--space-sm` after it, at
  `--text-xs` in `--color-text-muted`. The save state (below) is pushed to the
  right, styled as a `Panel` sub.
- **Rows:** label on the left, control on the right, `--space-md` between them,
  each row at least 44px tall (design language). Labels are `--text-sm`, weight
  600, `--color-text`. If a row is too narrow for both, the control wraps under
  its label rather than shrinking.
- **The hint**, after the last row, `--space-xs` above it: `--text-xs` in
  `--color-text-muted`. It's always there — it's one of the design language's
  settled strings, and a choice that toggles off needs saying every time.

### Hours slept

```
Hours slept                 [   7.5 ] h  (×)
```

- **The field** is `type="text"` with `inputmode="decimal"`, `enterkeyhint="done"`
  and `autocomplete="off"`, labelled "Hours slept" by its visible label.
  `--hours-field-w` wide, at least 40px tall, `--space-sm` padding at the sides,
  a 1px `--color-border` border, `--radius-md`, `--color-surface` fill, text at
  `--text-base`, right-aligned, `tabular-nums`. The placeholder is "—" in
  `--color-text-muted`. Focus shows `--focus-ring`.
  - *Why text, not `type="number"`:* a number input reports anything it can't
    parse ("7h") as an empty value. The prototype turned that into a save of
    blank — typing something became erasing it. A text field with the decimal
    keypad lets almanac say what's wrong instead.
  - *Why `--text-base`:* iOS zooms the page into any field whose text is
    smaller than 16px.
- **"h"** follows the field, `--space-xs` after it, at `--text-sm` in
  `--color-text-secondary`.
- **The clear button** follows, `--space-xs` after "h": a square
  `--icon-btn-size` target with `--radius-full`, the prototype's `x` icon at
  `--icon-sm` in `--color-text-muted`; hover fills it with `--color-sunken` and
  turns the icon `--color-text` (#350's account-button treatment). Labelled
  "Clear hours slept". It shows while the field has anything in it. When the
  field is empty its space is kept (`visibility: hidden`, so it's out of the tab
  order), and the field doesn't shift sideways when it appears.

**Committing.** What's typed is committed when the field loses focus, when Enter
is pressed (focus stays), and when the block unmounts — so moving to another
day, or `#/` rolling over at midnight, commits what was typed to the day it was
typed on.

| Committed text | Result |
|---|---|
| Empty, or only spaces | Saves blank (an empty cell). Never 0. |
| A number from 0 to 16: digits with at most one `.` or `,` as the decimal point, such as `7`, `7.5`, `7,5`, `.5`, `16` | Rounded to the nearest quarter hour and saved. The field then shows the saved number: `7.3` → `7.25`, `7.1` → `7`, `7.9` → `8`, `0` → `0`. |
| Anything else: `17`, `-1`, `16.5`, `7h`, `7:30`, `abc`, `7.5.1` | Not saved. See below. |
| The same value the field already shows | Nothing is sent. |

The range is checked on the number as typed, before rounding: `16.1` is
refused, and `15.9` saves `16`.

**Refused text.** The text stays in the field exactly as typed, the field gets
`aria-invalid="true"` and a `--color-danger` border, and a line under the row
says "Enter hours from 0 to 16, like 7.5." — an alert icon at `--icon-sm` then
the words at `--text-sm`, both in `--color-danger`, `--space-sm` apart, with
`role="alert"`, and the field's `aria-describedby` pointing at it. The sheet
keeps what it had, and the rest of the check-in carries on normally. The line
goes the next time the field commits valid text or is cleared. The refused text
is held like an unsaved change: it shows again, still refused, if you come back
to the day.

**A value already in the sheet** shows as it is — `7.3`, `20` or `-1`, if
someone typed that into the sheet by hand — and is left alone. Only committing
different text changes it.

**Clearing.** The clear button empties the field and saves blank at once, and
moves focus into the field, since the button it was on has just gone.

### Sleep quality and energy

```
Sleep quality         ( Poor )( OK )( Good )
Energy                ( Low  )( OK )( High )
```

- Each is a `role="group"` labelled "Sleep quality" or "Energy" by its visible
  label, holding three buttons with `aria-pressed`, `--space-xs` apart. The
  buttons are the level words, exactly as #350 stores them: Poor, OK, Good; Low,
  OK, High.
- **A choice:** at least 40px tall, `--space-sm` padding at the sides,
  `--radius-full`, `--text-sm` weight 600. The three in a group are the same
  width, set by the widest word (a row of equal columns), so "OK" isn't a
  narrower target than "Good".

| State | Look |
|---|---|
| Unselected | `--color-surface` fill, 1px `--color-border` border, label in `--color-text-secondary` |
| Hover | Border turns `--color-text-muted` |
| Selected (`aria-pressed="true"`) | `--color-primary-light` fill, 1px `--color-primary` border with a second, inset 1px ring in `--color-primary` inside it, label in `--color-primary` at weight 700. The ring makes the edge read twice as heavy without changing the button's size. |
| Keyboard focus | `--focus-ring` |

- **Tap an unselected choice:** it becomes the one selected, and saves at once.
- **Tap the selected choice:** it clears — none selected — and saves blank at
  once. This is the hint's "Tap a choice again to clear it."
- **Nothing is ever selected for you.** A day with no value shows three
  unselected buttons, never the middle one (design language, § Showing data).
- Tab order: the hours field, its clear button (when shown), Poor, OK, Good,
  Low, OK, High, then any **Try again**.

*Departures from the prototype:* the prototype's 58px minimum width gives way to
equal columns sized by the widest word (no raw width), its 10px side padding
becomes `--space-sm`, and its 32px clear button becomes `--icon-btn-size`, to
meet the design language's 40px touch target.

### The check-in's states

| State | Shows |
|---|---|
| The day's read is `loading`, `error` or `session-expired` | The head row, then #351's `PanelStatus` for "your almanac sheet" in place of the rows and hint: "Loading…" (after 300ms), "Couldn't load from your almanac sheet." or "You're offline — couldn't load from your almanac sheet." with **Try again**, or "Reconnect to load this.". No field or choice is shown, because a blank one would be a guess. Changes already held for the day are kept, and appear once it loads. |
| Ready, nothing set | Head with "not filled in", an empty hours field, no choice selected, the hint |
| Ready, some or all set | The values, by the rule in [One set of values](#one-set-of-values-per-day) |
| Saving, saved, not saved | See [Saving](#saving) |
| Future day | Not rendered. The day screen never asks for it; if it were given `state === 'future'` it would render nothing. |

`not-connected` can't happen — `readEntries` exists in live and demo mode — but
`PanelStatus` covers it anyway.

---

## The journal

`Journal` in `src/panels/journal/Journal.tsx`, pointed to by `slots.journal`,
replacing and deleting #351's `JournalPlaceholder`. It renders its whole card:
`Panel` with `slot="journal"`, the title "Journal", no source chip, and its save
state as the `sub`.

### The text box

- A `textarea` filling the card's width under the header, with no border and no
  fill of its own, `--space-xs` padding on top and `--space-md` at the sides and
  bottom, text at `--text-base` in `--color-text` at the page's own line height.
  Its placeholder is in `--color-text-muted`.
- **Label**, visually hidden: "Journal entry for Saturday, September 12" — the
  weekday, month and day of the date showing.
- **Placeholder** by day state (the prototype's):

  | Past | Today | Future |
  |---|---|---|
  | What happened this day? | How is the day going? Anything worth remembering… | Plans or reminders for this day… |

- **Height:** four lines to start (`rows="4"`), growing with the text so the
  page scrolls, never the box. `resize: none`, since there's nothing to drag.
  *A departure from the prototype,* whose box has a fixed minimum and a resize
  handle: an inner scroll inside a scrolling page is awkward on a phone, and a
  resize handle is unusable by touch.
- **Focus:** the box has no outline of its own. While it has focus, the card
  shows `--focus-ring`, so the whole card reads as the thing you're writing in.
  (Only while the box itself has focus — not when **Try again** inside the card
  does.)
- **Limit:** `maxlength="50000"`, Google Sheets' cell limit (#350). The box
  simply stops taking text there, and a longer paste is cut at the limit. There
  is no counter: a day's journal won't come near it.
- `autocapitalize="sentences"`; spell-check and autocorrect are left on.
- **Plain text.** What's typed is saved exactly as typed, line breaks included,
  and a note starting with `=`, `+`, `-` or `@` stays text (#350 writes it
  `RAW`). Surrounding spaces are kept; a box that's empty after trimming saves
  blank (#350).
- Swipes that start in the box, and ← → and `t` while it has focus, are left to
  the box (#351).

### The journal's states

| State | Shows |
|---|---|
| The day's read is `loading`, `error` or `session-expired` | `PanelStatus` for "your almanac sheet" as the body, as in the check-in. No text box, so nothing typed can land on top of text that hasn't loaded. Text already held for the day is kept, the sub still says so ("Not saved", or "Saving…"), and it appears once the day loads. |
| Ready, no notes | The empty box with its placeholder. No sub. |
| Ready, notes | The notes. No sub until you change something. |
| Saving, saved, not saved | See [Saving](#saving) |

*A departure from the prototype,* which labels any day with a note "Saved" as it
loads. Here "Saved" answers something you did; on a day you haven't touched
there is nothing to confirm.

---

## Saving

### When a save is sent

| Change | Sent |
|---|---|
| Tapping a choice | At once |
| The clear button | At once |
| Committing the hours field (leaving it, Enter, or the block unmounting) | At once, if the text is valid and differs from what shows |
| Typing in the journal | One second after the last keystroke; at once when the box loses focus, when the block unmounts (moving to another day, the layout crossing 960px, the midnight rollover), and when the page is hidden (`visibilitychange` to hidden, or `pagehide`) |

- **A save carries every unsaved change for the day**, from both blocks, as one
  `writeEntry(date, patch)`. The patch has only the fields that changed; #350
  writes only those cells, so the day's other cells — including anything typed
  into the sheet by hand — keep their values.
- **One save per day in flight.** Changes made while one is in flight wait, and
  go together in the next save as soon as it lands (the journal's still after
  its one-second pause). So rapid taps — Good, OK, Poor — leave Poor in the
  sheet, and there's never a queue of stale saves behind a fast typist.
- **When a save lands,** each field it carried stops being unsaved, unless you
  changed it again meanwhile, in which case the newer value is still unsaved and
  goes next. The save's answer then counts as the newest word on the day's other
  fields too.
- **A save belongs to its date,** not to what's on screen. Moving to another day
  mid-save doesn't cancel it or redirect it.
- Viewing, moving through days and reloading never write anything.

### What each block says

The check-in's state sits at the right of its head row; the journal's is its
card's `sub`. Both are words only, `--text-xs` in `--color-text-muted`, one
line, and they describe only that block's own fields: tapping a choice doesn't
make the journal say "Saving…", unless its own text happens to ride in the same
save.

| State | Words |
|---|---|
| Nothing changed on this page for this day | *(nothing)* |
| A change is waiting (the journal's pause) or in flight | Saving… |
| Every change has landed | Saved |
| A save failed | Not saved |

"Saved" stays until the next change, and survives a remount: it belongs to the
day for the page's life, like the values. The sub isn't a live region —
announcing "Saving…" and "Saved" at every pause in typing would talk over the
typing. Failures are announced, below.

*A departure from the prototype,* which puts a check icon before "Saved". The
sub is words only, so it doesn't need a fourth icon size for 12px text; the
failure line below carries the icon a status needs.

### When a save fails

What you set or typed stays exactly as it is. The block's state reads "Not
saved", and a line appears at the end of the block — under the check-in's hint,
or under the journal's text box — built like #351's `PanelStatus` error: a
`PanelNote` with an alert icon, and where there's something to do, **Try
again** under it (link-styled, `--text-sm` weight 600 in `--color-primary`, at
least 40px tall, aligned with the words). The line has `role="alert"`, so it's
announced once when it appears.

| Why | Icon colour | Line | Action | Retries by itself |
|---|---|---|---|---|
| Offline (`SheetError` `offline`) | `--color-danger` | You're offline — this will save when you're back online. | **Try again** | When the browser reports it's back online (the `online` event) |
| Session ended (`SessionExpiredError`) | `--color-warning` | Reconnect to save this. | None — #350's Session ended banner has **Reconnect** | When Reconnect brings back the same account |
| Anything else (`SheetError` `request`, `missing` or `schema`) | `--color-danger` | Couldn't save to your almanac sheet. | **Try again** | No |

- **While the day's read isn't ready** (the block shows `PanelStatus` in place
  of its fields), the failure line waits: one line and one **Try again** at a
  time, and that one reads the day. The state still says "Not saved", and the
  changes still retry by themselves on the events in the table. Once the day
  loads, the line appears under the fields.
- **Another change to the same day also tries again,** since a save carries
  every unsaved change.
- **Try again** sends the day's unsaved changes at once. The line stays, and
  the state reads "Saving…", until the save lands or fails again.
- **Nothing retries in a loop.** Only the two events in the table, a new
  change, or **Try again** send a failed save again.
- **A day you've moved away from** keeps its failed changes. They retry by
  themselves on the two events above, and show with their line when you come
  back. Nothing on other days points to them; the prompt on leaving the page
  (below) is the backstop.
- **The sheet went missing** (`missing`): #350 replaces the frame with its
  "Couldn't open your almanac sheet" card, whose **Try again** starts a new
  sheet. When the day shows again, your unsaved changes are still there with
  "Couldn't save to your almanac sheet." They are not sent to the new sheet by
  themselves — the New sheet banner tells you how to restore the old one, and
  saving into the stand-in first would split the day across two sheets. **Try
  again** sends them.
- **Session ended while typing:** keep typing. Every pause tries, fails at once
  without a request (#350), and keeps the line up. After Reconnect it all saves
  by itself.

### Leaving the page with something unsaved

Outside demo mode, while any day has an unsaved change — waiting, in flight,
failed, or refused hours text — the page registers a `beforeunload` handler, so
closing the tab, reloading or navigating away asks first with the browser's own
dialog. With nothing unsaved, there's no handler and no prompt. Demo mode never
asks: nothing survives a reload there anyway, and "Exit demo" reloads.

Phones often don't show that dialog. That's why a waiting journal save is sent
the moment the page is hidden.

---

## Remounts and refreshes

#351 remounts every panel when the day changes and when the layout crosses
960px, and refreshes each read in the background when the page comes back into
view. None of those loses anything here, because nothing unsaved lives in a
component:

- **Moving to another day and back:** the new mount reads afresh. Unsaved,
  in-flight and failed changes show again with their state; everything else
  shows the sheet as it now is.
- **Crossing 960px:** the same. And if the journal box or the hours field had
  focus when the layout was rebuilt, the new one gets focus back, with the same
  selection or caret position. (Only for the same date: a remount for a new day
  never pulls focus into it.) This is what keeps a tablet rotated mid-sentence
  from dropping the keyboard and the place you were typing.
- **The page coming back into view:** fields with no unsaved change take the
  refreshed values — this is where another device's edit shows up — except the
  text box while it has focus. A refresh asked for before your last save landed
  never undoes it.

---

## Demo mode

Everything above holds, against #350's in-memory copy of the demo entries:
saves land almost at once, "Saving…" gives way to "Saved", moving away and back
shows what you set, and a reload starts from the generated data again. The
demo's hand-placed examples make every state reachable: today has no entry
("not filled in"), yesterday has one, and the day four days ahead has a note in
its journal. Demo saves don't fail, so the failure lines are the suite's to
cover.

---

## Edge cases

- **0 hours** is a real answer: it saves 0 and shows "0". Only an empty field is
  blank.
- **Rapid repeat taps** on one choice toggle it on and off; the sheet ends with
  the last state.
- **Typing one character and deleting it** on a day with no row appends a row
  with the date and blank cells. #350 reads an all-blank row as no entry, so it
  still shows as not filled in.
- **Two devices, same day.** Each field's last save wins. A device with no
  unsaved change to a field shows the other's edit on its next read (moving to
  the day, or coming back to the page). Two devices typing into the same day's
  journal at once would overwrite each other's text; that isn't merged (Out of
  Scope).
- **Midnight in Denver while typing on `#/`.** #351 moves `#/` to the new day
  within a minute. The journal and the hours field commit to the day they were
  typed on, and the screen shows the new day. Go back one day to carry on.
- **A choice word typed into the sheet in another case** (`good`) reads as
  `Good` (#350) and shows selected; the cell is rewritten only if you change
  it.
- **A hand-edited `sleep_hours` of `abc`** reads as blank (#350), so the field
  shows empty; committing a number replaces the cell.
- **Signing out** with changes unsaved discards them without asking. Sign-out
  has no confirmation (#350), and it means "forget this account here".
- **Offline when a day loads:** the blocks show the offline read line and
  **Try again**, like every panel. Nothing can be typed until the day has
  loaded.

---

## For later issues

- **Slots.** `slots.checkIn` is `CheckIn`, and `slots.journal` is `Journal`.
  #351's `JournalPlaceholder` is gone.
- **#357, the Last night card:** render `slots.checkIn` as the card's last
  child, full width, outside any padded container — the block draws its own
  top border, background and padding — on past days and today, whatever state
  the card's own reads are in. The check-in reads its own data.
- **#357, the Sleep row:** `useEntry(date)` gives `values.sleep_hours` as the
  check-in shows it, unsaved changes included, and updates the moment it
  changes, so "you said 7½ h" and the stand-in follow the check-in under them
  without a reload. `formatSleepHours(hours)` in `src/panels/entry/format.ts`
  gives the "7½ h": rounded to the nearest quarter hour first, then the whole
  hours and ¼, ½ or ¾, then " h" — "7½ h", "8 h", "6¼ h", "¾ h" (no leading
  0), "0 h", and "8 h" for 7.9. (The prototype's `qh()` gets 0.75 and 7.9 wrong;
  this doesn't.)
- **#358 and #359** read entries over their ranges with `readEntries(from, to)`
  — one request whatever the range (#350). A journal dot is `notes !== null`;
  the check-in charts use `sleep_quality`, `energy` and `sleep_hours`, and
  display hours with `formatSleepHours`. What they read is the sheet: a change
  still unsaved on the day screen isn't in it yet, and a cached month goes stale
  when a save lands, so read entries afresh each time the screen opens.

---

## Copy

| Where | String |
|---|---|
| Check-in heading | Your check-in |
| Check-in, nothing set | not filled in |
| Hours label | Hours slept |
| Hours unit | h |
| Hours placeholder | — |
| Clear button label | Clear hours slept |
| Hours refused | Enter hours from 0 to 16, like 7.5. |
| Choice groups | Sleep quality · Energy |
| Choices | Poor · OK · Good — Low · OK · High |
| Hint | Tap a choice again to clear it. Blank means you didn't say — it never counts as OK. |
| Journal title | Journal *(#351)* |
| Journal box label | Journal entry for Saturday, September 12 |
| Journal placeholder, past | What happened this day? |
| Journal placeholder, today | How is the day going? Anything worth remembering… |
| Journal placeholder, future | Plans or reminders for this day… |
| Save state | Saving… · Saved · Not saved |
| Save failed, offline | You're offline — this will save when you're back online. |
| Save failed, session ended | Reconnect to save this. |
| Save failed, other | Couldn't save to your almanac sheet. |
| Save failed, action | Try again |
| Read states *(#351's `PanelStatus`)* | Loading… · Couldn't load from your almanac sheet. · You're offline — couldn't load from your almanac sheet. · Try again · Reconnect to load this. |
| `formatSleepHours` | 7½ h · 8 h · 6¼ h · ¾ h · 0 h |

## Numbers

almanac is a scaffold, so nothing here could be measured. Every number is
**unmeasured until built**, and each comes from a source:

| Number | Source |
|---|---|
| 0–16 hours, in quarter hours | spec §6 via the issue; #350 left the range to this issue |
| 50,000 characters | Google Sheets' per-cell limit (#350) |
| One second after the last keystroke | chosen here, over the prototype's 500ms. Each save is two Sheets requests — #350's write looks the row up, then updates it — and Sheets allows 60 read requests a minute per user. A second still lands well before anyone could leave the day, and leaving sends it at once anyway. |
| Touch targets at least 40px; rows at least 44px | design-language.md, § Scale |
| 16px text in the hours field | iOS zooms into any field under 16px; `--text-base` |
| Four lines for the text box | the prototype's `rows="4"` |
| `--hours-field-w` 78px | the prototype's `.hours input`: "16.25" at `--text-base` plus `--space-sm` each side |
| 300ms before "Loading…" | #351's `PanelStatus` |

**Will a check-in row fit on one line at 360px?** Expected, by arithmetic, not
measured: #351's 328px column, less the card's 1px borders and the rows'
`--space-md` at each side, leaves about 294px. "Sleep quality" at `--text-sm`
weight 600 is about 90px; three equal choices sized by "Good" plus `--space-sm`
each side are about 52px each, so 164px with their gaps; with `--space-md`
between label and group that's about 270px. If it doesn't fit, the choices wrap
under their label, which is the designed fallback, not a failure.

**Reads per day, and why `useDayRead` should share them.** The check-in and the
journal each call `useDayRead('readEntries', date, date)`, per #351's contract,
so a past day or today reads the sheet twice, and three times once #357's Sleep
row calls `useEntry`. Each is one small Sheets request, and the behaviour here
doesn't depend on how many there are — but Sheets' 60-reads-a-minute-per-user
quota is reachable by swiping quickly through days, and a 429 shows as "Couldn't
load". Two hooks asking for the same read and range at the same moment sharing
one call would make it one read per day. That belongs in `useDayRead` (#351),
not here.

`/test` checks the sizes in the running app, in demo mode, with
`getBoundingClientRect()` at a 360px-wide viewport.

## New tokens

The design language, #350 and #351 have no token for this. `global.css` defines
it on `:root` like the rest.

| Token | Value | For | Source |
|---|---|---|---|
| `--hours-field-w` | `78px` | the Hours slept field's width | prototype `.hours input` |

Everything else here is on the existing scales. The prototype's off-scale values
are brought onto them rather than given tokens: the check-in's 10px/12px
padding becomes `--space-sm`/`--space-md`, the choices' 10px side padding
`--space-sm`, their 58px minimum width equal columns, the clear button's 32px
`--icon-btn-size`, the journal's 1.55 line height the page's own, the journal's
3px focus glow and the hours field's 3px focus ring `--focus-ring`, and the
"Saved" check icon is dropped.

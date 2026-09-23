# 350 — Foundation: the frame, sign-in, the sheet and demo mode

Tokens are from the standing [design-language.md](design-language.md), and the
few this issue adds are under [New tokens](#new-tokens). The spec is
[../spec.md](../spec.md) (§2, §5, §6, §9.2, §9.3, §9.6). The behavioural
reference is the prototype, [../prototype.html](../prototype.html): its top bar,
tabs and `build()` generator. Where the prototype and the design language
disagree, the design language wins, and this note says where that happened.

cairn solved sign-in and a `drive.file` store first. Its notes are the
precedent for the session behaviour here:
[32-google-sign-in.md](../../../cairn/docs/design/32-google-sign-in.md) and
[72-drive-session-lifecycle.md](../../../cairn/docs/design/72-drive-session-lifecycle.md).

Nothing in this note exists yet to measure. See [Numbers](#numbers).

---

## What the app shows on load

Decided once, at load, in this order:

| Condition | Shows |
|---|---|
| The URL's query has `demo=true` | The frame in demo mode. Nothing else below is consulted, and no Google script loads. |
| `VITE_GOOGLE_CLIENT_ID` is empty | The sign-in screen, with its button disabled and the "not set up" line. "Try the demo" still works. |
| `sessionStorage` holds a session that is still valid | The connecting screen, then the frame. No Google window opens. |
| Otherwise | The sign-in screen with no message. An expired stored session is cleared first. |

"Still valid" means the stored expiry, less a 60-second margin (Thrive's
`saveCachedAuth`), is in the future. The route in the URL is never touched by
any of this: whatever `#/…` the page opened with is where the frame opens once
it can.

## The card screens: sign-in, connecting and sheet errors

Everything shown before the frame is one centred card, so that moving between
these states swaps the card's lower half and nothing else jumps. It follows
Thrive's login screen, so the suite signs in the same way everywhere.

```
┌───────────────────────────────────┐
│                                   │   --color-bg, full viewport, card centred
│      ┌───────────────────────┐    │
│      │         ⬡            │    │   the mark, --mark-size-lg
│      │       almanac         │    │   --text-2xl, 700, --color-text
│      │    The day ahead.     │    │   --color-text-secondary
│      │                       │    │
│      │ [ Sign in with Google ]│    │   lower half: changes per state
│      │     Try the demo      │    │
│      │                       │    │
│      │ almanac keeps your …  │    │   footnote, --text-xs, --color-text-muted
│      └───────────────────────┘    │
└───────────────────────────────────┘
```

**Card:** `--color-surface`, `--radius-lg`, `--shadow-lg`, padding `--space-2xl`
top and bottom and `--space-xl` at the sides, at most `--card-narrow` wide and
the full width below that, text centred. The viewport padding is `--space-lg`.
There are no tabs and no top bar.

**The primary button:** full width of the card, at least 44px tall (design
language, rows), `--color-primary` fill, `--color-on-primary` label at
`--text-base` weight 600, `--radius-md`, and `--color-primary-hover` on hover.
It is a plain button, not Google's branded asset (cairn #32's reasoning: that
asset is built for its own chrome, not ours).

**A link-styled action** ("Try the demo", "Open the sheet", "Sign out" on the
error card): `--text-sm`, weight 600, `--color-primary`, at least 40px tall,
and centred under the button with `--space-sm` above it.

**An error line** sits between the button and the link: an alert icon at
`--icon-md` and the words, both in `--color-danger`, at `--text-sm`, and
`role="alert"`.

### Sign-in

The lower half is the button **Sign in with Google**, then **Try the demo**.
The footnote reads:

> almanac keeps your journal in a Google Sheet it creates in your Drive. It
> can't see your other files.

It is there because Google's consent screen is about to ask about Drive, and
the footnote says, before it does, why and how little.

**The main path:**

1. Tap **Sign in with Google**. The button is disabled and reads
   **Signing in…**. The Google Identity Services script loads now if it hasn't
   already, and Google's window opens asking for `openid email
   https://www.googleapis.com/auth/drive.file`.
2. You finish in Google's window. almanac checks that Drive access was granted
   (GIS `hasGrantedAllScopes`), then reads the account's email from
   `https://www.googleapis.com/oauth2/v3/userinfo`.
3. The card moves to **Connecting** (below).

**Its states:**

| State | Lower half |
|---|---|
| Ready | The button, then "Try the demo". |
| Signing in | The button disabled, reading "Signing in…". "Try the demo" stays. |
| Cancelled | You closed Google's window. The card returns to Ready with no message; a cancel is not an error. |
| Popup blocked | Ready, plus the error line "The sign-in window was blocked. Allow pop-ups for this site, then try again." |
| Drive access not granted | You unticked Drive on Google's consent screen. You are **not** signed in, because almanac can't keep a journal without it. Ready, plus "almanac needs access to the files it creates in your Drive. Sign in again and leave that box ticked." |
| Google didn't load | The GIS script failed to load, or hadn't loaded 15 seconds after the tap. Ready, plus "Couldn't reach Google. Check your connection and try again." |
| Failed | Any other failure, including the email lookup. Ready, plus "Couldn't sign in. Try again." |
| Not set up | `VITE_GOOGLE_CLIENT_ID` is empty. The button is disabled, and under it, in `--color-text-muted` with no icon (it isn't the reader's fault): "Sign-in isn't set up in this build — VITE_GOOGLE_CLIENT_ID is empty. The demo still works." |

An error line clears the next time the button is tapped. Tapping the button
again while it is disabled does nothing.

### Connecting

The lower half becomes one status line in `--color-text-secondary` at
`--text-base`, in place of the button and link, with `role="status"`. The
footnote goes. There is no spinner. As in cairn #32, the words say which wait
it is, and different waits get different words.

| Step | Line |
|---|---|
| Looking the sheet up, and checking its header | "Finding your almanac sheet…" |
| Creating it, when none was found | "Creating your almanac sheet in Google Drive…" |

A fresh sign-in and a restored session show the same screen. The reader didn't
do anything different, so there is no reason to word them differently.

On success the frame replaces the card, at the route in the URL.

A 401 while a *restored* session connects means the stored token was revoked.
The session is cleared and the sign-in screen shows with no message, as cairn
#72 does for a session that quietly lapsed. A 401 during a *fresh* sign-in
shows "Couldn't sign in. Try again."

### Sheet errors

These are the same card with the mark, a heading in place of "almanac" and the
tagline (`--text-xl`, weight 700), one line of explanation in
`--color-text-secondary`, the primary button **Try again**, and link-styled
actions under it.

| Cause | Heading | Line | Actions |
|---|---|---|---|
| Offline (a `fetch` that throws while `navigator.onLine` is false) | Couldn't open your almanac sheet | "You're offline. Connect and try again." | Try again · Sign out |
| Any other failure finding, creating or checking the sheet, including a 403 or 429, or the sheet disappearing mid-session (a 404) | Couldn't open your almanac sheet | "Google didn't respond as expected. Try again in a moment." | Try again · Sign out |
| The header row has been changed | Your almanac sheet has been changed | "Its first row should read date, notes, sleep_hours, sleep_quality, energy. almanac won't write to it until it does." | Try again · Open the sheet · Sign out |

**Try again** repeats only the sheet step, under the token already held, and
shows the connecting line while it runs. It never opens a Google window (cairn
#32's folder retry). **Open the sheet** opens
`https://docs.google.com/spreadsheets/d/<id>/edit` in a new tab. **Sign out** is
the same as in the account menu.

---

## The frame

```
Phone (below 960px)                         Wide (960px and up)
┌─────────────────────────────┐             ┌──────────────────────────────────────────────┐
│ ⬡ almanac               (👤)│ top bar     │ ⬡ almanac    ( ☀ Day | ▦ Calendar | ↗ Trends ) (👤)│
├─────────────────────────────┤             ├──────────────────────────────────────────────┤
│ banners, if any             │             │ banners, if any                              │
│                             │             │                                              │
│ screen                      │             │ screen                                       │
│                             │             │                                              │
├─────────────────────────────┤             └──────────────────────────────────────────────┘
│   ☀        ▦        ↗       │ bottom bar
│  Day    Calendar  Trends    │
└─────────────────────────────┘
```

### Top bar

- It is sticky at the top, below `env(safe-area-inset-top)`, `--top-h` tall,
  with `--space-md` padding at each side and `--space-md` between its parts. The
  background is `--top-bar-bg` with `--top-bar-blur` behind it (the prototype's
  `.topbar`), so the screen scrolling under it stays faintly visible. There is
  no border.
- **Brand**, at the left: the mark at `--mark-size`, then the wordmark
  "almanac" at `--text-lg`, weight 700, `--color-text`, `--space-sm` apart. The
  whole of it is one link to `#/`, at least 44px tall, labelled "almanac — go
  to today". (Before #351, `#/` is simply the Day tab.)
- **Account button**, at the right: a person icon at `--icon-md` in
  `--color-text-secondary`, centred in a square `--icon-btn-size` target with
  `--radius-full`. Hover fills it with `--color-sunken` and turns the icon to
  `--color-text`. It is labelled "Account, <email>", or "Account, demo" in demo
  mode, and has `aria-haspopup="menu"` and `aria-expanded`.
- The space between them is left empty on phones. #351 puts its Today control
  just before the account button.

### Tabs

There are three, in this order: **Day** (the prototype's sun icon),
**Calendar** (calendar icon) and **Trends** (the axis-and-line icon). Each is a
link, not a button:

| Tab | Link | Current when the first path segment is |
|---|---|---|
| Day | `#/` | anything other than `calendar` or `trends`, including nothing |
| Calendar | `#/calendar` | `calendar` |
| Trends | `#/trends` | `trends` |

The current tab has `aria-current="page"`. Both tab sets are a
`<nav aria-label="Sections">`.

**Phone: the bottom bar.** It is fixed to the bottom, `--nav-h` tall plus
`env(safe-area-inset-bottom)`, with a `--color-surface` background and a 1px
`--color-border` top border. The three tabs share the width equally. Each is
its icon at `--icon-lg` above its label at `--text-xs`, weight 600, in
`--color-text-secondary`. The current tab's icon and label are
`--color-primary`.

**Wide: in the top bar.** From 960px the bottom bar is gone and the tabs sit
centred in the top bar as one segmented control: a `--color-sunken` track with
`--radius-full` and `--space-xs` padding. Each tab is its icon at `--icon-sm`
followed by its label at `--text-sm`, weight 600, `--color-text-secondary`,
with `--space-md` padding at the sides, `--radius-full`, and at least 40px
tall. The current tab is raised: `--color-surface` fill, `--shadow-sm`, and its
icon and label in `--color-primary`. Hover on another tab turns it
`--color-text`.

*Two departures from the prototype, both to follow the design language.* The
prototype's top tabs are 36px tall, and the design language wants touch
targets of at least 40px. The prototype marks the current top tab in
`--color-text`, and the design language gives selected states to
`--color-primary`, which also matches the bottom bar.

### Screens and routes

- The router is a signal. The first path segment picks the tab, and the rest
  of the path goes to that tab's screen untouched: `#/2026-09-12` is Day with
  `['2026-09-12']`, `#/calendar/2026-09` is Calendar with `['2026-09']`, and
  `#/trends/sleep` is Trends with `['sleep']`. An unrecognised first segment is
  Day's to interpret (#351). This issue's router never redirects.
- Following a tab pushes a history entry, so the browser's back and forward
  buttons move between tabs.
- **Changing tab scrolls the window to the top.** A change within a tab, such
  as a new sub-path, doesn't; that is the screen's decision.
- **Document titles:** Day, and the card screens, are "almanac". Calendar is
  "Calendar · almanac" and Trends is "Trends · almanac". Later issues may make
  them more specific.
- **Main column:** at most `--content-max` wide, centred, with `--space-md`
  padding at the sides. On phones it has enough bottom padding to clear the
  bottom bar (`--nav-h` + safe area + `--space-xl`). From 960px it is at most
  `--content-max-wide` wide, with `--space-2xl` bottom padding.
- **Placeholders**, in this issue for all three tabs: the tab's name as a
  heading (`--text-xl`, weight 700), then "Coming soon." in
  `--color-text-secondary`, with `--space-2xl` above. #351, #358 and #359
  replace them.

### Account menu

It opens under the account button, right-aligned with the top bar's padding.
It is `--color-surface`, with a 1px `--color-border` border, `--radius-md`,
`--shadow-lg`, and at least as wide as its longest row. Rows are at least 44px
tall, with `--space-md` padding at the sides and text at `--text-sm`.

| Signed in | Demo |
|---|---|
| the email, in `--color-text-secondary`. Not interactive, truncated with an ellipsis if long | "Demo account", in `--color-text-secondary` |
| **Open your sheet** ↗, which opens the sheet in Google Sheets in a new tab | **Exit demo** |
| **Sign out** | |

- It has `role="menu"` and its actions `role="menuitem"`. Opening it focuses
  the first action. The up and down arrow keys move between actions.
- Escape, a click or tap outside, or choosing an action closes it, and focus
  returns to the account button.
- **Sign out** clears the stored session and shows the sign-in screen at once,
  with no confirmation (cairn #32). The route stays in the URL. The Google
  grant is not revoked, as in Thrive, so the next sign-in skips the consent
  screen.

### Banners

Banners go in one region directly under the top bar, spanning the full width,
with their content aligned to the main column. Each is one row: a leading icon
at `--icon-md`, the words at `--text-sm`, then its action. Padding is
`--space-sm` top and bottom and `--space-md` at the sides. If more than one
applies, they stack in the order below.

| Banner | When | Look | Words | Action | Scrolls away? |
|---|---|---|---|---|---|
| **Session ended** | The session has expired (below) | `--color-warning-tint` background; alert icon in `--color-warning`; words in `--color-text` | "Your Google session has ended. Reconnect to keep loading and saving." | **Reconnect**, a compact primary button: `--color-primary` fill, `--color-on-primary` label at `--text-sm` weight 700, `--radius-full`, at least 40px tall | No. It sticks under the top bar, because you have to act on it. |
| **New sheet** | This device had used a sheet before, and connecting found none and created one | `--color-surface-raised` background, 1px `--color-border-light` bottom border; info icon in `--color-text-secondary`; words in `--color-text` | "Your almanac sheet wasn't in your Google Drive, so almanac started a new one. If you deleted it by mistake, restore it from Drive's trash and reload." | A dismiss ×, `--icon-btn-size`, labelled "Dismiss" | Yes |
| **Demo** | Demo mode | as New sheet | "**Demo mode** — sample data. Changes aren't saved." The first two words are in `--color-text` at weight 700, the rest in `--color-text-secondary`. | **Exit demo**, link-styled | Yes |

Every banner has `role="status"`. The New sheet banner shows until it is
dismissed or the page reloads. It is not announced again after a reload,
because by then the new sheet is the remembered one. Demo mode can't show the
other two, since it has no session.

---

## Session: expiry and reconnect

Port cairn's `googleIdentity.ts` and its session lifecycle (cairn #72), with
almanac's scopes and signals in place of React state.

- **Stored** in `sessionStorage` under `almanac:session`, as
  `{ accessToken, expiresAt, email }`, with `expiresAt` absolute. Why
  `sessionStorage`: cairn #72's reasoning, plus one more reason. Every app on
  `luketmoss.github.io` shares one `localStorage`, and from #355 on this token
  also reads Thrive and Hive. The cost is the same as cairn's: a new tab, or a
  closed and reopened browser, signs in again with one tap.
- **Expires** at `expiresAt` less the 60-second margin. A timer fires then.
  Because phones throttle timers in background tabs, the check also runs on
  `visibilitychange` when the page becomes visible. Any Google request that
  returns 401 expires the session too, but only if the request was made with
  the token currently held. A late 401 from a token that a reconnect has
  already replaced is ignored (cairn #72's edge case).
- **While expired**, the frame and whatever screen was showing stay as they
  are, and the Session ended banner appears. `getAccessToken()` throws
  `SessionExpiredError`, and every live read and write rejects with it without
  sending a request. How a screen shows that is the screen's own business;
  #352's journal keeps what was typed.
- **Reconnect** disables the button and relabels it **Reconnecting…**, then
  asks Google for a token with `prompt: ''` and `login_hint: <email>`. While
  Google's grant stands, that window closes by itself.
  - With a new token for the **same** account, it stores the token, removes the
    banner and carries on. The sheet isn't looked up again.
  - With a **different** account, it is a fresh sign-in for that account: the
    connecting card, then that account's sheet.
  - If Google's window is closed, the banner returns unchanged, with no
    message.
  - If the window is blocked, the banner's words become "The sign-in window was
    blocked. Allow pop-ups for this site, then reconnect."
  - On any other failure, the banner returns unchanged.
- **There is no silent re-auth.** A Google window that a tap didn't open gets
  blocked, and a reconnect that sometimes works invisibly and sometimes fails
  invisibly is worse than one that always asks for one tap. This departs from
  Thrive's `reauth.ts` and follows cairn.
- **Public surface** for later issues, in `src/auth/session.ts`: the `session`
  signal, `getAccessToken()`, `reportUnauthorized(token)` and
  `SessionExpiredError`. #355 sends `getAccessToken()`'s token to Thrive's and
  Hive's APIs, and calls `reportUnauthorized` when they reject it.

---

## The almanac sheet

### Finding it, creating it, checking it

Every sign-in, and every restored session, resolves the sheet again. Its ID is
not taken from the stored session (cairn #32 and #72 do the same with the
folder).

1. **Find:** Drive `files.list` with
   `appProperties has { key='almanac' and value='entries' } and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`.
   Under `drive.file`, this only ever sees files almanac created, on any device
   signed in to that account. If there are several, the oldest by `createdTime`
   wins and the rest are left alone.
2. **Create**, when none was found: a Google Sheet named `almanac` in the Drive
   root, carrying the app property `almanac=entries`. Its first tab gets the
   header row `date | notes | sleep_hours | sleep_quality | energy` in
   `A1:E1`, row 1 frozen, and column A formatted as plain text, so that a date
   typed into the sheet by hand stays text.
3. **Check** the first tab's `A1:E1`, the tab almanac uses whatever it is
   called:
   - If it is empty, almanac created the sheet but setup never finished. Write
     the header, freeze row 1 and format column A, then carry on. Don't make a
     second sheet.
   - If it matches, carry on. Case and surrounding spaces are ignored, and
     anything in F onwards is yours and is ignored.
   - Anything else gives the "has been changed" card, and nothing is written.
4. **Remember** `{ email, id }` in `localStorage` under `almanac:sheet`. It
   holds no secret. It exists only so that the next connect on this device can
   tell "first time" from "it disappeared". If step 1 finds nothing but this
   device remembers a sheet for the same email, the new sheet gets the New
   sheet banner. If step 1 finds a *different* sheet than the remembered one,
   that is a silent switch (another device's, or a restored original), and
   the remembered ID is updated.

The spreadsheet's name and folder are yours to change, and almanac never looks
at either.

### Reading: `readEntries(from, to)`

- It reads `A2:E` of the first tab in one request, with
  `valueRenderOption=UNFORMATTED_VALUE`, then keeps the rows whose date is
  within `from` to `to` inclusive. One request whatever the range, and no
  caching: each call reads afresh, so another device's writes show on the next
  read. At one row a day the whole tab stays small.
- **Only a date cell that is text in the form `YYYY-MM-DD`, and a real date,
  counts.** A row without one is ignored for reading and for finding rows.
- **Blank stays blank.** An empty cell, or a missing trailing cell, reads as
  `null`. Never `0`, never `''`, never `OK`. A `notes` cell that is empty after
  trimming is `null`. A row whose four fields are all `null` is not an entry and
  gets no key in the map.
- **Hand-edited values.** A level matching `Poor`/`OK`/`Good` or
  `Low`/`OK`/`High` case-insensitively reads as the canonical word. Anything
  else in a level column, and a `sleep_hours` that isn't a finite number, reads
  as `null`. The cell is left as it is: nothing is "corrected" in the sheet.
- **A date on more than one row** is read from the topmost of them, and written
  to it too.

### Writing: `writeEntry(date, patch)`

- **Only the fields in `patch` are written.** The other cells in the row keep
  whatever is there, including anything typed by hand and anything another
  device wrote. `null`, and a `notes` that is empty after trimming, empties the
  cell. Otherwise:

  | Field | Stored as |
  |---|---|
  | `date` | text `YYYY-MM-DD` |
  | `notes` | the text exactly as given, with `valueInputOption=RAW`, so a note starting with `=`, `+`, `-` or `@` is never read as a formula |
  | `sleep_hours` | a number. A non-finite number is refused before any request. The range (quarter hours, 0–16) is #352's to enforce. |
  | `sleep_quality` | exactly `Poor`, `OK` or `Good` |
  | `energy` | exactly `Low`, `OK` or `High` |

- **Row lookup happens at write time.** Each write re-reads the tab, finds the
  date's row as it is now, and then updates just the patched cells. If the date
  has no row, it appends one: `[date, notes, sleep_hours, sleep_quality,
  energy]`, with blanks for what the patch doesn't set. A row inserted,
  deleted or re-sorted since the last read, whether by hand or on another
  device, can't make a write land on the wrong date.
- **One at a time, in order.** Writes queue behind each other, so two quick
  writes for a new date make one row: the second finds the row the first
  appended.
- **It resolves** to the entry as it now stands, or `null` if all four fields
  are now blank. The row is left in place and never deleted.
- **It rejects** with `SessionExpiredError`, sending no request, while the
  session is expired or on a 401. Otherwise it rejects with a `SheetError`
  whose `kind` is `offline`, `request`, or `missing` (a 404). A `missing`
  sends the app to the "Couldn't open" card, whose Try again finds nothing
  and so starts a new sheet with the New sheet banner. There is no automatic
  retry. The caller decides, and #352 keeps what was typed.
- **Over 50,000 characters** in `notes` is Sheets' cell limit. Sheets refuses
  it and the write rejects with `request`. Whether the journal limits input is
  #352's call.

### Edge cases

- **Two devices, first sign-in at the same moment.** Both find nothing and both
  create a sheet. From then on both use the older one, and anything written to
  the newer one before its device next connects stays there, unread. This is
  accepted: it needs two devices to sign in for the first time within the same
  second or two.
- **Deleted or trashed, then restored from the trash.** Restoring the original
  makes two sheets, and the original is older, so it wins silently. Entries made
  in the stand-in are left in the stand-in. The New sheet banner warned about
  exactly this.
- **Deleted while the app is open.** The next read or write gets a 404
  (`missing`), described above.
- **Renamed, moved to a folder, starred, or shared.** Nothing changes.
- **The first tab is renamed.** Nothing changes: almanac uses the first tab.
  A tab added *in front of* it becomes the first tab, and its header check
  fails loudly with the "has been changed" card rather than quietly writing
  into it.
- **A date that Sheets turned into a real date**, for instance after column A's
  format was changed by hand, is ignored. A write for that date then appends a
  fresh row. Keeping column A plain text is why that doesn't happen by accident.

---

## Demo mode

- **On:** `?demo=true` in the query string, in any build, dev or production. A
  `demo` parameter with any other value is not demo mode. It is read once, at
  load. Links inside the app change only the hash, so demo mode survives
  navigation.
- **What changes:** no Google script, no request to any Google host, and no
  sign-in or connecting card. The frame shows at once, with the Demo banner and
  the demo account menu. `sessionStorage` and `localStorage` are neither read
  nor written, so a real session in the same tab is still there on exit.
- **Exit demo** (the banner or the menu) reloads the page at the same path and
  hash, without the `demo` parameter.
- **Try the demo** (the sign-in card) loads the same path and hash with
  `?demo=true`.
- **Writes** go to an in-memory copy of the demo entries. They are read back
  for the life of the page, and a reload starts from the generated data again.
  That is what the banner means by "Changes aren't saved."

### The generated data

A TypeScript port of the prototype's `build()`, including its sample lists
(`TEMPLATES`, the five boards in `B`, `OPEN`, `POOL`, and `noteFor`'s notes),
its seeded PRNG (`mulberry32(20260921)`) and its hand-placed examples. The only
change is to its dates. Every fixed date in `build()` (`START`, `H_START`, the
`SICK` and `CAMP` spells) becomes an offset from today, keeping its distance
from 2026-09-21, the seed's date. Today is `todayInDenver()`, computed once at
load, so the same day always generates the same data.

| Source | Range, relative to today | Read |
|---|---|---|
| Thrive workouts | Done from 567 days before through yesterday. Planned from today through 6 days ahead, on `build()`'s weekly `PLAN`. Days 7 to 21 ahead exist but have nothing planned. Plus the missed stretch 3 days ago. | `readWorkouts`, and the planned strength ones again through `readWorkoutPlans` |
| COROS health | From 371 days before through today, and nothing before (the "no watch data" days). About 5% of nights are "watch not worn", with sleep, resting HR and HRV `null`. Steps and calories only on past days. | `readHealth` |
| Hive completions | The last 240 days, plus yesterday's reopened item. | `readHiveCompleted` |
| Hive open items | `OPEN`: due from 4 days ago to 13 days ahead, keyed by due date. The prototype's `BUSY` list is a design-options scenario and isn't ported. | `readHiveDue` |
| Entries | About 72% of the 80 days before today, plus yesterday's hand-placed entry and a note 4 days ahead. Nothing today. | `readEntries` |

**Ranges, and the one nullable lower bound.** Each demo read filters the
generated data to the inclusive `from`–`to` range and keys it by Denver date,
with no key for a day that has nothing. `readHiveDue` is the exception, and the
only read whose `from` is `IsoDate | null`: `null` means no lower bound, so
`readHiveDue(null, to)` returns every open item due on or before `to` — in this
data, everything from 4 days before today onward, which is where the open items
start. The demo source honours `null` as a value rather than a missing
argument: it never reads it as today, which would drop exactly the overdue items
the caller asked for, and it never throws. #353's To do panel is why the bound
is nullable — overdue has no floor, and today's card wants everything due on or
before 3 days ahead in one call.

**The plan detail: `readWorkoutPlans`.** Thrive is read twice. `readWorkouts`
returns the workouts; `readWorkoutPlans` returns, for each **planned strength**
workout in the range, a `WorkoutPlan` of its exercise and set counts, keyed by
that workout's date. The demo source reads the two counts straight off the
generated workout — `build()` gives every weight session its template's `ex`
and `sets`, planned or done — so the two reads agree by construction. A planned
workout of another type has no entry, a workout already done has none (it is not
a plan), and a date with no planned strength session gets no key. In this data
that means keys only between today and 6 days ahead: the missed plan 3 days ago
is a stretch.

It is a second read rather than two more fields on `Workout` because live the
counts cost one `getWorkoutSets` call per planned strength workout (#356), and
`readWorkouts` has to stay one call for any range — #351's week strip and #358's
month read it and show no counts. That also sets what the counts are for: they
are enrichment, never a card's status. #356's card renders without them and a
failure to fetch them is silent, so nothing in this interface treats a missing
`WorkoutPlan` as an error. It takes an `IsoDate` at both ends; `readHiveDue`
stays the only read with a nullable lower bound.

Not ported: the Withings parts (`W_START`, `wt`, `bp`), which are #354's, and
everything outside `build()` (the design-options scenarios, `eff()` and the
step goal), which is #357's if it wants them. The generator runs only in demo
mode.

### Shapes

All live in `src/data/types.ts`. Wherever `build()` leaves a value out, the
field is `null`, never `0` and never a middle value. Times of day are
`'HH:MM'`, 24-hour, in Denver.

- **`Workout`**, named after Thrive's `Workouts` fields: `id`, `date`, `time`
  (null when planned), `type` (`weight`, `stretch`, `bike`, `hike`, `run` or
  `walk`), `sub_type` (`mountain`, `gravel`, `indoor`, `outdoor`, or null),
  `name`, `status` (`planned` or `complete`), `effort` (`Easy`, `Medium`,
  `Hard`, or null), and `elapsed_seconds`, `moving_seconds`, `distance_m`,
  `ascent_m`, `avg_hr` and `calories` (numbers or null). For strength only,
  from the prototype's templates and not Thrive columns: `exercise_count`,
  `set_count`, `sets_logged` and `est_minutes`.
- **`WorkoutPlan`**, what `readWorkoutPlans` returns: `workout_id`,
  `exercise_count` and `set_count`, all non-null — a planned session with no
  counts has no `WorkoutPlan` rather than one full of zeroes. `Workout` is
  unchanged by it and keeps its own four strength fields; in the demo the two
  agree because both come from the same generated workout, and live (#356) only
  `WorkoutPlan` is filled.
- **`Health`**, named after `DailyHealth`'s columns in `coros-sync-plan.md`:
  `resting_hr`, `hrv`, `steps`, `calories`, `sleep_total_s`, `sleep_deep_s`,
  `sleep_rem_s`, `sleep_light_s`, `sleep_awake_s`, `vo2max` and
  `training_load`. Prototype-only: `bedtime` and `waketime`.
- **`HiveBoard`**: `id`, `name`, `color`. **`HiveItem`**: `id`, `title`, `board`
  (a `HiveBoard`), `due_date`, `labels`. **`HiveCompletion`**: `item_id`,
  `title`, `board`, `completed_time`, and `reopened_time` (null unless it was
  reopened).
- **`Entry`**: `date`, `notes`, `sleep_hours`, `sleep_quality`, `energy`.

These shapes are demo-first. #353, #356 and #357 own the live mapping into
them, and may add fields as their panels need them.

---

## The mark, the icons and the manifest

- **The mark** is the prototype's SVG: the hexagon
  `12 1.8 21 7 21 17 12 22.2 3 17 3 7` in `--color-accent`, with a white
  sunrise (the arc `M7.6 15.4a4.4 4.4 0 0 1 8.8 0`, the horizon `M6 15.4h12`,
  and the rays `M12 7.4v1.9M8.2 9.2l1.1 1.1M15.8 9.2l-1.1 1.1`) in 1.9-wide
  round-capped strokes, on a 24 viewBox. It is the same in both themes, and
  it is the only place `--color-accent` appears in the page.
- **Favicon:** that SVG, with a transparent background.
- **apple-touch-icon** (180) and the **manifest icons** (192 and 512, with
  `purpose` `any maskable`): PNGs of the mark, filling 80% of the square, on
  `#FFFFFF`, the light theme's `--color-surface`. 80% keeps the hexagon inside
  a maskable icon's safe zone. They are rendered once from the SVG and
  committed.
- **Manifest:** `name` and `short_name` "almanac", `start_url` and `scope`
  `./`, `display` `standalone`, `background_color` `#F0F2F5` (the light theme's
  `--color-bg`), and `theme_color` `#9D5CF0`.
- **`<meta name="theme-color">`** is `#9D5CF0` (`--color-accent`), as the issue
  says. It tints the browser's or the OS's chrome around the page, not the page
  itself, and Thrive does the same with its orange, so the mark is still the
  only thing *in the page* wearing the accent.
- The page also has `<meta name="color-scheme" content="light dark">`, and
  `viewport-fit=cover` for the safe-area insets.

## Theme

`:root` carries the light values and `color-scheme: light`, and
`@media (prefers-color-scheme: dark)` overrides them with the dark values and
`color-scheme: dark`. There is no `data-theme` attribute and no switch: the
design language says both themes follow the system, and the app follows a
change the moment the system makes it. Thrive's `.badge-*` dark variants,
which Thrive keys on `[data-theme="dark"]`, move under the same media query.

---

## Copy

| Where | String |
|---|---|
| Sign-in: tagline | The day ahead. |
| Sign-in: button | Sign in with Google |
| Sign-in: button in flight | Signing in… |
| Sign-in: demo link | Try the demo |
| Sign-in: footnote | almanac keeps your journal in a Google Sheet it creates in your Drive. It can't see your other files. |
| Sign-in: popup blocked | The sign-in window was blocked. Allow pop-ups for this site, then try again. |
| Sign-in: Drive not granted | almanac needs access to the files it creates in your Drive. Sign in again and leave that box ticked. |
| Sign-in: Google didn't load | Couldn't reach Google. Check your connection and try again. |
| Sign-in: failed | Couldn't sign in. Try again. |
| Sign-in: not set up | Sign-in isn't set up in this build — VITE_GOOGLE_CLIENT_ID is empty. The demo still works. |
| Connecting: finding | Finding your almanac sheet… |
| Connecting: creating | Creating your almanac sheet in Google Drive… |
| Sheet error: heading | Couldn't open your almanac sheet |
| Sheet error: offline | You're offline. Connect and try again. |
| Sheet error: other | Google didn't respond as expected. Try again in a moment. |
| Sheet changed: heading | Your almanac sheet has been changed |
| Sheet changed: line | Its first row should read date, notes, sleep_hours, sleep_quality, energy. almanac won't write to it until it does. |
| Error actions | Try again · Open the sheet · Sign out |
| Brand link label | almanac — go to today |
| Tabs | Day · Calendar · Trends |
| Tab nav label | Sections |
| Placeholder | *(tab name)* / Coming soon. |
| Titles | almanac · Calendar · almanac · Trends · almanac |
| Account button label | Account, *(email)* / Account, demo |
| Account menu | *(email)* · Open your sheet · Sign out |
| Account menu, demo | Demo account · Exit demo |
| Banner: session ended | Your Google session has ended. Reconnect to keep loading and saving. |
| Banner: session ended, action | Reconnect / Reconnecting… |
| Banner: reconnect blocked | The sign-in window was blocked. Allow pop-ups for this site, then reconnect. |
| Banner: new sheet | Your almanac sheet wasn't in your Google Drive, so almanac started a new one. If you deleted it by mistake, restore it from Drive's trash and reload. |
| Banner: new sheet, dismiss label | Dismiss |
| Banner: demo | **Demo mode** — sample data. Changes aren't saved. |
| Banner: demo, action | Exit demo |

## Numbers

almanac is a scaffold, so nothing here could be measured. Every number is
**unmeasured until built**, and each comes from a source:

| Number | Source |
|---|---|
| The 960px breakpoint; touch targets ≥ 40px; rows ≥ 44px | design-language.md, § Scale and § Layout |
| Every token value | design-language.md, or [New tokens](#new-tokens) below with its source |
| 567, 371, 240 and 80 days back; planned workouts to 6 days ahead; open items from −4 to +13 days; entries on about 72% of days; ~5% of nights not worn | the prototype's `build()`, as offsets from 2026-09-21 |
| The 60-second expiry margin | Thrive's `saveCachedAuth` |
| The 15-second wait for Google's script | chosen here: long enough for a slow phone connection, short enough that a hang reads as a failure |
| Icons at 180, 192 and 512; the 80% mark in a maskable icon | Apple's touch-icon size and the web-app-manifest maskable safe zone |
| 50,000 characters | Google Sheets' per-cell limit |

`/test` checks the sizes and breakpoints in the running app, in demo mode,
with `getBoundingClientRect()` and `getComputedStyle()`.

## New tokens

The design language has no token for these. Each value comes from the source
named, and `global.css` defines it on `:root` like the rest.

| Token | Light | Dark | For | Source |
|---|---|---|---|---|
| `--color-success-tint` | `#E8F5E9` | `#15291A` | chip backgrounds (the language names the `-tint` companions but gives no values) | prototype |
| `--color-warning-tint` | `#FFF4E0` | `#2D2210` | the Session ended banner | prototype |
| `--color-serious-tint` | `#FDEEE5` | `#2D1A10` | chip backgrounds | prototype |
| `--color-danger-tint` | `#FDECEA` | `#2D1414` | chip backgrounds | prototype |
| `--shadow-sm` | `0 1px 3px rgba(0,0,0,.14)` | the same | the raised current top tab | prototype `.top-tab` |
| `--shadow-lg` | `0 12px 32px rgba(16,24,40,.18)` | `0 12px 32px rgba(0,0,0,.55)` | the sign-in card, the account menu | prototype |
| `--top-bar-bg` | `color-mix(in srgb, var(--color-bg) 88%, transparent)` | the same | top bar background | prototype `.topbar` |
| `--top-bar-blur` | `blur(12px) saturate(1.3)` | the same | top bar `backdrop-filter` | prototype `.topbar` |
| `--focus-ring` | `2px solid var(--color-primary)`, with a 2px offset | the same | every `:focus-visible` | prototype |
| `--font-sans` | `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif` | the same | the system font stack the language calls for | prototype, Thrive |
| `--top-h` | `56px` | | top bar height | prototype |
| `--nav-h` | `64px` | | bottom bar height, before the safe area | prototype |
| `--content-max` | `640px` | | the main column on phones | prototype `.main` |
| `--content-max-wide` | `1120px` | | the main column from 960px | prototype `.main` |
| `--card-narrow` | `400px` | | the sign-in and error card | Thrive `.login-card` |
| `--mark-size` | `28px` | | the mark in the top bar | prototype `.logo` |
| `--mark-size-lg` | `64px` | | the mark on the card | Thrive's login icon |
| `--icon-sm` | `18px` | | top-bar tab icons | prototype `.top-tab .ico` |
| `--icon-md` | `20px` | | the default icon: banners, the account button, error lines | prototype `.ico` |
| `--icon-lg` | `22px` | | bottom-bar tab icons | prototype `.nav-tab .ico` |
| `--icon-btn-size` | `44px` | | an icon-only button's square target | prototype `.icon-btn` |

`--radius-full` is named in the language with no value. It is `9999px`, as in
the prototype and Thrive. There is no `--color-overdue-tint`: the prototype has
none and nothing here needs one. The first issue that does proposes it.

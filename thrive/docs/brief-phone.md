# The brief on the phone (#617)

The Morning Brief and the Weekly Brief are published at 6:45 to the same two
artifact links every run. These MacroDroid macros make the phone sync the
watch when you wake, and open the brief once it is actually up, instead of at a
fixed time that may show yesterday's.

The morning, in order:

1. **First unlock** (usually before 6:30): Macro 1 opens COROS for 20 s, so
   the watch hands over last night's sleep before Thrive's 6:30 sync.
2. **6:45**: the brief runs on the desktop, publishes, and calls Macro 2's
   webhook (the `webhook:` line in the brief's `settings.local.md`).
3. **Macro 2** posts a notification. Tap it to open the brief.
4. **Macro 3**: if you haven't tapped it, the next unlock opens the brief.
   Once a day for each brief.

A brief written without sleep says so in its notification. Reply **refresh**
to the brief's scheduled task in Claude; the refreshed brief signals the phone
again.

## Before you start

- **The links.** Open the claude.ai artifacts titled `Morning Brief` and
  `Weekly Brief` and copy each link. They stay the same every run. In
  MacroDroid, make two global string variables, `brief_daily_url` and
  `brief_weekly_url`, holding them.
- **Today's date.** The macros compare global string variables against
  today's date in magic text, `[year]-[month_digit]-[dayofmonth]`. Make these,
  all empty to start: `coros_last`, `brief_daily_ready`, `brief_daily_opened`,
  `brief_daily_status`, `brief_weekly_ready`, `brief_weekly_opened`.
- **The webhook.** Building Macro 2's trigger gives you its URL,
  `https://trigger.macrodroid.com/<device-id>/brief`. Put it in
  `thrive/.claude/skills/brief/settings.local.md` as the `webhook:` line
  (`settings.example.md` shows the shape). It is a secret: never paste it into
  the repo, an issue or a chat.

## Macro 1: sync the watch

Replaces the old fixed 6:15 open.

- **Trigger:** Screen Unlocked. Add Power Disconnected as a second trigger if
  the phone charges overnight, so lifting it off the charger starts it too.
- **Constraints:** Time of Day 5:00 to 10:00; `coros_last` is not
  `[year]-[month_digit]-[dayofmonth]`.
- **Actions:**
  1. Set Variable `coros_last` to `[year]-[month_digit]-[dayofmonth]`
  2. Launch Application: COROS
  3. Wait Before Next Action: 20 seconds
  4. Launch Home Screen

Setting `coros_last` first means a second unlock in those 20 s doesn't start
it again. MacroDroid can't close another app without root, and doesn't need
to: going home leaves COROS in the background, finished.

## Macro 2: the brief is up

- **Trigger:** Webhook (URL), identifier `brief`. The brief adds `kind`
  (`daily` or `weekly`) and `status` (`complete` or `no-sleep`) to the URL.
  Make local variables named `kind` and `status` in this macro: MacroDroid
  fills them from the URL's parameters of the same name.
- **Actions:**
  1. If `kind` = `weekly`:
     - Set Variable `brief_weekly_ready` to `[year]-[month_digit]-[dayofmonth]`
     - Display Notification: title **Weekly brief ready**, text *The week
       ahead and the week behind.* On press, run Macro 3b.
  2. Else:
     - Set Variable `brief_daily_ready` to `[year]-[month_digit]-[dayofmonth]`
     - Set Variable `brief_daily_status` to `status`
     - If `status` = `no-sleep`: Display Notification, title **Morning brief
       ready, without sleep**, text *Last night hadn't synced. Reply refresh
       to the brief in Claude.*
     - Else: Display Notification, title **Morning brief ready**, text *Tap
       to open today's brief.*
     - Either way, on press, run Macro 3a.

A refresh that brings sleep in sends `complete`, which replaces the
"without sleep" notification with the plain one.

## Macro 3: open it

Two macros of the same shape, one per brief.

**3a, Morning Brief**

- **Triggers:** Screen Unlocked, and being run by Macro 2's notification.
- **Constraints:** `brief_daily_ready` is `[year]-[month_digit]-[dayofmonth]`;
  `brief_daily_opened` is not.
- **Actions:**
  1. Set Variable `brief_daily_opened` to `[year]-[month_digit]-[dayofmonth]`
  2. Open Website: `[v=brief_daily_url]`
  3. Clear the Morning brief notification

**3b, Weekly Brief:** the same with `brief_weekly_ready`,
`brief_weekly_opened` and `[v=brief_weekly_url]`. On a Sunday both briefs run
at 6:45; give 3b a Wait Before Next Action of 3 seconds first, so the Morning
Brief opens first and the Weekly Brief in front of it.

The `ready` constraint is what keeps a stale brief from opening: before 6:45,
or on a morning the desktop was off and nothing was published, `ready` isn't
today, so an unlock does nothing.

## When it doesn't work

- **No notification by 7:00.** The desktop was asleep or off, or the run
  failed. The brief's chat reply says *"Couldn't signal the phone."* when the
  page went up but the call didn't reach MacroDroid; open the link yourself.
- **"Phone not signalled (no webhook set)"** at the foot of the brief: the
  `webhook:` line is missing from `settings.local.md`.
- **The brief opens on an unlock, but the notification never came:**
  notifications for MacroDroid are turned off in Android settings.

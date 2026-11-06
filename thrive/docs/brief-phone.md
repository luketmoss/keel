# The brief on the phone (#617)

The Nightly Brief (daily at 9:15 PM) and the Weekly Brief (Sundays at 4:00
PM) are published to the same two artifact links every run. These MacroDroid
macros make the phone sync the watch in the evening, open the brief once it is
actually up, instead of at a fixed time that may show yesterday's, and tell
you when a brief didn't come.

The nightly took over the macros the Morning Brief used (#833) instead of
adding a second set, so Macro 3a and the `brief_daily_*` variables keep their
old names. The 6:45 AM `daily-brief` task was deleted on 2026-11-06.

The evening, in order:

1. **First unlock, 7:30 to 8:55 PM**: Macro 1 opens COROS for 20 s, so the
   watch hands over the day before Thrive's 9:00 PM sync (#828).
2. **9:15 PM**: the nightly runs on the desktop, publishes, and calls Macro 2's
   webhook (the `webhook:` line in the brief's `settings.local.md`) with
   `kind=nightly`.
3. **Macro 2** posts a notification. Tap it to open the brief.
4. **Macro 3**: if you haven't tapped it, the next unlock opens the brief.
   Once a day for each brief.
5. **9:35 PM, Macro 4**: if no brief came and no failure was reported, it posts
   *No nightly brief by 9:35*.

**Sundays (#832)** add an afternoon: the first unlock from 1:00 to 3:40 PM opens
COROS (Macro 1b), Thrive syncs at 3:45 PM (#828), the weekly runs at 4:00 PM and
files the week's review in the wiki, and the watchdog fires at 4:20 PM
(Macro 4b). Open the Weekly brief whenever planning starts that evening, then
run `/plan-week`.

A brief written without sleep says so in its notification. Reply **refresh**
to the brief's scheduled task in Claude; the refreshed brief signals the phone
again. A brief written without Hive or the calendar says *Not read: Hive* (or
calendar) under its notification: reconnect it in Claude if you want it. The
nightly's note also carries the yesterday-food line, so it shows without
opening the page.

When a scheduled brief can't publish at all (Thrive disconnected, the page
failed to publish, the run stopped early), it calls the same webhook with
`status=failed` and a `note` saying why, and Macro 2 posts *Nightly brief
failed* with that note. Fix the cause, then press **Run now** on the task in
Claude. A run that never starts (the desktop asleep or off) or hangs (a
permission prompt) can't call anything: that is what Macro 4 is for.

## Moving from the Morning Brief (#833)

Edit the existing macros. Nothing new is built and no variable is added:

- **Macro 1, Sync watch:** Time of Day 7:30 PM to 8:55 PM. Remove Power
  Disconnected if it's there.
- **Macro 2, Brief ready:** reword the three morning notifications as below.
  A nightly call already takes the path they sit on, since it isn't `weekly`.
- **`brief_daily_url`:** set it to the `Nightly Brief` link. The page exists
  after the nightly's first run: press **Run now** on the task once.
- **Macro 3a:** no change. Rename it **Open nightly brief** if you like.
- **Macro 4a:** trigger 9:35 PM, and the title and text below.

The `daily-brief` task is deleted, so these edits are not undone by enabling it.
The morning mode is in this skill's git history from before #833.

## Moving the weekly to Sunday 4 PM (#832)

Edit the existing macros, and make one variable and one macro:

- **Variables:** add `coros_last_sun`, empty.
- **Macro 1b:** clone Sync watch as below.
- **Macro 3b:** nothing to change but its name, if you like.
- **Macro 4b:** trigger Sunday 4:20 PM, and the title below.
- **The `weekly-brief` task** in Claude: Sundays at 4:00 PM, starting from the wiki's `/weekly-brief`
  command (it syncs the checkouts, then follows the brief skill with `weekly scheduled`).

To go back, set the task to 6:45 PM and undo these edits.

## Before you start

- **The links.** Open the claude.ai artifacts titled `Nightly Brief` and
  `Weekly Brief` and copy each link. They stay the same every run. In
  MacroDroid, make two global string variables, `brief_daily_url` and
  `brief_weekly_url`, holding them, in that order.
- **Today's date.** The macros compare global string variables against
  today's date in magic text, `[year]-[month_digit]-[dayofmonth]`. Make these,
  all empty to start: `coros_last`, `brief_daily_ready`, `brief_daily_opened`,
  `brief_daily_failed`, `brief_weekly_ready`, `brief_weekly_opened`,
  `brief_weekly_failed` and `coros_last_sun`. Use the `...` button beside a value to insert magic
  text rather than typing it.
- **The webhook.** Building Macro 2's trigger gives you its URL,
  `https://trigger.macrodroid.com/<device-id>/brief`. Put it in the briefs'
  folder's `settings.local.md` (#835) as the `webhook:` line
  (`settings.example.md` shows the shape). It is a secret: never paste it into
  the repo, an issue or a chat.

## Macro 1: sync the watch

Named **Sync watch**.

- **Trigger:** Device Unlocked (under Device Events; MacroDroid has no
  "Screen Unlocked", and Screen On fires while still locked).
- **Constraints:** Time of Day 7:30 PM to 8:55 PM; `coros_last` is not
  `[year]-[month_digit]-[dayofmonth]`.
- **Actions:**
  1. Set Variable `coros_last` to `[year]-[month_digit]-[dayofmonth]`
  2. Launch Application: COROS
  3. Wait Before Next Action: 20 seconds
  4. Launch Home Screen

Setting `coros_last` first means a second unlock in those 20 s doesn't start
it again. MacroDroid can't close another app without root, and doesn't need
to: going home leaves COROS in the background, finished.

**Macro 1b, Sync watch, Sunday afternoon (#832).** Clone Macro 1 and change
only these, so it doesn't spend the evening window's once-a-day variable:

- **Constraints:** Day of Week Sunday; Time of Day 1:00 PM to 3:40 PM;
  `coros_last_sun` is not `[year]-[month_digit]-[dayofmonth]`.
- **Actions:** the same four, with step 1 setting `coros_last_sun` instead of
  `coros_last`.

The evening window is unchanged. Thrive's 3:45 PM Sunday sync
(#828) then picks up what COROS already has, before the 4:00 PM weekly.

Thrive's 6:30 AM sync (#828) still runs, but with no COROS open before it, it
picks up only what COROS already has, so last night's sleep may reach the Day screen
only after the evening open.

## Macro 2: the brief is up

Named **Brief ready**.

- **Trigger:** Webhook (URL), identifier `brief`. The brief adds `kind`
  (`nightly` or `weekly`), `status` (`complete`, `no-sleep` or `failed`) and,
  sometimes, `note` to the URL. Make local string variables named `kind`,
  `status` and `note` in this macro: MacroDroid fills them from the URL's
  parameters of the same name. `note` is *Not read: Hive* (or calendar) on a
  partial brief, and the reason on a failed one. A local variable **keeps its
  last value between runs**, and a call without `note` leaves it alone, so
  the macro empties `note` itself before it ends: otherwise one call's note
  shows up on every later notification.
- **Actions**, as MacroDroid lists them, 23 in all (`today` is
  `[year]-[month_digit]-[dayofmonth]`, and `{lv=note}` is the `note` local
  variable inserted with the `...` button):

```
If status = failed
    If kind = weekly
        Set brief_weekly_failed = today
        Notification: Weekly brief failed / {lv=note}
    Else
        Set brief_daily_failed = today
        Notification: Nightly brief failed / {lv=note}
    End If
    Set note = (empty)
    Cancel Macro Actions (This Macro)
End If
If kind = weekly
    Set brief_weekly_ready = today
    Notification: Weekly brief ready / The week ahead and the week behind. {lv=note}
Else
    Set brief_daily_ready = today
    If status = no-sleep
        Notification: Nightly brief ready, without last night's sleep / Last night hadn't synced. Reply refresh to the brief in Claude. {lv=note}
    Else
        Notification: Nightly brief ready / Tonight's bed-by and the days ahead. {lv=note}
    End If
End If
Set note = (empty)
```

Each Notification line is *title / text*. The `If status = failed` block's
**Cancel Macro Actions** (under MacroDroid Specific) ends the macro so a
failure never reaches the "ready" actions below it. `Set note = (empty)` is
Set Variable on the local `note`, with the text left blank. If `note` already
holds an old value, empty it once in the macro's Local Variables panel.

A failed brief sets `…_failed`, never `…_ready`, so an unlock doesn't open
yesterday's page, and Macro 4 stays quiet because the failure was already
reported.

**What a tap does.** Each Display Notification has a setting for what happens
when it is pressed: set it to run **3a** on both nightly "ready" ones and
**Open weekly brief** on the weekly one (Macro 3). Leave the two "failed" ones
with no tap action, or set them to open the Claude app.

A refresh that brings sleep in sends `complete`, which posts the plain
"Nightly brief ready".

## Macro 3: open it

Two macros of the same shape, one per brief.

**3a, Open brief** (it opens the nightly; the macro keeps its old name)

- **Trigger:** Device Unlocked. A tap on Macro 2's notification runs it too.
- **Constraints:** two Variable Value (string) constraints:
  `brief_daily_ready` equals `[year]-[month_digit]-[dayofmonth]`;
  `brief_daily_opened` does not.
- **Actions:**
  1. Set Variable `brief_daily_opened` to `[year]-[month_digit]-[dayofmonth]`
  2. Open Website: `[v=brief_daily_url]`

**3b, Open weekly brief:** clone 3a and change it to `brief_weekly_ready`,
`brief_weekly_opened` and `[v=brief_weekly_url]`. The weekly brief runs on
Sunday at 4:00 PM, so 3b opens it on the first unlock after about 4:05 PM.

The `ready` constraint is what keeps a stale brief from opening: before 9:15
PM, or on a night the desktop was off and nothing was published, `ready` isn't
today, so an unlock does nothing.

## Macro 4: no brief came

The watchdog for a run that never called at all: the desktop asleep or off,
the app closed, or a run stuck on a permission prompt. Two macros of the same
shape.

**4a, Nightly brief watchdog**

- **Trigger:** Day/Time, 9:35 PM, every day. The nightly starts at 9:15 and
  takes about 3 minutes, so 9:35 leaves room for a slow run.
- **Constraints:** two Variable Value (string) constraints:
  `brief_daily_ready` does not equal `[year]-[month_digit]-[dayofmonth]`;
  `brief_daily_failed` does not equal it either.
- **Actions:**
  1. Display Notification: title **No nightly brief by 9:35**, text *The
     desktop may be asleep, or the run is waiting on a prompt. Open the
     Nightly brief task in Claude.*

**4b, Weekly brief watchdog:** clone 4a, set its trigger to Sunday only at
4:20 PM (the weekly task starts up to 7 minutes after 4:00), and change it to
`brief_weekly_ready`, `brief_weekly_failed`, title **No weekly brief by
4:20** and *the Weekly brief task*.

A failure the brief reported (Macro 2) sets `…_failed`, so you get one
notification for it, not two.

## Testing from the desktop

This reads the webhook from the briefs' folder (#835), which it asks for, and
makes the brief's three calls without printing the URL. Each prints `200`; the
first posts *Nightly brief ready*, the second *Nightly brief ready, without
last night's sleep*, the third *Nightly brief failed* with its note. Change
`kind=nightly` to `kind=weekly` for the weekly's.

```powershell
$folder = Read-Host 'Briefs folder (the one holding settings.local.md)'
$line = Select-String -Path "$folder\settings.local.md" -Pattern 'webhook\*\*: `(.+)`'
$hook = $line.Matches[0].Groups[1].Value
curl.exe -s -o NUL -w "%{http_code}" --max-time 10 "$hook`?kind=nightly&status=complete"
curl.exe -s -o NUL -w "%{http_code}" --max-time 10 "$hook`?kind=nightly&status=no-sleep"
curl.exe -s -o NUL -w "%{http_code}" --max-time 10 "$hook`?kind=nightly&status=failed&note=Thrive%20not%20connected."
```

A test call sets the day's `…_ready` or `…_failed` like a real one: empty it
again in Variables afterwards, or that day's real brief won't open on unlock
and Macro 4 won't fire.

To test the opening macros again the same day, empty `brief_daily_opened` or
`brief_weekly_opened` in Variables first. For Sync watch, empty `coros_last`
and widen its Time of Day if it is outside 7:30 to 8:55 PM, then set it back. The same goes for
`coros_last_sun` and Macro 1b's 1:00 to 3:40 PM window.

## When it doesn't work

- **"Nightly brief failed".** Its text says why. *Thrive not connected*:
  reconnect the Thrive connector in Claude. *The page didn't publish* or *The
  run stopped early*: open the task's latest run in Claude to see what
  happened. Then press **Run now** on the task.
- **"No nightly brief by 9:35".** The desktop was asleep or off, the run is
  waiting on a permission prompt (below), or it failed without reaching the
  phone. The brief's chat reply says *"Couldn't signal the phone."* when the
  page went up but the call didn't reach MacroDroid; open the link yourself.
- **The scheduled brief is waiting on a permission prompt.** It sends the
  call with `curl.exe` through the shell, and a scheduled task may ask once
  to allow that command. Open the brief's task in Claude and allow it,
  choosing the option that keeps allowing it if one is offered, so later
  runs don't stop on it.
- **"Phone not signalled (no webhook set)"** at the foot of the brief: the
  `webhook:` line is missing from `settings.local.md`.
- **The brief opens on an unlock, but the notification never came:**
  notifications for MacroDroid are turned off in Android settings.

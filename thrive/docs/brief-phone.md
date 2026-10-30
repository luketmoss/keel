# The brief on the phone (#617)

The Morning Brief (daily at 6:45 AM) and the Weekly Brief (Sundays at 6:45
PM) are published to the same two artifact links every run. These MacroDroid
macros make the phone sync the watch when you wake, open the brief once it is
actually up, instead of at a fixed time that may show yesterday's, and tell
you when a brief didn't come.

The morning, in order:

1. **First unlock** (usually before 6:30): Macro 1 opens COROS for 20 s, so
   the watch hands over last night's sleep before Thrive's 6:30 sync.
2. **6:45**: the brief runs on the desktop, publishes, and calls Macro 2's
   webhook (the `webhook:` line in the brief's `settings.local.md`).
3. **Macro 2** posts a notification. Tap it to open the brief.
4. **Macro 3**: if you haven't tapped it, the next unlock opens the brief.
   Once a day for each brief.
5. **7:00, Macro 4**: if no brief came and no failure was reported, it posts
   *No morning brief by 7:00*.

A brief written without sleep says so in its notification. Reply **refresh**
to the brief's scheduled task in Claude; the refreshed brief signals the phone
again. A brief written without Hive or the calendar says *Not read: Hive* (or
calendar) under its notification: reconnect it in Claude if you want it.

When a scheduled brief can't publish at all (Thrive disconnected, the page
failed to publish, the run stopped early), it calls the same webhook with
`status=failed` and a `note` saying why, and Macro 2 posts *Morning brief
failed* with that note. Fix the cause, then press **Run now** on the task in
Claude. A run that never starts (the desktop asleep or off) or hangs (a
permission prompt) can't call anything: that is what Macro 4 is for.

## Before you start

- **The links.** Open the claude.ai artifacts titled `Morning Brief` and
  `Weekly Brief` and copy each link. They stay the same every run. In
  MacroDroid, make two global string variables, `brief_daily_url` and
  `brief_weekly_url`, holding them.
- **Today's date.** The macros compare global string variables against
  today's date in magic text, `[year]-[month_digit]-[dayofmonth]`. Make these,
  all empty to start: `coros_last`, `brief_daily_ready`, `brief_daily_opened`,
  `brief_daily_failed`, `brief_weekly_ready`, `brief_weekly_opened`,
  `brief_weekly_failed`. Use the `...` button beside a
  value to insert magic text rather than typing it.
- **The webhook.** Building Macro 2's trigger gives you its URL,
  `https://trigger.macrodroid.com/<device-id>/brief`. Put it in
  `thrive/.claude/skills/brief/settings.local.md` as the `webhook:` line
  (`settings.example.md` shows the shape). It is a secret: never paste it into
  the repo, an issue or a chat.

## Macro 1: sync the watch

Named **Sync watch**. Replaces the old fixed 6:15 open: disable that one
rather than deleting it.

- **Trigger:** Device Unlocked (under Device Events; MacroDroid has no
  "Screen Unlocked", and Screen On fires while still locked). Add Power
  Disconnected as a second trigger if
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

Named **Brief ready**.

- **Trigger:** Webhook (URL), identifier `brief`. The brief adds `kind`
  (`daily` or `weekly`), `status` (`complete`, `no-sleep` or `failed`) and,
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
        Notification: Morning brief failed / {lv=note}
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
        Notification: Morning brief ready, without sleep / Last night hadn't synced. Reply refresh to the brief in Claude. {lv=note}
    Else
        Notification: Morning brief ready / Tap to open today's brief. {lv=note}
    End If
End If
Set note = (empty)
```

Each Notification line is *title / text*. Edit the existing macro rather than
rebuilding it: the new parts are the `If status = failed` block on top, which
**Cancel Macro Actions** (under MacroDroid Specific) ends so a failure never
reaches the "ready" actions below it, `{lv=note}` at the end of each
text, and the two `Set note = (empty)` actions (Set Variable on the local
`note`, with the text left blank), one before the cancel and one last.
MacroDroid adds an action at the bottom; long-press its handle to drag it up.
If `note` already holds an old value, empty it once in the macro's Local
Variables panel.

A failed brief sets `…_failed`, never `…_ready`, so an unlock doesn't open
yesterday's page, and Macro 4 stays quiet because the failure was already
reported.

**What a tap does.** Each Display Notification has a setting for what happens
when it is pressed: set it to run **Open morning brief** on both morning
"ready" ones and **Open weekly brief** on the weekly one (Macro 3). Leave the
two "failed" ones with no tap action, or set them to open the Claude app.

A refresh that brings sleep in sends `complete`, which posts the plain
"Morning brief ready".

## Macro 3: open it

Two macros of the same shape, one per brief.

**3a, Open morning brief**

- **Trigger:** Device Unlocked. A tap on Macro 2's notification runs it too.
- **Constraints:** two Variable Value (string) constraints:
  `brief_daily_ready` equals `[year]-[month_digit]-[dayofmonth]`;
  `brief_daily_opened` does not.
- **Actions:**
  1. Set Variable `brief_daily_opened` to `[year]-[month_digit]-[dayofmonth]`
  2. Open Website: `[v=brief_daily_url]`

**3b, Open weekly brief:** clone 3a and change it to `brief_weekly_ready`,
`brief_weekly_opened` and `[v=brief_weekly_url]`. The weekly brief runs on
Sunday evening, so 3b opens it on the first unlock after about 6:50 PM.

The `ready` constraint is what keeps a stale brief from opening: before 6:45,
or on a morning the desktop was off and nothing was published, `ready` isn't
today, so an unlock does nothing.

## Macro 4: no brief came

The watchdog for a run that never called at all: the desktop asleep or off,
the app closed, or a run stuck on a permission prompt. Two macros of the same
shape.

**4a, Morning brief watchdog**

- **Trigger:** Day/Time, 7:00 AM, every day. The brief starts at 6:45 and
  takes about 3 minutes, so 7:00 leaves room for a slow run.
- **Constraints:** two Variable Value (string) constraints:
  `brief_daily_ready` does not equal `[year]-[month_digit]-[dayofmonth]`;
  `brief_daily_failed` does not equal it either.
- **Actions:**
  1. Display Notification: title **No morning brief by 7:00**, text *The
     desktop may be asleep, or the run is waiting on a prompt. Open the Daily
     brief task in Claude.*

**4b, Weekly brief watchdog:** clone 4a, set its trigger to Sunday only at
7:15 PM (the weekly task starts up to 7 minutes after 6:45), and change it to
`brief_weekly_ready`, `brief_weekly_failed`, title **No weekly brief by
7:15** and *the Weekly brief task*.

A failure the brief reported (Macro 2) sets `…_failed`, so you get one
notification for it, not two.

## Testing from the desktop

This reads the webhook from `settings.local.md` and makes the brief's call,
without printing the URL. It should print `200` and post the notification;
change the end to `kind=daily&status=no-sleep`, `kind=weekly&status=complete`,
`kind=daily&status=complete&note=Not%20read%3A%20Hive` or
`kind=daily&status=failed&note=Thrive%20not%20connected.` for the others.
A test call sets the day's `…_ready` or `…_failed` like a real one: empty it
again in Variables afterwards, or that day's real brief won't open on unlock
and Macro 4 won't fire.

```powershell
$line = Select-String -Path 'D:\Projects\code\keel\thrive\.claude\skills\brief\settings.local.md' -Pattern 'webhook\*\*: `(.+)`'
$hook = $line.Matches[0].Groups[1].Value
curl.exe -s -o NUL -w "%{http_code}" --max-time 10 "$hook`?kind=daily&status=complete"
```

To test the opening macros again the same day, empty `brief_daily_opened` or
`brief_weekly_opened` in Variables first. For Sync watch, empty `coros_last`
and widen its Time of Day if it is past 10:00, then set it back.

## When it doesn't work

- **"Morning brief failed".** Its text says why. *Thrive not connected*:
  reconnect the Thrive connector in Claude. *The page didn't publish* or *The
  run stopped early*: open the task's latest run in Claude to see what
  happened. Then press **Run now** on the task.
- **"No morning brief by 7:00".** The desktop was asleep or off, the run is
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

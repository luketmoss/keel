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
  `brief_weekly_ready`, `brief_weekly_opened`. Use the `...` button beside a
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
  (`daily` or `weekly`) and `status` (`complete` or `no-sleep`) to the URL.
  Make local variables named `kind` and `status` in this macro: MacroDroid
  fills them from the URL's parameters of the same name.
- **Actions:**
  1. If `kind` = `weekly`:
     - Set Variable `brief_weekly_ready` to `[year]-[month_digit]-[dayofmonth]`
     - Display Notification: title **Weekly brief ready**, text *The week
       ahead and the week behind.*
  2. Else:
     - Set Variable `brief_daily_ready` to `[year]-[month_digit]-[dayofmonth]`
     - If `status` = `no-sleep`: Display Notification, title **Morning brief
       ready, without sleep**, text *Last night hadn't synced. Reply refresh
       to the brief in Claude.*
     - Else: Display Notification, title **Morning brief ready**, text *Tap
       to open today's brief.*
     - End If
  3. End If

The second If sits inside the first one's Else, so `status` is only read for
the morning brief. As MacroDroid lists it, eleven actions:

```
If kind = weekly
    Set brief_weekly_ready = today
    Notification: Weekly brief ready
Else
    Set brief_daily_ready = today
    If status = no-sleep
        Notification: Morning brief ready, without sleep
    Else
        Notification: Morning brief ready
    End If
End If
```

**What a tap does.** Each Display Notification has a setting for what happens
when it is pressed: set it to run **Open morning brief** on both morning ones
and **Open weekly brief** on the weekly one (Macro 3).

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
`brief_weekly_opened` and `[v=brief_weekly_url]`. On a Sunday both briefs run
at 6:45, so give 3b a Wait Before Next Action of 3 seconds as its first
action: the Morning Brief opens first and the Weekly Brief in front of it.

The `ready` constraint is what keeps a stale brief from opening: before 6:45,
or on a morning the desktop was off and nothing was published, `ready` isn't
today, so an unlock does nothing.

## Testing from the desktop

This reads the webhook from `settings.local.md` and makes the brief's call,
without printing the URL. It should print `200` and post the notification;
change the end to `kind=daily&status=no-sleep` or `kind=weekly&status=complete`
for the other two.

```powershell
$line = Select-String -Path 'D:\Projects\code\keel\thrive\.claude\skills\brief\settings.local.md' -Pattern 'webhook\*\*: `(.+)`'
$hook = $line.Matches[0].Groups[1].Value
curl.exe -s -o NUL -w "%{http_code}" --max-time 10 "$hook`?kind=daily&status=complete"
```

To test the opening macros again the same day, empty `brief_daily_opened` or
`brief_weekly_opened` in Variables first. For Sync watch, empty `coros_last`
and widen its Time of Day if it is past 10:00, then set it back.

## When it doesn't work

- **No notification by 7:00.** The desktop was asleep or off, or the run
  failed. The brief's chat reply says *"Couldn't signal the phone."* when the
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

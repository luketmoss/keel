# 770 — Thrive Spin: ramp test and setting FTP

Part of #764. The last child: measuring FTP, which every target in Spin depends on. A built-in ramp test (not a
library workout), its ride screen, the result screen where the number is adjusted and confirmed, and the write of
that number to Thrive's `FtpHistory`. Prototype artboards "7 · Ramp test" and "8 · Test result"
(https://claude.ai/artifact/EXun1UbyRcgj1PfnhS7kq2); where they differ from this note, this note wins (§Not carried
from the prototype).

It builds on every sibling: #765's `FtpHistory`, `addFtp`, `getFtp` and the `saveRide` rule that `ftp_w` is required;
#766's `SpinApi`, Settings and `SpinColors`; #767's Library (which gains a card, §Starting the test); #768's engine
hooks (`RideSession`, `WattsStairs`, `CadenceBelow`, `skipStep()`, `RideState`; [768-spin-ride.md](768-spin-ride.md)
§Session model); and #769's summary and upload queue, whose FTP hook this note fills
([769-spin-save.md](769-spin-save.md) §FTP and the ramp test). #772 shows the result in Trends.

Standing documents: `ui/docs/design/keel-wide-rules.md` (offline: a write that cannot reach its backend is queued with
the count visible and never accepted and then lost; destructive actions confirm in words and name the thing; blank is
not zero; never colour alone) and `ui/docs/design/suite-language.md`. There is none in `thrive/docs/design/`. Tokens
are the suite's, Thrive's and Spin's, mirrored by #766's rule. **New tokens: none.** The ramp screen is always dark
like the ride screen (#768); the intro, result and sheet follow the system theme like #769's summary.

**No numbers were measured on a running app** (there is no Spin app yet). Every number below is arithmetic, pinned by
JVM tests on the worked examples.

## The parts

| Part | Where | Tested |
|---|---|---|
| **Protocol**: the `RideSession` for the test, the warm-up, the ramp and cool-down numbers | `core/ramp/RampTest` | JVM |
| **Result maths**: best minute, FTP, last step, max HR, why it ended, the "too short" rule, the Denver date | `core/ramp/RampResult` | JVM, against recordings built in the test |
| **FTP write**: one small record, its states, the payload, the current-FTP rule | `core/ftp/` | JVM, fake transport and temp directory |
| **Worker**: `FtpWorker` (WorkManager) | `ftp/` | waived on the phone |
| **Screens**: intro, ramp screen, result, Library card and banner, the FTP sheet | `ramp/`, `ftp/` | state models JVM, drawing waived |

End detection itself is #768's (`EndCondition.CadenceBelow`); this issue adds a JVM test that the session built here
ends on cadence and on a tap, against #768's fake trainer and fake clock.

## The protocol

Constants live in `RampTest`, one place, so a later protocol is a new object rather than an edit.

| | |
|---|---|
| **Warm-up** | 5:00 at 100 W, ERG. Skippable. |
| **Ramp** | open-ended; 100 W for the first minute, then +20 W every minute (100, 120, 140, …), ERG, until it ends. |
| **Ends** | on a tap ("I'm done"), or when cadence has been under 60 rpm for 5 s. |
| **Cool-down** | 10:00 at 100 W, ERG, right after the ramp. |
| **FTP** | 75% of the best 1-minute power of the ramp (§Result maths). |

```kotlin
RideSession(rideId = <UUID>, kind = RampTest, name = "Ramp test", workoutId = null, ftpW = null,
    mode = Erg, intensityPct = 100, intensityAdjustable = false, steps = listOf(
  RideStep("Warm-up",   null, durS = 300,  Watts(100, 100),           cadenceRpm = null, endWhen = null),
  RideStep("Ramp",      null, durS = null, WattsStairs(100, 20, 60),  cadenceRpm = null, endWhen = CadenceBelow(60, 5)),
  RideStep("Cool-down", null, durS = 600,  Watts(100, 100),           cadenceRpm = null, endWhen = null)))
```

This is valid under #768's rules (an open-ended `WattsStairs`, an absolute `Watts`, no `PctOfFtp`, so `ftpW` is null).
The ride's name is "Ramp test", so `ride_workout_id` is `''` in the payload.

- **The ramp is always ERG**, whatever the trainer's other modes: a power staircase has no meaning as a resistance
  level or a grade. The intro refuses to start when #766's saved trainer features are known and lack power target
  setting (§Intro).
- **Start watts are fixed at 100 W, not adapted to the current FTP** (the owner's decision, kept). Adapting would
  make a test's number depend on the number it is meant to replace, and 100 W is easy for any rider who owns a
  trainer: even at an FTP of 300 W the ramp reaches it in about 9 minutes, and the warm-up is where the legs start.
- **The warm-up is a decision of this note** (the owner gave none). Two reasons, one physical and one mechanical.
  Riders are not warm at minute one of a max effort, and a ride that starts on the first pedal stroke (#768) begins
  at 0 rpm: a ramp with `CadenceBelow(60, 5)` as its first step would end itself in its first five seconds. With the
  warm-up the rider is already pedalling at the ramp's start. "Start the ramp" skips it.
- **Null cadence is not under 60.** A sample with no cadence reading (the trainer was lost, or it reports none) does
  not count toward the 5 s. A trainer that reports no cadence therefore ends the test by the tap only, and a
  dropout never ends it. A reading of 0 rpm (not pedalling) is under 60. The engine's rule is "every sample of the
  last `forS` s under `rpm`"; the JVM test pins these two readings of it, and pins that a step with fewer than 5
  samples cannot fire.
- **The tap is `skipStep()`**, the same call as "Start the ramp"; the engine's rule that a second skip within 1 s is
  ignored means a double tap on the shared button position cannot also end the ramp. The ramp screen adds its own
  guard on top: "I'm done" is disabled for the first 5 s of the ramp (the tap that started it cannot end it).
- **No pause and no intensity.** The ramp screen does not call `pause()`, `resume()` or `setIntensity()`: a pause
  inside a staircase and a rolling minute is meaningless, and `intensityAdjustable` is false.

## Starting the test

#767's Library gains one card and #767's detail screen is unchanged: its line "No FTP yet. Ride the ramp test to set
one." points at the card.

### The Library card

Between the planned-today card and the "All workouts" heading, shown whenever the library has a cache and Spin is set
up (never during "Loading" or "Not set up"); like the planned card it ignores search and chips. A card `--radius-lg`,
`--color-surface`, 1dp `--color-border-light`, `--space-md` inside, a chevron at the right:

- eyebrow "FTP TEST" (`--text-xs` bold, `--color-primary-text`), title "Ramp test" (`--text-base` bold);
- line (`--text-sm`, `--color-text-secondary`): "FTP 262 W · set 7 Nov by a ramp test" or "… set 12 Oct by hand";
  with `current` null: "No FTP yet. Ride the ramp test to set one." The FTP shown is `CurrentFtp` (§The current
  FTP), so a change waiting to send shows at once. Dates are "MMM d", with the year when not this year.
- Tapping opens the intro. Content description: "Ramp test. <the line>".

### Intro

A full screen, system theme, with a back arrow ("Back"), no bottom bar. Ground `--color-bg`, `--space-md` side margins,
`--space-lg` between blocks.

- Title "Ramp test" (`--text-2xl` bold). Body (`--text-base`, `--color-text`):
  "A ramp test measures your FTP. You ride 5 minutes easy, then the power rises 20 W every minute, starting at
  100 W, until you can't keep it up." and three lines under "How it works" (`--text-lg` bold, bullets at
  `--text-base`): "The test ends when you tap "I'm done", or when your cadence stays under 60 rpm for 5 seconds.",
  "Your FTP is 75% of your best minute.", "A 10-minute cool-down follows. You can stop it early."
- One line (`--text-sm`, `--color-text-secondary`): "Your FTP is 250 W, set 12 Oct." or "You have no FTP yet." Below,
  "Nothing is saved to your FTP until you confirm it on the result screen." (`--text-xs`, secondary).
- Footer, pinned: a filled button, full width, `--spin-cta-height`, `--radius-lg`, `--color-primary-fill`, play icon
  and "Start test".
- **Start** runs #768's starting rules unchanged, through the same internal start path as `RideStarter` but with the
  session above: no trainer saved → snackbar "Add your trainer in Devices first."; a ride already active → that
  ride's screen with "A ride is already going. End it first."; otherwise the notification permission is asked for
  the first time and the service starts. The ramp screen opens.
- **A trainer whose saved features lack power target setting**: Start is disabled (`--opacity-disabled`) and above it
  "Your trainer can't hold a power target, so it can't run the ramp test." (`--text-xs`, secondary). Features
  unknown (never connected since saving): enabled, and the engine's own refusal handling applies.

## The ramp screen

Always the dark scheme. It replaces #768's ride screen for a session of kind `RampTest` (the route is chosen by
kind: **while a ride is active, opening the app lands on the ramp screen**), and renders from the same
`StateFlow<RideState>`, calling only `skipStep()`, `end()`, `discard()` and `cancel()`. The top row (trainer and
heart rate pills, End or Cancel), the banner, the foreground service, wake lock, "Back keeps the ride going"
snackbar (here "The test keeps going. Use End to stop." in warm-up, "The test keeps going." from the ramp on) and
getting-ready table are #768's as written and use the same composables. This section is only what differs.
Ground `--color-bg`, cards `--color-surface` with `--radius-lg` and no outline, `--space-md` margins, `--space-sm`
between cards, tabular figures; content scrolls, the action button is pinned. The screen is kept on.

### Getting ready

#768's table, with the warm-up's layout behind it ("5:00" left, target "100"). The status line replaces "left in
warm-up". End reads "Cancel" (`cancel()`: nothing was recorded, the folder is deleted, back to the intro).

### Warm-up (step 0)

```
[● KICKR · ERG] [● HR · HRM-Pro]                          [End]
┌ Warm-up                                          2:48 in ┐
│ 2:12                                      left in warm-up │
│ ▓▓▓▓▓▓▓▓▓▓░░░░░░░░                                        │
└───────────────────────────────────────────────────────────┘
┌ TARGET           ┐ ┌ POWER 3S         ┐
│ 100              │ │ 98               │
│ watts            │ │ On target        │
└──────────────────┘ └──────────────────┘
[ CADENCE 88 rpm ] [ HEART RATE 121 bpm ]
Warm up at an easy pace. After this the power rises 20 W every minute.
[                  Start the ramp                         ]
```

- Step card, target and Power 3s cards and tiles as #768's (the band rule, the "—" and "No power reading" states, the
  progress bar in `--color-border-strong`), except line 1's right side is the time in the warm-up ("2:48 in"), not
  "elapsed / total": a test has no known total.
- The hint (`--text-sm`, `--color-text-secondary`). The pinned button: filled `--color-primary-fill`, `--color-on-fill`
  text, `--text-lg` bold, `--spin-ride-button` tall, `--radius-lg`, "Start the ramp" (`skipStep()`).
- **End** in the warm-up opens "Stop the test?" / "You haven't started the ramp yet. Nothing from this test is
  saved." with "Stop test" (`--color-danger-text`, bold; `discard()`, back to the intro) and "Keep riding".
  Discarding a warm-up loses no measurement, so there is no second dialog.
- When the 5:00 runs out the ramp starts by itself; the step change is announced politely: "Ramp, 100 watts".

### The ramp (step 1)

```
[● KICKR · ERG] [● HR · HRM-Pro]
┌ Step 7                                       on the ramp 6:42 ┐
│ 240 W                                                         │
│ next step in 0:18 · 260 W                                     │
│ ▓▓▓▓▓▓▓▓▓▓▓▓░░░░                                              │
└───────────────────────────────────────────────────────────────┘
┌ POWER 3S ┐ ┌ CADENCE ┐ ┌ HEART RATE ┐
│ 243      │ │ 91 rpm  │ │ 158 bpm    │
│ On target│ │         │ │            │
└──────────┘ └─────────┘ └────────────┘
┌ stairs: done ▂▃▄▅▆ current ▇ upcoming ░ ░ ───────────────────┐
└───────────────────────────────────────────────────────────────┘
┌ BEST MINUTE SO FAR                                            ┐
│ 238 W → FTP about 179 W                                       │
└───────────────────────────────────────────────────────────────┘
Every minute adds 20 W. Ride until you can't hold the target. The test ends when you tap below,
or when your cadence stays under 60 rpm for 5 seconds.
[                           I'm done                          ]
```

- **Step card**: "Step <n>" (`--text-sm` bold; n = whole minutes into the ramp + 1) and at the right "on the ramp
  <m:ss>" (`--text-sm`, secondary). The target at `--figure-xl` bold in `--color-primary-text` with "W" at `--text-lg`;
  under it "next step in <m:ss> · <w> W" (`--text-sm`, secondary). The progress bar fills over the current minute
  (track `--color-border`, fill `--color-primary`).
- **Power 3s** (the band, as #768, against the absolute target), **Cadence** (turns `--color-warning` with the unit
  "rpm · keep it up" when under 70 rpm; the word makes it not colour alone) and **Heart rate** tiles, three equal.
  Cadence under 60 is what runs the 5 s end clock; nothing counts down on screen, the rider's job is to ride.
- **Stairs card**, `--spin-profile-ride` tall: one bar per minute-step, the last 13 steps and the next 2, widths
  equal, `--radius-sm` top corners, height proportional to the step's watts over the tallest bar shown. Done bars
  `--color-primary-fill`, the current bar `--color-primary-text`, upcoming `--color-border`. Content description:
  "Ramp steps. You are on step 7 of the ramp, 240 watts."
- **Best minute so far**: eyebrow "BEST MINUTE SO FAR" (`--text-xs` bold, secondary); "<best> W → FTP about <ftp> W"
  (`--text-lg` bold, best in `--color-text`). The same function as the result (§Result maths) over the samples so
  far; "—" until the ramp has a window (60 s in), with the line "after the first full minute".
- **"I'm done"**: the pinned button, as "Start the ramp", at the same position. Disabled (`--opacity-disabled`, announced as
  disabled) for the first 5 s of the ramp. No End and no Pause on this phase: the tap is how the test stops. A
  guarded back gesture shows the snackbar.
- **Ending**: the tap calls `skipStep()`. The engine ends the ramp, starts the cool-down and (when a cadence fired
  it) the screen sees the step index change with no tap from it. The screen remembers a tap in memory only to
  word the reason; the result reads the reason from the recording (§Result maths), so it survives process death.

### Test over, and the cool-down (step 2)

The ramp's end freezes the result at once: `RampResult.from(recording)` runs on the ramp step's samples (written
before the cool-down's first second, #768), and the outcome is written to `ramp.json` in the ride's folder (§Ride
folder). The screen shows:

```
┌ Test over                                                     ┐
│ You lasted 13:31                                              │
│ Your cadence stayed under 60 rpm.                             │
│ Cool-down: 9:42 left at 100 W. Keep pedalling easy.           │
└───────────────────────────────────────────────────────────────┘
(target and power cards, as the warm-up)
[                       See your result                       ]
                        Stop cool-down
```

- Title "Test over" (`--text-lg` bold); "You lasted <m:ss>" (`--text-base` bold); the reason (`--text-sm`,
  secondary): tap "You ended the test."; cadence "Your cadence stayed under 60 rpm."; interrupted "The app was closed
  during the test."; anything else "The test stopped early."; the cool-down line "Cool-down: <m:ss> left at 100 W."
  while it runs.
- "See your result" (filled, pinned) opens the result screen above this one. "Stop cool-down" (text button,
  `--tap-target` tall, `--color-text-secondary` bold) calls `end()` with no confirm: nothing is lost, the test is
  already measured. The screen then goes to the result.
- When the cool-down completes by itself, or "Stop cool-down" ends it, the ride finishes (#768's hand-off,
  `kind = ramp_test`). If the result is not already open it opens now; if it is, nothing changes on screen.

### A test interrupted by the app being closed

#768 brings a killed ride back **paused** within 60 minutes. The ramp screen never offers Resume: a staircase and a
rolling minute cannot be paused across a gap. In that state (kind `RampTest`, phase paused) it shows the card "The
test was interrupted at <elapsed> when the app was closed." and one pinned button: "See your result" when the ramp
had at least 60 s of samples, else "Discard test". Either calls `end()` (the result) or `discard()`. Recovery
older than 60 minutes is #768's: the ride is finished as `interrupted` and handed off, and the result opens from
the hand-off as for any ramp. The result's reason line for it is "The app was closed during the test."

## Result maths

`RampResult.from(recording)` is a pure function over #768's `RideRecording`. **The ramp's samples** are the samples
whose `step` is 1, in order, one per ride-second, power in whole watts or null (never 0 for no reading; #769's
rule).

- **Best minute**: for each second `t ≥ 59` of the ramp's samples, the mean of the non-null `power_w` in the 60
  samples `t−59 … t`, **kept only when the window holds at least 50 non-null readings**; the best minute is the
  largest kept mean. A window is wholly inside the ramp: warm-up and cool-down never count, and a window does not
  span a pause (a ramp has none).
- **FTP** = `round_half_up(0.75 × best minute)`, from the unrounded mean, once. The screen shows the best minute
  rounded half up. Pins: a flat 349.00 W minute gives 261.75, FTP **262**; a minute averaging 350.00 W gives
  262.5, FTP **263**; one averaging 348.67 gives 261.5, FTP **262**.
- **Lasted** = the number of ramp samples, as m:ss. **Last step** = the last non-null `target_w` of the ramp.
  **Max HR** = the largest non-null `hr_bpm` of the ramp, blank with none ("—", unit "No heart rate").
- **Why it ended** from the `step_start` event of step 2: reason `end_condition` → cadence; `skip` → tap; no such
  event, so the ramp was cut: from the `end` event, `interrupted` → app closed, anything else → stopped early.
- **Dropouts**: when the ramp has 3 or more samples with null power, the result says so (§Result screen).
- **Too short**: the ramp has no kept window (under 60 s of ramp, or the readings were missing). There is no
  result: no FTP, no ride to save as a test.
- **Range**: `addFtp` accepts 50–1000 W (#765). A computed FTP below 50 (a best minute under 67 W) is shown clamped to
  50 W and the basis line says "adjusted by you" only once the rider moves it; the stepper never leaves 50–1000. A
  JVM test pins the clamp.

Worked pin, for the JVM test: a ramp of 840 samples at the staircase's targets (100 W for 60 s, 120 for 60, … 240 W
for the last 60) ridden exactly on target has its best minute at the last 60 samples, 240 W, FTP **180**; with the
last 60 s at 238 W average its best is 238, FTP 179 (178.5, half up).

## The result screen

System theme, full screen, no bottom bar, opened by "See your result", by the hand-off (§After the ride), or when the
app next opens with the decision pending. Ground `--color-bg`, `--space-md` margins and `--space-md` between cards;
cards `--color-surface`, 1dp `--color-border-light`, `--radius-lg`. A top bar with a back arrow labelled "Later".

```
‹ Later
RAMP TEST · SAT 7 NOV
Your new FTP
[−]        262 W        [+]
+12 W (+4.8%) since 12 Oct
75% of your best minute (349 W)
┌ Lasted ┐ ┌ Last step ┐ ┌ Max HR ┐
│ 13:31  │ │ 360 W     │ │ 184    │
└────────┘ └───────────┘ └────────┘
Discard test
──────────────────────────────────────
[ Keep 250 W ]        [ Set FTP to 262 W ]
```

- Eyebrow "RAMP TEST · <ddd d MMM>" (`--text-xs` bold, `--color-primary-text`), in the phone's zone.
- "Your new FTP" (`--text-lg` bold). The stepper: "−" and "+" (content descriptions "Lower FTP" and "Higher FTP", each
  `--tap-target` square, `--radius-md`, 1dp `--color-border`) around the value, `--figure-xl` bold, `--color-text`, with
  "W" at `--text-lg`. **±1 W a tap, long-press repeats**, a button disabled at its limit, **50 and 1000 W**. The value
  is announced politely when it changes. The stepper is the only way to change it (the owner's decision: ±1 W).
- **Change line** (`--text-sm`, `--color-text-secondary`) against `CurrentFtp`'s value, with true minus signs:
  "+12 W (+4.8%) since 12 Oct", "−8 W (−3.2%) since 12 Oct", "No change from 250 W". The percent is
  `(new − old) ÷ old`, one decimal, half up. With no current FTP: "Your first FTP test" and no percent.
- **Basis line**: "75% of your best minute (<best> W)", plus ", adjusted by you" when the value differs from the
  computed one, and then a text button "Reset to <computed> W" (`--color-primary-text`, bold, `--tap-target`).
- **Dropouts** (3 or more null-power seconds): a line under the basis in `--color-warning-light` ground,
  `--radius-lg`, `--text-sm`, `--color-text`: "The trainer dropped out for <n> s during the test, so the best minute
  may be low."
- Three tiles as #769's (`--radius-md`): "Lasted" ("<m:ss>"), "Last step" ("<n> W"), "Max HR" ("<n>", "—" with unit
  "No heart rate").
- **Discard test**: a text button in the content, `--color-danger-text` bold, `--tap-target` tall. Dialog: title
  "Discard this test?", body "“Ramp test”, <date>. Your FTP stays <n> W and nothing from the test is saved, here or
  in Thrive." (with no FTP: "You will still have no FTP."), buttons "Discard test" (`--color-danger-text`, bold)
  and "Keep it". It stops any cool-down, deletes the folder and returns to the Library.
- **Footer**, pinned, as #769's: `--space-md` padding, 1dp `--color-border-light` rule above, buttons
  `--spin-cta-height`, `--radius-lg`, `--space-sm` apart. Filled "Set FTP to <N> W" (N live), outlined "Keep <n> W"
  (only when there is a current FTP, n its value).
- **The cool-down strip**: while the cool-down still runs, a strip under the top bar (`--color-surface`,
  `--text-sm`): "Cooling down · 7:42 left" with a text button "Stop". It goes when the ride has finished.

### What the buttons do

- **Set FTP to N W**: (1) writes the FTP record (§The FTP write), the commit; (2) from then on `CurrentFtp` is N;
  (3) nudges the worker. The screen turns to the **set** state in place. Disabled from the tap until the state has
  changed.
- **Keep n W**: writes `kept: true` and the final FTP n into `ramp.json`. Nothing is sent. The screen turns to the
  **kept** state.
- **Later** (and the system back gesture) leaves the decision pending. Adjustments are kept (saved to `ramp.json` as
  they change). The test comes back on the next app open (§After the ride).

### States

| State | Shows | Footer |
|---|---|---|
| Computing (the first moments after the ramp, or a recovery) | a progress indicator and "Measuring your test…" in place of the cards | none |
| **Pending, with a current FTP** | everything above | "Keep n W", "Set FTP to N W" |
| **Pending, no current FTP** | as above, change line "Your first FTP test" | "Set FTP to N W" only; no "Keep" exists, so "Later" and "Discard test" are the other ways out |
| **Too short** | title "Not enough to measure"; "The test ended before a full minute of the ramp was ridden." (or, with readings missing, "There weren't enough power readings to find a best minute."); no stepper | "Discard test" (filled, same dialog) |
| **Set** | the stepper gone; a card "FTP is now <N> W" (`--text-lg` bold) and the status line (below); the tiles stay | "Continue" |
| **Kept** | a card "FTP stays <n> W" and "Nothing was changed in Thrive." | "Continue" |

- **Set, status line** (`--text-sm`, `--color-text-secondary`; a mark by the same rules as #769's status card, never
  colour alone): "Spin uses it now. Added to Thrive's FTP history." once sent; "Spin uses it now. Saved on phone, not
  yet in Thrive · sends when online." while queued; "Spin uses it now. Thrive refused it. It's still on this phone."
  rejected; the other states' words are #769's table ("Key rejected", "Spin isn't set up", "Thrive keeps answering
  with an error"). A second line, always: "Past rides keep the FTP they were ridden at." The sheet's buttons
  (§Finding a pending FTP) are shown here for the same states.
- **Continue** (footer, filled): if the ride has not finished (cool-down running) it reads "Stop cool-down and
  continue" and calls `end()` first. It then calls `RideUploads.prepare(rideId, ftpW = <final>)` and opens #769's
  summary for the ride, marking the ride handed off (§After the ride). The ride is **scored at the FTP in force
  after the decision**, the confirmed N, or the kept n: that is what `prepare` receives, so IF, TSS, the FIT's
  threshold power and the payload's and streams file's `ftp_w` all use it.

## After the ride

#769 left `kind = ramp_test` to this issue ([769-spin-save.md](769-spin-save.md) §Hand-off). Four things register:

1. **`RideFinishedHandler` for `ramp_test`**: opens the result route for the ride, and leaves it **un-handed-off**
   (`handed_off` false) until the person presses Continue. #768's rule that an un-handed-off finished ride is
   presented again at each app open, oldest first, therefore brings a decision left with "Later" back every time,
   until it is made or the test is discarded. (That is the only place such a ride is found: it has no `upload.json`
   yet, so #769's banner does not count it.)
2. **#769's summary route for a `ramp_test`**: every open (the handler, the banner, "Later" and back) passes the final FTP read
   from `ramp.json` (or the FTP record) to `prepare`, so the summary is never "No FTP" for a test whose FTP is
   decided. A ramp test whose decision is still pending is never opened on the summary: the banner cannot reach one
   (no `upload.json`).
3. **The summary itself is #769's, unchanged**: title "Ramp test", the nine tiles, effort and notes, "Save to Thrive".
   Its Intervals section shows what it builds for these steps (a stairs row, "100–360 W"), nothing special-cased;
   the stairs row's compliance has no meaning for a test and is left as it is.
4. **Too short**: the folder was deleted by "Discard test", or stays until it is; there is nothing to save.

### Ordering: the FTP first, the ride after, independent

- **The FTP is written at the confirm; the ride is saved later, at "Save to Thrive".** They never wait on each other.
  `addFtp` does not check that its `ride_id` exists (#765 requires it for `ramp_test` and checks its shape), so the
  row can reach Thrive before the ride does, and may precede a ride that is then discarded.
- **Why not after the ride**: the owner confirmed a number; Spin must use it now, offline included, and the ride's
  own upload waits for a tap on the summary that might be tomorrow. Coupling them would delay the number or lose it
  with the ride.
- **A ride discarded after its FTP was set** leaves the `FtpHistory` row and its `ride_id` as a reference to nothing.
  Nothing in #772 follows that id, and the row stays correct: the FTP was set by a test.
- **A ride saved after a rejected FTP** is unaffected: the two queues share nothing but the transport.

## The FTP write

### The record

One JSON file per confirmed test, `files/ftp/<id>.json`, **outside the ride's folder** because #769 deletes that
folder once Thrive has the ride, and the FTP write may outlive it (or precede it). Rewritten whole through a temp file and
rename, like `meta.json`.

```json
{"v":1,"id":"ftp_5f0c2e9a-…","state":"queued","date":"2026-11-07","ftp_w":262,"source":"ramp_test",
 "ride_id":"5f0c2e9a-…","computed_w":262,"previous_w":250,"previous_date":"2026-10-12",
 "created_at_utc":"2026-11-07T15:40:12Z","attempts":0,"server_errors":0,"last_try_utc":null,"message":null}
```

- **`id` = `ftp_` + the ride id** (1–64 of `[A-Za-z0-9_-]`: 40 characters for a UUID). A test has at most one FTP row, and
  a repeat of the call (a lost answer) hits #765's "adding it twice leaves one row". **The record is the commit:**
  its existence means the decision was made (it is written before `ramp.json` is touched), so a process that dies
  between the two reopens the result in its **set** state.
- **`date`** is the America/Denver calendar date of the ride's `started_at_utc` (the test day, not the confirm day,
  and fixed across retries), the same zone #765 files rides under, from `java.time`, tested across a daylight
  saving change and for a test begun at 11:30 pm Denver.
- Payload for `addFtp`: `{id, date, ftp_w, source: "ramp_test", ride_id}`, sent through #766's `SpinApi` with the same
  transport and key handling as `getFtp` and #769's `saveRide` (the key never in a URL, never logged).
- A confirmed value is **final**: the result screen has no way back to the stepper once set, because a second `addFtp`
  with the same id would return the first row unchanged and the app would show a number Thrive does not hold.
  Changing it is a manual row in the sheet (#765 puts hand edits out of the API).

### States and the queue

The same classification as #769's answer table, applied to this one call, **through the one function #769 builds for
it** (`core/upload/`'s result classifier; if it is not a reusable function when this issue starts, it is extracted
first, not copied):

| State | Meaning | Leaves it |
|---|---|---|
| `queued` | waiting to send, or sending | success → `sent`; `bad_request` → `rejected`; key refused → `needs_key`; no URL or key → `needs_setup`; the 10th server error in a row → `stuck` |
| `needs_key`, `needs_setup` | cannot send until Settings is fixed | saving Settings → `queued` |
| `stuck` | Thrive keeps answering with an error | "Try again" → `queued`, counters reset |
| `rejected` | Thrive refused it (`bad_request`); never retried by itself | "Try again" → `queued`; "Drop change" deletes it |
| `sent` | Thrive has it | the record is deleted after the cache's `current` is set to the row `addFtp` returned |

- `FtpWorker` is WorkManager unique work (`spin-ftp`, appended), connected network, exponential backoff from 30 s,
  60 s call timeout as #769's, nudged on confirm, on app open when anything is queued, after Settings is saved, and by
  "Send now" and "Try again". A network failure keeps the record `queued`, adds to `attempts`, records the try, and
  never counts toward `stuck`. Success is `success: true` whatever `status` says (an existing row is done).
- Records are sent oldest first, one at a time. A key refusal stops the run.

### The current FTP

Spin must use a confirmed FTP **at once and offline**, and a Library refresh that lands before the write reaches
Thrive would otherwise put the old number back. So everything in Spin that reads the FTP (#767's detail and
builder, the Library card, #768's `ftpW` for the next ride, this result's "change" line) reads **`CurrentFtp`**, the
wrapper around #767's cached `getFtp` `current`:

- the newest by (`date`, then creation time) of the cached `current` and every FTP record that is **not** `sent`
  (queued, `needs_*`, `stuck` and `rejected` alike: a refused number stays in force until the person drops it);
- on `sent` the cache's `current` becomes the returned row and the record goes, so the next refresh agrees.

JVM-tested: a refresh that returns the old row while a record is queued still gives the new FTP; dropping the
record gives the old one back; the cache alone gives its own.

## Finding a pending FTP

The Library gets a second slot beside #769's `PendingRidesBanner`: a **`PendingFtpBanner`**, directly under the title and
above it, drawn the same way (card `--radius-lg`, `--space-md` inside, text `--color-text` `--text-sm`, button
`--color-primary-text` bold `--tap-target` tall) and counting FTP records that are not `sent`:

| Most urgent state present | Banner | Button | Ground |
|---|---|---|---|
| `rejected`, `needs_key`, `needs_setup`, `stuck` | "1 FTP change couldn't be saved to Thrive" / "<n> FTP changes couldn't be saved to Thrive" | "Details" | `--color-warning-light` |
| `queued` | "1 FTP change is waiting to send to Thrive" / "<n> FTP changes are waiting to send to Thrive" | "Details" | `--color-surface` with a 1dp `--color-border-light` outline |

Tapping opens the **FTP sheet** for the oldest such record: a modal bottom sheet, `--radius-lg` top corners,
`--color-surface`, over `--color-overlay`, close "×":

- Title "FTP <N> W" (`--text-lg` bold), the line "Set by a ramp test on <MMM d>. Spin is using it now." and the
  status line and buttons by state: `queued` "Saved on phone, not yet in Thrive · sends when online." with "Send now";
  `needs_key` "Key rejected. Check the key in Settings." with "Open settings"; `needs_setup` "Add the API URL and key
  in Settings." with "Open settings"; `stuck` "Thrive keeps answering with an error. It stopped trying." with "Try
  again"; `rejected` "Thrive refused this change: <the server's text>. It wasn't sent again." with "Try again".
- A text button "Drop change" in `--color-danger-text`, in every state (the person may want to take a number back
  before it leaves): dialog "Drop this FTP change?" / "FTP <N> W from the ramp
  test on <MMM d> will not be added to Thrive's FTP history. Spin goes back to <previous> W." (with no previous:
  "Spin goes back to having no FTP.") with "Drop change" (`--color-danger-text`, bold) and "Keep it". It deletes
  the record only; the ride is unaffected.
- No notification is raised for any state (the owner waived notification checking, #769).

## Edge cases

- **Two tests before the first is sent** (an offline week): two records, each with its own id; `CurrentFtp` takes the
  newest; both go in order.
- **A test run while the previous test's decision is pending**: starting it is allowed (the old test is a finished
  ride); both come back at app open, oldest first.
- **Same-day retests**: two rows with the same `date`; #765 picks the newer by `created`, and so does `CurrentFtp`.
- **The rider ends during the first minute of the ramp** (a tap after 5 s, or a cadence dropout): under 60 s of ramp,
  "Not enough to measure".
- **A very low best minute** (a rider sat under 100 W for the ramp): the FTP is still 75% of it; the adjuster and
  confirm are the checks. There is no minimum-quality judgement: Spin is the owner's own tool and a bad test is
  discarded.
- **Trainer lost during the ramp**: the clock runs (#768); readings are null; the windows that lack 50 readings do not
  count; the dropout note appears. Null cadence never ends the test.
- **The tap on a cool-down already running** ("I'm done" cannot be pressed twice): the button is gone in the cool-down.
- **Storage full or any #768 forced end during the ramp**: the ramp's samples to that point still give a result; the
  reason line reads "The test stopped early."
- **A second app on the trainer, ERG refused**: #768's refusals apply and its banner shows; the ramp is then a
  guide, and the result is of what was ridden. The banner "Targets are a guide until it does." is the rider's cue to
  discard.
- **Rotation and process death**: the ramp screen state is the service's; the result's adjustments are in
  `ramp.json`; the decision is the record.
- **Bluetooth permission revoked, notification denied**: #768's rules.
- **A rapid second tap on "Set FTP to N W"**: one record (keyed by the ride id).
- **The cached `current` is older than the real one** (FTP changed elsewhere since the last refresh): the change
  line compares against what Spin has; the written row is newest by date anyway.
- **FTP set, then the whole ride discarded at the summary**: allowed (§Ordering).

## Ride folder

#770 adds one file to the ride's folder beside #768's three and #769's `upload.json`: **`ramp.json`**, written when the
ramp ends (result frozen) and rewritten whole as it changes:

```json
{"v":1,"result":{"best_minute_w":349,"computed_ftp_w":262,"lasted_s":811,"last_step_w":360,"max_hr":184,
  "end":"end_condition","null_power_s":0},"adjusted_ftp_w":262,"kept":false}
```

`result` is null for a test too short to measure. The final FTP of a decided test is the FTP record's `ftp_w`, or `n` when
`kept` is true (stored as `final_ftp_w` then). Deleted with the folder.

## Not carried from the prototype

- **The "Your tests" list and "See FTP over time in Thrive".** The history is #772's (Trends), and a list on the result
  would need a network read the result cannot rely on offline. The change line carries the one comparison that
  matters.
- **"Save ride" on the result.** The ride is saved from #769's summary, which owns effort, notes and the upload; the
  result has "Continue" instead, so there is one save, not two.
- **A 10× speed button** (a prototype aid), and the prototype's blue stairs colours (the tokens above).
- **"Test over" as a screen before the cool-down.** It is the ramp screen's third state.

## Changes to earlier notes (small, all listed)

- **#767**: the Library gains `RampTestCard` and `PendingFtpBanner`, and its FTP reads go through `CurrentFtp`. The
  detail screen and builder do not change.
- **#769**: the handler and banner route a `ramp_test` to this issue's screens and pass the FTP to `prepare`
  (its own note reserves both: "#770 registers its own route"). Nothing else of its state machine changes.
- **#768**: the foreground notification for an **open-ended** step reads "<label> · <m:ss> · <target>" (the time in
  the step, no "left"), since the ramp has no time left. #768's note words it only for timed steps.
- **#772**: its note says "planning a retest is possible by planning a bike workout with the ramp-test Spin workout".
  **The ramp test is built into the app, not a `RideWorkouts` row** (#765 has no row for it, and steps in watts are
  not representable there), so the planning picker cannot offer it. Retests are started from the Library card.
  #772's sentence is wrong and should be dropped; #772's own criteria do not depend on it.

## Copy

Library card: "FTP TEST", "Ramp test", "FTP <n> W · set <MMM d> by a ramp test", "FTP <n> W · set <MMM d> by hand",
"No FTP yet. Ride the ramp test to set one."

Intro: "A ramp test measures your FTP. You ride 5 minutes easy, then the power rises 20 W every minute, starting at
100 W, until you can't keep it up.", "How it works", "The test ends when you tap "I'm done", or when your cadence
stays under 60 rpm for 5 seconds.", "Your FTP is 75% of your best minute.", "A 10-minute cool-down follows. You can
stop it early.", "Your FTP is <n> W, set <MMM d>.", "You have no FTP yet.", "Nothing is saved to your FTP until you
confirm it on the result screen.", "Start test", "Your trainer can't hold a power target, so it can't run the ramp
test."

Ramp screen: "Warm-up", "<m:ss> in", "left in warm-up", "Warm up at an easy pace. After this the power rises 20 W every
minute.", "Start the ramp", "Stop the test?", "You haven't started the ramp yet. Nothing from this test is saved.",
"Stop test", "Keep riding", "Step <n>", "on the ramp <m:ss>", "next step in <m:ss> · <w> W", "rpm · keep it up", "BEST
MINUTE SO FAR", "<best> W → FTP about <n> W", "after the first full minute", "Every minute adds 20 W. Ride until you
can't hold the target. The test ends when you tap below, or when your cadence stays under 60 rpm for 5 seconds.",
"I'm done", "The test keeps going. Use End to stop.", "The test keeps going.", "Test over", "You lasted <m:ss>", "You
ended the test.", "Your cadence stayed under 60 rpm.", "The app was closed during the test.", "The test stopped
early.", "Cool-down: <m:ss> left at 100 W.", "See your result", "Stop cool-down", "The test was interrupted at
<elapsed> when the app was closed.", "Discard test", "Ramp, <n> watts".

Result: "RAMP TEST · <ddd d MMM>", "Later", "Your new FTP", "Lower FTP", "Higher FTP", "+<n> W (+<p>%) since <MMM d>", "−<n> W
(−<p>%) since <MMM d>", "No change from <n> W", "Your first FTP test", "75% of your best minute (<n> W)", ", adjusted by
you", "Reset to <n> W", "The trainer dropped out for <n> s during the test, so the best minute may be low.", "Lasted",
"Last step", "Max HR", "No heart rate", "Discard this test?", "“Ramp test”, <date>. Your FTP stays <n> W and nothing from
the test is saved, here or in Thrive.", "You will still have no FTP.", "Keep it", "Set FTP to <n> W", "Keep <n> W",
"Cooling down · <m:ss> left", "Stop", "Measuring your test…", "Not enough to measure", "The test ended before a full
minute of the ramp was ridden.", "There weren't enough power readings to find a best minute.", "FTP is now <n> W",
"FTP stays <n> W", "Nothing was changed in Thrive.", "Spin uses it now. Added to Thrive's FTP history.", "Spin uses it
now. Saved on phone, not yet in Thrive · sends when online.", "Spin uses it now. Thrive refused it. It's still on
this phone.", "Past rides keep the FTP they were ridden at.", "Continue", "Stop cool-down and continue".

Banner and sheet: "1 FTP change is waiting to send to Thrive", "<n> FTP changes are waiting to send to Thrive", "1 FTP
change couldn't be saved to Thrive", "<n> FTP changes couldn't be saved to Thrive", "Details", "FTP <n> W", "Set by a
ramp test on <MMM d>. Spin is using it now.", "Saved on phone, not yet in Thrive · sends when online.", "Key rejected.
Check the key in Settings.", "Add the API URL and key in Settings.", "Thrive keeps answering with an error. It stopped
trying.", "Thrive refused this change: <text>. It wasn't sent again.", "Send now", "Open settings", "Try again", "Drop
change", "Drop this FTP change?", "FTP <n> W from the ramp test on <MMM d> will not be added to Thrive's FTP history.
Spin goes back to <n> W.", "Spin goes back to having no FTP.", "Keep it".

## Accessibility

- Every control is at least `--tap-target`; "Start the ramp" and "I'm done" are `--spin-ride-button`, pressed mid-effort.
- Nothing is colour alone: the band's word, "rpm · keep it up", the change line's sign and words, the status marks'
  shapes and labels.
- The target, power and countdown are not live regions. A step change is announced politely ("Ramp, 100 watts"; the
  ramp's minute steps are not announced, they would interrupt the effort). The stepper value and a banner appearing
  are announced politely.
- Contrast on the ramp screen is #768's dark pairs, already measured there (`--color-primary-text` 6.22,
  `--color-warning` 10.02 on `--color-surface`). The stairs bars are graphics beside text that states the same step.

## Out of scope

20-minute, 8-minute and other protocols, and any choice between them (the owner may file the 20-minute test later);
retest reminders or coaching; planning a ramp test in the library or the Thrive planner; editing or deleting an
`FtpHistory` row; typing an FTP by hand in Spin; a list or chart of past tests; adapting the start watts or the step
size; pausing a test.

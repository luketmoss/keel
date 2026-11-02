# 768 — Thrive Spin: ride engine and the ride screen

Part of #764. Running a workout on the KICKR: the foreground service that holds a ride, FTMS control of the trainer,
the step clock, 1 Hz recording to the phone, and the prototype's "4 · Ride (bike computer)" artboard
(https://claude.ai/artifact/EXun1UbyRcgj1PfnhS7kq2). It starts where #767 ends (`RideStarter.start(RideRequest)`,
[767-spin-library.md](767-spin-library.md) §Hand-off) and ends at handing a finished recording to #769
(§Hand-off to #769). It reuses #766's FTMS parsers, GATT queue, device store and heart rate choice
([766-spin-devices.md](766-spin-devices.md)), and #767's `core/workout/` maths and profile.

Standing documents: `ui/docs/design/keel-wide-rules.md` and `ui/docs/design/suite-language.md` (blank is not zero,
never colour alone, destructive actions confirm in words, touch targets). There is none in `thrive/docs/design/`.
Tokens are the suite's, Thrive's and Spin's (#766, #767), mirrored into `SpinColors` and Spin's theme module by
#766's rule (`--space-*`/`--radius-*` in dp, `--text-*`/`--figure-*` in sp). The prototype's own hex values are not used.

## The parts

| Part | Where | Tested |
|---|---|---|
| **Engine**: session model, step clock, targets, intensity, pause, skip, end, trainer command decisions, refusal and reconnect handling, heart rate choice timing | `core/ride/`, plain Kotlin, driven by a fake clock and a fake trainer | JVM |
| **FTMS control**: control point encoding and response parsing, Fitness Machine Status, Supported Power and Resistance Level Range | `core/ble/`, beside #766's parsers | JVM, against byte arrays |
| **Recording**: the on-phone files, writer and reader, recovery | `core/ride/recording/`, plain Kotlin over a directory | JVM, against a temp directory |
| **Service**: the foreground service, notification, wake lock, the ride's own Bluetooth connections | `ride/RideService` | waived on the phone |
| **Screen**: the ride screen and its dialogs | `ride/RideScreen` | waived on the phone |

The service and screen stay thin: every decision below that is not a pixel lives in the engine.

## Starting a ride

#767's placeholder binding is replaced. `RideStarter.start(request)` now:

1. **No trainer saved** (#766's store): nothing starts; a snackbar on the detail screen, "Add your trainer in Devices
   first."
2. **A ride is already active** (getting ready, running or paused): nothing new starts; the active ride's screen opens
   with a snackbar "A ride is already going. End it first." The request is dropped.
3. Otherwise it builds a `RideSession` from the request (§Session model): a new `rideId` (UUID, made once here), the
   expanded steps, and the request's FTP, intensity and mode. It asks for the notification permission
   (`POST_NOTIFICATIONS`, Android 13 and up) the first time a ride starts, and starts the ride whatever the answer:
   the notification is only a convenience. It then starts `RideService` in the foreground and opens the ride screen.

The ride screen is full screen with no bottom bar. **While a ride is active, opening the app always lands on it.**

### Getting ready

The service connects to the trainer and the heart rate monitors itself (§Connections). The screen shows the normal
layout (§Layout) with the first step's full duration, the clock at `0:00`, and one status line in the step card in
place of "left in step":

| Situation | Status line | Controls |
|---|---|---|
| looking for the trainer, under 20 s | "Connecting to <trainer name>…" | Intensity works; Pause and Skip disabled; End reads "Cancel" |
| not found for 20 s (it keeps looking) | "Can't find <trainer name>. Pedal to wake it, and close other apps connected to it." | same |
| Bluetooth off | "Bluetooth is off." and a "Turn on" text button (asks the system, as #766's banner does) | same |
| connected, control sequence done (or refused, §Refusals) | "Pedal to start" | same |

**The clock starts on the first pedal stroke**: the first Indoor Bike Data reading after "Pedal to start" with power
above 0 W or cadence above 0 rpm. That moment is `started_at_utc`. Nothing is recorded before it.

"Cancel" ends a ride whose clock never started, with no confirm: nothing was recorded, its folder is deleted, the
trainer is released (§Releasing), and the screen returns to the workout detail it came from.

## Session model (the engine's input, and #770's hook)

`RideRequest` is #767's. The engine never sees it: it runs a `RideSession`, which #770's ramp test builds directly.

```kotlin
data class RideSession(
    val rideId: String,              // UUID; becomes ride_id
    val kind: RideKind,              // Workout | RampTest
    val name: String,                // the ride's name
    val workoutId: String?,          // RideWorkouts id; null for a ramp test
    val ftpW: Int?,                  // null only when no step is PctOfFtp
    val mode: TrainerMode,           // Erg | Resistance | Slope: how erg steps are ridden
    val intensityPct: Int,           // starting intensity, 50..130
    val intensityAdjustable: Boolean,// false hides Intensity (a ramp test)
    val steps: List<RideStep>,       // at least one
)
data class RideStep(
    val label: String,               // "Sweet spot"
    val position: String?,           // "2 of 3" inside a repeat, else null
    val durS: Int?,                  // null = open-ended (see below)
    val target: StepTarget,
    val cadenceRpm: Int?,            // shown, never enforced
    val endWhen: EndCondition?,      // null = ends on time or on skip only
)
sealed interface StepTarget {
    data class PctOfFtp(val start: Int, val end: Int) : StepTarget      // erg, scaled by intensity; end == start unless a ramp
    data class Watts(val startW: Int, val endW: Int) : StepTarget       // erg, absolute, never scaled
    data class WattsStairs(val startW: Int, val stepW: Int, val everyS: Int) : StepTarget // erg, absolute, climbs for ever
    data class Level(val level: Int) : StepTarget                        // 0..100
    data class Grade(val grade: Double) : StepTarget                     // -10.0..20.0
    data object Free : StepTarget
}
sealed interface EndCondition {
    data class CadenceBelow(val rpm: Int, val forS: Int) : EndCondition // every sample of the last forS s under rpm
}
```

- **From a `RideRequest`**: `kind = Workout`, `intensityAdjustable = true`, and one `RideStep` per #767 `ResolvedStep`
  in order: `erg` → `PctOfFtp(pct, pct_end ?: pct)`, `resistance` → `Level`, `slope` → `Grade`, `free` → `Free`.
  `position` is "k of n" for the k-th pass through an n× repeat. Every `durS` is set and no step has `endWhen`.
- **Open-ended steps**: `durS = null` runs until `endWhen` fires or the rider (or #770's screen) calls `skipStep()`.
  Only `WattsStairs`, `Watts` with `startW == endW`, `Level`, `Grade` and `Free` may be open-ended; a ramp needs a
  duration. A session is rejected (an `IllegalArgumentException`, a programming error) if it breaks this, if `ftpW` is
  null with a `PctOfFtp` step, or if it has no steps.
- **`WattsStairs(100, 20, 60)`** targets 100 W for seconds 0–59 of the step, 120 W for 60–119, and so on. That,
  `CadenceBelow(60, 5)` and an absolute-watts cool-down are what #770 needs; #770 owns the protocol, its screen and its
  numbers. #768 builds and tests the step types generically and ships no ramp test.
- **`EndCondition` fires** after the sample that completes it is recorded; the next step starts at the following
  second, and the step-start event's reason is `end_condition`.
- The `RideSession` is written into the recording (§Recording) so a recovered ride rebuilds exactly; everything in it
  is data, never a lambda.

**Controls** the engine exposes (the screen and #770's screen call these, nothing else):
`pause()`, `resume()`, `skipStep()`, `setIntensity(pct)`, `setModeLevel(level)`, `setModeGrade(grade)`, `end()`,
`discard()`, `cancel()`. **State** is one `StateFlow<RideState>`: phase (getting ready, running, paused, finished),
step index and seconds into it, the current target, 3 s power, cadence, heart rate and its source, step average,
total kJ, the banner, and each control's enabled flag. #770 renders its own screen from it.

## The step clock and samples

- A ride has **ride time**: whole seconds since the clock started, excluding pauses. Sample `t` is second `t`.
- The clock ticks from Android's monotonic clock (`elapsedRealtime`), never from Bluetooth notifications, so a silent
  trainer does not stop it. Every ride-second gets **exactly one sample**, in order, even when a tick runs late: a
  late tick writes every second it missed.
- **Readings are binned by the second they arrived in**, on the same monotonic clock. Sample `t` holds:
  - `power_w`, `cadence_rpm`: the mean (rounded half up) of the Indoor Bike Data readings that arrived during second
    `t`. With none, the most recent reading if it is under 3 s old, else **null**. A trainer that reports no cadence
    gives null cadence throughout.
  - `hr_bpm`: the chosen monitor's latest reading if under 5 s old, with sensor contact (or contact not reported) and
    bpm above 0 (#766's "64 bpm" rule), else null.
  - `target_w`: the erg target at second `t` (§Targets), in every trainer mode (in Resistance and Slope it is the
    guide); null in `Level`, `Grade` and `Free` steps.
  - `intensity_pct` in force during that second, the step index, and whether the trainer was connected.
- **3 s power** (the screen's "Power 3s") is the mean of the non-null `power_w` of the last three samples, rounded;
  "—" when all three are null. Before three samples exist, it uses those there are.
- **Step average** is the mean of the step's non-null `power_w` so far; **total kJ** is the sum of every non-null
  `power_w` ÷ 1000, rounded down for display.
- **Ride time is capped at 43 200 s** (12 h, the streams format's limit). At the cap the ride ends as if End were
  confirmed, with reason `limit`.

## Targets

- **`PctOfFtp`** at second `s` of a step of `d` seconds: `pct(s) = start + (end − start) × s ÷ d`, and
  `watts = FTP × pct(s) × intensity ÷ 10000`, rounded half up. A flat step therefore equals #767's watts to the watt.
  A 50→70% ramp over 600 s at FTP 250 and 100% is 125 W at second 0, 150 W at second 300, 175 W at second 599.
- **`Watts`** is the same line in absolute watts, never scaled; **`WattsStairs`** as above, never scaled.
- **Intensity** changes every `PctOfFtp` target from the next second on, the current step included: a 90% step at
  FTP 250 goes from 225 W to 227 W on "+" (101%). It never changes `Level`, `Grade`, `Watts` or `WattsStairs`.
  Each change is an event in the recording and is in every later sample, so `intensity_pct` for #769 is the mean of
  the samples' values, rounded half up.
- **Target band** (Power 3s): with target `T` and 3 s power `P`, **On target** when |P − T| ≤ 5% of T, **Below
  target** when P is lower, **Above target** when higher. Target 200 W: 190 and 210 are on target, 189 is below, 211
  is above. No band when there is no erg target or P is "—".

## Trainer control (FTMS)

All writes go through #766's GATT queue. The Control Point (0x2AD9) is used with indications on; **one command is in
flight at a time**, and the next waits for its response (`80 <op> <result>`) or for a **3 s timeout**. When a new
target is decided while a command is in flight, only the newest pending target is sent after it: there is no backlog.

### The sequence

On every connection (the first, and each reconnect), in order:

1. Subscribe to Indoor Bike Data (0x2AD2), Fitness Machine Status (0x2ADA) and the Control Point.
2. Read FTMS Feature (0x2ACC; #766 parses it), Supported Power Range (0x2AD8: sint16 min W, sint16 max W, uint16
   increment) and Supported Resistance Level Range (0x2AD6: sint16 min, sint16 max, uint16 increment, all 0.1 units).
   A characteristic that is missing or fails to read is treated as "range unknown".
3. **Request Control** `00`.
4. **Start or Resume** `07`. A result of `02` (not supported) is ignored: some trainers start on their own.
5. The command for the current moment: the step's target while running, the flat road (below) while getting ready
   before the first step's target is sent, while paused, or after the end.

The engine never sends Reset (`01`), which drops control on some trainers.

### What each step sends

| Step target | Trainer mode | Command | Bytes |
|---|---|---|---|
| `PctOfFtp`, `Watts`, `WattsStairs` | ERG | Set Target Power `05` + sint16 W, clamped into the Supported Power Range when known | 225 W: `05 E1 00` |
| same | Resistance | Set Target Resistance Level `04` with the ride's **level** (§Resistance and Slope) | — |
| same | Slope | Set Indoor Bike Simulation Parameters `11` with the ride's **grade** | 2.0%: `11 00 00 C8 00 28 33` |
| `Level(n)` | any | Set Target Resistance Level `04` with level n | — |
| `Grade(g)` | any | Set Indoor Bike Simulation Parameters `11`: wind 0 (sint16, 0.001 m/s), grade (sint16, 0.01%), Crr 0.0040 (uint8, 0.0001), Cw 0.51 kg/m (uint8, 0.01) | 4.5%: `11 00 00 C2 01 28 33`; −2.0%: `11 00 00 38 FF 28 33` |
| `Free` | any | the **flat road** | — |

- **The flat road** is Set Indoor Bike Simulation Parameters at grade 0.0% (`11 00 00 00 00 28 33`) when the
  trainer's Target Setting Features have bit 13 (indoor bike simulation); else Set Target Resistance Level at the
  range's minimum when bit 2 (resistance); else nothing. It is what a ride sends when it should feel like no target:
  `Free` steps, getting ready, paused, and after the end.
- **Level mapping**: level `L` (0–100) is sent as `min + (max − min) × L ÷ 100` of the Supported Resistance Level
  Range, snapped down to its increment; with the range unknown, as `L` itself. The FTMS table's parameter width for
  `04` is fixed in development against the spec and pinned by the JVM test; this note does not fix it.
- **When it is sent**: at each step start, on each intensity, level or grade change, on resume, after each
  reconnect's sequence, and during a ramp or a stairs step whenever the rounded value changes, at most once a second.
  An unchanged value is not resent.
- A step's command needs its feature bit (power target bit 3, resistance bit 2, simulation bit 13). Without it the
  command is not sent, the target is a guide, and the banner says so (§Banners) for that step.

### Resistance and Slope (#767 left these to #768)

In **Resistance** or **Slope** trainer mode, every erg step is ridden at **one ride-wide setting** the rider chooses,
and the erg target is shown as a guide. The workout's own `resistance`, `slope` and `free` steps run as written in
every mode.

- Resistance starts at **level 30**, Slope at **grade 2.0%**, each ride (the builder's defaults for those modes).
- A "Trainer" row appears above the controls only in these modes, during erg steps (§Layout). Level −/+ by 5 within
  0–100; grade −/+ by 0.5 within −10.0 to 20.0. Each change is sent at once and recorded as an event.
- Why one setting and not a level per step: there is no honest mapping from watts to a level or grade that holds
  across gears and cadence, and #767's own hint promises "a fixed level. You hit the target by shifting and changing
  cadence."

### Refusals

A response whose result is not `01` (success), or no response within 3 s:

| What was refused | Result | Engine does | Banner |
|---|---|---|---|
| Request Control | any but `01`, or timeout | keeps the ride going without control (targets are a guide), and sends Request Control again every 15 s until it succeeds; then runs the rest of the sequence | "The trainer isn't taking commands. Close other apps connected to it. Targets are a guide until it does." |
| a target | `05` control not permitted | Request Control once, then resends the target once; if either fails, as the row above | as above |
| a target | `02` not supported | stops sending that command for the rest of the ride | ERG: "Your trainer can't hold a power target. Targets are a guide." Level: "Your trainer can't set a resistance level. Ride it by feel." Slope: "Your trainer can't simulate a slope. Ride it by feel." |
| a target | `03` invalid parameter | does not resend that value; the next different value is sent normally | "The trainer refused that target. It's a guide for now." (goes at the next step or the next accepted target) |
| a target | `04` failed, or timeout | resends once after 1 s; a second failure is treated as `03` | as `03` |

**Fitness Machine Status** (0x2ADA): `FF` (control permission lost) or `01` (reset) runs the sequence again from
Request Control. Other status codes are ignored. Each refusal and loss is an event in the recording.

### Releasing

At the end (completed, ended, discarded, cancelled), the engine sends the flat road, waits for its response or 3 s,
then closes every connection, and the service stops. It sends no Stop (`08`): a KICKR left in ERG at a high target is
what a rider must not meet on the next pedal stroke, and the flat road is the state other apps expect to find.

## Connections

The ride has its own connections, separate from Devices' (#766 connects only while Devices is on screen, and Devices
is not reachable during a ride).

- At service start, a scan filtered to the saved trainer's and saved monitors' addresses, as #766's; each device seen
  is connected and subscribed. When the fallback toggle is off only the picked monitor is looked for; when it is on,
  every saved monitor is, and all stay connected for the ride so a fallback is instant.
- **Trainer lost mid-ride** (disconnect, or Bluetooth off): **the clock keeps running** (the epic's decision). Samples
  carry null power and cadence and the target as usual; the trainer pill reads "Reconnecting…"; the engine looks for
  the trainer again at once and keeps looking for the rest of the ride. On reconnect it runs §The sequence and sends
  the current command, and the pill and banner return. There is no auto-pause; the rider pauses if they want to.
- **Heart rate choice**: #766's function decides which monitor the ride uses, **15 s after the service starts**
  (sooner if the picked monitor gives a valid reading first). Until then heart rate is null and the pill reads
  "HR · Connecting…".
- **Heart rate lost mid-ride**: the chosen monitor gives no valid reading for **30 s**. The engine then runs #766's
  function again with "found" meaning monitors that gave a valid reading in the last 5 s, the lost one excluded. That
  prefers the picked monitor if it is back, then list order. With the fallback toggle off, or nobody found, the ride
  keeps waiting on the same monitor and switches if it comes back. The ride never switches while its current monitor
  is giving readings, so it does not flap. Each switch is an event (`hr_source`). Heart rate is null in the gap.
- Bluetooth permission revoked mid-ride behaves as trainer lost.

## Pause, skip, intensity and end

- **Pause** stops the clock and the recording (no samples while paused) and sends the flat road, so the next pedal
  stroke does not meet an ERG wall. **Resume** sends the step's target and restarts the clock at the next second.
  Each pause is recorded with its ride-time second and wall-clock duration. A pause of **60 minutes** ends the ride as
  if End were confirmed, with reason `paused_too_long`.
- **Skip step** ends the current step at the current second and starts the next at once; the step-start event's
  reason is `skip`. A second Skip within **1 s** of the last is ignored, so a double tap skips one step. **Skip is
  disabled on the last step** (End is how a ride stops early). Skip works while paused; the ride stays paused.
  Skipping shortens the ride's total.
- **Intensity −/+** (only when `intensityAdjustable`): 1% a tap within **50–130%**, long-press repeats, a button
  disabled at its limit: #767's steps and range, so the detail screen and the ride agree.
- **End** opens a dialog (§Dialogs). The clock keeps running while it is open.
- **Completing the last step** finishes the ride at once (reason `completed`): the recording is closed, the trainer
  released, and the hand-off made (§Hand-off to #769). There is no extra "complete" screen in #768: #769's summary is
  where "Save to Thrive" lives.

## Recording

One folder per ride in the app's private storage, `files/rides/<ride_id>/`, written as the ride goes so a killed
process loses nothing that was flushed. Each line is appended and flushed as it happens; the file is synced to
storage every 10 s and at every pause, end and recovery.

**`meta.json`** (rewritten whole, via a temp file and rename, when its state changes):

```json
{"format":"thrive-spin-ride","v":1,"ride_id":"5f0c2e9a-…","kind":"workout","state":"in_progress",
 "session":{…the RideSession, steps included…},"trainer":{"name":"KICKR CORE 1A2B","address":"…"},
 "created_at_utc":"2026-11-07T15:01:40Z","started_at_utc":"2026-11-07T15:02:11Z",
 "finished_at_utc":null,"end_reason":null,"handed_off":false}
```

`state` is `in_progress`, `finished` or (briefly, before the folder is deleted) `discarded`. `end_reason` is
`completed`, `ended`, `paused_too_long`, `limit` or `interrupted`.

**`samples.csv`**, one row per ride-second, a header first, empty for null:

```
t,epoch_ms,step,power_w,target_w,cadence_rpm,hr_bpm,intensity_pct,trainer
0,1794063731000,0,112,125,84,98,100,1
```

`epoch_ms` is the wall clock at that second (for FIT timestamps); `trainer` is 1 when connected, 0 when lost.

**`events.jsonl`**, one JSON object per line, each with `at_s` (ride time) and `epoch_ms`:

| `type` | Extra fields |
|---|---|
| `step_start` | `step`, `label`, `mode` (`erg`, `resistance`, `slope`, `free`), `reason` (`start`, `time`, `skip`, `end_condition`) |
| `pause`, `resume` | — |
| `intensity` | `pct` |
| `mode_setting` | `level` or `grade` |
| `trainer_lost`, `trainer_back` | — |
| `control` | `op`, `result` (a refusal or timeout) |
| `hr_source` | `address`, `name`, or nulls for none |
| `interrupted` | `gap_s` (§Recovery) |
| `end` | `reason` |

A reader skips a last line that was cut off mid-write. #769 builds the streams file (#765's v1) from these: the four
arrays from the samples, `steps[]` from `step_start` events (each ends where the next starts, the last at the final
sample + 1), `pauses[]` from each `pause`/`resume` pair (`at_s`, and `duration_s` from their `epoch_ms`),
`intensity_pct` as the samples' mean, `elapsed_seconds` from wall clock and `moving_seconds` as the sample count.

## Recovery after the app is killed

The service does not ask Android to restart it. Recovery runs **when the app next opens**, before Library is shown,
for each folder whose `meta.json` says `in_progress`:

- **No samples** (the clock never started): the folder is deleted silently.
- **Last sample under 60 minutes ago**: the ride comes back **paused** at its last sample. The gap is recorded as an
  `interrupted` event and a pause, so ride time does not jump. The service starts, reconnects, and the ride screen
  opens with the banner "The ride stopped at <elapsed> when the app was closed. It's paused." Resume, Skip and End work
  as usual, and the 60-minute pause limit counts from now.
- **Older**: the ride is finished at its last sample with reason `interrupted`, and handed off (§Hand-off to #769).

A finished folder whose `handed_off` is false is handed off on the next app open as well.

## Hand-off to #769

```kotlin
interface RideFinishedHandler { fun onFinished(rideId: String) }   // main thread, app in the foreground
interface RideStore {
    fun list(): List<RideInfo>                       // every folder: id, kind, state, handed_off, started_at
    fun open(rideId: String): RideRecording          // meta, the session, samples and events, read-only
    fun markHandedOff(rideId: String)
    fun delete(rideId: String)
}
```

- The engine calls `onFinished` once for each ride that finishes while the app is in the foreground, and on each app
  open for every finished ride with `handed_off: false` (oldest first, one at a time). The handler marks it.
- **#768 ships a placeholder binding**: a plain screen, title "Ride recorded", the line "<elapsed> · <avg> W avg ·
  <kJ> kJ" (avg over non-null power samples; "—" with none), the line "It's kept on this phone. Saving to Thrive comes
  in a later update." and a filled "Done" that marks it handed off and returns to Library. #769 replaces the binding
  and owns everything after: the summary, FIT and streams, the upload queue and deleting the folder once uploaded.
  #768 never deletes a finished recording.
- `kind` (`workout` or `ramp_test`) lets #769 and #770 route a ramp test to its result screen.
- **For #770**: a first ramp test has no FTP, so its recording has `ftp_w` null, while #765's `saveRide` requires
  `ftp_w`. #769/#770 decide what to send.

## Layout

The ride screen **always uses `SpinColors`' dark scheme**, whatever the system theme: a bike computer is read at
arm's length, often in a dim room, and the prototype draws it dark. Ground `--color-bg`; cards `--color-surface`,
`--radius-lg`, no outline; `--space-md` side margins and `--space-sm` between cards. Numbers use tabular figures.
The content scrolls vertically when it does not fit (small phones, large font scale); the control row stays pinned at
the bottom. Rotation and process recreation keep everything: state lives in the service.

```
[● KICKR · ERG] [● HR · HRM-Pro]                 [End]
[ banner, when any ]
┌ Sweet spot · 2 of 3                 32:15 / 1:14:00 ┐
│ 8:42                                  left in step   │
│ ▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░                               │
└──────────────────────────────────────────────────────┘
┌ TARGET           ┐ ┌ POWER 3S         ┐
│ 225              │ │ 228              │  (ring + number in the band's colour)
│ watts · 90% FTP  │ │ On target        │
└──────────────────┘ └──────────────────┘
[CADENCE 91 rpm · target 90] [HEART RATE 151 bpm] [STEP AVG 226 W · 612 kJ total]
┌ profile, past shaded, cursor ───────────────────────┐
│ Next                         Recover · 4:00 · 138 W │
└──────────────────────────────────────────────────────┘
[ Trainer   [−] Level 30 [+] ]        (Resistance/Slope only)
[ INTENSITY [−] 100% [+] ] [   Pause   ] [ Skip step ]
```

**Top row**

- Two pills (`--radius-full`, `--color-surface`, `--text-xs` semibold `--color-text-secondary`, a dot before the
  text):
  - Trainer: "<trainer name> · <what it is doing>" where the second part is "ERG", "Level 30", "Slope 2.0%", "Free",
    or "Guide" when the current command is not being applied (no control, unsupported, refused). Dot
    `--color-success` when connected; while lost the pill reads "Reconnecting…" with a `--color-warning` dot. A long
    trainer name is cut with an ellipsis.
  - Heart rate: "HR · <monitor name>" (dot `--color-success`), "HR · Connecting…" (before the choice), "HR · No
    reading" (the chosen one has no valid reading; dot `--color-warning`), or "No heart rate" (no monitor, or none
    found; no dot, `--color-text-muted`).
- "End" at the right: a button `--tap-target` tall, `--color-surface`, `--radius-md`, text `--color-danger-text`
  bold. Reads "Cancel" before the clock starts.

**Banner** (one at a time, under the top row, `--radius-lg`, `--color-warning-light` ground, `--color-text`,
`--text-sm`), in this priority: interrupted (§Recovery; until Resume), "Lost the trainer. Reconnecting… The clock
keeps running." (or "Bluetooth is off. Turn it on to reconnect." with a "Turn on" text button), then the refusals
from §Refusals. A banner goes as soon as its cause does.

**Step card**

- Line 1: the step's label, with " · <position>" in a repeat (`--text-sm` bold, `--color-text`), and at the right
  "<elapsed> / <total>" (`--text-sm`, `--color-text-secondary`). Elapsed is ride time; total is ride time plus what is
  left of this step plus every later step, so it shrinks on a skip. Durations are `m:ss` under an hour, else
  `h:mm:ss`.
- Line 2: the time left in the step, `--lift-clock-size`, bold, `--color-text`, and "left in step" (`--text-sm`,
  `--color-text-secondary`), or the getting-ready status line. While paused, the time left is `--color-text-secondary`
  and the label reads "Paused".
- A progress bar under it, `--space-xs` tall, `--radius-full`, track `--color-border`, fill the step's zone colour
  (`--zone-1`…`--zone-6` by #767's rule at the current second's scaled %, `--color-border-strong` for non-erg steps),
  growing with time into the step.

**Target and Power 3s**, two equal cards:

- Target, erg step: eyebrow "TARGET" (`--text-xs` bold, `--color-text-secondary`), the watts at `--figure-xl` bold in
  `--color-primary-text`, and "watts · <n>% FTP" (`--text-sm`, `--color-text-secondary`), n = the scaled % at this
  second, rounded. In Resistance or Slope mode, or when the trainer is not applying it: "watts · <n>% FTP · guide".
  For an absolute target (ramp test), "watts". `Level`: "30" and "resistance level"; `Grade`: "4.5%" and "slope";
  `Free`: "Free" and "no target", all at `--figure-xl` in `--color-text`.
- Power 3s: eyebrow "POWER 3S", the 3 s power at `--figure-xl` bold, and the band's word at `--text-sm` bold:

  | Band | Word | Number, word and a 2dp inner ring |
  |---|---|---|
  | on target | "On target" | `--color-success` |
  | below | "Below target" | `--color-warning` |
  | above | "Above target" | `--zone-5` |
  | no target | "watts" | number `--color-text`, word `--color-text-secondary`, no ring |
  | no reading | "—" and "No power reading" | `--color-text-secondary`, no ring |

**Tiles**, three equal (`--text-xs` bold eyebrow, value at `--figure-md` bold, unit `--text-xs`
`--color-text-secondary`):

- "CADENCE": "<n>", unit "rpm", or "rpm · target 90" when the step has a cadence. "—" with no reading.
- "HEART RATE": "<n>", unit "bpm"; "—" with unit "No reading" or "No monitor".
- "STEP AVG": "<n>", unit "W · <k> kJ total"; "—" before the step's first power sample.

**Profile card**: #767's profile, drawn at the ride's current intensity, at `--spin-profile-ride` height, with the
zone colours from the dark scheme. The part before the cursor is covered by `--color-overlay`; the cursor is a
`--space-xs`-wide bar in `--color-text`, `--radius-sm`, slightly taller than the chart. Its position is the planned
position: the start of the current step plus the seconds into it (after a skip it jumps to the next step's start).
No FTP line on the ride. Below: "Next" (`--text-sm`, `--color-text-secondary`) and at the right "<label> · <m:ss> ·
<target>" (`--text-sm` bold), target in #767's wording but in scaled watts ("138 W", "125–175 W", "Resistance 30",
"Slope 4.5%", "Free"); on the last step, "Finish".

**Trainer row** (Resistance or Slope mode, during an erg step only): a card, "Trainer" (`--text-sm`,
`--color-text-secondary`) and a stepper "−" (content description "Lower level" / "Less slope"), the value
("Level 30" / "Slope 2.0%", `--text-lg` bold), "+" ("Higher level" / "More slope").

**Control row**, pinned, three columns 1 : 1.3 : 1, each `--spin-ride-button` tall, `--radius-lg`:

- Intensity (`--color-surface`): "INTENSITY" eyebrow, "−" (content description "Easier"), the value `--text-lg` bold
  (`--color-text` at 100%, `--color-primary-text` below, `--color-warning` above, #767's rule), "+" ("Harder").
  When `intensityAdjustable` is false the column holds nothing and the other two share the row.
- Pause / Resume: filled `--color-primary-fill`, `--color-on-fill` text, `--text-lg` bold, "Pause" or "Resume".
- Skip step: `--color-surface`, `--color-text`, `--text-base` bold, "Skip step".
- Disabled buttons are drawn at `--opacity-disabled` and announce as disabled.

**Screen on**: while the ride screen is visible and a ride is getting ready, running or paused, the screen stays on
(`FLAG_KEEP_SCREEN_ON`). The power button still turns it off; the ride carries on in the service.

**Back**: the system back gesture does not leave a ride: it shows the snackbar "The ride keeps going. Use End to
stop." Home or the app switcher leaves the app with the ride running.

## Dialogs

- **End** (clock running or paused): title "End the ride?", body "You've ridden <elapsed>. <left> of the workout is
  left." (body "You've ridden <elapsed>." on the last step or an open-ended one), buttons "End ride" (filled) and
  "Keep riding", and below them a text button "Discard ride" in `--color-danger-text`.
- **Discard ride** opens a second dialog: "Discard this ride?" / "Nothing from it is saved, here or in Thrive." with
  "Discard ride" (`--color-danger-text`, bold) and "Keep it". Discarding releases the trainer, deletes the folder, and
  returns to the workout detail (Library for a recovered ride).
- "End ride" finishes the ride with reason `ended` and hands it off.

## Foreground service and notification

- `RideService` runs in the foreground with type `connectedDevice` from the moment the ride starts getting ready
  until it is released. The manifest declares `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_CONNECTED_DEVICE`,
  `POST_NOTIFICATIONS` and `WAKE_LOCK`.
- It holds a **partial wake lock** for the same span, with a 13 h timeout as a backstop (12 h of ride time, plus the
  60-minute pause limit).
- **Notification**: channel "Ride in progress" (id `ride`, importance low: no sound, no vibration), ongoing, not
  dismissible, small icon the app's mark, tapping it opens the ride screen. Title: the ride's name. Text, updated
  once a second with `setOnlyAlertOnce`:

  | Phase | Text |
  |---|---|
  | getting ready | "Connecting to the trainer…" or "Pedal to start" |
  | running | "<label> · <m:ss> left · <target>" (target "225 W", "Level 30", "Slope 4.5%", "Free") |
  | trainer lost | "Lost the trainer · reconnecting" |
  | paused | "Paused at <elapsed>" |

  One action, "Pause" or "Resume", absent while getting ready. There is no End in the notification: ending needs the
  confirm.

## Edge cases

- **The trainer is in use by another app**: it does not advertise; getting ready stays at "Can't find…".
- **The trainer connects but refuses control for the whole ride**: the ride runs and records, every target a guide.
- **A ramp during a disconnect**: the target keeps moving in the samples; on reconnect the current value is sent.
- **Intensity at its limit**: the button is disabled; long-press stops there.
- **Rapid −/+**: each tap is one change and one event; the trainer gets only the newest value (no backlog).
- **A step shorter than the 1 s skip guard**: allowed; the guard only blocks taps, not time.
- **Skip on the last step**: disabled. **Skip while paused**: next step, still paused, no command until Resume.
- **Phone call or another app over the ride**: the ride carries on in the service.
- **Low storage**: a write failure ends the ride with reason `ended` at the last sample written, and the screen shows
  "The phone ran out of space. The ride was ended at <elapsed>." before the hand-off.
- **A second Start from the notification shade or a launcher shortcut**: lands on the active ride (§Starting).
- **Notification permission denied**: the ride runs; there is no notification to see.

## Copy

"Add your trainer in Devices first.", "A ride is already going. End it first.", "Connecting to <trainer name>…",
"Can't find <trainer name>. Pedal to wake it, and close other apps connected to it.", "Bluetooth is off.", "Turn on",
"Pedal to start", "Cancel", "End", "End the ride?", "You've ridden <elapsed>. <left> of the workout is left.",
"You've ridden <elapsed>.", "End ride", "Keep riding", "Discard ride", "Discard this ride?",
"Nothing from it is saved, here or in Thrive.", "Keep it", "Reconnecting…", "HR · <name>", "HR · Connecting…",
"HR · No reading", "No heart rate", "ERG", "Level <n>", "Slope <n.n>%", "Free", "Guide",
"Lost the trainer. Reconnecting… The clock keeps running.", "Bluetooth is off. Turn it on to reconnect.",
"The trainer isn't taking commands. Close other apps connected to it. Targets are a guide until it does.",
"Your trainer can't hold a power target. Targets are a guide.",
"Your trainer can't set a resistance level. Ride it by feel.", "Your trainer can't simulate a slope. Ride it by feel.",
"The trainer refused that target. It's a guide for now.",
"The ride stopped at <elapsed> when the app was closed. It's paused.", "Paused", "left in step", "TARGET",
"watts · <n>% FTP", "watts · <n>% FTP · guide", "watts", "resistance level", "slope", "no target", "POWER 3S",
"On target", "Below target", "Above target", "No power reading", "CADENCE", "rpm", "rpm · target <n>", "HEART RATE",
"bpm", "No reading", "No monitor", "STEP AVG", "W · <k> kJ total", "Next", "Finish", "Trainer", "Lower level",
"Higher level", "Less slope", "More slope", "INTENSITY", "Easier", "Harder", "Pause", "Resume", "Skip step",
"The ride keeps going. Use End to stop.", "The phone ran out of space. The ride was ended at <elapsed>.",
"Ride in progress", "Connecting to the trainer…", "<label> · <m:ss> left · <target>",
"Lost the trainer · reconnecting", "Paused at <elapsed>", "Ride recorded", "<elapsed> · <avg> W avg · <kJ> kJ",
"It's kept on this phone. Saving to Thrive comes in a later update.", "Done".

## Accessibility

- Every control is at least `--tap-target`; the control row is larger (`--spin-ride-button`) because it is pressed
  mid-effort.
- The band is never colour alone: the word ("On target", "Below target", "Above target") is always drawn.
- Power 3s and the countdown are not live regions (they change every second). A **step change** is announced
  politely: "<label>, <m:ss>, <target>". A banner appearing is announced politely. The pills read as text.
- Contrast on the dark scheme, measured with the WCAG formula against `--color-surface` `#1a1a1e` (the tighter of the
  two grounds): `--color-text-secondary` 6.57, `--color-text-muted` 5.23, `--color-success` 7.34, `--color-warning`
  10.02, `--zone-5` dark 7.13, `--color-primary-text` 6.22, `--color-danger-text` 5.85; `--color-on-fill` on
  `--color-primary-fill` 6.72. All pass 4.5:1.

## New tokens

Sizes, in Spin's theme module beside #766's and #767's (Android only, not CSS). Colours: none; the ride uses the
dark values of existing tokens, `--zone-*` included. `--lift-clock-size` and `--figure-xl`/`--figure-md` are Thrive's
existing tokens, mirrored into the theme module under the same names (72sp, 44sp, 28sp).

| Token | Value | For |
|---|---|---|
| `--spin-profile-ride` | 88dp | the profile on the ride screen, smaller than the detail's so the screen fits a phone without scrolling |
| `--spin-ride-button` | 72dp | the ride's control row: Intensity, Pause, Skip, pressed mid-effort |

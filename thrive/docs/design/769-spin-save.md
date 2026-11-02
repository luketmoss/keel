# 769 — Thrive Spin: FIT file, ride summary and upload queue

Part of #764. A finished recording becomes a FIT file, a streams file, a summary screen and a Thrive activity, even
when the phone is offline at the end of the ride. It starts where #768 ends (`RideFinishedHandler.onFinished(rideId)`
and `RideStore`, [768-spin-ride.md](768-spin-ride.md) §Hand-off to #769) and sends through #765's `saveRide`
(contract in #765's body: separate `fit` and `streams` POST fields, SHA-256 hashes, idempotent on the ride id). It
reuses #766's `SpinApi` transport, Settings and `SpinColors`
([766-spin-devices.md](766-spin-devices.md)) and #767's Library ([767-spin-library.md](767-spin-library.md)), which
gains one banner. The prototype artboard is "5 · Saved to Thrive"
(https://claude.ai/artifact/EXun1UbyRcgj1PfnhS7kq2); where it differs from this note, this note wins (§What changed
from the prototype).

Standing documents: `ui/docs/design/keel-wide-rules.md` (offline behaves one way: a write that cannot reach its
backend is queued with the count visible, and is never accepted and then lost; destructive actions confirm in words
and name the thing; blank is not zero; never colour alone) and `ui/docs/design/suite-language.md`. There is none in
`thrive/docs/design/`. Tokens are the suite's, Thrive's and Spin's (#766, #767, #768), mirrored into `SpinColors` and
Spin's theme module by #766's rule (`--space-*`/`--radius-*` in dp, `--text-*`/`--figure-*` in sp). The summary
follows the system light or dark theme, like Library and Devices (only the ride screen is always dark).

## The parts

| Part | Where | Tested |
|---|---|---|
| **Metrics**: avg power, NP, IF, TSS, kJ, HR and cadence figures, per-step compliance | `core/summary/`, plain Kotlin over `RideRecording` | JVM |
| **Streams file**: #765's `thrive-spin-streams` v1 from the recording | `core/summary/StreamsBuilder` | JVM |
| **FIT encoder**: the activity file | `core/fit/`, plain Kotlin, no Android and no SDK | JVM, decoded by the Garmin FIT SDK (test-only dependency) |
| **Upload state and queue**: `upload.json`, the payload, the answer table, backoff, deletion | `core/upload/` | JVM, against a fake transport and a temp directory |
| **Worker**: `UploadWorker` (WorkManager) calling the queue | `upload/` | waived on the phone |
| **Summary screen**, **Library banner** | `summary/RideSummaryScreen`, `summary/PendingRidesBanner` | state model JVM, drawing waived |

Every decision below that is not a pixel lives in `core/`. The worker and screens stay thin.

## Hand-off from #768, and what the handler does

#769 replaces #768's placeholder binding of `RideFinishedHandler`; nothing in #768's engine, recording or recovery
changes.

- `onFinished(rideId)` with `kind = workout`: open the summary for that ride and call `RideStore.markHandedOff`
  at once. From then on the ride is the summary's, not the hand-off's: an unsaved ride is **not** re-presented on every
  app open (#768's re-presenting rule is for rides nobody has seen yet). It stays findable through the Library banner
  (§Finding a ride again).
- `kind = ramp_test`: not handled here. #770 registers its own route and its result screen; until it does none can
  exist, because #768 ships no ramp test. The handler leaves such a ride untouched (`handed_off` stays false).
- Several finished, un-handed-off rides at app open (#768's "oldest first, one at a time"): the summaries chain, and
  "Done" or "Later" on one opens the next.
- #769 adds one file to a ride's folder beside #768's three: `upload.json` (§Upload state), plus `ride.fit` and
  `streams.json` once built. #768 never deletes a finished recording; **#769 does, once Thrive has the ride**
  (§When a ride leaves the phone).

## Metrics

All figures come from the recording's per-second samples. A sample's `power_w`, `cadence_rpm` and `hr_bpm` are whole
numbers or **null** (no reading), and **null is never counted as zero**: it is left out of every mean and sum.
A real 0 W (coasting) is a reading and counts. `N` is the number of samples (= `moving_seconds`, #768).
"Round" is half up.

| Figure | Definition |
|---|---|
| `avg_power_w` | mean of the non-null `power_w`, rounded. Zeros included. |
| **Normalized power** (`np_w`) | For each second `t ≥ 29`, the mean of the non-null `power_w` in samples `t−29 … t` (a 30 s rolling window), kept only when the window holds at least 15 non-null values. NP is the fourth root of the mean of the fourth powers of the kept windows, rounded. With no kept window (a ride under 30 s, or one with long gaps) NP is the average power. Pauses are not in the series, so the window runs across one. |
| `ftp_w` | The FTP the ride is scored against: the `ftpW` passed to `prepare` (§FTP and the ramp test), else the recording's `session.ftpW`. Outside 50–1000 or null counts as none. |
| **Intensity factor** (`intensity_factor`) | unrounded NP ÷ `ftp_w`, shown and sent to 2 decimals. Blank with no FTP. |
| **TSS** (`tss`) | `N × NP × IF ÷ (ftp_w × 3600) × 100` from the unrounded NP and IF, rounded. Blank with no FTP. Worked: 3600 s, NP 215, FTP 250 gives IF 0.86 and TSS 74 (73.96). |
| `work_kj` | the sum of the non-null `power_w` in joules (1 W for 1 s = 1 J) ÷ 1000, rounded. The ride screen's running total is rounded down (#768), so the last figure seen there can be 1 kJ under this one. |
| `avg_hr` | mean of the non-null `hr_bpm`, rounded; null with none. Max HR is the largest, for the summary and the FIT file only. |
| Cadence tile | mean of the non-null, **non-zero** `cadence_rpm`, rounded: coasting is not pedalling. Blank with none. (Average power includes zeros; average cadence does not. Both are the usual head-unit conventions.) |
| `intensity_pct` | mean of the samples' `intensity_pct`, rounded (#768: this is the time-weighted mean). |
| `moving_seconds` / `elapsed_seconds` | `N`, and `N` plus the sum of the pauses' `duration_s` (§Pauses). |
| `calories`, `distance_m` | **null.** Spin measures work, not energy burned, and it records no speed. The COROS watch has calories and heart rate, and #773 fills a blank from it. Sending kJ as calories would block that. |

Worked pins for the tests: a series of 30 samples at 100 W then 30 at 300 W has average 200 W and NP 223 W (223.07);
3600 samples at 200 W have NP 200 W.

### Per-step compliance ("Intervals")

One row per ride step that had an **erg target**, in ride order. A step is one `step_start` event to the next (the last
to `N`), so a skipped step is as long as it was ridden, and a step of zero seconds is not a row. Steps with no
`target_w` anywhere (`resistance`, `slope` and `free` steps) have no row; with no rows at all the section is not drawn.

- **Target** = mean of the step's non-null `target_w` (the target *after* intensity, as ridden). Shown as one number
  when the step's lowest and highest target are equal, else as "low–high W" (a ramp or stairs); compliance uses the mean.
- **Average** = mean of the step's `power_w` over the seconds where both `power_w` and `target_w` are non-null.
- **Compliance %** = average ÷ target × 100, rounded.
- **Band** from the *rounded* percent, so the word never disagrees with the number: 95–105 "On target", under 95
  "Below target", over 105 "Above target". (The ride screen's live band is on 3 s power at ±5 % of the watts; this is
  on a step's mean, the same ±5 %.)
- Fewer than **10** such seconds: the percent is "—" with the words "Too short", the row still shows its target.
- The row's name is the step's label, with " · <position>" for a step in a repeat ("Sweet spot · 2 of 3"), read from
  `session.steps[step].position` (the streams file does not carry it).

## The streams file

Built exactly as #768's note says (§Recording, last paragraph) into #765's `thrive-spin-streams` v1:

- `ride_id`, `started_at_utc` (whole seconds, `Z`), `interval_s` 1, `ftp_w` and `intensity_pct` as above.
- The four arrays from the samples: `power_w`, `target_w`, `hr_bpm`, `cadence_rpm`, all of length `N`, null for blank.
- `steps[]` from the `step_start` events: `{start_s, end_s, label, mode}`, each ending where the next starts and the last
  at `N`. A step whose start equals its end is dropped. `label` is cut to 40 characters (the steps schema's limit).
- `pauses[]` (§Pauses).
- Written as compact JSON text (no spaces) in UTF-8. `streams_sha256` is the lowercase hex SHA-256 of **those bytes**,
  and the same string is the POST's `streams` field.
- With `ftp_w` none the file cannot be built (`ftp_w` is a required number in #765's payload); the ride is not savable
  yet (§FTP and the ramp test).

### Pauses

`pause`/`resume` events pair up in order. A pair's `duration_s` is `round((resume.epoch_ms − pause.epoch_ms) ÷ 1000)`
and its `at_s` is the pause event's ride time. A pair that rounds to under 1 s is dropped everywhere (streams, FIT,
elapsed). A trailing `pause` with no `resume` (the ride was ended or interrupted while paused) is ignored: the ride
ends at its last sample. #768's recovery writes an `interrupted` gap as a pause, so it is a pause here too.

## The FIT file

**Decision: a small hand-written encoder in `core/fit/`, not the Garmin FIT SDK for Java.** The SDK's encoder brings
its whole generated profile (messages and enums for every device Garmin makes, well over a megabyte) into an app
that needs six messages, and into R8's keep rules. The risk of writing it ourselves is writing a file nobody can
read, so the Garmin SDK is a **`testImplementation`** dependency: the tests decode what the encoder wrote with
Garmin's own decoder and check it message by message. Its version lives in the catalog like every other
(stack-android). If the artifact cannot be resolved, the tests use a minimal reader written from the FIT protocol's
definition-record and CRC rules, and the criteria read "decoded by an independent reader".

### File structure

Protocol 2.0, a 14-byte header with its CRC, then definition and data records, then the file CRC; little-endian;
`.FIT` at bytes 8–11 (also what `saveRide` checks). Each message is written as a definition record then its data
records, local message types reused. **A value that is null is written as the field's FIT invalid value** (all `FF` for
the field's width), never 0. Field numbers and scales come from the SDK profile the tests decode with (training stress
score ×10, intensity factor ×1000, times ×1000 seconds); the note names fields, not numbers.

### Timestamps

FIT time is seconds since 1989-12-31 00:00:00 UTC.

- **A record's timestamp = `started_at_utc` + `t` + the pauses that ended at or before it**, not the sample's own
  `epoch_ms`. Samples are one per ride-second by construction, so timestamps rise by exactly 1 s within a running
  stretch and jump by the pause's duration across a pause; two late-tick samples can never share a second.
- A pause's `timer` stop event is stamped one second after the last record before it; its start event is stamped
  `duration_s` later, which is also the next record's stamp. The ride's final stop is one second after the last record.

### Messages, in file order

| Message | Fields written |
|---|---|
| **file_id** | type activity, manufacturer development (a Garmin-reserved id for software that has none of its own), product name "Thrive Spin", time created = the first stamp |
| **device_info** ×1–3 | device index 0, the phone (source local, product name "Thrive Spin", software version = the app's version name); the trainer from `meta.json` (source Bluetooth low energy, product name = its saved name); the heart rate monitor named in the last non-null `hr_source` event, if any (source Bluetooth low energy). All stamped at the first stamp. |
| **event** `timer` start | at the first stamp |
| **record**, one per sample | timestamp, power (W), cadence (rpm), heart rate (bpm); invalid when null. No distance, speed or position: Spin records none, and blank is not zero. |
| **event** `timer` stop-all / start | around each pause (§Pauses) |
| **lap**, one per ride step (the same step boundaries as the streams file), written after the step's records | timestamp, start time, total elapsed and timer time, average and max power, average and max heart rate, average cadence; trigger `manual` for a skipped step, `time` for one that ran out, `session_end` for the last. The laps are what lets other tools show the intervals. |
| **event** `timer` stop-all | one second after the last record |
| **session** | sport cycling, sub-sport indoor cycling, start time, total elapsed time (`elapsed_seconds`) and timer time (`N`), average and max power, normalized power, TSS, intensity factor and threshold power (the ride's FTP; each omitted when no FTP), total work (J), average and max heart rate, average cadence, number of laps. No calories, no distance. |
| **activity** | timestamp, total timer time, one session, type manual, event `activity` stop, local timestamp (the phone's zone offset at the start) |

A ride is `N ≥ 1` samples, so every file has at least one record. Size, from the arithmetic: a record is 9 bytes (1
header, 4 timestamp, 2 power, 1 cadence, 1 heart rate), so the 12-hour cap (43 200 samples) is 388 800 bytes of
records plus a few hundred of everything else, under `saveRide`'s 5 MB with room for 50 times more messages. The
streams text at the same cap, with every value four digits, is about 864 000 characters, under the 4 MB limit. A
one-hour ride is about 32 KB of FIT. These are computed, not measured from a file: the encoder does not exist yet,
and the test below pins both limits on a 43 200-sample ride.

## Upload state, the payload and the queue

### What is sent, and when: effort and notes are fixed at Save

`saveRide` is idempotent on the ride id: a repeat writes nothing, whatever else the payload says (#765), and the Spin
key has no action that edits a saved ride. **So effort and notes can only travel in the one `saveRide` that succeeds.**
That decides the flow:

1. The summary opens and **prepares** the ride (metrics, `ride.fit`, `streams.json`). Nothing is sent.
2. The person picks an effort (optional) and types notes (optional). Both are saved to `upload.json` as they change,
   so leaving the screen or the process dying keeps them.
3. **"Save to Thrive"** freezes the payload and queues the ride. From here the effort and notes are read-only and
   the files and payload never change, so every retry sends the same bytes.
4. After the ride is in Thrive, effort and notes are edited **in Thrive**.

Why not send at once with a blank effort and notes: the prototype's summary would then be asking for fields that
can never be sent. Why not send automatically after a delay: a ride would reach Thrive with a guessed-at blank. The
cost is a tap; the banner (§Finding a ride again) keeps an unsaved ride from being forgotten.

### `upload.json` (rewritten whole through a temp file and rename, like `meta.json`)

```json
{"v":1,"state":"draft","effort":"","notes":"","ftp_w":250,
 "payload":null,"fit_sha256":"…","streams_sha256":"…",
 "saved_at_utc":null,"attempts":0,"server_errors":0,"last_try_utc":null,
 "message":null,"answer":null}
```

`state` is one of:

| State | Meaning | Leaves it |
|---|---|---|
| `draft` | prepared, not yet saved | Save → `queued`; Discard deletes the folder |
| `queued` | waiting to send, or sending now | success → `sent`; `bad_request` → `rejected`; key refused → `needs_key`; blank URL or key → `needs_setup`; the 10th consecutive server error → `stuck` |
| `needs_key`, `needs_setup` | cannot send until Settings is fixed | saving Settings → `queued` |
| `stuck` | Thrive keeps answering with an error | "Try again" → `queued`, counters reset |
| `rejected` | Thrive refused the ride (`bad_request`); never retried by itself | "Try again" → rebuilt, `queued`; Delete removes it |
| `sent` | Thrive has it; the folder is about to be deleted | deleted |

`payload` is #765's object, built once at Save: `ride_id`, `started_at_utc`, `name` (the session's name),
`ride_workout_id` (the session's `workoutId`, `''` for none), `elapsed_seconds`, `moving_seconds`, `avg_hr`,
`calories` (null), `distance_m` (null), `avg_power_w`, `np_w`, `intensity_factor`, `tss`, `work_kj`, `ftp_w`,
`intensity_pct`, `effort` (`Easy`, `Medium`, `Hard` or `''`), `notes`, `fit_sha256`, `streams_sha256`. Notes are at
most **1000 characters**, so the payload stays well inside the 6000-character cap even when every character needs
escaping. The request is `action=saveRide` plus #765's four form fields `key`, `payload`, `fit` (standard base64, no
line breaks) and `streams`. The key is in the body, never the URL, and never logged (#766).

### The queue

`RideUploader` runs the rides whose state is `queued`, **oldest `saved_at_utc` first**, one at a time.

- `UploadWorker` is WorkManager unique work (`spin-upload`, appended, not replaced), constrained to a connected
  network, with exponential backoff from 30 s (Sip's setting; WorkManager caps it at 5 h). It is nudged on Save, on
  app open when anything is `queued`, after Settings is saved, and by the two buttons "Send now" and "Try again".
- The call has a 60 s timeout, not Sip's short one: the API writes two Drive files before it answers.
- **A network failure** (no network, a timeout, a non-2xx, a body that is not the envelope) leaves the ride `queued`,
  adds 1 to `attempts`, records `last_try_utc`, and stops the run with WorkManager's retry. It never counts toward
  "stuck": being offline is normal, and a timeout is safe to repeat because the repeat answers `exists`.
- **A server answer that is not a success and not a refusal** (`success: false` with any other code, such as
  `Lock timeout`) counts in `server_errors`, retries on the same backoff, and moves on to the next ride. The 10th in a
  row makes the ride `stuck`: it stops retrying by itself and waits for "Try again". Any other outcome resets the count.
- **A refusal of the key** (the text "Invalid or missing API key", or a code ending `_forbidden`, #766's test) sets
  `needs_key`, and the run stops, because every other ride would be refused the same way. No attempt is spent.
- **`bad_request`** sets `rejected` with the server's `error` text as `message`, **never retries** (the worker does not
  call the API for a `rejected` ride again, however many times it runs), and goes on to the next ride. The recording,
  FIT and streams stay on the phone. It can only be re-sent by the person (§Answers).
- **No URL or no key in Settings**: `needs_setup`, with no call made.
- **Success** is `success: true`, whatever `status` says. The queue does not branch on `status` to decide anything but
  the wording: `created`, `claimed` (#765), `exists` and `merged` (#773) are all done, and so is a status the app has
  never heard of (it reads "Saved to Thrive").

### When a ride leaves the phone

On any success: write `upload.json` as `sent` with the answer, then `RideStore.delete(rideId)`. A process that dies in
between finds `sent` on the next run and deletes without calling again. This is the **only** way a finished ride is
deleted without the person asking: not on age, not after a number of failures, not for being rejected. A ride that
cannot be sent stays until it is sent or the person deletes it, as with Sip's queue. The recording is not needed once
Thrive has the FIT and streams files, and `exists` means exactly that.

### Answers: what the person sees

| Server answer | State | Status card | Extra line |
|---|---|---|---|
| `success`, `created` | `sent` | "In Thrive" · "Saved to Thrive", "New activity · bike · indoor" | — |
| `success`, `claimed` | `sent` | same, "Completed your planned ride" | — |
| `success`, `exists` | `sent` | same, "Already in Thrive" | — |
| `success`, `merged` | `sent` | same, "Joined your COROS recording" | — |
| `success`, unknown status | `sent` | same, no note | — |
| `success` with `ambiguous_plans` (a non-empty list) | `sent` | as the status above | "More than one bike workout was planned that day, so Thrive didn't match this ride to a plan. You can match it in Thrive." |
| `success` with `ambiguous_coros` (#773) | `sent` | as the status above | "Your watch recorded a ride at about the same time. Thrive kept both, so check Activities for a duplicate." |
| `bad_request` | `rejected` | "Thrive refused this ride" · "Not saved to Thrive", the server's text | "It wasn't sent again. It's still on this phone." and buttons "Try again" and "Delete from phone" |
| key refused | `needs_key` | "Saved on phone, not yet in Thrive" · "Key rejected" | "Check the key in Settings." and "Open settings" |
| no URL or key | `needs_setup` | same · "Spin isn't set up" | "Add the API URL and key in Settings." and "Open settings" |
| network failure | `queued` | "Saved on phone, not yet in Thrive" · "Waiting to send to Thrive", "sends when online" | "Last try <time>. It sends by itself when there's a connection." and "Send now" |
| other server error | `queued` | same · "Waiting to send to Thrive", "Thrive answered with an error · trying again" | same |
| 10th server error in a row | `stuck` | same · "Thrive keeps answering with an error" | "It stopped trying." and "Try again" |

Both extra lines for `ambiguous_*` are shown on the summary only while the person is on it: the ride is already in
Thrive and the folder is gone, so there is nothing to bring them back to. "Try again" on a `rejected` ride rebuilds
`ride.fit`, `streams.json` and the payload from the recording with the effort and notes as they now stand (they are
editable again while `rejected`, in case the refusal named one), resets the counters and queues it. It is a tap, so it
cannot loop.

`<time>` is "h:mm a" today, else "MMM d".

## FTP and the ramp test (#770's dependency)

`saveRide` requires `ftp_w`, and a first ramp test has no FTP (#768's open item). #770 owns the test and its result.
#769 only makes the hole fillable and does not guess:

```kotlin
interface RideUploads {
    fun prepare(rideId: String, ftpW: Int? = null): Preparation  // metrics, ride.fit, streams.json; re-callable until saved
    fun save(rideId: String, effort: Effort?, notes: String)     // freezes the payload and queues
    fun state(rideId: String): StateFlow<UploadState>
}
```

- `ftpW` passed to `prepare` wins over the recording's `session.ftpW`. It is what the ride is scored against (IF, TSS,
  the FIT's threshold power, the streams file's and the payload's `ftp_w`). #770's result screen can call `prepare`
  again with the owner's adjusted figure before it calls `save`.
- With no FTP from either, `prepare` still returns the metrics that need none, IF and TSS are blank ("—"), and **the
  ride is not savable**: the summary's Save is disabled with "Set your FTP first. Thrive needs it to score the ride."
  A workout ride can never be in that state (a `RideRequest` always carries `ftpW`); only #770's can, and its screen,
  not this one, is where it is resolved.
- #769 does not decide what FTP a ramp test is scored against, whether it sends the ride before or after the
  `FtpHistory` row (#765's `addFtp` takes the test ride's id), or what its summary looks like. Those are #770's.

## Finding a ride again

There is no list of rides on the phone (#768, #767: finished rides are in Thrive's Activities). The one way back to a
ride that is not finished with is a **banner at the top of Library**, under its title and above its search, drawn by a
`PendingRidesBanner` slot that #767's Library gains (nothing else of Library changes). It counts the rides whose
`upload.json` state is not `sent`, and shows the line for the **most urgent** state among them, with that state's count:

| Most urgent state present | Banner | Button | Ground |
|---|---|---|---|
| `rejected`, `needs_key`, `needs_setup`, `stuck` | "1 ride couldn't be saved to Thrive" / "<n> rides couldn't be saved to Thrive" | "Details" | `--color-warning-light` |
| `draft` | "1 ride isn't saved to Thrive yet" / "<n> rides aren't saved to Thrive yet" | "Review" | `--color-surface` with a 1dp `--color-border-light` outline |
| `queued` | "1 ride is waiting to send to Thrive" / "<n> rides are waiting to send to Thrive" | "Details" | same as `draft` |

The text is `--color-text`, `--text-sm`; the button `--color-primary-text`, bold, `--tap-target` tall; the card
`--radius-lg`, `--space-md` inside. Tapping anywhere on it opens the **oldest ride in that state** on its summary.
Nothing is shown with no such rides. A ride shows on the banner from the moment its summary first opens. No
notification is raised for any state: the owner has waived notifications' checking, and a missed upload shows here.

## The summary screen

A full screen with no bottom bar, opened by the handler or the banner, in the system theme. It scrolls vertically; the
footer is pinned. Ground `--color-bg`; cards `--color-surface`, 1dp `--color-border-light`, `--radius-lg`;
`--space-md` side margins, `--space-md` between cards.

```
‹                                                (top bar: "Back" arrow, same as Later/Done)
RIDE COMPLETE · SAT 7 NOV, 8:02 AM
Sweet Spot 3×12
[ one line: why it ended early, when it did ]
┌ In Thrive ───────────────────────────────────┐
│ (✓) Recorded on this phone       3,600 samples│
│ (✓) FIT file written                   142 KB │
│ (✓) Saved to Thrive           New activity …  │
│ [extra line, button, when any]                │
└───────────────────────────────────────────────┘
┌ Time ┐ ┌ Avg power ┐ ┌ Norm. power ┐
┌ IF   ┐ ┌ TSS       ┐ ┌ Work        ┐
┌ Avg HR ┐ ┌ Max HR  ┐ ┌ Cadence     ┐
Scored at FTP 250 W · intensity 100%        Paused 0:45 in total
Intervals
Average power against the target you rode, after intensity.
┌ Sweet spot · 1 of 3    225 W   224 W   ✓ 100%  On target ┐
┌ …                                                         ┘
How did it feel?   (Easy)(Medium)(Hard)
Notes [                                  ]
Discard ride
────────────────────────────────────────────
[ Later ]                    [ Save to Thrive ]
```

- **Eyebrow** (`--text-xs` bold, uppercase, `--color-primary-text`): "<phrase> · <date and time>", date and time in the phone's
  zone ("Sat 7 Nov, 8:02 AM"; Thrive files the ride under its own Denver date). Phrases by `end_reason`: "Ride complete"
  (`completed`), "Ride ended" (`ended`), "Ride ended after a long pause" (`paused_too_long`), "Ride reached the limit"
  (`limit`), "Ride interrupted" (`interrupted`). **Title**: the ride's name, `--text-2xl` bold, `--color-text`.
- **Why it ended** (`--text-sm`, `--color-text-secondary`, only when the reason is not `completed` or `ended`):
  `paused_too_long` "It ended after a 60-minute pause."; `limit` "It stopped at the 12-hour limit."; `interrupted` "The
  app was closed during this ride, so it ended at <elapsed>."
- **Status card**: the title line (`--text-sm` bold) and the three steps, each a mark (`--icon-md` circle), a label
  (`--text-sm`) and a note at the right (`--text-xs`, `--color-text-secondary`, cut with an ellipsis). The first two
  are "Recorded on this phone" ("<n> samples") and "FIT file written" ("<n> KB"). Step 3, the card's title and the
  mark come from the state (§Answers, §States). A step that is not done is never drawn as done.

  | Mark | Drawn as | Colours |
  |---|---|---|
  | done | circle filled, a check | `--color-success-fill`, check `--color-on-fill` |
  | waiting or sending | circle outline, an ellipsis | outline `--color-warning`, glyph `--color-text` |
  | problem | circle filled, an exclamation mark | `--color-danger-fill`, glyph `--color-on-fill` |
  | not yet | empty circle outline | `--color-border-strong` |

  Each carries its label, so no mark is colour alone. While sending, a thin indeterminate progress bar
  (`--color-primary`, `--radius-full`) runs under the title.
- **Tiles**: nine, in three columns, each a card (`--radius-md`, `--space-sm` between, `--space-md` inside side padding
  halved to `--space-sm` top and bottom): the label (`--text-xs` semibold, `--color-text-secondary`), the value
  (`--text-xl` bold, `--color-text`, tabular figures) and its unit in the same line (`--text-xs`, secondary). Order
  and units as the prototype: Time `h:mm:ss` (moving time, `m:ss` under an hour), Avg power W, Norm. power W, IF, TSS,
  Work kJ, Avg HR bpm, Max HR bpm, Cadence rpm. A blank figure is "—" with the words "No heart rate" (heart rate
  tiles), "No FTP" (IF, TSS) or "No reading" (power, cadence) as its unit. At a system font scale where a value would
  not fit on one line, the grid is two columns, never a cut value.
- **Under the tiles** (`--text-xs`, `--color-text-secondary`): "Scored at FTP <n> W · intensity <n>%" (without "Scored
  at FTP" when there is none) and, when there were pauses, "Paused <m:ss> in total" at the right.
- **Intervals**: heading "Intervals" (`--text-lg` bold), the caption (`--text-sm`, secondary), then one card of rows, at
  least `--spin-row-height` tall, divided by 1dp `--color-border-light`: the name (`--text-base` bold, wraps to two
  lines), "target <n> W" (`--text-sm`, secondary), the average "<n> W" (`--text-base` bold), and the compliance at the
  right: a band glyph, the percent (`--text-base` bold) and the band's word (`--text-xs`).

  | Band | Glyph and colour | Word |
  |---|---|---|
  | on target | check, `--color-success` | "On target" |
  | below | down triangle, `--color-warning` | "Below target" |
  | above | up triangle, `--zone-5` | "Above target" |
  | too short | none | "Too short" (percent "—") |

  Percent and word are `--color-text`: only the glyph is coloured, and it differs in shape as well as colour, so the
  band survives greyscale. The colours are the ride screen's, so a band means the same thing on both.
- **Effort**: "How did it feel?" (`--text-lg` bold), a radio group with the accessible name "Effort" of three equal
  buttons "Easy", "Medium", "Hard", each `--tap-target` tall, `--radius-md`. Selected: `--color-primary-fill` with
  `--color-on-fill` text, and a check before the word. Not selected: `--color-surface`, 1dp `--color-border`,
  `--color-text`. **None is selected to begin with**, and a ride saved that way sends `''` (blank is not a middle
  value). Tapping the selected one clears it. These are Thrive's three levels, not the prototype's five.
- **Notes**: label "Notes", a multi-line field (2 lines, growing to 6, then it scrolls), `--radius-md`, 1dp
  `--color-border`, placeholder "Legs felt heavy in the last block" in `--color-text-muted`. The 1000-character limit
  stops typing; from 900 a counter "<n> left" shows at the right (`--text-xs`, secondary).
- **Discard ride**: a text button, `--color-danger-text` bold, `--tap-target` tall, in the content (not the footer), shown
  while the state is `draft` only. Its dialog is #768's words with the thing named: title "Discard this ride?", body
  "“<name>”, <date>. Nothing from it is saved, here or in Thrive.", buttons "Discard ride" (`--color-danger-text`, bold)
  and "Keep it". It deletes the folder and goes on to the next summary or Library.
- **Footer**, pinned, `--space-md` padding, a 1dp `--color-border-light` rule above, buttons `--spin-cta-height` tall,
  `--radius-lg`, `--space-sm` apart. Outlined buttons are `--color-surface` with a 1dp `--color-border`, `--color-text`
  bold; filled are `--color-primary-fill` with `--color-on-fill` bold. Disabled buttons are drawn at
  `--opacity-disabled` and announce as disabled.

### States

| State | Footer | Effort and notes |
|---|---|---|
| Preparing (metrics and files not ready) | none; a progress indicator and "Preparing your ride…" instead of the cards | — |
| `draft`, savable | "Later" (outlined), "Save to Thrive" (filled) | editable |
| `draft`, no power at all | "Later", "Save to Thrive" disabled; the status card's step 3 reads "Nothing to save" and an extra line "No power was recorded, so Thrive can't score this ride." | editable but pointless; Discard available |
| `draft`, no FTP (#770's) | as above, Save disabled; extra line "Set your FTP first. Thrive needs it to score the ride." | editable |
| Couldn't prepare (recording unreadable, or the file failed to build) | "Later"; Save is not drawn; the card reads "Couldn't prepare this ride." and the extra line "The recording couldn't be read." | not drawn |
| `queued` (sending, waiting) | "Done", "Open in Thrive" disabled | read-only, with "They go with the ride when it sends." under them |
| `needs_key`, `needs_setup`, `stuck` | "Done", "Open in Thrive" disabled | read-only, as above |
| `rejected` | "Done", "Open in Thrive" disabled | editable again |
| `sent` | "Done", "Open in Thrive" (filled) enabled | read-only, with "Saved with the ride. To change them, edit the ride in Thrive." under them |

- "Save to Thrive" queues the ride and the screen stays, the card moving to "Sending to Thrive…". It is disabled
  from the tap until the state has changed (a rapid second tap queues once; the queue is keyed by the ride id anyway).
- "Later" and the system back gesture leave a `draft` as it is: nothing is lost, and the Library banner now counts it.
  "Done" and back in every other state go on to the next summary or Library. A ride still sending keeps sending: the
  worker does not depend on the screen.
- "Open in Thrive" opens `https://luketmoss.github.io/keel/thrive/#/history/<id>`, where `<id>` is the `id` in
  `saveRide`'s answer (the activity's detail route, `/history/:id`), URL-encoded, in the browser. With no app to open it
  the snackbar reads "Couldn't open Thrive." It is disabled until the answer is in, because there is no id before it. It
  is only on the screen the person is already on: leaving and coming back has no summary to return to.
- **Rotation and process death** keep the screen: the draft's effort and notes are in `upload.json`, and so are the
  state and the answer. The summary is rebuilt from the recording while the folder exists; after `sent` it is not
  (the folder is gone), which is why "Open in Thrive" is not available from anywhere else.
- A state change while the screen is open (the worker finishing, the key being rejected) updates the card in place with
  no screen change; "Send now" and "Try again" show a progress bar until the next answer.
- **Offline at the end of the ride** is not an error and not a screen of its own: the person taps Save, the card reads
  "Saved on phone, not yet in Thrive" with "sends when online", and Done leaves. The upload goes when WorkManager
  sees a connection, whether or not the app is open.

## Edge cases

- **A ride of 1 second**, or one with no power reading at all: there is a summary (the person must be able to discard
  it); an all-null power series cannot be saved (above). A ride of any other length is saved.
- **NP with gaps**: windows with fewer than 15 readings are skipped; a trainer lost for 20 s of a 30 s window drops that
  window rather than counting 20 zeros. Avg power likewise leaves the 20 s out.
- **Pause at the very end** (the ride ended while paused): the trailing pause is ignored; elapsed time stops at the
  last sample.
- **A step skipped in under a second**, or two `step_start` events in one second: the zero-length step is not a lap, not
  in `steps[]` and not a row.
- **`label` over 40 characters** in a recording (it cannot come from #765's steps, which limit it to 40): cut in the
  streams file.
- **The same ride answered twice** (response lost, then retried): `exists`, shown as "Already in Thrive".
- **Two summaries chained** (two finished rides from earlier): one at a time, oldest first.
- **Storage full while preparing**: the file write fails, the state is "Couldn't prepare this ride." and the recording is
  untouched.
- **Settings changed while a ride is queued** (a new URL or key): the next run uses it; saving Settings nudges the
  worker and takes `needs_key`/`needs_setup` rides back to `queued`.
- **App updated between Save and the send**: the frozen payload and files are sent as they are; a newer version never
  re-encodes a queued ride (only "Try again" does).
- **Two devices**: Spin is one phone. A ride id is a UUID made on it, so two phones cannot collide.
- **Clock or zone changes**: the FIT and streams use UTC from the recording; only the summary's heading and the FIT's
  local timestamp use the phone's zone.

## Copy

Summary: "Ride complete", "Ride ended", "Ride ended after a long pause", "Ride reached the limit", "Ride interrupted",
"It ended after a 60-minute pause.", "It stopped at the 12-hour limit.", "The app was closed during this ride, so it
ended at <elapsed>.", "Preparing your ride…", "Couldn't prepare this ride.", "The recording couldn't be read.",
"Not saved to Thrive yet", "Sending to Thrive…", "Saved on phone, not yet in Thrive", "In Thrive", "Thrive refused this
ride", "Recorded on this phone", "<n> samples", "FIT file written", "<n> KB", "Save to Thrive", "Saved to Thrive",
"Waiting to send to Thrive", "sends when online", "Thrive answered with an error · trying again", "Thrive keeps
answering with an error", "It stopped trying.", "Key rejected", "Check the key in Settings.", "Spin isn't set up",
"Add the API URL and key in Settings.", "Open settings", "Not saved to Thrive", "It wasn't sent again. It's still on
this phone.", "Nothing to save", "No power was recorded, so Thrive can't score this ride.", "Set your FTP first. Thrive
needs it to score the ride.", "New activity · bike · indoor", "Completed your planned ride", "Already in Thrive",
"Joined your COROS recording", "More than one bike workout was planned that day, so Thrive didn't match this ride to a
plan. You can match it in Thrive.", "Your watch recorded a ride at about the same time. Thrive kept both, so check
Activities for a duplicate.", "Last try <time>. It sends by itself when there's a connection.", "Send now", "Try again",
"Delete from phone", "Time", "Avg power", "Norm. power", "IF", "TSS", "Work", "Avg HR", "Max HR", "Cadence", "W", "kJ",
"bpm", "rpm", "No heart rate", "No FTP", "No reading", "Scored at FTP <n> W · intensity <n>%", "intensity <n>%",
"Paused <m:ss> in total", "Intervals", "Average power against the target you rode, after intensity.", "target <n> W",
"On target", "Below target", "Above target", "Too short", "How did it feel?", "Effort", "Easy", "Medium", "Hard", "Notes",
"Legs felt heavy in the last block", "<n> left", "They go with the ride when it sends.", "Saved with the ride. To change
them, edit the ride in Thrive.", "Discard ride", "Discard this ride?", "“<name>”, <date>. Nothing from it is saved, here
or in Thrive.", "Keep it", "Delete this ride?", "“<name>”, <date>. Thrive didn't take it, so it only exists on this
phone. Deleting it removes the recording and its FIT file for good.", "Delete ride", "Later", "Done", "Open in Thrive",
"Couldn't open Thrive.".
Library banner: "1 ride couldn't be saved to Thrive", "<n> rides couldn't be saved to Thrive", "1 ride isn't saved to
Thrive yet", "<n> rides aren't saved to Thrive yet", "1 ride is waiting to send to Thrive", "<n> rides are waiting to
send to Thrive", "Review", "Details".

## Accessibility

- Every control is at least `--tap-target`; the footer buttons are `--spin-cta-height`. Icon-only controls (the back
  arrow) have content descriptions ("Back").
- **A band, a mark or a state is never colour alone**: the word is always drawn ("On target", "Below target", "Above
  target", and each step's label), and the marks differ in shape (check, ellipsis, exclamation mark, empty circle).
- A row reads as "<name>, target <n> watts, average <n> watts, <n> percent of target, <band word>", or "…, too short
  to score". A tile reads "<label>, <value> <unit>", or "<label>, no reading". The effort group is a radio group named
  "Effort" ("Easy, selected" / "not selected"). The status card is a polite live region: a state change is announced
  ("Saved to Thrive", "Thrive refused this ride", "Waiting to send to Thrive").
- A dialog's confirming button is a verb phrase naming the thing ("Discard ride", "Delete ride"), and the dialog
  names the ride, as keel-wide-rules require.
- Contrast, measured here with the WCAG formula against the suite's values: light, `--color-text-secondary` 6.05 on
  `--color-surface` and 5.39 on `--color-bg`; `--color-success` 5.13 and `--color-warning` 5.17 on `--color-surface`;
  `--color-danger-text` 6.57; `--color-primary-text` 6.72; `--color-on-fill` on `--color-primary-fill` 4.91;
  `--color-border-strong` 3.83 (the not-yet circle, a graphic, needs 3). `--zone-5` is 3.13 on `--color-surface`: it is
  the above-target **glyph** only, a graphic that needs 3:1, and its word is `--color-text`. Dark, on `--color-surface`:
  `--color-text-secondary` 6.57, `--color-success` 7.34, `--color-warning` 10.02, `--color-danger-text` 5.85,
  `--color-primary-text` 6.22, `--zone-5` 7.13, `--color-on-fill` on `--color-primary-fill` 6.72, `--color-border-strong`
  3.95. All pass for what they are used for. The banner's `--color-warning-light` ground carries `--color-text`
  (the suite's text on its tint), not `--color-warning`: `--color-warning` on `--color-warning-light` is 4.87, which
  would pass but is not needed.

## New tokens

None. Colours are the suite's, Thrive's (`--zone-*`, from #767) and Spin's existing sizes (`--tap-target`,
`--spin-row-height`, `--spin-cta-height` from #766). Nothing here is measured from a running app: the Spin module does
not exist yet, so no criterion asserts a size or a pixel, only the numbers above (arithmetic, contrast).

## What changed from the prototype

- **Effort is Easy, Medium and Hard**, none preselected, not five levels with "Hard" preselected.
- **The summary is where Save lives**, because effort and notes can only travel in the one upload; the prototype showed
  "Saved to Thrive" before the person could have typed them.
- **The compliance badge has a word and a glyph beside its colour**, and uses the ride screen's colours; the
  prototype's was a coloured number only, with a ±3 % band instead of the ±5 % the ride screen uses.
- The sending steps show what each server answer means, not a "Preview: offline" toggle.
- "Open in Thrive" opens the saved activity itself and is disabled until the id is known.

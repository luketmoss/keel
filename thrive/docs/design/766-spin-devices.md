# 766 — Thrive Spin: app shell, Settings and Devices

Part of #764. The first screens of Thrive Spin, the Android trainer app: the `android/spin` module's shell, a
Settings screen for the API URL and Spin key, and the Devices screen from the prototype's "6 · Devices" artboard
(https://claude.ai/artifact/EXun1UbyRcgj1PfnhS7kq2). Nothing here runs a workout or controls the trainer beyond
connecting and spin-down: that is #768. The Library is #767.

No standing document exists in `thrive/docs/design/`. Colours, spacing, radii and type are the suite's
(`ui/tokens/suite.css`) and Thrive's (`frontend/src/global.css`), named below. As in Sip, the app writes each one down
once, in a `SpinColors` theme object in `core/`, light and dark, mirroring the named token's value (Sip's
`SipColors` rule: no inline hex anywhere else). A `--space-*` or `--radius-*` token becomes the same number in dp, and
a `--text-*` token the same number in sp (1rem = 16sp).

## Shell and navigation

- One activity, Compose, Material 3, following the system's light or dark theme. `primary` is `--color-primary`,
  the ground is `--color-bg`, cards are `--color-surface` with a 1dp `--color-border-light` outline and
  `--radius-lg` corners.
- **The app opens on Devices.** It has no bottom bar yet. #767 adds the Library as the start screen and the
  prototype's bar (Library | Build | Rides | Devices); Devices keeps its gear when it does.
- Devices' top bar: the title "Devices" (`--text-2xl`, bold) and, at the right, a gear icon button with the content
  description "Settings" that opens Settings. Settings has a back arrow ("Back") in its top bar, and the system back
  gesture does the same.
- Rotation and process death keep the screen you were on. A scan or spin-down in progress is not resumed: it ends.

## Settings

Sip's settings screen, with Spin's words. Top bar: back arrow and "Settings".

- Fields "API URL" (URI keyboard) and "Key" (masked, with a "Show"/"Hide" text button), then "Test connection"
  (outlined) and "Save" (filled), then one line of result text below them (`--text-base`).
- **Test connection** sends one `getFtp` with the typed values (nothing is saved) and shows one of:

  | Outcome | Text |
  |---|---|
  | `success: true`, `current` set | "Connected — FTP 250 W" |
  | `success: true`, `current` null | "Connected — no FTP set yet" |
  | error "Invalid or missing API key", or any refusal whose `code` ends `_forbidden` (another caller's key, such as Sip's) | "Key rejected" |
  | any other `success: false` | "Thrive answered with an error" |
  | no network, timeout, non-2xx, a body that is not the envelope | "Can't reach the server" |
  | the URL is not http(s) with a host, or has whitespace | "That doesn't look like a URL" |
  | the key is blank | "Enter the key" |

  Both buttons are disabled while a test is running. Editing either field clears the result line.
- **Save** refuses a bad URL with "That doesn't look like a URL" and otherwise stores the trimmed values and shows
  "Saved". A blank key is saved (as Sip does) and is simply not configured.
- Until #765 is deployed with `SPIN_API_KEY` set, the right key tests as "Key rejected": the API does not know it yet.
  Nothing on the Devices screen needs the API.
- The key lives in the app's private storage (`allowBackup="false"`) and is never written to a log, an exception
  message or a notification. It travels in the POST body, never the URL.

## Devices: layout

Top to bottom, `--space-md` side margins, `--space-lg` between sections. Section headings are uppercase,
`--text-xs` bold, `--color-text-secondary`.

```
Devices                                   [⚙]
[ banner: permission or Bluetooth, when needed ]

TRAINER
┌──────────────────────────────────────────┐
│ (icon) Wahoo KICKR          (● Connected) │
│        Trainer · power, cadence, ERG      │
│ [ Spin-down calibration ]   [ Forget ]    │
└──────────────────────────────────────────┘

HEART RATE · USE FOR RIDES
┌──────────────────────────────────────────┐
│ (◉) HRM-Pro:493021        64 bpm    [⋮]   │
│ ( ) TICKR 4A2B            Not found [⋮]   │
│ ( ) COROS PACE 3          No reading [⋮]  │
└──────────────────────────────────────────┘
┌──────────────────────────────────────────┐
│ If it isn't found, use the next one  [✓] │
│ In the order above                        │
└──────────────────────────────────────────┘
Only a strap you're wearing sends a heart rate. The live bpm is how you tell which strap is which.

[ + Add a device ]   (dashed outline)
```

### Trainer card

- Icon tile: `--icon-lg` square, `--radius-md` corners, the trainer glyph (`--icon-md`) in `--color-primary` on `--color-primary-light`.
- **Name** is the name the device advertised, as saved (`--text-base`, bold). A device that advertised no name is
  "Unnamed device (…3A:7F)", the last two bytes of its address.
- **Detail line** (`--text-xs`, `--color-text-secondary`): "Trainer" until the first connection has read its FTMS
  Feature characteristic; then "Trainer · " and the supported items joined with ", ", in this order: "power"
  (power measurement), "cadence" (cadence), "ERG" (power target setting). The features are saved, so the line
  stays after a disconnect.
- **Status pill** at the right (`--radius-full`, `--text-xs` bold), one of:

  | Status | Pill | Colours |
  |---|---|---|
  | connected and notifications on | "● Connected" | `--color-success` dot and text on `--color-success-light` |
  | looking for it, under 10 s | "Connecting…" | `--color-text-secondary` on `--overlay-xs` |
  | not seen for 10 s while looking | "Not found" | `--color-text-secondary` on `--overlay-xs` |
  | Bluetooth off, or no permission | "—" | `--color-text-muted` |

- **Buttons**, two equal columns, `--tap-target` tall, `--radius-md`, outlined in `--color-border`:
  - "Spin-down calibration", `--color-primary-text`. Shown only when the saved features say the trainer supports
    spin-down control. Enabled only while the pill says Connected. When the trainer does not support it, the
    button is not drawn and the left column holds "Calibrates itself" in `--color-text-muted`, `--text-sm`.
  - "Forget", `--color-text`. Always enabled. It disconnects and removes the trainer at once, with no confirm: the
    way back is to add it again.
- **Empty**: no trainer saved. The card holds "No trainer yet" (`--text-base`, bold) and "Add your KICKR with
  + Add a device." (`--text-sm`, `--color-text-secondary`), and no buttons.
- Spin keeps **one** trainer.

### Heart rate list

- A radio group with the accessible name "Heart rate monitor for rides". Each row is at least `--spin-row-height` tall, divided by
  1dp `--color-border-light`: a radio (`--color-primary` when picked, `--color-border-strong` when not), the name
  (`--text-base`, bold), the live value at the right, and an overflow button "⋮" (content description "More for
  <name>").
- No detail line under the name (the prototype's battery and "last used" text is not built).
- **Live value** (`--text-sm`, bold, no wrap):

  | Case | Text | Colour |
  |---|---|---|
  | connected, a reading in the last 5 s with sensor contact (or contact not reported) and bpm > 0 | "64 bpm" | `--color-success` |
  | connected, no such reading for 5 s, or the strap says no contact, or bpm 0 | "No reading" | `--color-text-secondary` |
  | looking for it, under 10 s | "Connecting…" | `--color-text-secondary` |
  | not seen for 10 s while looking | "Not found" | `--color-text-secondary` |
  | Bluetooth off, or no permission | "—" | `--color-text-muted` |

- **Picking**: tapping anywhere on a row but the "⋮" picks it for rides. The first monitor added is picked
  automatically. Forgetting the picked one picks the first remaining row, or none.
- **Overflow menu**: "Move up" (absent on the first row), "Move down" (absent on the last), "Forget". Forget has no
  confirm.
- **Fallback toggle**, its own card below the list, `--spin-cta-height` tall: "If it isn't found, use the next one" (`--text-sm`,
  semibold) over "In the order above" (`--text-xs`, `--color-text-secondary`), and a checkbox at the right
  (accessible name "Fall back to the next heart rate monitor"). **On** by default. Drawn only when two or more
  monitors are saved; its value is kept when it is hidden.
- The note "Only a strap you're wearing sends a heart rate. The live bpm is how you tell which strap is which."
  (`--text-xs`, `--color-text-secondary`) under the toggle, drawn whenever at least one monitor is saved.
- **Empty**: the list card holds "No heart rate monitor yet" (`--text-base`, bold) and "Ride without one, or add a
  strap with + Add a device." (`--text-sm`, `--color-text-secondary`).

**What the choice means for a ride** (used by #768, decided and tested here): the ride uses the picked monitor. When
it is not found and the toggle is on, it uses the first monitor that is found, taking rows in list order from the
top and skipping the picked one. When the toggle is off, or nothing is found, the ride has no heart rate. How long a
ride waits before deciding "not found" is #768's.

### + Add a device

A full-width `--spin-cta-height` button, dashed 1dp `--color-primary` outline, `--radius-lg`, "+ Add a device" in
`--color-primary-text`, bold. Disabled (`--opacity-disabled`) while the banner shows a permission or Bluetooth
problem.

## Devices: connections

- **While Devices is on screen** (started and resumed) with the permission granted and Bluetooth on, the app looks
  for every saved device with a scan filtered to their addresses, connects to each one it sees, and subscribes:
  the trainer's Indoor Bike Data, Fitness Machine Status and Control Point, and each monitor's Heart Rate
  Measurement. A device that drops is looked for again the same way, and its status goes back to "Connecting…".
- **When Devices leaves the screen** (Settings opens, the app goes to the background, the screen turns off), every
  connection is closed and the scan stops. Nothing runs in the background in this issue; the ride's foreground
  service is #768.
- No system pairing or bonding: FTMS and the Heart Rate service need none. "Add" saves the device's address, name
  and kind in the app, and that is all "pairing" means here.
- GATT operations on a connection run one at a time, each waiting for the last's callback, through one queue in a
  plain-Kotlin class that #768 reuses.

## Add a device (scan sheet)

A modal bottom sheet over a `--color-overlay` scrim, `--radius-lg` top corners, `--color-surface`.

- Header: "Looking for devices…" (`--text-lg`, bold) and a close button "×" (content description "Close") at the
  right. Below it: "Trainers and heart rate monitors nearby. Close other apps that might be connected to them."
  (`--text-sm`, `--color-text-secondary`).
- The scan filters on the FTMS service (0x1826) and the Heart Rate service (0x180D), runs for **30 s**, then stops;
  the header becomes "Scan finished" and a "Scan again" text button appears under the list.
- **Rows**, `--spin-row-height`, outlined 1dp `--color-border-light`, `--radius-md`, `--space-sm` apart. Each device once (by
  address), **appended in the order found and never re-sorted**, so a row does not move under a finger. Name
  (`--text-base`, bold) and detail (`--text-xs`, `--color-text-secondary`), then at the right:
  - a device advertising FTMS: detail "Trainer". One that advertises both services is a trainer.
  - a device advertising only Heart Rate: detail "Heart rate monitor".
  - already saved: no button, "Saved" in `--color-text-secondary`, `--text-sm`.
  - a trainer while a different one is saved: no button, detail "Trainer · forget <saved name> to add this one".
  - otherwise: an "Add" button, `--tap-target` tall, filled `--color-primary-fill`, `--color-on-fill` text, `--radius-md`.
- **Add** saves the device, closes the sheet and stops the scan. The device appears in its section at once
  ("Connecting…"), at the bottom of the heart rate list for a monitor.
- **Nothing found**: while scanning with no rows, "Pedal to wake the trainer, and put the strap on." (`--text-sm`,
  `--color-text-secondary`). After 30 s with no rows: "Nothing found. Pedal to wake the trainer, and put the strap
  on." and "Scan again".
- Closing the sheet (×, scrim tap, back) stops the scan and changes nothing.
- While the sheet is open the saved devices stay connected and their live values keep updating underneath.

## Spin-down calibration

A modal bottom sheet, title "Spin-down calibration", close "×". Speeds are shown in **mph**, one decimal, converted
from FTMS's 0.01 km/h units, the way Thrive shows speed.

| Step | Shows | Moves on when |
|---|---|---|
| Starting | "Getting the trainer ready…" | the trainer accepts Request Control and then Spin Down Control (start) |
| Speed up | "Pedal up to 23.0 mph" (`--text-xl`, bold), with the current speed below as a figure (`--figure-lg`, "18.4 mph") from Indoor Bike Data | Fitness Machine Status says "stop pedalling" |
| Coast | "Stop pedalling and let it coast." and the current speed | status says success or error |
| Done | "Calibrated." in `--color-success`, button "Done" closes | — |
| Failed | the reason, button "Try again" (restarts at Starting) and "Close" | — |

The target is the **high** target speed from the Spin Down Control response. Failure reasons:

- the trainer reports a spin-down error: "Spin-down didn't finish. Try again."
- the trainer refuses Request Control or Spin Down Control (any result code but success): "The trainer said no. Close
  other apps connected to it and try again."
- the trainer disconnects during the procedure: "Lost the trainer. Try again when it's connected."
- no status change for **60 s** in Speed up or Coast: "Spin-down didn't finish. Try again."

Closing the sheet mid-procedure sends nothing more to the trainer. Opening Settings or leaving the app closes the
sheet the same way, because the connection closes.

## Permission and Bluetooth banners

One banner at the top of Devices, `--radius-lg`, `--color-warning-light` ground, text `--color-text`, a text button at
the right in `--color-primary-text`. At most one shows, in this order:

1. **Nearby devices permission not granted** (`BLUETOOTH_SCAN` with `neverForLocation`, `BLUETOOTH_CONNECT`): "Spin
   needs the Nearby devices permission to find your trainer and heart rate straps." Button "Allow" asks the system.
   When the system will no longer ask (denied twice), the button is "Open settings" and opens the app's system
   settings page. The app asks on its own only once, the first time Devices opens.
2. **Bluetooth off**: "Bluetooth is off." Button "Turn on" asks the system to turn it on. The banner goes as soon as
   Bluetooth is on, and connections start.

Saved devices stay listed under a banner, with "—" as their status. Location permission is never asked for: the app
needs Android 12 (`minSdk` 31).

## Edge cases

- **The trainer is in use by another app** (Zwift, TrainerDay): it does not advertise, so it is "Not found" and does
  not appear in the scan. The scan sheet's subtitle is the hint.
- **A saved device changes its name**: the saved name stays. Renaming is not offered.
- **A heart rate monitor that is also connected to the watch**: most straps take two connections; if it refuses,
  it reads "Not found". No special case.
- **Rapid Forget then Add** of the same device: it returns as a new entry at the bottom of the list, picked only if
  the list was empty.
- **Many monitors**: the list has no cap; Android limits simultaneous connections, so beyond about six some read
  "Not found". Not handled.
- **Bluetooth turned off mid-scan or mid-spin-down**: the scan sheet shows "Scan finished" with no "Scan again"
  until the banner is gone; spin-down fails with "Lost the trainer. Try again when it's connected."

## Bluetooth details (for the JVM tests)

All parsing and encoding is plain Kotlin with no Android types, tested on the JVM against byte arrays.

- **FTMS Feature** (0x2ACC): two little-endian uint32s. Fitness Machine Features bit 1 = cadence, bit 14 = power
  measurement. Target Setting Features bit 3 = power target (ERG), bit 15 = spin-down control.
- **Indoor Bike Data** (0x2AD2): uint16 flags, then fields in order: instantaneous speed (uint16, 0.01 km/h) only
  when bit 0 is **0**; average speed (bit 1, uint16); instantaneous cadence (bit 2, uint16, 0.5 rpm); average
  cadence (bit 3, uint16); total distance (bit 4, uint24); resistance level (bit 5, sint16); instantaneous power
  (bit 6, sint16 W); average power (bit 7, sint16); expended energy (bit 8, uint16 + uint16 + uint8); heart rate
  (bit 9, uint8); metabolic equivalent (bit 10, uint8); elapsed time (bit 11, uint16); remaining time (bit 12,
  uint16). The parser returns speed, cadence and power, each null when absent, and is #768's too.
- **Control Point** (0x2AD9): Request Control is `00`; Spin Down Control start is `13 01`. A response is
  `80 <request op> <result>`, result `01` success; a Spin Down Control success carries target speed low and high,
  two uint16s in 0.01 km/h.
- **Fitness Machine Status** (0x2ADA): `14 <status>` is spin-down status: `01` requested, `02` success, `03` error,
  `04` stop pedalling.
- **Heart Rate Measurement** (0x2A37): flags bit 0 picks uint8 or uint16 bpm; bits 1–2 are sensor contact (bit 2
  "supported", bit 1 "detected").

## Copy

"Devices", "Settings", "Back", "API URL", "Key", "Show", "Hide", "Test connection", "Save", "Saved",
"Connected — FTP 250 W", "Connected — no FTP set yet", "Key rejected", "Thrive answered with an error",
"Can't reach the server", "That doesn't look like a URL", "Enter the key", "TRAINER", "HEART RATE · USE FOR RIDES",
"Connected", "Connecting…", "Not found", "No reading", "Trainer", "Heart rate monitor", "power", "cadence", "ERG",
"Spin-down calibration", "Calibrates itself", "Forget", "Move up", "Move down", "No trainer yet",
"Add your KICKR with + Add a device.", "No heart rate monitor yet",
"Ride without one, or add a strap with + Add a device.", "If it isn't found, use the next one",
"In the order above", "Only a strap you're wearing sends a heart rate. The live bpm is how you tell which strap is which.",
"+ Add a device", "Looking for devices…", "Scan finished", "Scan again", "Add",
"Trainers and heart rate monitors nearby. Close other apps that might be connected to them.",
"Pedal to wake the trainer, and put the strap on.", "Nothing found. Pedal to wake the trainer, and put the strap on.",
"Trainer · forget <name> to add this one", "Unnamed device (…3A:7F)", "Getting the trainer ready…",
"Pedal up to 23.0 mph", "Stop pedalling and let it coast.", "Calibrated.", "Done", "Try again", "Close",
"Spin-down didn't finish. Try again.", "The trainer said no. Close other apps connected to it and try again.",
"Lost the trainer. Try again when it's connected.",
"Spin needs the Nearby devices permission to find your trainer and heart rate straps.", "Allow", "Open settings",
"Bluetooth is off.", "Turn on".

## Accessibility

Every touch target is at least `--tap-target`. Icon-only buttons have content descriptions ("Settings", "Back", "Close",
"More for <name>"). Heart rate rows are radio buttons in one group; a row reads as "<name>, <live value>, selected"
or "not selected". The status pill and live values are text, not colour alone. Text meets 4.5:1 in both themes with
the tokens named.

## New tokens

Colours: none. `SpinColors` mirrors existing suite and Thrive tokens only. The suite has no size tokens for touch
targets or rows, so Spin's theme module defines three, in dp, beside its colours (Android only, not CSS):

| Token | Value | For |
|---|---|---|
| `--tap-target` | 48dp | the minimum height of every button and tappable row; Android's own minimum |
| `--spin-row-height` | 64dp | a heart rate row and a scan row: name plus a second line or a button |
| `--spin-cta-height` | 52dp | "+ Add a device" and the fallback toggle card, as the prototype draws them |

---
name: stack-firmware
description: Conventions, scaffold, and CI for embedded firmware projects in Keel (PlatformIO, ESP32, Arduino framework). Use when working in a project folder whose CLAUDE.md names firmware as its stack.
---

# Firmware stack

PlatformIO, ESP32, Arduino framework. Authoritative for any project whose
CLAUDE.md names `firmware`.

## Testing is human-gated

**The delivery run halts at Testing for firmware projects.** Acceptance criteria
describing physical behaviour — a valve opening, a flash firing at the right
offset, a sensor edge landing where expected — cannot be verified in CI. A green
build proves the code compiles and nothing else.

When `/test` reaches a firmware project, it verifies what CI can verify, then
stops and hands back with the criteria that need hardware in the loop listed
explicitly. It does not advance to Code Review on its own.

## Conventions

- PlatformIO for builds, never the Arduino IDE
- Timing in milliseconds as `uint32_t` unless stated otherwise
- `IRAM_ATTR` on interrupt handlers; `volatile` on anything an ISR touches
- Interrupt handlers set a flag and a timestamp, nothing more — all work happens
  in the main loop
- `micros()` for timestamps in ISRs, `millis()` for delays
- Descriptive constants: `VALVE_OPEN_TIME_MS`, not `VOT`
- Related functionality in paired `.h`/`.cpp` files, not one growing main.cpp
- Every configurable parameter has a documented valid range, validated on input

## Scaffold and CI

The project scaffold and the CI workflow template are in
[scaffold.md](scaffold.md), beside this file. `/new-project` reads it when a
project is created; nothing in the issue lifecycle does, which is why it is
not here.

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

## Scaffold

```
<slug>/
├── platformio.ini
├── src/main.cpp
├── include/
├── lib/
├── test/
└── .gitignore        # .pio/, .vscode/, *.bin, *.elf
```

`platformio.ini` starts minimal — one environment, board and framework filled in
during the interview if the user knows them, otherwise left as a marked TODO
rather than guessed.

## CI workflow

Build only. There is no meaningful test job without hardware, and pretending
otherwise is worse than having none.

```yaml
name: <slug>
on:
  pull_request:
    paths: ['<slug>/**', '.github/workflows/<slug>.yml']
  push:
    branches: [main]
    paths: ['<slug>/**', '.github/workflows/<slug>.yml']
concurrency:
  group: <slug>-${{ github.ref }}
  cancel-in-progress: true
jobs:
  build:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: <slug>
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.x'
      - uses: actions/cache@v4
        with:
          path: ~/.platformio
          key: <slug>-pio-${{ hashFiles('<slug>/platformio.ini') }}
      - run: pip install platformio
      - run: pio run
```

# firmware stack scaffold

Moved out of [SKILL.md](SKILL.md) so that the file every lifecycle command
reads carries only what those commands act on. Nothing here is reachable from
`/pm`, `/develop`, `/test` or `/review` — it is read once, by `/new-project`,
when a project is created.

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
      - uses: actions/checkout@v5
      - uses: actions/setup-python@v6
        with:
          python-version: '3.x'
      - uses: actions/cache@v4
        with:
          path: ~/.platformio
          key: <slug>-pio-${{ hashFiles('<slug>/platformio.ini') }}
      - run: pip install platformio
      - run: pio run
```

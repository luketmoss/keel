# keel CI workflow

Moved out of [SKILL.md](SKILL.md) so that the file every lifecycle command
reads carries only what those commands act on. Nothing here is reachable from
`/pm`, `/develop`, `/test` or `/review` — it is read once, by `/new-project`,
when a project is created.

## CI workflow

```yaml
name: keel
on:
  pull_request:
    paths:
      - 'CONVENTIONS.md'
      - 'CLAUDE.md'
      - 'README.md'
      - '.claude/skills/**'
      - '.keel/**'
      - '.github/workflows/**'
      - 'docs/**'
  push:
    branches: [main]
    paths:
      - 'CONVENTIONS.md'
      - 'CLAUDE.md'
      - 'README.md'
      - '.claude/skills/**'
      - '.keel/**'
      - '.github/workflows/**'
      - 'docs/**'
concurrency:
  group: keel-${{ github.ref }}
  cancel-in-progress: true
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-python@v6
        with:
          python-version: '3.12'
      - run: python .keel/check.py
```

Two deviations from `CONVENTIONS.md`, both because keel's folder is the root:

- **No `defaults.run.working-directory`.** The working directory already is the
  project folder. Setting it to `.` would be noise pretending to be compliance.
- **No cache key prefix.** Nothing is installed, so there is no cache to collide
  with another project's.

The path filter is a list rather than a `keel/**` glob for the same reason, and
it is written out twice rather than shared with a YAML anchor — GitHub Actions
does not resolve anchors, and one that silently expands to nothing would leave
the trigger matching every path. It covers the workflow's own file by way of
`.github/workflows/**`, so editing CI tests CI, and a change confined to a
project folder does not match it.

`fetch-depth` stays at the default: `check.py` calls `git ls-files`, which reads
the index and needs no history.

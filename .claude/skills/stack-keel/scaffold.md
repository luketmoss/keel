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
  push:
    branches: [main]
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

Three deviations from `CONVENTIONS.md`, all because keel's folder is the root:

- **No `defaults.run.working-directory`.** The working directory already is the
  project folder. Setting it to `.` would be noise pretending to be compliance.
- **No cache key prefix.** Nothing is installed, so there is no cache to collide
  with another project's.
- **No path filter**, which is the deliberate exception to
  `CONVENTIONS.md` §Continuous integration's first rule. `check.py`'s scope is
  the whole repository — `check_links` walks every tracked `.md` in it, and
  `check_design_notes` every citation in every project's source. A filter
  covering only keel's own paths left the trigger narrower than the thing it
  triggers, so a change confined to a project folder could break a link inside
  that project's `docs/design/`, or cite a note nobody committed, and nothing
  ran. #250 and #251 are what that looked like.

The filter this replaced was a list rather than a `keel/**` glob, and was
written out twice rather than shared with a YAML anchor — GitHub Actions does
not resolve anchors, and one that silently expands to nothing would leave the
trigger matching every path. Both problems are gone with the filter; an
unfiltered trigger covers the workflow's own file for free, so editing CI still
tests CI.

The cost is a checkout, a Python setup and one script on every pull request in
the repository. Nothing is installed and no cache is primed, so it is seconds,
and it buys a check that runs on the changes it was written to catch.

`fetch-depth` stays at the default: `check.py` calls `git ls-files`, which reads
the index and needs no history.

---
name: stack-cli
description: Conventions, scaffold, and CI for CLI tools and libraries in Keel (Python, uv, pytest). Use when working in a project folder whose CLAUDE.md names cli as its stack.
---

# CLI / library stack

Python, managed with `uv`. Authoritative for any project whose CLAUDE.md names
`cli`.

## Testing

Fully automated. `/test` runs the suite and the delivery run continues to Ready
to Ship without stopping. This is the only stack with no human-gated cases.

## Conventions

- `pyproject.toml` only — no `setup.py`, no `requirements.txt`
- `uv` for dependency management and virtualenvs
- Type hints on everything public. `mypy` in CI, not aspirationally
- `ruff` for lint and format, with defaults unless there's a reason
- `argparse` for CLIs. Reach for `click` only when subcommands and shared
  options genuinely justify it
- Library code raises; only the CLI entry point catches and exits. A library
  that calls `sys.exit` is unusable from anything else
- `pytest`, with tests mirroring the source layout under `tests/`

## Scaffold

```
<slug>/
├── pyproject.toml
├── src/<module>/
│   ├── __init__.py
│   ├── cli.py
│   └── py.typed
├── tests/
└── .gitignore        # .venv/, __pycache__/, dist/, .pytest_cache/
```

Console entry point declared in `pyproject.toml` under
`[project.scripts]` — not a shebang script.

## CI workflow

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
  check:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: <slug>
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v5
        with:
          enable-cache: true
          cache-suffix: <slug>
      - run: uv sync --all-extras --dev
      - run: uv run ruff check .
      - run: uv run mypy src
      - run: uv run pytest
```

`cache-suffix` keeps this project's uv cache separate from the others in the
workspace.

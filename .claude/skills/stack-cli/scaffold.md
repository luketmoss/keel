# cli stack scaffold

Moved out of [SKILL.md](SKILL.md) so that the file every lifecycle command
reads carries only what those commands act on. Nothing here is reachable from
`/pm`, `/develop`, `/test` or `/review` — it is read once, by `/new-project`,
when a project is created.

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
      - uses: actions/checkout@v5
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

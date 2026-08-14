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

## Scaffold and CI

The project scaffold and the CI workflow template are in
[scaffold.md](scaffold.md), beside this file. `/new-project` reads it when a
project is created; nothing in the issue lifecycle does, which is why it is
not here.

# CLAUDE.md — ui

The suite language: the written design language and the shared token
stylesheet that Thrive, Hive and Forage build their apps on. Personal use.

`ui/` is documents and a stylesheet, **not a component library**. Nothing in it
may import a view library, so every app can consume it whatever it renders with.

**Stack:** web. The authoritative conventions for this project are in
`.claude/skills/stack-web/SKILL.md` — read it before writing code here. The one
artifact `ui/` ships besides documents is CSS that web apps consume, which is
why web's conventions are the ones that bind it.

Workspace rules live in the root `CLAUDE.md` and `CONVENTIONS.md`. This file
covers only what is specific to ui.

## Layout

```
ui/
├── tokens/
│   └── suite.css           # the shared tokens: scales, neutrals, status, overlays
└── docs/design/
    ├── suite-language.md   # standing: the suite's colours, scales and layout
    ├── keel-wide-rules.md  # standing: what every app keeps; the colour registry
    └── app-icons.md        # standing: the mark, the tile, the file set
```

`tokens/suite.css` holds the values `suite-language.md` records and no accent
or data colour: each app imports it by relative path at the top of its own
stylesheet, then defines its accent family and data colours (#402). Its bundler
inlines the import, so nothing is published and there is no package.

There is no package scaffold and no workflow. Nothing here builds, and
`python .keel/check.py` already checks every tracked Markdown file's links.

## Board

Project option: `ui`. Filter the board by it to see only this project's work.

## Testing

Automated, not human-gated. `/test` runs `python .keel/check.py` and verifies
acceptance criteria against the documents; the delivery run continues through to
Ready to Ship without stopping. Criteria describing visual appearance are the
exception — those need eyes, and `/test` says so rather than passing them
silently.

**`tokens/suite.css` is tested by its consumers' suites,** not here: `ui/` has
no test runner of its own. Thrive's frontend tests read it through its
`global.css`, resolve every token against a snapshot and check its contrast, and
`thrive.yml` triggers on `ui/tokens/**`, so a change to the file runs them. A
consumer that adopts the file adds `ui/tokens/**` to its own workflow's paths.

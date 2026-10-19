# 492 — Body tile and Note in the new style

Part of #484; uses #485's tokens and sits in #491's tile grid. What Body shows is
unchanged: `bodyView` (#239 AC4) decides it, from the viewed day's readings
only, and the owner kept that rule on 2026-10-19. The journal's autosave
(#240, #290) is unchanged.

## Body tile

The fourth tile, beside stress. Title "Body", icon a drawn scale in
`--color-primary`.

```
(scale) Body
179.5 lb
fat 9.6%
──────────────
134/86 mmHg
Average of 2 readings
```

- Weight at `--figure-lg`, unit "lb". Under it, `--text-xs`
  `--color-text-secondary`: "fat 9.6%" or "Fat not measured", then the weigh-in
  time ("7:52 AM").
- A hairline (`--color-border-light`), then blood pressure at `--text-xl` 600
  with "mmHg", and its caption ("Average of 2 readings" / "One reading,
  6:18 AM").
- No reading on the day: weight "—" with "None yet today." (today) or "No
  reading this day." (past); blood pressure "—" with the same words. The words
  are `bodyView`'s.
- Blood pressure keeps its screen-reader twin ("134 over 86 millimetres of
  mercury").
- Loading / failed: the tile holds `PanelStatus` for "your body measurements",
  as now. It is not folded into the Health status: it is a different source.
- Future day: not mounted (unchanged).

No trend line and no reading from another day: both were declined.

## Note

The card keeps its place, last, and takes #485's card style: title "Note" with a
drawn pencil icon in `--color-text-secondary`, its save status at the right as
today ("Saving…", "Saved", "Not saved").

The textarea: background `--color-surface-raised`, `1px solid --color-border`,
`--radius-md` + `--space-xs` (12), padding `--space-sm` `--space-md` minus
`--space-xs`, two rows tall at rest, growing with its content as now. Placeholder
words unchanged ("How's today going?", "What happened this day?", "Notes for this
day…"). The visually hidden label and the focus ring (#404) stay.

## Not changed

The bottom navigation and the + button. Both are the suite's shared design
(`suite-language.md`: one bottom navigation across Thrive, Hive and Forage), so
prototype A's rounded-square + button and quieter nav are not adopted here.

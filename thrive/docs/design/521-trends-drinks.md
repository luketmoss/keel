# 521 — Water and Alcohol in Trends

Part of #518. Adds two metrics to Trends using the existing groups and the icon toolbar (#503); no new controls. Data: `getDrinks` for the range, summed per Denver day in the SPA (not `DailySummary`, which can lag).

## Where they sit

A new Trends group **Intake** after Activity (the last of recovery, sleep, fitness, body, blood pressure, activity), holding Water and Alcohol. (A group of its own, because neither is a health reading from a device and they are logged by hand; the Day cards open this group the way #504 opens the others.)

## What each shows

| Metric | Unit | Mark | Reference |
|---|---|---|---|
| Water | oz (one decimal, trailing `.0` dropped) | one bar per day | the daily goal, a dashed line, when the goal is known |
| Alcohol | drinks (whole) | one bar per day | none |

- Days before the first drink ever logged are blank. A later day with no drinks is `0`. The average covers non-blank days and counts the zeros.
- The header figure is the range average, "avg 52 oz" / "avg 1.4 drinks", labelled like the other metrics.
- Colours are the Day cards' `--metric-water` / `--metric-alcohol`.

## States

| Case | Shows |
|---|---|
| Loading | the group's skeleton, as others |
| Error | the standard panel error and "Try again" |
| Never logged | "No drinks logged yet." in place of the chart |
| Goal unknown | no reference line, nothing else changes |
| One day of data | a single bar, no average label |

## Accessibility

Same text alternative as other Trends charts: a summary line ("Water, last 30 days, average 52 ounces, goal 64") and the data table the existing metrics expose.

## Copy

"Intake", "Water", "Alcohol", "No drinks logged yet.", "goal 64 oz".

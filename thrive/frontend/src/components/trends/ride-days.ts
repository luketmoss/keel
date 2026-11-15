// Ride days (#891): the days whose DailySummary row lists a bike activity.
// `activity_types` (column C) is a sorted comma list of `type` or `type:sub_type`;
// a label is a ride when it is `bike` or starts `bike:`, whole labels only, so a
// label that merely contains "bike" is not one. Planned rides never reach
// DailySummary. A day with no row is unknown, not "no ride". #892 reuses this.

/** Whether one `activity_types` cell lists a bike activity of any sub type. */
export function isRideDay(activityTypes: string | undefined): boolean {
  if (!activityTypes) return false;
  return activityTypes.split(',').some((label) => {
    const t = label.trim();
    return t === 'bike' || t.startsWith('bike:');
  });
}

/** The dates of the rows that had a ride. */
export function rideDays(rows: readonly { date?: string; activity_types?: string }[] | null): Set<string> {
  const out = new Set<string>();
  for (const row of rows ?? []) {
    if (row.date && isRideDay(row.activity_types)) out.add(row.date);
  }
  return out;
}

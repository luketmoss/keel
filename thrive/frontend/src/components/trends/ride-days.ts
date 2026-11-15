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

// Day kinds (#892). The same rows and the same label rule as the ride shade, so the
// two cannot disagree about a ride. A day with a ride and a lift is both kinds.

type SummaryLike = { date?: string; activity_types?: string; activity_count?: string };

/** Whether one `activity_types` cell lists a weight session. */
export function isLiftDay(activityTypes: string | undefined): boolean {
  if (!activityTypes) return false;
  return activityTypes.split(',').some((label) => label.trim() === 'weight');
}

/** A rest day has a row whose `activity_count` is 0 or blank. A missing row is unknown, not rest. */
export function isRestDay(activityCount: string | undefined): boolean {
  const n = (activityCount ?? '').trim();
  return n === '' || Number(n) === 0;
}

/** The dates of the rows that had a weight session. */
export function liftDays(rows: readonly SummaryLike[] | null): Set<string> {
  const out = new Set<string>();
  for (const row of rows ?? []) {
    if (row.date && isLiftDay(row.activity_types)) out.add(row.date);
  }
  return out;
}

/** The dates of the rows with no activity at all. */
export function restDays(rows: readonly SummaryLike[] | null): Set<string> {
  const out = new Set<string>();
  for (const row of rows ?? []) {
    if (row.date && isRestDay(row.activity_count)) out.add(row.date);
  }
  return out;
}

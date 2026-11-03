// A held value on a Trends card (#772): FTP is not read daily, it is what it was until someone sets
// it again, so a card draws a step line, a dot on each entry's day and a list of the entries, not a dot
// a day. Pure, like series.ts: no DOM, no signals, no clock ("today" is passed in).
//
// Charts show and never conclude: nothing here compares one entry with another.

/** One entry of a held metric: the day it takes effect, its value (null when it has none) and where it came from. */
export interface HeldEntry {
  date: string;
  /** The plotted number, or null: FTP per kg on a day with no weigh-in. Never 0. */
  value: number | null;
  source: string;
}

/** What is in effect on one day of the range. */
export interface HeldCell {
  value: number | null;
  /** The entry's date. */
  since: string;
  /** `since` as a card writes it: "Nov 7", with the year when it is not this year. */
  sinceText: string;
  source: string;
  /** The day is the entry's own. */
  entry: boolean;
}

export interface HeldSeries {
  /** The cell of every day of the range from the first entry on; a day before it has none. */
  cells: Map<string, HeldCell>;
  /** The entries inside the range, newest first. */
  entries: HeldEntry[];
  /** What is in effect today, or null with no entry. */
  current: HeldCell | null;
}

/** An FtpHistory source in words, as a list row writes it. Anything but a ramp test was set by hand. */
export const sourceWords = (source: string): string => (source === 'ramp_test' ? 'Ramp test' : 'Set by hand');

/** …as a readout writes it. */
export const sourceWordsLower = (source: string): string => sourceWords(source).toLowerCase();

/**
 * The cells for `dates` from `entries` (one per date, oldest first, none after `today`). An entry holds
 * from its own day until the day before the next entry's, and the last runs on to the range's end.
 */
export function buildHeld(
  entries: readonly HeldEntry[],
  dates: readonly string[],
  today: string,
  sinceText: (ymd: string) => string,
): HeldSeries {
  const cells = new Map<string, HeldCell>();
  const cellOf = (e: HeldEntry, date: string): HeldCell => ({
    value: e.value,
    since: e.date,
    sinceText: sinceText(e.date),
    source: e.source,
    entry: e.date === date,
  });
  let at = -1;
  for (const date of dates) {
    while (at + 1 < entries.length && entries[at + 1].date <= date) at++;
    if (at >= 0) cells.set(date, cellOf(entries[at], date));
  }
  const first = dates[0];
  const last = dates[dates.length - 1];
  return {
    cells,
    entries: entries.filter((e) => e.date >= first && e.date <= last).reverse(),
    current: entries.length ? cellOf(entries[entries.length - 1], today) : null,
  };
}

/**
 * The runs of days a step line is drawn over: a day with no cell, or a cell with no value, ends one.
 * Each run is its days' values in order.
 */
export function heldRuns(
  dates: readonly string[],
  cells: ReadonlyMap<string, HeldCell>,
): { date: string; value: number }[][] {
  const runs: { date: string; value: number }[][] = [];
  let run: { date: string; value: number }[] = [];
  for (const date of dates) {
    const v = cells.get(date)?.value;
    if (v === undefined || v === null) {
      if (run.length) runs.push(run);
      run = [];
    } else run.push({ date, value: v });
  }
  if (run.length) runs.push(run);
  return runs;
}

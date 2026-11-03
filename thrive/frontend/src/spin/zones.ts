// Coggan power zones (#771), the whole-number bands Thrive Spin's profile uses (#767): the zone of a
// power, or of a target, as a percentage of the FTP. One helper, used by the ride hero, the
// Intervals table and the zones card, so the three never disagree.

export const ZONE_COUNT = 6;

export const ZONE_NAMES = ['Active recovery', 'Endurance', 'Tempo', 'Threshold', 'VO2 max', 'Anaerobic'] as const;

/** Each zone's upper bound in percent of FTP, exclusive; Z6 has none. */
const UPPER_PCT = [56, 76, 91, 106, 121] as const;

/**
 * The zone, 1 to 6, of `watts` at `ftp`. Exact integer arithmetic: `watts × 100 < bound × ftp`, so a
 * fractional percentage (a bucket mean) lands where an integer one would. `ftp` must be positive.
 */
export function zoneOf(watts: number, ftp: number): number {
  for (let i = 0; i < UPPER_PCT.length; i++) {
    if (watts * 100 < UPPER_PCT[i] * ftp) return i + 1;
  }
  return ZONE_COUNT;
}

/** The smallest whole watt count at or above `pct` percent of `ftp`. */
function ceilWatts(ftp: number, pct: number): number {
  return Math.ceil((ftp * pct) / 100);
}

/** A zone's watt range at `ftp`: "< 140 W", "140–189 W", "≥ 303 W". */
export function zoneRange(zone: number, ftp: number): string {
  if (zone <= 1) return `< ${ceilWatts(ftp, UPPER_PCT[0])} W`;
  if (zone >= ZONE_COUNT) return `≥ ${ceilWatts(ftp, UPPER_PCT[ZONE_COUNT - 2])} W`;
  return `${ceilWatts(ftp, UPPER_PCT[zone - 2])}–${ceilWatts(ftp, UPPER_PCT[zone - 1]) - 1} W`;
}

/** The CSS variable of a zone (`--zone-1` to `--zone-6`). */
export function zoneVar(zone: number): string {
  return `var(--zone-${zone})`;
}

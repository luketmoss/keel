// #913: the chart's pure geometry and wording. Forage's own; Thrive's chart was reference only.

/** A zero-based axis: a round maximum above `max`, and its ticks (about four steps). */
export function niceScale(max: number): { max: number; ticks: number[] } {
  if (!(max > 0)) return { max: 1000, ticks: [0, 500, 1000] };
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 1000; v += step) ticks.push(Math.round(v * 100) / 100);
  return { max: top, ticks };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function parts(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  return { y, m, d, weekday: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}

/** `Nov 3`. */
export function monthDay(date: string): string {
  const { m, d } = parts(date);
  return `${MONTHS[m - 1]} ${d}`;
}

/** `Fri, Nov 6`. */
export function shortWeekdayDate(date: string): string {
  return `${WEEKDAY_NAMES[parts(date).weekday].slice(0, 3)}, ${monthDay(date)}`;
}

/** `Friday, November 6`, for a link's accessible name. */
export function longWeekdayDate(date: string): string {
  const { m, d, weekday } = parts(date);
  return `${WEEKDAY_NAMES[weekday]}, ${MONTH_NAMES[m - 1]} ${d}`;
}

export const WEEKDAY_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const WEEKDAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** A few evenly spaced date labels: `Nov 3`, with the year on a January tick. */
export function dateTicks(dates: string[], width: number): { index: number; text: string }[] {
  const n = dates.length;
  if (!n) return [];
  const count = Math.max(2, Math.min(n, Math.floor(width / 64)));
  const picked = new Set<number>();
  for (let i = 0; i < count; i++) picked.add(Math.round((i * (n - 1)) / (count - 1 || 1)));
  return [...picked]
    .sort((a, b) => a - b)
    .map((index) => {
      const { y, m } = parts(dates[index]);
      return { index, text: m === 1 ? `${monthDay(dates[index])} ’${String(y).slice(2)}` : monthDay(dates[index]) };
    });
}

/** The range in words beside the chart's title. */
export function rangeWords(range: string): string {
  switch (range) {
    case '1W':
      return 'last 7 days';
    case '1M':
      return 'last 30 days';
    case '3M':
      return 'last 3 months';
    case '6M':
      return 'last 6 months';
    case '1Y':
      return 'last year';
    default:
      return 'all time';
  }
}

// #914: the Macros grams chart and a nutrient's chart: #913's chart, readout and legend over a series of one number a
// day (forage/docs/design/914-trends-macros-nutrients.md). Selection is this component's own, so a tab, range or
// average change (which remounts it) clears it and a change of macro (which does not) keeps it.
import { useState } from 'preact/hooks';
import { eatenDate } from '../eaten/eaten-store';
import { dayHash } from '../shell/routes';
import { BarChart, type ChartItem } from './bar-chart';
import { longWeekdayDate, monthDay, shortWeekdayDate } from './chart-math';
import type { SeriesPoint, SeriesWeek } from './series';

/** Open Eaten on a date. A bare `#/eaten` keeps the day last shown, so the day is set first. */
export function openDay(date: string, today: string): void {
  eatenDate.value = date;
  window.location.hash = dayHash(date, today);
}

/** The readout's link to a day in Eaten (#913): a 44px target, named for the day. */
export function DayLink({ date, today, text }: { date: string; today: string; text: string }) {
  return (
    <a
      class="readout-link"
      href={dayHash(date, today)}
      aria-label={`${text.replace(' ›', '')}, ${longWeekdayDate(date)}`}
      onClick={() => {
        eatenDate.value = date;
      }}
      data-testid="readout-link"
    >
      {text}
    </a>
  );
}

export function Chip({ text }: { text: string }) {
  return <span class="chip-flag low-chip">{text}</span>;
}

export interface Readout {
  /** The text a keyboard move announces. */
  text: string;
  node: preact.ComponentChild;
}

interface Words {
  /** A value with its unit: `142 g`, `1,240 mg`. */
  fmt: (n: number) => string;
  /** What a day with entries and no value reads. */
  noValue: string;
  /** The average's window as words (`7-day average`), or null for none. */
  avgWord: string | null;
}

function seriesDayReadout(p: SeriesPoint, today: string, w: Words): Readout {
  const label = p.today ? 'Today' : shortWeekdayDate(p.date);
  const link = (text: string) => (
    <a
      class="readout-link"
      href={dayHash(p.date, today)}
      aria-label={`${text.replace(' ›', '')}, ${longWeekdayDate(p.date)}`}
      onClick={() => {
        eatenDate.value = p.date;
      }}
      data-testid="readout-link"
    >
      {text}
    </a>
  );
  if (p.value !== null) {
    const value = `${p.atLeast ? 'at least ' : ''}${w.fmt(p.value)}${p.today ? ' so far' : ''}`;
    const average = !p.today && w.avgWord && p.avg !== null ? `${w.avgWord} ${w.fmt(p.avg)}` : '';
    const note = p.partial ? 'some items have no nutrition' : '';
    return {
      text: [`${label} · ${value}`, average, p.partial ? `Low, ${note}` : ''].filter(Boolean).join(', '),
      node: (
        <>
          <span class="readout-text">
            {label} · {value}
          </span>
          {average && <span class="readout-text hint-inline"> · {average}</span>}
          {p.partial && (
            <>
              {' '}
              <Chip text="Low" /> <span class="hint-inline">{note}</span>
            </>
          )}{' '}
          {link('Open day ›')}
        </>
      ),
    };
  }
  if (p.logged) {
    const text = `${label} · ${w.noValue}`;
    return {
      text,
      node: (
        <>
          <span class="readout-text">{text}</span> {link('Open day ›')}
        </>
      ),
    };
  }
  const text = `${label} · nothing logged`;
  return {
    text,
    node: (
      <>
        <span class="readout-text">{text}</span> {link('Log this day ›')}
      </>
    ),
  };
}

function seriesWeekReadout(wk: SeriesWeek, w: Words): Readout {
  const head = `Week of ${monthDay(wk.date)}`;
  const tail = 'Use 6M or shorter to open a day';
  if (wk.value === null) {
    const text = `${head} · nothing logged`;
    return {
      text,
      node: (
        <>
          <span class="readout-text">{text}</span> <span class="hint-inline">{tail}</span>
        </>
      ),
    };
  }
  const text = `${head} · ${wk.atLeast ? 'at least ' : ''}${w.fmt(wk.value)} a day · ${wk.logged} of ${wk.total} days logged`;
  return {
    text,
    node: (
      <>
        <span class="readout-text">{text}</span>
        {wk.partial && (
          <>
            {' '}
            <Chip text="Low" />
          </>
        )}{' '}
        <span class="hint-inline">{tail}</span>
      </>
    ),
  };
}

interface Props {
  idPrefix: string;
  /** The chart's accessible name. */
  name: string;
  points: SeriesPoint[];
  weeks: SeriesWeek[];
  weekly: boolean;
  avgDays: number;
  today: string;
  /** The summary line: the average and the days it rests on, or `—`. */
  summary: string;
  fmt: (n: number) => string;
  /** The legend's first mark: `Day`, or the macro's name. */
  dayLabel: string;
  noValue: string;
}

export function SeriesChart({
  idPrefix,
  name,
  points,
  weeks,
  weekly,
  avgDays,
  today,
  summary,
  fmt,
  dayLabel,
  noValue,
}: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');

  const line = !weekly && avgDays > 0 ? points.map((p) => p.avg) : null;
  const lineDrawn = !!line && line.some((v) => v !== null);
  const avgWord = avgDays > 0 && !weekly ? `${avgDays}-day average` : null;
  const words: Words = { fmt, noValue, avgWord };

  const kindOf = (v: number | null, partial: boolean, atLeast: boolean): ChartItem['kind'] =>
    v === null ? 'gap' : partial ? 'hatched' : atLeast ? 'outline' : 'bar';
  const items: ChartItem[] = weekly
    ? weeks.map((w) => ({ key: w.date, date: w.date, kind: kindOf(w.value, w.partial, w.atLeast), value: w.value }))
    : points.map((p) => ({ key: p.date, date: p.date, kind: kindOf(p.value, p.partial, p.atLeast), value: p.value }));

  const readoutFor = (key: string | null): Readout | null => {
    if (key === null) return null;
    if (weekly) {
      const w = weeks.find((x) => x.date === key);
      return w ? seriesWeekReadout(w, words) : null;
    }
    const p = points.find((x) => x.date === key);
    return p ? seriesDayReadout(p, today, words) : null;
  };
  const readout = readoutFor(selected);

  const onSelect = (key: string | null, via: 'pointer' | 'key') => {
    setSelected(key);
    setAnnounce(via === 'key' ? (readoutFor(key)?.text ?? '') : '');
  };
  const onOpen = (key: string) => {
    if (!weekly && points.some((p) => p.date === key)) openDay(key, today);
  };

  return (
    <div data-testid="series-chart">
      <p class="hint" id={`${idPrefix}-summary`} data-testid="series-summary">
        {summary}
      </p>
      <p class="readout" data-testid="readout">
        {readout ? readout.node : <span class="hint-inline">Tap a day to read it.</span>}
      </p>
      <BarChart
        items={items}
        line={line}
        selected={selected}
        name={name}
        describedBy={`${idPrefix}-summary`}
        onSelect={onSelect}
        onOpen={onOpen}
        idPrefix={idPrefix}
      />
      <ul class="legend" data-testid="legend">
        {items.some((i) => i.kind === 'bar') && (
          <li>
            <span class="legend-mark legend-day" aria-hidden="true" /> {dayLabel}
          </li>
        )}
        {items.some((i) => i.kind === 'outline') && (
          <li>
            <span class="legend-mark legend-atleast" aria-hidden="true" /> At least (some entries didn't report it)
          </li>
        )}
        {lineDrawn && (
          <li>
            <span class="legend-mark legend-line" aria-hidden="true" /> {avgWord}
          </li>
        )}
        {items.some((i) => i.kind === 'gap') && (
          <li>
            <span class="legend-mark legend-gap" aria-hidden="true" /> Not logged
          </li>
        )}
        {items.some((i) => i.kind === 'hatched') && (
          <li>
            <span class="legend-mark legend-low" aria-hidden="true" /> Low
          </li>
        )}
      </ul>
      <div class="visually-hidden" role="status" data-testid="series-status">
        {announce}
      </div>
    </div>
  );
}

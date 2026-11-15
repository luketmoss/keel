// #913: the Trends screen, opened from Eaten's day card, with the Energy tab (forage/docs/design/913-trends-screen.md).
// Days come from one `getFoodLogTotals` read; the only arithmetic is means over counted days (energy.ts).
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { ForageApi } from '../api/client';
import { eatenDate, eatenToday } from '../eaten/eaten-store';
import { wholeKcal } from '../eaten/format';
import { dayHash, eatenHash, trendsHash, trendsRoute } from '../shell/routes';
import { BarChart, type ChartItem } from './bar-chart';
import { longWeekdayDate, monthDay, rangeWords, shortWeekdayDate, WEEKDAY_FULL, WEEKDAY_INITIALS } from './chart-math';
import {
  buildDays,
  buildWeeks,
  DAILY_MAX_DAYS,
  daysBetween,
  rangeFrom,
  summarize,
  weekdayMeans,
  windowOf,
  type DayPoint,
  type WeekPoint,
} from './energy';
import { Segmented } from './segmented';
import {
  chooseAverage,
  chooseRange,
  loadTrends,
  resetTrends,
  trendsDays,
  trendsState,
  trendsToday,
  viewAverage,
  viewRange,
} from './trends-store';
import { AVERAGES, BUILT_TABS, RANGES, type TrendTab } from './trends-types';

const TAB_LABEL: Record<TrendTab, string> = {
  energy: 'Energy',
  macros: 'Macros',
  nutrients: 'Nutrients',
  meals: 'Meals',
  foods: 'Foods',
};

/** The Trends header: the back arrow, to Eaten on the day it last showed (never the bar's date), and the heading. */
export function TrendsHeader() {
  return (
    <div class="eaten-nav trends-nav">
      <a
        class="icon-btn"
        href={eatenHash(eatenDate.value, eatenToday.value)}
        aria-label="Back to Eaten"
        data-testid="trends-back"
      >
        ‹
      </a>
      <h1 class="trends-title">Trends</h1>
    </div>
  );
}

/** Open Eaten on a date. A bare `#/eaten` keeps the day last shown, so the day is set first. */
function openDay(date: string, today: string): void {
  eatenDate.value = date;
  window.location.hash = dayHash(date, today);
}

function Chip({ text }: { text: string }) {
  return <span class="chip-flag low-chip">{text}</span>;
}

function SkeletonCards() {
  return (
    <div data-testid="trends-loading" aria-hidden="true">
      <div class="card trends-skeleton" />
      <div class="card trends-skeleton trends-skeleton-tall" />
      <div class="card trends-skeleton" />
    </div>
  );
}

interface Readout {
  /** The text a keyboard move announces. */
  text: string;
  node: preact.ComponentChild;
}

function dayReadout(p: DayPoint, today: string, avgWord: string | null): Readout {
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
  if (p.kcal !== null) {
    const kcal = `${wholeKcal(p.kcal)} kcal${p.today ? ' so far' : ''}`;
    const average = !p.today && avgWord && p.avg !== null ? `${avgWord} ${wholeKcal(p.avg)}` : '';
    const note = p.partial ? 'some items have no nutrition' : '';
    return {
      text: [`${label} · ${kcal}`, average, p.partial ? `Low, ${note}` : ''].filter(Boolean).join(', '),
      node: (
        <>
          <span class="readout-text">
            {label} · {kcal}
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
    const text = `${label} · logged, but nothing has nutrition yet`;
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

function weekReadout(w: WeekPoint): Readout {
  const head = `Week of ${monthDay(w.date)}`;
  const tail = 'Use 6M or shorter to open a day';
  if (w.kcal === null) {
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
  const text = `${head} · ${wholeKcal(w.kcal)} kcal a day · ${w.logged} of ${w.total} days logged`;
  return {
    text,
    node: (
      <>
        <span class="readout-text">{text}</span>
        {w.partial && (
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

/** The By weekday card: seven bars, Monday first. One value is no average, so a weekday with one day is hatched. */
function WeekdayCard({ days }: { days: DayPoint[] }) {
  const means = weekdayMeans(days);
  const total = means.reduce((t, m) => t + m.n, 0);
  const top = Math.max(0, ...means.map((m) => m.mean ?? 0));
  return (
    <section class="card weekday-card" aria-labelledby="weekday-title" data-testid="weekday-card">
      <h2 class="card-title" id="weekday-title">
        By weekday <span class="hint-inline">average</span>
      </h2>
      <div class="weekday-cols">
        {means.map((m) => {
          const name = WEEKDAY_FULL[m.index];
          const label =
            m.mean === null
              ? `${name}, no days`
              : `${name}, average ${wholeKcal(m.mean)} kcal over ${m.n} ${m.n === 1 ? 'day' : 'days'}`;
          return (
            <div class="weekday-col" key={name} role="img" aria-label={label} data-testid="weekday-col">
              <span class="weekday-value tabular" data-testid="weekday-value">
                {m.mean === null ? '—' : wholeKcal(m.mean)}
              </span>
              <span class="weekday-track" aria-hidden="true">
                {m.mean !== null && (
                  <span
                    class={m.n < 2 ? 'weekday-bar weekday-bar-hatched' : 'weekday-bar'}
                    style={{ height: `${top ? Math.max(2, (m.mean / top) * 100) : 0}%` }}
                    data-testid="weekday-bar"
                    data-kind={m.n < 2 ? 'hatched' : 'bar'}
                  />
                )}
              </span>
              <span class="weekday-initial" aria-hidden="true">
                {WEEKDAY_INITIALS[m.index]}
              </span>
              <span class="weekday-days hint-inline" aria-hidden="true">
                {m.n === 1 ? '1 day' : ''}
              </span>
            </div>
          );
        })}
      </div>
      <p class="hint" data-testid="weekday-based">
        {total ? `Based on ${total} ${total === 1 ? 'day' : 'days'}` : 'No days to average yet.'}
      </p>
    </section>
  );
}

export function TrendsScreen({ api }: { api: ForageApi }) {
  const route = trendsRoute.value;
  const range = viewRange.value;
  const average = viewAverage.value;
  const state = trendsState.value;
  const byDate = trendsDays.value;
  const today = trendsToday.value;
  const tab: TrendTab = route?.tab ?? 'energy';

  const [selected, setSelected] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');

  // Trends reads fresh each visit; this runs before the load below.
  useEffect(() => {
    resetTrends();
    return () => resetTrends();
  }, []);
  useEffect(() => {
    void loadTrends(api, range);
  }, [api, range]);
  // The hash follows the screen's tab and range, rewritten in place (no history entry).
  useEffect(() => {
    const want = trendsHash(tab, range);
    if (window.location.hash !== want) {
      const { pathname, search } = window.location;
      window.history.replaceState(window.history.state, '', `${pathname}${search}${want}`);
    }
  }, [tab, range]);
  // A selection is cleared by a change of range, average or tab.
  useEffect(() => {
    setSelected(null);
    setAnnounce('');
  }, [range, average, tab]);

  const first = useMemo(() => {
    const dates = [...byDate.keys()].sort();
    return dates[0] ?? null;
  }, [byDate]);

  const from = range === 'All' ? (first ?? today) : rangeFrom(range, today);
  const span = daysBetween(from, today) + 1;
  const weekly = span > DAILY_MAX_DAYS;
  const avgDays = weekly ? 0 : windowOf(average);

  const days = useMemo(
    () => (state === 'ready' ? buildDays(byDate, from, today, today, avgDays) : []),
    [state, byDate, from, today, avgDays],
  );
  const summary = useMemo(() => summarize(days), [days]);
  const weeks = useMemo(() => (weekly ? buildWeeks(days) : []), [weekly, days]);

  const items: ChartItem[] = weekly
    ? weeks.map((w) => ({
        key: w.date,
        date: w.date,
        kind: w.kcal === null ? 'gap' : w.partial ? 'hatched' : 'bar',
        value: w.kcal,
      }))
    : days.map((d) => ({
        key: d.date,
        date: d.date,
        kind: d.kcal === null ? 'gap' : d.partial ? 'hatched' : 'bar',
        value: d.kcal,
      }));
  const line = !weekly && avgDays > 0 ? days.map((d) => d.avg) : null;
  const lineDrawn = !!line && line.some((v) => v !== null);
  const avgWord = avgDays > 0 && !weekly ? `${avgDays}-day average` : null;

  const readoutFor = (key: string | null): Readout | null => {
    if (key === null) return null;
    if (weekly) {
      const w = weeks.find((x) => x.date === key);
      return w ? weekReadout(w) : null;
    }
    const d = days.find((x) => x.date === key);
    return d ? dayReadout(d, today, avgWord) : null;
  };
  const readout = readoutFor(selected);
  const rangeText = rangeWords(range);

  const onSelect = (key: string | null, via: 'pointer' | 'key') => {
    setSelected(key);
    setAnnounce(via === 'key' ? (readoutFor(key)?.text ?? '') : '');
  };
  const onOpen = (key: string) => {
    if (!weekly && days.some((d) => d.date === key)) openDay(key, today);
  };

  const controls = (
    <div class="trends-controls">
      <Segmented label="Range" options={RANGES} value={range} onChange={chooseRange} />
      <Segmented
        label="Average"
        options={AVERAGES}
        value={average}
        onChange={chooseAverage}
        disabled={weekly}
        describedBy={weekly ? 'weekly-note' : undefined}
      />
      {weekly && (
        <p class="hint" id="weekly-note" data-testid="weekly-note">
          Weekly bars have no average line
        </p>
      )}
    </div>
  );

  const tabs =
    BUILT_TABS.length > 1 ? (
      <div class="trends-tabs" role="tablist" aria-label="Trends">
        {BUILT_TABS.map((t) => (
          <a
            key={t}
            role="tab"
            class="trends-tab"
            aria-selected={t === tab}
            href={trendsHash(t, range)}
            data-testid={`trends-tab-${t}`}
          >
            {TAB_LABEL[t]}
          </a>
        ))}
      </div>
    ) : null;

  let body: preact.ComponentChild;
  if (state === 'loading') {
    body = <SkeletonCards />;
  } else if (state === 'error') {
    body = (
      <div class="library-status danger-text" role="status" data-testid="trends-error">
        <p>Couldn't load your log.</p>
        <button type="button" class="text-btn" onClick={() => void loadTrends(api, range, true)}>
          Try again
        </button>
      </div>
    );
  } else if (range === 'All' && byDate.size === 0) {
    body = (
      <section class="card" data-testid="trends-none">
        <h2 class="card-title">Nothing logged yet.</h2>
        <p class="hint">Eaten shows what you log, by day.</p>
        <a class="readout-link" href="#/eaten">
          Go to Eaten ›
        </a>
      </section>
    );
  } else {
    const counted = summary.logged > 0;
    const summaryLine = counted
      ? `${summary.logged} of ${summary.total} days logged${summary.low ? ` · ${summary.low} low` : ''}`
      : '';
    body = (
      <>
        <section class="card trends-summary" aria-label="Summary" data-testid="trends-summary">
          <p class="trends-average">
            <span class="trends-figure tabular" data-testid="trends-average">
              {counted ? wholeKcal(summary.average!) : '—'}
            </span>{' '}
            {counted && <span class="trends-unit">kcal a day, on average</span>}
          </p>
          <p class="hint" id="trends-summary-line" data-testid="trends-summary-line">
            {counted ? summaryLine : summary.any ? 'No days logged in this range.' : 'Nothing logged in this range.'}
          </p>
          {summary.todayIn && (
            <p class="hint" data-testid="trends-today-note">
              Not counting today, which is still being logged
            </p>
          )}
        </section>

        <section class="card chart-card" aria-labelledby="calories-title" data-testid="chart-card">
          <h2 class="card-title" id="calories-title">
            Calories <span class="hint-inline">{rangeText}</span>
          </h2>
          <p class="readout" data-testid="readout">
            {readout ? readout.node : <span class="hint-inline">Tap a day to read it.</span>}
          </p>
          <BarChart
            items={items}
            line={line}
            selected={selected}
            name={`Calories, ${rangeText}`}
            describedBy="trends-summary-line"
            onSelect={onSelect}
            onOpen={onOpen}
            idPrefix="energy"
          />
          <ul class="legend" data-testid="legend">
            {items.some((i) => i.kind === 'bar') && (
              <li>
                <span class="legend-mark legend-day" aria-hidden="true" /> Day
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
        </section>

        <WeekdayCard days={days} />
      </>
    );
  }

  return (
    <div class="trends" data-testid="trends-screen">
      {controls}
      {tabs}
      {body}
      <div class="visually-hidden" role="status" data-testid="trends-status">
        {announce}
      </div>
    </div>
  );
}

// #914: the Macros tab: where calories come from, the split by week, and grams per day
// (forage/docs/design/914-trends-macros-nutrients.md). Shares and rounding are #864's (`ui/macro-math.ts`).
import { useMemo, useState } from 'preact/hooks';
import { addDays } from '../plan/dates';
import { MacroBar } from '../ui/macro-bar';
import { MACRO_KEYS, MACRO_NAMES, macroShares, type MacroKey } from '../ui/macro-math';
import { BarChart, type ChartItem } from './bar-chart';
import { monthDay } from './chart-math';
import { Segmented } from './segmented';
import {
  buildSeries,
  buildSeriesWeeks,
  macroOverview,
  MIN_SPLIT_DAYS,
  pickMacro,
  summarizeSeries,
  weekSplits,
  type TabView,
  type WeekSplit,
} from './series';
import { SeriesChart } from './series-chart';
import { chooseMacro, viewMacro } from './trends-store';
import { MACRO_METRICS } from './trends-types';

const wholeG = (n: number) => `${Math.round(n)} g`;
const dayWord = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;

function WhereCaloriesCome({ view }: { view: TabView }) {
  const o = useMemo(() => macroOverview(view.byDate, view.from, view.today), [view.byDate, view.from, view.today]);
  const counted = o.logged > 0;
  const shares = macroShares(o.grams);
  return (
    <section class="card" aria-labelledby="macro-where-title" data-testid="macro-where">
      <h2 class="card-title" id="macro-where-title">
        Where calories come from <span class="hint-inline">{view.rangeText}</span>
      </h2>
      <MacroBar protein={o.grams.protein} carbs={o.grams.carbs} fat={o.grams.fat} size="day" />
      <ul class="macro-rows">
        {MACRO_KEYS.map((k) => {
          const g = o.grams[k];
          const share =
            shares.state === 'shares' ? shares.text[k] : shares.state === 'empty' && g !== null ? '0%' : null;
          return (
            <li class="macro-row" key={k} data-testid={`macro-row-${k}`}>
              <span class={`macro-swatch macro-${k}`} aria-hidden="true" />
              <span class="macro-row-name">{MACRO_NAMES[k]}</span>
              <span class="macro-row-grams tabular" data-testid={`macro-grams-${k}`}>
                {g === null ? (
                  <span class="mn-unknown" role="img" aria-label="not known">
                    —
                  </span>
                ) : (
                  wholeG(g)
                )}
              </span>
              <span class="macro-row-share tabular hint-inline" data-testid={`macro-share-${k}`}>
                {share ? `${share} of kcal` : ''}
              </span>
            </li>
          );
        })}
      </ul>
      <p class="hint" data-testid="macro-count">
        {counted
          ? `${o.logged} of ${o.total} days logged${o.low ? ` · ${o.low} low` : ''}`
          : 'No days logged in this range.'}
      </p>
    </section>
  );
}

/** `Nov 2–8 · Protein 28% · Carbs 45% · Fat 27% · 5 days logged`. */
export function weekSplitText(w: WeekSplit): string {
  const end = addDays(w.date, 6);
  const endText = w.date.slice(5, 7) === end.slice(5, 7) ? String(Number(end.slice(8))) : monthDay(end);
  const span = `${monthDay(w.date)}–${endText}`;
  if (!w.pct) return `${span} · too few days to split · ${dayWord(w.days)} logged`;
  return `${span} · ${MACRO_KEYS.map((k) => `${MACRO_NAMES[k]} ${w.pct![k]}%`).join(' · ')} · ${dayWord(w.days)} logged`;
}

function SplitByWeek({ view }: { view: TabView }) {
  const weeks = useMemo(() => weekSplits(view.byDate, view.from, view.today), [view.byDate, view.from, view.today]);
  const [selected, setSelected] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');
  const usable = weeks.filter((w) => w.pct).length;
  if (usable < 2) {
    return (
      <p class="hint" data-testid="split-needs">
        Split by week needs two weeks with at least {MIN_SPLIT_DAYS} days logged.
      </p>
    );
  }
  const items: ChartItem[] = weeks.map((w) =>
    w.pct
      ? {
          key: w.date,
          date: w.date,
          kind: 'bar',
          value: 100,
          stack: MACRO_KEYS.map((k) => ({ h: w.pct![k], cls: `chart-seg-${k}` })),
        }
      : { key: w.date, date: w.date, kind: 'gap', value: null },
  );
  const picked = selected === null ? null : (weeks.find((w) => w.date === selected) ?? null);
  const onSelect = (key: string | null, via: 'pointer' | 'key') => {
    setSelected(key);
    const w = key === null ? null : weeks.find((x) => x.date === key);
    setAnnounce(via === 'key' && w ? weekSplitText(w) : '');
  };
  return (
    <section class="card chart-card" aria-labelledby="macro-split-title" data-testid="macro-split">
      <h2 class="card-title" id="macro-split-title">
        Split by week <span class="hint-inline">% of kcal</span>
      </h2>
      <p class="readout" data-testid="split-readout">
        {picked ? weekSplitText(picked) : <span class="hint-inline">Tap a week to read it.</span>}
      </p>
      <BarChart
        items={items}
        line={null}
        selected={selected}
        name={`Macro split by week, ${view.rangeText}`}
        describedBy="split-summary"
        onSelect={onSelect}
        onOpen={() => {}}
        idPrefix="split"
        axis={{ max: 100, ticks: [0, 50, 100], format: (t) => `${t}%` }}
      />
      <p class="hint" id="split-summary">
        {usable} weeks with at least {MIN_SPLIT_DAYS} days logged
      </p>
      <ul class="legend" data-testid="split-legend">
        {MACRO_KEYS.map((k) => (
          <li key={k}>
            <span class={`legend-mark macro-${k}`} aria-hidden="true" /> {MACRO_NAMES[k]}
          </li>
        ))}
        {items.some((i) => i.kind === 'gap') && (
          <li>
            <span class="legend-mark legend-gap" aria-hidden="true" /> Too few days
          </li>
        )}
      </ul>
      <div class="visually-hidden" role="status" data-testid="split-status">
        {announce}
      </div>
    </section>
  );
}

function GramsPerDay({ view }: { view: TabView }) {
  const macro: MacroKey = viewMacro.value;
  const { byDate, from, today, weekly, avgDays } = view;
  const points = useMemo(
    () => buildSeries(byDate, from, today, today, avgDays, pickMacro(macro)),
    [byDate, from, today, avgDays, macro],
  );
  const summary = useMemo(() => summarizeSeries(points), [points]);
  const weeks = useMemo(() => (weekly ? buildSeriesWeeks(points) : []), [weekly, points]);
  const name = MACRO_NAMES[macro];
  const text =
    summary.withValue > 0
      ? `${wholeG(summary.average!)} a day, on average · ${summary.logged} of ${summary.total} days logged`
      : '—';
  return (
    <section
      class="card chart-card"
      aria-labelledby="macro-grams-title"
      style={{ '--chart-bar': `var(--color-macro-${macro})` }}
      data-testid="macro-grams-card"
    >
      <h2 class="card-title" id="macro-grams-title">
        Grams per day{' '}
        <span class="hint-inline">
          {name}, {view.rangeText}
        </span>
      </h2>
      <Segmented
        label="Macro"
        options={MACRO_METRICS}
        value={macro}
        onChange={chooseMacro}
        labels={{ protein: 'Protein', carbs: 'Carbs', fat: 'Fat' }}
      />
      <SeriesChart
        idPrefix="macro-grams"
        name={`${name} grams per day, ${view.rangeText}`}
        points={points}
        weeks={weeks}
        weekly={weekly}
        avgDays={avgDays}
        today={today}
        summary={text}
        fmt={wholeG}
        dayLabel={name}
        noValue="logged, but nothing has nutrition yet"
      />
    </section>
  );
}

export function MacrosTab({ view }: { view: TabView }) {
  return (
    <>
      <WhereCaloriesCome view={view} />
      <SplitByWeek view={view} />
      <GramsPerDay view={view} />
    </>
  );
}

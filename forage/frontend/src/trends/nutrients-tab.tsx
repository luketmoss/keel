// #914: the Nutrients tab: the seven label nutrients in Nutrition Facts order, each with a sparkline and its daily
// average, one row's full chart open at a time (forage/docs/design/914-trends-macros-nutrients.md).
import { useEffect, useMemo } from 'preact/hooks';
import type { ExtraKey } from '../api/types';
import {
  buildSeries,
  buildSeriesWeeks,
  pickNutrient,
  summarizeSeries,
  type SeriesPoint,
  type SeriesSummary,
  type SeriesWeek,
  type TabView,
} from './series';
import { SeriesChart } from './series-chart';
import type { NutrientMetric } from './trends-types';

interface Nutrient {
  metric: NutrientMetric;
  key: ExtraKey;
  name: string;
  unit: 'g' | 'mg';
}

/** Nutrition Facts order, the food form's (#875) and the day card's. */
export const NUTRIENTS: Nutrient[] = [
  { metric: 'satfat', key: 'satfat_g', name: 'Saturated fat', unit: 'g' },
  { metric: 'transfat', key: 'transfat_g', name: 'Trans fat', unit: 'g' },
  { metric: 'cholesterol', key: 'cholesterol_mg', name: 'Cholesterol', unit: 'mg' },
  { metric: 'sodium', key: 'sodium_mg', name: 'Sodium', unit: 'mg' },
  { metric: 'fiber', key: 'fiber_g', name: 'Fiber', unit: 'g' },
  { metric: 'sugars', key: 'sugars_g', name: 'Sugars', unit: 'g' },
  { metric: 'added_sugars', key: 'added_sugars_g', name: 'Added sugars', unit: 'g' },
];

/** `1,240 mg`, `22 g`, `0.4 g`: mg whole; g whole, to one decimal under 10. A measured 0 is `0 g`. */
export function nutrientText(unit: 'g' | 'mg', value: number): string {
  if (unit === 'mg') return `${Math.round(value).toLocaleString('en-US')} mg`;
  const tenth = Math.round(value * 10) / 10;
  return `${tenth < 10 ? tenth : Math.round(value)} g`;
}

/** Bars for the range's days (or weeks), scaled to the row's own largest value; a gap is no bar. */
function Sparkline({ values }: { values: (number | null)[] }) {
  const n = Math.max(1, values.length);
  const top = Math.max(0, ...values.map((v) => v ?? 0));
  return (
    <svg
      class="spark"
      viewBox={`0 0 ${n} 24`}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
      data-testid="spark"
    >
      {values.map((v, i) =>
        v !== null && top > 0 && v > 0 ? (
          <rect
            key={i}
            x={i + 0.1}
            width={0.8}
            y={24 - Math.max(1, (v / top) * 24)}
            height={Math.max(1, (v / top) * 24)}
            class="spark-bar"
            data-testid="spark-bar"
          />
        ) : null,
      )}
    </svg>
  );
}

interface RowData {
  n: Nutrient;
  summary: SeriesSummary;
  values: (number | null)[];
}

interface Props {
  view: TabView;
  /** The row whose chart is open. */
  open: NutrientMetric | null;
  onToggle: (metric: NutrientMetric) => void;
  /** A row to scroll into view once, because a link named it. */
  scrollTo: NutrientMetric | null;
}

export function NutrientsTab({ view, open, onToggle, scrollTo }: Props) {
  const { byDate, from, today, weekly, avgDays } = view;
  const rows: RowData[] = useMemo(
    () =>
      NUTRIENTS.map((n) => {
        const points = buildSeries(byDate, from, today, today, 0, pickNutrient(n.key), n.key);
        const values = weekly ? buildSeriesWeeks(points).map((w) => w.value) : points.map((p) => p.value);
        return { n, summary: summarizeSeries(points), values };
      }),
    [byDate, from, today, weekly],
  );
  const anyAtLeast = rows.some((r) => r.summary.atLeast && r.summary.withValue > 0);

  useEffect(() => {
    if (scrollTo) document.getElementById(`nut-row-${scrollTo}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [scrollTo]);

  return (
    <section class="card" aria-labelledby="nut-title" data-testid="nutrients-card">
      <h2 class="card-title" id="nut-title">
        Label nutrients <span class="hint-inline">a day, on average</span>
      </h2>
      <ul class="nut-rows">
        {rows.map(({ n, summary, values }) => {
          const has = summary.withValue > 0;
          const atLeast = summary.atLeast && has;
          const isOpen = open === n.metric;
          return (
            <li class="nut-item" key={n.metric} data-testid={`nut-${n.metric}`}>
              <button
                type="button"
                class="nut-row"
                id={`nut-row-${n.metric}`}
                aria-expanded={isOpen}
                aria-controls={`nut-panel-${n.metric}`}
                onClick={() => onToggle(n.metric)}
                data-testid="nut-row"
              >
                <span class="nut-name">
                  <span class="nut-title">{n.name}</span>
                  {atLeast && <span class="nut-note">at least, some entries didn't report it</span>}
                  {!has && <span class="nut-note">Not reported in this range</span>}
                </span>
                <Sparkline values={values} />
                <span class="nut-avg tabular" data-testid="nut-avg">
                  {has ? (
                    `${atLeast ? 'at least ' : ''}${nutrientText(n.unit, summary.average!)}`
                  ) : (
                    <span class="mn-unknown" role="img" aria-label="not reported">
                      —
                    </span>
                  )}
                </span>
              </button>
              {isOpen && (
                <NutrientPanel
                  nutrient={n}
                  view={view}
                  avgDays={avgDays}
                  summary={summary}
                  weekly={weekly}
                  id={`nut-panel-${n.metric}`}
                />
              )}
            </li>
          );
        })}
      </ul>
      <p class="hint">Tap a nutrient for its chart. No target lines until targets are chosen.</p>
      {anyAtLeast && (
        <p class="hint" data-testid="nut-at-least-note">
          At least: some entries don't have this one.
        </p>
      )}
    </section>
  );
}

function NutrientPanel({
  nutrient: n,
  view,
  avgDays,
  summary,
  weekly,
  id,
}: {
  nutrient: Nutrient;
  view: TabView;
  avgDays: number;
  summary: SeriesSummary;
  weekly: boolean;
  id: string;
}) {
  const { byDate, from, today, rangeText } = view;
  const points: SeriesPoint[] = useMemo(
    () => buildSeries(byDate, from, today, today, avgDays, pickNutrient(n.key), n.key),
    [byDate, from, today, avgDays, n.key],
  );
  const weeks: SeriesWeek[] = useMemo(() => (weekly ? buildSeriesWeeks(points) : []), [weekly, points]);
  const has = summary.withValue > 0;
  const text = has
    ? `${summary.atLeast ? 'at least ' : ''}${nutrientText(n.unit, summary.average!)} a day, on average · ${summary.logged} of ${summary.total} days logged`
    : '—';
  return (
    <div class="nut-panel" id={id} role="region" aria-labelledby={`nut-row-${n.metric}`} data-testid="nut-panel">
      <p class="nut-panel-title">
        {n.name} <span class="hint-inline">· {n.unit} a day</span>
      </p>
      <SeriesChart
        idPrefix={`nut-${n.metric}`}
        name={`${n.name}, ${n.unit} a day, ${rangeText}`}
        points={points}
        weeks={weeks}
        weekly={weekly}
        avgDays={avgDays}
        today={today}
        summary={text}
        fmt={(v) => nutrientText(n.unit, v)}
        dayLabel="Day"
        noValue="logged, but nothing reported this"
      />
    </div>
  );
}

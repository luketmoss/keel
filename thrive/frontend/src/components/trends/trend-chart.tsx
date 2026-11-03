// The Trends chart primitive (#242 AC2, AC3): one card per metric, each day a
// dot, the rolling average a line that breaks at a gap longer than its window, and "your range"
// a flat band behind both. Hand-rolled inline SVG, no chart library: every
// mark stays in the DOM, and `var(--chart-*)` follows the theme with no
// redraw. A change of range or average is a swap, never an animation.
//
// Charts show and never conclude: no arrows, no comparisons, no good/bad
// colour, no judging words.

import { useLayoutEffect, useState } from 'preact/hooks';
import type { TrendGroup, TrendMetric } from './metrics';
import type { HeldSeries } from './held';
import {
  RANGE_PHRASE,
  type RangeKey,
  dateTicks,
  dayAtX,
  rowDate,
  segments,
  tickLabel,
  windowText,
  yDomain,
  type MetricSeries,
} from './series';
import { BLANK, withUnit } from './readout';
import { heldRuns, sourceWords } from './held';
import { TrendReadout } from './trend-readout';

/** Width drawn before the card has been measured (and in jsdom). */
export const DEFAULT_CHART_WIDTH = 300;
export const CHART_HEIGHT = 180;
/** Fixed, not fitted to the labels, so stacked cards share their x positions. */
export const PAD_LEFT = 40;
const PAD_TOP = 8;
const PAD_RIGHT = 6;
const PAD_BOTTOM = 22;
const MIN_DOT_R = 1.5;
/** Centre-line radius of the selected day's marker: 4 px of fill inside a 2 px ring. */
const MARKER_R = 5;

/** "resting HR" from "Resting HR": the label mid-sentence. */
export function midSentence(label: string): string {
  return /^[A-Z][a-z]/.test(label) ? label[0].toLowerCase() + label.slice(1) : label;
}

/** "Your range 48–56 bpm (Aug 28 – Sep 26)". */
export function rangeText(metric: TrendMetric, s: MetricSeries, today: string): string | null {
  if (!s.band) return null;
  const { lo, hi, from, to } = s.band;
  return `${withUnit(`Your range ${metric.format(lo)}–${metric.format(hi)}`, metric.unit)} ${windowText(from, to, today)}`;
}

/**
 * A held value's summary (#772): "Current 262 W since Nov 7 · 2 entries in range". What is in effect
 * today and how many entries the range holds, and nothing that compares them.
 */
export function heldSummaryText(metric: TrendMetric, held: HeldSeries): string {
  const cur = held.current;
  if (!cur) return '';
  const value = cur.value === null ? BLANK : withUnit(metric.format(cur.value), metric.unit);
  const head = `Current ${value} since ${cur.sinceText}`;
  if (cur.value === null) return `${head} · no weight that day`;
  const n = held.entries.length;
  return `${head} · ${n === 0 ? 'No entries in this range' : n === 1 ? '1 entry in range' : `${n} entries in range`}`;
}

/** The card's summary line: average, coverage, your range. */
export function summaryText(metric: TrendMetric, s: MetricSeries, today: string): string {
  if (s.held) return heldSummaryText(metric, s.held);
  const out: string[] = [];
  // A total over one day is no average (#521).
  if (s.mean !== null && !(metric.bars && s.covered < 2)) {
    out.push(withUnit(`Average ${metric.format(s.mean)}`, metric.unit));
  }
  out.push(`${s.covered} of ${s.dates.length} days`);
  const goal = metric.reference?.();
  if (goal) out.push(`${goal.label.charAt(0).toUpperCase()}${goal.label.slice(1)}`);
  const r = rangeText(metric, s, today);
  if (r) out.push(r);
  return out.join(' · ');
}

/** Tracks an element's content width, for a chart that takes its card's width. */
function useWidth(): [(el: HTMLDivElement | null) => void, number] {
  const [width, setWidth] = useState(DEFAULT_CHART_WIDTH);
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    if (!node) return;
    const measure = () => {
      const w = Math.floor(node.clientWidth);
      if (w > 0) setWidth(w);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    return () => ro.disconnect();
  }, [node]);
  return [setNode, width];
}

interface PlotProps {
  metric: TrendMetric;
  series: MetricSeries;
  width: number;
  label: string;
  describedBy: string;
  /** The average's window in days: the longest gap its line joins (#407). */
  avgDays?: number;
  /** The day the group has selected (#247), if any. */
  selectedDate?: string | null;
  /** A pointer chose a day. The screen decides what that means. */
  onSelect?: (date: string) => void;
}

/** The SVG itself. Exported for tests; cards use it through TrendCard. */
export function TrendPlot({
  metric,
  series,
  width,
  label,
  describedBy,
  avgDays = 1,
  selectedDate,
  onSelect,
}: PlotProps) {
  const values = series.points.map((p) => p.value);
  for (const v of series.average.values()) values.push(v);
  // A held value's line runs through days with no entry, and may begin at an entry before the range.
  if (series.held) {
    for (const c of series.held.cells.values()) if (c.value !== null) values.push(c.value);
  }
  const reference = metric.reference?.() ?? null;
  const dom = yDomain(reference ? [...values, reference.value] : values, series.band, metric.zeroBased);
  const tickLabels = dom.ticks.map((t) =>
    metric.axisFormat ? metric.axisFormat(t, dom.ticks) : tickLabel(t, dom.ticks),
  );
  const padLeft = PAD_LEFT;
  const plotW = Math.max(40, width - padLeft - PAD_RIGHT);
  const plotH = CHART_HEIGHT - PAD_TOP - PAD_BOTTOM;
  const n = series.dates.length;
  const slot = plotW / n;
  const index = new Map(series.dates.map((d, i) => [d, i]));
  const x = (date: string) => padLeft + (index.get(date)! + 0.5) * slot;
  const y = (v: number) => PAD_TOP + (1 - (v - dom.min) / (dom.max - dom.min || 1)) * plotH;
  const r = Math.min(3.5, Math.max(MIN_DOT_R, slot * 0.35));
  const barW = Math.max(1, slot * 0.7);
  const avgPoints = [...series.average].map(([date, value]) => ({ date, value }));
  const xTicks = dateTicks(series.dates[0], series.dates[n - 1], plotW);
  const selected = selectedDate && index.has(selectedDate) ? selectedDate : null;
  // A held value's marker sits on the step line: its dot's own kind on an entry's day, else the plain marker.
  const selectedCell = selected && series.held ? series.held.cells.get(selected) : undefined;
  const selectedPoint = selected
    ? series.held
      ? selectedCell && selectedCell.value !== null
        ? {
            date: selected,
            value: selectedCell.value,
            partial: selectedCell.entry && selectedCell.source !== 'ramp_test' ? '' : undefined,
          }
        : undefined
      : series.points.find((p) => p.date === selected)
    : undefined;

  // Pointer x → plot x, through the svg's own scale (it is width:100%), → a day.
  const pick = (e: PointerEvent) => {
    if (!onSelect) return;
    const svg = e.currentTarget as SVGSVGElement;
    const rect = svg.getBoundingClientRect();
    const scale = rect.width > 0 ? width / rect.width : 1;
    onSelect(dayAtX(series.dates, (e.clientX - rect.left) * scale, padLeft, plotW));
  };

  return (
    <svg
      class="trend-plot"
      role="img"
      aria-label={label}
      aria-describedby={describedBy}
      viewBox={`0 0 ${width} ${CHART_HEIGHT}`}
      width={width}
      height={CHART_HEIGHT}
      onPointerDown={pick}
      onPointerMove={pick}
    >
      {series.band &&
        (() => {
          const top = y(series.band.hi);
          const h = Math.max(1, y(series.band.lo) - top);
          return (
            <rect
              class="trend-band"
              x={padLeft}
              y={h === 1 ? top - 0.5 : top}
              width={plotW}
              height={h}
              fill="var(--chart-band)"
            />
          );
        })()}
      <g class="trend-grid">
        {dom.ticks.map((t, i) => (
          <g key={t}>
            <line x1={padLeft} x2={padLeft + plotW} y1={y(t)} y2={y(t)} stroke="var(--chart-grid)" stroke-width={1} />
            <text x={padLeft - 6} y={y(t)} text-anchor="end" dominant-baseline="middle" class="trend-axis-label">
              {tickLabels[i]}
            </text>
          </g>
        ))}
      </g>
      <g class="trend-x-axis">
        {xTicks.map((t) => (
          <text key={t.date} x={x(t.date)} y={CHART_HEIGHT - 6} text-anchor="middle" class="trend-axis-label">
            {t.label}
          </text>
        ))}
      </g>
      {metric.bars && (
        <g class="trend-bars">
          {series.points.map((p) => (
            <rect
              key={p.date}
              class="trend-bar"
              data-date={p.date}
              x={x(p.date) - barW / 2}
              y={y(p.value)}
              width={barW}
              height={Math.max(0, y(dom.min) - y(p.value))}
              // The Day cards' colours (--metric-water, --metric-coffee, --metric-alcohol, --metric-unwind): a bars metric's id names its token.
              fill={`var(--metric-${metric.id})`}
            />
          ))}
        </g>
      )}
      {reference && (
        <g class="trend-reference">
          <line
            x1={padLeft}
            x2={padLeft + plotW}
            y1={y(reference.value)}
            y2={y(reference.value)}
            stroke="var(--color-text-secondary)"
            stroke-width={1.5}
            stroke-dasharray="5 4"
          />
          <text x={padLeft + plotW} y={y(reference.value) - 4} text-anchor="end" class="trend-axis-label">
            {reference.label}
          </text>
        </g>
      )}
      <g class="trend-dots">
        {(metric.bars ? [] : series.points).map((p) =>
          p.kind !== undefined && p.kind !== 'ramp_test' ? (
            // A held value set by hand (#772): a ring, as a ramp test is a filled dot.
            <circle
              key={p.date}
              class="trend-dot trend-dot-hand"
              data-date={p.date}
              data-source={p.kind}
              cx={x(p.date)}
              cy={y(p.value)}
              r={Math.max(r, 3)}
              fill="var(--color-surface)"
              stroke="var(--chart-line)"
              stroke-width={1.5}
            />
          ) : p.partial !== undefined ? (
            <circle
              key={p.date}
              class="trend-dot trend-dot-partial"
              data-date={p.date}
              cx={x(p.date)}
              cy={y(p.value)}
              r={Math.max(r, 2)}
              fill="var(--color-surface)"
              stroke="var(--chart-dot)"
              stroke-width={1.5}
            />
          ) : (
            <circle
              key={p.date}
              class="trend-dot"
              data-date={p.date}
              data-source={p.kind}
              cx={x(p.date)}
              cy={y(p.value)}
              r={p.kind === undefined ? r : Math.max(r, 3)}
              fill={p.kind === undefined ? 'var(--chart-dot)' : 'var(--chart-line)'}
            />
          ),
        )}
      </g>
      {series.held && (
        <g class="trend-held">
          {heldRuns(series.dates, series.held.cells).map((run) => {
            // Flat to the day a new entry takes effect, then straight to its level.
            let d = '';
            run.forEach((p, i) => {
              const px = x(p.date).toFixed(2);
              if (i === 0) d = `M${px} ${y(p.value).toFixed(2)}`;
              else if (p.value !== run[i - 1].value)
                d += ` L${px} ${y(run[i - 1].value).toFixed(2)} L${px} ${y(p.value).toFixed(2)}`;
            });
            const last = run[run.length - 1];
            d += ` L${x(last.date).toFixed(2)} ${y(last.value).toFixed(2)}`;
            if (run.length === 1) d += ' l0 0';
            return (
              <path
                key={run[0].date}
                class="trend-line trend-step"
                fill="none"
                stroke="var(--chart-line)"
                stroke-width={2}
                stroke-linejoin="round"
                stroke-linecap="round"
                d={d}
              />
            );
          })}
        </g>
      )}
      {avgPoints.length > 0 && (
        <g class="trend-average">
          {segments(avgPoints, avgDays).map((seg) => (
            <path
              key={seg[0].date}
              class="trend-line"
              fill="none"
              stroke="var(--chart-line)"
              stroke-width={2}
              stroke-linejoin="round"
              stroke-linecap="round"
              d={
                seg.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(2)} ${y(p.value).toFixed(2)}`).join(' ') +
                (seg.length === 1 ? ' l0 0' : '')
              }
            />
          ))}
        </g>
      )}
      {selected && (
        <g class="trend-selection" pointer-events="none">
          <line
            class="trend-hairline"
            x1={x(selected)}
            x2={x(selected)}
            y1={PAD_TOP}
            y2={PAD_TOP + plotH}
            stroke="var(--color-text-secondary)"
            stroke-width={1}
          />
          {selectedPoint &&
            (selectedPoint.partial !== undefined ? (
              <circle
                class="trend-marker trend-marker-partial"
                cx={x(selected)}
                cy={y(selectedPoint.value)}
                r={MARKER_R}
                fill="var(--color-surface)"
                stroke="var(--color-text)"
                stroke-width={2}
              />
            ) : (
              <circle
                class="trend-marker"
                cx={x(selected)}
                cy={y(selectedPoint.value)}
                r={MARKER_R}
                fill="var(--color-text)"
                stroke="var(--color-surface)"
                stroke-width={2}
              />
            ))}
        </g>
      )}
    </svg>
  );
}

/** Under a held value's plot (#772): what the two dot kinds mean, in words, for the kinds the range draws. */
function HeldLegend({ series }: { series: MetricSeries }) {
  const kinds = new Set(series.points.map((p) => (p.kind === 'ramp_test' ? 'ramp_test' : 'manual')));
  if (kinds.size === 0) return null;
  return (
    <p class="trend-legend">
      {kinds.has('ramp_test') && (
        <span class="trend-legend-item">
          <span class="trend-legend-mark" aria-hidden="true">
            ●
          </span>{' '}
          Ramp test
        </span>
      )}
      {kinds.has('ramp_test') && kinds.has('manual') && ' '}
      {kinds.has('manual') && (
        <span class="trend-legend-item">
          <span class="trend-legend-mark" aria-hidden="true">
            ○
          </span>{' '}
          Set by hand
        </span>
      )}
    </p>
  );
}

/** The held value's entries in the range, newest first (#772): a plain list, never nested cards. */
function HeldEntries({
  metric,
  series,
  range,
  today,
}: {
  metric: TrendMetric;
  series: MetricSeries;
  range: RangeKey;
  today: string;
}) {
  const entries = series.held?.entries ?? [];
  if (entries.length === 0) return null;
  return (
    <ul class="trend-entries" aria-label={`${metric.label} entries, ${RANGE_PHRASE[range]}`}>
      {entries.map((e) => (
        <li class="trend-entry" key={e.date}>
          <span class="trend-entry-date">{rowDate(e.date, today)}</span>{' '}
          <span class="trend-entry-source">{e.value === null ? 'No weight that day' : sourceWords(e.source)}</span>{' '}
          <span class="trend-entry-value">
            {e.value === null ? BLANK : withUnit(metric.format(e.value), metric.unit)}
          </span>
        </li>
      ))}
    </ul>
  );
}

interface CardProps {
  metric: TrendMetric;
  /** The metric's series, built once by the screen (#270). */
  series: MetricSeries;
  /** Whether the metric has any value at all, on any date (not only in range). */
  recorded: boolean;
  range: RangeKey;
  avgDays: number;
  today: string;
  selectedDate?: string | null;
  onSelect?: (date: string) => void;
}

/** One metric's card: header, summary line and the plot, or its empty state. */
export function TrendCard({ metric, series, recorded, range, avgDays, today, selectedDate, onSelect }: CardProps) {
  const [measure, width] = useWidth();
  const headingId = `trend-${metric.id}-heading`;
  const summaryId = `trend-${metric.id}-summary`;
  const noteId = `trend-${metric.id}-note`;
  // A note ("Outdoor only", #245) is a caveat on the number: announced with the summary.
  const describedBy = metric.note ? `${noteId} ${summaryId}` : summaryId;
  let body;
  if (!recorded) {
    const empty = typeof metric.emptyText === 'function' ? metric.emptyText() : metric.emptyText;
    body = <p class="trend-empty">{empty ?? 'Nothing recorded yet.'}</p>;
  } else if (series.points.length === 0 && !series.held) {
    body = <p class="trend-empty">No {midSentence(metric.label)} in this range.</p>;
  } else {
    body = (
      <>
        {/* Summary and readout share one grid cell, so a selection never moves the card.
            The summary stays in the DOM, only hidden, for the chart's aria-describedby. */}
        <div class={`trend-readout-cell${selectedDate ? ' has-readout' : ''}`}>
          <p class="trend-summary" id={summaryId}>
            {summaryText(metric, series, today)}
          </p>
          {selectedDate && series.dates.includes(selectedDate) && (
            <TrendReadout metric={metric} series={series} date={selectedDate} avgDays={avgDays} today={today} />
          )}
        </div>
        <div class="trend-plot-wrap" ref={measure}>
          <TrendPlot
            metric={metric}
            series={series}
            width={width}
            avgDays={avgDays}
            label={`${metric.label}, ${RANGE_PHRASE[range]}`}
            describedBy={describedBy}
            selectedDate={selectedDate}
            onSelect={onSelect}
          />
        </div>
        {series.held && <HeldLegend series={series} />}
        {series.held && <HeldEntries metric={metric} series={series} range={range} today={today} />}
      </>
    );
  }
  return (
    <section class="trend-card" aria-labelledby={headingId} data-metric={metric.id}>
      <h2 class="trend-card-title" id={headingId}>
        {metric.label}
        {metric.unit && <span class="trend-unit"> {metric.unit}</span>}
      </h2>
      {metric.note && (
        <p class="trend-note" id={noteId}>
          {metric.note}
        </p>
      )}
      {body}
    </section>
  );
}

interface ChartsProps {
  group: TrendGroup;
  /** One per metric of `group`, in order. */
  series: readonly MetricSeries[];
  /** One per metric: does it have any value at all. */
  recorded: readonly boolean[];
  range: RangeKey;
  avgDays: number;
  today: string;
  selectedDate?: string | null;
  onSelect?: (date: string) => void;
}

/** A group as stacked cards, all on the same from..to and so the same x positions. */
export function TrendCharts({ group, series, recorded, range, avgDays, today, selectedDate, onSelect }: ChartsProps) {
  return (
    <div class="trend-cards">
      {group.metrics.map((m, i) => (
        <TrendCard
          key={m.id}
          metric={m}
          series={series[i]}
          recorded={recorded[i]}
          range={range}
          avgDays={avgDays}
          today={today}
          selectedDate={selectedDate}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

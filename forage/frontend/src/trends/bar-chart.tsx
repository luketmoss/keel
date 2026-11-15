// #913: Forage's bar chart, for every Trends tab (rules in forage/docs/design/913-trends-screen.md §The chart).
// One bar per item; a gap is a dashed mark, never a zero bar; hatched is not colour alone. One tab stop: arrow keys
// move the selected item, Enter opens it. Nothing animates.
import { useEffect, useRef, useState } from 'preact/hooks';
import { dateTicks, niceScale } from './chart-math';

export interface ChartItem {
  key: string;
  /** The date the item starts on, for the axis. */
  date: string;
  /** `outline` is a bar whose value is "at least" (#914): drawn unfilled, so it is not colour alone. */
  kind: 'bar' | 'hatched' | 'outline' | 'gap';
  value: number | null;
  /** #914: a column of stacked segments from the bottom, in axis units, instead of one bar. */
  stack?: { h: number; cls: string; /** #915: a CSS colour; the segment is hatched in it. */ hatch?: string }[];
  /** #915: a hairline in the surface colour between segments. */
  hairline?: boolean;
}

/** A fixed axis, in place of the zero-based one the values would give (the 100% columns). */
export interface ChartAxis {
  max: number;
  ticks: number[];
  format?: (tick: number) => string;
}

export const CHART_HEIGHT = 200;
const PAD = { left: 44, right: 8, top: 10, bottom: 24 };
const FALLBACK_WIDTH = 320;

interface Props {
  items: ChartItem[];
  /** A line through the items' x positions; null is a break. Absent for none. */
  line: (number | null)[] | null;
  selected: string | null;
  name: string;
  describedBy: string;
  /** `via: 'key'` is for a keyboard move: only it is announced. */
  onSelect: (key: string | null, via: 'pointer' | 'key') => void;
  onOpen: (key: string) => void;
  idPrefix: string;
  axis?: ChartAxis;
}

export function BarChart({ items, line, selected, name, describedBy, onSelect, onOpen, idPrefix, axis }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(FALLBACK_WIDTH);
  const press = useRef<{ index: number; wasSelected: boolean; moved: boolean } | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      const w = Math.round(el.getBoundingClientRect().width);
      if (w > 0) setWidth(w);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = items.length;
  const plotW = Math.max(1, width - PAD.left - PAD.right);
  const plotH = CHART_HEIGHT - PAD.top - PAD.bottom;
  const colW = plotW / Math.max(1, n);
  const peak = Math.max(0, ...items.map((i) => i.value ?? 0), ...(line ?? []).map((v) => v ?? 0));
  const scale = axis ?? niceScale(peak);
  const tickText = axis?.format ?? ((t: number) => t.toLocaleString('en-US'));
  const y = (v: number) => PAD.top + plotH * (1 - v / scale.max);
  const x = (i: number) => PAD.left + colW * (i + 0.5);
  const base = PAD.top + plotH;
  const barW = Math.max(1, Math.min(colW * 0.72, 28));
  const selIndex = selected === null ? -1 : items.findIndex((i) => i.key === selected);
  const hatchId = `${idPrefix}-hatch`;
  // #915: a hatched stack segment is striped in its own colour, one pattern per colour.
  const hatchColors = [
    ...new Set(items.flatMap((i) => (i.stack ?? []).map((s) => s.hatch).filter((c): c is string => !!c))),
  ];

  const indexAt = (clientX: number, svg: Element) => {
    const left = svg.getBoundingClientRect().left;
    const i = Math.floor((clientX - left - PAD.left) / colW);
    if (!Number.isFinite(i)) return 0;
    return Math.max(0, Math.min(n - 1, i));
  };

  function choose(i: number, via: 'pointer' | 'key') {
    if (i < 0 || i >= n) return;
    onSelect(items[i].key, via);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (!n) return;
    let next = -2;
    if (e.key === 'ArrowLeft') next = selIndex < 0 ? n - 1 : Math.max(0, selIndex - 1);
    else if (e.key === 'ArrowRight') next = selIndex < 0 ? n - 1 : Math.min(n - 1, selIndex + 1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = n - 1;
    else if (e.key === 'Enter' && selIndex >= 0) {
      e.preventDefault();
      onOpen(items[selIndex].key);
      return;
    }
    if (next === -2) return;
    e.preventDefault();
    choose(next, 'key');
  }

  function onPointerDown(e: PointerEvent) {
    if (!n) return;
    const i = indexAt(e.clientX, e.currentTarget as Element);
    press.current = { index: i, wasSelected: i === selIndex, moved: false };
    try {
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    } catch {
      // A synthetic pointer has nothing to capture.
    }
    if (i !== selIndex) choose(i, 'pointer');
  }

  function onPointerMove(e: PointerEvent) {
    const p = press.current;
    if (!p) return;
    const i = indexAt(e.clientX, e.currentTarget as Element);
    if (i !== p.index) {
      p.moved = true;
      p.index = i;
      choose(i, 'pointer');
    }
  }

  function onPointerUp() {
    const p = press.current;
    press.current = null;
    // Tapping the selected day again clears it.
    if (p && p.wasSelected && !p.moved) onSelect(null, 'pointer');
  }

  // The line: runs of consecutive points, broken at a null; a run of one is a dot.
  const runs: { i: number; v: number }[][] = [];
  if (line) {
    let cur: { i: number; v: number }[] = [];
    line.forEach((v, i) => {
      if (v === null) {
        if (cur.length) runs.push(cur);
        cur = [];
      } else cur.push({ i, v });
    });
    if (cur.length) runs.push(cur);
  }

  return (
    <div
      ref={box}
      class="chart"
      role="img"
      tabIndex={0}
      aria-label={name}
      aria-describedby={describedBy}
      onKeyDown={onKeyDown}
      data-testid="chart"
    >
      <svg
        width={width}
        height={CHART_HEIGHT}
        viewBox={`0 0 ${width} ${CHART_HEIGHT}`}
        class="chart-svg"
        aria-hidden="true"
        focusable="false"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <defs>
          <pattern id={hatchId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" class="chart-hatch-bg" />
            <rect width="3" height="6" class="chart-hatch-stripe" />
          </pattern>
          {hatchColors.map((c, k) => (
            <pattern
              key={c}
              id={`${hatchId}-${k}`}
              width="6"
              height="6"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <rect width="6" height="6" class="chart-hatch-bg" />
              <rect width="3" height="6" style={{ fill: c }} />
            </pattern>
          ))}
        </defs>
        {scale.ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} class="chart-grid" />
            <text x={PAD.left - 6} y={y(t)} class="chart-axis" text-anchor="end" dominant-baseline="middle">
              {tickText(t)}
            </text>
          </g>
        ))}
        {dateTicks(
          items.map((i) => i.date),
          plotW,
        ).map((t) => (
          <text
            key={t.index}
            x={t.index === n - 1 && n > 1 ? width - PAD.right : t.index === 0 ? PAD.left : x(t.index)}
            y={CHART_HEIGHT - 6}
            class="chart-axis"
            text-anchor={t.index === n - 1 && n > 1 ? 'end' : t.index === 0 ? 'start' : 'middle'}
          >
            {t.text}
          </text>
        ))}
        {items.map((it, i) => {
          if (it.kind === 'gap' || it.value === null) {
            const w = Math.max(2, Math.min(barW, 10));
            return (
              <line
                key={it.key}
                x1={x(i) - w / 2}
                x2={x(i) + w / 2}
                y1={base - 1}
                y2={base - 1}
                class="chart-gap"
                data-testid="chart-bar"
                data-kind="gap"
                data-key={it.key}
              />
            );
          }
          if (it.stack) {
            let acc = 0;
            return (
              <g key={it.key} data-testid="chart-bar" data-kind="stack" data-key={it.key}>
                {it.stack.map((seg, k) => {
                  const lo = y(acc);
                  acc += seg.h;
                  const hi = y(acc);
                  return (
                    <rect
                      key={k}
                      x={x(i) - barW / 2}
                      y={hi}
                      width={barW}
                      height={Math.max(0, lo - hi)}
                      class={it.hairline ? `${seg.cls} chart-seg-line` : seg.cls}
                      style={seg.hatch ? { fill: `url(#${hatchId}-${hatchColors.indexOf(seg.hatch)})` } : undefined}
                      data-testid="chart-seg"
                      data-hatched={seg.hatch ? 'true' : undefined}
                    />
                  );
                })}
              </g>
            );
          }
          const top = y(it.value);
          return (
            <rect
              key={it.key}
              x={x(i) - barW / 2}
              y={top}
              width={barW}
              height={Math.max(1, base - top)}
              class={
                it.kind === 'hatched'
                  ? 'chart-bar chart-bar-hatched'
                  : it.kind === 'outline'
                    ? 'chart-bar chart-bar-outline'
                    : 'chart-bar'
              }
              style={it.kind === 'hatched' ? { fill: `url(#${hatchId})` } : undefined}
              data-testid="chart-bar"
              data-kind={it.kind}
              data-key={it.key}
            />
          );
        })}
        {runs.map((run, r) =>
          run.length === 1 ? (
            <circle
              key={r}
              cx={x(run[0].i)}
              cy={y(run[0].v)}
              r="2.5"
              class="chart-line-dot"
              data-testid="chart-line-dot"
            />
          ) : (
            <path
              key={r}
              d={run.map((p, k) => `${k ? 'L' : 'M'}${x(p.i).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' ')}
              class="chart-line"
              data-testid="chart-line"
            />
          ),
        )}
        {selIndex >= 0 && (
          <g class="chart-selected" data-testid="chart-selected" data-key={items[selIndex].key}>
            <line x1={x(selIndex)} x2={x(selIndex)} y1={PAD.top} y2={base} class="chart-hairline" />
            {items[selIndex].value !== null && !items[selIndex].stack && (
              <circle cx={x(selIndex)} cy={y(items[selIndex].value!)} r="4" class="chart-marker" />
            )}
          </g>
        )}
      </svg>
    </div>
  );
}

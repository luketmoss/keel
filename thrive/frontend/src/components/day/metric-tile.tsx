// #491 — the Day screen's metric tiles: resting HR, HRV and average stress,
// two to a row, each a value with its last two weeks (or week) drawn under it.
// Replaces #239's Health panel. Reads the `dailyHealth` signal the screen
// already loads. The rules (the window, your range, the zone) are `vitalsView`
// in `health-rows.ts`; this only draws them. Never mounts on a future day.
//
// While the tab is not loaded, one card titled "Health" says so with
// PanelStatus for the whole area: the glance row and the Sleep card draw
// nothing until then.

import type { ComponentChildren } from 'preact';
import { useRef } from 'preact/hooks';
import { dailyHealth } from '../../state/store';
import { loadHealth } from '../../state/actions';
import { useAuth } from '../../auth/auth-context';
import { Panel, PanelNote, PanelStatus, type DayPanelProps } from './panel';
import { tileCaptionText, vitalsView, type TileCaption, type TileView, type VitalKey } from './health-rows';

// Drawn in the house style (#405) and kept here, as the shared icon set is counted by its tests.
function Icon({ children }: { children: ComponentChildren }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

const ICONS: Record<VitalKey, ComponentChildren> = {
  // A heart.
  resting_hr: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />,
  // A pulse trace.
  hrv: <path d="M3 12h4l2-5 4 10 2-5h6" />,
  // A gauge.
  stress: (
    <>
      <path d="M4.5 17a8.5 8.5 0 1 1 15 0" />
      <path d="M12 13l3.5-3.5" />
    </>
  ),
};

// ── The 14-day line ─────────────────────────────────────────────────

export const LINE_W = 140;
export const LINE_H = 32;

export interface LineGeometry {
  /** One path per run of consecutive values: a blank day breaks the line. */
  runs: string[];
  /** Lone values between blanks, and the viewed day's point, as dots. */
  dots: [number, number][];
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * The line through `days` (oldest first, `null` blank) in a 140 × 32 box: y
 * scaled to the values' own min and max, padded by 10% of their spread and at
 * least 1 unit. Never a zero or an interpolation for a blank.
 */
export function lineGeometry(days: readonly (number | null)[]): LineGeometry {
  const present = days.filter((v): v is number => v !== null);
  if (present.length === 0) return { runs: [], dots: [] };
  const min = Math.min(...present);
  const max = Math.max(...present);
  const pad = Math.max((max - min) * 0.1, 1);
  const lo = min - pad;
  const span = max + pad - lo;
  const step = days.length > 1 ? LINE_W / (days.length - 1) : 0;
  const pt = (v: number, i: number): [number, number] => [r1(i * step), r1(LINE_H - ((v - lo) / span) * LINE_H)];

  const runs: string[] = [];
  const dots: [number, number][] = [];
  let run: [number, number][] = [];
  const close = () => {
    if (run.length > 1) runs.push(run.map(([x, y], j) => `${j ? 'L' : 'M'}${x} ${y}`).join(' '));
    else if (run.length === 1) dots.push(run[0]);
    run = [];
  };
  days.forEach((v, i) => (v === null ? close() : run.push(pt(v, i))));
  const last = days[days.length - 1];
  const end = last === null ? null : run[run.length - 1];
  close();
  if (end && !dots.some(([x, y]) => x === end[0] && y === end[1])) dots.push(end);
  return { runs, dots };
}

function Line({ days }: { days: (number | null)[] }) {
  const { runs, dots } = lineGeometry(days);
  return (
    <svg
      class="tile-line"
      viewBox={`0 0 ${LINE_W} ${LINE_H}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      {runs.map((d, i) => (
        <path key={`r${i}`} class="tile-line-run" d={d} vector-effect="non-scaling-stroke" />
      ))}
      {dots.map(([x, y], i) => (
        <path key={`d${i}`} class="tile-line-dot" d={`M${x} ${y}h0`} vector-effect="non-scaling-stroke" />
      ))}
    </svg>
  );
}

// ── The range bar ───────────────────────────────────────────────────

/**
 * Where the band and the marker sit, in percent of the bar: the scale runs
 * from min(lo, value) to max(hi, value), widened by 15% of the range's width
 * (at least 1 unit) each side. A marker outside it is pinned to the end.
 */
export function rangeScale(lo: number, hi: number, value: number): { band: [number, number]; marker: number } {
  const pad = Math.max((hi - lo) * 0.15, 1);
  const from = Math.min(lo, value) - pad;
  const to = Math.max(hi, value) + pad;
  const at = (n: number) => r1(Math.min(100, Math.max(0, ((n - from) / (to - from)) * 100)));
  return { band: [at(lo), at(hi)], marker: at(value) };
}

function RangeBar({ bar }: { bar: NonNullable<TileView['bar']> }) {
  const { band, marker } = rangeScale(bar.lo, bar.hi, bar.value);
  return (
    <div class="tile-range" aria-hidden="true">
      <span class="tile-range-band" style={{ left: `${band[0]}%`, width: `${r1(band[1] - band[0])}%` }} />
      <span
        class={bar.attention ? 'tile-range-marker tile-range-attention' : 'tile-range-marker'}
        style={{ left: `${marker}%` }}
      />
    </div>
  );
}

// ── Stress: seven bars ──────────────────────────────────────────────

/** COROS's stress rarely passes 60; higher fills the bar. */
export const STRESS_FULL = 60;

function Bars({ days, label }: { days: (number | null)[]; label: string }) {
  const spoken = days.map((v) => (v === null ? 'no data' : String(Math.round(v)))).join(', ');
  return (
    <div class="tile-bars" role="img" aria-label={`${label}, last ${days.length} days: ${spoken}`}>
      {days.map((v, i) => (
        <span key={i} class="tile-bar-slot">
          {v !== null && (
            <span
              class={i === days.length - 1 ? 'tile-bar tile-bar-viewed' : 'tile-bar'}
              style={{ height: `${r1((Math.min(Math.max(v, 0), STRESS_FULL) / STRESS_FULL) * 100)}%` }}
            />
          )}
        </span>
      ))}
    </div>
  );
}

// ── A tile ──────────────────────────────────────────────────────────

function Caption({ c }: { c: TileCaption }) {
  if (c.kind === 'range') {
    return (
      <p class="tile-caption">
        {`${c.bounds} · `}
        {c.zone === 'within' ? (
          <span class="tile-zone">in range</span>
        ) : (
          <ZoneWords zone={c.zone} attention={c.attention} />
        )}
      </p>
    );
  }
  return <p class="tile-caption">{tileCaptionText(c)}</p>;
}

/** The arrow is hidden from screen readers; the word carries it. Never colour alone. */
function ZoneWords({ zone, attention }: { zone: 'above' | 'below'; attention: boolean }) {
  return (
    <span class={attention ? 'tile-zone tile-attention' : 'tile-zone'}>
      <span aria-hidden="true">{zone === 'above' ? '↑ ' : '↓ '}</span>
      {zone}
    </span>
  );
}

export function MetricTile({ tile }: { tile: TileView }) {
  return (
    <div class={`metric-tile metric-tile-${tile.key}`} data-metric={tile.key}>
      <Panel title={tile.label} icon={<Icon>{ICONS[tile.key]}</Icon>}>
        <p class={tile.value === null ? 'tile-value tile-value-blank' : 'tile-value'}>
          {tile.value ?? '—'}
          {tile.value !== null && tile.unit && <span class="tile-unit">{` ${tile.unit}`}</span>}
          {tile.soFar && <span class="tile-unit"> so far</span>}
        </p>
        {tile.chart === 'line' ? <Line days={tile.days} /> : <Bars days={tile.days} label={tile.label} />}
        {tile.bar && <RangeBar bar={tile.bar} />}
        <Caption c={tile.caption} />
      </Panel>
    </div>
  );
}

/** The `vitals` slot: the tiles, two to a row (in the Day screen's `.vitals` grid), or one "Health" card in their place. */
export function VitalsTiles({ date, state }: DayPanelProps) {
  const { token } = useAuth();
  const ref = useRef<HTMLDivElement>(null);
  const tab = dailyHealth.value;
  if (tab.state !== 'loaded') {
    return (
      <div class="vitals-one" ref={ref}>
        <Panel title="Health">
          <PanelStatus
            status={tab.state}
            what="your health data"
            onRetry={() => {
              if (token) void loadHealth(token);
            }}
            // A retry that lands swaps this card for the tiles: focus goes to the first heading there.
            returnFocusTo={() => ref.current?.querySelector<HTMLElement>('h2.day-panel-title')}
          />
        </Panel>
      </div>
    );
  }
  const view = vitalsView(tab.rows, date, state === 'today');
  if (view.kind === 'note') {
    return (
      <div class="vitals-one" ref={ref}>
        <Panel title="Health" sub={view.sub}>
          <PanelNote>{view.note}</PanelNote>
        </Panel>
      </div>
    );
  }
  // The tiles are grid items of the `.vitals` grid the Day screen wraps this slot
  // and `body` in (#492), so Body sits beside stress as the fourth.
  return (
    <>
      {view.tiles.map((t) => (
        <MetricTile key={t.key} tile={t} />
      ))}
    </>
  );
}

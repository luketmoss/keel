// The ride hero of an indoor Spin ride's detail screen (#771): a power panel (target blocks coloured by
// zone, the power line, an FTP line, pause marks) over a heart-rate panel on one time axis, then the
// axis and a legend. Small multiples, never two y-scales over one plot. It stands where the map hero
// stands for an outdoor activity, and every state fills the same box, so nothing below it moves.
//
// The drawing reads buckets (api/spin-streams.ts `bucketize`), never raw seconds. A null bucket breaks
// a line and draws no block; it is never drawn as 0.

import type { Bucket, RideDerived } from '../../api/spin-streams';
import type { RideStreamsState } from '../../spin/streams-cache';
import { zoneOf, zoneVar } from '../../spin/zones';
import { formatClock } from './activities-helpers';

/** The drawing's coordinate space: x is 0 to W across the ride's seconds, y is 0 to H, top down. */
const W = 1000;
const H = 100;

const num = (x: number) => x.toFixed(1);

/** The panel's y scale tops out at 110% of the largest power, target and FTP, so nothing clips. */
export function powerTop(buckets: readonly Bucket[], ftp: number | null): number {
  let max = ftp ?? 0;
  for (const b of buckets) {
    if (b.power !== null && b.power > max) max = b.power;
    if (b.target !== null && b.target > max) max = b.target;
  }
  return max > 0 ? max * 1.1 : 100;
}

/** Path data for a series: one subpath per unbroken run, and a lone point as a dot of the line's width. */
export function linePath(points: readonly ({ x: number; y: number } | null)[]): string {
  const parts: string[] = [];
  let run: { x: number; y: number }[] = [];
  const flush = () => {
    if (run.length === 1) parts.push(`M${num(run[0].x)},${num(run[0].y)} h0.01`);
    else if (run.length > 1) parts.push(run.map((p, i) => `${i ? 'L' : 'M'}${num(p.x)},${num(p.y)}`).join(' '));
    run = [];
  };
  for (const p of points) {
    if (p === null) flush();
    else run.push(p);
  }
  flush();
  return parts.join(' ');
}

/** Four axis labels: 0 and thirds of the ride, to the minute (to the second under a minute). */
export function axisLabels(seconds: number): string[] {
  return [0, 1, 2, 3].map((i) => {
    const t = (seconds * i) / 3;
    return formatClock(seconds >= 60 ? Math.round(t / 60) * 60 : Math.round(t));
  });
}

/** The figure's accessible name. */
export function rideChartName(ride: RideDerived): string {
  let name = `Power against target over ${formatClock(ride.seconds)}`;
  if (ride.hrRange) name += `, heart rate ${ride.hrRange.low} to ${ride.hrRange.high} bpm`;
  if (ride.pauses.length === 1) name += ', 1 pause';
  else if (ride.pauses.length > 1) name += `, ${ride.pauses.length} pauses`;
  return name;
}

function PauseMarks({ ride }: { ride: RideDerived }) {
  return (
    <>
      {ride.pauses.map((p, i) => {
        const x = (p.at_s / ride.seconds) * W;
        return <line key={i} class="ride-pause-mark" x1={x} x2={x} y1={0} y2={H} />;
      })}
    </>
  );
}

function PowerPanel({ ride }: { ride: RideDerived }) {
  const { buckets, ftp, seconds } = ride;
  const top = powerTop(buckets, ftp);
  const y = (w: number) => H - (w / top) * H;
  const bucketW = W / buckets.length;
  const line = linePath(buckets.map((b) => (b.power === null ? null : { x: (b.x / seconds) * W, y: y(b.power) })));
  return (
    <div class="ride-panel ride-power-panel">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
        {buckets.map((b, i) => {
          if (b.target === null) return null;
          const x = (b.x / seconds) * W - bucketW / 2;
          const fill = ftp ? zoneVar(zoneOf(b.target, ftp)) : 'var(--color-border)';
          return (
            <rect
              key={i}
              class="ride-target-block"
              x={num(x)}
              y={num(y(b.target))}
              width={num(bucketW)}
              height={num(H - y(b.target))}
              fill={fill}
            />
          );
        })}
        {ftp && <line class="ride-ftp-line" x1={0} x2={W} y1={y(ftp)} y2={y(ftp)} />}
        <PauseMarks ride={ride} />
        {line && <path class="ride-power-line" d={line} />}
      </svg>
      {ftp && (
        <span class="ride-ftp-label" style={{ bottom: `calc(${((ftp / top) * 100).toFixed(2)}% + 2px)` }}>
          FTP {ftp} W
        </span>
      )}
    </div>
  );
}

function HeartPanel({ ride }: { ride: RideDerived }) {
  const { buckets, seconds, hrRange } = ride;
  if (!hrRange) return null;
  const hrs = buckets.flatMap((b) => (b.hr === null ? [] : [b.hr]));
  const lo = Math.min(...hrs) - 5;
  const hi = Math.max(...hrs) + 5;
  const y = (v: number) => H - ((v - lo) / (hi - lo)) * H;
  const line = linePath(buckets.map((b) => (b.hr === null ? null : { x: (b.x / seconds) * W, y: y(b.hr) })));
  return (
    <div class="ride-panel ride-hr-panel">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <PauseMarks ride={ride} />
        {line && <path class="ride-hr-line" d={line} />}
      </svg>
      <span class="ride-hr-label">
        {hrRange.low}–{hrRange.high} bpm
      </span>
    </div>
  );
}

function Legend({ ride }: { ride: RideDerived }) {
  return (
    <ul class="ride-legend">
      <li>
        <span class="ride-swatch ride-swatch-power" aria-hidden="true" />
        Power
      </li>
      <li>
        <span class="ride-swatch ride-swatch-target" aria-hidden="true" />
        Target
      </li>
      {ride.hasHr && (
        <li>
          <span class="ride-swatch ride-swatch-hr" aria-hidden="true" />
          Heart rate
        </li>
      )}
      {ride.pauses.length > 0 && (
        <li>
          <span class="ride-swatch ride-swatch-pause" aria-hidden="true" />
          Pause
        </li>
      )}
    </ul>
  );
}

/** The hero's box and the state in it: loading, error, too short, or the figure. */
export function RideHero({ state }: { state: RideStreamsState }) {
  const { status, ride, retry } = state;
  const ready = status === 'ready' && ride !== null;
  return (
    <div class="detail-hero detail-ride-hero">
      {!ready && status !== 'error' && (
        <div class="ride-hero-status" role="status" aria-busy="true">
          <p>Loading ride…</p>
        </div>
      )}
      {status === 'error' && (
        <div class="ride-hero-status" role="status">
          <p>Couldn't load the ride's power data.</p>
          <button class="btn btn-secondary" type="button" onClick={retry}>
            Try again
          </button>
        </div>
      )}
      {ready && ride.seconds < 2 && (
        <div class="ride-hero-status">
          <p>This ride is too short to draw.</p>
        </div>
      )}
      {ready && ride.seconds >= 2 && (
        <figure class="ride-figure" role="img" aria-label={rideChartName(ride)}>
          <PowerPanel ride={ride} />
          <HeartPanel ride={ride} />
          <div class="ride-axis" aria-hidden="true">
            {axisLabels(ride.seconds).map((label, i) => (
              <span key={i} class={`ride-axis-label ride-axis-${i}`}>
                {label}
              </span>
            ))}
          </div>
          <div aria-hidden="true">
            <Legend ride={ride} />
          </div>
        </figure>
      )}
    </div>
  );
}

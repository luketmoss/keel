// The Intervals card of a Spin ride (#771): one row per step that lasted a second or more, with its
// target, the power and heart rate actually ridden. A real table, the data alternative to the chart.
// Hidden when the ride has fewer than two such steps and none with a target (a free ride says nothing a
// table would add). "—" means no reading, which the chart's gap already shows.

import { showIntervals, type RideDerived } from '../../api/spin-streams';
import { zoneVar } from '../../spin/zones';
import { formatClock } from './activities-helpers';

export function RideIntervals({ ride }: { ride: RideDerived }) {
  const rows = ride.intervals;
  if (!showIntervals(rows)) return null;
  return (
    <section class="detail-card ride-intervals-card">
      <table class="ride-intervals" aria-labelledby="ride-intervals-heading">
        <caption id="ride-intervals-heading" class="detail-card-heading">
          Intervals
        </caption>
        <colgroup>
          <col />
          <col class="ride-col-target" />
          <col class="ride-col-avg" />
          {ride.hasHr && <col class="ride-col-hr" />}
        </colgroup>
        <thead>
          <tr>
            <th scope="col">Step</th>
            <th scope="col" class="ride-num">
              Target
            </th>
            <th scope="col" class="ride-num">
              Avg
            </th>
            {ride.hasHr && (
              <th scope="col" class="ride-num">
                <abbr title="Heart rate, bpm">HR</abbr>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <th scope="row" class="ride-step">
                <span
                  class="ride-step-swatch"
                  aria-hidden="true"
                  style={{ background: r.zone ? zoneVar(r.zone) : 'var(--color-border)' }}
                />
                <span class="ride-step-text">
                  <span class="ride-step-label">{r.label}</span>
                  <span class="ride-step-duration">{formatClock(r.durationS)}</span>
                </span>
              </th>
              <td class="ride-num ride-target">{r.targetText}</td>
              <td class="ride-num ride-avg">{r.avgPower === null ? '—' : `${r.avgPower} W`}</td>
              {ride.hasHr && <td class="ride-num ride-hr">{r.avgHr === null ? '—' : r.avgHr}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

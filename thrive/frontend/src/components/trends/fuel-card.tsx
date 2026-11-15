// The Fuel and training card (#892): the last element of Trends' Food group. Three rows, no verdict.
// It fails on its own when DailySummary does: it has no x axis and shares nothing with the food cards.

import { useMemo } from 'preact/hooks';
import { useAuth } from '../../auth/auth-context';
import { loadHealth } from '../../state/actions';
import { dailySummary } from '../../state/store';
import { foodHistory } from '../../state/food';
import { formatWhole } from './metrics';
import { RANGE_PHRASE, type RangeKey } from './series';
import { fuelAndTraining } from './fuel-and-training';

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export function FuelCard({ range, from, to, today }: { range: RangeKey; from: string; to: string; today: string }) {
  const { token } = useAuth();
  const summary = dailySummary.value;
  const food = foodHistory.value;
  const foodRows = food.state === 'loaded' ? food.rows : null;
  const summaryRows = summary.state === 'loaded' ? summary.rows : null;
  const fuel = useMemo(
    () => (foodRows && summaryRows ? fuelAndTraining(foodRows, summaryRows, from, to, today) : null),
    [foodRows, summaryRows, from, to, today],
  );
  let body;
  if (summary.state === 'error') {
    body = (
      <div class="trends-error" role="alert">
        <p>Couldn't load your activity data.</p>
        <button
          type="button"
          class="btn btn-secondary trends-retry"
          onClick={() => {
            if (token) void loadHealth(token);
          }}
        >
          Try again
        </button>
      </div>
    );
  } else if (!fuel) {
    body = (
      <p class="trends-loading" role="status">
        Loading…
      </p>
    );
  } else {
    const max = Math.max(...fuel.rows.map((r) => r.avg ?? 0));
    body = (
      <>
        <ul class="fuel-rows">
          {fuel.rows.map((r) => (
            <li class="fuel-row" key={r.kind} data-kind={r.kind}>
              <span class="sr-only">
                {r.avg === null
                  ? `${r.label}, no days`
                  : `${r.label}, ${formatWhole(r.avg)} kcal on average, ${r.count} ${plural(r.count, 'day', 'days')}`}
              </span>
              <span class="fuel-label" aria-hidden="true">
                {r.label}
              </span>
              <span class="fuel-bar" aria-hidden="true">
                {r.avg !== null && max > 0 && (
                  <span class="fuel-bar-fill" style={{ width: `${(r.avg / max) * 100}%` }} />
                )}
              </span>
              <span class="fuel-figure" aria-hidden="true">
                {r.avg === null ? '—' : `${formatWhole(r.avg)} kcal`}
              </span>
              <span class="fuel-count" aria-hidden="true">
                {r.avg === null ? 'no days' : `${r.count} ${plural(r.count, 'day', 'days')}`}
              </span>
            </li>
          ))}
        </ul>
        <div class="fuel-notes">
          {fuel.lowLeftOut > 0 && (
            <p>
              {fuel.lowLeftOut} low {plural(fuel.lowLeftOut, 'day', 'days')} left out.
            </p>
          )}
          {fuel.otherDays > 0 && (
            <p>
              {fuel.otherDays} {plural(fuel.otherDays, 'day', 'days')} with a run, hike, walk or stretch{' '}
              {plural(fuel.otherDays, 'is', 'are')} in no row.
            </p>
          )}
          <p>A day with a ride and a lift is in both.</p>
        </div>
      </>
    );
  }
  return (
    <section class="trend-card fuel-card" aria-labelledby="fuel-heading" aria-describedby="fuel-sub" data-metric="fuel">
      <h2 class="trend-card-title" id="fuel-heading">
        Fuel and training
      </h2>
      <p class="trend-note" id="fuel-sub">
        Average kcal on days with each kind of training, {RANGE_PHRASE[range]}.
      </p>
      {body}
    </section>
  );
}

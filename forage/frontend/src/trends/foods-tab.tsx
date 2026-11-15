// #916: the Foods tab: what drives a number, your usuals, and most cooked (forage/docs/design/916-trends-foods.md).
// It ranks and counts, so it has no chart; the figures come from foods.ts over the entries read once for the range.
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { ForageApi } from '../api/client';
import { Stars } from '../cook/stars';
import { FoodName } from '../library/food-name';
import { rangeWords } from './chart-math';
import {
  amountText,
  amountWords,
  METRIC_INFO,
  rankCooked,
  rankFoods,
  rankUsuals,
  timesWord,
  type CookedStat,
  type RankedItem,
  type UsualStat,
} from './foods';
import { foodsCooks, foodsFrom, foodsLog, foodsToday, loadFoodsCooks, loadFoodsLog } from './foods-store';
import { Segmented } from './segmented';
import { chooseFoodMetric, viewFoodMetric } from './trends-store';
import { FOOD_METRICS, type FoodMetric, type RangeId } from './trends-types';

const METRIC_LABEL: Record<FoodMetric, string> = {
  kcal: 'Calories',
  protein: 'Protein',
  sodium: 'Sodium',
  added_sugars: 'Added sugars',
};

/** A load running past this long adds a line under the skeleton. */
const SLOW_MS = 3000;

function Failure({ text, onRetry, id }: { text: string; onRetry: () => void; id: string }) {
  return (
    <div class="library-status danger-text" role="status" data-testid={id}>
      <p>{text}</p>
      <button type="button" class="text-btn" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}

function Skeleton({ slow }: { slow?: boolean }) {
  return (
    <div data-testid="foods-skeleton">
      <div class="foods-skeleton-rows" aria-hidden="true">
        <div class="foods-skeleton-row" />
        <div class="foods-skeleton-row" />
        <div class="foods-skeleton-row" />
      </div>
      {slow && (
        <p class="hint" role="status" data-testid="foods-slow">
          Reading a long range can take a moment.
        </p>
      )}
    </div>
  );
}

/** A row's one-sentence name: `Greek yogurt, 31% of sodium, 1,240 milligrams, logged 14 times`. */
export function itemLabel(i: RankedItem, metric: FoodMetric): string {
  return `${i.name}, ${i.shareText} of ${METRIC_INFO[metric].noun}, ${amountWords(metric, i.amount)}, logged ${timesWord(i.times)}`;
}

export function usualLabel(u: UsualStat): string {
  return `${u.name}, added ${timesWord(u.count)}, usually for ${u.slot}`;
}

export function cookedLabel(c: CookedStat): string {
  return `${c.name}, cooked ${timesWord(c.count)}, ${c.rating === null ? 'not rated' : `rated ${c.rating} of 5`}`;
}

function Meter({ pct }: { pct: number }) {
  return (
    <span class="food-meter" aria-hidden="true">
      <span class="food-meter-fill" style={{ width: `${Math.max(2, pct)}%` }} />
    </span>
  );
}

function DrivesCard({ range, api }: { range: RangeId; api: ForageApi }) {
  const metric = viewFoodMetric.value;
  const log = foodsLog.value;
  const info = METRIC_INFO[metric];
  const ranking = useMemo(
    () => rankFoods(log.entries, metric, log.foods, log.recipes),
    [log.entries, log.foods, log.recipes, metric],
  );
  const slow = useSlow(log.state === 'loading');
  const retry = () => void loadFoodsLog(api, range, true);

  let body: preact.ComponentChild;
  if (log.state === 'loading') {
    body = <Skeleton slow={slow} />;
  } else if (log.state === 'error') {
    body = <Failure id="foods-error" text="Couldn't load your log." onRetry={retry} />;
  } else if (ranking.entries === 0) {
    body = (
      <p class="hint" data-testid="foods-none">
        Nothing logged in this range.
      </p>
    );
  } else if (!ranking.reported) {
    body = (
      <p class="hint" data-testid="foods-none-metric">
        None of the entries in this range {info.none}.
      </p>
    );
  } else {
    body = (
      <>
        <ol class="food-rows">
          {ranking.items.map((i, n) => (
            <li class="food-row" key={i.key} role="group" aria-label={itemLabel(i, metric)} data-testid="food-row">
              <span class="food-rank hint-inline tabular" aria-hidden="true">
                {n + 1}
              </span>
              <span class="food-main" aria-hidden="true">
                <span class="food-name" data-testid="food-name">
                  {i.food ? <FoodName food={i.food} /> : i.name}
                </span>
                <Meter pct={i.meter} />
              </span>
              <span class="food-figures tabular" aria-hidden="true">
                <span class="food-share" data-testid="food-share">
                  {i.shareText}
                </span>
                <span class="hint-inline food-amount" data-testid="food-amount">
                  {amountText(metric, i.amount)} · {i.times}×
                </span>
              </span>
            </li>
          ))}
        </ol>
        <p class="hint" data-testid="foods-note">
          {ranking.blank > 0
            ? `Shares are of what entries reported. ${ranking.blank} of ${ranking.entries} entries have ${info.missing} and are left out.`
            : `Share of all the ${info.noun} logged in the range. A logged recipe ranks as itself.`}
        </p>
      </>
    );
  }
  return (
    <section class="card" aria-labelledby="foods-drives-title" data-testid="foods-drives">
      <h2 class="card-title" id="foods-drives-title">
        What drives it <span class="hint-inline">{rangeWords(range)}</span>
      </h2>
      <Segmented
        label="Rank by"
        options={FOOD_METRICS}
        value={metric}
        onChange={chooseFoodMetric}
        labels={METRIC_LABEL}
      />
      {body}
    </section>
  );
}

/** True once `loading` has run for SLOW_MS; false again as soon as it stops. */
function useSlow(loading: boolean): boolean {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    setSlow(false);
    if (!loading) return;
    const t = setTimeout(() => setSlow(true), SLOW_MS);
    return () => clearTimeout(t);
  }, [loading]);
  return slow;
}

function UsualsCard({ range, api }: { range: RangeId; api: ForageApi }) {
  const log = foodsLog.value;
  const usuals = useMemo(() => rankUsuals(log.entries), [log.entries]);
  const slow = useSlow(log.state === 'loading');
  let body: preact.ComponentChild;
  if (log.state === 'loading') {
    body = <Skeleton slow={slow} />;
  } else if (log.state === 'error') {
    body = (
      <Failure id="usuals-error" text="Couldn't load your log." onRetry={() => void loadFoodsLog(api, range, true)} />
    );
  } else if (!usuals.length) {
    body = (
      <p class="hint" data-testid="usuals-none">
        No usuals added in this range.
      </p>
    );
  } else {
    body = (
      <ol class="food-rows">
        {usuals.map((u, n) => (
          <li class="food-row" key={u.id} role="group" aria-label={usualLabel(u)} data-testid="usual-row">
            <span class="food-rank hint-inline tabular" aria-hidden="true">
              {n + 1}
            </span>
            <span class="food-main" aria-hidden="true">
              <span class="food-name" data-testid="usual-name">
                {u.name}
              </span>
              <Meter pct={u.meter} />
            </span>
            <span class="food-figures tabular" aria-hidden="true">
              <span class="food-share" data-testid="usual-count">
                {u.count}×
              </span>
              <span class="hint-inline food-amount" data-testid="usual-slot">
                usually {u.slot}
              </span>
            </span>
          </li>
        ))}
      </ol>
    );
  }
  return (
    <section class="card" aria-labelledby="foods-usuals-title" data-testid="foods-usuals">
      <h2 class="card-title" id="foods-usuals-title">
        Your usuals <span class="hint-inline">times added</span>
      </h2>
      {body}
    </section>
  );
}

function CookedCard({ range, api }: { range: RangeId; api: ForageApi }) {
  const held = foodsCooks.value;
  const today = foodsToday.value;
  const cooked = useMemo(() => rankCooked(held.cooks, foodsFrom(range, today), today), [held.cooks, range, today]);
  let body: preact.ComponentChild;
  if (held.state === 'loading') {
    body = <Skeleton />;
  } else if (held.state === 'error') {
    body = (
      <Failure id="cooked-error" text="Couldn't load your cooks." onRetry={() => void loadFoodsCooks(api, true)} />
    );
  } else if (!cooked.length) {
    body = (
      <p class="hint" data-testid="cooked-none">
        Nothing cooked in this range.
      </p>
    );
  } else {
    body = (
      <ol class="food-rows">
        {cooked.map((c, n) => (
          <li class="food-row" key={c.recipeId} role="group" aria-label={cookedLabel(c)} data-testid="cooked-row">
            <span class="food-rank hint-inline tabular" aria-hidden="true">
              {n + 1}
            </span>
            <span class="food-main" aria-hidden="true">
              <span class="food-name" data-testid="cooked-name">
                {c.name}
              </span>
              <span class="food-rating" data-testid="cooked-rating">
                <Stars rating={c.rating} />
                {c.rating !== null && <span class="hint-inline"> {c.rating} of 5</span>}
              </span>
            </span>
            <span class="food-figures tabular" aria-hidden="true">
              <span class="food-share" data-testid="cooked-count">
                {c.count}×
              </span>
            </span>
          </li>
        ))}
      </ol>
    );
  }
  return (
    <section class="card" aria-labelledby="foods-cooked-title" data-testid="foods-cooked">
      <h2 class="card-title" id="foods-cooked-title">
        Most cooked <span class="hint-inline">from cook history</span>
      </h2>
      {body}
    </section>
  );
}

export function FoodsTab({ api, range }: { api: ForageApi; range: RangeId }) {
  useEffect(() => {
    void loadFoodsLog(api, range);
  }, [api, range]);
  useEffect(() => {
    void loadFoodsCooks(api);
  }, [api]);
  return (
    <>
      <DrivesCard range={range} api={api} />
      <UsualsCard range={range} api={api} />
      <CookedCard range={range} api={api} />
    </>
  );
}

import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { ForageApi } from '../api/client';
import { SLOTS, type PlanEntry } from '../api/types';
import { dayName, planDays, shortDay } from './dates';
import { syncFromHash, tabHash } from '../shell/routes';
import { clearView, showTrip, shopMode } from '../shop/shop-store';
import { TripSetupSheet } from '../shop/trip-setup-sheet';
import { MealSheet } from './meal-sheet';
import { PlanMealSheet } from './plan-meal-sheet';
import {
  bannerCount,
  kcalLine,
  loadPlan,
  mealLabel,
  mealName,
  notOnTrip,
  planEntries,
  planFailed,
  planMealRequested,
  planNotice,
  planState,
  planToday,
  tripChip,
  tripOpen,
} from './plan-store';

interface BannerProps {
  strong: string;
  rest: string;
  /** #710 adds "Plan a trip" here without moving anything. */
  action?: ComponentChildren;
}

/** The Plan banner: a plain region, not a live region, since it changes with the user's own action. */
export function PlanBanner({ strong, rest, action }: BannerProps) {
  return (
    <div class="plan-banner" data-testid="plan-banner">
      <p>
        <strong>{strong}</strong>
        {rest}
      </p>
      {action}
    </div>
  );
}

function MealRow({ entry, onOpen }: { entry: PlanEntry; onOpen: () => void }) {
  const kcal = kcalLine(entry);
  const chip = tripChip(entry);
  return (
    <li>
      <button type="button" class="meal-row" aria-label={mealLabel(entry)} onClick={onOpen} data-testid="meal-row">
        <span class="recipe-text">
          <span class="recipe-name">{mealName(entry)}</span>
          <span class="recipe-meta">
            {kcal ? `${entry.slot} · ${kcal}` : entry.slot}
            {entry.partial && <span class="chip-flag plan-chip">Partial</span>}
          </span>
        </span>
        {chip && (
          <span class={entry.shopped ? 'trip-chip is-shopped' : 'trip-chip'} data-testid="trip-chip">
            {chip}
          </span>
        )}
      </button>
    </li>
  );
}

/** By slot, then the API's own order (date, slot, creation). */
function mealsOn(day: string, entries: PlanEntry[]): PlanEntry[] {
  return entries
    .filter((e) => e.date === day)
    .sort((a, b) => SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot) || entries.indexOf(a) - entries.indexOf(b));
}

type Overlay = { kind: 'plan'; date?: string } | { kind: 'meal'; entry: PlanEntry } | { kind: 'trip' };

/**
 * The Plan tab (#709): today and the next 7 days, each with its meals in slot
 * order, the banner counting planned meals on no trip, and the sheets to plan,
 * move and remove. Every write reloads the plan, so the banner follows it.
 */
export function PlanScreen({ api, empty }: { api: ForageApi; empty: ComponentChildren }) {
  const [overlay, setOverlay] = useState<Overlay | null>(null);

  useEffect(() => {
    void loadPlan(api);
    // A return to the tab recomputes the 8 days, so they follow midnight.
    const onVisible = () => document.visibilityState === 'visible' && void loadPlan(api);
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [api]);

  useEffect(() => {
    if (planMealRequested.value) {
      planMealRequested.value = false;
      setOverlay({ kind: 'plan' });
    }
  }, [planMealRequested.value]);

  const today = planToday.value;
  const days = planDays(new Date(`${today}T12:00:00`));
  const entries = planEntries.value;
  const state = planState.value;
  const banner = bannerCount(notOnTrip.value);

  async function wrote() {
    setOverlay(null);
    planNotice.value = null;
    await loadPlan(api);
  }

  async function gone() {
    setOverlay(null);
    planNotice.value = 'That meal was already removed.';
    await loadPlan(api);
  }

  const failure = planFailed.value && (
    <div class="library-status danger-text" role="status" data-testid="plan-error">
      <p>Couldn't load your plan.</p>
      <button type="button" class="text-btn" onClick={() => void loadPlan(api)}>
        Try again
      </button>
    </div>
  );

  let body: ComponentChildren;
  if (state === 'idle' || state === 'loading') {
    body = (
      <div class="card plan-days" data-testid="plan-loading">
        {days.map((d) => (
          <section key={d} class="plan-day">
            <h2 class="plan-day-head">
              {dayName(d, today)} <span class="plan-day-date">{shortDay(d)}</span>
            </h2>
            <div class="skeleton-row" />
          </section>
        ))}
      </div>
    );
  } else if (!entries.length) {
    body = state === 'error' ? null : empty;
  } else {
    body = (
      <div class="card plan-days" data-testid="plan-days">
        {days.map((d) => {
          const meals = mealsOn(d, entries);
          return (
            <section key={d} class="plan-day" data-testid="plan-day">
              <h2 class="plan-day-head">
                {dayName(d, today)} <span class="plan-day-date">{shortDay(d)}</span>
              </h2>
              {meals.length ? (
                <ul class="plain-list" aria-label={`${dayName(d, today)}'s meals`}>
                  {meals.map((e) => (
                    <MealRow key={e.id} entry={e} onOpen={() => setOverlay({ kind: 'meal', entry: e })} />
                  ))}
                </ul>
              ) : (
                <button type="button" class="meal-row ghost-row" onClick={() => setOverlay({ kind: 'plan', date: d })}>
                  Nothing planned
                </button>
              )}
            </section>
          );
        })}
      </div>
    );
  }

  return (
    <>
      {banner && state === 'ready' && (
        <PlanBanner
          strong={banner.strong}
          rest={banner.rest}
          action={
            tripOpen.value === false && (
              <button
                type="button"
                class="btn btn-primary btn-small"
                onClick={() => setOverlay({ kind: 'trip' })}
                data-testid="banner-plan-trip"
              >
                Plan a trip
              </button>
            )
          }
        />
      )}
      {planNotice.value && (
        <p class="library-status" role="status">
          {planNotice.value}
        </p>
      )}
      {failure}
      {body}
      {overlay?.kind === 'plan' && (
        <PlanMealSheet
          api={api}
          days={days}
          today={today}
          date={overlay.date}
          onPlanned={() => void wrote()}
          onClose={() => setOverlay(null)}
        />
      )}
      {overlay?.kind === 'trip' && (
        <TripSetupSheet
          api={api}
          onBuilt={(trip) => {
            setOverlay(null);
            clearView();
            showTrip(trip);
            shopMode.value = 'sort';
            window.location.hash = tabHash('shop');
            syncFromHash();
          }}
          onClose={() => setOverlay(null)}
        />
      )}
      {overlay?.kind === 'meal' && (
        <MealSheet
          api={api}
          entry={overlay.entry}
          days={days}
          today={today}
          onDone={() => void wrote()}
          onGone={() => void gone()}
          onClose={() => setOverlay(null)}
        />
      )}
    </>
  );
}

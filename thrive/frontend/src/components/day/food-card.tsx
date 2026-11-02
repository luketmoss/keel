// #714 - the Day screen's Food card, read from Forage's daily totals: calories, protein, carbs and
// fat in whole numbers, the item count, a seven-day kcal strip with gaps, and a link to Forage's Eaten
// tab. Read-only: Thrive never logs, edits or adds up food. The reads and their state are
// `state/food.ts`; this draws them. Never mounts on a future day (`slots.ts`), nor in a build without
// `VITE_FORAGE_API_URL` outside demo mode. Its status is its own: a failed read here marks no other panel.

import { Fragment } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { useAuth } from '../../auth/auth-context';
import { FORAGE_EATEN_URL, LABEL_KEYS, type FoodDay, type LabelKey } from '../../api/forage-food';
import type { DayState } from '../../day/dates';
import { weekdayName } from '../../day/format';
import { onPageVisible } from '../../state/page-visible';
import { foodWindows, loadFood, refreshFood } from '../../state/food';
import { Panel, PanelStatus, type DayPanelProps } from './panel';
import { foodWeek, wholeNumber } from './food-week';

// A fork and knife, drawn in the house style (#405) and kept here, as drinks keeps its icons.
function FoodIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width={24}
      height={24}
      fill="none"
      stroke="currentColor"
      stroke-width={2}
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M7 3v6a2 2 0 0 0 4 0V3M9 11v10" />
      <path d="M17 21V3c-2.2 1.2-3.5 3.7-3.5 7 0 2 1 3 3.5 3" />
    </svg>
  );
}

const itemCount = (n: number) => `${n} ${n === 1 ? 'item' : 'items'}`;
const LOW_LINE = 'Some items have no nutrition, so this total is low.';
const dash = '—';
const figureText = (n: number | null) => (n === null ? dash : wholeNumber(n));

/** The line under the figures for the day shown, or null when its figures speak for themselves. */
function dayNote(day: FoodDay | undefined, date: string, state: DayState): string | null {
  const today = state === 'today';
  if (!day) return today ? 'Nothing logged today.' : `Nothing logged on ${weekdayName(date)}.`;
  const nothing = day.kcal === null && day.protein_g === null && day.carbs_g === null && day.fat_g === null;
  if (nothing) {
    return today
      ? "None of today's items has nutrition yet."
      : `None of ${weekdayName(date)}'s items has nutrition yet.`;
  }
  return day.partial ? LOW_LINE : null;
}

// #757 - whether More nutrition is open, kept on the device for every day. Storage may throw: closed then.
const MORE_KEY = 'thrive.foodMore';
function readMore(): boolean {
  try {
    return localStorage.getItem(MORE_KEY) === '1';
  } catch {
    return false;
  }
}
function writeMore(open: boolean): void {
  try {
    localStorage.setItem(MORE_KEY, open ? '1' : '0');
  } catch {
    // Not remembered; the block still works.
  }
}

/** Whether the day has a block: Forage sent the seven, and it is not a "None of ..." day. */
function hasNutrition(day: FoodDay | undefined): boolean {
  if (!day?.label) return false;
  return !(day.kcal === null && day.protein_g === null && day.carbs_g === null && day.fat_g === null);
}

interface Row {
  name: string;
  unit: 'g' | 'mg';
  value: number | null;
  /** 0 = a heading row (Fat, Carbs), 1 = a part, 2 = a part of a part. */
  depth: 0 | 1 | 2;
  key?: LabelKey;
}

function MoreNutrition({ day, date, state }: { day: FoodDay; date: string; state: DayState }) {
  const [open, setOpen] = useState(readMore);
  const label = day.label!;
  const rows: Row[] = [
    { name: 'Fat', unit: 'g', value: day.fat_g, depth: 0 },
    { name: 'Saturated fat', unit: 'g', value: label.values.satfat_g, depth: 1, key: 'satfat_g' },
    { name: 'Trans fat', unit: 'g', value: label.values.transfat_g, depth: 1, key: 'transfat_g' },
    { name: 'Cholesterol', unit: 'mg', value: label.values.cholesterol_mg, depth: 0, key: 'cholesterol_mg' },
    { name: 'Sodium', unit: 'mg', value: label.values.sodium_mg, depth: 0, key: 'sodium_mg' },
    { name: 'Carbs', unit: 'g', value: day.carbs_g, depth: 0 },
    { name: 'Fiber', unit: 'g', value: label.values.fiber_g, depth: 1, key: 'fiber_g' },
    { name: 'Sugars', unit: 'g', value: label.values.sugars_g, depth: 1, key: 'sugars_g' },
    { name: 'Added sugars', unit: 'g', value: label.values.added_sugars_g, depth: 2, key: 'added_sugars_g' },
  ];
  const none = LABEL_KEYS.every((k) => label.values[k] === null);
  const atLeast = (r: Row) => r.key !== undefined && r.value !== null && label.unknown[r.key] > 0;
  const anyAtLeast = rows.some(atLeast);
  return (
    <div class="food-more">
      <button
        type="button"
        class="food-link food-more-btn"
        aria-expanded={open}
        aria-controls="food-more-list"
        onClick={() => {
          const next = !open;
          setOpen(next);
          writeMore(next);
        }}
      >
        More nutrition
        <svg
          class={open ? 'food-more-chevron food-more-chevron-open' : 'food-more-chevron'}
          viewBox="0 0 24 24"
          width={16}
          height={16}
          fill="none"
          stroke="currentColor"
          stroke-width={2}
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      <div id="food-more-list" hidden={!open}>
        {none ? (
          <p class="food-more-none">
            {state === 'today'
              ? "None of today's items has sodium, fiber or the rest yet."
              : `None of ${weekdayName(date)}'s items has sodium, fiber or the rest yet.`}
          </p>
        ) : (
          <>
            <dl class="food-more-list">
              {rows.map((r) => (
                <div key={r.name} class={`food-more-row food-more-row-${r.depth}`}>
                  <dt>{r.name}</dt>
                  <dd>
                    {r.value === null ? (
                      <span class="food-more-unknown" role="img" aria-label="not known">
                        {dash}
                      </span>
                    ) : (
                      `${atLeast(r) ? 'at least ' : ''}${wholeNumber(r.value)} ${r.unit}`
                    )}
                  </dd>
                </div>
              ))}
            </dl>
            {anyAtLeast && <p class="food-more-atleast">At least: some items don't have this one.</p>}
          </>
        )}
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div class="food-skeleton" role="status" aria-label="Loading your food">
      <span class="food-skeleton-bar" />
      <span class="food-skeleton-bar food-skeleton-bar-short" />
    </div>
  );
}

export function FoodCard({ date, state }: DayPanelProps) {
  const { token } = useAuth();
  // Read on show (the slot remounts per date), when the page is visible again, and by Try again.
  useEffect(() => {
    if (token) void loadFood(date, token);
  }, [date, token]);
  useEffect(() => {
    if (!token) return;
    return onPageVisible(() => void refreshFood(date, token));
  }, [date, token]);

  const win = foodWindows.value[date];
  const day = win?.status === 'loaded' ? win.days.find((d) => d.date === date) : undefined;

  // A refresh that changes the figures is announced, politely; the first read and an unchanged one are not.
  const summary = win?.status === 'loaded' ? JSON.stringify(day ?? null) : null;
  const seen = useRef<string | null>(null);
  const [announce, setAnnounce] = useState('');
  useEffect(() => {
    if (summary === null) return;
    if (seen.current !== null && seen.current !== summary && day) {
      setAnnounce(`Food updated: ${figureText(day.kcal)} kcal`);
    }
    seen.current = summary;
  }, [summary]);

  const link = (
    <a class="food-link" href={FORAGE_EATEN_URL} rel="noopener">
      Open Forage ›
    </a>
  );

  if (win?.status === 'error') {
    return (
      <div class="food">
        <Panel title="Food · from Forage" icon={<FoodIcon />} action={link}>
          <PanelStatus status="error" what="your food" onRetry={() => token && void loadFood(date, token, true)} />
        </Panel>
      </div>
    );
  }
  if (win?.status !== 'loaded') {
    return (
      <div class="food">
        <Panel title="Food · from Forage" icon={<FoodIcon />}>
          <Skeleton />
        </Panel>
      </div>
    );
  }

  const note = dayNote(day, date, state);
  const week = foodWeek(date, win.days);
  const macros: [string, number | null][] = [
    ['Protein', day?.protein_g ?? null],
    ['Carbs', day?.carbs_g ?? null],
    ['Fat', day?.fat_g ?? null],
  ];
  return (
    <div class="food">
      <Panel
        title="Food · from Forage"
        icon={<FoodIcon />}
        meta={day ? itemCount(day.entries) : undefined}
        action={link}
      >
        <p class="food-figure">
          <span class="food-kcal">{figureText(day?.kcal ?? null)}</span>
          <span class="food-unit">{state === 'today' ? 'kcal so far' : 'kcal'}</span>
          {note === LOW_LINE && <span class="food-low">Low</span>}
        </p>
        <p class="food-macros">
          {macros.map(([label, grams]) => (
            <Fragment key={label}>
              <span class="food-macro">
                {label} {grams === null ? dash : `${wholeNumber(grams)} g`}
              </span>{' '}
            </Fragment>
          ))}
        </p>
        {day && hasNutrition(day) && <MoreNutrition day={day} date={date} state={state} />}
        {note && <p class="food-note">{note}</p>}
        <p class="food-week-caption">Last 7 days, kcal. A day with nothing logged is a gap.</p>
        <ul class="food-week">
          {week.map((d, i) => (
            <li key={d.date} class="food-week-day">
              <span class="sr-only">{d.name}</span>
              <span class="food-week-slot" aria-hidden="true">
                {d.height === null ? (
                  <span class="food-week-gap" />
                ) : (
                  <span
                    class={[
                      'food-week-bar',
                      i === week.length - 1 ? 'food-week-bar-viewed' : '',
                      d.partial ? 'food-week-bar-partial' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    style={{ height: `${Math.round(d.height * 1000) / 10}%` }}
                  />
                )}
              </span>
              <span
                class={i === week.length - 1 ? 'food-week-letter food-week-letter-viewed' : 'food-week-letter'}
                aria-hidden="true"
              >
                {d.letter}
              </span>
            </li>
          ))}
        </ul>
        <p class="sr-only" role="status">
          {announce}
        </p>
      </Panel>
    </div>
  );
}

// #915: the Meals tab: a typical day by meal, and each day by meal (forage/docs/design/915-trends-meals.md).
// #913's chart, readout and legend with stacked bars; the figures come from `by_meal` and meals.ts.
import { useMemo, useState } from 'preact/hooks';
import { wholeKcal } from '../eaten/format';
import { BarChart, type ChartItem } from './bar-chart';
import { longWeekdayDate, monthDay, shortWeekdayDate } from './chart-math';
import {
  buildMealDays,
  buildMealWeeks,
  slotClass,
  slotColor,
  slotOrder,
  typicalDay,
  type MealDay,
  type MealWeek,
  type SlotStat,
} from './meals';
import type { TabView } from './series';
import { Chip, DayLink, openDay, type Readout } from './series-chart';

const dayWord = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;

/** `Calories by meal: Breakfast 14%, Lunch 22%, ...`; none when there is nothing to share. */
export function splitLabel(slots: SlotStat[], counted: number): string {
  const shown = slots.filter((s) => s.total > 0);
  if (!counted || !shown.length) return 'Calories by meal: none';
  return `Calories by meal: ${shown.map((s) => `${s.slot} ${s.shareText}`).join(', ')}`;
}

/** A row's one-sentence name: `After dinner, 310 kcal on 14 of 27 days, 11% of all calories`. */
export function rowLabel(s: SlotStat, counted: number): string {
  if (!counted) return `${s.slot}, no days logged`;
  if (s.average === null) return `${s.slot}, not eaten, 0 of ${counted} days, 0% of all calories`;
  return `${s.slot}, ${wholeKcal(s.average)} kcal on ${s.days} of ${counted} days, ${s.shareText} of all calories`;
}

function TypicalDayCard({ view }: { view: TabView }) {
  const t = useMemo(() => typicalDay(view.byDate, view.from, view.today), [view.byDate, view.from, view.today]);
  const counted = t.counted > 0;
  const shown = t.slots.filter((s) => s.total > 0);
  return (
    <section class="card" aria-labelledby="meals-typical-title" data-testid="meals-typical">
      <h2 class="card-title" id="meals-typical-title">
        A typical day, by meal <span class="hint-inline">{view.rangeText}</span>
      </h2>
      <div
        class="macro-bar macro-bar-day"
        role="img"
        aria-label={splitLabel(t.slots, t.counted)}
        data-testid="meals-bar"
      >
        {counted && shown.length ? (
          shown.map((s) => (
            <span
              key={s.slot}
              class={`macro-seg ${slotClass(s.slot)}`}
              data-testid={`meals-seg-${s.slot}`}
              style={{ flexGrow: s.total }}
            />
          ))
        ) : (
          <span class="macro-seg macro-track" data-testid="meals-bar-empty" style={{ flexGrow: 1 }} />
        )}
      </div>
      <ul class="macro-rows">
        {t.slots.map((s) => (
          <li
            class="macro-row meal-row"
            key={s.slot}
            role="group"
            aria-label={rowLabel(s, t.counted)}
            data-testid={`meals-row-${s.slot}`}
          >
            <span class={`macro-swatch ${slotClass(s.slot)}`} aria-hidden="true" />
            <span class="meal-row-name" aria-hidden="true">
              <span class="meal-row-slot">{s.slot}</span>
              {counted && (
                <span class="hint-inline meal-row-days" data-testid="meals-days">
                  {s.days} of {t.counted} days
                </span>
              )}
            </span>
            <span class="meal-row-figures tabular" aria-hidden="true">
              <span class="meal-row-kcal" data-testid="meals-kcal">
                {counted && s.average !== null ? `${wholeKcal(s.average)} kcal` : '—'}
              </span>
              {counted && (
                <span class="hint-inline" data-testid="meals-share">
                  {s.shareText} of all
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
      {counted ? (
        <>
          <p class="hint">kcal is the average on the days that meal was eaten.</p>
          {t.low > 0 && (
            <p class="hint" data-testid="meals-low-note">
              Includes {t.low} {t.low === 1 ? 'meal' : 'meals'} with low totals (some items have no nutrition).
            </p>
          )}
        </>
      ) : (
        <p class="hint" data-testid="meals-none">
          No days logged in this range.
        </p>
      )}
    </section>
  );
}

const figure = (m: { slot: string; kcal: number | null }) => `${m.slot} ${wholeKcal(m.kcal!)}`;

function dayReadout(d: MealDay, today: string): Readout {
  const label = d.today ? 'Today' : shortWeekdayDate(d.date);
  if (d.total !== null) {
    const parts = d.meals;
    const textParts = parts.map((m) =>
      m.kcal === null ? `${m.slot} no nutrition` : `${figure(m)}${m.partial ? ' Low' : ''}`,
    );
    const unit = d.today ? 'kcal so far' : 'kcal';
    return {
      text: `${d.today ? 'Today' : longWeekdayDate(d.date)}: ${textParts.join(', ')}`,
      node: (
        <>
          <span class="readout-text">
            {label} ·{' '}
            {parts.map((m, i) => (
              <span key={m.slot}>
                {i > 0 && ' · '}
                {m.kcal === null ? (
                  <>
                    {m.slot} <span class="hint-inline">no nutrition</span>
                  </>
                ) : (
                  <>
                    {figure(m)}
                    {m.partial && (
                      <>
                        {' '}
                        <Chip text="Low" />
                      </>
                    )}
                  </>
                )}
              </span>
            ))}{' '}
            {unit}
          </span>{' '}
          <DayLink date={d.date} today={today} text="Open day ›" />
        </>
      ),
    };
  }
  if (d.logged) {
    const text = `${label} · logged, but nothing has nutrition yet`;
    return {
      text,
      node: (
        <>
          <span class="readout-text">{text}</span> <DayLink date={d.date} today={today} text="Open day ›" />
        </>
      ),
    };
  }
  const text = `${label} · nothing logged`;
  return {
    text,
    node: (
      <>
        <span class="readout-text">{text}</span> <DayLink date={d.date} today={today} text="Log this day ›" />
      </>
    ),
  };
}

function weekReadout(w: MealWeek): Readout {
  const head = `Week of ${monthDay(w.date)}`;
  const tail = 'Use 6M or shorter to open a day';
  if (w.total === null) {
    const text = `${head} · nothing logged`;
    return {
      text,
      node: (
        <>
          <span class="readout-text">{text}</span> <span class="hint-inline">{tail}</span>
        </>
      ),
    };
  }
  const eaten = w.perSlot.filter((s) => s.kcal !== null);
  const text = `${head} · ${eaten.map((s) => `${s.slot} ${wholeKcal(s.kcal!)}`).join(' · ')} · ${w.logged} of ${w.days} days logged`;
  return {
    text,
    node: (
      <>
        <span class="readout-text">{text}</span>
        {eaten.some((s) => s.partial) && (
          <>
            {' '}
            <Chip text="Low" />
          </>
        )}{' '}
        <span class="hint-inline">{tail}</span>
      </>
    ),
  };
}

function EachDayCard({ view }: { view: TabView }) {
  const { byDate, from, today, weekly } = view;
  const order = useMemo(() => slotOrder(byDate, from, today), [byDate, from, today]);
  const days = useMemo(() => buildMealDays(byDate, from, today, today, order), [byDate, from, today, order]);
  const weeks = useMemo(() => (weekly ? buildMealWeeks(days, byDate, order) : []), [weekly, days, byDate, order]);
  const [selected, setSelected] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');

  const items: ChartItem[] = weekly
    ? weeks.map((w) =>
        w.total === null
          ? { key: w.date, date: w.date, kind: 'gap', value: null }
          : {
              key: w.date,
              date: w.date,
              kind: 'bar',
              value: w.total,
              hairline: true,
              stack: w.perSlot
                .filter((s) => s.kcal !== null && s.kcal > 0)
                .map((s) => ({
                  h: s.kcal!,
                  cls: `chart-seg-${slotClass(s.slot)}`,
                  hatch: s.partial ? slotColor(s.slot) : undefined,
                })),
            },
      )
    : days.map((d) =>
        d.total === null
          ? { key: d.date, date: d.date, kind: 'gap', value: null }
          : {
              key: d.date,
              date: d.date,
              kind: 'bar',
              value: d.total,
              hairline: true,
              stack: d.meals
                .filter((m) => m.kcal !== null && m.kcal > 0)
                .map((m) => ({
                  h: m.kcal!,
                  cls: `chart-seg-${slotClass(m.slot)}`,
                  hatch: m.partial ? slotColor(m.slot) : undefined,
                })),
            },
      );

  const readoutFor = (key: string | null): Readout | null => {
    if (key === null) return null;
    if (weekly) {
      const w = weeks.find((x) => x.date === key);
      return w ? weekReadout(w) : null;
    }
    const d = days.find((x) => x.date === key);
    return d ? dayReadout(d, today) : null;
  };
  const readout = readoutFor(selected);
  const onSelect = (key: string | null, via: 'pointer' | 'key') => {
    setSelected(key);
    setAnnounce(via === 'key' ? (readoutFor(key)?.text ?? '') : '');
  };
  const onOpen = (key: string) => {
    if (!weekly && days.some((d) => d.date === key)) openDay(key, today);
  };

  // A slot with no segment in the range is left out of the legend; a renamed one keeps its own name.
  const drawn = new Set<string>();
  let anyLow = false;
  if (weekly) {
    for (const w of weeks)
      for (const s of w.perSlot)
        if (s.kcal !== null && s.kcal > 0) {
          drawn.add(s.slot);
          anyLow = anyLow || s.partial;
        }
  } else {
    for (const d of days)
      if (d.total !== null)
        for (const m of d.meals)
          if (m.kcal !== null && m.kcal > 0) {
            drawn.add(m.slot);
            anyLow = anyLow || m.partial;
          }
  }
  const legend = order.filter((s) => drawn.has(s));
  const total = days.filter((d) => !d.today && d.total !== null).length;
  const summary = `${dayWord(total)} logged`;

  return (
    <section class="card chart-card" aria-labelledby="meals-each-title" data-testid="meals-each">
      <h2 class="card-title" id="meals-each-title">
        Each day, by meal <span class="hint-inline">{view.rangeText}</span>
      </h2>
      <p class="hint visually-hidden" id="meals-summary">
        {summary}
      </p>
      <p class="readout readout-3" data-testid="readout">
        {readout ? readout.node : <span class="hint-inline">Tap a day to read it.</span>}
      </p>
      <BarChart
        items={items}
        line={null}
        selected={selected}
        name={`Calories by meal, ${view.rangeText}`}
        describedBy="meals-summary"
        onSelect={onSelect}
        onOpen={onOpen}
        idPrefix="meals"
      />
      <ul class="legend" data-testid="legend">
        {legend.map((s) => (
          <li key={s} data-testid="legend-slot">
            <span class={`legend-mark legend-slot ${slotClass(s)}`} aria-hidden="true" /> {s}
          </li>
        ))}
        {items.some((i) => i.kind === 'gap') && (
          <li>
            <span class="legend-mark legend-gap" aria-hidden="true" /> Not logged
          </li>
        )}
        {anyLow && (
          <li>
            <span class="legend-mark legend-low" aria-hidden="true" /> Low
          </li>
        )}
      </ul>
      <div class="visually-hidden" role="status" data-testid="meals-status">
        {announce}
      </div>
    </section>
  );
}

export function MealsTab({ view }: { view: TabView }) {
  return (
    <>
      <TypicalDayCard view={view} />
      <EachDayCard view={view} />
    </>
  );
}

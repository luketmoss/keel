// #488 — the Day screen's glance row: steps, recovery and calories, the three
// numbers someone checks first. Not a card: it sits on the page. Reads the
// `dailyHealth` signal the screen already loads and makes no read of its own.
//
// Recovery is a current-state snapshot COROS writes only on the days a sync
// ran, so the ring shows on today only (the owner's call, 2026-10-19). While
// the tab is not loaded the row is not drawn; the Health panel's PanelStatus
// says loading and Try again. COROS sends no goals, so no step or calorie ring.

import { dailyHealth } from '../../state/store';
import { parse } from '../../api/units';
import { FootprintsIcon } from '../shared/icons';
import type { DayPanelProps } from './panel';

/** Calories: a flame, drawn in the house style (#405) but kept here, as the icon set is counted by its tests. */
function FlameIcon() {
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
      <path d="M12 2c1 3.5 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5.3 1.5 1 2.3 1.8 2.5C10.5 8.5 11 5 12 2z" />
    </svg>
  );
}

const num = (n: number) => Math.round(n).toLocaleString('en-US');

/** The ring: a 270° track opening at the bottom, the value arc on top. Both are 100 units long. */
const ARC = 'M 34.5 129.5 A 70 70 0 1 1 133.5 129.5';

function RecoveryRing({ value }: { value: number }) {
  const shown = Math.max(0, Math.min(100, value));
  return (
    <div class="glance-ring" role="img" aria-label={`Recovery ${value}%`}>
      <svg viewBox="0 0 168 160" width="168" height="160" aria-hidden="true" focusable="false">
        <path class="glance-ring-track" d={ARC} pathLength="100" fill="none" stroke-width="12" stroke-linecap="round" />
        {shown > 0 && (
          <path
            class="glance-ring-value"
            d={ARC}
            pathLength="100"
            fill="none"
            stroke-width="12"
            stroke-linecap="round"
            stroke-dasharray={`${shown} 100`}
          />
        )}
      </svg>
      <div class="glance-ring-text" aria-hidden="true">
        <span class="glance-ring-figure">
          {value}
          <span class="glance-ring-pct">%</span>
        </span>
        <span class="glance-word">recovery</span>
      </div>
    </div>
  );
}

function Stat({
  icon,
  value,
  word,
  kind,
}: {
  icon: preact.ComponentChildren;
  value: number | null;
  word: string;
  kind: string;
}) {
  return (
    <div class={`glance-stat glance-${kind}`}>
      <span class="glance-icon" aria-hidden="true">
        {icon}
      </span>
      <span class="glance-figure">{value === null ? '—' : num(value)}</span>
      <span class="glance-word">{word}</span>
    </div>
  );
}

export function GlanceRow({ date, state }: DayPanelProps) {
  const tab = dailyHealth.value;
  if (tab.state !== 'loaded') return null;
  const row = tab.rows.find((r) => r.date === date);
  if (!row) return null;
  const isToday = state === 'today';
  const recovery = isToday ? parse(row.recovery) : null;
  const so = isToday ? ' so far' : '';
  return (
    <section class={recovery === null ? 'glance-row glance-row-two' : 'glance-row'} aria-label="Day at a glance">
      <Stat kind="steps" icon={<FootprintsIcon />} value={parse(row.steps)} word={`steps${so}`} />
      {recovery !== null && <RecoveryRing value={recovery} />}
      <Stat kind="calories" icon={<FlameIcon />} value={parse(row.calories)} word={`kcal${so}`} />
    </section>
  );
}

// #239 AC4 — the Day screen's Body tile: the day's first weigh-in and its
// mean blood pressure, in lb and mmHg. Reads the `bodyMeasurements` signal;
// the day's readings are reduced by `bodyDayOf`, DailySummary U:Y's rules.
// Nothing here is compared or coloured: values are shown as measured.
// #492 draws it as the fourth metric tile (weight at --figure-lg, a hairline,
// then blood pressure); `bodyView` is unchanged.

import { bodyMeasurements } from '../../state/store';
import { loadHealth } from '../../state/actions';
import { useAuth } from '../../auth/auth-context';
import { selectBodyMeasurementRange, type BodyMeasurementRow } from '../../api/health-api';
import { bodyDayOf } from '../../api/body-day';
import { formatWeight } from '../../api/units';
import { clock12 } from '../../day/format';
import type { ComponentChildren } from 'preact';
import { Panel, PanelStatus, type DayPanelProps } from './panel';

export interface BodyRowView {
  key: 'weight' | 'fat' | 'bp';
  label: string;
  /** '' for a blank, shown as "—". */
  value: string;
  /** Read instead of `value` by a screen reader, when set. */
  spoken?: string;
  caption: string;
}

export type BodyView = { kind: 'note'; note: string } | { kind: 'rows'; rows: BodyRowView[] };

/** What a missing weight or blood pressure says (#239). */
export function noReadingWords(isToday: boolean): string {
  return isToday ? 'None yet today.' : 'No reading this day.';
}

/** The Body panel for one day's readings (any order). Pure. */
export function bodyView(readings: readonly BodyMeasurementRow[], isToday: boolean): BodyView {
  const day = bodyDayOf(readings);
  const hasBp = day.systolic_mmhg !== '' || day.diastolic_mmhg !== '';
  if (!day.weighIn && !hasBp) {
    return {
      kind: 'note',
      note: isToday
        ? 'No reading yet today. One taken on the scale or cuff shows here after the next sync.'
        : 'No weigh-in or blood pressure this day.',
    };
  }
  const none = noReadingWords(isToday);
  const rows: BodyRowView[] = [];

  if (day.weighIn) {
    rows.push({
      key: 'weight',
      label: 'Weight',
      value: formatWeight(day.weight_kg),
      caption: clock12(day.weighIn.time),
    });
    const fat = Number(day.fat_ratio_pct);
    rows.push(
      day.fat_ratio_pct !== '' && Number.isFinite(fat)
        ? { key: 'fat', label: 'Body fat', value: `${fat.toFixed(1)}%`, caption: '' }
        : { key: 'fat', label: 'Body fat', value: '', caption: 'Not measured at this weigh-in.' },
    );
  } else {
    rows.push({ key: 'weight', label: 'Weight', value: '', caption: none });
    rows.push({ key: 'fat', label: 'Body fat', value: '', caption: none });
  }

  if (hasBp) {
    const sys = day.systolic_mmhg || '—';
    const dia = day.diastolic_mmhg || '—';
    const n = day.bp.length;
    rows.push({
      key: 'bp',
      label: 'Blood pressure',
      value: `${sys}/${dia} mmHg`,
      spoken: `${day.systolic_mmhg || 'unknown'} over ${day.diastolic_mmhg || 'unknown'} millimetres of mercury`,
      caption: n > 1 ? `Average of ${n} readings` : `One reading, ${clock12(day.bp[0].time)}`,
    });
  } else {
    rows.push({ key: 'bp', label: 'Blood pressure', value: '', caption: none });
  }
  return { kind: 'rows', rows };
}

// Drawn in the house style (#405) and kept here, as the shared icon set is counted by its tests.
function ScaleIcon() {
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
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <path d="M8.5 9.5a5 5 0 0 1 7 0" />
      <path d="M12 12l1.5-1.5" />
    </svg>
  );
}

/** "179.5 lb" into its figure and unit, so the unit can sit small beside it. */
function splitUnit(value: string): [string, string] {
  const at = value.lastIndexOf(' ');
  return at < 0 ? [value, ''] : [value.slice(0, at), value.slice(at + 1)];
}

function Figure({ value, className }: { value: string; className: string }) {
  if (!value) return <p class={`${className} tile-value-blank`}>—</p>;
  const [figure, unit] = splitUnit(value);
  return (
    <p class={className}>
      {figure}
      {unit && <span class="tile-unit">{` ${unit}`}</span>}
    </p>
  );
}

function BodyTile({ children }: { children: ComponentChildren }) {
  return (
    <div class="metric-tile metric-tile-body" data-metric="body">
      <Panel title="Body" icon={<ScaleIcon />}>
        {children}
      </Panel>
    </div>
  );
}

function BodyReadings({ rows, none }: { rows: BodyRowView[]; none: string }) {
  const by = (k: BodyRowView['key']) => rows.find((r) => r.key === k)!;
  const weight = by('weight');
  const fat = by('fat');
  const bp = by('bp');
  const weighIn = weight.value
    ? [fat.value ? `fat ${fat.value}` : 'Fat not measured', weight.caption].join(' · ')
    : none;
  return (
    <>
      <div class="body-weight" data-metric="weight">
        <Figure value={weight.value} className="tile-value" />
        <p class="tile-caption">{weighIn}</p>
      </div>
      <div class="body-bp" data-metric="bp">
        {bp.value && bp.spoken ? (
          <>
            <span class="sr-only">{bp.spoken}</span>
            <span aria-hidden="true">
              <Figure value={bp.value} className="body-bp-value" />
            </span>
          </>
        ) : (
          <Figure value="" className="body-bp-value" />
        )}
        <p class="tile-caption">{bp.caption}</p>
      </div>
    </>
  );
}

export function BodyPanel({ date, state }: DayPanelProps) {
  const { token } = useAuth();
  const tab = bodyMeasurements.value;
  if (tab.state !== 'loaded') {
    return (
      <BodyTile>
        <PanelStatus
          status={tab.state}
          what="your body measurements"
          onRetry={() => {
            if (token) void loadHealth(token);
          }}
        />
      </BodyTile>
    );
  }
  const isToday = state === 'today';
  const view = bodyView(selectBodyMeasurementRange(tab.rows, date, date), isToday);
  const none = noReadingWords(isToday);
  // No reading at all: the same two figures, blank, each with the same words.
  const rows: BodyRowView[] =
    view.kind === 'rows'
      ? view.rows
      : [
          { key: 'weight', label: 'Weight', value: '', caption: none },
          { key: 'fat', label: 'Body fat', value: '', caption: none },
          { key: 'bp', label: 'Blood pressure', value: '', caption: none },
        ];
  return (
    <BodyTile>
      <BodyReadings rows={rows} none={none} />
    </BodyTile>
  );
}

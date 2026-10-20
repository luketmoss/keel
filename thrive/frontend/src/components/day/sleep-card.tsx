// #490 — the Day screen's Sleep card: the score, the night's total, and a bar
// of its stages. Reads the `dailyHealth` signal the screen already loads. The
// rules (which night, the stage shares, the range line) are `sleepView` in
// `health-rows.ts`; this only draws them. Never mounts on a future day.

import { dailyHealth } from '../../state/store';
import { loadHealth } from '../../state/actions';
import { useAuth } from '../../auth/auth-context';
import { Panel, PanelStatus, type DayPanelProps } from './panel';
import { Caption } from './health-panel';
import { sleepView, type SleepStageView, type SleepView } from './health-rows';

/** A crescent moon in the house style (#405); kept here, as the icon set is counted by its tests. */
function MoonIcon() {
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
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}

function StageBar({ stages }: { stages: SleepStageView[] }) {
  const label = stages.map((s) => `${s.label} ${s.spoken}`).join(', ');
  return (
    <div class="sleep-bar" role="img" aria-label={label}>
      {stages
        .filter((s) => s.seconds > 0)
        .map((s) => (
          <span key={s.key} class={`sleep-seg sleep-seg-${s.key}`} style={{ flexGrow: s.seconds }} />
        ))}
    </div>
  );
}

function Total({ total }: { total: NonNullable<SleepView['total']> }) {
  return (
    <p class="sleep-total">
      <span class="sr-only">{`${total.h} ${total.h === 1 ? 'hour' : 'hours'} ${total.m} ${total.m === 1 ? 'minute' : 'minutes'}`}</span>
      <span aria-hidden="true">
        {total.h}
        <span class="sleep-unit">h</span> {total.m}
        <span class="sleep-unit">m</span>
      </span>
    </p>
  );
}

function SleepBody({ view }: { view: SleepView }) {
  return (
    <>
      <div class="sleep-figures">
        {view.score !== null && (
          <p class="sleep-score">
            <span class="sleep-score-figure">{view.score}</span>
            <span class="sleep-score-word">
              sleep
              <br />
              score
            </span>
          </p>
        )}
        {view.total ? (
          <Total total={view.total} />
        ) : (
          <p class="sleep-none">
            <span class="sleep-total">—</span>
            <span class="sleep-none-note">{`${view.none}.`}</span>
          </p>
        )}
      </div>
      {view.stages.length > 0 && (
        <>
          <StageBar stages={view.stages} />
          {view.times && (
            <div class="sleep-times">
              <span>{view.times.bed}</span>
              <span>{view.times.wake}</span>
            </div>
          )}
          <ul class="sleep-legend">
            {view.stages.map((s) => (
              <li key={s.key} class="sleep-legend-item">
                <span class="sleep-legend-name">
                  <span class={`sleep-swatch sleep-seg-${s.key}`} aria-hidden="true" />
                  {s.label}
                </span>
                <span class="sleep-legend-time">{s.text}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {view.stages.length === 0 && view.times && (
        <div class="sleep-times">
          <span>{view.times.bed}</span>
          <span>{view.times.wake}</span>
        </div>
      )}
      {view.range && (
        <p class="sleep-range">
          <Caption c={view.range} />
        </p>
      )}
    </>
  );
}

export function SleepCard({ date, state }: DayPanelProps) {
  const { token } = useAuth();
  const tab = dailyHealth.value;
  const icon = (
    <span class="sleep-icon">
      <MoonIcon />
    </span>
  );
  if (tab.state !== 'loaded') {
    return (
      <Panel title="Sleep" icon={icon}>
        <PanelStatus
          status={tab.state}
          what="your sleep"
          onRetry={() => {
            if (token) void loadHealth(token);
          }}
        />
      </Panel>
    );
  }
  const view = sleepView(tab.rows, date, state === 'today');
  if (!view) return null;
  return (
    <Panel title="Sleep" icon={icon} meta={view.night}>
      <SleepBody view={view} />
    </Panel>
  );
}

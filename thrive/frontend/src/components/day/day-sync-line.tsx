// #409, #486 — the Day view's sync: an icon button in the header's title row
// (`DaySyncButton`) and, under the header, the status and request lines
// (`DaySyncStatus`), both drawn from one `useDaySync`.
//
// The age lives in the button's name ("Sync now, Synced 3:30 PM"); it is printed
// only when the status is not neutral, so a problem is never colour alone.
// Request messages only ever grow downward, in the one polite live region, so
// the button never moves under the finger. The minute-by-minute age tick is
// outside the live region.
// "Sync" here is the COROS/Withings sync (#315), not the offline save queue.

import { useEffect, useRef, useState } from 'preact/hooks';
import { syncLog, withingsSyncLog, syncRequests, syncAsk, demoSyncPressedAt } from '../../state/store';
import { isDemo } from '../../api/demo-data';
import { collapseSyncStatus, type DaySyncStatus } from '../../api/sync-status';
import { newestRequest, type RequestView } from '../../api/sync-request-state';
import type { SyncRequestVendor } from '../../api/sync-requests-api';
import type { SyncNow } from '../settings/sync-now';

const MINUTE = 60_000;
/** A final message stays this long: the server's cooldown window, which is how long "Ask again after" matters. */
export const DAY_FINAL_FOR_MS = 10 * MINUTE;

const VENDOR_NAMES: Record<SyncRequestVendor, string> = { coros: 'COROS', withings: 'Withings' };

export interface DayRequestEntry {
  /** Null when both vendors say the same thing (e.g. "Asking for a sync…"). */
  vendor: string | null;
  view: RequestView;
}

/**
 * The request rows to show: each vendor's `useSyncNow` line verbatim, prefixed
 * with the vendor name (one entry when both are identical). An open request
 * always shows; a final message goes away `DAY_FINAL_FOR_MS` after it was
 * finished (`finalAt(vendor)` is when, ms, or null when unknown: it then stays).
 */
export function dayRequestEntries(
  lines: SyncNow['lines'],
  now: number,
  finalAt: (vendor: SyncRequestVendor) => number | null,
): DayRequestEntry[] {
  const shown: { vendor: SyncRequestVendor; view: RequestView }[] = [];
  for (const vendor of ['coros', 'withings'] as const) {
    const view = lines[vendor];
    if (!view) continue;
    if (!view.open) {
      const at = finalAt(vendor);
      if (at !== null && now - at >= DAY_FINAL_FOR_MS) continue;
    }
    shown.push({ vendor, view });
  }
  if (shown.length === 2 && shown[0].view.text === shown[1].view.text && shown[0].view.tone === shown[1].view.tone) {
    return [{ vendor: null, view: shown[0].view }];
  }
  return shown.map(({ vendor, view }) => ({ vendor: VENDOR_NAMES[vendor], view }));
}

function SyncIcon() {
  return (
    <svg class="day-sync-icon" viewBox="0 0 20 20" width="24" height="24" aria-hidden="true" focusable="false">
      <path
        d="M16 7.5A6.5 6.5 0 0 0 4.2 6M4 12.5A6.5 6.5 0 0 0 15.8 14M4 3v3.5h3.5M16 17v-3.5h-3.5"
        fill="none"
        stroke="currentColor"
        stroke-width="1.7"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

export interface DaySyncView {
  status: DaySyncStatus;
  entries: DayRequestEntry[];
  busy: boolean;
  press: () => void;
}

export function useDaySync(sync: SyncNow): DaySyncView {
  // A one-minute tick, so "just now" does not sit there for an hour.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), MINUTE);
    return () => clearInterval(tick);
  }, []);

  const status = collapseSyncStatus(syncLog.value, withingsSyncLog.value, new Date(now));

  // A failed ask has no request row to date it by: note when this screen first saw it.
  const ask = syncAsk.value;
  const askFailedAt = useRef<number | null>(null);
  if (ask !== 'failed') askFailedAt.current = null;
  else if (askFailedAt.current === null) askFailedAt.current = Date.now();

  const demo = isDemo();
  const pressedAt = demoSyncPressedAt.value;
  const finalAt = (vendor: SyncRequestVendor): number | null => {
    if (ask === 'failed') return askFailedAt.current;
    if (demo) return pressedAt;
    const req = newestRequest(syncRequests.value, vendor);
    if (!req) return null;
    const t = Date.parse(req.finished_at) || Date.parse(req.requested_at);
    return Number.isNaN(t) ? null : t;
  };
  const entries = dayRequestEntries(sync.lines, now, finalAt);

  return { status, entries, busy: sync.bothOpen || sync.asking, press: sync.press };
}

/**
 * The status's tone as a person would read it: its own when not neutral, else the
 * worst vendor note's (a failed or stopped vendor leaves the age neutral but is
 * still a problem).
 */
function problemTone(status: DaySyncStatus): 'warning' | 'danger' | null {
  if (status.tone !== 'neutral') return status.tone;
  if (status.notes.some((n) => n.tone === 'danger')) return 'danger';
  return status.notes.length > 0 ? 'warning' : null;
}

/** The status dot: green when well, the problem's colour otherwise, none while unknown or busy. */
function dotTone(status: DaySyncStatus): 'success' | 'warning' | 'danger' | null {
  const problem = problemTone(status);
  if (problem) return problem;
  return status.text.startsWith('Synced ') ? 'success' : null;
}

function SyncDot({ tone }: { tone: 'success' | 'warning' | 'danger' | null }) {
  if (!tone) return null;
  return <span class={`day-sync-dot day-sync-dot-${tone}`} aria-hidden="true" />;
}

export function DaySyncButton({ view }: { view: DaySyncView }) {
  const { status, busy } = view;
  const name = busy ? 'Syncing…' : `Sync now, ${status.text}`;
  const dot = busy ? null : dotTone(status);
  return (
    <button
      type="button"
      class={`day-sync-btn${busy ? ' day-sync-busy' : ''}`}
      aria-label={name}
      title={name}
      aria-disabled={busy ? 'true' : undefined}
      onClick={() => {
        if (!busy) view.press();
      }}
    >
      <SyncIcon />
      <SyncDot tone={dot} />
    </button>
  );
}

export function DaySyncLines({ view }: { view: DaySyncView }) {
  const { status, entries } = view;
  const problem = problemTone(status);
  return (
    <div class="day-sync">
      {problem && (
        <div class="day-sync-text">
          <p class={`day-sync-age sync-tone-${problem}`}>{status.text}</p>
          {status.notes.map((n) => (
            <p key={n.vendor} class={`day-sync-note sync-tone-${n.tone}`}>
              {n.text}
            </p>
          ))}
        </div>
      )}
      <div class="day-sync-requests" role="status" aria-live="polite">
        {entries.map((e) => (
          <p
            key={e.vendor ?? 'both'}
            class={`day-sync-request${e.view.tone === 'neutral' ? '' : ` sync-tone-${e.view.tone}`}`}
          >
            {e.vendor ? `${e.vendor}: ` : ''}
            {e.view.text}
          </p>
        ))}
      </div>
    </div>
  );
}

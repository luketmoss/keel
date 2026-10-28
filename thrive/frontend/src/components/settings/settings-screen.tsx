import { useEffect, useRef, useState } from 'preact/hooks';
import { useAuth } from '../../auth/auth-context';
import { ThemeToggle } from '../shared/theme-toggle';
import { workouts, exercises, templates, labels, loading } from '../../state/store';
import { navigate } from '../../router/router';
import { CorosSyncStatusRow, WithingsSyncStatusRow } from './sync-status-row';
import { useSyncNow, SyncNowButton } from './sync-now';
import { RestTimesGroup, REST_SAVE_DELAY_MS, REST_SAVED_MS } from './rest-times-group';
import {
  ChevronIcon,
  ContrastIcon,
  DatabaseIcon,
  DropletIcon,
  MinusIcon,
  PlusIcon,
  SettingsCard,
  SettingsRow,
  SignOutIcon,
  SyncArrowsIcon,
} from './settings-card';
import { GOAL_OZ_MAX, GOAL_OZ_MIN, goalOz, loadGoal, ozToGoalMl, saveWaterGoal, waterGoalMl } from '../../state/drinks';

/** One press moves the goal this many ounces (#643). */
const GOAL_STEP_OZ = 4;

/** The daily water goal (#520): whole ounces in the field, stored as ml. Saves as it changes (#643). */
function WaterGoalRow({ token }: { token: string | null }) {
  const stored = String(goalOz(waterGoalMl.value));
  const [text, setText] = useState<string | null>(null);
  const [note, setNote] = useState<{ kind: 'error' | 'saved'; text: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const savedTimer = useRef<ReturnType<typeof setTimeout>>();
  const pendingMl = useRef<number | null>(null);
  const edit = useRef(0);
  const mounted = useRef(true);
  const tokenRef = useRef(token);
  tokenRef.current = token;

  useEffect(() => {
    if (token) void loadGoal(token);
  }, [token]);

  async function save() {
    timer.current = undefined;
    const ml = pendingMl.current;
    pendingMl.current = null;
    const t = tokenRef.current;
    if (ml === null || !t) return;
    const mine = edit.current;
    const ok = await saveWaterGoal(ml, t);
    if (!mounted.current) return;
    clearTimeout(savedTimer.current);
    if (ok) {
      // Keep the text if a newer change is already waiting to save.
      if (edit.current === mine) setText(null);
      setNote({ kind: 'saved', text: 'Saved' });
      savedTimer.current = setTimeout(() => {
        if (mounted.current) setNote((n) => (n?.kind === 'saved' ? null : n));
      }, REST_SAVED_MS);
    } else {
      setText(null);
      setNote({ kind: 'error', text: "Couldn't save the goal. Try again." });
    }
  }

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(savedTimer.current);
      // Leaving with a valid change still waiting saves it; an invalid one was never queued.
      if (timer.current !== undefined) {
        clearTimeout(timer.current);
        void save();
      }
    };
  }, []);

  const change = (next: string) => {
    edit.current += 1;
    setText(next);
    clearTimeout(timer.current);
    timer.current = undefined;
    const ml = ozToGoalMl(next);
    if (ml === null) {
      pendingMl.current = null;
      setNote({ kind: 'error', text: `Enter a whole number from ${GOAL_OZ_MIN} to ${GOAL_OZ_MAX}.` });
      return;
    }
    pendingMl.current = ml;
    setNote(null);
    timer.current = setTimeout(() => void save(), REST_SAVE_DELAY_MS);
  };

  const value = text ?? stored;
  const valid = ozToGoalMl(value) !== null;
  const oz = valid ? Number(value.trim()) : Number(stored);
  const atMin = valid && oz <= GOAL_OZ_MIN;
  const atMax = valid && oz >= GOAL_OZ_MAX;
  const step = (dir: -1 | 1) => {
    if (dir < 0 ? atMin : atMax) return;
    const to =
      dir > 0 ? (Math.floor(oz / GOAL_STEP_OZ) + 1) * GOAL_STEP_OZ : (Math.ceil(oz / GOAL_STEP_OZ) - 1) * GOAL_STEP_OZ;
    change(String(Math.min(GOAL_OZ_MAX, Math.max(GOAL_OZ_MIN, to))));
  };

  return (
    <SettingsRow
      label="Daily water goal"
      secondary="Shown on Day's water card"
      htmlFor="water-goal"
      class="settings-goal-row"
    >
      <div class="settings-goal-control">
        <button
          type="button"
          class="btn-icon settings-goal-btn"
          aria-label="Lower goal"
          aria-disabled={atMin ? 'true' : undefined}
          onClick={() => step(-1)}
        >
          <MinusIcon />
        </button>
        <input
          id="water-goal"
          class="form-input settings-goal-input"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          aria-invalid={valid ? undefined : 'true'}
          value={value}
          onInput={(e) => change((e.currentTarget as HTMLInputElement).value)}
        />
        <button
          type="button"
          class="btn-icon settings-goal-btn"
          aria-label="Raise goal"
          aria-disabled={atMax ? 'true' : undefined}
          onClick={() => step(1)}
        >
          <PlusIcon />
        </button>
        <span class="settings-goal-unit">oz</span>
      </div>
      <p class={note?.kind === 'error' ? 'settings-goal-note drink-error' : 'settings-goal-note'} role="status">
        {note?.text ?? ''}
      </p>
    </SettingsRow>
  );
}

function DataRow({ label, count, to, focusKey }: { label: string; count: number; to: string; focusKey?: string }) {
  const shown = loading.value ? '—' : String(count);
  return (
    <button
      type="button"
      class="settings-row settings-row-link"
      data-focus-key={focusKey}
      aria-label={`${label}, ${shown}, open`}
      onClick={() => navigate(to)}
    >
      <span class="settings-row-label">{label}</span>
      <span class="settings-row-value">
        <span class="settings-count">{shown}</span>
        <ChevronIcon />
      </span>
    </button>
  );
}

export function SettingsScreen() {
  const { user, token, logout } = useAuth();
  const sync = useSyncNow(token, user?.email ?? '');
  const who = user?.name || user?.email || '';

  return (
    <div class="screen settings-screen">
      <h1 class="day-title">Settings</h1>
      <div class="settings-cards">
        {user && (
          <SettingsCard class="settings-account">
            <div class="settings-account-row">
              <span class="settings-badge" aria-hidden="true">
                {who.charAt(0).toUpperCase()}
              </span>
              <div class="settings-row-text">
                <span class="settings-account-name">{user.name || user.email}</span>
                {user.name && <span class="settings-account-email">{user.email}</span>}
              </div>
            </div>
          </SettingsCard>
        )}

        <SettingsCard title="Appearance" icon={<ContrastIcon />}>
          <ThemeToggle />
        </SettingsCard>

        <RestTimesGroup token={token} />

        <SettingsCard title="Hydration" icon={<DropletIcon />} iconColor="var(--metric-water)">
          <WaterGoalRow token={token} />
        </SettingsCard>

        <SettingsCard title="Sync" icon={<SyncArrowsIcon />} action={<SyncNowButton sync={sync} />}>
          <CorosSyncStatusRow token={token} requestLine={sync.lines.coros} />
          <WithingsSyncStatusRow token={token} requestLine={sync.lines.withings} />
        </SettingsCard>

        <SettingsCard title="Your data" icon={<DatabaseIcon />}>
          <DataRow label="Workouts" count={workouts.value.length} to="/activities" />
          <DataRow label="Exercises" count={exercises.value.length} to="/exercises" />
          <DataRow label="Templates" count={templates.value.length} to="/templates" />
          <DataRow label="Labels" count={labels.value.length} to="/settings/labels" focusKey="manage-labels" />
        </SettingsCard>

        <button type="button" class="settings-btn" onClick={logout}>
          <span class="settings-btn-icon">
            <SignOutIcon />
          </span>
          Sign out
        </button>
      </div>
    </div>
  );
}

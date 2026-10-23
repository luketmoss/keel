import { useEffect, useState } from 'preact/hooks';
import { useAuth } from '../../auth/auth-context';
import { ThemeToggle } from '../shared/theme-toggle';
import { workouts, exercises, templates, labels } from '../../state/store';
import { navigate } from '../../router/router';
import { CorosSyncStatusRow, WithingsSyncStatusRow } from './sync-status-row';
import { useSyncNow, SyncNowButton } from './sync-now';
import { RestTimesGroup } from './rest-times-group';
import { GOAL_OZ_MAX, GOAL_OZ_MIN, goalOz, loadGoal, ozToGoalMl, saveWaterGoal, waterGoalMl } from '../../state/drinks';

/** The daily water goal (#520): whole ounces in the field, stored as ml. */
function WaterGoalRow({ token }: { token: string | null }) {
  const stored = String(goalOz(waterGoalMl.value));
  const [text, setText] = useState<string | null>(null);
  const [note, setNote] = useState<{ kind: 'error' | 'saved'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (token) void loadGoal(token);
  }, [token]);

  const value = text ?? stored;
  async function save() {
    const ml = ozToGoalMl(value);
    if (ml === null) {
      setNote({ kind: 'error', text: `Enter a whole number from ${GOAL_OZ_MIN} to ${GOAL_OZ_MAX}.` });
      return;
    }
    if (!token || saving) return;
    setSaving(true);
    const ok = await saveWaterGoal(ml, token);
    setSaving(false);
    if (ok) {
      setText(null);
      setNote({ kind: 'saved', text: 'Saved.' });
    } else setNote({ kind: 'error', text: "Couldn't save the goal. Try again." });
  }

  return (
    <>
      <div class="settings-row settings-goal-row">
        <label for="water-goal">Daily water goal</label>
        <input
          id="water-goal"
          class="form-input settings-goal-input"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={value}
          onInput={(e) => {
            setText((e.currentTarget as HTMLInputElement).value);
            setNote(null);
          }}
        />
        <span class="settings-detail">oz</span>
        <button
          type="button"
          class="btn btn-secondary"
          disabled={saving || value === stored}
          onClick={() => void save()}
        >
          Save
        </button>
      </div>
      <p class={note?.kind === 'error' ? 'settings-goal-note drink-error' : 'settings-goal-note'} role="status">
        {note?.text ?? ''}
      </p>
    </>
  );
}

export function SettingsScreen() {
  const { user, token, logout } = useAuth();
  const sync = useSyncNow(token, user?.email ?? '');

  return (
    <div class="screen settings-screen">
      <header class="screen-header">
        <h1>Settings</h1>
      </header>
      <div class="screen-body">
        <div class="settings-section">
          <h2>Appearance</h2>
          <div class="settings-row">
            <span>Theme</span>
            <ThemeToggle />
          </div>
        </div>

        <div class="settings-section">
          <h2>Hydration</h2>
          <WaterGoalRow token={token} />
        </div>

        <RestTimesGroup token={token} />

        <div class="settings-section">
          <h2>Data</h2>
          <div class="settings-row">
            <span>Workouts</span>
            <span class="settings-detail">{workouts.value.length} logged</span>
          </div>
          <div class="settings-row">
            <span>Exercises</span>
            <span class="settings-detail">{exercises.value.length} in library</span>
          </div>
          <div class="settings-row">
            <span>Templates</span>
            <span class="settings-detail">{templates.value.length} saved</span>
          </div>
          <div
            class="settings-row settings-row-link"
            data-focus-key="manage-labels"
            onClick={() => navigate('/settings/labels')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter') navigate('/settings/labels');
            }}
          >
            <span>Labels</span>
            <span class="settings-detail">{labels.value.length} defined &rsaquo;</span>
          </div>
        </div>

        <div class="settings-section">
          <h2>Sync status</h2>
          <SyncNowButton sync={sync} />
          <CorosSyncStatusRow token={token} requestLine={sync.lines.coros} />
          <WithingsSyncStatusRow token={token} requestLine={sync.lines.withings} />
        </div>

        <div class="settings-section">
          <h2>Account</h2>
          {user && (
            <div class="settings-row">
              <span>{user.name}</span>
              <span class="settings-detail">{user.email}</span>
            </div>
          )}
          <button class="settings-btn danger" onClick={logout}>
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}

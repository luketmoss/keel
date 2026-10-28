import { useEffect, useRef, useState } from 'preact/hooks';
import { kindOfKey, type RestSettingKey } from '../../api/rest-times';
import { loadRestSettings, restSettings, restSettingsStatus, saveRestSetting } from '../../state/rest-settings';
import { DurationStepper } from '../shared/duration-stepper';
import { SettingsCard, SettingsRow, TimerIcon } from './settings-card';

/** A value saves this long after the last press, one call per key (#576). */
export const REST_SAVE_DELAY_MS = 800;
/** How long "Saved" stays. */
export const REST_SAVED_MS = 2000;

const ROWS: { key: RestSettingKey; word: string; secondary: string }[] = [
  { key: 'rest_primary_s', word: 'Primary', secondary: 'between sets' },
  { key: 'rest_superset_s', word: 'Supersets', secondary: 'between rounds' },
  { key: 'switch_superset_s', word: 'Supersets', secondary: 'switching exercises' },
  { key: 'rest_burnout_s', word: 'Burnout', secondary: 'between rounds' },
  { key: 'switch_burnout_s', word: 'Burnout', secondary: 'switching exercises' },
];

export const REST_COPY = {
  heading: 'Rest times',
  helper: 'Templates use these unless a section sets its own. Lift Mode lets you change them for the day.',
  saved: 'Saved',
  saveFailed: "Couldn't save rest times. Try again.",
  loadFailed: "Couldn't load rest times.",
};

/**
 * Settings' "Rest times" group (#576): the five defaults, each on a duration
 * stepper. Until the stored values arrive the rows show the built-in defaults
 * with their steppers off; a failed load (or offline) keeps them off and says
 * so. A change saves 800 ms after the last press; a failed save puts the row
 * back to the stored value. Nothing is queued.
 */
export function RestTimesGroup({ token }: { token: string | null }) {
  const [edits, setEdits] = useState<Partial<Record<RestSettingKey, number>>>({});
  const [note, setNote] = useState<{ kind: 'saved' | 'error'; text: string } | null>(null);
  const timers = useRef(new Map<RestSettingKey, ReturnType<typeof setTimeout>>());
  const pending = useRef(new Map<RestSettingKey, number>());
  const savedTimer = useRef<ReturnType<typeof setTimeout>>();
  const mounted = useRef(true);
  const tokenRef = useRef(token);
  tokenRef.current = token;

  useEffect(() => {
    if (token) void loadRestSettings(token);
  }, [token]);

  const save = async (key: RestSettingKey) => {
    timers.current.delete(key);
    const seconds = pending.current.get(key);
    pending.current.delete(key);
    const t = tokenRef.current;
    if (seconds === undefined || !t) return;
    const ok = await saveRestSetting(key, seconds, t);
    if (!mounted.current) return;
    // Drop the edit unless a newer press is already waiting to save.
    if (!pending.current.has(key)) {
      setEdits((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
    clearTimeout(savedTimer.current);
    if (ok) {
      setNote({ kind: 'saved', text: REST_COPY.saved });
      savedTimer.current = setTimeout(() => {
        if (mounted.current) setNote((n) => (n?.kind === 'saved' ? null : n));
      }, REST_SAVED_MS);
    } else {
      setNote({ kind: 'error', text: REST_COPY.saveFailed });
    }
  };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(savedTimer.current);
      // Leaving the screen does not drop a change still waiting out its delay.
      for (const [key, timer] of timers.current) {
        clearTimeout(timer);
        void save(key);
      }
    };
  }, []);

  const change = (key: RestSettingKey, seconds: number) => {
    setEdits((prev) => ({ ...prev, [key]: seconds }));
    if (note?.kind === 'error') setNote(null);
    pending.current.set(key, seconds);
    clearTimeout(timers.current.get(key));
    timers.current.set(
      key,
      setTimeout(() => void save(key), REST_SAVE_DELAY_MS),
    );
  };

  const status = restSettingsStatus.value;
  const ready = status === 'ready';
  const stored = restSettings.value;

  return (
    <SettingsCard title={REST_COPY.heading} icon={<TimerIcon />} iconColor="var(--sec-primary)" class="rest-times">
      {ROWS.map(({ key, word, secondary }) => (
        <SettingsRow
          class="rest-row"
          key={key}
          label={word}
          secondary={secondary}
          role="group"
          ariaLabel={`${word}, ${secondary}`}
        >
          <DurationStepper
            value={edits[key] ?? stored[key]}
            kind={kindOfKey(key)}
            disabled={!ready}
            onChange={(s) => change(key, s)}
          />
        </SettingsRow>
      ))}
      <div class="rest-notes">
        <p class="rest-note">{REST_COPY.helper}</p>
        {status === 'error' && <p class="rest-note">{REST_COPY.loadFailed}</p>}
        <p class={note?.kind === 'error' ? 'drink-error' : 'rest-note'} role="status">
          {note?.text ?? ''}
        </p>
      </div>
    </SettingsCard>
  );
}

// The Spin workout of a bike plan (#772): a button that shows the choice, and the bottom sheet it opens
// over the library read from the RideWorkouts tab (`spin/ride-library.ts`, held for the session).
//
// A failed or empty library never blocks a plan: "No Spin workout" is always choosable. Choosing a row
// closes the sheet at once; there is no Continue, because nothing is lost by choosing again.

import { useId, useRef, useState } from 'preact/hooks';
import { useAuth } from '../../auth/auth-context';
import { formatHoursMinutes } from '../../api/duration';
import type { RideWorkoutRow } from '../../api/spin-rows';
import { ensureRideLibrary, useRideLibrary } from '../../spin/ride-library';
import { useModalFocus } from '../shared/use-modal-focus';

/** "Sweet spot · 1 h 14 min": a workout's category and length, whichever it has. */
export function workoutMeta(w: Pick<RideWorkoutRow, 'category' | 'duration_s'>): string {
  return [w.category, formatHoursMinutes(w.duration_s)].filter(Boolean).join(' · ');
}

interface SheetProps {
  /** The linked workout's id, or ''. */
  value: string;
  onChoose: (workout: RideWorkoutRow | null) => void;
  onClose: () => void;
}

/** The sheet. Exported for tests; screens use it through `SpinWorkoutField`. */
export function SpinPickerSheet({ value, onChoose, onClose }: SheetProps) {
  const { token } = useAuth();
  const library = useRideLibrary(true);
  const dialog = useRef<HTMLDivElement>(null);
  const group = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useModalFocus(dialog, onClose, { initialFocus: '[role="radio"][aria-checked="true"]' });

  const workouts = [...library.workouts].sort((a, b) => a.name.localeCompare(b.name));
  // An id the library no longer holds selects "No Spin workout": there is nothing else it could select.
  const selected = workouts.some((w) => w.id === value) ? value : '';

  const moveFocus = (e: KeyboardEvent) => {
    const keys = ['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'Home', 'End'];
    if (!keys.includes(e.key)) return;
    const rows = [...(group.current?.querySelectorAll<HTMLElement>('[role="radio"]') ?? [])];
    if (rows.length === 0) return;
    const at = rows.indexOf(document.activeElement as HTMLElement);
    e.preventDefault();
    let next = at;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') next = Math.min(rows.length - 1, at + 1);
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') next = Math.max(0, at - 1);
    else if (e.key === 'Home') next = 0;
    else next = rows.length - 1;
    rows[next]?.focus();
  };

  const row = (id: string, name: string, meta: string, workout: RideWorkoutRow | null) => {
    const on = selected === id;
    return (
      <button
        key={id || 'none'}
        type="button"
        role="radio"
        aria-checked={on ? 'true' : 'false'}
        tabIndex={on ? 0 : -1}
        class={`lift-choice-card spin-pick-row${on ? ' lift-choice-card-on spin-pick-row-on' : ''}`}
        onClick={() => onChoose(workout)}
      >
        <span class="spin-pick-row-name">
          {on && <span aria-hidden="true">✓ </span>}
          {name}
        </span>
        {meta && ' '}
        {meta && <span class="lift-choice-text">{meta}</span>}
      </button>
    );
  };

  return (
    <div
      class="modal-overlay"
      onClick={(e) => {
        if ((e.target as HTMLElement).classList.contains('modal-overlay')) onClose();
      }}
    >
      <div class="modal-content" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={dialog}>
        <div class="modal-header">
          <h2 id={titleId} class="spin-pick-title">
            Spin workout
          </h2>
          <button type="button" class="modal-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>

        {library.status === 'loading' && (
          <p class="spin-pick-status" role="status">
            Loading…
          </p>
        )}
        {library.status === 'error' && (
          <div class="spin-pick-status" role="alert">
            <p>Couldn't load your Spin workouts.</p>
            <button
              type="button"
              class="btn btn-secondary"
              style={{ minHeight: 'var(--touch-target)' }}
              onClick={() => void ensureRideLibrary(token)}
            >
              Try again
            </button>
          </div>
        )}

        <div class="spin-pick-list" role="radiogroup" aria-label="Spin workout" ref={group} onKeyDown={moveFocus}>
          {row('', 'No Spin workout', 'Just a bike plan', null)}
          {workouts.map((w) => row(w.id, w.name || 'Unnamed workout', workoutMeta(w), w))}
        </div>

        {library.status === 'loaded' && workouts.length === 0 && (
          <p class="spin-pick-status">No Spin workouts yet. Build one in Thrive Spin.</p>
        )}
      </div>
    </div>
  );
}

interface FieldProps {
  /** The linked workout's id, or ''. */
  value: string;
  /** Called with the chosen workout, or null for "No Spin workout". */
  onChange: (workout: RideWorkoutRow | null) => void;
  /** The label above, which names the button. */
  label?: string;
}

/**
 * The "Spin workout (optional)" field: a button showing the choice, which opens the sheet. The library
 * is read when a workout is already linked (to name it) or when the sheet opens, never at launch.
 */
export function SpinWorkoutField({ value, onChange, label = 'Spin workout (optional)' }: FieldProps) {
  const uid = useId();
  const labelId = `spin-field-label-${uid}`;
  const textId = `spin-field-text-${uid}`;
  const [open, setOpen] = useState(false);
  const library = useRideLibrary(Boolean(value));

  const linked = value ? library.workouts.find((w) => w.id === value) : undefined;
  // What the button says, and what stands beside it when the link cannot be named.
  let text = 'None';
  let aside = '';
  if (value) {
    if (linked) text = linked.name || 'Unnamed workout';
    else if (library.status === 'error') aside = "Couldn't load it";
    else if (library.status === 'loaded') aside = 'Removed from your library';
    else text = 'Loading…';
  }

  return (
    <div class="form-group">
      <span class="form-label" id={labelId}>
        {label}
      </span>
      <button
        type="button"
        class="btn btn-secondary spin-pick-btn"
        aria-haspopup="dialog"
        aria-labelledby={`${labelId} ${textId}`}
        onClick={() => setOpen(true)}
      >
        <span id={textId}>{text}</span>
        <span aria-hidden="true">›</span>
      </button>
      {aside && <p class="spin-pick-status">{aside}</p>}
      {open && (
        <SpinPickerSheet
          value={value}
          onChoose={(w) => {
            setOpen(false);
            onChange(w);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

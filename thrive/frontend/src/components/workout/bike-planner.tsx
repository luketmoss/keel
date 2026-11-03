// The bike planner (#772): a sibling of the weight planner, same header and Save. A bike plan is a
// `status = planned`, `type = bike` row with a name, a date, and optionally a Spin workout, an estimate
// and a venue. It has no exercises, so Save is never held up by an empty list.
//
// Choosing a Spin workout fills the name, the estimate and the venue, but only where the owner has not
// typed or picked something: what the form put there is replaced, what the owner put there is not.

import { useId, useRef, useState } from 'preact/hooks';
import { toLocalDateStr } from '../activities/activities-helpers';
import { estimateMinutesToSeconds } from '../../api/duration';
import type { RideWorkoutRow } from '../../api/spin-rows';
import { ask } from '../../state/confirm';
import { discardChangesCopy } from '../shared/confirm-copy';
import { SubTypeToggle } from '../shared/sub-type-toggle';
import { SpinWorkoutField } from './spin-picker';

/** What a new bike plan is called until someone names it. */
export const DEFAULT_BIKE_NAME = 'Bike';

export interface BikePlan {
  name: string;
  date: string;
  /** Seconds for `Workouts!AA`, or '' when left blank. */
  estimatedSeconds: string;
  /** `mountain`, `gravel`, `indoor` or ''. */
  subType: string;
  /** `RideWorkouts` id for `Workouts!AL`, or ''. */
  rideWorkoutId: string;
}

interface Props {
  /** Scheduled date (YYYY-MM-DD). Defaults to today. */
  initialDate?: string;
  onSave: (plan: BikePlan) => Promise<void>;
  onDiscard: () => void;
  saving: boolean;
}

export function BikePlanner({ initialDate, onSave, onDiscard, saving }: Props) {
  const uid = useId();
  const startDate = initialDate || toLocalDateStr(new Date());
  const [name, setName] = useState(DEFAULT_BIKE_NAME);
  const [date, setDate] = useState(startDate);
  const [estimate, setEstimate] = useState('');
  const [subType, setSubType] = useState('');
  const [rideId, setRideId] = useState('');
  // What the owner has done to a field, so a Spin workout never writes over it. The name is told apart
  // by value instead: it is the default, or the name the picker last filled in, until it is anything else.
  const filledName = useRef<string | null>(null);
  const estimateTouched = useRef(false);
  const venueTouched = useRef(false);

  const dirty = () =>
    name !== DEFAULT_BIKE_NAME || date !== startDate || estimate !== '' || subType !== '' || rideId !== '';

  const choose = (w: RideWorkoutRow | null) => {
    if (!w) {
      // No Spin workout clears the link and leaves everything else as it is.
      setRideId('');
      return;
    }
    setRideId(w.id);
    if (w.name && (name === DEFAULT_BIKE_NAME || name === filledName.current)) {
      setName(w.name);
      filledName.current = w.name;
    }
    if (!estimateTouched.current) setEstimate(estimateMinutesFromSeconds(w.duration_s));
    if (!venueTouched.current && subType === '') setSubType('indoor');
  };

  const handleSave = async () => {
    if (saving) return;
    await onSave({
      name: name.trim() || DEFAULT_BIKE_NAME,
      date: date || toLocalDateStr(new Date()),
      estimatedSeconds: estimateMinutesToSeconds(estimate),
      subType,
      rideWorkoutId: rideId,
    });
  };

  const back = async () => {
    if (dirty() && !(await ask(discardChangesCopy('plan')))) return;
    onDiscard();
  };

  const typeLabelId = `bike-type-label-${uid}`;
  return (
    <div class="screen template-editor bike-planner">
      <div class="template-editor-header">
        <button class="template-editor-back" onClick={back} aria-label="Back">
          ← Back
        </button>
        <button class="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Workout'}
        </button>
      </div>

      <div class="form-group">
        <label class="form-label" for={`bike-name-${uid}`}>
          Workout Name
        </label>
        <input
          id={`bike-name-${uid}`}
          class="form-input"
          type="text"
          value={name}
          onInput={(e) => setName((e.target as HTMLInputElement).value)}
        />
      </div>

      <div class="form-group">
        <label class="form-label" for={`bike-date-${uid}`}>
          Scheduled for
        </label>
        <input
          id={`bike-date-${uid}`}
          class="form-input"
          type="date"
          value={date}
          onInput={(e) => setDate((e.target as HTMLInputElement).value)}
        />
      </div>

      <SpinWorkoutField value={rideId} onChange={choose} />

      <div class="form-group">
        <label class="form-label" for={`bike-estimate-${uid}`}>
          Estimated duration (minutes, optional)
        </label>
        <input
          id={`bike-estimate-${uid}`}
          class="form-input"
          type="number"
          inputMode="numeric"
          min="1"
          step="1"
          placeholder="e.g. 45"
          value={estimate}
          onInput={(e) => {
            estimateTouched.current = true;
            setEstimate((e.target as HTMLInputElement).value);
          }}
        />
      </div>

      <div class="form-group">
        <span class="form-label" id={typeLabelId}>
          Type (optional)
        </span>
        <SubTypeToggle
          workoutType="bike"
          value={subType}
          onChange={(v) => {
            venueTouched.current = true;
            setSubType(v);
          }}
          label="Activity type"
          labelledBy={typeLabelId}
        />
      </div>
    </div>
  );
}

/** A library duration in seconds as whole minutes for the estimate field, nearest, or '' with none. */
function estimateMinutesFromSeconds(seconds: string): string {
  const n = Number(seconds);
  if (!seconds.trim() || !Number.isFinite(n)) return '';
  const mins = Math.round(n / 60);
  return mins >= 1 ? String(mins) : '';
}

import { useState } from 'preact/hooks';
import { workouts, sets, activeWorkoutId, showToast } from '../../state/store';
import { deleteWorkout, copyWorkout, saveWorkoutAsTemplate, startPlannedWorkout } from '../../state/actions';
import { useAuth } from '../../auth/auth-context';
import { navigate, goBack } from '../../router/router';
import {
  SectionCard,
  bestSetText,
  groupBySection,
  groupSetsIntoExercises,
  type ExerciseGroup,
} from './exercise-detail';
import { SetEffortCard, StrengthHero, isCompletedWeight } from './strength-summary';
import { ExerciseCompactCard } from '../shared/exercise-compact-card';
import { provenanceDetail } from '../../api/provenance';
import { WatchGlyph } from '../shared/provenance-mark';
import { corosActivityUrl } from '../../api/coros-link';
import { ask } from '../../state/confirm';
import { deleteWorkoutCopy } from '../shared/confirm-copy';
import { RouteHero, routeAvailable, trackAvailable, useWorkoutTrack } from './route-section';
import { ElevationProfile } from './elevation-profile';
import { DetailTopBar } from './detail-top-bar';
import { DetailTitle } from './detail-title';
import { DetailStats, hasStatsCard } from './detail-stats';
import { HistoryIcon, PencilLineIcon } from './detail-icons';
import { ChoiceSheet, type StartMode } from '../workout/choice-sheet';

interface Props {
  workoutId: string;
}

/** An arrow out of a box: "opens elsewhere". Decorative; sized to the text. */
function ExternalGlyph() {
  return (
    <svg class="detail-coros-link-glyph" viewBox="0 0 12 12" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M7 1.5h3.5V5M10.5 1.5 5.5 6.5M9 7.5v2.25c0 .41-.34.75-.75.75h-6a.75.75 0 0 1-.75-.75v-6c0-.41.34-.75.75-.75H4.5"
        stroke="currentColor"
        stroke-width="1.25"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

/** Find the most recent previous workout with the same template/name (for "last time" reference). */
function findPreviousWorkout(workoutId: string) {
  const workout = workouts.value.find((w) => w.id === workoutId);
  if (!workout) return null;

  // Sort by date desc, find the first one before this workout with the same name or template
  const sorted = [...workouts.value].sort((a, b) => {
    const da = a.date + 'T' + (a.time || '00:00');
    const db = b.date + 'T' + (b.time || '00:00');
    return db.localeCompare(da);
  });

  const thisDate = workout.date + 'T' + (workout.time || '00:00');
  return (
    sorted.find(
      (w) =>
        w.id !== workoutId &&
        w.date + 'T' + (w.time || '00:00') < thisDate &&
        ((workout.template_id && w.template_id === workout.template_id) ||
          (!workout.template_id && w.name === workout.name)),
    ) || null
  );
}

/** "Oct 12": the day a previous workout was done. */
function shortDay(date: string): string {
  return new Date(date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function WorkoutDetail({ workoutId }: Props) {
  const { token } = useAuth();
  const workout = workouts.value.find((w) => w.id === workoutId);
  const [deleting, setDeleting] = useState(false);
  const [startingPlanned, setStartingPlanned] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [showLastTime, setShowLastTime] = useState(false);
  // #532: the map hero and the Elevation card read the same track.
  const trackState = useWorkoutTrack(workout && trackAvailable(workout) ? workoutId : null);

  if (!workout) {
    return (
      <div class="screen">
        <div class="empty-state">
          <p>Workout not found</p>
          <button class="btn btn-primary" onClick={() => navigate('/activities')}>
            Back to Activities
          </button>
        </div>
      </div>
    );
  }

  const workoutSets = sets.value
    .filter((s) => s.workout_id === workoutId)
    .sort((a, b) => a.exercise_order - b.exercise_order || a.set_number - b.set_number);

  const exerciseGroups = groupSetsIntoExercises(workoutSets);

  // "Last time" reference
  const prevWorkout = findPreviousWorkout(workoutId);
  const prevSets = prevWorkout ? sets.value.filter((s) => s.workout_id === prevWorkout.id) : [];
  const prevGroups = prevSets.length > 0 ? groupSetsIntoExercises(prevSets) : [];
  // "Last time (Oct 12): 50 lb × 10 · Medium", for an exercise found in the previous workout.
  const lastTimeFor = (group: ExerciseGroup): string => {
    if (!showLastTime || !prevWorkout) return '';
    const prev = prevGroups.find(
      (pg) => pg.exercise_id === group.exercise_id && pg.exercise_order === group.exercise_order,
    );
    const best = prev ? bestSetText(prev.sets) : '';
    return best ? `Last time (${shortDay(prevWorkout.date)}): ${best}` : '';
  };

  const handleStartPlanned = () => {
    if (!token || startingPlanned) return;
    // Guard: cannot start if another workout is already active
    if (activeWorkoutId.value) {
      showToast('Finish your current workout before starting a new one', 'error');
      return;
    }
    // A weight workout asks how to run it first (#577); the plan is not touched until then.
    if (workout?.type === 'weight') setChoosing(true);
    else void startLogbook();
  };

  const handleChoice = (mode: StartMode) => {
    setChoosing(false);
    if (mode === 'lift') navigate(`/workout/${workoutId}/lift`);
    else void startLogbook();
  };

  const startLogbook = async () => {
    if (!token || startingPlanned) return;
    setStartingPlanned(true);
    try {
      const id = await startPlannedWorkout(workoutId, token);
      navigate(`/workout/${id}`);
    } catch {
      // Error toast shown by action
    } finally {
      setStartingPlanned(false);
    }
  };

  const handleDelete = async () => {
    if (!token) return;
    // A planned workout's sets are targets, not logged: only a set with a weight or reps counts.
    const logged = sets.value.filter((s) => s.workout_id === workoutId && (s.weight || s.reps)).length;
    if (!(await ask(deleteWorkoutCopy(workout, logged)))) return;
    setDeleting(true);
    try {
      await deleteWorkout(workoutId, token);
      goBack('/activities');
    } catch {
      // Error toast shown by action
    } finally {
      setDeleting(false);
    }
  };

  const handleCopy = async () => {
    if (!token) return;
    try {
      const newId = await copyWorkout(workoutId, token);
      navigate(`/workout/${newId}`);
    } catch {
      // Error toast shown by action
    }
  };

  const handleSaveAsTemplate = async () => {
    if (!token || !workout) return;
    const name = prompt('Template name:', workout.name);
    if (!name?.trim()) return;
    try {
      await saveWorkoutAsTemplate(workoutId, name.trim(), token);
    } catch {
      // Error toast shown by action
    }
  };

  const isPlanned = workout.status === 'planned';
  const isActive = workout.status === 'active';
  // #362: resuming is not starting, so the start guard does not apply. The
  // workout screen makes this the tracked workout.
  const handleResume = () => navigate(`/workout/${workoutId}`);
  const provenance = provenanceDetail(workout);
  const corosUrl = corosActivityUrl(workout);
  // #407, #532: a drawable track puts the map at the top of the screen, whatever the type, and the
  // route is a detail of its own, so the empty state below does not show over it.
  const showRoute = routeAvailable(workout);

  // Note card (#531), then provenance.
  const noteCard = workout.notes.trim() ? (
    <section class="detail-note-card">
      <h2 class="detail-note-heading">
        <PencilLineIcon />
        Note
      </h2>
      <p class="detail-notes">{workout.notes}</p>
    </section>
  ) : null;
  // #533: a weight workout that is not a plan lists its exercises as section cards.
  const strength = workout.type === 'weight' && !isPlanned;
  const sectionCards = groupBySection(exerciseGroups);

  return (
    <div class={`screen workout-detail-screen${showRoute ? ' has-hero' : ''}`}>
      {showRoute && <RouteHero trackState={trackState} />}

      <DetailTopBar
        canCopy={!isPlanned && workout.type === 'weight'}
        canSaveTemplate={!isPlanned && workout.type === 'weight' && exerciseGroups.length > 0}
        deleting={deleting}
        onBack={() => goBack()}
        onEdit={() => navigate(`/history/${workoutId}/edit`)}
        onCopy={handleCopy}
        onSaveTemplate={handleSaveAsTemplate}
        onDelete={handleDelete}
      />

      <div class="detail-sheet">
        <DetailTitle workout={workout} />

        {/* #531: a completed cardio or stretch activity's figures. */}
        {hasStatsCard(workout) && <DetailStats workout={workout} hideEmpty={showRoute} />}

        {/* #533: a completed weight workout's sets ring and what else is known, then its set effort. */}
        {isCompletedWeight(workout) && (
          <>
            <StrengthHero workout={workout} workoutSets={workoutSets} hideEmpty={showRoute} />
            <SetEffortCard workoutSets={workoutSets} />
          </>
        )}

        {/* #532: the track's elevation, once it has arrived; with or without a map. */}
        {trackState.status === 'ready' && trackState.track && (
          <ElevationProfile track={trackState.track} ascentM={workout.ascent_m} />
        )}

        {/* Planned workout: compact card view + footer actions */}
        {isPlanned &&
          workout.type === 'weight' &&
          (() => {
            // Build planned exercise list from sets or template
            const plannedExercises: {
              id: string;
              name: string;
              section: string;
              order: number;
              sets: string;
              reps: string;
              repsBySet?: string[];
            }[] = [];
            const seen = new Set<string>();

            // Build from workout sets
            for (const s of workoutSets) {
              const key = `${s.exercise_id}__${s.exercise_order}`;
              if (seen.has(key)) continue;
              seen.add(key);

              // Warmup exercises are list-only — show without sets/reps
              if (s.section === 'warmup') {
                plannedExercises.push({
                  id: s.exercise_id,
                  name: s.exercise_name,
                  section: 'warmup',
                  order: s.exercise_order,
                  sets: '',
                  reps: '',
                });
                continue;
              }

              const own = workoutSets
                .filter((ws) => ws.exercise_id === s.exercise_id && ws.exercise_order === s.exercise_order)
                .sort((a, b) => a.set_number - b.set_number);
              plannedExercises.push({
                id: s.exercise_id,
                name: s.exercise_name,
                section: s.section,
                order: s.exercise_order,
                sets: String(own.length),
                reps: s.planned_reps || '',
                repsBySet: own.map((ws) => ws.planned_reps || ''),
              });
            }

            plannedExercises.sort((a, b) => a.order - b.order);

            return plannedExercises.length > 0 ? (
              <div class="compact-card-list">
                {plannedExercises.map((ex, i) => (
                  <div key={`${ex.id}-${i}`}>
                    <ExerciseCompactCard
                      section={ex.section}
                      exerciseName={ex.name}
                      sets={ex.sets}
                      reps={ex.reps}
                      repsBySet={ex.repsBySet}
                    />
                  </div>
                ))}
              </div>
            ) : null;
          })()}

        {/* #533: the Note card comes before the exercises of a weight workout. */}
        {strength && noteCard}

        {/* Exercises of a weight workout, one card per section with every set a tile (#533). */}
        {strength && exerciseGroups.length > 0 && (
          <>
            <div class="strength-exercises-header">
              <h2 class="strength-exercises-heading">Exercises</h2>
              {prevWorkout && (
                <button
                  type="button"
                  class={`filter-chip last-time-chip${showLastTime ? ' active' : ''}`}
                  aria-pressed={showLastTime}
                  onClick={() => setShowLastTime(!showLastTime)}
                >
                  <HistoryIcon />
                  Last time
                </button>
              )}
            </div>
            {sectionCards.map((card) => (
              <SectionCard key={card.section} card={card} lastTimeFor={lastTimeFor} />
            ))}
          </>
        )}

        {!strength && noteCard}

        {(provenance || corosUrl || workout.copied_from) && (
          <div class="detail-provenance-block">
            {(provenance || corosUrl) && (
              <div class="detail-provenance-row">
                {/* #157: where this row came from (sync plan §8, §13). Manual rows, most of them, show nothing. */}
                {provenance && (
                  <p class="detail-provenance">
                    <WatchGlyph />
                    <span>{provenance}</span>
                  </p>
                )}
                {/* #260: the activity's page on the COROS web portal. Nothing at all when there is nothing to link to. */}
                {corosUrl && (
                  <a class="detail-coros-link" href={corosUrl} target="_blank" rel="noopener noreferrer">
                    {/* The trailing space joins the label to the hidden text in the
                      accessible name; in an inline-flex row it draws nothing. */}
                    {'View on COROS '}
                    <span class="sr-only">(opens in a new tab)</span>
                    <ExternalGlyph />
                  </a>
                )}
              </div>
            )}
            {workout.copied_from && <p class="detail-copied">Copied from a previous workout</p>}
          </div>
        )}

        {(isPlanned || isActive) && (
          <div class="detail-actions">
            {isPlanned && (
              <button
                class="btn btn-primary"
                style={{ width: '100%' }}
                onClick={handleStartPlanned}
                disabled={startingPlanned || deleting}
              >
                {startingPlanned ? 'Starting...' : 'Start Workout'}
              </button>
            )}
            {isActive && (
              <button class="btn btn-primary" style={{ width: '100%' }} onClick={handleResume} disabled={deleting}>
                Resume Workout
              </button>
            )}
          </div>
        )}
        {choosing && <ChoiceSheet onContinue={handleChoice} onCancel={() => setChoosing(false)} />}
      </div>
    </div>
  );
}

import { useState } from 'preact/hooks';
import { workouts, sets, templates, activeWorkoutId, showToast } from '../../state/store';
import { deleteWorkout, copyWorkout, saveWorkoutAsTemplate, startPlannedWorkout } from '../../state/actions';
import { useAuth } from '../../auth/auth-context';
import { navigate, goBack } from '../../router/router';
import { ExerciseDetail, groupSetsIntoExercises } from './exercise-detail';
import { ExerciseCompactCard } from '../shared/exercise-compact-card';
import { provenanceDetail } from '../../api/provenance';
import { WatchGlyph } from '../shared/provenance-mark';
import { corosActivityUrl } from '../../api/coros-link';
import { ask } from '../../state/confirm';
import { deleteWorkoutCopy } from '../shared/confirm-copy';
import { RouteSection, routeAvailable } from './route-section';
import { DetailTopBar } from './detail-top-bar';
import { DetailTitle } from './detail-title';
import { DetailStats, hasStatsCard } from './detail-stats';
import { PencilLineIcon } from './detail-icons';

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

export function WorkoutDetail({ workoutId }: Props) {
  const { token } = useAuth();
  const workout = workouts.value.find((w) => w.id === workoutId);
  const [expandedIndex, setExpandedIndex] = useState(-1);
  const [deleting, setDeleting] = useState(false);
  const [startingPlanned, setStartingPlanned] = useState(false);
  const [showLastTime, setShowLastTime] = useState(false);

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

  const handleStartPlanned = async () => {
    if (!token || startingPlanned) return;
    // Guard: cannot start if another workout is already active
    if (activeWorkoutId.value) {
      showToast('Finish your current workout before starting a new one', 'error');
      return;
    }
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
  // #407: the route is a detail of its own, so the empty state below does not show over it.
  const showRoute = routeAvailable(workout);

  return (
    <div class="screen workout-detail-screen">
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

      <DetailTitle workout={workout} />

      {/* #407: the activity's route, straight after the title. */}
      {showRoute && <RouteSection workout={workout} />}

      {/* #531: a completed cardio or stretch activity's figures; weight keeps its exercise list (#533). */}
      {hasStatsCard(workout) && <DetailStats workout={workout} hideEmpty={showRoute} />}

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

      {/* Exercise breakdown for completed weight workouts */}
      {!isPlanned && exerciseGroups.length > 0 && (
        <div class="detail-exercises">
          <div class="detail-section-header">
            <h3>Exercises</h3>
            {prevWorkout && (
              <button class="btn-link" onClick={() => setShowLastTime(!showLastTime)}>
                {showLastTime ? 'Hide' : 'Show'} last time
              </button>
            )}
          </div>

          {exerciseGroups.map((group, i) => (
            <div key={`${group.exercise_id}-${group.exercise_order}`}>
              <ExerciseDetail
                group={group}
                expanded={expandedIndex === i}
                onToggle={() => setExpandedIndex(expandedIndex === i ? -1 : i)}
              />
              {showLastTime &&
                prevGroups.length > 0 &&
                (() => {
                  const prev = prevGroups.find(
                    (pg) => pg.exercise_id === group.exercise_id && pg.exercise_order === group.exercise_order,
                  );
                  if (!prev) return null;
                  const prevBest = prev.sets.reduce<(typeof prev.sets)[0] | null>((best, s) => {
                    if (!best) return s;
                    return (Number(s.weight) || 0) > (Number(best.weight) || 0) ? s : best;
                  }, null);
                  if (!prevBest) return null;
                  return (
                    <div class="last-time-ref">
                      Last time: {prevBest.weight ? `${prevBest.weight} lbs` : ''}
                      {prevBest.weight && prevBest.reps ? ' × ' : ''}
                      {prevBest.reps ? `${prevBest.reps} reps` : ''}
                      {prevBest.effort ? ` (${prevBest.effort})` : ''}
                    </div>
                  );
                })()}
            </div>
          ))}
        </div>
      )}

      {/* Note card, then provenance (#531). */}
      {workout.notes.trim() && (
        <section class="detail-note-card">
          <h2 class="detail-note-heading">
            <PencilLineIcon />
            Note
          </h2>
          <p class="detail-notes">{workout.notes}</p>
        </section>
      )}

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
    </div>
  );
}

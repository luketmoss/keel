import { useState } from 'preact/hooks';
import { navigate } from '../../router/router';
import {
  filteredWorkouts,
  activeWorkouts,
  plannedWorkouts,
  completedWorkouts,
  activitiesMonth,
  filterType,
  filterTags,
  loading,
  sets,
} from '../../state/store';
import { ActivitiesFilters, TypeChips } from './activities-filters';
import { MonthPicker } from './month-picker';
import { MonthSummary } from './month-summary';
import { ActivityCard, UpNextCard } from './activity-card';
import {
  TYPE_WORDS,
  groupWorkoutsByWeek,
  monthName,
  monthOf,
  monthOptions,
  toLocalDateStr,
  upNextOrder,
  weekTotals,
} from './activities-helpers';

/** The list's empty line, by what is limiting it. */
function emptyLine(month: string, currentMonth: string): string {
  if (filterType.value) return `No ${TYPE_WORDS[filterType.value].toLowerCase()} activities in ${monthName(month)}.`;
  if (filterTags.value.length > 0) return `No activities with these tags in ${monthName(month)}.`;
  return month === currentMonth
    ? 'Nothing logged yet. Tap + to start a workout.'
    : `Nothing logged in ${monthName(month)}.`;
}

export function ActivitiesScreen() {
  const [showTags, setShowTags] = useState(false);

  const todayStr = toLocalDateStr(new Date());
  const currentMonth = monthOf(todayStr);
  const month = activitiesMonth.value;
  const completed = completedWorkouts.value;
  const options = monthOptions(completed, currentMonth);
  // #527: one month at a time. The type and tag filters apply inside it, and the summary card reads the same rows.
  const monthWorkouts = filteredWorkouts.value.filter((w) => monthOf(w.date) === month);
  const groups = groupWorkoutsByWeek(monthWorkouts, todayStr);
  const isCurrent = month === currentMonth;
  const upNext = upNextOrder(plannedWorkouts.value);

  return (
    <div class="screen activities-screen">
      <header class="activities-header">
        <MonthPicker
          value={month}
          options={options}
          onChoose={(ym) => {
            activitiesMonth.value = ym;
          }}
        />
        <h1 class="day-title">Activities</h1>
      </header>

      <TypeChips tagsOpen={showTags} onToggleTags={() => setShowTags(!showTags)} tagsId="activities-tag-filters" />
      {showTags && <ActivitiesFilters id="activities-tag-filters" />}

      <MonthSummary
        month={month}
        currentMonth={currentMonth}
        workouts={monthWorkouts}
        type={filterType.value}
        tagsActive={filterTags.value.length > 0}
        loading={loading.value}
      />

      {/* In Progress — tap to resume the active workout. Current month only (#528). */}
      {isCurrent && activeWorkouts.value.length > 0 && (
        <div class="planned-section">
          <div class="date-group-header first">In Progress</div>
          {activeWorkouts.value.map((w) => (
            <button
              type="button"
              key={w.id}
              data-focus-key={`workout:${w.id}`}
              class="workout-card workout-card-active"
              onClick={() => navigate(`/workout/${w.id}`)}
              aria-label={`${w.name || w.type}, in progress. Resume workout.`}
            >
              <div class="workout-card-center">
                <span class="workout-name">{w.name || w.type}</span>
                <span class="workout-meta">Tap to resume</span>
              </div>
              <span class="type-badge badge-active">Active</span>
            </button>
          ))}
        </div>
      )}

      {/* Up next — plans for today or later, and overdue ones. Current month only. */}
      {isCurrent && upNext.length > 0 && (
        <section class="up-next" aria-labelledby="up-next-title">
          <div class="week-heading">
            <h2 id="up-next-title">Up next</h2>
            <span class="week-totals">{upNext.length} planned</span>
          </div>
          <div class="up-next-row">
            {upNext.map((w) => {
              const workoutSets = sets.value.filter((s) => s.workout_id === w.id);
              const exerciseCount = new Set(workoutSets.map((s) => `${s.exercise_id}__${s.exercise_order}`)).size;
              return (
                <UpNextCard
                  key={w.id}
                  workout={w}
                  todayStr={todayStr}
                  exerciseCount={exerciseCount}
                  setCount={workoutSets.length}
                />
              );
            })}
          </div>
        </section>
      )}

      <div class="screen-body">
        {!loading.value && monthWorkouts.length === 0 ? (
          <p class="activities-empty">{emptyLine(month, currentMonth)}</p>
        ) : (
          <div class="workout-list">
            {groups.map((group) => (
              <section key={group.monday} class="week-group" aria-labelledby={`week-${group.monday}`}>
                <div class="week-heading">
                  <h2 id={`week-${group.monday}`}>{group.label}</h2>
                  <span class="week-totals">{weekTotals(group.workouts)}</span>
                </div>
                {group.workouts.map((w) => (
                  <ActivityCard key={w.id} workout={w} todayStr={todayStr} />
                ))}
              </section>
            ))}
          </div>
        )}
      </div>

      <button class="fab" onClick={() => navigate('/workout/new')} aria-label="Start workout">
        +
      </button>
    </div>
  );
}

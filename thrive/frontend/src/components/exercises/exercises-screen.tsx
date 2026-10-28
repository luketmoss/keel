import { useState, useMemo, useEffect } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { exercises as exercisesSignal, sets, workouts, allTags, getLabelByName } from '../../state/store';
import { addExercise, editExercise, removeExercise } from '../../state/actions';
import { useAuth } from '../../auth/auth-context';
import { ExerciseForm } from './exercise-form';
import { LibraryHeader } from '../shared/library-header';
import { getLabelColor, colorKeyFromName } from '../../api/label-colors';
import { mondayOf, toLocalDateStr } from '../activities/activities-helpers';
import { getLastTimeDataFrom, formatLastTimeDate } from '../workout/last-time-data';
import type { ExerciseWithRow, SetWithRow, WorkoutWithRow } from '../../api/types';
import { ask } from '../../state/confirm';
import { deleteExerciseCopy } from '../shared/confirm-copy';

/** Build a map of exerciseId → most recent workout date string. */
export function buildLastPerformedMap(allSets: SetWithRow[], allWorkouts: WorkoutWithRow[]): Map<string, string> {
  const workoutDateMap = new Map<string, string>();
  for (const w of allWorkouts) {
    workoutDateMap.set(w.id, w.date);
  }

  // For each exercise, find the most recent workout date
  const result = new Map<string, string>();
  for (const s of allSets) {
    const date = workoutDateMap.get(s.workout_id) || '';
    if (!date) continue;
    const current = result.get(s.exercise_id) || '';
    if (date > current) {
      result.set(s.exercise_id, date);
    }
  }
  return result;
}

/** Format a date as short display: "Mar 10, 2026" */
export function formatShortDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export type ExerciseSort = 'recent' | 'az';

/** Where the sort choice is remembered (#642). */
export const EXERCISE_SORT_KEY = 'thrive.exerciseSort';

/** The remembered sort. Missing, unknown or unreadable storage means Last used. */
export function readExerciseSort(): ExerciseSort {
  try {
    return localStorage.getItem(EXERCISE_SORT_KEY) === 'az' ? 'az' : 'recent';
  } catch {
    return 'recent';
  }
}

export function writeExerciseSort(sort: ExerciseSort): void {
  try {
    localStorage.setItem(EXERCISE_SORT_KEY, sort);
  } catch {
    // The choice still applies for this visit.
  }
}

export function splitExerciseTags(tags: string): string[] {
  return tags
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

export interface ExerciseGroup {
  key: string;
  heading: string;
  /** "16 exercises" under Last used; A–Z headings carry no count. */
  count: string;
  items: ExerciseWithRow[];
}

function addDaysStr(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return toLocalDateStr(d);
}

/** Last used: This week, Last week, Earlier (Monday-to-Sunday weeks, #528), then Not done yet. */
export function groupByLastUsed(
  list: ExerciseWithRow[],
  lastDone: Map<string, string>,
  todayStr: string,
): ExerciseGroup[] {
  const thisMonday = mondayOf(todayStr);
  const lastMonday = addDaysStr(thisMonday, -7);
  const buckets: Record<string, ExerciseWithRow[]> = { this: [], last: [], earlier: [], never: [] };
  for (const ex of list) {
    const date = lastDone.get(ex.id);
    if (!date) buckets.never.push(ex);
    else if (date >= thisMonday) buckets.this.push(ex);
    else if (date >= lastMonday) buckets.last.push(ex);
    else buckets.earlier.push(ex);
  }
  const byRecency = (a: ExerciseWithRow, b: ExerciseWithRow) =>
    (lastDone.get(b.id) ?? '').localeCompare(lastDone.get(a.id) ?? '') || a.name.localeCompare(b.name);
  const defs: [string, string][] = [
    ['this', 'This week'],
    ['last', 'Last week'],
    ['earlier', 'Earlier'],
    ['never', 'Not done yet'],
  ];
  return defs
    .filter(([key]) => buckets[key].length > 0)
    .map(([key, heading]) => {
      const items = [...buckets[key]].sort(byRecency);
      return { key, heading, count: `${items.length} ${items.length === 1 ? 'exercise' : 'exercises'}`, items };
    });
}

/** A–Z: one group per upper-cased first letter, with digits and symbols under "#" first. */
export function groupAlphabetically(list: ExerciseWithRow[]): ExerciseGroup[] {
  const buckets = new Map<string, ExerciseWithRow[]>();
  for (const ex of [...list].sort((a, b) => a.name.localeCompare(b.name))) {
    const first = ex.name.trim().charAt(0).toUpperCase();
    const key = /^[A-Z]$/.test(first) ? first : '#';
    const arr = buckets.get(key);
    if (arr) arr.push(ex);
    else buckets.set(key, [ex]);
  }
  const keys = [...buckets.keys()].sort((a, b) => (a === '#' ? -1 : b === '#' ? 1 : a.localeCompare(b)));
  return keys.map((key) => ({ key, heading: key, count: '', items: buckets.get(key)! }));
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** When it was last done: "Today", "Yesterday", "Thu" within 6 days, "Oct 8", "Oct 8, 2025"; '' if never. */
export function formatWhen(dateStr: string | undefined, todayStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  const t = new Date(todayStr + 'T00:00:00');
  const diff = Math.round((t.getTime() - d.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff >= 2 && diff <= 6) return WEEKDAYS[d.getDay()];
  const md = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return d.getFullYear() === t.getFullYear() ? md : `${md}, ${d.getFullYear()}`;
}

/** The label's colour as a dot, in both themes. Never the only cue: its word is beside it. */
function dotStyle(tag: string): Record<string, string> {
  const label = getLabelByName(tag);
  const color = getLabelColor(label?.color_key ?? colorKeyFromName(tag));
  if (!color) return {};
  return { '--dot': color.light.text, '--dot-dark': color.dark.text };
}

function Glyph({ children, size, cls }: { children: ComponentChildren; size: number; cls?: string }) {
  return (
    <svg
      class={cls}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

function effortClass(effort: string): string {
  if (!effort) return '';
  return `effort-${effort.toLowerCase()}`;
}

export function ExercisesScreen() {
  const { token } = useAuth();
  const [search, setSearch] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [editingExercise, setEditingExercise] = useState<ExerciseWithRow | null>(null);
  const [creatingExercise, setCreatingExercise] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sort, setSort] = useState<ExerciseSort>(readExerciseSort);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  const toggleSort = () => {
    const next: ExerciseSort = sort === 'recent' ? 'az' : 'recent';
    setSort(next);
    writeExerciseSort(next);
  };

  const total = exercisesSignal.value.length;
  // An exercise must have every selected label: this tab narrows (#641's picker widens).
  const filtered = exercisesSignal.value.filter((ex) => {
    const matchesSearch = ex.name.toLowerCase().includes(search.toLowerCase());
    const matchesTags =
      selectedTags.length === 0 || selectedTags.every((tag) => splitExerciseTags(ex.tags).includes(tag));
    return matchesSearch && matchesTags;
  });

  // AC1/AC5: Compute last-performed date map once
  const lastPerformedMap = useMemo(
    () => buildLastPerformedMap(sets.value, workouts.value),
    [sets.value, workouts.value],
  );

  const todayStr = toLocalDateStr(new Date());
  const groups =
    sort === 'recent' ? groupByLastUsed(filtered, lastPerformedMap, todayStr) : groupAlphabetically(filtered);
  const isFiltering = search !== '' || selectedTags.length > 0;

  // AC2: Escape key closes expanded panel
  useEffect(() => {
    if (!expandedId) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setExpandedId(null);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [expandedId]);

  const handleToggle = (exId: string) => {
    setExpandedId((prev) => (prev === exId ? null : exId));
  };

  const handleCreate = async (data: { name: string; tags: string; notes: string }) => {
    if (!token) return;
    await addExercise(data, token);
    setCreatingExercise(false);
  };

  const handleEdit = async (data: { name: string; tags: string; notes: string }) => {
    if (!token || !editingExercise) return;
    const updated: ExerciseWithRow = {
      ...editingExercise,
      name: data.name,
      tags: data.tags,
      notes: data.notes,
    };
    await editExercise(updated, token);
    setEditingExercise(null);
  };

  const handleDelete = async () => {
    if (!token || !editingExercise) return;
    if (!(await ask(deleteExerciseCopy(editingExercise.name)))) return;
    await removeExercise(editingExercise, token);
    setEditingExercise(null);
  };

  if (creatingExercise) {
    return (
      <div class="screen exercises-screen">
        <header class="screen-header">
          <h1>New Exercise</h1>
        </header>
        <div class="screen-body">
          <ExerciseForm onSubmit={handleCreate} onCancel={() => setCreatingExercise(false)} submitLabel="Create" />
        </div>
      </div>
    );
  }

  if (editingExercise) {
    return (
      <div class="screen exercises-screen">
        <header class="screen-header">
          <h1>Edit Exercise</h1>
        </header>
        <div class="screen-body">
          <ExerciseForm
            initial={{
              name: editingExercise.name,
              tags: editingExercise.tags,
              notes: editingExercise.notes,
            }}
            onSubmit={handleEdit}
            onCancel={() => setEditingExercise(null)}
            submitLabel="Save"
          />
          <button
            type="button"
            class="btn btn-danger"
            style="min-height: 48px; margin-top: 16px; width: 100%;"
            onClick={handleDelete}
          >
            Delete Exercise
          </button>
        </div>
      </div>
    );
  }

  return (
    <div class="screen exercises-screen">
      <LibraryHeader />
      <div class="screen-body">
        <div class="ex-search">
          <Glyph size={18} cls="ex-search-icon">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </Glyph>
          <input
            class="form-input search-input"
            type="text"
            placeholder={total > 0 ? `Search ${total} exercises` : 'Search exercises'}
            aria-label="Search exercises"
            value={search}
            onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
          />
        </div>

        {total > 0 && (
          <>
            <div class="activities-chips ex-chips" role="group" aria-label="Filter by label">
              <button
                type="button"
                class={`filter-chip${selectedTags.length === 0 ? ' active' : ''}`}
                aria-pressed={selectedTags.length === 0}
                onClick={() => setSelectedTags([])}
              >
                All
              </button>
              {allTags.value.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  class={`filter-chip${selectedTags.includes(tag) ? ' active' : ''}`}
                  aria-pressed={selectedTags.includes(tag)}
                  onClick={() => toggleTag(tag)}
                >
                  <span class="picker-dot" style={dotStyle(tag)} aria-hidden="true" />
                  {tag}
                </button>
              ))}
            </div>

            <div class="ex-count-row">
              <p class="ex-count" role="status" aria-live="polite">
                {isFiltering
                  ? `${filtered.length} of ${total} shown`
                  : `${total} ${total === 1 ? 'exercise' : 'exercises'}`}
              </p>
              <button
                type="button"
                class="btn-ghost ex-sort"
                aria-label={sort === 'recent' ? 'Sort: last used' : 'Sort: A to Z'}
                onClick={toggleSort}
              >
                <Glyph size={16}>
                  <path d="M7 4v16M3.5 16.5L7 20l3.5-3.5M17 20V4M13.5 7.5L17 4l3.5 3.5" />
                </Glyph>
                {sort === 'recent' ? 'Last used' : 'A–Z'}
              </button>
            </div>
          </>
        )}

        {total === 0 ? (
          <div class="empty-state">
            <p>No exercises yet.</p>
            <p>Tap + to add your first exercise.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div class="empty-state">
            <p>No matching exercises</p>
          </div>
        ) : (
          <div class="ex-groups">
            {groups.map((group) => (
              <section key={group.key} class="week-group" aria-label={group.heading}>
                <div class="week-heading">
                  <h2>{group.heading}</h2>
                  {group.count && <span class="week-totals">{group.count}</span>}
                </div>
                <div class="ex-card">
                  {group.items.map((ex) => {
                    const isExpanded = expandedId === ex.id;
                    const when = formatWhen(lastPerformedMap.get(ex.id), todayStr);
                    const tags = splitExerciseTags(ex.tags);
                    const lastTimeData = isExpanded ? getLastTimeDataFrom(ex.id, '', sets.value, workouts.value) : null;

                    return (
                      <div key={ex.id} class="ex-row">
                        <button
                          type="button"
                          class="exercise-list-item-header"
                          data-focus-key={`exercise:${ex.id}`}
                          aria-expanded={isExpanded}
                          onClick={() => handleToggle(ex.id)}
                        >
                          <span class="exercise-list-item-info">
                            <span class="exercise-list-item-name">{ex.name}</span>
                            {tags.length > 0 && (
                              <span class="ex-row-tags">
                                {tags.map((tag) => (
                                  <span key={tag} class="ex-row-tag">
                                    <span class="picker-dot ex-row-dot" style={dotStyle(tag)} aria-hidden="true" />
                                    {tag}
                                  </span>
                                ))}
                              </span>
                            )}
                          </span>
                          {when && <span class="ex-row-when">{when}</span>}
                          <Glyph size={16} cls={`ex-row-chevron${isExpanded ? ' expanded' : ''}`}>
                            <path d="M9 6l6 6-6 6" />
                          </Glyph>
                        </button>

                        {isExpanded && (
                          <div class="exercise-list-item-panel">
                            {lastTimeData ? (
                              <>
                                <div class="last-time-date">{formatLastTimeDate(lastTimeData.workoutDate)}</div>
                                <div class="exercise-detail-sets">
                                  <div class="exercise-detail-sets-header">
                                    <span>Set</span>
                                    <span>Weight</span>
                                    <span>Reps</span>
                                    <span>Effort</span>
                                  </div>
                                  {lastTimeData.sets.map((s) => (
                                    <div key={s.set_number} class="exercise-detail-set-row">
                                      <span class="set-num">{s.set_number}</span>
                                      <span>{s.weight ? `${s.weight} lbs` : '—'}</span>
                                      <span>{s.reps || '—'}</span>
                                      <span class={effortClass(s.effort)}>{s.effort || '—'}</span>
                                    </div>
                                  ))}
                                </div>
                              </>
                            ) : (
                              <p class="last-time-empty-text">No previous data</p>
                            )}
                            <button
                              type="button"
                              class="btn btn-secondary exercise-list-item-edit-btn"
                              onClick={() => setEditingExercise(ex)}
                            >
                              Edit
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
      <button class="fab" aria-label="New exercise" onClick={() => setCreatingExercise(true)}>
        +
      </button>
    </div>
  );
}

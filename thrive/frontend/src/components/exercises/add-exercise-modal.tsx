// The exercise picker, shared by the template editor, workout planner and workout tracker. #641: a
// bottom sheet that adds several exercises at once (selections are kept by id, in pick order, and
// `onAdd` gets them when the pinned button is pressed). #319: still a keyboard- and
// screen-reader-operable modal dialog. Rows are toggle buttons (`aria-pressed`), not a listbox, and
// the sheet owns its focus through `useModalFocus`. Every caller keeps its "+ Add Exercise" opener
// mounted, so restoring focus here covers all of them.

import { useState, useRef, useEffect, useMemo } from 'preact/hooks';
import { exercises as exercisesSignal, allTags, sets, workouts, getLabelByName } from '../../state/store';
import { addExercise } from '../../state/actions';
import { useAuth } from '../../auth/auth-context';
import { getLabelColor, colorKeyFromName } from '../../api/label-colors';
import { ExerciseForm } from './exercise-form';
import { buildLastPerformedMap } from './exercises-screen';
import { useModalFocus } from '../shared/use-modal-focus';
import type { ExerciseWithRow } from '../../api/types';

interface AddExerciseModalProps {
  /** The picked exercises in pick order, at least one. The caller closes the sheet. */
  onAdd: (exercises: ExerciseWithRow[]) => void;
  onClose: () => void;
  /** "Superset 1": shown as "to Superset 1" under the title. */
  sectionLabel?: string;
}

const TITLE_ID = 'add-exercise-title';
const SUBTITLE_ID = 'add-exercise-subtitle';

/** "Oct 24", with the year when it is not this year. */
export function formatLastDone(dateStr: string, long = false): string {
  const date = new Date(dateStr + 'T00:00:00');
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString('en-US', {
    month: long ? 'long' : 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

function splitTags(tags: string): string[] {
  return tags
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

/** The label's colour as a dot, in both themes. Never the only cue: its word is beside it. */
function dotStyle(tag: string): Record<string, string> {
  const label = getLabelByName(tag);
  const color = getLabelColor(label?.color_key ?? colorKeyFromName(tag));
  if (!color) return {};
  return { '--dot': color.light.text, '--dot-dark': color.dark.text };
}

function SearchGlyph() {
  return (
    <svg
      class="picker-search-icon"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

function PlusGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function CheckGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      stroke-width="3"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

export function AddExerciseModal({ onAdd, onClose, sectionLabel }: AddExerciseModalProps) {
  const { token } = useAuth();
  const [search, setSearch] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createName, setCreateName] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const focusRowId = useRef<string | null>(null);

  useModalFocus(dialogRef, onClose, { initialFocus: '.search-input' });

  const lastDone = useMemo(() => buildLastPerformedMap(sets.value, workouts.value), [sets.value, workouts.value]);

  // Switching views moves focus with it: the form's Name field, a just-created row, or back to search.
  useEffect(() => {
    if (showCreateForm) {
      dialogRef.current?.querySelector<HTMLInputElement>('form input')?.focus();
      return;
    }
    const id = focusRowId.current;
    focusRowId.current = null;
    const row = id ? dialogRef.current?.querySelector<HTMLElement>(`[data-exercise-id="${id}"]`) : null;
    (row ?? searchRef.current)?.focus();
  }, [showCreateForm]);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  const toggleExercise = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const filtered = exercisesSignal.value
    .filter((ex) => {
      const matchesSearch = ex.name.toLowerCase().includes(search.toLowerCase());
      const matchesTags = selectedTags.length === 0 || selectedTags.some((tag) => splitTags(ex.tags).includes(tag));
      return matchesSearch && matchesTags;
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const handleBackgroundClick = (e: MouseEvent) => {
    if ((e.target as HTMLElement).classList.contains('picker-overlay')) {
      onClose();
    }
  };

  const handleCreate = async (data: { name: string; tags: string; notes: string }) => {
    if (!token) return;
    const created = await addExercise(data, token);
    // Back to the list with the new exercise selected and the search cleared. Not added yet.
    setSearch('');
    setSelectedIds((prev) => (prev.includes(created.id) ? prev : [...prev, created.id]));
    focusRowId.current = created.id;
    setShowCreateForm(false);
  };

  const handleAdd = () => {
    const byId = new Map(exercisesSignal.value.map((ex) => [ex.id, ex]));
    const picked = selectedIds.map((id) => byId.get(id)).filter((ex): ex is ExerciseWithRow => ex !== undefined);
    if (picked.length > 0) onAdd(picked);
  };

  const trimmed = search.trim();
  const createLabel = filtered.length === 0 && trimmed ? `Create “${trimmed}”` : 'Create new exercise';
  const count = selectedIds.length;

  return (
    <div class="picker-overlay" onClick={handleBackgroundClick}>
      <div
        class="picker-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
        aria-describedby={sectionLabel && !showCreateForm ? SUBTITLE_ID : undefined}
        ref={dialogRef}
      >
        <span class="picker-grab" aria-hidden="true" />
        <div class="picker-header">
          <div class="picker-heading">
            <h2 id={TITLE_ID}>{showCreateForm ? 'New exercise' : 'Add exercises'}</h2>
            {sectionLabel && !showCreateForm && (
              <p id={SUBTITLE_ID} class="picker-subtitle">
                to {sectionLabel}
              </p>
            )}
          </div>
          <button type="button" class="modal-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>

        {showCreateForm ? (
          <div class="picker-form">
            <ExerciseForm
              initial={createName ? { name: createName, tags: '', notes: '' } : undefined}
              onSubmit={handleCreate}
              onCancel={() => setShowCreateForm(false)}
              submitLabel="Create"
            />
          </div>
        ) : (
          <>
            <div class="picker-search">
              <SearchGlyph />
              <input
                ref={searchRef}
                class="form-input search-input"
                type="text"
                placeholder="Search exercises"
                aria-label="Search exercises"
                value={search}
                onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
              />
            </div>

            {allTags.value.length > 0 && (
              <div class="picker-chips" role="group" aria-label="Filter by label">
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
            )}

            <div class="exercise-list">
              {/* Always mounted, so the empty message is announced when it appears. */}
              <div class="exercise-list-status" role="status">
                {filtered.length === 0 && <div class="exercise-list-empty">No matching exercises</div>}
              </div>
              {filtered.map((ex) => {
                const tags = splitTags(ex.tags);
                const last = lastDone.get(ex.id);
                const selected = selectedIds.includes(ex.id);
                const nameId = `add-exercise-${ex.id}-name`;
                const metaId = `add-exercise-${ex.id}-meta`;
                const visible = [...tags, ...(last ? [`last ${formatLastDone(last)}`] : [])].join(' · ');
                const spoken = [...tags, ...(last ? [`last done ${formatLastDone(last, true)}`] : [])].join(', ');
                return (
                  <button
                    key={ex.id}
                    type="button"
                    class="exercise-list-item"
                    data-exercise-id={ex.id}
                    aria-pressed={selected}
                    aria-labelledby={nameId}
                    aria-describedby={spoken ? metaId : undefined}
                    onClick={() => toggleExercise(ex.id)}
                  >
                    <span class="exercise-list-item-text">
                      <span id={nameId} class="exercise-list-item-name">
                        {ex.name}
                      </span>
                      {visible && (
                        <span class="exercise-list-item-meta" aria-hidden="true">
                          {visible}
                        </span>
                      )}
                      {spoken && (
                        <span id={metaId} class="sr-only">
                          {spoken}
                        </span>
                      )}
                    </span>
                    <span class={`exercise-list-item-check${selected ? ' selected' : ''}`} aria-hidden="true">
                      {selected && <CheckGlyph />}
                    </span>
                  </button>
                );
              })}
              <button
                type="button"
                class="create-new-row"
                onClick={() => {
                  setCreateName(trimmed);
                  setShowCreateForm(true);
                }}
              >
                <PlusGlyph />
                <span>{createLabel}</span>
              </button>
            </div>

            <div class="picker-footer">
              <button type="button" class="btn btn-primary picker-add" disabled={count === 0} onClick={handleAdd}>
                {count === 0 ? 'Choose exercises' : `Add ${count} ${count === 1 ? 'exercise' : 'exercises'}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

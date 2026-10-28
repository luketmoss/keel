// #667 — one exercise inside a section card of the Logbook: its name and options menu, the Last time
// line, a tile per set with the one open set's editor under them, and the Change section sheet.
// A warm-up is a list row. thrive/docs/design/667-logbook-redesign.md.

import { useId, useRef, useState } from 'preact/hooks';
import { SetTile, SetEditor } from './set-row';
import type { TrackerSet, SaveStatus } from './set-row';
import { LastTimeLine } from './last-time-panel';
import { ActionMenu } from './tracker-menu';
import type { MenuItem } from './tracker-menu';
import { ALL_SECTIONS } from './section-management';
import { isLogged } from './tracker-model';
import { sectionTitle } from '../activities/exercise-detail';
import { useModalFocus } from '../shared/use-modal-focus';
import { PlusIcon, TrashIcon } from '../activities/detail-icons';
import type { Effort, SetWithRow } from '../../api/types';

export interface TrackerExercise {
  exercise_id: string;
  exercise_name: string;
  section: string;
  exercise_order: number;
  sets: TrackerSet[];
  quickFillWeight: string;
  quickFillReps: string;
  quickFillEffort: Effort | '';
  /**
   * Client-only row identity (#371), from `newRowKey()`. Unlike
   * `exercise_id`/`exercise_order` it survives a move and tells duplicates
   * apart. Never part of a set payload, so it cannot reach the sheet.
   */
  rowKey?: string;
}

interface Props {
  exercise: TrackerExercise;
  currentWorkoutId: string;
  /** The Exercises heading's Last time chip is pressed. */
  showLastTime: boolean;
  /** The set number open in this exercise, if one is. */
  openSet: number | null;
  /** The editor's status line for a set (log mode only). */
  statusFor: (setNumber: number) => SaveStatus;
  /** Set numbers whose removal is in flight. */
  removing: ReadonlySet<number>;
  /** First / last of its section: Move up / Move down are aria-disabled there. */
  isFirst: boolean;
  isLast: boolean;
  onOpenSet: (setNumber: number | null) => void;
  onUpdateSet: (setNumber: number, updates: Partial<TrackerSet>) => void;
  onAddSet: () => void;
  onRemoveSet: (setNumber: number) => void;
  onSameForAll: (setNumber: number) => void;
  onCopyDown: (lastTimeSets: SetWithRow[]) => void;
  onChangeSection: (newSection: string) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemoveExercise: () => void;
}

export function ExerciseRow({
  exercise,
  currentWorkoutId,
  showLastTime,
  openSet,
  statusFor,
  removing,
  isFirst,
  isLast,
  onOpenSet,
  onUpdateSet,
  onAddSet,
  onRemoveSet,
  onSameForAll,
  onCopyDown,
  onChangeSection,
  onMoveUp,
  onMoveDown,
  onRemoveExercise,
}: Props) {
  const [flashSets, setFlashSets] = useState(false);
  const [sheet, setSheet] = useState(false);
  const isWarmup = exercise.section === 'warmup';

  const items: MenuItem[] = [
    {
      key: 'up',
      label: 'Move up',
      onSelect: onMoveUp,
      ariaDisabled: isFirst,
      attrs: { 'data-move': 'up' },
    },
    {
      key: 'down',
      label: 'Move down',
      onSelect: onMoveDown,
      ariaDisabled: isLast,
      attrs: { 'data-move': 'down' },
    },
    { key: 'section', label: 'Change section…', onSelect: () => setSheet(true) },
    {
      key: 'remove',
      label: 'Remove exercise',
      icon: <TrashIcon />,
      onSelect: onRemoveExercise,
      danger: true,
    },
  ];

  const options = (
    <ActionMenu label={`${exercise.exercise_name} options`} items={items} triggerAttrs={{ 'data-options-btn': '' }} />
  );

  const sheetEl = sheet && (
    <ChangeSectionSheet
      exercise={exercise}
      onClose={() => setSheet(false)}
      onChoose={(section) => {
        setSheet(false);
        onChangeSection(section);
      }}
    />
  );

  // A warm-up is list only: its name and its options, no tiles, no editor.
  if (isWarmup) {
    return (
      <div class="lb-exercise lb-warmup" data-row-key={exercise.rowKey}>
        <div class="lb-name-row">
          <span class="lb-warmup-name">{exercise.exercise_name}</span>
          {options}
        </div>
        {sheetEl}
      </div>
    );
  }

  const open = exercise.sets.find((s) => s.set_number === openSet) ?? null;
  const openIndex = open ? exercise.sets.indexOf(open) : -1;

  return (
    <div class="lb-exercise" data-row-key={exercise.rowKey}>
      <div class="lb-name-row">
        <span class="lb-exercise-name">{exercise.exercise_name}</span>
        {options}
      </div>

      {showLastTime && (
        <LastTimeLine
          exerciseId={exercise.exercise_id}
          exerciseName={exercise.exercise_name}
          currentWorkoutId={currentWorkoutId}
          onCopyDown={(lastTimeSets) => {
            onCopyDown(lastTimeSets);
            setFlashSets(true);
            setTimeout(() => setFlashSets(false), 600);
          }}
        />
      )}

      <div class={`lb-tiles${flashSets ? ' copy-down-flash' : ''}`}>
        {exercise.sets.map((set) => (
          <SetTile
            key={set.set_number}
            set={set}
            open={set.set_number === openSet}
            removing={removing.has(set.set_number)}
            onToggle={() => onOpenSet(set.set_number === openSet ? null : set.set_number)}
          />
        ))}
        <button
          type="button"
          class="lb-tile lb-tile-add"
          aria-label={`Add a set to ${exercise.exercise_name}`}
          onClick={onAddSet}
        >
          <PlusIcon />
        </button>
      </div>

      {open && (
        <SetEditor
          exerciseName={exercise.exercise_name}
          set={open}
          status={statusFor(open.set_number)}
          canCopyToAll={exercise.sets.length > 1}
          isLast={openIndex === exercise.sets.length - 1}
          removing={removing.has(open.set_number)}
          onChange={(updates) => onUpdateSet(open.set_number, updates)}
          onSameForAll={() => onSameForAll(open.set_number)}
          onRemove={() => onRemoveSet(open.set_number)}
          onNext={() =>
            onOpenSet(openIndex >= exercise.sets.length - 1 ? null : exercise.sets[openIndex + 1].set_number)
          }
        />
      )}
      {sheetEl}
    </div>
  );
}

/**
 * The Change section sheet (#667): one radio row per section, in the exercise picker's frame. Choosing
 * Warm-up for an exercise with logged sets first shows the warning that its sets are deleted.
 */
function ChangeSectionSheet({
  exercise,
  onClose,
  onChoose,
}: {
  exercise: TrackerExercise;
  onClose: () => void;
  onChoose: (section: string) => void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const titleId = `change-section-${useId()}`;
  const [warn, setWarn] = useState(false);
  useModalFocus(dialog, onClose, { initialFocus: '[role="radio"][aria-checked="true"]' });

  const logged = exercise.sets.filter(isLogged).length;

  const choose = (section: string) => {
    if (section === exercise.section) {
      onClose();
      return;
    }
    if (section === 'warmup' && logged > 0) {
      setWarn(true);
      return;
    }
    onChoose(section);
  };

  return (
    <div
      class="lb-sheet-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div class="lb-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={dialog}>
        <span class="picker-grab" aria-hidden="true" />
        <div class="lb-sheet-body">
          <h2 id={titleId} class="lb-sheet-title">
            Move {exercise.exercise_name} to
          </h2>
          {warn ? (
            <div class="lb-warn" role="alert">
              <p class="lb-warn-text">
                Warm-ups are list only, so its {logged} logged {logged === 1 ? 'set is' : 'sets are'} deleted.
              </p>
              <div class="lb-sheet-actions">
                <button type="button" class="btn btn-danger lb-save-btn" onClick={() => onChoose('warmup')}>
                  Move to warm-up
                </button>
                <button type="button" class="btn btn-secondary lb-keep-btn" onClick={() => setWarn(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div class="lb-section-list" role="radiogroup" aria-labelledby={titleId}>
              {ALL_SECTIONS.map((s) => {
                const current = s === exercise.section;
                return (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    class="lb-section-row"
                    aria-checked={current ? 'true' : 'false'}
                    onClick={() => choose(s)}
                  >
                    <span>{sectionTitle(s)}</span>
                    {current && (
                      <svg
                        viewBox="0 0 24 24"
                        width="18"
                        height="18"
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
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

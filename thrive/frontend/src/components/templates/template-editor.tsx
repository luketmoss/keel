import { useState, useEffect, useLayoutEffect, useRef, useId } from 'preact/hooks';
import { templates } from '../../state/store';
import { addTemplate, editTemplate, removeTemplate } from '../../state/actions';
import { useAuth } from '../../auth/auth-context';
import { navigate } from '../../router/router';
import { AddExerciseModal } from '../exercises/add-exercise-modal';
import { newRowKey, swapAt, useReorderFocus, type MoveDirection } from '../shared/reorder-focus';
import { SectionPicker } from '../shared/section-picker';
import { sectionPills } from '../shared/section-pills';
import { RepsField } from '../shared/reps-field';
import type { ExerciseWithRow } from '../../api/types';
import { ask } from '../../state/confirm';
import { deleteTemplateCopy, discardChangesCopy } from '../shared/confirm-copy';
import { REST_SECTIONS, SWITCH_SECTIONS, sectionRestOf, type SectionRest } from '../../api/rest-times';
import { loadRestSettings, restSettings } from '../../state/rest-settings';
import { SectionRestBand } from './template-rest';
import { sectionTitle } from '../activities/exercise-detail';
import { ChevronDownIcon, CloseIcon, PlusIcon, TrashIcon } from '../activities/detail-icons';
import { TemplateSummary, templateStats } from './template-summary';
import { prescription } from './template-detail';

export interface TemplateExerciseSlot {
  exercise_id: string;
  exercise_name: string;
  section: string;
  sets: string;
  reps: string;
}

interface Props {
  templateId?: string;
}

/** A builder row: a template row's fields and a client-only identity (#328), which never reaches the sheet. */
interface Row {
  key: string;
  slot: TemplateExerciseSlot;
}

const BLANK_REST: SectionRest = { rest_s: '', switch_s: '' };

/** The Sets stepper's limits (#640). */
const MIN_SETS = 1;
const MAX_SETS = 20;

/**
 * What saving writes per section (#576): the values of each section that still
 * has an exercise and carries a rest, switch only where a switch applies.
 * Warm-up and cool-down get blanks, as does a section with nothing set.
 */
export function restToSave(
  exercises: readonly Pick<TemplateExerciseSlot, 'section'>[],
  rest: Record<string, SectionRest>,
): Record<string, SectionRest> {
  const out: Record<string, SectionRest> = {};
  for (const { section } of exercises) {
    if (section in out) continue;
    const own = rest[section] ?? BLANK_REST;
    out[section] = {
      rest_s: REST_SECTIONS.includes(section) ? own.rest_s : '',
      switch_s: SWITCH_SECTIONS.includes(section) ? own.switch_s : '',
    };
  }
  return out;
}

/**
 * Items grouped by section, the sections in order of first appearance and each section's items in their
 * current order (#640). The builder keeps its list in this shape, so a card is a run of the list and saving
 * writes cards top to bottom.
 */
export function groupBySection<T extends { section: string }>(items: readonly T[]): T[] {
  const order: string[] = [];
  const by = new Map<string, T[]>();
  for (const item of items) {
    if (!by.has(item.section)) {
      by.set(item.section, []);
      order.push(item.section);
    }
    by.get(item.section)!.push(item);
  }
  return order.flatMap((section) => by.get(section)!);
}

/** `rows` with each of `added` placed after the last row of its section, or at the end when the section is new. */
function insertAtSectionEnd(rows: readonly Row[], added: readonly Row[]): Row[] {
  const out = [...rows];
  for (const row of added) {
    let at = -1;
    out.forEach((o, i) => {
      if (o.slot.section === row.slot.section) at = i;
    });
    out.splice(at === -1 ? out.length : at + 1, 0, row);
  }
  return out;
}

export { sectionPills };

/** A closed row's accessible name: "Bench Press BB, 5 sets of 4 to 6, edit". */
function rowLabel(name: string, sets: string, reps: string): string {
  const spokenReps = reps.replace(/^(\d+)\s*[-–]\s*(\d+)$/, '$1 to $2');
  let rx = '';
  if (sets && reps) rx = `${sets} ${sets.trim() === '1' ? 'set' : 'sets'} of ${spokenReps}`;
  else if (sets) rx = prescription(sets, '');
  else if (reps) rx = `${spokenReps} reps`;
  return [name, rx, 'edit'].filter(Boolean).join(', ');
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function TemplateEditor({ templateId }: Props) {
  const { token } = useAuth();
  const [name, setName] = useState('');
  // Always grouped by section (see `groupBySection`), so each card is a run of this list.
  const [rows, setRows] = useState<Row[]>([]);
  const reorder = useReorderFocus();
  // The section the open picker adds to, or null when it is closed.
  const [pickerSection, setPickerSection] = useState<string | null>(null);
  // At most one row is open (#640).
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // "Moved to Superset 2", read out after a section change.
  const [sectionNote, setSectionNote] = useState('');
  // #576: each section's rest and switch, '' meaning Default. Saved onto every
  // row of the section; a section with no exercise left saves nothing.
  const [sectionRest, setSectionRest] = useState<Record<string, SectionRest>>({});
  const uid = useId();

  // Focus to place once the list has re-rendered: a row's button, its Section control, or a card's Add exercise.
  const pendingFocus = useRef<(() => HTMLElement | null | undefined) | null>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const find = pendingFocus.current;
    if (!find) return;
    pendingFocus.current = null;
    find()?.focus();
  });
  const rowEl = (key: string) =>
    Array.from(screenRef.current?.querySelectorAll<HTMLElement>('[data-row-key]') ?? []).find(
      (el) => el.dataset.rowKey === key,
    );

  const exercises = rows.map((r) => r.slot);

  // Track initial state for dirty checking
  const initialState = useRef({ name: '', exercises: '', rest: '{}' });

  useEffect(() => {
    if (token) void loadRestSettings(token);
  }, [token]);

  // Populate state in edit mode
  useEffect(() => {
    if (!templateId) {
      initialState.current = { name: '', exercises: '', rest: '{}' };
      return;
    }
    const tpl = templates.value.find((t) => t.id === templateId);
    if (tpl) {
      // A template whose sections were interleaved is shown, and saved, grouped (#640).
      const mapped = groupBySection(
        tpl.exercises.map((r) => ({
          exercise_id: r.exercise_id,
          exercise_name: r.exercise_name,
          section: r.section as string,
          sets: r.sets,
          reps: r.reps,
        })),
      );
      const rest = sectionRestOf(tpl.exercises);
      setName(tpl.name);
      setRows(mapped.map((slot) => ({ key: newRowKey(), slot })));
      setSectionRest(rest);
      initialState.current = {
        name: tpl.name,
        exercises: JSON.stringify(mapped),
        rest: JSON.stringify(restToSave(mapped, rest)),
      };
    }
  }, [templateId]);

  const handleExercisesAdded = (picked: ExerciseWithRow[]) => {
    if (pickerSection === null) return;
    const added: Row[] = picked.map((ex) => ({
      key: newRowKey(),
      slot: { exercise_id: ex.id, exercise_name: ex.name, section: pickerSection, sets: '1', reps: '' },
    }));
    setRows((prev) => insertAtSectionEnd(prev, added));
    setPickerSection(null);
    // The first one added opens, and takes focus on its row button.
    setOpenKey(added[0].key);
    pendingFocus.current = () => rowEl(added[0].key)?.querySelector<HTMLElement>('[data-row-btn]');
  };

  const updateSlot = (key: string, updated: Partial<TemplateExerciseSlot>) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, slot: { ...r.slot, ...updated } } : r)));
  };

  // A change of Section moves the row to the end of the target card, which is created when it is new.
  const changeSection = (key: string, section: string) => {
    setRows((prev) => {
      const row = prev.find((r) => r.key === key);
      if (!row || row.slot.section === section) return prev;
      const rest = prev.filter((r) => r.key !== key);
      return insertAtSectionEnd(rest, [{ ...row, slot: { ...row.slot, section } }]);
    });
    setSectionNote(`Moved to ${sectionTitle(section)}`);
    // The row is rebuilt inside its new card, so focus goes back to the Section control.
    pendingFocus.current = () => rowEl(key)?.querySelector<HTMLElement>('.section-picker-pill[aria-pressed="true"]');
  };

  // Move up / down stay inside the row's section.
  const move = (key: string, dir: MoveDirection) => {
    const i = rows.findIndex((r) => r.key === key);
    const to = dir === 'up' ? i - 1 : i + 1;
    if (i < 0 || to < 0 || to >= rows.length || rows[to].slot.section !== rows[i].slot.section) return;
    const inSection = rows.filter((r) => r.slot.section === rows[i].slot.section);
    const position = inSection.findIndex((r) => r.key === key) + (dir === 'up' ? 0 : 2);
    setRows((prev) => swapAt(prev, i, to));
    reorder.moved(key, dir, rows[i].slot.exercise_name, position, inSection.length);
  };

  const removeRow = (key: string) => {
    const i = rows.findIndex((r) => r.key === key);
    if (i < 0) return;
    const section = rows[i].slot.section;
    const mates = rows.filter((r) => r.slot.section === section);
    const at = mates.findIndex((r) => r.key === key);
    // Focus goes to the next row in the card, else the previous one, else the card's Add exercise.
    const target = mates[at + 1] ?? mates[at - 1];
    pendingFocus.current = target
      ? () => rowEl(target.key)?.querySelector<HTMLElement>('[data-row-btn]')
      : () => screenRef.current?.querySelector<HTMLElement>(`[data-add-section="${section}"]`);
    setRows((prev) => prev.filter((r) => r.key !== key));
    if (openKey === key) setOpenKey(null);
  };

  const handleSave = async () => {
    if (!token || !name.trim() || exercises.length === 0) return;
    setSaving(true);
    try {
      const rest = restToSave(exercises, sectionRest);
      // `rows` is already card by card, so each section's rows are contiguous.
      const inputs = exercises.map((ex) => ({
        exercise_id: ex.exercise_id,
        exercise_name: ex.exercise_name,
        section: ex.section,
        sets: ex.sets || '1',
        reps: ex.reps,
        rest_s: rest[ex.section]?.rest_s ?? '',
        switch_s: rest[ex.section]?.switch_s ?? '',
      }));

      if (templateId) {
        const tpl = templates.value.find((t) => t.id === templateId);
        const existingRows = tpl?.exercises ?? [];
        await editTemplate(templateId, name.trim(), inputs, existingRows, token);
        navigate(`/templates/${templateId}`);
      } else {
        await addTemplate(name.trim(), inputs, token);
        navigate('/templates');
      }
    } catch {
      // Error toast shown by action
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!token || !templateId) return;
    const tpl = templates.value.find((t) => t.id === templateId);
    if (!tpl) return;
    if (!(await ask(deleteTemplateCopy(tpl.name, tpl.exercises.length)))) return;
    setSaving(true);
    try {
      await removeTemplate(templateId, tpl.exercises, token);
      navigate('/templates');
    } catch {
      // Error toast shown by action
    } finally {
      setSaving(false);
    }
  };

  const isDirty = () => {
    if (name !== initialState.current.name) return true;
    if (JSON.stringify(exercises) !== initialState.current.exercises) return true;
    if (JSON.stringify(restToSave(exercises, sectionRest)) !== initialState.current.rest) return true;
    return false;
  };

  const handleDiscard = async () => {
    if (isDirty() && !(await ask(discardChangesCopy('template')))) return;
    if (templateId) {
      navigate(`/templates/${templateId}`);
    } else {
      navigate('/templates');
    }
  };

  // One card per section, in order of first appearance (#533's words).
  const cards: { section: string; rows: Row[] }[] = [];
  for (const row of rows) {
    const last = cards[cards.length - 1];
    if (last && last.section === row.slot.section) last.rows.push(row);
    else cards.push({ section: row.slot.section, rows: [row] });
  }
  const pills = sectionPills(new Set(cards.map((c) => c.section)));
  const stats = templateStats({ exercises });
  const canSave = !saving && name.trim() !== '' && exercises.length > 0;

  return (
    <div class="screen template-editor tpl-builder" ref={screenRef}>
      <div class="tpl-top-bar">
        <button type="button" class="detail-icon-btn" aria-label="Close" onClick={handleDiscard}>
          <CloseIcon />
        </button>
        <button
          type="button"
          class="btn btn-primary tpl-save"
          aria-disabled={canSave ? undefined : 'true'}
          onClick={() => {
            if (canSave) void handleSave();
          }}
        >
          <span>{saving ? 'Saving…' : 'Save'}</span>
        </button>
      </div>

      <div class="tpl-name-block">
        <label class="detail-date-line" for={`${uid}-name`}>
          Template name
        </label>
        <input
          id={`${uid}-name`}
          class="form-input tpl-name-input"
          type="text"
          placeholder="Name this template"
          value={name}
          onInput={(e) => setName((e.target as HTMLInputElement).value)}
        />
      </div>

      <section class="detail-stats-card">
        <TemplateSummary stats={stats} plan />
      </section>

      <div class="tpl-cards" ref={reorder.listRef}>
        {cards.length === 0 && <p class="tpl-start-note">Add a section to start.</p>}

        {cards.map((card) => {
          const title = sectionTitle(card.section);
          return (
            <section class="strength-section-card tpl-card" key={card.section}>
              <div class="tpl-card-head">
                <h2 class="strength-section-heading">{title}</h2>
                <span class="tpl-card-count">{plural(card.rows.length, 'exercise')}</span>
              </div>

              {card.rows.map(({ key, slot }, at) => {
                const open = openKey === key;
                return (
                  <div class="tpl-row" key={key} data-row-key={key}>
                    <button
                      type="button"
                      class="tpl-row-btn"
                      data-row-btn
                      aria-expanded={open ? 'true' : 'false'}
                      aria-label={rowLabel(slot.exercise_name, slot.sets, slot.reps)}
                      onClick={() => setOpenKey(open ? null : key)}
                    >
                      <span class="tpl-row-name">{slot.exercise_name}</span>
                      <span class="tpl-row-rx">{prescription(slot.sets, slot.reps)}</span>
                      <span class="tpl-row-chevron" aria-hidden="true">
                        <ChevronDownIcon />
                      </span>
                    </button>

                    {open && (
                      <RowPanel
                        slot={slot}
                        first={at === 0}
                        last={at === card.rows.length - 1}
                        onChange={(updated) => updateSlot(key, updated)}
                        onSection={(section) => changeSection(key, section)}
                        onMove={(dir) => move(key, dir)}
                        onRemove={() => removeRow(key)}
                      />
                    )}
                  </div>
                );
              })}

              <SectionRestBand
                section={card.section}
                value={sectionRest[card.section] ?? BLANK_REST}
                defaults={restSettings.value}
                onChange={(next) => setSectionRest((prev) => ({ ...prev, [card.section]: next }))}
              />

              <button
                type="button"
                class="btn btn-ghost tpl-add-btn"
                data-add-section={card.section}
                aria-label={`Add exercise to ${title}`}
                onClick={() => setPickerSection(card.section)}
              >
                <PlusIcon />
                <span>Add exercise</span>
              </button>
            </section>
          );
        })}
      </div>

      {pills.length > 0 && (
        <section class="tpl-add-section">
          <div class="week-heading">
            <h2>Add a section</h2>
          </div>
          <div class="tpl-pills">
            {pills.map((p) => (
              <button
                type="button"
                key={p.section}
                class="filter-chip tpl-pill"
                onClick={() => setPickerSection(p.section)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </section>
      )}

      {templateId && (
        <section class="detail-stats-card tpl-quiet-card">
          <button type="button" class="tpl-row-btn tpl-quiet-btn" onClick={handleDiscard}>
            Discard changes
          </button>
          <button
            type="button"
            class="tpl-row-btn tpl-quiet-btn tpl-quiet-danger"
            onClick={handleDelete}
            disabled={saving}
          >
            <TrashIcon />
            <span>Delete template</span>
          </button>
        </section>
      )}

      {/* Mounted empty with the screen so the first move is announced (#328). */}
      <div role="status" aria-live="polite" class="sr-only">
        {reorder.announcement}
      </div>
      <div aria-live="polite" class="sr-only">
        {sectionNote}
      </div>

      {pickerSection !== null && (
        <AddExerciseModal
          sectionLabel={sectionTitle(pickerSection)}
          onAdd={handleExercisesAdded}
          onClose={() => setPickerSection(null)}
        />
      )}
    </div>
  );
}

/**
 * An open row's controls (#640): Section, a Sets stepper, Reps, and Move up / Move down / Remove. Reps is
 * the shared whole-number field (#376), so a stored range shows read-only and saves exactly as stored until
 * replaced. Labels tied by `useId`.
 */
function RowPanel({
  slot,
  first,
  last,
  onChange,
  onSection,
  onMove,
  onRemove,
}: {
  slot: TemplateExerciseSlot;
  first: boolean;
  last: boolean;
  onChange: (updated: Partial<TemplateExerciseSlot>) => void;
  onSection: (section: string) => void;
  onMove: (dir: MoveDirection) => void;
  onRemove: () => void;
}) {
  const uid = useId();
  const parsed = parseInt(slot.sets, 10);
  const sets = Number.isNaN(parsed) ? MIN_SETS : parsed;
  const step = (dir: -1 | 1) => onChange({ sets: String(Math.min(MAX_SETS, Math.max(MIN_SETS, sets + dir))) });
  const stepButton = (dir: -1 | 1) => {
    const blocked = dir < 0 ? sets <= MIN_SETS : sets >= MAX_SETS;
    return (
      <button
        type="button"
        class="btn-icon tpl-step-btn"
        aria-label={dir < 0 ? 'Fewer sets' : 'More sets'}
        aria-disabled={blocked ? 'true' : undefined}
        onClick={() => {
          if (!blocked) step(dir);
        }}
      >
        <span aria-hidden="true">{dir < 0 ? '−' : '+'}</span>
      </button>
    );
  };
  const atEnd = (dir: MoveDirection) => (dir === 'up' ? first : last);

  return (
    <div class="tpl-panel">
      <SectionPicker value={slot.section} onChange={onSection} />

      <div class="tpl-field-row">
        <span class="tpl-field-label" id={`${uid}-sets`}>
          Sets
        </span>
        <div class="tpl-stepper" role="group" aria-labelledby={`${uid}-sets`}>
          {stepButton(-1)}
          <span class="tpl-stepper-value" aria-live="polite">
            {sets}
          </span>
          {stepButton(1)}
        </div>
      </div>

      <div class="tpl-field-row">
        <label class="tpl-field-label" for={`${uid}-reps`}>
          Reps
        </label>
        <div class="form-group tpl-reps">
          <RepsField
            id={`${uid}-reps`}
            value={slot.reps}
            onChange={(reps) => onChange({ reps })}
            exerciseName={slot.exercise_name}
          />
        </div>
      </div>

      <div class="tpl-actions">
        {(['up', 'down'] as const).map((dir) => (
          <button
            type="button"
            key={dir}
            class="btn btn-secondary tpl-chip"
            data-move={dir}
            aria-disabled={atEnd(dir) ? 'true' : undefined}
            onClick={() => {
              if (!atEnd(dir)) onMove(dir);
            }}
          >
            <span>{dir === 'up' ? 'Move up' : 'Move down'}</span>
          </button>
        ))}
        <button type="button" class="btn btn-ghost tpl-remove" onClick={onRemove}>
          Remove
        </button>
      </div>
    </div>
  );
}

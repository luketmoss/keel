// #640 - the template builder: section cards, rows that open in place, Add exercise per section, Add a
// section pills, and rows saved card by card.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, within } from '@testing-library/preact';
import { templates, exercises } from '../../state/store';
import type { ExerciseWithRow, TemplateRowWithRow } from '../../api/types';

const editTemplate = vi.fn(async (..._args: unknown[]) => undefined);
const addTemplate = vi.fn(async (..._args: unknown[]) => undefined);
const navigate = vi.fn();
vi.mock('../../state/actions', () => ({
  addTemplate: (...args: unknown[]) => addTemplate(...args),
  editTemplate: (...args: unknown[]) => editTemplate(...args),
  removeTemplate: vi.fn(),
  addExercise: vi.fn(),
}));
vi.mock('../../auth/auth-context', () => ({ useAuth: () => ({ token: 'test-token' }) }));
vi.mock('../../router/router', () => ({ navigate: (...args: unknown[]) => navigate(...args) }));
vi.mock('../../api/rest-times', async (orig) => ({
  ...(await orig<typeof import('../../api/rest-times')>()),
  getRestSettings: vi.fn(async () => ({ ok: false, kind: 'no_api_url' })),
}));

const { TemplateEditor, groupBySection, sectionPills } = await import('./template-editor');

// Interleaved on purpose: Primary, Superset 1, Primary again.
const LIST: [string, string, string, string, string][] = [
  ['e1', 'Bench Press', 'primary', '5', '4-6'],
  ['e2', 'Arnold Press', 'SS1', '3', '10'],
  ['e3', 'Row BB', 'primary', '3', ''],
  ['e4', 'Lateral Raise', 'SS1', '1', ''],
];

const ex = (id: string, name: string): ExerciseWithRow => ({ id, name, tags: '', notes: '', created: '', sheetRow: 2 });

function rows(): TemplateRowWithRow[] {
  return LIST.map(([exercise_id, exercise_name, section, sets, reps], i) => ({
    template_id: 't1',
    template_name: 'Push',
    order: i + 1,
    exercise_id,
    exercise_name,
    section,
    sets,
    reps,
    rest_s: '',
    switch_s: '',
    sheetRow: i + 2,
  }));
}

beforeEach(() => {
  templates.value = [{ id: 't1', name: 'Push', exercises: rows() }];
  exercises.value = [ex('x1', 'Ab Wheel'), ex('x2', 'Dips'), ex('x3', 'Plank')];
  editTemplate.mockClear();
  addTemplate.mockClear();
  navigate.mockClear();
});
afterEach(() => {
  cleanup();
  templates.value = [];
  exercises.value = [];
});

const q = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const rowBtns = () => [...document.querySelectorAll<HTMLElement>('.tpl-row-btn[data-row-btn]')];
const rowBtn = (name: string) => rowBtns().find((b) => b.querySelector('.tpl-row-name')?.textContent === name)!;
const cardTitles = () =>
  [...document.querySelectorAll('.tpl-card .strength-section-heading')].map((h) => h.textContent);
const cardRows = (title: string) =>
  [...document.querySelectorAll('.tpl-card')]
    .find((c) => c.querySelector('.strength-section-heading')?.textContent === title)!
    .querySelectorAll('.tpl-row-name');
const names = (title: string) => [...cardRows(title)].map((n) => n.textContent);
const save = () => fireEvent.click(q('.tpl-save'));
const saved = () => editTemplate.mock.calls[0][2] as Record<string, string>[];
const pill = (label: string) =>
  [...document.querySelectorAll<HTMLElement>('.tpl-pill')].find((p) => p.textContent === label)!;
const picker = () => document.querySelector('[role="dialog"]');
const pickRows = () => [...document.querySelectorAll<HTMLElement>('.exercise-list > .exercise-list-item')];
const pick = (...picked: string[]) => {
  for (const n of picked) fireEvent.click(pickRows().find((r) => r.textContent?.startsWith(n))!);
  fireEvent.click(q('.picker-add'));
};

describe('grouping helpers', () => {
  it('groupBySection keeps sections in order of first appearance and rows in order', () => {
    const out = groupBySection([
      { section: 'primary', n: 1 },
      { section: 'SS1', n: 2 },
      { section: 'primary', n: 3 },
    ]);
    expect(out.map((x) => x.n)).toEqual([1, 3, 2]);
  });

  it('sectionPills hides present sections, offers the lowest free superset, and none when all three exist', () => {
    expect(sectionPills(new Set()).map((p) => p.label)).toEqual([
      'Warm-up',
      'Primary',
      'Superset',
      'Burnout',
      'Cool-down',
    ]);
    expect(sectionPills(new Set(['primary', 'SS1'])).find((p) => p.label === 'Superset')!.section).toBe('SS2');
    expect(sectionPills(new Set(['SS1', 'SS2', 'SS3'])).map((p) => p.label)).not.toContain('Superset');
  });
});

describe('the cards and rows', () => {
  it('shows one card per section in order of first appearance, interleaved rows grouped', () => {
    render(<TemplateEditor templateId="t1" />);
    expect(cardTitles()).toEqual(['Primary', 'Superset 1']);
    expect(names('Primary')).toEqual(['Bench Press', 'Row BB']);
    expect(names('Superset 1')).toEqual(['Arnold Press', 'Lateral Raise']);
    expect(document.body.textContent).toContain('2 exercises');
  });

  it('a closed row has no arrows or remove, a name with the prescription, and aria-expanded', () => {
    render(<TemplateEditor templateId="t1" />);
    const b = rowBtn('Bench Press');
    expect(b.getAttribute('aria-expanded')).toBe('false');
    expect(b.getAttribute('aria-label')).toBe('Bench Press, 5 sets of 4 to 6, edit');
    expect(b.querySelector('.tpl-row-rx')!.textContent).toBe('5 × 4-6');
    expect(document.querySelector('[data-move]')).toBeNull();
    expect(rowBtn('Row BB').querySelector('.tpl-row-rx')!.textContent).toBe('3 sets');
    expect(rowBtn('Lateral Raise').querySelector('.tpl-row-rx')!.textContent).toBe('1 set');
  });

  it('opening a row closes any other, and the open row shows Section, Sets, Reps and the actions', () => {
    render(<TemplateEditor templateId="t1" />);
    fireEvent.click(rowBtn('Bench Press'));
    expect(document.querySelectorAll('.tpl-panel')).toHaveLength(1);
    expect(within(q('.tpl-panel')).getByText('Move up')).toBeTruthy();
    expect(within(q('.tpl-panel')).getByText('Remove')).toBeTruthy();
    fireEvent.click(rowBtn('Arnold Press'));
    expect(rowBtn('Bench Press').getAttribute('aria-expanded')).toBe('false');
    expect(rowBtn('Arnold Press').getAttribute('aria-expanded')).toBe('true');
    expect(document.querySelectorAll('.tpl-panel')).toHaveLength(1);
    fireEvent.click(rowBtn('Arnold Press'));
    expect(document.querySelector('.tpl-panel')).toBeNull();
  });

  it('the Sets stepper runs 1 to 20 and updates the prescription and the summary', () => {
    render(<TemplateEditor templateId="t1" />);
    fireEvent.click(rowBtn('Lateral Raise'));
    const fewer = within(q('.tpl-panel')).getByLabelText('Fewer sets');
    expect(fewer.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(within(q('.tpl-panel')).getByLabelText('More sets'));
    expect(rowBtn('Lateral Raise').querySelector('.tpl-row-rx')!.textContent).toBe('2 sets');
    expect(q('.tpl-figures').textContent).toContain('13');
  });

  it('Move up and Move down stay inside the section and are disabled at its ends', () => {
    render(<TemplateEditor templateId="t1" />);
    fireEvent.click(rowBtn('Bench Press'));
    const up = q('[data-move="up"]');
    expect(up.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(q('[data-move="down"]'));
    expect(names('Primary')).toEqual(['Row BB', 'Bench Press']);
    expect(q('[data-move="down"]').getAttribute('aria-disabled')).toBe('true');
    expect(document.activeElement).toBe(q('[data-move="down"]'));
    expect(q('[role="status"]').textContent).toBe('Bench Press moved to position 2 of 2');
    fireEvent.click(q('[data-move="down"]'));
    expect(names('Primary')).toEqual(['Row BB', 'Bench Press']);
  });

  it('Remove drops the row with no confirm and focuses the next row, else the previous', () => {
    render(<TemplateEditor templateId="t1" />);
    fireEvent.click(rowBtn('Bench Press'));
    fireEvent.click(within(q('.tpl-panel')).getByText('Remove'));
    expect(names('Primary')).toEqual(['Row BB']);
    expect(document.activeElement).toBe(rowBtn('Row BB'));
    fireEvent.click(rowBtn('Row BB'));
    fireEvent.click(within(q('.tpl-panel')).getByText('Remove'));
    expect(cardTitles()).toEqual(['Superset 1']);
  });

  it('changing Section moves the row to the end of that card, keeps it open, focuses the Section control', () => {
    render(<TemplateEditor templateId="t1" />);
    fireEvent.click(rowBtn('Bench Press'));
    fireEvent.click(within(q('.tpl-panel')).getByText('SS1'));
    expect(names('Primary')).toEqual(['Row BB']);
    expect(names('Superset 1')).toEqual(['Arnold Press', 'Lateral Raise', 'Bench Press']);
    expect(rowBtn('Bench Press').getAttribute('aria-expanded')).toBe('true');
    expect((document.activeElement as HTMLElement).textContent).toBe('SS1');
    expect(document.body.textContent).toContain('Moved to Superset 1');
  });

  it('changing Section to one not present creates its card at the end, and an emptied card goes', () => {
    templates.value = [{ id: 't1', name: 'Push', exercises: rows().slice(0, 1) }];
    render(<TemplateEditor templateId="t1" />);
    fireEvent.click(rowBtn('Bench Press'));
    fireEvent.click(within(q('.tpl-panel')).getByText('burnout'));
    expect(cardTitles()).toEqual(['Burnout']);
  });
});

describe('adding exercises', () => {
  it('a card ends with Add exercise, named for the section, opening the picker titled "to <Section>"', () => {
    render(<TemplateEditor templateId="t1" />);
    const add = document.querySelector('[aria-label="Add exercise to Superset 1"]') as HTMLElement;
    expect(add.textContent).toBe('Add exercise');
    fireEvent.click(add);
    expect(picker()!.textContent).toContain('to Superset 1');
  });

  it('every pick is appended to that card in pick order, Sets 1 and blank reps; the first opens and has focus', () => {
    render(<TemplateEditor templateId="t1" />);
    fireEvent.click(document.querySelector('[aria-label="Add exercise to Superset 1"]')!);
    pick('Plank', 'Ab Wheel');
    expect(picker()).toBeNull();
    expect(names('Superset 1')).toEqual(['Arnold Press', 'Lateral Raise', 'Plank', 'Ab Wheel']);
    expect(rowBtn('Plank').getAttribute('aria-expanded')).toBe('true');
    expect(rowBtn('Ab Wheel').getAttribute('aria-expanded')).toBe('false');
    expect(rowBtn('Plank').querySelector('.tpl-row-rx')!.textContent).toBe('1 set');
    expect(document.activeElement).toBe(rowBtn('Plank'));
  });

  it('adding to a card that is not last lands at the end of that card, not the end of the template', () => {
    render(<TemplateEditor templateId="t1" />);
    fireEvent.click(document.querySelector('[aria-label="Add exercise to Primary"]')!);
    pick('Dips');
    expect(cardTitles()).toEqual(['Primary', 'Superset 1']);
    expect(names('Primary')).toEqual(['Bench Press', 'Row BB', 'Dips']);
  });

  it('pills start sections: only absent kinds, the next free superset, and the card appears once something is added', () => {
    render(<TemplateEditor templateId="t1" />);
    expect([...document.querySelectorAll('.tpl-pill')].map((p) => p.textContent)).toEqual([
      'Warm-up',
      'Superset',
      'Burnout',
      'Cool-down',
    ]);
    fireEvent.click(pill('Superset'));
    expect(picker()!.textContent).toContain('to Superset 2');
    pick('Dips');
    expect(cardTitles()).toEqual(['Primary', 'Superset 1', 'Superset 2']);
    expect(names('Superset 2')).toEqual(['Dips']);
  });

  it('closing the picker adds nothing and leaves no empty card', () => {
    render(<TemplateEditor templateId="t1" />);
    fireEvent.click(pill('Burnout'));
    fireEvent.click(q('.modal-close'));
    expect(picker()).toBeNull();
    expect(cardTitles()).toEqual(['Primary', 'Superset 1']);
  });

  it('a new template reads "Add a section to start." above the pills, and Save is unavailable until named', () => {
    templates.value = [];
    render(<TemplateEditor />);
    expect(document.body.textContent).toContain('Add a section to start.');
    expect(document.body.textContent).toContain('Add a section');
    expect(q('.tpl-save').getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(pill('Primary'));
    pick('Dips');
    expect(q('.tpl-save').getAttribute('aria-disabled')).toBe('true');
    fireEvent.input(q('.tpl-name-input'), { target: { value: 'New one' } });
    expect(q('.tpl-save').hasAttribute('aria-disabled')).toBe(false);
  });
});

describe('saving and leaving', () => {
  it('writes the Order card by card, each section contiguous, with no row key', async () => {
    render(<TemplateEditor templateId="t1" />);
    save();
    await vi.waitFor(() => expect(editTemplate).toHaveBeenCalled());
    expect(saved().map((x) => x.exercise_name)).toEqual(['Bench Press', 'Row BB', 'Arnold Press', 'Lateral Raise']);
    expect(saved().map((x) => x.section)).toEqual(['primary', 'primary', 'SS1', 'SS1']);
    for (const x of saved())
      expect(Object.keys(x).sort()).toEqual([
        'exercise_id',
        'exercise_name',
        'reps',
        'rest_s',
        'section',
        'sets',
        'switch_s',
      ]);
  });

  it('a new template saves a pick added to a new card after the existing cards', async () => {
    templates.value = [];
    render(<TemplateEditor />);
    fireEvent.input(q('.tpl-name-input'), { target: { value: 'Fresh' } });
    fireEvent.click(pill('Warm-up'));
    pick('Dips');
    fireEvent.click(pill('Primary'));
    pick('Plank');
    save();
    await vi.waitFor(() => expect(addTemplate).toHaveBeenCalled());
    expect((addTemplate.mock.calls[0][1] as Record<string, string>[]).map((x) => x.section)).toEqual([
      'warmup',
      'primary',
    ]);
  });

  it('an untouched interleaved template is not dirty: Close does not ask', async () => {
    const ask = vi.spyOn(await import('../../state/confirm'), 'ask').mockResolvedValue(false);
    render(<TemplateEditor templateId="t1" />);
    fireEvent.click(within(document.body).getByLabelText('Close'));
    await Promise.resolve();
    expect(ask).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/templates/t1');
    ask.mockRestore();
  });

  it('edit mode has the quiet card with Discard changes and Delete template; a new template does not', () => {
    render(<TemplateEditor templateId="t1" />);
    const card = q('.tpl-quiet-card');
    expect(card.textContent).toContain('Discard changes');
    expect(card.textContent).toContain('Delete template');
    cleanup();
    templates.value = [];
    render(<TemplateEditor />);
    expect(document.querySelector('.tpl-quiet-card')).toBeNull();
  });

  it('shows the name field with its label and placeholder', () => {
    render(<TemplateEditor templateId="t1" />);
    const input = q<HTMLInputElement>('.tpl-name-input');
    expect(input.placeholder).toBe('Name this template');
    expect(input.value).toBe('Push');
    expect(document.querySelector(`label[for="${input.id}"]`)!.textContent).toBe('Template name');
  });
});

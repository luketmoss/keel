// #576 - a template section's rest: the editor's rest band (Default / Change /
// stepper / Use default), what Save writes, and the read-only detail's line.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, within } from '@testing-library/preact';
import { templates } from '../../state/store';
import type { TemplateRowWithRow } from '../../api/types';

const editTemplate = vi.fn(async (..._args: unknown[]) => undefined);
vi.mock('../../state/actions', () => ({
  addTemplate: vi.fn(),
  editTemplate: (...args: unknown[]) => editTemplate(...args),
  removeTemplate: vi.fn(),
  startWorkout: vi.fn(),
}));
vi.mock('../../auth/auth-context', () => ({ useAuth: () => ({ token: 'test-token' }) }));
vi.mock('../../router/router', () => ({ navigate: vi.fn() }));
vi.mock('../../api/rest-times', async (orig) => ({
  ...(await orig<typeof import('../../api/rest-times')>()),
  getRestSettings: vi.fn(async () => ({ ok: false, kind: 'no_api_url' })),
}));

const { TemplateEditor } = await import('./template-editor');
const { TemplateDetail } = await import('./template-detail');
const { resetRestSettings, restSettings } = await import('../../state/rest-settings');
const { DEFAULT_REST_SETTINGS } = await import('../../api/rest-times');

const LIST: [string, string, string, string?, string?][] = [
  ['e0', 'Hip Circles', 'warmup'],
  ['e1', 'OH Press', 'primary'],
  ['e2', 'Arnold Press', 'SS1', '60', ''],
  ['e3', 'Lateral Raise', 'SS1', '60', ''],
  ['e4', 'Ab Wheel', 'burnout'],
  ['e5', 'Wrist Flexor', 'burnout'],
  ['e6', 'Stretch', 'cooldown'],
];

function rows(list = LIST): TemplateRowWithRow[] {
  return list.map(([exercise_id, exercise_name, section, rest_s = '', switch_s = ''], i) => ({
    template_id: 't1',
    template_name: 'Upper Push B',
    order: i + 1,
    exercise_id,
    exercise_name,
    section,
    sets: '3',
    reps: '8',
    rest_s,
    switch_s,
    sheetRow: i + 2,
  }));
}

beforeEach(() => {
  templates.value = [{ id: 't1', name: 'Upper Push B', exercises: rows() }];
  editTemplate.mockClear();
  resetRestSettings();
});
afterEach(() => cleanup());

const band = (name: string) => document.querySelector(`[role="group"][aria-label="${name} rest"]`) as HTMLElement;
const save = () => fireEvent.click(document.querySelector('.btn-primary')!);
const saved = () => editTemplate.mock.calls[0][2] as Record<string, string>[];

describe('Template editor: per-section rest', () => {
  it('shows rest for primary, supersets and burnout, a switch for supersets and burnout, none for warm-up and cool-down', () => {
    render(<TemplateEditor templateId="t1" />);
    expect([...document.querySelectorAll('.template-rest-band')].map((b) => b.getAttribute('aria-label'))).toEqual([
      'Primary rest',
      'Superset 1 rest',
      'Burnout rest',
    ]);
    expect(within(band('Primary')).getByText('Rest between sets')).toBeTruthy();
    expect(within(band('Primary')).queryByText('Switch between exercises')).toBeNull();
    expect(within(band('Burnout')).getByText('Rest after each round')).toBeTruthy();
    expect(within(band('Burnout')).getByText('Switch between exercises')).toBeTruthy();
  });

  it('a blank cell reads "Default (m:ss)" with the Settings value now, and Change', () => {
    restSettings.value = { ...DEFAULT_REST_SETTINGS, rest_primary_s: 120 };
    render(<TemplateEditor templateId="t1" />);
    expect(within(band('Primary')).getByText('Default (2:00)')).toBeTruthy();
    expect(within(band('Burnout')).getByText('Default (0:45)')).toBeTruthy();
    expect(within(band('Burnout')).getByText('Default (0:10)')).toBeTruthy();
    expect(within(band('Superset 1')).getByText('Default (0:15)')).toBeTruthy();
    expect(within(band('Superset 1')).getByText('1:00')).toBeTruthy();
  });

  it('the rest rows are the last rows inside the section’s card, before Add exercise (#640)', () => {
    render(<TemplateEditor templateId="t1" />);
    const card = band('Superset 1').closest('.tpl-card')!;
    expect(card.textContent).toContain('Lateral Raise');
    const kids = [...card.children];
    const at = kids.indexOf(band('Superset 1'));
    expect(kids[at - 1].textContent).toContain('Lateral Raise');
    expect(kids[at + 1].textContent).toBe('Add exercise');
  });

  it('Change starts at the default; setting a value and saving writes it to every row of the section', async () => {
    render(<TemplateEditor templateId="t1" />);
    fireEvent.click(within(band('Primary')).getByRole('button', { name: 'Change rest between sets' }));
    expect(within(band('Primary')).getByText('1:30')).toBeTruthy();
    fireEvent.click(within(band('Primary')).getByRole('button', { name: 'More rest' }));
    fireEvent.click(within(band('Burnout')).getByRole('button', { name: 'Change switch between exercises' }));
    fireEvent.click(within(band('Burnout')).getByRole('button', { name: 'Less switch time' }));
    save();
    await vi.waitFor(() => expect(editTemplate).toHaveBeenCalled());
    expect(saved().map((x) => [x.section, x.rest_s, x.switch_s])).toEqual([
      ['warmup', '', ''],
      ['primary', '105', ''],
      ['SS1', '60', ''],
      ['SS1', '60', ''],
      ['burnout', '', '5'],
      ['burnout', '', '5'],
      ['cooldown', '', ''],
    ]);
  });

  it('reopening shows the stored value; Use default stores a blank cell again', async () => {
    render(<TemplateEditor templateId="t1" />);
    expect(within(band('Superset 1')).getByText('1:00')).toBeTruthy();
    fireEvent.click(within(band('Superset 1')).getByRole('button', { name: 'Use default' }));
    expect(within(band('Superset 1')).getByText('Default (0:45)')).toBeTruthy();
    save();
    await vi.waitFor(() => expect(editTemplate).toHaveBeenCalled());
    expect(
      saved()
        .filter((x) => x.section === 'SS1')
        .map((x) => x.rest_s),
    ).toEqual(['', '']);
  });

  it('saving without touching rest keeps every value as stored', async () => {
    render(<TemplateEditor templateId="t1" />);
    fireEvent.input(document.querySelector('.form-input')!, { target: { value: 'Upper Push B2' } });
    save();
    await vi.waitFor(() => expect(editTemplate).toHaveBeenCalled());
    expect(saved().map((x) => x.rest_s)).toEqual(['', '', '60', '60', '', '', '']);
  });

  it('a section that loses its last exercise loses its rest rows', () => {
    templates.value = [{ id: 't1', name: 'T', exercises: rows([LIST[1], LIST[2]]) }];
    render(<TemplateEditor templateId="t1" />);
    expect(band('Superset 1')).toBeTruthy();
    fireEvent.click(document.querySelectorAll<HTMLElement>('.tpl-row-btn[data-row-btn]')[1]);
    fireEvent.click(within(document.body).getByRole('button', { name: 'Remove' }));
    expect(band('Superset 1')).toBeNull();
  });

  it('a rest change alone makes the editor dirty', async () => {
    const spy = vi.spyOn(await import('../../state/confirm'), 'ask').mockResolvedValue(false);
    render(<TemplateEditor templateId="t1" />);
    fireEvent.click(within(band('Primary')).getByRole('button', { name: 'Change rest between sets' }));
    fireEvent.click(within(document.body).getByLabelText('Close'));
    await vi.waitFor(() => expect(spy).toHaveBeenCalled());
    spy.mockRestore();
  });
});

describe('Template detail: one rest line per section', () => {
  it('reads the template’s own value, or the default followed by "(default)"', () => {
    render(<TemplateDetail templateId="t1" />);
    expect([...document.querySelectorAll('.template-rest-line')].map((p) => p.textContent)).toEqual([
      'Rest 1:30 (default)',
      'Rest 1:00 · switch 0:15 (default)',
      'Rest 0:45 (default) · switch 0:10 (default)',
    ]);
  });
});

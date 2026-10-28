// #639 - the template detail: #531's top bar and menu, #533's section cards, #638's summary, a pinned Start workout.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/preact';
import { templates, workouts } from '../../state/store';
import type { TemplateRowWithRow } from '../../api/types';

const removeTemplate = vi.fn(async (..._args: unknown[]) => undefined);
const startWorkout = vi.fn(async (..._args: unknown[]) => 'w9');
const navigate = vi.fn();
const ask = vi.fn(async (..._args: unknown[]) => true);
vi.mock('../../state/actions', () => ({
  addTemplate: vi.fn(),
  editTemplate: vi.fn(),
  removeTemplate: (...args: unknown[]) => removeTemplate(...args),
  startWorkout: (...args: unknown[]) => startWorkout(...args),
}));
vi.mock('../../auth/auth-context', () => ({ useAuth: () => ({ token: 'test-token' }) }));
vi.mock('../../router/router', () => ({ navigate: (...args: unknown[]) => navigate(...args) }));
vi.mock('../../state/confirm', () => ({ ask: (...args: unknown[]) => ask(...args) }));
vi.mock('../../api/rest-times', async (orig) => ({
  ...(await orig<typeof import('../../api/rest-times')>()),
  getRestSettings: vi.fn(async () => ({ ok: false, kind: 'no_api_url' })),
}));

const { TemplateDetail, prescription } = await import('./template-detail');
const { resetRestSettings } = await import('../../state/rest-settings');

const LIST: [string, string, string, string, string][] = [
  ['e0', 'Hip Circles', 'warmup', '', ''],
  ['e1', 'OH Press', 'primary', '5', '4–6'],
  ['e2', 'Arnold Press', 'SS1', '3', ''],
  ['e3', 'Lateral Raise', 'SS1', '1', ''],
  ['e4', 'Ab Wheel', 'burnout', '2', '12'],
  ['e5', 'Stretch', 'cooldown', '', ''],
];

function rows(): TemplateRowWithRow[] {
  return LIST.map(([exercise_id, exercise_name, section, sets, reps], i) => ({
    template_id: 't1',
    template_name: 'Upper Push B',
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
  templates.value = [{ id: 't1', name: 'Upper Push B', exercises: rows() }];
  workouts.value = [];
  removeTemplate.mockClear();
  startWorkout.mockClear();
  navigate.mockClear();
  ask.mockClear();
  ask.mockImplementation(async () => true);
  resetRestSettings();
});
afterEach(() => cleanup());

const q = (sel: string) => document.querySelector(sel) as HTMLElement;
const byName = (name: string) => document.querySelector(`[aria-label="${name}"]`) as HTMLElement;

describe('prescription', () => {
  it('reads Sets × Reps, "N sets" without reps, and "1 set"', () => {
    expect(prescription('5', '4–6')).toBe('5 × 4–6');
    expect(prescription('3', '')).toBe('3 sets');
    expect(prescription('1', '')).toBe('1 set');
    expect(prescription('', '')).toBe('');
  });
});

describe('Template detail (#639)', () => {
  it('has Back, Edit template and More actions buttons', () => {
    render(<TemplateDetail templateId="t1" />);
    fireEvent.click(byName('Back'));
    expect(navigate).toHaveBeenLastCalledWith('/templates');
    fireEvent.click(byName('Edit template'));
    expect(navigate).toHaveBeenLastCalledWith('/templates/t1/edit');
    expect(byName('Edit template').getAttribute('data-focus-key')).toBe('template-edit');
    expect(byName('More actions')).toBeTruthy();
    expect(document.body.textContent).not.toContain('Delete Template');
  });

  it('shows the meta line, the name as h1 and the summary', () => {
    render(<TemplateDetail templateId="t1" />);
    expect(q('.detail-date-line').textContent).toBe('Template · not done yet');
    expect(q('h1.detail-title').textContent).toBe('Upper Push B');
    expect(q('.tpl-summary')).toBeTruthy();
  });

  it('draws one card per section in first-appearance order with #533 headings and prescriptions', () => {
    render(<TemplateDetail templateId="t1" />);
    const heads = [...document.querySelectorAll('.strength-section-card h2')].map((h) => h.textContent);
    expect(heads).toEqual(['Warm-up', 'Primary', 'Superset 1', 'Burnout', 'Cool-down']);
    const rx = [...document.querySelectorAll('.template-detail-rx')].map((r) => r.textContent);
    expect(rx).toEqual(['', '5 × 4–6', '3 sets', '1 set', '2 × 12', '']);
  });

  it('puts each rest line last inside its own card, and none in warm-up or cool-down', () => {
    render(<TemplateDetail templateId="t1" />);
    const cards = [...document.querySelectorAll('.strength-section-card')];
    const lines = cards.map((c) => c.querySelector('.template-rest-line')?.textContent ?? null);
    expect(lines).toEqual([
      null,
      'Rest 1:30 (default)',
      'Rest 0:45 (default) · switch 0:15 (default)',
      'Rest 0:45 (default) · switch 0:10 (default)',
      null,
    ]);
    for (const c of cards) {
      const line = c.querySelector('.template-rest-line');
      if (line) expect(c.lastElementChild).toBe(line);
    }
    expect(document.querySelectorAll('.detail-sheet > .template-rest-line').length).toBe(0);
  });

  it('deletes from the menu: confirm, remove, then back to the Library', async () => {
    render(<TemplateDetail templateId="t1" />);
    fireEvent.click(byName('More actions'));
    const items = [...document.querySelectorAll('[role="menuitem"]')];
    expect(items.map((i) => i.textContent)).toEqual(['Delete template']);
    expect(items[0].classList.contains('detail-menu-delete')).toBe(true);
    fireEvent.click(items[0]);
    await waitFor(() => expect(removeTemplate).toHaveBeenCalled());
    expect(ask).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(ask.mock.calls[0])).toContain('Upper Push B');
    expect(removeTemplate.mock.calls[0][0]).toBe('t1');
    await waitFor(() => expect(navigate).toHaveBeenLastCalledWith('/templates'));
  });

  it('does not delete when the confirm is declined', async () => {
    ask.mockImplementation(async () => false);
    render(<TemplateDetail templateId="t1" />);
    fireEvent.click(byName('More actions'));
    fireEvent.click(q('[role="menuitem"]'));
    await waitFor(() => expect(ask).toHaveBeenCalled());
    expect(removeTemplate).not.toHaveBeenCalled();
  });

  it('closes the menu and returns focus to More actions on Escape', () => {
    render(<TemplateDetail templateId="t1" />);
    const more = byName('More actions');
    fireEvent.click(more);
    expect(document.activeElement).toBe(q('[role="menuitem"]'));
    fireEvent.keyDown(q('[role="menu"]'), { key: 'Escape' });
    expect(q('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(more);
  });

  it('starts a workout from the pinned "Start workout" button', async () => {
    render(<TemplateDetail templateId="t1" />);
    const start = q('.template-detail-footer .btn-primary');
    expect(start.textContent).toBe('Start workout');
    fireEvent.click(start);
    await waitFor(() => expect(startWorkout).toHaveBeenCalled());
    expect(startWorkout.mock.calls[0][0]).toMatchObject({ type: 'weight', name: 'Upper Push B', template_id: 't1' });
    await waitFor(() => expect(navigate).toHaveBeenLastCalledWith('/workout/w9'));
  });

  it('shows "Template not found" with a Back to Library button for an unknown id', () => {
    render(<TemplateDetail templateId="nope" />);
    expect(document.body.textContent).toContain('Template not found');
    expect(q('.detail-top-bar')).toBeNull();
    fireEvent.click([...document.querySelectorAll('button')].find((b) => b.textContent === 'Back to Library')!);
    expect(navigate).toHaveBeenLastCalledWith('/templates');
  });
});

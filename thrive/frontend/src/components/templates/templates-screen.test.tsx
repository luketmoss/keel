// #301 — template cards are real buttons: tab stops, named, opened by key or click.
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/preact';
import { templates, workouts, activeWorkoutId } from '../../state/store';
import { currentRoute, navigate } from '../../router/router';
import { TemplatesScreen } from './templates-screen';
import { readGlobalCss } from '../../test-css';

function wk(id: string, templateId: string, date: string, time: string, elapsed: string, status = '') {
  return {
    id,
    template_id: templateId,
    date,
    time,
    elapsed_seconds: elapsed,
    status,
    type: 'weight',
    name: id,
  } as never;
}

function tpl(id: string, name: string, sections: string[]) {
  return {
    id,
    name,
    exercises: sections.map((section, i) => ({
      exercise_id: `e${i}`,
      exercise_name: `Ex ${i}`,
      section,
      sets: '3',
      reps: '8',
      order: i + 1,
      sheetRow: i + 2,
    })),
    sheetRow: 2,
  };
}

beforeEach(async () => {
  navigate('/templates');
  await waitFor(() => expect(currentRoute.value.name).toBe('templates'));
  workouts.value = [];
  activeWorkoutId.value = null;
  templates.value = [tpl('t1', 'Push Day', ['primary', 'SS1']), tpl('t2', 'Solo', ['primary'])] as never;
});
afterEach(() => cleanup());

const cards = () => [...document.querySelectorAll<HTMLElement>('.template-card')];

describe('AC1: a template card is a button', () => {
  it('is a <button type=button> keeping its focus key, with no block child', () => {
    render(<TemplatesScreen />);
    expect(cards()).toHaveLength(2);
    for (const c of cards()) {
      expect(c.tagName).toBe('BUTTON');
      expect(c.getAttribute('type')).toBe('button');
      expect(c.tabIndex).toBe(0);
      expect(c.querySelector('div, button, a, input')).toBeNull();
    }
    expect(cards()[0].getAttribute('data-focus-key')).toBe('template:t1');
    expect(cards()[1].getAttribute('data-focus-key')).toBe('template:t2');
  });

  it('comes after the Library switch and before the + button in tab order', () => {
    render(<TemplatesScreen />);
    const focusables = [...document.querySelectorAll<HTMLElement>('button, a[href]')];
    const fab = document.querySelector<HTMLElement>('.fab')!;
    expect(focusables.indexOf(cards()[0])).toBeLessThan(focusables.indexOf(fab));
    const sw = document.querySelector<HTMLElement>('[data-focus-key^="library-switch"]');
    if (sw) expect(focusables.indexOf(sw)).toBeLessThan(focusables.indexOf(cards()[0]));
  });
});

describe('AC2: activation', () => {
  it('a click opens the template', async () => {
    render(<TemplatesScreen />);
    fireEvent.click(cards()[0]);
    await waitFor(() => expect(currentRoute.value.name).toBe('template-detail'));
    expect((currentRoute.value.params as { id: string }).id).toBe('t1');
  });
});

describe('AC3: accessible name', () => {
  it('starts with the name and carries the pluralised count', () => {
    render(<TemplatesScreen />);
    expect(cards()[0].textContent).toMatch(/^Push Day/);
    expect(cards()[0].getAttribute('aria-label')).toBe('Push Day, 2 exercises, 6 working sets, not done yet');
    expect(cards()[1].getAttribute('aria-label')).toBe('Solo, 1 exercise, 3 working sets, not done yet');
  });

  it('names last took and last done in words, and leaves a blank one out', () => {
    workouts.value = [wk('w1', 't1', '2020-10-22', '08:00', '3720'), wk('w2', 't2', '2020-10-23', '08:00', '')];
    render(<TemplatesScreen />);
    const byKey = (k: string) => document.querySelector(`[data-focus-key="${k}"]`)!;
    expect(byKey('template:t1').getAttribute('aria-label')).toBe(
      'Push Day, 2 exercises, 6 working sets, last took 1 hour 2 minutes, last done Thursday October 22 2020',
    );
    expect(byKey('template:t2').getAttribute('aria-label')).toBe(
      'Solo, 1 exercise, 3 working sets, last done Friday October 23 2020',
    );
  });
});

describe('#638: figures, mix bar, order', () => {
  it('shows the figures with last took as 1:02 h, or a muted dash when blank', () => {
    workouts.value = [wk('w1', 't1', '2020-10-22', '08:00', '3720'), wk('w2', 't2', '2020-10-23', '08:00', '')];
    render(<TemplatesScreen />);
    const t1 = document.querySelector('[data-focus-key="template:t1"]')!;
    const t2 = document.querySelector('[data-focus-key="template:t2"]')!;
    expect([...t1.querySelectorAll('.tpl-figure-value')].map((e) => e.textContent)).toEqual(['2', '6', '1:02']);
    expect(t1.querySelector('.tpl-figure-unit')?.textContent).toBe('h');
    expect(t2.querySelector('.tpl-figure-none')?.textContent).toBe('—');
  });

  it('counts working sets without warm-up and cool-down, with a legend of words', () => {
    templates.value = [
      tpl('t3', 'Mixed', ['warmup', 'warmup', 'primary', 'SS1', 'SS2', 'burnout', 'cooldown']),
    ] as never;
    render(<TemplatesScreen />);
    const c = cards()[0];
    expect([...c.querySelectorAll('.tpl-figure-value')].map((e) => e.textContent)[1]).toBe('12');
    expect(c.querySelector('.tpl-legend')?.textContent).toBe('2 warm-up1 primary2 supersets1 burnout1 cool-down');
    expect(c.querySelectorAll('.tpl-mix-seg')).toHaveLength(6);
    expect(c.querySelector('.tpl-mix')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('orders by last done, newest first, then never done by name; skips planned and in-progress', () => {
    templates.value = [
      tpl('a', 'Alpha', ['primary']),
      tpl('b', 'Bravo', ['primary']),
      tpl('c', 'Charlie', ['primary']),
    ] as never;
    workouts.value = [
      wk('w1', 'b', '2020-10-20', '08:00', '600'),
      wk('w2', 'c', '2020-10-22', '08:00', '600'),
      wk('w3', 'a', '2020-10-25', '08:00', '600', 'planned'),
    ];
    render(<TemplatesScreen />);
    expect(cards().map((c) => c.getAttribute('data-focus-key'))).toEqual(['template:c', 'template:b', 'template:a']);
  });

  it('has the empty line when there are no templates', () => {
    templates.value = [];
    render(<TemplatesScreen />);
    expect(document.querySelector('.library-empty')?.textContent).toBe('No templates yet. Tap + to build one.');
  });
});

describe('AC3/AC5: focus ring CSS', () => {
  const css = readGlobalCss().replace(/\r\n/g, '\n');
  const section = css.slice(css.indexOf('/* ===== Library keyboard access (#301)'));
  const bare = section.replace(/\/\*[\s\S]*?\*\//g, '');

  it('uses --color-text, inset, never --color-primary', () => {
    const rule = bare.match(
      /\.template-card:focus-visible,\n\.compact-card-body\[role="button"\]:focus-visible \{([^}]*)\}/,
    )![1];
    expect(rule).toMatch(/outline:\s*2px solid var\(--color-text\)/);
    expect(rule).toMatch(/outline-offset:\s*-2px/);
    expect(bare).not.toMatch(/--color-primary/);
  });

  it('keeps targets at 44px and resets the button', () => {
    expect(bare).toMatch(/\.template-card \{[^}]*min-height:\s*44px/);
    expect(bare).toMatch(/\.compact-card-body\[role="button"\] \{[^}]*min-height:\s*44px/);
    expect(bare).toMatch(/\.template-card \{[^}]*width:\s*100%/);
    expect(bare).toMatch(/\.template-card \{[^}]*appearance:\s*none/);
  });
});

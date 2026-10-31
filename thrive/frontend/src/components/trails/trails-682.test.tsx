// #682 — trail search and per-trail comparison, a demo-mode prototype: the
// Trails card, Routes like this, the Trail screen and trail search, and none
// of it outside demo mode.

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, screen, fireEvent, within } from '@testing-library/preact';
import { h } from 'preact';

let demo = true;
vi.mock('../../api/demo-data', async (orig) => ({
  ...(await orig<typeof import('../../api/demo-data')>()),
  isDemo: () => demo,
}));
vi.mock('../../auth/auth-context', () => ({ useAuth: () => ({ token: 'tok' }) }));

const navigate = vi.fn();
vi.mock('../../router/router', async (orig) => ({
  ...(await orig<typeof import('../../router/router')>()),
  navigate: (p: string) => navigate(p),
  goBack: vi.fn(),
}));

import { DEMO_WORKOUTS, shiftDemoWorkouts } from '../../api/demo-data';
import { DEMO_ROUTE_PAIRS, DEMO_TRAIL_ACTIVITIES } from '../../api/demo-trails';
import { workouts, activitiesMonth, filterType } from '../../state/store';
import { trailIndex, trailQuery } from '../../state/trails';
import { titleFor } from '../../router/document-title';
import { WorkoutDetail } from '../activities/workout-detail';
import { ActivitiesScreen } from '../activities/activities-screen';
import { TrailScreen } from './trail-screen';
import { NO_EARLIER_PASS } from '../../trails/format';
import { splitTrailName } from '../../trails/groups';
import { readFileSync, readdirSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));

beforeEach(() => {
  demo = true;
  workouts.value = shiftDemoWorkouts(new Date());
  trailQuery.value = '';
  navigate.mockClear();
});

afterEach(cleanup);

/** The Trails card's block for one trail: its link and its pass rows. */
function block(name: string): HTMLElement {
  const card = document.querySelector<HTMLElement>('.trail-card')!;
  const link = within(card)
    .getAllByRole('button')
    .find((b) => b.querySelector('.trail-link-name')?.textContent === name)!;
  return link.closest<HTMLElement>('.trail-block')!;
}

describe('the demo fixture', () => {
  const byId = new Map(DEMO_WORKOUTS.map((w) => [w.id, w]));
  const names = DEMO_TRAIL_ACTIVITIES.flatMap((a) => a.passes.map((p) => p.trail));

  it('hangs every pass off a completed demo bike ride or hike', () => {
    for (const a of DEMO_TRAIL_ACTIVITIES) {
      const w = byId.get(a.id);
      expect(w, a.id).toBeDefined();
      expect(w!.status).toBe('');
      expect(['bike', 'hike']).toContain(w!.type);
    }
    for (const [a, b] of DEMO_ROUTE_PAIRS) expect(byId.has(a) && byId.has(b)).toBe(true);
  });

  it('contains every case the screens have to show', () => {
    for (const n of [
      'Juniper Ridge',
      'Juniper Ridge Trail',
      'Lower Juniper',
      'Heron Loop',
      'Heron Loop Trail',
      'Aspen Draw;Kestrel Connector',
      'Fox Hollow / Kestrel Connector',
      'Ridge Trail',
    ]) {
      expect(names, n).toContain(n);
    }
    const connector = DEMO_TRAIL_ACTIVITIES.flatMap((a) => a.passes).find((p) => p.trail.includes(';'))!;
    expect(connector.metres).toBeLessThan(200);
    expect(DEMO_TRAIL_ACTIVITIES.find((a) => a.id === 'w_demo011')!.unmatchedM).toBeGreaterThanOrEqual(161);
    expect(DEMO_TRAIL_ACTIVITIES.find((a) => a.id === 'w_demo008')!.unmatchedM).toBe(0);
  });

  it('has Juniper Ridge on at least 5 bike activities over at least 3 months', () => {
    const g = trailIndex.value!.groups.get('juniper ridge')!;
    const ws = g.visits.map((v) => workouts.value.find((w) => w.id === v.activityId)!);
    expect(ws.every((w) => w.type === 'bike')).toBe(true);
    expect(ws.length).toBeGreaterThanOrEqual(5);
    expect(new Set(ws.map((w) => w.date.slice(0, 7))).size).toBeGreaterThanOrEqual(3);
    expect(ws.some((w) => w.track_ref === 'demo-track-ride')).toBe(true);
  });

  it('holds no coordinate or date, and splits only on the two separators', () => {
    const src = readFileSync(resolve(here, '../../api/demo-trails.ts'), 'utf-8');
    expect(src).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(src).not.toMatch(/-?\d{1,3}\.\d{4,}/);
    for (const n of names) expect(splitTrailName(n).length).toBeLessThanOrEqual(2);
  });
});

describe('AC2/AC3/AC7: the Trails card in demo mode', () => {
  it('lists a lapped trail once, with both passes under it', () => {
    render(h(WorkoutDetail, { workoutId: 'w_demo012' }));
    const juniper = block('Juniper Ridge');
    const lines = [...juniper.querySelectorAll('.trail-pass-line')].map((e) => e.textContent);
    expect(lines).toEqual(['5:12 in · 0 → 100% · 15:51 · ↑ 440 ft', '40:05 in · 0 → 100% · 15:44 · ↑ 440 ft']);
    expect(screen.getAllByText('Juniper Ridge')).toHaveLength(1);
  });

  it('compares the newest pass with the last lap before it, and the reverse pass with nothing', () => {
    render(h(WorkoutDetail, { workoutId: 'w_demo011' }));
    const compare = block('Juniper Ridge').querySelector('.trail-pass-compare')!.textContent!;
    expect(compare).toMatch(/^1:12 faster · ↑ 20 ft less than [A-Z][a-z]{2} \d{1,2}(, \d{4})?$/);
    cleanup();
    render(h(WorkoutDetail, { workoutId: 'w_demo022' }));
    const passes = [...block('Juniper Ridge').querySelectorAll('.trail-pass-compare')].map((e) => e.textContent);
    expect(passes[0]).not.toBe(NO_EARLIER_PASS);
    expect(passes[1]).toBe(NO_EARLIER_PASS);
    expect(block('Juniper Ridge').querySelectorAll('.trail-pass-line')[1].textContent).toContain('100 → 0%');
  });

  it('gives the partial pass no comparison', () => {
    render(h(WorkoutDetail, { workoutId: 'w_demo028' }));
    const juniper = block('Juniper Ridge');
    expect(juniper.querySelector('.trail-pass-line')!.textContent).toContain('41 → 100%');
    expect(juniper.querySelector('.trail-pass-compare')!.textContent).toBe(NO_EARLIER_PASS);
  });

  it('counts a multi-value name for both trails, and names the trail link with its other times', () => {
    render(h(WorkoutDetail, { workoutId: 'w_demo011' }));
    expect(screen.getByText('4 trails')).toBeTruthy();
    const link = screen.getByRole('button', { name: 'Kestrel Connector, 2 other times. Open trail' });
    expect(link.getAttribute('data-focus-key')).toBe('trail:kestrel connector');
    expect(screen.getByRole('button', { name: 'Juniper Ridge, 4 other times. Open trail' })).toBeTruthy();
    fireEvent.click(link);
    expect(navigate).toHaveBeenCalledWith('/trail/kestrel%20connector');
  });

  it('shows the unmatched distance from 0.1 mi and the OpenStreetMap credit', () => {
    render(h(WorkoutDetail, { workoutId: 'w_demo011' }));
    expect(screen.getByText('1.2 mi not on a named trail')).toBeTruthy();
    const credit = screen.getByRole('link', { name: /OpenStreetMap contributors/ });
    expect(credit.getAttribute('href')).toBe('https://www.openstreetmap.org/copyright');
    expect(credit.getAttribute('target')).toBe('_blank');
    expect(credit.textContent).toContain('(opens in a new tab)');
  });

  it('shows no unmatched line on the hike, whose every metre is on its trail', () => {
    render(h(WorkoutDetail, { workoutId: 'w_demo008' }));
    expect(screen.getByRole('button', { name: 'Ridge Trail, 2 other times. Open trail' })).toBeTruthy();
    expect(screen.queryByText(/not on a named trail/)).toBeNull();
  });

  it('shows no Trails card on an activity with no passes', () => {
    render(h(WorkoutDetail, { workoutId: 'w_demo003' }));
    expect(document.querySelector('.trail-card')).toBeNull();
  });
});

describe('AC6: Routes like this', () => {
  it('shows up to 3 paired activity cards, newest first, each opening its activity', () => {
    render(h(WorkoutDetail, { workoutId: 'w_demo011' }));
    const section = screen.getByRole('heading', { name: 'Routes like this' }).closest('section')!;
    const cards = section.querySelectorAll<HTMLButtonElement>('.activity-card');
    expect([...cards].map((c) => c.getAttribute('data-focus-key'))).toEqual(['workout:w_demo012', 'workout:w_demo034']);
    fireEvent.click(cards[0]);
    expect(navigate).toHaveBeenCalledWith('/history/w_demo012');
  });

  it('shows no section on an activity with no pairs', () => {
    render(h(WorkoutDetail, { workoutId: 'w_demo028' }));
    expect(screen.queryByText('Routes like this')).toBeNull();
  });
});

describe('AC1/AC4/AC8: the Trail screen', () => {
  it('answers when it was last done and how it compared', () => {
    render(h(TrailScreen, { trailKey: 'juniper ridge' }));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Juniper Ridge');
    expect(screen.getByText('Also mapped as Juniper Ridge Trail')).toBeTruthy();
    const last = screen.getByRole('heading', { name: 'Last time' }).closest('section')!;
    expect(last.querySelector('.trail-card-aside')!.textContent).toMatch(/^[A-Z][a-z]{2}, [A-Z][a-z]{2} \d{1,2}/);
    expect(last.querySelector('.trail-pass-compare')!.textContent).toMatch(/^1:12 faster · ↑ 20 ft less than /);
    expect(screen.getByText('5 times')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /Open activity$/ })).toHaveLength(6);
  });

  it('lists earlier hikes on Ridge Trail, and no copy says ride', () => {
    render(h(TrailScreen, { trailKey: 'ridge' }));
    expect(screen.getByText('3 times')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/\brid(e|den|es)\b/i);
  });

  it('shows "Trail not found" with a way back for an unknown key', () => {
    render(h(TrailScreen, { trailKey: 'nowhere' }));
    expect(screen.getByText('Trail not found')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back to Activities' }));
    expect(navigate).toHaveBeenCalledWith('/activities');
    expect(titleFor({ name: 'trail', params: { key: 'nowhere' } }, lookups())).toBe('Trail not found — Thrive');
    expect(titleFor({ name: 'trail', params: { key: 'heron loop' } }, lookups())).toBe('Heron Loop — Thrive');
  });
});

function lookups() {
  return {
    workout: () => undefined,
    template: () => undefined,
    trail: (key: string) => trailIndex.value?.groups.get(key),
  };
}

describe('AC5: trail search on Activities', () => {
  const field = () => screen.getByRole('searchbox', { name: 'Search trails' }) as HTMLInputElement;

  it('finds every variant by substring across every month, and opens the trail', () => {
    render(h(ActivitiesScreen, {}));
    fireEvent.input(field(), { target: { value: 'juniper' } });
    const rows = [...document.querySelectorAll<HTMLButtonElement>('.trail-result')];
    expect(rows.map((r) => r.querySelector('.trail-link-name')!.textContent)).toEqual([
      'Juniper Ridge',
      'Lower Juniper',
    ]);
    expect(rows[0].querySelector('.trail-link-meta')!.textContent).toMatch(/^5 times · last /);
    expect(screen.getByText('2 found')).toBeTruthy();
    // While searching, the month's chips and list are gone.
    expect(document.querySelector('.activities-chips')).toBeNull();
    fireEvent.click(rows[0]);
    expect(navigate).toHaveBeenCalledWith('/trail/juniper%20ridge');
  });

  it('says so when nothing matches', () => {
    render(h(ActivitiesScreen, {}));
    fireEvent.input(field(), { target: { value: 'juniper x' } });
    expect(screen.getByText('No trails match “juniper x”')).toBeTruthy();
  });

  it('clearing restores the screen as it was, month and filters included', () => {
    const month = activitiesMonth.value;
    filterType.value = 'bike';
    render(h(ActivitiesScreen, {}));
    const before = document.querySelector('.activities-screen')!.innerHTML;
    fireEvent.input(field(), { target: { value: 'heron' } });
    expect(document.querySelector('.trail-results')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(document.activeElement).toBe(field());
    expect(document.querySelector('.activities-screen')!.innerHTML).toBe(before);
    expect(activitiesMonth.value).toBe(month);
    expect(filterType.value).toBe('bike');
    fireEvent.input(field(), { target: { value: 'heron' } });
    fireEvent.keyDown(field(), { key: 'Escape' });
    expect(trailQuery.value).toBe('');
    expect(document.querySelector('.trail-results')).toBeNull();
    filterType.value = null;
  });
});

describe('AC9: production untouched — demo mode off', () => {
  beforeEach(() => {
    demo = false;
    // trailIndex reads isDemo() once per recompute; a new workouts list makes it read again.
    workouts.value = shiftDemoWorkouts(new Date());
  });

  it('has no trail data at all', () => {
    expect(trailIndex.value).toBeNull();
  });

  it('shows no Trails card and no Routes like this on activity detail', () => {
    render(h(WorkoutDetail, { workoutId: 'w_demo011' }));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Canyon Road Ride');
    expect(document.querySelector('.trail-card')).toBeNull();
    expect(screen.queryByText('Routes like this')).toBeNull();
  });

  it('shows no trail search on Activities', () => {
    render(h(ActivitiesScreen, {}));
    expect(screen.queryByRole('searchbox', { name: 'Search trails' })).toBeNull();
  });

  it('shows the not-found state for any trail key', () => {
    render(h(TrailScreen, { trailKey: 'juniper ridge' }));
    expect(screen.getByText('Trail not found')).toBeTruthy();
  });
});

describe('AC8: no trail copy says ride', () => {
  it('in the trail rules or screens', () => {
    const dirs = [resolve(here), resolve(here, '../../trails')];
    for (const dir of dirs) {
      for (const f of readdirSync(dir).filter((n) => !n.includes('.test.'))) {
        const strings = readFileSync(join(dir, f), 'utf-8')
          .split('\n')
          .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
          .join('\n')
          .match(/'[^']*'|`[^`]*`|>[^<>{}]+</g);
        for (const s of strings ?? []) expect(s, `${f}: ${s}`).not.toMatch(/\brid(e|den|es)\b/i);
      }
    }
  });
});

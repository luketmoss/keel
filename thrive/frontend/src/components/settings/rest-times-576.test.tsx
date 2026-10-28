// #576 - Settings' "Rest times" group: the five defaults on duration steppers,
// read from and saved to the API.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, act, within } from '@testing-library/preact';

const api = vi.hoisted(() => ({ updateSetting: vi.fn(), getRestSettings: vi.fn() }));
vi.mock('../../api/drinks', async (orig) => ({
  ...(await orig<typeof import('../../api/drinks')>()),
  updateSetting: api.updateSetting,
}));
vi.mock('../../api/rest-times', async (orig) => ({
  ...(await orig<typeof import('../../api/rest-times')>()),
  getRestSettings: api.getRestSettings,
}));

import { AuthContext, type AuthState } from '../../auth/auth-context';
import { RestTimesGroup, REST_SAVE_DELAY_MS, REST_SAVED_MS } from './rest-times-group';
import { resetRestSettings, restSettings } from '../../state/rest-settings';
import { DEFAULT_REST_SETTINGS } from '../../api/rest-times';

const AUTH: AuthState = { token: 'tok', user: null, isAuthenticated: true, login: () => {}, logout: () => {} };

const flush = () =>
  act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });

const LABELS = [
  'Primary, between sets',
  'Supersets, between rounds',
  'Supersets, switching exercises',
  'Burnout, between rounds',
  'Burnout, switching exercises',
];

function mount() {
  const view = render(
    <AuthContext.Provider value={AUTH}>
      <RestTimesGroup token="tok" />
    </AuthContext.Provider>,
  );
  const row = (label: string) => view.getByRole('group', { name: label });
  const valueOf = (label: string) => row(label).querySelector('.duration-stepper-value')!.textContent;
  const btn = (label: string, name: string) => within(row(label)).getByRole('button', { name });
  const status = () => view.container.querySelector('[role="status"]')!;
  return { ...view, row, valueOf, btn, status };
}

beforeEach(() => {
  vi.useFakeTimers();
  api.updateSetting.mockReset();
  api.getRestSettings.mockReset();
  api.getRestSettings.mockResolvedValue({ ok: true, data: { ...DEFAULT_REST_SETTINGS } });
  resetRestSettings();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Settings defaults', () => {
  it('with no rest keys stored, reads Primary 1:30; Supersets 0:45 and 0:15; Burnout 0:45 and 0:10', async () => {
    const v = mount();
    await flush();
    expect(v.getByRole('heading', { name: 'Rest times' })).toBeTruthy();
    expect(LABELS.map(v.valueOf)).toEqual(['1:30', '0:45', '0:15', '0:45', '0:10']);
    expect(
      v.getByText('Templates use these unless a section sets its own. Lift Mode lets you change them for the day.'),
    ).toBeTruthy();
    expect(api.getRestSettings).toHaveBeenCalledWith('tok');
  });

  it('shows the defaults with every stepper off until the settings arrive', async () => {
    let answer!: (v: unknown) => void;
    api.getRestSettings.mockReturnValue(new Promise((r) => (answer = r)));
    const v = mount();
    await flush();
    expect(LABELS.map(v.valueOf)).toEqual(['1:30', '0:45', '0:15', '0:45', '0:10']);
    for (const b of v.container.querySelectorAll('.duration-stepper-btn'))
      expect(b.getAttribute('aria-disabled')).toBe('true');
    answer({ ok: true, data: { ...DEFAULT_REST_SETTINGS, rest_primary_s: 120 } });
    await flush();
    expect(v.valueOf('Primary, between sets')).toBe('2:00');
    expect(v.btn('Primary, between sets', 'More rest').getAttribute('aria-disabled')).toBeNull();
  });

  it('a failed load keeps the defaults, keeps the steppers off, and says so', async () => {
    api.getRestSettings.mockResolvedValue({ ok: false, kind: 'network' });
    const v = mount();
    await flush();
    expect(v.getByText("Couldn't load rest times.")).toBeTruthy();
    expect(LABELS.map(v.valueOf)).toEqual(['1:30', '0:45', '0:15', '0:45', '0:10']);
    fireEvent.click(v.btn('Primary, between sets', 'More rest'));
    expect(v.valueOf('Primary, between sets')).toBe('1:30');
  });
});

describe('Settings edits', () => {
  it('saves 800 ms after the last press, one call per key, then says Saved for 2 s', async () => {
    api.updateSetting.mockResolvedValue({ ok: true, data: { key: 'rest_primary_s', value: '120', updated: 'u' } });
    const v = mount();
    await flush();
    fireEvent.click(v.btn('Primary, between sets', 'More rest'));
    fireEvent.click(v.btn('Primary, between sets', 'More rest'));
    expect(v.valueOf('Primary, between sets')).toBe('2:00');
    await act(async () => {
      vi.advanceTimersByTime(REST_SAVE_DELAY_MS - 1);
    });
    expect(api.updateSetting).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    await flush();
    expect(api.updateSetting).toHaveBeenCalledTimes(1);
    expect(api.updateSetting).toHaveBeenCalledWith('rest_primary_s', 120, 'tok');
    expect(restSettings.value.rest_primary_s).toBe(120);
    expect(v.status().textContent).toBe('Saved');
    await act(async () => {
      vi.advanceTimersByTime(REST_SAVED_MS);
    });
    expect(v.status().textContent).toBe('');
    expect(v.valueOf('Primary, between sets')).toBe('2:00');
  });

  it('a switch steps by 5 s and stops at 0:00; a rest by 15 s and stops at 0:15', async () => {
    api.updateSetting.mockResolvedValue({ ok: true, data: { key: 'x', value: '0', updated: 'u' } });
    const v = mount();
    await flush();
    fireEvent.click(v.btn('Burnout, switching exercises', 'Less switch time'));
    fireEvent.click(v.btn('Burnout, switching exercises', 'Less switch time'));
    expect(v.valueOf('Burnout, switching exercises')).toBe('0:00');
    expect(v.btn('Burnout, switching exercises', 'Less switch time').getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(v.btn('Burnout, switching exercises', 'Less switch time'));
    expect(v.valueOf('Burnout, switching exercises')).toBe('0:00');
    for (let i = 0; i < 3; i++) fireEvent.click(v.btn('Supersets, between rounds', 'Less rest'));
    expect(v.valueOf('Supersets, between rounds')).toBe('0:15');
  });

  it('a failed save puts the row back to the stored value and says so', async () => {
    api.updateSetting.mockResolvedValue({ ok: false, kind: 'failed', message: 'nope' });
    const v = mount();
    await flush();
    fireEvent.click(v.btn('Supersets, switching exercises', 'More switch time'));
    expect(v.valueOf('Supersets, switching exercises')).toBe('0:20');
    await act(async () => {
      vi.advanceTimersByTime(REST_SAVE_DELAY_MS);
    });
    await flush();
    expect(v.valueOf('Supersets, switching exercises')).toBe('0:15');
    expect(v.status().textContent).toBe("Couldn't save rest times. Try again.");
    expect(v.status().className).toBe('drink-error');
  });

  it('holding a button repeats every 150 ms after 400 ms', async () => {
    api.updateSetting.mockResolvedValue({ ok: true, data: { key: 'x', value: '1', updated: 'u' } });
    const v = mount();
    await flush();
    const more = v.btn('Primary, between sets', 'More rest');
    fireEvent.pointerDown(more, { button: 0 });
    expect(v.valueOf('Primary, between sets')).toBe('1:45');
    await act(async () => {
      vi.advanceTimersByTime(400 + 150 * 2);
    });
    expect(v.valueOf('Primary, between sets')).toBe('2:15');
    fireEvent.pointerUp(more);
    fireEvent.click(more); // the click that ends a press does not step again
    await act(async () => {
      vi.advanceTimersByTime(450);
    });
    expect(v.valueOf('Primary, between sets')).toBe('2:15');
  });
});

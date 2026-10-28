// #520 - the Daily water goal field in Settings: whole ounces in, ml out.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/preact';

const api = vi.hoisted(() => ({ updateSetting: vi.fn(), getDrinkTotals: vi.fn() }));
vi.mock('../../api/drinks', async (orig) => ({ ...(await orig<typeof import('../../api/drinks')>()), ...api }));

import { AuthContext, type AuthState } from '../../auth/auth-context';
import { SettingsScreen } from './settings-screen';
import { GOAL_OZ_MAX, GOAL_OZ_MIN, resetDrinks, waterGoalMl } from '../../state/drinks';
import { REST_SAVE_DELAY_MS, REST_SAVED_MS } from './rest-times-group';

const AUTH: AuthState = { token: 'tok', user: null, isAuthenticated: true, login: () => {}, logout: () => {} };

const flush = () =>
  act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

async function mount() {
  const view = render(
    <AuthContext.Provider value={AUTH}>
      <SettingsScreen />
    </AuthContext.Provider>,
  );
  await flush();
  const input = view.getByLabelText('Daily water goal') as HTMLInputElement;
  const lower = () => view.getByRole('button', { name: 'Lower goal' });
  const raise = () => view.getByRole('button', { name: 'Raise goal' });
  const note = () => view.container.querySelector('.settings-goal-note')!.textContent;
  return { ...view, input, lower, raise, note };
}

beforeEach(() => {
  vi.useFakeTimers();
  api.updateSetting.mockReset();
  api.updateSetting.mockResolvedValue({ ok: true, data: { key: 'water_goal_ml', value: '2366', updated: 'u' } });
  api.getDrinkTotals.mockReset();
  api.getDrinkTotals.mockResolvedValue({
    ok: true,
    data: { date: '2026-10-20', water_ml: 0, alcohol_drinks: 0, water_goal_ml: 2366 },
  });
  resetDrinks();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const wait = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

describe('Daily water goal', () => {
  it('shows the stored goal in whole ounces, read from the API, with no Save button', async () => {
    const { input, queryByRole } = await mount();
    expect(api.getDrinkTotals).toHaveBeenCalledWith('tok');
    expect(input.value).toBe('80');
    expect(queryByRole('button', { name: 'Save' })).toBeNull();
  });

  it('steps by 4 oz and saves 800 ms after the last press, as ml, and the Water card follows', async () => {
    api.updateSetting.mockResolvedValue({ ok: true, data: { key: 'water_goal_ml', value: '2602', updated: 'u' } });
    const { input, raise, note } = await mount();
    fireEvent.click(raise());
    fireEvent.click(raise());
    expect(input.value).toBe('88');
    await wait(REST_SAVE_DELAY_MS - 1);
    expect(api.updateSetting).not.toHaveBeenCalled();
    await wait(1);
    expect(api.updateSetting).toHaveBeenCalledTimes(1);
    expect(api.updateSetting).toHaveBeenCalledWith('water_goal_ml', 2602, 'tok');
    expect(waterGoalMl.value).toBe(2602);
    expect(note()).toBe('Saved');
    await wait(REST_SAVED_MS);
    expect(note()).toBe('');
  });

  it('a press on a non-multiple of 4 goes to the next multiple in that direction', async () => {
    const { input, raise, lower } = await mount();
    fireEvent.input(input, { target: { value: '81' } });
    fireEvent.click(raise());
    expect(input.value).toBe('84');
    fireEvent.input(input, { target: { value: '81' } });
    fireEvent.click(lower());
    expect(input.value).toBe('80');
  });

  it('saves a typed value after the same delay', async () => {
    api.updateSetting.mockResolvedValue({ ok: true, data: { key: 'water_goal_ml', value: '2957', updated: 'u' } });
    const { input } = await mount();
    fireEvent.input(input, { target: { value: '100' } });
    await wait(REST_SAVE_DELAY_MS);
    expect(api.updateSetting).toHaveBeenCalledWith('water_goal_ml', 2957, 'tok');
  });

  it('disables each button at its end, keeps it focusable, and does nothing', async () => {
    api.updateSetting.mockResolvedValue({ ok: true, data: { key: 'water_goal_ml', value: '266', updated: 'u' } });
    const { input, lower, raise } = await mount();
    fireEvent.input(input, { target: { value: String(GOAL_OZ_MIN) } });
    expect(lower().getAttribute('aria-disabled')).toBe('true');
    expect(lower().hasAttribute('disabled')).toBe(false);
    fireEvent.click(lower());
    expect(input.value).toBe(String(GOAL_OZ_MIN));
    fireEvent.input(input, { target: { value: String(GOAL_OZ_MAX) } });
    expect(raise().getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(raise());
    expect(input.value).toBe(String(GOAL_OZ_MAX));
  });

  it('refuses a value the API would, without calling it, and keeps the text', async () => {
    const { input, note } = await mount();
    fireEvent.input(input, { target: { value: '5' } });
    await wait(REST_SAVE_DELAY_MS * 2);
    expect(api.updateSetting).not.toHaveBeenCalled();
    expect(note()).toBe('Enter a whole number from 9 to 338.');
    expect(input.value).toBe('5');
    fireEvent.input(input, { target: { value: '' } });
    expect(note()).toBe('Enter a whole number from 9 to 338.');
  });

  it('says so when the save fails and puts the stored goal back', async () => {
    api.updateSetting.mockResolvedValue({ ok: false, kind: 'network' });
    const { input, note } = await mount();
    fireEvent.input(input, { target: { value: '100' } });
    await wait(REST_SAVE_DELAY_MS);
    expect(note()).toBe("Couldn't save the goal. Try again.");
    expect(waterGoalMl.value).toBe(2366);
    expect(input.value).toBe('80');
  });

  it('leaving with a valid change waiting saves it; an invalid one is dropped', async () => {
    api.updateSetting.mockResolvedValue({ ok: true, data: { key: 'water_goal_ml', value: '2957', updated: 'u' } });
    const a = await mount();
    fireEvent.input(a.input, { target: { value: '100' } });
    a.unmount();
    await flush();
    expect(api.updateSetting).toHaveBeenCalledWith('water_goal_ml', 2957, 'tok');

    api.updateSetting.mockClear();
    const b = await mount();
    fireEvent.input(b.input, { target: { value: '5' } });
    b.unmount();
    await flush();
    expect(api.updateSetting).not.toHaveBeenCalled();
  });
});

// #520 - the Daily water goal field in Settings: whole ounces in, ml out.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/preact';

const api = vi.hoisted(() => ({ updateSetting: vi.fn(), getDrinkTotals: vi.fn() }));
vi.mock('../../api/drinks', async (orig) => ({ ...(await orig<typeof import('../../api/drinks')>()), ...api }));

import { AuthContext, type AuthState } from '../../auth/auth-context';
import { SettingsScreen } from './settings-screen';
import { resetDrinks, waterGoalMl } from '../../state/drinks';

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
  const save = () => [...view.container.querySelectorAll('button')].find((b) => b.textContent === 'Save')!;
  return { ...view, input, save };
}

beforeEach(() => {
  api.updateSetting.mockReset();
  api.getDrinkTotals.mockReset();
  api.getDrinkTotals.mockResolvedValue({
    ok: true,
    data: { date: '2026-10-20', water_ml: 0, alcohol_drinks: 0, water_goal_ml: 2366 },
  });
  resetDrinks();
});
afterEach(cleanup);

describe('Daily water goal', () => {
  it('shows the stored goal in whole ounces, read from the API', async () => {
    const { input } = await mount();
    expect(api.getDrinkTotals).toHaveBeenCalledWith('tok');
    expect(input.value).toBe('80');
  });

  it('stores the typed ounces as ml and the Water card follows', async () => {
    api.updateSetting.mockResolvedValue({ ok: true, data: { key: 'water_goal_ml', value: '2957', updated: 'u' } });
    const { input, save, container } = await mount();
    expect(save().disabled).toBe(true);
    fireEvent.input(input, { target: { value: '100' } });
    fireEvent.click(save());
    await flush();
    expect(api.updateSetting).toHaveBeenCalledWith('water_goal_ml', 2957, 'tok');
    expect(waterGoalMl.value).toBe(2957);
    expect(container.querySelector('.settings-goal-note')!.textContent).toBe('Saved.');
  });

  it('refuses a value the API would, without calling it', async () => {
    const { input, save, container } = await mount();
    fireEvent.input(input, { target: { value: '5' } });
    fireEvent.click(save());
    await flush();
    expect(api.updateSetting).not.toHaveBeenCalled();
    expect(container.querySelector('.settings-goal-note')!.textContent).toBe('Enter a whole number from 9 to 338.');
  });

  it('says so when the save fails and keeps the old goal', async () => {
    api.updateSetting.mockResolvedValue({ ok: false, kind: 'network' });
    const { input, save, container } = await mount();
    fireEvent.input(input, { target: { value: '100' } });
    fireEvent.click(save());
    await flush();
    expect(container.querySelector('.settings-goal-note')!.textContent).toBe("Couldn't save the goal. Try again.");
    expect(waterGoalMl.value).toBe(2366);
  });
});

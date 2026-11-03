// #236 AC4 — loadHealth: its tabs, one signal each, each standing alone. FtpHistory is the fourth (#772).

import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchDailyHealth = vi.fn();
const fetchBodyMeasurements = vi.fn();
const fetchDailySummary = vi.fn();
const fetchFtpHistory = vi.fn();
vi.mock('../api/health-api', () => ({
  fetchDailyHealth: (t: string) => fetchDailyHealth(t),
  fetchBodyMeasurements: (t: string) => fetchBodyMeasurements(t),
  fetchDailySummary: (t: string) => fetchDailySummary(t),
  fetchFtpHistory: (t: string) => fetchFtpHistory(t),
}));

import { loadHealth } from './actions';
import { dailyHealth, bodyMeasurements, dailySummary, ftpHistory } from './store';
import { ReauthFailedError } from '@keel/auth';

const h = (date: string) => ({ date, sheetRow: 2 }) as never;

beforeEach(() => {
  for (const f of [fetchDailyHealth, fetchBodyMeasurements, fetchDailySummary, fetchFtpHistory]) f.mockReset();
  fetchFtpHistory.mockResolvedValue([]);
  dailyHealth.value = { state: 'idle' };
  bodyMeasurements.value = { state: 'idle' };
  dailySummary.value = { state: 'idle' };
  ftpHistory.value = { state: 'idle' };
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('loadHealth', () => {
  it('reads the four tabs once each, with the token, into their signals', async () => {
    fetchDailyHealth.mockResolvedValue([h('2026-09-20')]);
    fetchBodyMeasurements.mockResolvedValue([]);
    fetchDailySummary.mockResolvedValue([h('2026-09-20'), h('2026-09-21')]);
    await loadHealth('tok');
    for (const f of [fetchDailyHealth, fetchBodyMeasurements, fetchDailySummary, fetchFtpHistory]) {
      expect(f).toHaveBeenCalledTimes(1);
      expect(f).toHaveBeenCalledWith('tok');
    }
    expect(dailyHealth.value).toEqual({ state: 'loaded', rows: [h('2026-09-20')] });
    // Loaded and empty (e.g. a missing tab), not an error.
    expect(bodyMeasurements.value).toEqual({ state: 'loaded', rows: [] });
    expect(dailySummary.value.state).toBe('loaded');
    expect(ftpHistory.value).toEqual({ state: 'loaded', rows: [] });
  });

  it('marks FtpHistory as error alone when only it fails (#772)', async () => {
    fetchDailyHealth.mockResolvedValue([]);
    fetchBodyMeasurements.mockResolvedValue([]);
    fetchDailySummary.mockResolvedValue([]);
    fetchFtpHistory.mockRejectedValue(new Error('Sheets API 500'));
    await loadHealth('tok');
    expect(ftpHistory.value).toEqual({ state: 'error' });
    expect(dailyHealth.value.state).toBe('loaded');
  });

  it('reads in parallel, showing loading on each until it settles', async () => {
    let resolveHealth!: (v: unknown) => void;
    fetchDailyHealth.mockReturnValue(
      new Promise((r) => {
        resolveHealth = r;
      }),
    );
    fetchBodyMeasurements.mockResolvedValue([]);
    fetchDailySummary.mockResolvedValue([]);
    const done = loadHealth('tok');
    expect(dailyHealth.value.state).toBe('loading');
    expect(fetchBodyMeasurements).toHaveBeenCalled();
    expect(fetchDailySummary).toHaveBeenCalled();
    resolveHealth([]);
    await done;
    expect(dailyHealth.value).toEqual({ state: 'loaded', rows: [] });
  });

  it('marks only the failing tab as error; the others still load', async () => {
    fetchDailyHealth.mockResolvedValue([h('2026-09-20')]);
    fetchBodyMeasurements.mockRejectedValue(new Error('Sheets API 500'));
    fetchDailySummary.mockResolvedValue([]);
    await loadHealth('tok');
    expect(bodyMeasurements.value).toEqual({ state: 'error' });
    expect(dailyHealth.value.state).toBe('loaded');
    expect(dailySummary.value.state).toBe('loaded');
  });

  it('keeps loaded rows visible while it re-reads', async () => {
    dailyHealth.value = { state: 'loaded', rows: [h('2026-09-19')] };
    let resolveHealth!: (v: unknown) => void;
    fetchDailyHealth.mockReturnValue(
      new Promise((r) => {
        resolveHealth = r;
      }),
    );
    fetchBodyMeasurements.mockResolvedValue([]);
    fetchDailySummary.mockResolvedValue([]);
    const done = loadHealth('tok');
    expect(dailyHealth.value).toEqual({ state: 'loaded', rows: [h('2026-09-19')] });
    resolveHealth([h('2026-09-20')]);
    await done;
    expect(dailyHealth.value).toEqual({ state: 'loaded', rows: [h('2026-09-20')] });
  });

  it('leaves a failed re-auth to the auth provider rather than showing an error', async () => {
    fetchDailyHealth.mockRejectedValue(new ReauthFailedError());
    fetchBodyMeasurements.mockResolvedValue([]);
    fetchDailySummary.mockResolvedValue([]);
    await loadHealth('tok');
    expect(dailyHealth.value.state).not.toBe('error');
  });
});

// #239 AC5 — Try again calls loadHealth directly, so loadHealth itself never
// starts a second load while one is in flight.
describe('loadHealth in flight', () => {
  it('joins a load already running rather than starting another, and runs again once it settles', async () => {
    let resolveHealth!: (v: unknown) => void;
    fetchDailyHealth.mockReturnValue(
      new Promise((r) => {
        resolveHealth = r;
      }),
    );
    fetchBodyMeasurements.mockResolvedValue([]);
    fetchDailySummary.mockResolvedValue([]);
    const first = loadHealth('tok');
    const second = loadHealth('tok');
    expect(fetchDailyHealth).toHaveBeenCalledTimes(1);
    resolveHealth([]);
    await Promise.all([first, second]);
    fetchDailyHealth.mockResolvedValue([]);
    await loadHealth('tok');
    expect(fetchDailyHealth).toHaveBeenCalledTimes(2);
  });
});

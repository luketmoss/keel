// #771 — the indoor ride detail of a Thrive Spin ride, rendered through the detail screen.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { h } from 'preact';

vi.mock('../../auth/auth-context', () => ({ useAuth: () => ({ token: 'tok-secret' }) }));

const demo = { on: false };
vi.mock('../../api/demo-data', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/demo-data')>()),
  isDemo: () => demo.on,
}));

const callAction = vi.fn();
const getWorkoutTrack = vi.fn();
vi.mock('../../api/thrive-api', () => ({
  callAction: (...a: unknown[]) => callAction(...a),
  getWorkoutTrack: (...a: unknown[]) => getWorkoutTrack(...a),
}));

const loadMaps = vi.fn();
vi.mock('../../maps/google-maps', () => ({
  loadMaps: () => loadMaps(),
  mapsApiKey: () => 'KEY',
}));

const sheetsGet = vi.fn();
vi.mock('../../api/sheets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/sheets')>()),
  sheetsGet: (...a: unknown[]) => sheetsGet(...a),
  withReauth: (token: string, fn: (t: string) => Promise<unknown>) => fn(token),
}));

import { WorkoutDetail } from './workout-detail';
import { clearStreamsCache } from '../../spin/streams-cache';
import { resetRideLibrary } from '../../spin/ride-library';
import { clearRouteCache } from './route-section';
import {
  DEMO_FREE_RIDE_ID,
  DEMO_SWEET_SPOT_ID,
  DEMO_SWEET_SPOT_STREAMS,
  DEMO_SWEET_SPOT_LIBRARY_ID,
} from '../../api/demo-spin';
import { DEMO_WORKOUTS } from '../../api/demo-data';
import { workouts, sets, exercises } from '../../state/store';
import type { WorkoutWithRow } from '../../api/types';
import { readGlobalCss } from '../../test-css';

const demoRow = (id: string): WorkoutWithRow => {
  const w = DEMO_WORKOUTS.find((x) => x.id === id);
  if (!w) throw new Error(`no demo row ${id}`);
  return w;
};

/** A real-looking file: 10 s warm-up, 20 s at 200 W, one pause, 5 s with no target. */
function file(over: Record<string, unknown> = {}) {
  const n = 35;
  const power = [...new Array(10).fill(120), ...new Array(20).fill(200), ...new Array(5).fill(100)];
  return {
    format: 'thrive-spin-streams',
    v: 1,
    ride_id: 'ride-1',
    ftp_w: 250,
    power_w: power,
    target_w: [...new Array(10).fill(125), ...new Array(20).fill(200), ...new Array(5).fill(null)],
    hr_bpm: power.map((p) => 90 + Math.round(p / 5)),
    cadence_rpm: power.map(() => 90),
    steps: [
      { start_s: 0, end_s: 10, label: 'Warm-up', mode: 'erg' },
      { start_s: 10, end_s: 30, label: 'Hold', mode: 'erg' },
      { start_s: 30, end_s: n, label: 'Cool-down', mode: 'free' },
    ],
    pauses: [{ at_s: 15, duration_s: 45 }],
    ...over,
  };
}

const reply = (streams: unknown) => ({ ok: true, data: { streams } });

/** A Spin row that goes to the API (not a bundled demo ride). */
function spinRow(over: Partial<WorkoutWithRow> = {}): WorkoutWithRow {
  return {
    ...demoRow(DEMO_SWEET_SPOT_ID),
    id: 'w_spin',
    source_activity_id: 'ride-1',
    streams_ref: 'file-1',
    elapsed_seconds: '35',
    calories: '',
    ftp_w: '250',
    ride_workout_id: '',
    ...over,
  };
}

function open(w: WorkoutWithRow) {
  workouts.value = [w];
  return render(h(WorkoutDetail, { workoutId: w.id }));
}

beforeEach(() => {
  demo.on = false;
  vi.stubEnv('VITE_THRIVE_API_URL', 'https://script.google.com/macros/s/x/exec');
  callAction.mockReset().mockResolvedValue(reply(file()));
  getWorkoutTrack.mockReset();
  loadMaps.mockReset().mockResolvedValue(undefined);
  sheetsGet.mockReset().mockResolvedValue([]);
  clearStreamsCache();
  clearRouteCache();
  resetRideLibrary();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  workouts.value = [];
  sets.value = [];
  exercises.value = [];
});

describe('the ride hero in place of the map hero', () => {
  it('shows for a completed Spin row with streams, and puts the screen in hero layout', async () => {
    const { container } = open(spinRow());
    await screen.findByRole('img', { name: /Power against target over 0:35/ });
    expect(container.querySelector('.detail-ride-hero')).toBeTruthy();
    expect(container.querySelector('.workout-detail-screen')?.classList.contains('has-hero')).toBe(true);
    expect(container.querySelector('.detail-top-bar')).toBeTruthy();
    expect(container.querySelector('.detail-sheet')).toBeTruthy();
  });

  it('wins over a track on the same row, whose map is never drawn', async () => {
    getWorkoutTrack.mockResolvedValue({ ok: false, kind: 'x' });
    const { container } = open(spinRow({ track_ref: 'trk' }));
    await screen.findByRole('img', { name: /Power against target/ });
    expect(container.querySelector('[aria-label="Route map"]')).toBeNull();
    expect(loadMaps).not.toHaveBeenCalled();
  });

  it('is not shown for a COROS indoor ride, which keeps the shell: no hero, no Intervals, no zones', async () => {
    const { container } = open(
      spinRow({ source: 'coros', source_activity_id: '1', streams_ref: '', avg_power_w: '', np_w: '' }),
    );
    expect(container.querySelector('.detail-ride-hero')).toBeNull();
    expect(container.querySelector('.workout-detail-screen')?.classList.contains('has-hero')).toBe(false);
    expect(screen.queryByText('Intervals')).toBeNull();
    expect(screen.queryByText('Time in power zones')).toBeNull();
    expect(callAction).not.toHaveBeenCalled();
  });

  it('is not shown for a Spin row with no streams_ref, which still has its cells and the Ride card', () => {
    const { container } = open(spinRow({ streams_ref: '' }));
    expect(container.querySelector('.detail-ride-hero')).toBeNull();
    expect(callAction).not.toHaveBeenCalled();
    expect(screen.getByText('Avg power')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Ride' })).toBeTruthy();
    expect(screen.queryByText('Avg cadence')).toBeNull();
  });

  it('is not shown in a build with no API URL, and makes no call', () => {
    vi.stubEnv('VITE_THRIVE_API_URL', '');
    const { container } = open(spinRow());
    expect(container.querySelector('.detail-ride-hero')).toBeNull();
    expect(callAction).not.toHaveBeenCalled();
    expect(screen.getByText('Norm. power')).toBeTruthy();
  });

  it('asks for the streams once per workout per session', async () => {
    const first = open(spinRow());
    await screen.findByRole('img', { name: /Power against target/ });
    first.unmount();
    open(spinRow());
    // The second visit renders from the session cache at once, with no loading state.
    expect(screen.queryByText('Loading ride…')).toBeNull();
    expect(screen.getByRole('img', { name: /Power against target/ })).toBeTruthy();
    expect(callAction).toHaveBeenCalledTimes(1);
  });
});

describe('loading and error', () => {
  it('while loading, fills the hero, shows the stats card and holds back intervals, zones and cadence', async () => {
    let release: (v: unknown) => void = () => {};
    callAction.mockReturnValue(new Promise((r) => (release = r)));
    const { container } = open(spinRow());
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-busy')).toBe('true');
    expect(status.textContent).toBe('Loading ride…');
    expect(container.querySelector('.detail-ride-hero')).toBeTruthy();
    expect(screen.getByText('Avg power')).toBeTruthy();
    expect(screen.queryByText('Intervals')).toBeNull();
    expect(screen.queryByText('Time in power zones')).toBeNull();
    expect(screen.queryByText('Avg cadence')).toBeNull();
    await act(async () => release(reply(file())));
    await screen.findByText('Intervals');
    expect(screen.getByText('Avg cadence')).toBeTruthy();
  });

  it('on a failure, says so with Try again, which refetches', async () => {
    callAction.mockResolvedValueOnce({ ok: false, kind: 'timeout' });
    open(spinRow());
    await screen.findByText("Couldn't load the ride's power data.");
    expect(screen.queryByText('Intervals')).toBeNull();
    expect(screen.queryByText('Avg cadence')).toBeNull();
    expect(screen.getByText('Avg power')).toBeTruthy();
    expect(console.warn).toHaveBeenCalledWith('ride streams:', 'timeout');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText('Intervals');
    expect(callAction).toHaveBeenCalledTimes(2);
  });

  it('treats a response that fails the boundary check as a failure, naming no part of it', async () => {
    callAction.mockResolvedValueOnce(reply(file({ hr_bpm: [1, 2] })));
    open(spinRow());
    await screen.findByText("Couldn't load the ride's power data.");
    expect(console.warn).toHaveBeenCalledWith('ride streams:', 'bad_response');
  });

  it('says a one-second ride is too short to draw, and still shows its cards', async () => {
    callAction.mockResolvedValueOnce(
      reply(
        file({
          power_w: [200],
          target_w: [200],
          hr_bpm: [140],
          cadence_rpm: [90],
          steps: [{ start_s: 0, end_s: 1, label: 'Ride', mode: 'erg' }],
          pauses: [],
        }),
      ),
    );
    open(spinRow());
    await screen.findByText('This ride is too short to draw.');
    expect(screen.getByText('Time in power zones')).toBeTruthy();
  });
});

describe('the chart', () => {
  it('names itself with its duration, heart rate range and pauses', async () => {
    open(spinRow());
    const fig = await screen.findByRole('img', { name: /Power against target over 0:35/ });
    const name = fig.getAttribute('aria-label')!;
    expect(name).toMatch(/, heart rate \d+ to \d+ bpm/);
    expect(name).toMatch(/, 1 pause$/);
  });

  it('draws a block per target bucket, an FTP line with its label and a dashed mark per pause on both panels', async () => {
    const { container } = open(spinRow());
    await screen.findByRole('img', { name: /Power against target/ });
    // 35 buckets, 30 with a target (the last five have none and draw no block).
    expect(container.querySelectorAll('.ride-target-block')).toHaveLength(30);
    expect(container.querySelector('.ride-ftp-line')).toBeTruthy();
    expect(screen.getByText('FTP 250 W')).toBeTruthy();
    expect(container.querySelectorAll('.ride-pause-mark')).toHaveLength(2);
    expect(container.querySelector('.ride-power-line')).toBeTruthy();
    expect(container.querySelector('.ride-hr-line')).toBeTruthy();
  });

  it('colours each block by the zone of its target over FTP', async () => {
    const { container } = open(spinRow());
    await screen.findByRole('img', { name: /Power against target/ });
    const fills = [...container.querySelectorAll('.ride-target-block')].map((r) => r.getAttribute('fill'));
    expect(fills[0]).toBe('var(--zone-1)'); // 125 of 250: 50%
    expect(fills[29]).toBe('var(--zone-3)'); // 200 of 250: 80%
  });

  it('draws grey blocks and no FTP line when neither the row nor the file has an FTP', async () => {
    callAction.mockResolvedValueOnce(reply(file({ ftp_w: null })));
    const { container } = open(spinRow({ ftp_w: '' }));
    await screen.findByRole('img', { name: /Power against target/ });
    expect(container.querySelector('.ride-ftp-line')).toBeNull();
    expect(container.querySelector('.ride-target-block')?.getAttribute('fill')).toBe('var(--color-border)');
    expect(screen.getByText('No FTP for this ride, so there are no zones.')).toBeTruthy();
  });

  it('has a legend of words, with Pause only when there are pauses', async () => {
    const { container } = open(spinRow());
    await screen.findByRole('img', { name: /Power against target/ });
    const items = [...container.querySelectorAll('.ride-legend li')].map((li) => li.textContent);
    expect(items).toEqual(['Power', 'Target', 'Heart rate', 'Pause']);
  });

  it('with no pauses has no marks, no legend item and no pause in its name', async () => {
    callAction.mockResolvedValueOnce(reply(file({ pauses: [] })));
    const { container } = open(spinRow());
    const fig = await screen.findByRole('img', { name: /Power against target/ });
    expect(container.querySelectorAll('.ride-pause-mark')).toHaveLength(0);
    expect(fig.getAttribute('aria-label')).not.toMatch(/pause/);
    expect([...container.querySelectorAll('.ride-legend li')].map((li) => li.textContent)).not.toContain('Pause');
    expect(screen.queryByText('Pauses')).toBeNull();
  });

  it('names several pauses in the plural', async () => {
    callAction.mockResolvedValueOnce(
      reply(
        file({
          pauses: [
            { at_s: 5, duration_s: 30 },
            { at_s: 20, duration_s: 30 },
          ],
        }),
      ),
    );
    open(spinRow());
    const fig = await screen.findByRole('img', { name: /Power against target/ });
    expect(fig.getAttribute('aria-label')).toMatch(/, 2 pauses$/);
    expect(screen.getByText('2 pauses · 1:00')).toBeTruthy();
  });

  it('with no heart rate has no panel, no legend item, no HR column, and keeps the row avg_hr cell', async () => {
    callAction.mockResolvedValueOnce(reply(file({ hr_bpm: new Array(35).fill(null) })));
    const { container } = open(spinRow({ avg_hr: '133' }));
    const fig = await screen.findByRole('img', { name: /Power against target/ });
    expect(fig.getAttribute('aria-label')).not.toMatch(/heart rate/);
    expect(container.querySelector('.ride-hr-panel')).toBeNull();
    expect([...container.querySelectorAll('.ride-legend li')].map((li) => li.textContent)).not.toContain('Heart rate');
    expect(container.querySelector('.ride-intervals abbr')).toBeNull();
    expect(screen.getByText('Avg heart rate')).toBeTruthy();
    // The hero keeps its box: the same element, the same class.
    expect(container.querySelector('.detail-ride-hero')).toBeTruthy();
  });

  it('breaks the power line at a gap rather than bridging it', async () => {
    const power = new Array(35).fill(150);
    for (let i = 10; i < 20; i++) power[i] = null;
    callAction.mockResolvedValueOnce(reply(file({ power_w: power })));
    const { container } = open(spinRow());
    await screen.findByRole('img', { name: /Power against target/ });
    const d = container.querySelector('.ride-power-line')!.getAttribute('d')!;
    expect(d.match(/M/g)).toHaveLength(2);
  });
});

describe('the stats card', () => {
  it('shows the power cells in order, then Avg cadence last once the streams are in', async () => {
    const { container } = open(
      spinRow({ avg_power_w: '190', np_w: '215', intensity_factor: '0.86', tss: '74', work_kj: '683', avg_hr: '141' }),
    );
    await screen.findByText('Avg cadence');
    const labels = [...container.querySelectorAll('.detail-stat-label')].map((e) => e.textContent);
    expect(labels).toEqual(['Avg power', 'Norm. power', 'IF', 'TSS', 'Work', 'Avg heart rate', 'Avg cadence']);
    const spoken = [...container.querySelectorAll('.detail-stat-value')].map((e) => e.getAttribute('aria-label'));
    expect(spoken).toEqual([
      '190 watts',
      '215 watts normalized',
      'intensity factor 0.86',
      'training stress score 74',
      '683 kilojoules',
      '141 beats per minute',
      '90 revolutions per minute',
    ]);
  });

  it('leaves out a cell whose source is blank, never drawing 0 or a dash', async () => {
    const { container } = open(
      spinRow({ avg_power_w: '190', np_w: '', intensity_factor: '', tss: '', work_kj: '', avg_hr: '' }),
    );
    await screen.findByText('Avg cadence');
    const labels = [...container.querySelectorAll('.detail-stat-label')].map((e) => e.textContent);
    expect(labels).toEqual(['Avg power', 'Avg cadence']);
  });

  it('leaves out Avg cadence when the ride has no cadence reading', async () => {
    callAction.mockResolvedValueOnce(reply(file({ cadence_rpm: new Array(35).fill(0) })));
    open(spinRow());
    await screen.findByText('Intervals');
    expect(screen.queryByText('Avg cadence')).toBeNull();
  });
});

describe('Intervals', () => {
  it('has a row per step with the label and duration, target, average and heart rate', async () => {
    const { container } = open(spinRow());
    await screen.findByText('Intervals');
    const rows = [...container.querySelectorAll('.ride-intervals tbody tr')];
    expect(rows).toHaveLength(3);
    const text = (r: Element) => [...r.querySelectorAll('th, td')].map((c) => c.textContent);
    expect(text(rows[0])).toEqual(['Warm-up0:10', '125 W', '120 W', '114']);
    expect(text(rows[1])).toEqual(['Hold0:20', '200 W', '200 W', '130']);
    expect(text(rows[2])).toEqual(['Cool-down0:05', 'Free', '100 W', '110']);
  });

  it('is a table named by its heading', async () => {
    open(spinRow());
    const table = await screen.findByRole('table', { name: 'Intervals' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((c) => c.textContent),
    ).toEqual(['Step', 'Target', 'Avg', 'HR']);
  });

  it('shows a dash where a step has no reading', async () => {
    callAction.mockResolvedValueOnce(
      reply(file({ power_w: [...new Array(30).fill(200), ...new Array(5).fill(null)] })),
    );
    const { container } = open(spinRow());
    await screen.findByText('Intervals');
    const last = container.querySelectorAll('.ride-intervals tbody tr')[2];
    expect(last.querySelector('.ride-avg')?.textContent).toBe('—');
  });

  it('is hidden for a free ride of one step with no target', async () => {
    callAction.mockResolvedValueOnce(
      reply(
        file({
          target_w: new Array(35).fill(null),
          steps: [{ start_s: 0, end_s: 35, label: 'Free ride', mode: 'free' }],
        }),
      ),
    );
    open(spinRow());
    await screen.findByText('Time in power zones');
    expect(screen.queryByText('Intervals')).toBeNull();
  });

  it('drops a step shorter than a second', async () => {
    callAction.mockResolvedValueOnce(
      reply(
        file({
          steps: [
            { start_s: 0, end_s: 0, label: 'Skipped', mode: 'erg' },
            { start_s: 0, end_s: 20, label: 'Hold', mode: 'erg' },
            { start_s: 20, end_s: 35, label: 'Rest', mode: 'erg' },
          ],
        }),
      ),
    );
    const { container } = open(spinRow());
    await screen.findByText('Intervals');
    expect(container.querySelectorAll('.ride-intervals tbody tr')).toHaveLength(2);
  });
});

describe('Time in power zones', () => {
  it('lists Z1 to Z6 with the watt range at the ride FTP, the time and the share', async () => {
    const { container } = open(spinRow());
    await screen.findByText('Time in power zones');
    const rows = [...container.querySelectorAll('.ride-zone-row')];
    expect(rows).toHaveLength(6);
    expect(rows[0].querySelector('.ride-zone-range')?.textContent).toBe('< 140 W');
    expect(rows[1].querySelector('.ride-zone-range')?.textContent).toBe('140–189 W');
    expect(rows[5].querySelector('.ride-zone-range')?.textContent).toBe('≥ 303 W');
    // 10 s at 120 W and 5 s at 100 W are Z1 (under 140 W), 20 s at 200 W is Z3 (190-227 W).
    expect(rows[0].querySelector('.ride-zone-time')?.textContent).toBe('0:15');
    expect(rows[0].querySelector('.ride-zone-share')?.textContent).toBe('43%');
    expect(rows[2].querySelector('.ride-zone-time')?.textContent).toBe('0:20');
    expect(rows[2].querySelector('.ride-zone-share')?.textContent).toBe('57%');
    // A zone with no time is a measured zero.
    expect(rows[4].querySelector('.ride-zone-time')?.textContent).toBe('0:00');
    expect(rows[4].querySelector('.ride-zone-share')?.textContent).toBe('0%');
  });

  it('reads each row aloud as a sentence', async () => {
    open(spinRow());
    await screen.findByText('Time in power zones');
    expect(screen.getByRole('img', { name: 'Z3 Tempo, 190 to 227 watts, 20 seconds, 57 percent' })).toBeTruthy();
    expect(
      screen.getByRole('img', { name: 'Z1 Active recovery, under 140 watts, 15 seconds, 43 percent' }),
    ).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Z6 Anaerobic, 303 watts or more, 0 seconds, 0 percent' })).toBeTruthy();
  });

  it('says so when no power was recorded', async () => {
    callAction.mockResolvedValueOnce(reply(file({ power_w: new Array(35).fill(null) })));
    open(spinRow());
    await screen.findByText('No power was recorded on this ride.');
  });
});

describe('the Ride card', () => {
  it('shows the FTP, the intensity and the pauses, and leaves out the workout with no link', async () => {
    open(spinRow({ intensity_pct: '100' }));
    const card = screen.getByRole('region', { name: 'Ride' });
    expect(within(card).getByText('250 W')).toBeTruthy();
    expect(within(card).getByText('100% · as written')).toBeTruthy();
    expect(within(card).queryByText('Spin workout')).toBeNull();
    expect(within(card).queryByText('Pauses')).toBeNull();
    await waitFor(() => expect(within(card).getByText('1 pause · 0:45')).toBeTruthy());
  });

  it('shows a changed intensity as a percentage, and falls back to the file FTP', async () => {
    open(spinRow({ intensity_pct: '105', ftp_w: '' }));
    await screen.findByText('1 pause · 0:45');
    const card = screen.getByRole('region', { name: 'Ride' });
    expect(within(card).getByText('105%')).toBeTruthy();
    expect(within(card).getByText('250 W')).toBeTruthy();
  });

  it('is hidden when every row is blank', () => {
    open(spinRow({ ftp_w: '', intensity_pct: '', ride_workout_id: '', streams_ref: '' }));
    expect(screen.queryByRole('region', { name: 'Ride' })).toBeNull();
  });

  it('names the Spin workout from the library read through the Sheets API', async () => {
    sheetsGet.mockResolvedValue([['rw_1', 'Over-Unders', 'Threshold', '', '', '2400', '', '']]);
    open(spinRow({ ride_workout_id: 'rw_1' }));
    await screen.findByText('Over-Unders');
    expect(sheetsGet).toHaveBeenCalledTimes(1);
    expect(sheetsGet.mock.calls[0][0]).toBe('RideWorkouts!A2:H');
  });

  it('says so when the id is not in the library', async () => {
    sheetsGet.mockResolvedValue([['rw_other', 'Other', 'Endurance', '', '', '2400', '', '']]);
    open(spinRow({ ride_workout_id: 'rw_gone' }));
    await screen.findByText('Removed from your library');
  });

  it('reads a missing RideWorkouts tab as an empty library', async () => {
    const { SheetsApiError } = await import('../../api/sheets');
    sheetsGet.mockRejectedValue(new SheetsApiError(400, 'Unable to parse range: RideWorkouts!A2:H'));
    open(spinRow({ ride_workout_id: 'rw_gone' }));
    await screen.findByText('Removed from your library');
  });

  it('says it could not load it when the read fails, and the rest still shows', async () => {
    sheetsGet.mockRejectedValue(new Error('boom'));
    open(spinRow({ ride_workout_id: 'rw_1' }));
    await screen.findByText("Couldn't load it");
    expect(screen.getByText('FTP for this ride')).toBeTruthy();
  });

  it('shows no workout row while the library loads', async () => {
    let release: (v: unknown) => void = () => {};
    sheetsGet.mockReturnValue(new Promise((r) => (release = r)));
    open(spinRow({ ride_workout_id: 'rw_1' }));
    expect(screen.queryByText('Spin workout')).toBeNull();
    await act(async () => release([['rw_1', 'Late', 'Endurance', '', '', '60', '', '']]));
    await screen.findByText('Late');
  });

  it('does not read the library for a ride that links no workout', async () => {
    open(spinRow({ ride_workout_id: '' }));
    await screen.findByText('Intervals');
    expect(sheetsGet).not.toHaveBeenCalled();
  });
});

describe('provenance', () => {
  it('reads Recorded with Thrive Spin, with the upload stamp', async () => {
    const { container } = open(spinRow({ synced_at: '2025-01-13T14:45:00.000Z' }));
    await screen.findByText('Intervals');
    expect(container.querySelector('.detail-provenance')?.textContent).toMatch(
      /^Recorded with Thrive Spin · uploaded 2025-01-1\d \d\d:\d\d$/,
    );
  });

  it('reads Recorded with Thrive Spin alone without a stamp', async () => {
    const { container } = open(spinRow({ synced_at: '' }));
    await screen.findByText('Intervals');
    expect(container.querySelector('.detail-provenance')?.textContent).toBe('Recorded with Thrive Spin');
  });

  it('shows no View on COROS link', async () => {
    const { container } = open(spinRow());
    await screen.findByText('Intervals');
    expect(container.querySelector('.detail-coros-link')).toBeNull();
  });
});

describe('demo mode', () => {
  beforeEach(() => {
    demo.on = true;
    vi.stubEnv('VITE_THRIVE_API_URL', '');
  });

  it('renders every part of the Sweet Spot ride from bundled streams, with no call', async () => {
    const { container } = open(demoRow(DEMO_SWEET_SPOT_ID));
    await screen.findByRole('img', { name: /Power against target over 1:00:00, heart rate \d+ to \d+ bpm, 1 pause/ });
    expect(callAction).not.toHaveBeenCalled();
    expect(sheetsGet).not.toHaveBeenCalled();
    expect(container.querySelector('.detail-ride-hero')).toBeTruthy();
    expect(screen.getByText('FTP 250 W')).toBeTruthy();
    const steps = [...container.querySelectorAll('.ride-step-label')].map((e) => e.textContent);
    expect(steps).toEqual([
      'Warm-up',
      'Sweet spot',
      'Recover',
      'Sweet spot',
      'Recover',
      'Sweet spot',
      'Recover',
      'Cool-down',
    ]);
    expect(container.querySelectorAll('.ride-zone-row')).toHaveLength(6);
    expect(screen.getByText('1 pause · 0:45')).toBeTruthy();
    await screen.findByText('Sweet Spot 3×12', { selector: 'dd' });
    expect(screen.getByText('Avg cadence')).toBeTruthy();
    expect(container.querySelector('.detail-provenance')?.textContent).toMatch(/^Recorded with Thrive Spin/);
    // Effort stays the title chip, and the note stays the Note card.
    expect(container.querySelector('.detail-note-card')?.textContent).toMatch(/Held every block/);
  });

  it('has a Sweet spot ride whose blocks hold 225 W and whose recoveries hold 138 W', async () => {
    const s = DEMO_SWEET_SPOT_STREAMS;
    expect(s.power_w.length).toBe(3600);
    expect(s.steps[1]).toMatchObject({ label: 'Sweet spot', start_s: 600, end_s: 1320 });
    expect(new Set(s.target_w.slice(600, 1320))).toEqual(new Set([225]));
    expect(new Set(s.target_w.slice(1320, 1560))).toEqual(new Set([138]));
    expect(s.pauses).toEqual([{ at_s: 1800, duration_s: 45 }]);
    expect(s.hr_bpm.slice(2380, 2400).every((v) => v === null)).toBe(true);
    expect(s.hr_bpm.filter((v) => v === null)).toHaveLength(20);
  });

  it('renders the Free ride with no heart rate, no workout and no Intervals card', async () => {
    const { container } = open(demoRow(DEMO_FREE_RIDE_ID));
    await screen.findByRole('img', { name: /Power against target over 40:00$/ });
    expect(container.querySelector('.ride-hr-panel')).toBeNull();
    expect(screen.queryByText('Intervals')).toBeNull();
    expect(screen.queryByText('Spin workout')).toBeNull();
    expect(screen.getByText('Time in power zones')).toBeTruthy();
    expect(screen.getByText('Avg cadence')).toBeTruthy();
    expect(screen.queryByText('Avg heart rate')).toBeNull();
  });

  it('leaves the existing demo indoor ride as the shell', async () => {
    const { container } = open(demoRow('w_demo003'));
    expect(container.querySelector('.detail-ride-hero')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Ride' })).toBeNull();
    expect(screen.queryByText('Time in power zones')).toBeNull();
  });

  it('keeps the library workout the Sweet Spot ride links in the bundled library', () => {
    expect(demoRow(DEMO_SWEET_SPOT_ID).ride_workout_id).toBe(DEMO_SWEET_SPOT_LIBRARY_ID);
    expect(demoRow(DEMO_FREE_RIDE_ID).ride_workout_id).toBe('');
    expect(demoRow(DEMO_FREE_RIDE_ID).avg_hr).toBe('');
  });
});

describe('the stylesheet', () => {
  const css = readGlobalCss();

  it('defines the six zone colours in both themes and the four sizes', () => {
    for (let z = 1; z <= 6; z++) {
      expect(css.match(new RegExp(`--zone-${z}:`, 'g'))?.length).toBe(2);
    }
    expect(css).toMatch(/--detail-ride-hero-height:\s*376px/);
    expect(css).toMatch(/--detail-bar-clearance:\s*64px/);
    expect(css).toMatch(/--ride-hr-plot-height:\s*56px/);
    expect(css).toMatch(/--ride-target-opacity:\s*0\.35/);
  });

  it('gives Intervals and zone rows a 44px floor, and makes the ride hero a fixed height', () => {
    expect(css).toMatch(/\.ride-intervals tbody tr\s*\{[^}]*height:\s*44px/);
    expect(css).toMatch(/\.ride-zone-row\s*\{[^}]*min-height:\s*44px/);
    expect(css).toMatch(/\.ride-card-row\s*\{[^}]*min-height:\s*44px/);
    expect(css).toMatch(/\.detail-ride-hero\s*\{[^}]*height:\s*var\(--detail-ride-hero-height\)/);
  });
});

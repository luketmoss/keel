// #765 - an MCP-key saveRideWorkout, deleteRideWorkout and addFtp are change-logged (#434) for
// their tab, and undoCall reverts them.

import { describe, it, expect } from 'vitest';
import { loadSpin, call, rideWorkoutRow, ftpRow, EXAMPLE_STEPS, MCP_KEY } from './spin-fixtures';

const asMcp = (api: ReturnType<typeof loadSpin>, action: string, payload: unknown) =>
  call<any>(api, action, payload, MCP_KEY);

describe('the change log covers RideWorkouts and FtpHistory', () => {
  it('names them in changeTabs, keyed by id, and logs the three actions', () => {
    const api = loadSpin({ changeLog: [] });
    const tabs = api.sandbox.changeTabs();
    expect(tabs.RideWorkouts).toEqual({ sheet: 'RideWorkouts', fields: api.sandbox.RIDE_WORKOUT_FIELDS, key: ['id'] });
    expect(tabs.FtpHistory).toEqual({ sheet: 'FtpHistory', fields: api.sandbox.FTP_HISTORY_FIELDS, key: ['id'] });
    expect({ ...api.sandbox.CHANGE_LOGGED_ACTIONS }).toMatchObject({
      saveRideWorkout: ['RideWorkouts'], deleteRideWorkout: ['RideWorkouts'], addFtp: ['FtpHistory'],
    });
    // saveRide is the phone's: never logged, whatever key sends it.
    expect(Object.keys(api.sandbox.CHANGE_LOGGED_ACTIONS)).not.toContain('saveRide');
  });

  it('saveRideWorkout writes a RideWorkouts row to the log, and undoCall removes it', () => {
    const api = loadSpin({ changeLog: [] });
    const saved = asMcp(api, 'saveRideWorkout', {
      call_id: 'c1', name: 'Sweet Spot', category: 'Sweet spot', steps: EXAMPLE_STEPS,
    });
    expect(saved.res.success, saved.text).toBe(true);
    expect(api.changeLogRows).toHaveLength(1);
    expect(api.changeLogRows![0].slice(1, 4)).toEqual(['c1', 'saveRideWorkout', 'RideWorkouts']);
    expect(JSON.parse(api.changeLogRows![0][4] as string)).toEqual({ id: saved.res.data.id });
    expect(api.changeLogRows![0][5]).toBe('');
    expect(JSON.parse(api.changeLogRows![0][6] as string).name).toBe('Sweet Spot');

    const undone = asMcp(api, 'undoCall', { call_id: 'c1', confirm: true });
    expect(undone.res.success, undone.text).toBe(true);
    expect(api.rideWorkoutRows).toEqual([]);
  });

  it('a replace logs before and after, and undoCall puts the old row back', () => {
    const api = loadSpin({ changeLog: [], rideWorkouts: [rideWorkoutRow()] });
    const before = JSON.stringify(api.rideWorkoutRows);
    asMcp(api, 'saveRideWorkout', {
      call_id: 'c2', id: 'rw_1a2b3c4d', name: 'Renamed', category: 'Threshold', steps: EXAMPLE_STEPS,
    });
    expect(api.rideWorkoutRows![0][1]).toBe('Renamed');
    expect(JSON.parse(api.changeLogRows![0][5] as string).name).toBe('Sweet Spot 3x12');
    expect(asMcp(api, 'undoCall', { call_id: 'c2', confirm: true }).res.success).toBe(true);
    expect(JSON.stringify(api.rideWorkoutRows)).toBe(before);
  });

  it('deleteRideWorkout logs the removed row, and undoCall restores it', () => {
    const api = loadSpin({ changeLog: [], rideWorkouts: [rideWorkoutRow()] });
    const before = JSON.stringify(api.rideWorkoutRows);
    expect(asMcp(api, 'deleteRideWorkout', { call_id: 'c3', id: 'rw_1a2b3c4d' }).res.data.deleted).toBe(true);
    expect(api.rideWorkoutRows).toEqual([]);
    expect(api.changeLogRows![0].slice(2, 4)).toEqual(['deleteRideWorkout', 'RideWorkouts']);
    expect(api.changeLogRows![0][6]).toBe('');
    expect(asMcp(api, 'undoCall', { call_id: 'c3', confirm: true }).res.success).toBe(true);
    expect(JSON.stringify(api.rideWorkoutRows)).toBe(before);
  });

  it('a delete of an id that is not there logs nothing', () => {
    const api = loadSpin({ changeLog: [] });
    expect(asMcp(api, 'deleteRideWorkout', { call_id: 'c4', id: 'rw_gone' }).res.data.deleted).toBe(false);
    expect(api.changeLogRows).toEqual([]);
  });

  it('addFtp writes an FtpHistory row to the log, and undoCall removes it; a repeat logs nothing more', () => {
    const api = loadSpin({ changeLog: [], ftpHistory: [ftpRow()] });
    const payload = { call_id: 'c5', id: 'ftp_mcp', date: '2026-11-07', ftp_w: 255, source: 'manual' };
    expect(asMcp(api, 'addFtp', payload).res.success).toBe(true);
    expect(api.ftpRows).toHaveLength(2);
    expect(api.changeLogRows).toHaveLength(1);
    expect(api.changeLogRows![0].slice(2, 4)).toEqual(['addFtp', 'FtpHistory']);
    asMcp(api, 'addFtp', { ...payload, call_id: 'c5b' });
    expect(api.changeLogRows).toHaveLength(1);

    expect(asMcp(api, 'undoCall', { call_id: 'c5', confirm: true }).res.success).toBe(true);
    expect(api.ftpRows).toHaveLength(1);
    expect(api.ftpRows![0][0]).toBe('ftp_1');
  });

  it('refuses the write, logging nothing, when MCPChangeLog is missing', () => {
    const api = loadSpin();
    const { res } = asMcp(api, 'addFtp', { id: 'x', date: '2026-11-07', ftp_w: 250, source: 'manual' });
    expect(res.success).toBe(false);
    expect(api.ftpRows).toEqual([]);
  });

  it('the Spin key\'s own writes are not logged: only the MCP key\'s are', () => {
    const api = loadSpin({ changeLog: [] });
    call(api, 'addFtp', { id: 'x', date: '2026-11-07', ftp_w: 250, source: 'manual' });
    expect(api.ftpRows).toHaveLength(1);
    expect(api.changeLogRows).toEqual([]);
  });
});

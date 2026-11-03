// #765 - the FtpHistory tab: addFtp and getFtp.

import { describe, it, expect } from 'vitest';
import { loadSpin, call, ftpRow, NOW } from './spin-fixtures';

const add = (overrides: Record<string, unknown> = {}) => ({
  id: 'ftp_new', date: '2026-11-07', ftp_w: 250, source: 'manual', ...overrides,
});

describe('addFtp', () => {
  it('appends a row and returns it', () => {
    const api = loadSpin();
    const { res, text } = call<any>(api, 'addFtp', add());
    expect(res.success, text).toBe(true);
    expect(res.data).toEqual({
      id: 'ftp_new', date: '2026-11-07', ftp_w: '250', source: 'manual', ride_id: '', created: NOW.toISOString(),
    });
    expect(api.ftpRows).toHaveLength(1);
    expect(api.ftpRows![0]).toEqual(['ftp_new', '2026-11-07', '250', 'manual', '', NOW.toISOString()]);
  });

  it('records a ramp test with its ride_id', () => {
    const api = loadSpin();
    const { res } = call<any>(api, 'addFtp', add({ source: 'ramp_test', ride_id: 'ride-9', ftp_w: 262 }));
    expect(res.data).toMatchObject({ source: 'ramp_test', ride_id: 'ride-9', ftp_w: '262' });
  });

  it('the same id again leaves one row and returns the existing one unchanged', () => {
    const api = loadSpin();
    call(api, 'addFtp', add());
    const again = call<any>(api, 'addFtp', add({ ftp_w: 300, date: '2026-12-01' }));
    expect(again.res.success).toBe(true);
    expect(again.res.data).toMatchObject({ id: 'ftp_new', ftp_w: '250', date: '2026-11-07' });
    expect(api.ftpRows).toHaveLength(1);
  });

  const refusals: [string, Record<string, unknown>][] = [
    ['ramp_test without ride_id', { source: 'ramp_test' }],
    ['ramp_test with a blank ride_id', { source: 'ramp_test', ride_id: '' }],
    ['ramp_test with a malformed ride_id', { source: 'ramp_test', ride_id: 'a b' }],
    ['manual with a ride_id', { source: 'manual', ride_id: 'ride-1' }],
    ['ftp_w 49', { ftp_w: 49 }],
    ['ftp_w 1001', { ftp_w: 1001 }],
    ['ftp_w 250.5', { ftp_w: 250.5 }],
    ['ftp_w text', { ftp_w: 'strong' }],
    ['ftp_w missing', { ftp_w: undefined }],
    ['an unknown source', { source: 'guess' }],
    ['a bad date', { date: '07/11/2026' }],
    ['an impossible date', { date: '2026-02-30' }],
    ['a missing id', { id: undefined }],
    ['a malformed id', { id: 'x'.repeat(65) }],
  ];
  for (const [name, overrides] of refusals) {
    it(`refuses ${name} as bad_request, writing nothing`, () => {
      const api = loadSpin();
      const { res } = call<any>(api, 'addFtp', add(overrides));
      expect(res.success).toBe(false);
      expect(res.code).toBe('bad_request');
      expect(api.ftpRows).toEqual([]);
    });
  }

  it('accepts the limits 50 and 1000, and a digit string', () => {
    for (const [i, w] of [50, 1000, '275'].entries()) {
      const api = loadSpin();
      expect(call<any>(api, 'addFtp', add({ id: `f${i}`, ftp_w: w })).res.data.ftp_w).toBe(String(w));
    }
  });

  it('a refusal quotes nothing the caller sent', () => {
    const { text } = call<any>(loadSpin(), 'addFtp', add({ source: 'SECRETWORD' }));
    expect(text).not.toContain('SECRETWORD');
  });
});

describe('getFtp', () => {
  it('is {current: null, history: []} on an empty tab and on a missing one', () => {
    expect(call<any>(loadSpin(), 'getFtp', undefined).res.data).toEqual({ current: null, history: [] });
    const api = loadSpin();
    const get = api.sandbox.getSpreadsheet;
    api.sandbox.getSpreadsheet = () => ({ getSheetByName: (n: string) => (n === 'FtpHistory' ? null : get().getSheetByName(n)) });
    expect(call<any>(api, 'getFtp', undefined).res.data).toEqual({ current: null, history: [] });
  });

  it('current is the newest row by date and then created, with history newest first', () => {
    const api = loadSpin({
      ftpHistory: [
        ftpRow({ id: 'a', date: '2026-09-01', ftp_w: '240', created: '2026-09-01T12:00:00.000Z' }),
        ftpRow({ id: 'b', date: '2026-11-01', ftp_w: '255', created: '2026-11-01T08:00:00.000Z' }),
        // Same date as b but created later: this one is current.
        ftpRow({ id: 'c', date: '2026-11-01', ftp_w: '258', created: '2026-11-01T09:00:00.000Z' }),
        // A back-dated row added last does not become current.
        ftpRow({ id: 'd', date: '2026-10-01', ftp_w: '250', created: '2026-11-05T09:00:00.000Z' }),
      ],
    });
    const { res } = call<any>(api, 'getFtp', undefined);
    expect(res.data.current.id).toBe('c');
    expect(res.data.history.map((r: any) => r.id)).toEqual(['c', 'b', 'd', 'a']);
    expect(res.data.history[0]).toEqual({
      id: 'c', date: '2026-11-01', ftp_w: '258', source: 'manual', ride_id: '', created: '2026-11-01T09:00:00.000Z',
    });
  });

  it('after addFtp, the new row is current when it is the newest', () => {
    const api = loadSpin({ ftpHistory: [ftpRow()] });
    call(api, 'addFtp', add({ date: '2026-11-07', ftp_w: 262 }));
    expect(call<any>(api, 'getFtp', undefined).res.data.current).toMatchObject({ id: 'ftp_new', ftp_w: '262' });
  });
});

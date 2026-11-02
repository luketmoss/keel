// #757 - the seven label values of getFoodLogTotals: optional on the day, and all or nothing.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

const URL_ = 'https://script.google.com/macros/s/forage/exec';

const day = {
  date: '2026-11-01',
  entries: 4,
  unknown_entries: 0,
  kcal: 1240.4,
  protein_g: 62,
  carbs_g: 140.2,
  fat_g: 48.1,
  partial: false,
};
const seven = {
  satfat_g: 15.2,
  transfat_g: 0,
  cholesterol_mg: 210,
  sodium_mg: 1840,
  fiber_g: 22,
  sugars_g: 48,
  added_sugars_g: null,
};
const unknown = {
  satfat_g: 0,
  transfat_g: 0,
  cholesterol_mg: 0,
  sodium_mg: 1,
  fiber_g: 0,
  sugars_g: 0,
  added_sugars_g: 4,
};

beforeEach(() => vi.stubEnv('VITE_FORAGE_API_URL', URL_));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function run(d: unknown) {
  const body = { success: true, data: { days: [d] } };
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, status: 200, json: async () => body }) as unknown as Response),
  );
  const { getFoodLogTotals } = await import('./forage-food');
  return getFoodLogTotals('t', '2026-11-01', '2026-11-01');
}

describe('the seven label values', () => {
  it('reads the seven and their unknown counts into label', async () => {
    const res = await run({ ...day, ...seven, unknown });
    expect(res.ok && res.days[0].label).toEqual({ values: seven, unknown });
  });

  it('has no label when the reply lacks the seven or unknown', async () => {
    const none = await run(day);
    expect(none.ok && none.days[0].label).toBeUndefined();
    const noUnknown = await run({ ...day, ...seven });
    expect(noUnknown.ok && noUnknown.days[0].label).toBeUndefined();
  });

  it.each([
    ['a value that is a string', { ...seven, sodium_mg: '1840' }, unknown],
    ['a missing value', { ...seven, fiber_g: undefined }, unknown],
    ['an unknown count that is not a number', seven, { ...unknown, sodium_mg: null }],
    ['an unknown with a key missing', seven, { ...unknown, sugars_g: undefined }],
  ])('drops the whole label, not the read, for %s', async (_name, values, unk) => {
    const res = await run({ ...day, ...values, unknown: unk });
    expect(res.ok).toBe(true);
    expect(res.ok && res.days[0].label).toBeUndefined();
    expect(res.ok && res.days[0].kcal).toBe(1240.4);
  });

  it('still fails the read on a malformed core figure', async () => {
    const res = await run({ ...day, kcal: 'x', ...seven, unknown });
    expect(res).toEqual({ ok: false, kind: 'bad_response' });
  });
});

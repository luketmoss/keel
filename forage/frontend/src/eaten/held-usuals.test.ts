// #945: the Eaten tab has one copy of the usuals, the Add sheet's held lists. A read lands there, a save is one
// `holdUsual`, the device keeps them for a fresh start, and a save made while a read is out survives its answer.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ForageApi } from '../api/client';
import type { Usual } from '../api/types';
import { addLists, clearAddHeld, heldUsuals, holdUsual } from './add-store';
import { bindAccount, loadDayUsuals, _resetEaten } from './eaten-store';

const EMAIL = 'luke@example.com';
const KEY = `forage_add:${EMAIL}`;

function usual(id: string, name: string): Usual {
  return { id, name, slot: 'Breakfast', lines: [] } as unknown as Usual;
}

function makeApi(server: { usuals: Usual[] }) {
  const gate: { usuals?: Promise<Usual[]>; fail?: boolean } = {};
  const api = {
    getUsuals: () =>
      gate.fail
        ? Promise.reject(new Error('down'))
        : (gate.usuals ?? Promise.resolve(server.usuals.map((u) => ({ ...u })))),
  } as unknown as ForageApi;
  return { api, gate };
}

const names = () => heldUsuals.value.map((u) => u.name);
const keptUsuals = () => (JSON.parse(localStorage.getItem(KEY)!).usuals as Usual[]).map((u) => u.name);

beforeEach(() => {
  localStorage.clear();
  _resetEaten();
});
afterEach(() => {
  _resetEaten();
  localStorage.clear();
});

describe('one copy of the usuals (#945)', () => {
  it('a read lands in the held usuals and the copy kept on the device', async () => {
    const { api } = makeApi({ usuals: [usual('us_oat', 'Oatmeal')] });
    bindAccount(EMAIL);
    await loadDayUsuals(api);
    expect(names()).toEqual(['Oatmeal']);
    await Promise.resolve();
    expect(keptUsuals()).toEqual(['Oatmeal']);
  });

  it('a saved usual is held at once, replacing its old copy, and kept on the device', async () => {
    const { api } = makeApi({ usuals: [usual('us_oat', 'Oatmeal'), usual('us_yog', 'Yogurt bowl')] });
    bindAccount(EMAIL);
    await loadDayUsuals(api);

    holdUsual(usual('us_oat', 'Oatmeal, no fruit'));
    holdUsual(usual('us_new', 'Side salad'));

    expect(names()).toEqual(['Yogurt bowl', 'Oatmeal, no fruit', 'Side salad']);
    await Promise.resolve();
    expect(keptUsuals()).toEqual(['Yogurt bowl', 'Oatmeal, no fruit', 'Side salad']);
  });

  it('a usual saved while a read is out is still there after that answer lands', async () => {
    const { api, gate } = makeApi({ usuals: [] });
    bindAccount(EMAIL);
    let release!: (u: Usual[]) => void;
    gate.usuals = new Promise((r) => (release = r));
    const reading = loadDayUsuals(api);

    holdUsual(usual('us_new', 'Side salad'));
    release([usual('us_oat', 'Oatmeal')]); // read before the save
    await reading;

    expect(names()).toEqual(['Oatmeal', 'Side salad']);
  });

  it('a fresh start shows the usuals the device kept, before any read', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        v: 1,
        lists: { foods: [], recipes: [], log: [] },
        combos: {},
        usuals: [usual('us_oat', 'Oatmeal')],
      }),
    );
    bindAccount(EMAIL);
    expect(names()).toEqual(['Oatmeal']);
    expect(addLists.value).toEqual({ foods: [], recipes: [], log: [] });
  });

  it('a failed read leaves the held usuals as they were', async () => {
    const { api, gate } = makeApi({ usuals: [usual('us_oat', 'Oatmeal')] });
    bindAccount(EMAIL);
    await loadDayUsuals(api);
    gate.fail = true;
    await loadDayUsuals(api);
    expect(names()).toEqual(['Oatmeal']);
  });

  it('with none held, a saved usual is held as a list of one', () => {
    bindAccount(EMAIL);
    expect(heldUsuals.value).toEqual([]);
    holdUsual(usual('us_new', 'Side salad'));
    expect(names()).toEqual(['Side salad']);
  });

  it('another account never sees them, and sign-out removes them from memory and the device', async () => {
    const { api } = makeApi({ usuals: [usual('us_oat', 'Oatmeal')] });
    bindAccount(EMAIL);
    await loadDayUsuals(api);
    await Promise.resolve();

    bindAccount('other@example.com');
    expect(heldUsuals.value).toEqual([]);
    bindAccount(EMAIL);
    expect(names()).toEqual(['Oatmeal']);

    clearAddHeld();
    expect(heldUsuals.value).toEqual([]);
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});

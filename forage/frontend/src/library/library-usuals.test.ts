// #947: a usual created, edited or deleted in the Library reaches the Eaten tab's one copy of the usuals (#945), and
// the copy kept on the device, with one call from the Library's store.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ForageApi } from '../api/client';
import type { Usual } from '../api/types';
import { heldUsuals } from '../eaten/add-store';
import { bindAccount, loadDayUsuals, _resetEaten } from '../eaten/eaten-store';
import { createUsual, dropUsual, keepUsual, usuals, _resetUsuals } from './usuals-store';

const EMAIL = 'luke@example.com';
const KEY = `forage_add:${EMAIL}`;

function usual(id: string, name: string): Usual {
  return { id, name, slot: 'Breakfast', lines: [] } as unknown as Usual;
}

function makeApi(server: { usuals: Usual[] }) {
  const gate: { usuals?: Promise<Usual[]> } = {};
  const api = {
    getUsuals: () => gate.usuals ?? Promise.resolve(server.usuals.map((u) => ({ ...u }))),
    upsertUsual: async (input: { id: string; name: string }) => usual(input.id, input.name),
  } as unknown as ForageApi;
  return { api, gate };
}

const names = () => heldUsuals.value.map((u) => u.name);
const kept = async () => {
  await Promise.resolve();
  return (JSON.parse(localStorage.getItem(KEY)!).usuals as Usual[]).map((u) => u.name);
};

beforeEach(() => {
  localStorage.clear();
  _resetEaten();
  _resetUsuals();
});
afterEach(() => {
  _resetEaten();
  _resetUsuals();
  localStorage.clear();
});

describe('a usual changed in the Library reaches the Eaten tab (#947)', () => {
  it('New usual is held at once, and kept on the device', async () => {
    const { api } = makeApi({ usuals: [usual('us_oat', 'Oatmeal')] });
    bindAccount(EMAIL);
    await loadDayUsuals(api);

    const made = await createUsual(api);

    expect(heldUsuals.value.some((u) => u.id === made.id && u.name === 'New usual')).toBe(true);
    expect(await kept()).toEqual(['Oatmeal', 'New usual']);
  });

  it('an edit (the editor’s save, or a combo saved as a usual) replaces the held copy at once', async () => {
    const { api } = makeApi({ usuals: [usual('us_oat', 'Oatmeal'), usual('us_yog', 'Yogurt bowl')] });
    bindAccount(EMAIL);
    await loadDayUsuals(api);

    keepUsual(usual('us_oat', 'Oatmeal, no fruit'));

    expect(names()).toEqual(['Yogurt bowl', 'Oatmeal, no fruit']);
    expect(usuals.value.map((u) => u.name)).toEqual(['Oatmeal, no fruit']);
    expect(await kept()).toEqual(['Yogurt bowl', 'Oatmeal, no fruit']);
  });

  it('a delete leaves the held usuals and the device copy, so a fresh start doesn’t bring it back', async () => {
    const { api } = makeApi({ usuals: [usual('us_oat', 'Oatmeal'), usual('us_yog', 'Yogurt bowl')] });
    bindAccount(EMAIL);
    await loadDayUsuals(api);

    dropUsual('us_yog');

    expect(names()).toEqual(['Oatmeal']);
    expect(await kept()).toEqual(['Oatmeal']);
    _resetEaten(); // a fresh start: memory gone, the device copy read back
    bindAccount(EMAIL);
    expect(names()).toEqual(['Oatmeal']);
  });

  it('a delete while a usuals read is out stays deleted when that answer lands', async () => {
    const server = { usuals: [usual('us_oat', 'Oatmeal'), usual('us_yog', 'Yogurt bowl')] };
    const { api, gate } = makeApi(server);
    bindAccount(EMAIL);
    await loadDayUsuals(api);

    let release!: (u: Usual[]) => void;
    gate.usuals = new Promise((r) => (release = r));
    const reading = loadDayUsuals(api);
    dropUsual('us_yog');
    release(server.usuals.map((u) => ({ ...u }))); // read before the delete
    await reading;

    expect(names()).toEqual(['Oatmeal']);
  });
});

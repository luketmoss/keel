// #881: each demo handler's write is visible to the matching read, at ?demo=true with no API.
import { describe, expect, it } from 'vitest';
import { createDemoApi } from './demo-api';
import { localDate } from '../cook/format';
import { addDays } from '../plan/dates';
import type { UsualInput } from '../api/types';

const today = localDate(new Date());
const yesterday = addDays(today, -1);

describe('the demo usuals (#881)', () => {
  it('getUsuals answers the three usuals with start nutrition and use counts', async () => {
    const api = createDemoApi();
    const list = await api.getUsuals();
    expect(list.map((u) => u.name).sort()).toEqual(['After dinner cereal', 'Oatmeal', 'Yogurt bowl']);
    for (const u of list) {
      expect(u.start.kcal).toBeGreaterThan(0);
      expect(u.start.partial).toBe(false);
      expect(u.used_count).toBeGreaterThan(0);
      expect(u.last_used).not.toBeNull();
    }
    expect((await api.getUsuals('After dinner')).map((u) => u.name)).toEqual(['After dinner cereal']);
    // Most recently used first, then by name.
    expect(list.map((u) => u.name)).toEqual(['After dinner cereal', 'Oatmeal', 'Yogurt bowl']);
  });

  it('a pick-one carries an amount per option', async () => {
    const api = createDemoApi();
    const cereal = (await api.getUsuals()).find((u) => u.name === 'After dinner cereal')!;
    const pick = cereal.lines[0];
    expect(pick.options!.map((o) => [o.qty, o.unit])).toEqual([
      [1.25, 'cup'],
      [1, 'cup'],
    ]);
    expect(pick.food_id).toBe('');
  });

  it('logUsual then getFoodLog shows the grouped entries for today', async () => {
    const api = createDemoApi();
    const oatmeal = (await api.getUsuals()).find((u) => u.name === 'Oatmeal')!;
    const before = (await api.getFoodLog(today, today)).length;
    const { entries, group_id } = await api.logUsual({
      usual_id: oatmeal.id,
      date: today,
      slot: 'Breakfast',
      picks: { L3: 'fd_demo_banana' },
    });
    expect(entries).toHaveLength(4);
    const log = await api.getFoodLog(today, today);
    expect(log).toHaveLength(before + 4);
    const mine = log.filter((e) => e.group_id === group_id);
    expect(mine.map((e) => e.usual_line_id)).toEqual(['L1', 'L2', 'L3', 'L4']);
    expect(mine.every((e) => e.group_name === 'Oatmeal' && e.usual_id === oatmeal.id)).toBe(true);
    // The pick logs at its own amount, and becomes the default.
    expect(mine[2]).toMatchObject({ food_id: 'fd_demo_banana', qty: 0.5, unit: 'medium' });
    const after = await api.getUsual(oatmeal.id);
    expect(after.lines[2].last_pick).toBe('fd_demo_banana');
    expect(after.used_count).toBe(oatmeal.used_count + 1);
    expect(after.last_used).toBe(today);
  });

  it('logUsual refuses a pick that is not an option, and a dry run writes nothing', async () => {
    const api = createDemoApi();
    const oatmeal = (await api.getUsuals()).find((u) => u.name === 'Oatmeal')!;
    const before = (await api.getFoodLog(today, today)).length;
    await expect(
      api.logUsual({ usual_id: oatmeal.id, date: today, slot: 'Breakfast', picks: { L3: 'fd_demo_oats' } }),
    ).rejects.toThrow(/picks\.L3/);
    const dry = await api.logUsual({ usual_id: oatmeal.id, date: today, slot: 'Breakfast' }, true);
    expect(dry.entries).toHaveLength(4);
    expect(await api.getFoodLog(today, today)).toHaveLength(before);
    expect((await api.getUsual(oatmeal.id)).used_count).toBe(oatmeal.used_count);
  });

  it('a swap is an edit that keeps the group, and shows in the swaps of its line', async () => {
    const api = createDemoApi();
    const oatmeal = (await api.getUsuals()).find((u) => u.name === 'Oatmeal')!;
    for (const date of [yesterday, today]) {
      const { entries } = await api.logUsual({ usual_id: oatmeal.id, date, slot: 'Breakfast' });
      const swapped = await api.updateLogEntry(entries[1].id, { food_id: 'fd_demo_pb', qty: 1, unit: 'tbsp' });
      expect(swapped).toMatchObject({
        food_id: 'fd_demo_pb',
        group_id: entries[1].group_id,
        group_name: 'Oatmeal',
        usual_id: oatmeal.id,
        usual_line_id: 'L2',
        grams: 16,
      });
    }
    const after = await api.getUsual(oatmeal.id);
    expect(after.lines[1].swaps).toEqual([{ food_id: 'fd_demo_pb', count: 2 }]);
    expect(after.used_count).toBe(oatmeal.used_count + 2);
  });

  it("copyMeal copies yesterday's breakfast into today, after what is there", async () => {
    const api = createDemoApi();
    const yest = (await api.getFoodLog(yesterday, yesterday)).filter((e) => e.slot === 'Breakfast');
    expect(yest.length).toBeGreaterThan(0);
    const there = (await api.getFoodLog(today, today)).filter((e) => e.slot === 'Breakfast').length;
    const copied = await api.copyMeal({
      from_date: yesterday,
      from_slot: 'Breakfast',
      to_date: today,
      to_slot: 'Breakfast',
    });
    expect(copied).toHaveLength(yest.length);
    expect(copied.map((e) => [e.food_id, e.qty, e.unit])).toEqual(yest.map((e) => [e.food_id, e.qty, e.unit]));
    const now = (await api.getFoodLog(today, today)).filter((e) => e.slot === 'Breakfast');
    expect(now).toHaveLength(there + yest.length);
    expect(now.slice(0, there).map((e) => e.id)).not.toContain(copied[0].id);
  });

  it('copyMeal copies a group as a new group, and refuses a future day and an empty meal', async () => {
    const api = createDemoApi();
    const oatmeal = (await api.getUsuals()).find((u) => u.name === 'Oatmeal')!;
    const { group_id } = await api.logUsual({ usual_id: oatmeal.id, date: yesterday, slot: 'Lunch' });
    const copied = await api.copyMeal({
      from_date: yesterday,
      from_slot: 'Lunch',
      group_id,
      to_date: today,
      to_slot: 'Snacks',
    });
    expect(copied).toHaveLength(4);
    expect(new Set(copied.map((e) => e.group_id)).size).toBe(1);
    expect(copied[0].group_id).not.toBe(group_id);
    expect(copied[0].group_name).toBe('Oatmeal');
    await expect(
      api.copyMeal({ from_date: yesterday, from_slot: 'Lunch', to_date: addDays(today, 1), to_slot: 'Lunch' }),
    ).rejects.toThrow();
    await expect(
      api.copyMeal({ from_date: addDays(today, -30), from_slot: 'Lunch', to_date: today, to_slot: 'Lunch' }),
    ).rejects.toThrow();
  });

  it('logMeal writes a food, a recipe and a group in order, once per id', async () => {
    const api = createDemoApi();
    const g = { key: 'k', name: 'Snack' };
    const input = {
      date: today,
      slot: 'Snacks' as const,
      items: [
        { id: 'lg_m1', food_id: 'fd_demo_apple', qty: 1, unit: 'medium' },
        { id: 'lg_m2', food_id: 'fd_demo_apple', qty: 1, unit: 'medium', group: g },
        { id: 'lg_m3', food_id: 'fd_demo_pb', qty: 1, unit: 'tbsp', group: g },
      ],
    };
    const before = (await api.getFoodLog(today, today)).length;
    const dry = await api.logMeal(input, true);
    expect(dry.entries).toHaveLength(3);
    expect((await api.getFoodLog(today, today)).length).toBe(before);
    const first = await api.logMeal(input);
    expect(first.entries.map((e) => e.id)).toEqual(['lg_m1', 'lg_m2', 'lg_m3']);
    expect(first.entries.map((e) => e.group_id || '')).toEqual(['', first.group_ids.k, first.group_ids.k]);
    const again = await api.logMeal(input);
    expect(again.entries.map((e) => e.id)).toEqual(['lg_m1', 'lg_m2', 'lg_m3']);
    expect(again.group_ids).toEqual(first.group_ids);
    expect((await api.getFoodLog(today, today)).length).toBe(before + 3);
    await expect(
      api.logMeal({ ...input, items: [input.items[0], { food_id: 'fd_demo_apple', qty: 1, unit: 'bucket' }] }),
    ).rejects.toThrow(/items\[2\]/);
  });

  it('logGroup, setLogGroup and deleteLogEntries', async () => {
    const api = createDemoApi();
    const { entries, group_id } = await api.logGroup({
      date: today,
      slot: 'Snacks',
      name: 'Apple + Peanut butter',
      items: [
        { food_id: 'fd_demo_apple', qty: 1, unit: 'medium' },
        { food_id: 'fd_demo_pb', qty: 1, unit: 'tbsp' },
      ],
    });
    expect(entries.map((e) => e.group_id)).toEqual([group_id, group_id]);
    expect(entries[0].usual_id).toBe('');
    const ids = entries.map((e) => e.id);
    const off = await api.setLogGroup(ids, null);
    expect(off.every((e) => e.group_id === '' && e.group_name === '')).toBe(true);
    const on = await api.setLogGroup(ids, { name: 'Snack', usual_id: 'us_demo_oatmeal' });
    expect(on[0].group_name).toBe('Snack');
    expect(on[0].usual_id).toBe('us_demo_oatmeal');
    // Entries from two meals can't be grouped together.
    const other = await api.logEntry({ date: today, slot: 'Lunch', food_id: 'fd_demo_apple', qty: 1, unit: 'medium' });
    await expect(api.setLogGroup([ids[0], other.id], null)).rejects.toThrow(/same meal/);
    // All or none: one missing id deletes nothing, and names itself.
    await expect(api.deleteLogEntries([ids[0], 'lg_nope'])).rejects.toThrow(/lg_nope/);
    expect((await api.getFoodLog(today, today)).some((e) => e.id === ids[0])).toBe(true);
    await api.deleteLogEntries(ids);
    expect((await api.getFoodLog(today, today)).some((e) => ids.includes(e.id))).toBe(false);
  });

  it('upsertUsual creates a usual, replaces it keeping line ids, and deleteUsual removes it', async () => {
    const api = createDemoApi();
    const input: UsualInput = {
      name: 'Toast',
      slot: 'Breakfast',
      lines: [
        { food_id: 'fd_demo_bread', qty: 2, unit: 'slice' },
        {
          options: [
            { food_id: 'fd_demo_pb', qty: 1, unit: 'tbsp' },
            { food_id: 'fd_demo_almond', qty: 0.5, unit: 'serving' },
          ],
        },
      ],
    };
    const made = await api.upsertUsual(input);
    expect(made.id).toMatch(/^us_/);
    expect(made.lines.map((l) => l.line_id)).toEqual(['L1', 'L2']);
    expect(made.used_count).toBe(0);
    expect(made.last_used).toBeNull();
    expect((await api.getUsuals()).map((u) => u.id)).toContain(made.id);
    const next = await api.upsertUsual({
      id: made.id,
      name: 'Toast and jam',
      slot: 'Breakfast',
      lines: [
        { line_id: 'L2', ...input.lines[1] },
        { food_id: 'fd_demo_banana', qty: 1, unit: 'medium' },
      ],
    });
    expect(next.lines.map((l) => l.line_id)).toEqual(['L2', 'L3']);
    expect((await api.getUsual(made.id)).name).toBe('Toast and jam');
    await api.deleteUsual(made.id);
    expect((await api.getUsuals()).map((u) => u.id)).not.toContain(made.id);
    await expect(api.getUsual(made.id)).rejects.toThrow();
  });

  it('upsertUsual refuses what the API refuses, naming the field', async () => {
    const api = createDemoApi();
    const line = { food_id: 'fd_demo_bread', qty: 2, unit: 'slice' };
    const bad = (u: Partial<UsualInput>) => api.upsertUsual({ name: 'X', slot: 'Lunch', lines: [line], ...u });
    await expect(bad({ name: '  ' })).rejects.toThrow(/name/);
    await expect(bad({ lines: [{ ...line, qty: 0 }] })).rejects.toThrow(/qty/);
    await expect(bad({ lines: [{ ...line, unit: 'cup' }] })).rejects.toThrow(/unit/);
    await expect(bad({ lines: [{ ...line, food_id: 'fd_nope' }] })).rejects.toThrow(/food_id/);
    const one = { food_id: 'fd_demo_pb', qty: 1, unit: 'tbsp' };
    await expect(bad({ lines: [{ options: [one] }] })).rejects.toThrow(/options/);
    await expect(bad({ lines: [{ options: [one, one] }] })).rejects.toThrow(/options/);
    const two = { food_id: 'fd_demo_almond', qty: 1, unit: 'serving' };
    await expect(bad({ lines: [{ options: [one, two], last_pick: 'fd_demo_bread' }] })).rejects.toThrow(/last_pick/);
    expect((await api.getUsuals()).length).toBe(3);
  });

  it('deleteUsual keeps its logged entries and their group, and a food a usual uses cannot be deleted', async () => {
    const api = createDemoApi();
    const oatmeal = (await api.getUsuals()).find((u) => u.name === 'Oatmeal')!;
    const { group_id } = await api.logUsual({ usual_id: oatmeal.id, date: today, slot: 'Breakfast' });
    await expect(api.deleteFood('fd_demo_oats')).rejects.toMatchObject({ code: 'in_use' });
    await api.deleteUsual(oatmeal.id);
    const kept = (await api.getFoodLog(today, today)).filter((e) => e.group_id === group_id);
    expect(kept).toHaveLength(4);
    expect(kept.every((e) => e.usual_id === '' && e.group_name === 'Oatmeal')).toBe(true);
  });

  it('getCombos answers the three combos, and hideCombo removes one from the next read', async () => {
    const api = createDemoApi();
    const { combos, stats } = await api.getCombos();
    expect(combos.map((c) => c.name)).toEqual([
      'Plain yogurt + Granola',
      'Sourdough bread + Deli turkey + Cheddar / Swiss cheese',
      'Apple + Peanut butter',
    ]);
    expect(stats.returned).toBe(3);
    expect(combos[1].lines[2]).toMatchObject({ default: 'fd_demo_cheddar' });
    expect((await api.getCombos({ slot: 'Snacks' })).combos[0].name).toBe('Apple + Peanut butter');
    await api.hideCombo(combos[0].key);
    const after = await api.getCombos();
    expect(after.combos.map((c) => c.key)).not.toContain(combos[0].key);
    expect(after.stats.hidden).toBe(1);
    await api.unhideCombos([combos[0].key]);
    expect((await api.getCombos()).combos).toHaveLength(3);
    await api.hideCombo(combos[1].key);
    await api.hideCombo(combos[2].key);
    await api.unhideCombos();
    expect((await api.getCombos()).combos).toHaveLength(3);
  });

  it('a combo a usual covers is not offered, and comes back when that usual is deleted', async () => {
    const api = createDemoApi();
    expect((await api.getCombos()).stats.covered).toBe(1);
    await api.deleteUsual('us_demo_oatmeal');
    const after = await api.getCombos();
    expect(after.combos).toHaveLength(4);
    expect(after.stats.covered).toBe(0);
  });

  it('short_name is trimmed, limited to 20 characters, matched by search, and blank means none', async () => {
    const api = createDemoApi();
    const saved = await api.saveFood({ id: 'fd_demo_kpbcrunchy', short_name: '  Crunchy PB ' });
    expect(saved.short_name).toBe('Crunchy PB');
    expect((await api.getFoods('crunchy pb')).map((f) => f.id)).toContain('fd_demo_kpbcrunchy');
    await expect(api.saveFood({ id: 'fd_demo_kpbcrunchy', short_name: 'x'.repeat(21) })).rejects.toThrow(/short_name/);
    expect((await api.saveFood({ id: 'fd_demo_kpbcrunchy', short_name: '   ' })).short_name).toBe('');
  });
});

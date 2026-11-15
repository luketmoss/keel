// #942: optional usual lines on the frontend: comparing a group with its usual, the tray's chips, the editor's
// How often draft and the Usuals list row, and the demo's Side salad.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import type { Food, FoodLogEntry, Usual } from '../api/types';
import { createDemoApi } from '../demo/demo-api';
import { draftFrom, foodsInShort, toInput } from '../library/usuals-store';
import { liveItems, mealInput, removeItem, toggleChip, trayTotals, usualItems, type TrayItem } from './tray';
import { TrayView } from './tray-view';
import { groupChanges, updatedUsual } from './usual-group';

const food = (id: string, name: string): Food =>
  ({
    id,
    name,
    short_name: '',
    kind: 'ingredient',
    brand: '',
    kcal_100g: 100,
    protein_100g: 1,
    carbs_100g: 1,
    fat_100g: 1,
    servings_json: [{ name: 'cup', g: 100 }],
  }) as Food;

const foods = new Map(['a', 'b', 'c', 'd', 'e', 'z'].map((id) => [id, food(id, id.toUpperCase())]));

const line = (over: Partial<Usual['lines'][number]>): Usual['lines'][number] => ({
  line_id: 'L1',
  position: 1,
  food_id: '',
  qty: null,
  unit: '',
  options: null,
  last_pick: '',
  optional: '',
  swaps: [],
  ...over,
});

// A every time, B usually in, C sometimes, and a pick-one of D / E that is usually in.
const usual: Usual = {
  id: 'us_1',
  name: 'Salad',
  slot: 'Lunch',
  created: '',
  updated: '',
  used_count: 1,
  last_used: '2026-11-01',
  start: { kcal: 1, protein_g: 1, carbs_g: 1, fat_g: 1, partial: false } as Usual['start'],
  lines: [
    line({ line_id: 'L1', food_id: 'a', qty: 1, unit: 'cup' }),
    line({ line_id: 'L2', position: 2, food_id: 'b', qty: 1, unit: 'cup', optional: 'in' }),
    line({ line_id: 'L3', position: 3, food_id: 'c', qty: 1, unit: 'cup', optional: 'out' }),
    line({
      line_id: 'L4',
      position: 4,
      options: [
        { food_id: 'd', qty: 1, unit: 'cup' },
        { food_id: 'e', qty: 2, unit: 'cup' },
      ],
      last_pick: 'e',
      optional: 'in',
    }),
  ],
};

const entry = (over: Partial<FoodLogEntry>): FoodLogEntry =>
  ({
    id: 'e',
    date: '2026-11-02',
    slot: 'Lunch',
    food_id: '',
    recipe_id: '',
    qty: 1,
    unit: 'cup',
    grams: 100,
    kcal: 100,
    protein_g: 1,
    carbs_g: 1,
    fat_g: 1,
    partial: false,
    source: 'app',
    logged_at: '',
    created: '',
    updated: '',
    group_id: 'gr_1',
    group_name: 'Salad',
    usual_id: 'us_1',
    ...over,
  }) as FoodLogEntry;

describe('comparing a group with its usual', () => {
  const only = [entry({ id: 'x1', food_id: 'a', usual_line_id: 'L1' })];

  it('does not report a missing optional line, but still reports a missing every-time one', () => {
    expect(groupChanges(only, usual, foods)).toEqual([]);
    expect(groupChanges([], usual, foods)).toEqual(['A removed']);
  });

  it('does not report a sometimes line that was logged', () => {
    const logged = [...only, entry({ id: 'x2', food_id: 'c', usual_line_id: 'L3' })];
    expect(groupChanges(logged, usual, foods)).toEqual([]);
  });

  it('does not report a second option of a pick-one as added, but does report any other extra food', () => {
    const two = [
      ...only,
      entry({ id: 'x4', food_id: 'e', qty: 2, usual_line_id: 'L4' }),
      entry({ id: 'x5', food_id: 'd', qty: 1, usual_line_id: 'L4' }),
    ];
    expect(groupChanges(two, usual, foods)).toEqual([]);
    expect(groupChanges([...two, entry({ id: 'x6', food_id: 'z' })], usual, foods)).toEqual(['Z added']);
  });

  it('Update the usual keeps optional lines that were not logged, with their setting, options and last pick', () => {
    const saved = updatedUsual(only, usual);
    expect(saved.lines.map((l) => l.line_id)).toEqual(['L1', 'L2', 'L3', 'L4']);
    expect(saved.lines[1]).toMatchObject({ food_id: 'b', optional: 'in' });
    expect(saved.lines[2]).toMatchObject({ food_id: 'c', optional: 'out' });
    expect(saved.lines[3]).toMatchObject({ last_pick: 'e', optional: 'in' });
    expect(saved.lines[3].options).toHaveLength(2);
    expect(saved.lines[0]).not.toHaveProperty('optional');
  });

  it('Update the usual keeps a logged line’s setting, makes no line of a second option, and drops an every-time line with no entry', () => {
    const logged = [
      entry({ id: 'x2', food_id: 'b', usual_line_id: 'L2' }),
      entry({ id: 'x4', food_id: 'e', qty: 2, usual_line_id: 'L4' }),
      entry({ id: 'x5', food_id: 'd', qty: 1, usual_line_id: 'L4' }),
    ];
    const saved = updatedUsual(logged, usual);
    expect(saved.lines.map((l) => l.line_id)).toEqual(['L2', 'L3', 'L4']);
    expect(saved.lines[0]).toMatchObject({ optional: 'in' });
    expect(saved.lines.filter((l) => !l.line_id)).toHaveLength(0);
  });
});

describe('the tray', () => {
  const items = () => usualItems(usual, foods);
  const lineIds = (made: TrayItem[]) =>
    mealInput('2026-11-02', 'Lunch', made).items.map(
      (i) => (i as { group?: { usual_line_id?: string } }).group?.usual_line_id,
    );

  it('adds every-time and usually lines on, and a sometimes line off', () => {
    const made = items();
    expect(made.map((i) => !!i.off)).toEqual([false, false, true, false]);
    expect(liveItems(made)).toHaveLength(3);
    expect(trayTotals(made).count).toBe(3);
    expect(lineIds(made)).toEqual(['L1', 'L2', 'L4']);
  });

  it('a chip turns an item on at its home amount and off again; saving sends only the ones that are on', () => {
    let made = items();
    made = toggleChip(made, made[2].id);
    expect(liveItems(made)).toHaveLength(4);
    made = toggleChip(made, made[1].id);
    expect(lineIds(made)).toEqual(['L1', 'L3', 'L4']);
  });

  it('a pick-one comes back at its last pick, not the option chosen before it went off', () => {
    let made = items();
    const pick = made[3];
    made = made.map((i) =>
      i.id === pick.id ? { ...i, target: { kind: 'food' as const, food: foods.get('d')! }, qty: 1 } : i,
    );
    made = toggleChip(toggleChip(made, pick.id), pick.id);
    const back = made[3];
    expect(back.target.kind === 'food' && back.target.food.id).toBe('e');
    expect(back.qty).toBe(2);
  });

  it('removing an optional item turns it off and keeps its chip; an every-time item is removed', () => {
    const made = items();
    const off = removeItem(made, made[1].id);
    expect(off.map((i) => i.id)).toEqual(made.map((i) => i.id));
    expect(off[1].off).toBe(true);
    expect(removeItem(made, made[0].id)).toHaveLength(3);
  });

  function view(initial: TrayItem[], full = false) {
    const toggled: string[] = [];
    render(
      <TrayView
        items={initial}
        meal="lunch"
        foods={foods}
        open={null}
        pickOpen={null}
        fresh={null}
        onOpen={() => {}}
        onPickOpen={() => {}}
        onFreshDone={() => {}}
        onAmount={() => {}}
        onPick={() => {}}
        onRemove={() => {}}
        onRemoveGroup={() => {}}
        onToggle={(id) => toggled.push(id)}
        full={full}
      />,
    );
    return toggled;
  }

  afterEach(cleanup);

  it('shows a chip per optional line, on for usually and off for sometimes, and rows for the items that are on', () => {
    view(items());
    const group = screen.getByRole('group', { name: 'Optional in Salad' });
    const chips = within(group).getAllByTestId('tray-chip');
    expect(chips.map((c) => c.textContent)).toEqual(['✓ B', '+ C', '✓ E']);
    expect(chips.map((c) => c.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'true']);
    expect(screen.getAllByTestId('tray-item')).toHaveLength(3);
    expect(screen.getByTestId('tray-total').textContent).toMatch(/^3/);
  });

  it('tapping a chip asks to toggle that line; an off chip is disabled when the tray is full', () => {
    const toggled = view(items());
    fireEvent.click(screen.getAllByTestId('tray-chip')[1]);
    expect(toggled).toHaveLength(1);
    cleanup();
    const full = view(items(), true);
    const chips = screen.getAllByTestId('tray-chip');
    expect(chips[1].getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(chips[1]); // off and full: nothing
    fireEvent.click(chips[0]); // on: still works
    expect(full).toHaveLength(1);
  });

  it('a group whose items are all off still shows its heading and chip row, with a count of 0', () => {
    const off = items()
      .filter((i) => i.optional)
      .map((i) => ({ ...i, off: true }));
    view(off);
    expect(screen.getByTestId('tray-group-name').textContent).toBe('Salad');
    expect(screen.queryAllByTestId('tray-item')).toHaveLength(0);
    expect(screen.getAllByTestId('tray-chip')).toHaveLength(3);
    expect(screen.getByTestId('tray-total').textContent).toBe('0');
  });

  it('a usual with no optional lines has no chip row', () => {
    const plain: Usual = { ...usual, lines: [usual.lines[0]] };
    view(usualItems(plain, foods));
    expect(screen.queryByTestId('tray-optional')).toBeNull();
  });
});

describe('the Usuals list and the editor draft', () => {
  it('lists sometimes lines after · sometimes, and leaves them out of the main run', () => {
    expect(foodsInShort(usual, foods)).toBe('A · B · D / E · sometimes C');
  });

  it('the draft keeps each line’s How often and saves it; a blank one is not sent', () => {
    const input = toInput('us_1', draftFrom(usual));
    expect(input.lines.map((l) => l.optional)).toEqual([undefined, 'in', 'out', 'in']);
  });
});

describe('the demo API', () => {
  it('has a Side salad with optional lines whose start leaves the sometimes lines out', async () => {
    const api = createDemoApi();
    const salad = (await api.getUsuals()).find((u) => u.name === 'Side salad')!;
    expect(salad.lines.map((l) => l.optional)).toEqual(['', 'in', 'out', 'out', 'in']);
    const full = await api.upsertUsual({
      id: salad.id,
      name: salad.name,
      slot: salad.slot,
      lines: salad.lines.map((l) =>
        l.options
          ? { line_id: l.line_id, options: l.options, last_pick: l.last_pick }
          : { line_id: l.line_id, food_id: l.food_id, qty: l.qty ?? 1, unit: l.unit },
      ),
    });
    expect(full.start.kcal!).toBeGreaterThan(salad.start.kcal!);
  });

  it('logUsual leaves out sometimes lines, takes null and a line’s own food, and refuses the rest', async () => {
    const api = createDemoApi();
    const salad = (await api.getUsuals()).find((u) => u.name === 'Side salad')!;
    const date = '2026-11-01';
    const plain = await api.logUsual({ usual_id: salad.id, date, slot: 'Lunch' }, true);
    expect(plain.entries.map((e) => e.usual_line_id)).toEqual(['L1', 'L2', 'L5']);
    const left = await api.logUsual({ usual_id: salad.id, date, slot: 'Lunch', picks: { L2: null, L5: null } }, true);
    expect(left.entries.map((e) => e.usual_line_id)).toEqual(['L1']);
    const brought = await api.logUsual(
      { usual_id: salad.id, date, slot: 'Lunch', picks: { L3: 'fd_demo_feta' } },
      true,
    );
    expect(brought.entries.map((e) => e.usual_line_id)).toEqual(['L1', 'L2', 'L3', 'L5']);
    await expect(api.logUsual({ usual_id: salad.id, date, slot: 'Lunch', picks: { L1: null } })).rejects.toThrow(/L1/);
    await expect(
      api.upsertUsual({
        name: 'X',
        slot: 'Lunch',
        lines: [{ food_id: 'fd_demo_feta', qty: 1, unit: 'oz', optional: 'x' as 'in' }],
      }),
    ).rejects.toThrow(/optional/);
  });
});

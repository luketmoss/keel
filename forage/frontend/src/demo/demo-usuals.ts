// #881's demo usuals, groups, copy and combos (epic #876): the actions #877, #878 and #879 define, in memory. The
// rules here are a small stand-in for the API's `usuals.js`, `groups.js` and `combos.js`, enough for the app to be
// used at ?demo=true; the live app computes none of it. The combos are fixed, not detected.
import { ApiError, type ForageApi } from '../api/client';
import type {
  Combo,
  ComboLine,
  CombosResult,
  Food,
  FoodLogEntry,
  LogEntryInput,
  LogGroupResult,
  PerServing,
  Slot,
  Usual,
  UsualInput,
  UsualLine,
  UsualOption,
} from '../api/types';
import { EXTRA_KEYS, SLOTS } from '../api/types';
import { addDays } from '../plan/dates';
import { DEMO_COMBOS, DEMO_USUALS } from './demo-usuals-data';

/** The four FoodLog columns #878 adds. */
export interface GroupFields {
  group_id: string;
  group_name: string;
  usual_id: string;
  usual_line_id: string;
}

type Snapshot = Pick<
  FoodLogEntry,
  'kcal' | 'protein_g' | 'carbs_g' | 'fat_g' | 'partial' | (typeof EXTRA_KEYS)[number]
>;

interface StoredLine {
  line_id: string;
  food_id: string;
  qty: number | null;
  unit: string;
  options: UsualOption[] | null;
  last_pick: string;
}

interface StoredUsual {
  id: string;
  name: string;
  slot: Slot;
  created: string;
  updated: string;
  /** Uses before this session, which the session's own logs add to. */
  base_used: number;
  base_last_used: string | null;
  lines: StoredLine[];
}

interface Context {
  now: number;
  today: string;
  foods: Food[];
  log: FoodLogEntry[];
  nextId: (prefix: string) => string;
  snapshotOf: (input: LogEntryInput) => Snapshot;
  writeLog: (input: LogEntryInput, dryRun: boolean, keep?: FoodLogEntry, group?: GroupFields) => FoodLogEntry;
}

export type DemoUsuals = Pick<
  ForageApi,
  | 'getUsuals'
  | 'getUsual'
  | 'upsertUsual'
  | 'deleteUsual'
  | 'logUsual'
  | 'logGroup'
  | 'copyMeal'
  | 'setLogGroup'
  | 'deleteLogEntries'
  | 'getCombos'
  | 'hideCombo'
  | 'unhideCombos'
> & {
  /** The usuals whose lines or options use a food, for `deleteFood`'s refusal. */
  usualsUsing: (foodId: string) => { id: string; name: string }[];
};

const round1 = (n: number) => Math.round(n * 10) / 10;
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

export function createDemoUsuals(ctx: Context): DemoUsuals {
  const { now, today, foods, log, nextId } = ctx;
  const stamp = new Date(now).toISOString();
  const dateAgo = (n: number) => addDays(today, -n);

  const usuals: StoredUsual[] = DEMO_USUALS.map((d) => ({
    id: d.id,
    name: d.name,
    slot: d.slot,
    created: stamp,
    updated: stamp,
    base_used: d.used,
    base_last_used: dateAgo(d.last_used_days_ago),
    lines: d.lines.map((l, i) =>
      'options' in l
        ? { line_id: `L${i + 1}`, food_id: '', qty: null, unit: '', options: clone(l.options), last_pick: l.last_pick }
        : { line_id: `L${i + 1}`, food_id: l.food_id, qty: l.qty, unit: l.unit, options: null, last_pick: '' },
    ),
  }));
  const hidden = new Set<string>();

  const findFood = (id: string) => foods.find((f) => f.id === id);
  const findUsual = (id: string) => {
    const u = usuals.find((x) => x.id === id);
    if (!u) throw new ApiError(`Usual "${id}" not found`, 'not_found');
    return u;
  };

  /** What a line logs: its food and amount, or the picked option (else `last_pick`, else the first). */
  function chosen(line: StoredLine, pick?: string) {
    if (!line.options) return { food_id: line.food_id, qty: line.qty!, unit: line.unit };
    return line.options.find((o) => o.food_id === (pick || line.last_pick)) ?? line.options[0];
  }

  /** The usual as it starts: the nutrition of what each line would log now, summed by the API's partial rule. */
  function startOf(u: StoredUsual): Usual['start'] {
    const snaps = u.lines.map((l) => {
      const a = chosen(l);
      return ctx.snapshotOf({ date: today, slot: u.slot, food_id: a.food_id, qty: a.qty, unit: a.unit });
    });
    const sum = (k: 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g' | (typeof EXTRA_KEYS)[number]) => {
      const vals = snaps.map((s) => s[k]).filter((v): v is number => typeof v === 'number');
      return vals.length ? round1(vals.reduce((a, b) => a + b, 0)) : null;
    };
    const per: PerServing = {
      kcal: sum('kcal'),
      protein_g: sum('protein_g'),
      carbs_g: sum('carbs_g'),
      fat_g: sum('fat_g'),
      ...Object.fromEntries(EXTRA_KEYS.map((k) => [k, sum(k)])),
    };
    return { ...per, partial: snaps.some((s) => s.partial || s.kcal === null) };
  }

  function view(u: StoredUsual): Usual {
    const mine = log.filter((e) => e.usual_id === u.id);
    const dates = mine.map((e) => e.date);
    const last = [...dates, ...(u.base_last_used ? [u.base_last_used] : [])].sort().pop() ?? null;
    const lines: UsualLine[] = u.lines.map((l, i) => {
      const known = new Set(l.options ? l.options.map((o) => o.food_id) : [l.food_id]);
      const counts = new Map<string, number>();
      for (const e of mine) {
        if (e.usual_line_id === l.line_id && !known.has(e.food_id))
          counts.set(e.food_id, (counts.get(e.food_id) ?? 0) + 1);
      }
      const swaps = [...counts].map(([food_id, count]) => ({ food_id, count })).sort((a, b) => b.count - a.count);
      return { ...clone(l), position: i + 1, swaps };
    });
    return {
      id: u.id,
      name: u.name,
      slot: u.slot,
      created: u.created,
      updated: u.updated,
      lines,
      used_count: u.base_used + new Set(mine.map((e) => e.group_id)).size,
      last_used: last,
      start: startOf(u),
    };
  }

  const byRecent = (a: Usual, b: Usual) => {
    if (a.last_used !== b.last_used) {
      if (a.last_used === null || b.last_used === null) return a.last_used === null ? 1 : -1;
      return a.last_used < b.last_used ? 1 : -1;
    }
    return a.name.localeCompare(b.name);
  };

  /** upsertUsual's refusals, each naming the field. */
  function checkAmount(where: string, a: { food_id?: string; qty?: number; unit?: string }) {
    const food = a.food_id ? findFood(a.food_id) : undefined;
    if (!food) throw new ApiError(`${where}: food_id "${a.food_id ?? ''}" is not a food`);
    if (typeof a.qty !== 'number' || !(a.qty > 0)) throw new ApiError(`${where}: qty must be greater than 0`);
    const unit = a.unit ?? '';
    if (unit !== 'g' && !(food.servings_json ?? []).some((w) => w.name === unit)) {
      throw new ApiError(`${where}: unit "${unit}" is not one of ${food.name}'s servings, or g`);
    }
  }

  function storedLines(input: UsualInput, was?: StoredUsual): StoredLine[] {
    let top = Math.max(0, ...(was?.lines ?? []).map((l) => Number(l.line_id.slice(1)) || 0));
    for (const l of input.lines) if (l.line_id) top = Math.max(top, Number(l.line_id.slice(1)) || 0);
    return input.lines.map((l, i) => {
      const where = `lines[${i}]`;
      const line_id = l.line_id || `L${++top}`;
      if (l.options) {
        if (l.options.length < 2 || l.options.length > 12) {
          throw new ApiError(`${where}.options: a pick-one has 2 to 12 options`);
        }
        if (new Set(l.options.map((o) => o.food_id)).size !== l.options.length) {
          throw new ApiError(`${where}.options: each food can appear once`);
        }
        l.options.forEach((o, j) => checkAmount(`${where}.options[${j}]`, o));
        if (l.last_pick && !l.options.some((o) => o.food_id === l.last_pick)) {
          throw new ApiError(`${where}.last_pick: not one of the options`);
        }
        return { line_id, food_id: '', qty: null, unit: '', options: clone(l.options), last_pick: l.last_pick ?? '' };
      }
      checkAmount(where, l);
      return { line_id, food_id: l.food_id!, qty: l.qty!, unit: l.unit!, options: null, last_pick: '' };
    });
  }

  const asInput = (e: FoodLogEntry, id: string, date: string, slot: Slot): LogEntryInput =>
    e.recipe_id
      ? { id, date, slot, recipe_id: e.recipe_id, qty: e.qty, unit: 'serving' }
      : { id, date, slot, food_id: e.food_id, qty: e.qty, unit: e.unit };

  /** Validates every entry as a dry run, then writes them, so a refusal leaves nothing behind. */
  function writeAll(rows: { input: LogEntryInput; group: GroupFields | undefined }[], dryRun: boolean): FoodLogEntry[] {
    const dry = rows.map((r) => ({ ...ctx.writeLog(r.input, true, undefined, r.group) }));
    if (dryRun) return dry;
    return rows.map((r) => ctx.writeLog(r.input, false, undefined, r.group));
  }

  const entriesOf = (ids: string[]) => {
    const missing = ids.find((id) => !log.some((e) => e.id === id));
    if (missing) throw new ApiError(`Log entry "${missing}" not found`);
    return ids.map((id) => log.find((e) => e.id === id)!);
  };

  const comboFoods = (c: { lines: ComboLine[] | DemoComboLine[] }) =>
    (c.lines as DemoComboLine[]).flatMap((l) => ('options' in l ? l.options.map((o) => o.food_id) : [l.food_id]));
  type DemoComboLine = (typeof DEMO_COMBOS)[number]['lines'][number];

  return {
    getUsuals: async (slot) =>
      usuals
        .filter((u) => !slot || u.slot === slot)
        .map(view)
        .sort(byRecent),
    getUsual: async (id) => view(findUsual(id)),
    upsertUsual: async (input) => {
      const name = (input.name ?? '').trim();
      if (!name) throw new ApiError('name is required');
      if (name.length > 120) throw new ApiError('name is over 120 characters');
      if (!SLOTS.includes(input.slot)) throw new ApiError(`slot "${input.slot}" is not a meal`);
      const was = input.id ? usuals.find((u) => u.id === input.id) : undefined;
      const lines = storedLines(input, was);
      const at = new Date().toISOString();
      if (was) Object.assign(was, { name, slot: input.slot, lines, updated: at });
      else {
        usuals.push({
          id: input.id || nextId('us'),
          name,
          slot: input.slot,
          created: at,
          updated: at,
          base_used: 0,
          base_last_used: null,
          lines,
        });
      }
      return view(was ?? usuals[usuals.length - 1]);
    },
    deleteUsual: async (id) => {
      usuals.splice(usuals.indexOf(findUsual(id)), 1);
      // The entries stay, with their group; only the link to the usual goes.
      for (const e of log) if (e.usual_id === id) Object.assign(e, { usual_id: '', usual_line_id: '' });
    },
    logUsual: async (input, dryRun = false): Promise<LogGroupResult> => {
      const u = findUsual(input.usual_id);
      if (!u.lines.length) throw new ApiError(`Usual "${u.name}" has no lines`);
      const picks = input.picks ?? {};
      for (const [lineId, foodId] of Object.entries(picks)) {
        const line = u.lines.find((l) => l.line_id === lineId);
        if (!line?.options?.some((o) => o.food_id === foodId)) {
          throw new ApiError(`picks.${lineId}: "${foodId}" is not one of that line's options`);
        }
      }
      const group_id = nextId('gr');
      const rows = u.lines.map((line) => {
        const a = chosen(line, picks[line.line_id]);
        return {
          input: { id: nextId('lg'), date: input.date, slot: input.slot, ...a } as LogEntryInput,
          group: { group_id, group_name: u.name, usual_id: u.id, usual_line_id: line.line_id },
        };
      });
      const entries = writeAll(rows, dryRun);
      if (!dryRun) {
        for (const line of u.lines) {
          if (line.options) line.last_pick = chosen(line, picks[line.line_id]).food_id;
        }
      }
      return clone({ entries, group_id });
    },
    logGroup: async (input, dryRun = false): Promise<LogGroupResult> => {
      const name = (input.name ?? '').trim();
      if (!name) throw new ApiError('name is required');
      if (name.length > 120) throw new ApiError('name is over 120 characters');
      if (input.items.length < 1 || input.items.length > 30) throw new ApiError('items: 1 to 30 foods');
      const group_id = nextId('gr');
      const rows = input.items.map((it) => ({
        input: { id: nextId('lg'), date: input.date, slot: input.slot, ...it } as LogEntryInput,
        group: { group_id, group_name: name, usual_id: '', usual_line_id: '' },
      }));
      return clone({ entries: writeAll(rows, dryRun), group_id });
    },
    copyMeal: async (input) => {
      if (input.to_date > today) throw new ApiError('A meal can only be copied to a day up to today');
      const source = log
        .filter(
          (e) =>
            e.date === input.from_date &&
            e.slot === input.from_slot &&
            (!input.group_id || e.group_id === input.group_id),
        )
        .sort((a, b) => a.logged_at.localeCompare(b.logged_at));
      if (!source.length) throw new ApiError('There is nothing in that meal to copy');
      // Each source group becomes one new group; the numbers are worked out again from the foods as they are now.
      const regroup = new Map<string, string>();
      const rows = source.map((e) => {
        let group: GroupFields | undefined;
        if (e.group_id) {
          if (!regroup.has(e.group_id)) regroup.set(e.group_id, nextId('gr'));
          group = {
            group_id: regroup.get(e.group_id)!,
            group_name: e.group_name ?? '',
            usual_id: e.usual_id ?? '',
            usual_line_id: e.usual_line_id ?? '',
          };
        }
        return { input: asInput(e, nextId('lg'), input.to_date, input.to_slot), group };
      });
      return clone(writeAll(rows, false));
    },
    setLogGroup: async (ids, group) => {
      const entries = entriesOf(ids);
      if (!entries.length) throw new ApiError('ids: at least one entry');
      if (entries.some((e) => e.date !== entries[0].date || e.slot !== entries[0].slot)) {
        throw new ApiError('The entries are not all in the same meal');
      }
      if (group === null) {
        for (const e of entries) Object.assign(e, { group_id: '', group_name: '', usual_id: '', usual_line_id: '' });
      } else {
        const name = group.name.trim();
        if (!name) throw new ApiError('group.name is required');
        const usual = group.usual_id ? findUsual(group.usual_id) : undefined;
        const group_id = nextId('gr');
        for (const e of entries) {
          const line = usual?.lines.find((l) =>
            l.options ? l.options.some((o) => o.food_id === e.food_id) : l.food_id === e.food_id,
          );
          Object.assign(e, {
            group_id,
            group_name: name,
            usual_id: usual?.id ?? '',
            usual_line_id: line?.line_id ?? '',
          });
        }
      }
      return clone(entries);
    },
    deleteLogEntries: async (ids) => {
      if (ids.length < 1 || ids.length > 50) throw new ApiError('ids: 1 to 50 entries');
      const entries = entriesOf(ids);
      for (const e of entries) log.splice(log.indexOf(e), 1);
    },
    getCombos: async (query = {}): Promise<CombosResult> => {
      const covered = (c: (typeof DEMO_COMBOS)[number]) =>
        usuals.some((u) => {
          const have = new Set(u.lines.flatMap((l) => (l.options ? l.options.map((o) => o.food_id) : [l.food_id])));
          return comboFoods(c).every((f) => have.has(f));
        });
      const coveredCount = DEMO_COMBOS.filter(covered).length;
      const hiddenCount = DEMO_COMBOS.filter((c) => !covered(c) && hidden.has(c.key)).length;
      const combos: Combo[] = DEMO_COMBOS.filter((c) => !covered(c) && !hidden.has(c.key)).map((c) => ({
        key: c.key,
        name: c.name,
        slot: c.slot,
        meals: c.meals,
        last_date: dateAgo(c.last_days_ago),
        lines: clone(c.lines) as ComboLine[],
        meal_dates: c.meal_days_ago.map((n) => ({ date: dateAgo(n), slot: c.slot })),
      }));
      combos.sort(
        (a, b) =>
          Number(b.slot === query.slot) - Number(a.slot === query.slot) ||
          b.meals - a.meals ||
          b.last_date.localeCompare(a.last_date),
      );
      const shown = query.limit !== undefined ? combos.slice(0, query.limit) : combos;
      return {
        combos: shown,
        stats: {
          meals: 54,
          sets: 38,
          kept: 6,
          after_inner: 5,
          joined: 4,
          covered: coveredCount,
          hidden: hiddenCount,
          returned: shown.length,
        },
      };
    },
    hideCombo: async (key) => {
      hidden.add(key);
    },
    unhideCombos: async (keys) => {
      if (keys) keys.forEach((k) => hidden.delete(k));
      else hidden.clear();
    },
    usualsUsing: (foodId) =>
      usuals
        .filter((u) => u.lines.some((l) => l.food_id === foodId || l.options?.some((o) => o.food_id === foodId)))
        .map((u) => ({ id: u.id, name: u.name })),
  };
}

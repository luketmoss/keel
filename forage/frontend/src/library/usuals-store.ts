// Library's usuals (#887), loaded through the API. Components read the signals; this file owns the fetching, the
// list's words, the editor's draft and the debounced save. Every figure (the starting kcal and macros) is the API's.
import { signal } from '@preact/signals';
import { type ForageApi } from '../api/client';
import type { Food, Slot, Usual, UsualInput, UsualLineInput, UsualOptional, UsualOption } from '../api/types';
import { dropHeldUsual, holdUsual } from '../eaten/add-store';
import { dayTitle } from '../eaten/format';
import type { LoadState } from './recipes-store';

export const usuals = signal<Usual[]>([]);
export const usualsState = signal<LoadState>('idle');
/** The header's "＋ New usual" was tapped: Library creates one and opens it. */
export const newUsualRequested = signal(false);

/** #888: the usual just saved from a combo, listed first until Library is left. */
export const freshUsualId = signal<string | null>(null);

let latest = 0;

export async function loadUsuals(api: ForageApi, quiet = false): Promise<void> {
  const seq = ++latest;
  if (!quiet && usualsState.value !== 'ready') usualsState.value = 'loading';
  try {
    const list = await api.getUsuals();
    if (seq !== latest) return;
    usuals.value = list;
    usualsState.value = 'ready';
  } catch {
    if (seq !== latest || quiet) return;
    usualsState.value = 'error';
  }
}

/** Put a saved usual into the list, replacing the old copy, and into the Eaten tab's held usuals (#947). */
export function keepUsual(usual: Usual): void {
  usuals.value = [...usuals.value.filter((u) => u.id !== usual.id), usual];
  holdUsual(usual);
}

/** Take a deleted usual out of the list and out of the Eaten tab's held usuals (#947). */
export function dropUsual(id: string): void {
  usuals.value = usuals.value.filter((u) => u.id !== id);
  dropHeldUsual(id);
}

/** Most recently used first, then by name; a usual never used goes after every used one. */
export function sortedUsuals(list: Usual[]): Usual[] {
  return [...list].sort((a, b) => {
    if (a.last_used !== b.last_used) {
      if (!a.last_used) return 1;
      if (!b.last_used) return -1;
      return a.last_used < b.last_used ? 1 : -1;
    }
    return a.name.localeCompare(b.name);
  });
}

export function _resetUsuals(): void {
  latest++;
  usuals.value = [];
  usualsState.value = 'idle';
  newUsualRequested.value = false;
  freshUsualId.value = null;
}

// ---- words

/** The meal of the current time of day: before 10:30 Breakfast, 15:00 Lunch, 19:30 Dinner, 21:00 After dinner. */
export function slotForTime(now = new Date()): Slot {
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (minutes < 10 * 60 + 30) return 'Breakfast';
  if (minutes < 15 * 60) return 'Lunch';
  if (minutes < 19 * 60 + 30) return 'Dinner';
  if (minutes < 21 * 60) return 'After dinner';
  return 'Snacks';
}

export const MAX_BUTTONS = 3;
export const MAX_LABEL = 20;

/** What a food is called on a button: its short name, else its name. */
export function labelOf(food: Food | undefined): string {
  if (!food) return 'A removed food';
  return (food.short_name ?? '').trim() || food.name;
}

export type PickLayout = { kind: 'buttons' } | { kind: 'list'; reason: 'count' | 'name' };

/** Buttons when there are 3 options or fewer and every label is 20 characters or fewer; else a list (#885's rule). */
export function pickLayout(options: UsualOption[], foods: Map<string, Food>): PickLayout {
  if (options.length > MAX_BUTTONS) return { kind: 'list', reason: 'count' };
  if (options.some((o) => labelOf(foods.get(o.food_id)).length > MAX_LABEL)) return { kind: 'list', reason: 'name' };
  return { kind: 'buttons' };
}

/** The note under a pick-one line: how it shows on a day, and why. */
export function layoutNote(layout: PickLayout): string {
  if (layout.kind === 'buttons') return 'On a day these show as buttons on the row.';
  return layout.reason === 'count'
    ? `On a day this shows as a list you open, because there are more than ${MAX_BUTTONS} options.`
    : `On a day this shows as a list you open, because a name is longer than ${MAX_LABEL} characters. Short names on the foods can turn it back into buttons.`;
}

/** The option a pick-one line starts on: its last pick, else the first. */
export function startOption(options: UsualOption[], lastPick: string): UsualOption {
  return options.find((o) => o.food_id === lastPick) ?? options[0];
}

/**
 * A usual's foods in short, ` · `-separated: a pick-one `A / B / C` as buttons, else `<last pick> or <n> more`. The
 * sometimes lines (#942) follow after ` · sometimes `, comma-separated.
 */
export function foodsInShort(usual: Usual, foods: Map<string, Food>): string {
  const say = (l: Usual['lines'][number]) => {
    if (!l.options) return labelOf(foods.get(l.food_id));
    const opts = l.options;
    if (pickLayout(opts, foods).kind === 'buttons') return opts.map((o) => labelOf(foods.get(o.food_id))).join(' / ');
    return `${labelOf(foods.get(startOption(opts, l.last_pick).food_id))} or ${opts.length - 1} more`;
  };
  const main = usual.lines
    .filter((l) => l.optional !== 'out')
    .map(say)
    .join(' · ');
  const sometimes = usual.lines
    .filter((l) => l.optional === 'out')
    .map(say)
    .join(', ');
  if (!sometimes) return main;
  return main ? `${main} · sometimes ${sometimes}` : `sometimes ${sometimes}`;
}

/** `Mon 2 Nov`, or `today` / `yesterday`. */
export function whenText(date: string, today: string): string {
  const t = dayTitle(date, today);
  return t === 'Today' || t === 'Yesterday' ? t.toLowerCase() : t;
}

/** `Breakfast · used 12 times, last yesterday`, or `Breakfast · not used yet`. */
export function usageLine(usual: Usual, today: string): string {
  if (!usual.used_count || !usual.last_used) return `${usual.slot} · not used yet`;
  const times = usual.used_count === 1 ? '1 time' : `${usual.used_count} times`;
  return `${usual.slot} · used ${times}, last ${whenText(usual.last_used, today)}`;
}

/** `412 kcal`, `about 412 kcal` when a food lacks nutrition, or null when nothing is known. */
export function startKcalText(usual: Pick<Usual, 'start'>): string | null {
  const k = usual.start?.kcal;
  if (typeof k !== 'number') return null;
  return `${usual.start.partial ? 'about ' : ''}${Math.round(k)} kcal`;
}

// ---- the editor's draft

/** One line as the editor holds it. A pick-one has `options`; with one it is on its way to being one (or back). */
export interface DraftLine {
  /** A stable key for the list, before the API has numbered the line. */
  key: string;
  line_id?: string;
  food_id: string;
  qty: number;
  unit: string;
  options: UsualOption[] | null;
  last_pick: string;
  /** How often (#942): '' every time, `in` usually, `out` sometimes. */
  optional: UsualOptional;
}

export interface Draft {
  name: string;
  slot: Slot;
  lines: DraftLine[];
}

let keys = 0;
export const newKey = () => `k${++keys}`;

export function draftFrom(usual: Usual): Draft {
  return {
    name: usual.name,
    slot: usual.slot,
    lines: usual.lines.map((l) => ({
      key: l.line_id,
      line_id: l.line_id,
      food_id: l.food_id,
      qty: l.qty ?? 1,
      unit: l.unit,
      options: l.options ? l.options.map((o) => ({ ...o })) : null,
      last_pick: l.last_pick,
      optional: l.optional ?? '',
    })),
  };
}

/** A food's first serving at quantity 1, or 100 g when it has none. */
export function defaultAmount(food: Food): UsualOption {
  const first = food.servings_json?.[0];
  return first ? { food_id: food.id, qty: 1, unit: first.name } : { food_id: food.id, qty: 100, unit: 'g' };
}

export function alwaysLine(opt: UsualOption): DraftLine {
  return {
    key: newKey(),
    food_id: opt.food_id,
    qty: opt.qty,
    unit: opt.unit,
    options: null,
    last_pick: '',
    optional: '',
  };
}

/** What `upsertUsual` takes. A pick-one with one option is saved as an Always line of it. */
export function toInput(id: string, draft: Draft): UsualInput {
  const lines: UsualLineInput[] = draft.lines.map((l) => {
    const base = { ...(l.line_id ? { line_id: l.line_id } : {}), ...(l.optional ? { optional: l.optional } : {}) };
    if (l.options && l.options.length >= 2) {
      const last = l.options.some((o) => o.food_id === l.last_pick) ? l.last_pick : '';
      return { ...base, options: l.options.map((o) => ({ ...o })), last_pick: last };
    }
    if (l.options?.length === 1) {
      const o = l.options[0];
      return { ...base, food_id: o.food_id, qty: o.qty, unit: o.unit };
    }
    return { ...base, food_id: l.food_id, qty: l.qty, unit: l.unit };
  });
  return { id, name: draft.name.trim(), slot: draft.slot, lines };
}

/** `us_` and 8 hex, as the API makes one; the app sends its own so a retry leaves one usual. */
export function newUsualId(): string {
  const bytes = new Uint8Array(4);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < 4; i++) bytes[i] = Math.floor(Math.random() * 256);
  return `us_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

/** Creates `New usual` for the meal of the time of day, no lines. */
export async function createUsual(api: ForageApi, now = new Date()): Promise<Usual> {
  const usual = await api.upsertUsual({ id: newUsualId(), name: 'New usual', slot: slotForTime(now), lines: [] });
  keepUsual(usual);
  return usual;
}

// ---- the debounced save

export type SaveState = 'idle' | 'saving' | 'saved' | 'failed';

export interface SaveJob {
  input: UsualInput;
  /** The draft line keys of `input.lines`, in order, so the API's line ids can be handed back. */
  keys: string[];
}

export interface Saver {
  /** Replace what is waiting to be sent and start the 600 ms wait again. */
  schedule(job: SaveJob): void;
  /** Send what is waiting now; answers when nothing is out or waiting. */
  flush(): Promise<void>;
  /** Send the last failed save again. */
  retry(): Promise<void>;
  /** Forget what is waiting but not yet sent (the usual is being deleted); flush() still waits for one that is out. */
  cancel(): void;
}

interface SaverHooks {
  delay?: number;
  onState(state: SaveState): void;
  onSaved(usual: Usual, job: SaveJob): void;
}

/**
 * A run of changes is one call: each `schedule` restarts the wait. One save is out at a time; changes made while it
 * is out are sent after it, as one more. A failure keeps the job for `retry` unless a newer change replaces it.
 */
export function createSaver(api: ForageApi, hooks: SaverHooks): Saver {
  const delay = hooks.delay ?? 600;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: SaveJob | null = null;
  let failed: SaveJob | null = null;
  let running: Promise<void> | null = null;

  async function drain(): Promise<void> {
    while (pending) {
      const job = pending;
      pending = null;
      hooks.onState('saving');
      try {
        const usual = await api.upsertUsual(job.input);
        failed = null;
        hooks.onSaved(usual, job);
        hooks.onState(pending ? 'saving' : 'saved');
      } catch {
        if (!pending) failed = job;
        hooks.onState('failed');
        return;
      }
    }
  }

  function run(): Promise<void> {
    clearTimeout(timer);
    timer = undefined;
    if (!running) {
      running = drain().finally(() => {
        running = null;
      });
    }
    return running;
  }

  return {
    schedule(job) {
      pending = job;
      failed = null;
      clearTimeout(timer);
      timer = setTimeout(() => void run(), delay);
    },
    async flush() {
      if (timer || pending) await run();
      else if (running) await running;
    },
    async retry() {
      if (!failed && !pending) return;
      if (!pending) pending = failed;
      await run();
    },
    cancel() {
      pending = null;
      failed = null;
      clearTimeout(timer);
    },
  };
}

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadSources } from './apps-script-sandbox';
import {
  applyStatusSideEffects as frontendApply,
  statusTransitionAuditAction as frontendAuditAction,
  isBoardArchived as frontendIsBoardArchived,
  normalizeCompletedAt as frontendNormalizeCompletedAt,
} from '../../frontend/src/state/rules';
import type { Item } from '../../frontend/src/api/types';

// #243 / AC4: `applyStatusSideEffects` is duplicated by design across
// `apps-script/src/rules.js` and `frontend/src/state/rules.ts`. CLAUDE.md names
// keeping the two in sync as an invariant, but nothing enforced it — until this.
//
// The same inputs go through both implementations and the results must match.
// Changing one file without the other fails this suite, which turns the
// convention into something checked.
//
// It lives in the Apps Script suite because the sandbox loader is here and the
// frontend copy is an ordinary ES module that imports anywhere; the criterion
// is the assertion, not its address.

const NOW = '2026-05-01T12:00:00.000Z';
const EARLIER = '2026-04-01T09:00:00.000Z';

/**
 * The Apps Script copy, loaded from real source. `Date` is injected because a
 * `node:vm` context has its own intrinsics, which vitest's fake timers do not
 * reach — without it the two sides would be read off two different clocks.
 */
function loadAppsScriptRules() {
  return loadSources(['utils.js', 'rules.js'], { Date: globalThis.Date });
}

function loadAppsScriptApply() {
  return loadAppsScriptRules().applyStatusSideEffects as (
    item: Item,
    newStatus: string,
    isTerminal: boolean,
  ) => Item;
}

function loadAppsScriptAuditAction() {
  return loadAppsScriptRules().statusTransitionAuditAction as (
    item: Item,
    isTerminal: boolean,
  ) => string | null;
}

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    id: 'item-1',
    title: 'Test Item',
    description: '',
    status: 'To Do',
    owner: 'Luke',
    due_date: '',
    labels: '',
    parent_id: '',
    created_at: EARLIER,
    updated_at: EARLIER,
    completed_at: '',
    sort_order: 1,
    created_by: '',
    board_id: 'board-1',
    ...overrides,
  };
}

/** Every case both copies must agree on. */
const CASES: Array<{ name: string; item: Item; newStatus: string; isTerminal: boolean }> = [
  {
    name: 'entering a terminal status',
    item: makeItem({ status: 'In Progress' }),
    newStatus: 'Done',
    isTerminal: true,
  },
  {
    name: 'entering a terminal status named something else',
    item: makeItem({ status: 'In Progress' }),
    newStatus: 'Shipped',
    isTerminal: true,
  },
  {
    name: 'reopening — leaving a terminal status',
    item: makeItem({ status: 'Done', completed_at: EARLIER }),
    newStatus: 'To Do',
    isTerminal: false,
  },
  {
    name: 'moving between two non-terminal statuses',
    item: makeItem({ status: 'To Do' }),
    newStatus: 'In Progress',
    isTerminal: false,
  },
  {
    name: 'a terminal-to-terminal move',
    item: makeItem({ status: 'Done', completed_at: EARLIER }),
    newStatus: 'Cancelled',
    isTerminal: true,
  },
];

describe('applyStatusSideEffects parity: apps-script/src/rules.js vs frontend/src/state/rules.ts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  for (const { name, item, newStatus, isTerminal } of CASES) {
    it(`agrees on ${name}`, () => {
      const appsScriptApply = loadAppsScriptApply();

      const fromAppsScript = appsScriptApply({ ...item }, newStatus, isTerminal);
      const fromFrontend = frontendApply({ ...item }, newStatus, isTerminal);

      expect(fromAppsScript).toEqual(fromFrontend);
    });
  }

  it('agrees on the fields the rule is actually about', () => {
    const appsScriptApply = loadAppsScriptApply();

    for (const { item, newStatus, isTerminal } of CASES) {
      const a = appsScriptApply({ ...item }, newStatus, isTerminal);
      const f = frontendApply({ ...item }, newStatus, isTerminal);

      expect([a.status, a.updated_at, a.completed_at]).toEqual([
        f.status,
        f.updated_at,
        f.completed_at,
      ]);
    }
  });

  // #252: the gap the CASES table above cannot see. Every case in it passes an
  // explicit boolean, which is exactly where the two copies agreed — they
  // disagreed only when the argument never arrived. Apps Script cleared
  // `completed_at` on any falsy `isTerminal`; the frontend cleared it only on an
  // explicit `false`. Both now read the missing argument as non-terminal.
  //
  // AC3 makes `isTerminal` a required `boolean` on the frontend, so a plain
  // two-argument call no longer type checks. The cast below is the point of the
  // test rather than a way around the types: it models a caller that omits the
  // argument — the JS one Apps Script actually has, and the one the `?` used to
  // invite — and pins what both copies do with it.
  type LooseApply = (item: Item, newStatus: string, isTerminal?: boolean) => Item;

  const OMITTED_CASES: Array<{ name: string; item: Item; newStatus: string }> = [
    {
      name: 'a completed item moved with the argument omitted',
      item: makeItem({ status: 'Done', completed_at: EARLIER }),
      newStatus: 'To Do',
    },
    {
      name: 'a never-completed item moved with the argument omitted',
      item: makeItem({ status: 'To Do', completed_at: '' }),
      newStatus: 'In Progress',
    },
  ];

  for (const { name, item, newStatus } of OMITTED_CASES) {
    it(`agrees on ${name}`, () => {
      const appsScriptApply = loadAppsScriptApply() as unknown as LooseApply;
      const frontendLoose = frontendApply as unknown as LooseApply;

      const fromAppsScript = appsScriptApply({ ...item }, newStatus);
      const fromFrontend = frontendLoose({ ...item }, newStatus);

      expect(fromAppsScript).toEqual(fromFrontend);
    });

    it(`agrees on ${name}, passed as an explicit undefined`, () => {
      const appsScriptApply = loadAppsScriptApply() as unknown as LooseApply;
      const frontendLoose = frontendApply as unknown as LooseApply;

      const fromAppsScript = appsScriptApply({ ...item }, newStatus, undefined);
      const fromFrontend = frontendLoose({ ...item }, newStatus, undefined);

      expect(fromAppsScript).toEqual(fromFrontend);
    });
  }

  it('reads a missing isTerminal as non-terminal on both copies', () => {
    const appsScriptApply = loadAppsScriptApply() as unknown as LooseApply;
    const frontendLoose = frontendApply as unknown as LooseApply;
    const completed = makeItem({ status: 'Done', completed_at: EARLIER });

    // Not just equal to each other — equal to the agreed answer. Two copies
    // that both *kept* `completed_at` would satisfy the parity assertion above
    // while contradicting the invariant that `is_terminal` drives the field.
    expect(appsScriptApply({ ...completed }, 'To Do').completed_at).toBe('');
    expect(frontendLoose({ ...completed }, 'To Do').completed_at).toBe('');
  });
});

// #239: `statusTransitionAuditAction` is the second rule duplicated across the
// two doors, and it is the one the Journal's completion history depends on.
// Its branches mirror `applyStatusSideEffects` on purpose, so it is driven over
// the same CASES — if one copy drifts, the two doors disagree about whether a
// move was a completion, and the forensic trail gains a hole on one side only.
describe('statusTransitionAuditAction parity: apps-script/src/rules.js vs frontend/src/state/rules.ts', () => {
  for (const { name, item, isTerminal } of CASES) {
    it(`agrees on ${name}`, () => {
      const appsScriptAuditAction = loadAppsScriptAuditAction();
      expect(appsScriptAuditAction({ ...item }, isTerminal))
        .toBe(frontendAuditAction({ ...item }, isTerminal));
    });
  }

  it('agrees that a never-completed item moving to a non-terminal column is neither', () => {
    const appsScriptAuditAction = loadAppsScriptAuditAction();
    const item = makeItem({ status: 'To Do', completed_at: '' });
    expect(appsScriptAuditAction({ ...item }, false)).toBeNull();
    expect(frontendAuditAction({ ...item }, false)).toBeNull();
  });

  it('agrees the verdict tracks is_terminal, not the completed_at already there', () => {
    const appsScriptAuditAction = loadAppsScriptAuditAction();
    const stale = makeItem({ status: 'Done', completed_at: EARLIER });
    // Still entering a terminal column — completed again, not reopened.
    expect(appsScriptAuditAction({ ...stale }, true)).toBe('completed');
    expect(frontendAuditAction({ ...stale }, true)).toBe('completed');
  });
});

// #288: both doors must agree on which boards are archived, or the API would
// show items the app hides (or the reverse).
describe('isBoardArchived parity', () => {
  const appsScript = () =>
    loadAppsScriptRules().isBoardArchived as (board: { archived_at?: unknown } | null | undefined) => boolean;

  it.each([
    ['archived', { archived_at: '2026-10-18T12:00:00.000Z' }, true],
    ['empty cell', { archived_at: '' }, false],
    ['whitespace cell', { archived_at: '   ' }, false],
    ['no column G', {}, false],
    ['no board', null, false],
  ])('%s', (_name, board, expected) => {
    expect(frontendIsBoardArchived(board as { archived_at?: string } | null)).toBe(expected);
    expect(appsScript()(board)).toBe(expected);
  });
});

// #458: both doors must accept and refuse the same completed_at values, and
// store the same normalised string.
describe('normalizeCompletedAt parity', () => {
  const appsScript = () =>
    loadAppsScriptRules().normalizeCompletedAt as (value: unknown, now: Date) => string | null;
  const NOW_DATE = new Date('2026-10-18T12:00:00.000Z');

  it.each([
    ['a date, as noon UTC', '2026-10-16', '2026-10-16T12:00:00.000Z'],
    ['a UTC timestamp', '2026-10-16T18:30:00Z', '2026-10-16T18:30:00.000Z'],
    ['an offset timestamp', '2026-10-16T19:30:00+01:00', '2026-10-16T18:30:00.000Z'],
    ['fractional seconds', '2026-10-16T18:30:00.123Z', '2026-10-16T18:30:00.123Z'],
    ['no seconds', '2026-10-16T18:30Z', '2026-10-16T18:30:00.000Z'],
    ['surrounding whitespace', '  2026-10-16  ', '2026-10-16T12:00:00.000Z'],
    ['far in the past', '1999-12-31', '1999-12-31T12:00:00.000Z'],
    ['just under 24 hours ahead', '2026-10-19T11:59:00Z', '2026-10-19T11:59:00.000Z'],
    ['tomorrow as a date (noon is under 24 hours ahead)', '2026-10-19', '2026-10-19T12:00:00.000Z'],
    ['empty', '', null],
    ['blank', '   ', null],
    ['null', null, null],
    ['a number', 20261016, null],
    ['words', 'yesterday', null],
    ['an impossible date', '2026-02-30', null],
    ['an impossible date with a time', '2026-02-30T10:00:00Z', null],
    ['no zone', '2026-10-16T10:00:00', null],
    ['over 24 hours ahead', '2026-10-19T12:00:01Z', null],
    ['a space instead of T', '2026-10-16 10:00:00Z', null],
  ])('agrees on %s', (_name, input, expected) => {
    expect(frontendNormalizeCompletedAt(input, NOW_DATE)).toBe(expected);
    expect(appsScript()(input, NOW_DATE)).toBe(expected);
  });

  it('accepts now as a timestamp or a Date on both copies', () => {
    expect(frontendNormalizeCompletedAt('2026-10-19T12:00:00Z', '2026-10-18T12:00:00.000Z')).toBe('2026-10-19T12:00:00.000Z');
    expect(appsScript()('2026-10-19T12:00:00Z', '2026-10-18T12:00:00.000Z' as unknown as Date)).toBe('2026-10-19T12:00:00.000Z');
  });
});

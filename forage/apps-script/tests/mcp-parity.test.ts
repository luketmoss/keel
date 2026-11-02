// #713: "no feature issue is done until its tools exist" as a failing test.
//
// Every action in main.js must be called by a Forage MCP tool (an apiRead,
// apiWrite or apiDry in mcp/src/forage/), or be in NO_TOOL with a reason, or
// in PENDING_TOOLS with the issue that will add its tool. A feature issue
// deletes its actions from PENDING_TOOLS in the PR that registers the tool;
// an action still pending once it has a tool fails too, so the list only
// shrinks. And every write action is logged for undo, or deliberately not.

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SRC_DIR, loadApi } from './apps-script-sandbox';

const WORKER_DIR = path.resolve(SRC_DIR, '..', '..', '..', 'mcp', 'src', 'forage');

/** Actions with no tool, ever, and why. */
const NO_TOOL: Record<string, string> = {
  ensureSchema: 'the migration, run by the owner',
  setConfig: "the owner's configuration, set by hand",
  computeNutrition: "forage_import_recipe's dry run already previews nutrition",
  deleteCook: "removed in the app; an agent's cook is undone with forage_undo",
  getWalkthrough: 'forage_get_recipe answers the walkthrough with its check (#711)',
};

/** Actions whose tool a later issue adds. That issue removes them from here. */
const PENDING_TOOLS: Record<string, number> = {
  getFoodLog: 712, getFoodLogTotals: 712, logFood: 712, updateLogEntry: 712, deleteLogEntry: 712,
};

/** Reads are named get*, plus the computation and the barcode lookup that save nothing. Everything else writes. */
const READS_NOT_NAMED_GET = ['computeNutrition', 'lookupBarcode'];

/** Every `case '<action>'` in main.js's dispatcher. */
function mainActions(): string[] {
  const src = readFileSync(path.join(SRC_DIR, 'main.js'), 'utf8');
  return [...src.matchAll(/case '([A-Za-z]+)':/g)].map((m) => m[1]);
}

/** Every action the Worker's Forage tools send, from the source of mcp/src/forage/. */
function workerActions(): string[] {
  const out = new Set<string>();
  for (const file of readdirSync(WORKER_DIR).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))) {
    const src = readFileSync(path.join(WORKER_DIR, file), 'utf8');
    for (const m of src.matchAll(/api(?:Read|Write|Dry)\(\s*cfg,\s*'([A-Za-z]+)'/g)) out.add(m[1]);
  }
  return [...out].sort();
}

/** What is wrong with the lists, as one message per problem. Empty is parity. */
function parityProblems(actions: string[], called: string[]): string[] {
  const problems: string[] = [];
  for (const a of actions) {
    const lists = [called.includes(a) && 'a tool', NO_TOOL[a] && 'NO_TOOL', PENDING_TOOLS[a] && 'PENDING_TOOLS'].filter(
      Boolean,
    );
    if (lists.length === 0) problems.push(`${a} has no tool and is on neither NO_TOOL nor PENDING_TOOLS`);
    if (lists.length > 1) problems.push(`${a} is on more than one of: ${lists.join(', ')}`);
  }
  for (const a of called) if (!actions.includes(a)) problems.push(`the Worker calls ${a}, which main.js has no case for`);
  for (const a of [...Object.keys(NO_TOOL), ...Object.keys(PENDING_TOOLS)]) {
    if (!actions.includes(a)) problems.push(`${a} is listed but main.js has no case for it`);
  }
  return problems;
}

describe('MCP parity: every action has a tool, or a reason, or an owner', () => {
  it('finds the Worker\'s Forage tools', () => {
    expect(workerActions()).toEqual([
      'addStarterFoods', 'addToTrip', 'closeTrip', 'deleteFood', 'deletePlanEntry', 'deleteRecipe', 'deleteWalkthrough', 'discardTrip', 'getChangeLog',
      'getConfig', 'getCooks', 'getFood', 'getFoods', 'getPlan', 'getRecipe', 'getRecipes', 'getStarterFoods', 'getTrip',
      'getTrips', 'importRecipe', 'lookupBarcode', 'movePlanEntry', 'planWeek', 'removeTripItem', 'setFoodWeight', 'setTripItem', 'setWalkthrough',
      'startTrip', 'undoCall', 'upsertCook', 'upsertFood', 'upsertPlanEntry', 'upsertRecipe',
    ]);
  });

  it('holds for main.js and mcp/src/forage today', () => {
    expect(parityProblems(mainActions(), workerActions())).toEqual([]);
  });

  it('fails for a new action with no tool and no entry', () => {
    expect(parityProblems([...mainActions(), 'archiveRecipe'], workerActions())).toEqual([
      'archiveRecipe has no tool and is on neither NO_TOOL nor PENDING_TOOLS',
    ]);
  });

  it('fails for a pending action that already has a tool, so the list only shrinks', () => {
    expect(parityProblems(mainActions(), [...workerActions(), 'getFoodLog'])).toEqual([
      'getFoodLog is on more than one of: a tool, PENDING_TOOLS',
    ]);
  });

  it('every pending action names one of the feature issues', () => {
    for (const [action, issue] of Object.entries(PENDING_TOOLS)) {
      expect([707, 708, 709, 710, 711, 712], action).toContain(issue);
    }
  });
});

describe('every write action is logged for undo, or deliberately not', () => {
  function unlogged(actions: string[], logged: string[], notLogged: string[]): string[] {
    const writes = actions.filter((a) => !a.startsWith('get') && !READS_NOT_NAMED_GET.includes(a));
    return writes.filter((a) => !logged.includes(a) && !notLogged.includes(a));
  }

  it('each write action in main.js is on CHANGE_LOGGED_ACTIONS or NOT_LOGGED, never both', () => {
    const { sandbox } = loadApi();
    const logged = Object.keys(sandbox.CHANGE_LOGGED_ACTIONS);
    const notLogged: string[] = [...sandbox.NOT_LOGGED];
    expect(unlogged(mainActions(), logged, notLogged)).toEqual([]);
    expect(logged.filter((a) => notLogged.includes(a))).toEqual([]);
    for (const action of [...logged, ...notLogged]) expect(mainActions(), `${action} has no case`).toContain(action);
  });

  it('fails for a new write action on neither list', () => {
    const { sandbox } = loadApi();
    expect(unlogged([...mainActions(), 'archiveRecipe'], Object.keys(sandbox.CHANGE_LOGGED_ACTIONS), [...sandbox.NOT_LOGGED])).toEqual(
      ['archiveRecipe'],
    );
  });

  it('every tab a logged action names exists', () => {
    const { sandbox } = loadApi();
    for (const [action, tabs] of Object.entries(sandbox.CHANGE_LOGGED_ACTIONS as Record<string, string[]>)) {
      for (const tab of tabs) expect(sandbox.TABS[tab], `${action}: ${tab}`).toBeDefined();
    }
  });
});

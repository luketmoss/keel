// The similar-routes index (#692): each tracked activity's map grid cells, built
// in the browser from the tracks the API already serves and kept on the device.
//
// It builds the first time an activity detail with a track opens in a session:
// the viewed activity first, then the other completed tracked activities newest
// first (to a cap), one request at a time so the detail screen's own fetch
// always has the second slot. Index fetches are not held in the session track
// cache. The saved copy in localStorage is a convenience, never a source:
// missing, unreadable or over quota, the index rebuilds or carries on in memory.
// Nothing here logs a coordinate, a cell or a track.

import { signal } from '@preact/signals';
import { completedWorkouts } from './store';
import { isDemo } from '../api/demo-data';
import { DEMO_TRACKS } from '../api/demo-track';
import type { WorkoutWithRow } from '../api/types';
import { requestTrack } from '../maps/track-cache';
import { trackCells } from '../similar/grid';
import { decodeCells, encodeCells } from '../similar/encode';
import { similarTo, type SimilarCandidate } from '../similar/rules';

/** localStorage key of the saved index. Signing out removes it. */
export const CELLS_KEY = 'thrive.cells.v1';
/** The most activities indexed: the newest tracked ones. */
export const INDEX_CAP = 600;
/** Failed fetches in a row that stop a run. */
export const MAX_FAILURES = 5;
const FORMAT = 1;
const ZOOM = 19;
/** Results and progress are published at most this often while the index builds. */
const PUBLISH_MS = 500;
const SAVE_MS = 2000;

interface Entry {
  trackRef: string;
  cells: number[];
}

export type IndexState = 'idle' | 'building' | 'stopped' | 'complete';

export interface IndexProgress {
  state: IndexState;
  checked: number;
  total: number;
}

const entries = new Map<string, Entry>();
/** Bumped when the index changes in a way the sections can show. */
export const indexVersion = signal(0);
export const indexProgress = signal<IndexProgress>({ state: 'idle', checked: 0, total: 0 });

let generation = 0;
let running = false;
let loaded = false;
let currentViewed: string | null = null;
let latestToken: string | null = null;
let publishTimer: ReturnType<typeof setTimeout> | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function cellsEligible(w: WorkoutWithRow): boolean {
  return Boolean(w.track_ref);
}

/** The activities to index: the viewed one first, then completed tracked ones newest first, to the cap. */
function candidates(viewedId: string | null): WorkoutWithRow[] {
  const tracked = completedWorkouts.value.filter(cellsEligible);
  const viewed = tracked.find((w) => w.id === viewedId);
  const rest = tracked
    .filter((w) => w !== viewed)
    .sort((a, b) => `${b.date}T${b.time}`.localeCompare(`${a.date}T${a.time}`));
  return (viewed ? [viewed, ...rest] : rest).slice(0, INDEX_CAP);
}

function publish(): void {
  if (publishTimer) {
    clearTimeout(publishTimer);
    publishTimer = null;
  }
  indexVersion.value += 1;
}

function publishSoon(): void {
  if (!publishTimer) publishTimer = setTimeout(publish, PUBLISH_MS);
}

function setProgress(state: IndexState, list: WorkoutWithRow[]): void {
  const checked = list.filter((w) => entries.get(w.id)?.trackRef === w.track_ref).length;
  indexProgress.value = { state, checked, total: list.length };
}

// --- saved copy ------------------------------------------------------------

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function loadSaved(): void {
  if (loaded) return;
  loaded = true;
  try {
    const raw = storage()?.getItem(CELLS_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw) as { f?: unknown; z?: unknown; e?: Record<string, unknown> };
    if (saved.f !== FORMAT || saved.z !== ZOOM || !saved.e || typeof saved.e !== 'object') return;
    for (const [id, value] of Object.entries(saved.e)) {
      if (!Array.isArray(value) || typeof value[0] !== 'string' || typeof value[1] !== 'string') continue;
      const cells = decodeCells(value[1]);
      if (cells) entries.set(id, { trackRef: value[0], cells });
    }
  } catch {
    // Unreadable: the index rebuilds.
  }
}

function saveNow(): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (isDemo()) return;
  try {
    const e: Record<string, [string, string]> = {};
    for (const [id, entry] of entries) e[id] = [entry.trackRef, encodeCells(entry.cells)];
    storage()?.setItem(CELLS_KEY, JSON.stringify({ f: FORMAT, z: ZOOM, e }));
  } catch {
    // Over quota or unavailable: it carries on in memory.
  }
}

function saveSoon(): void {
  if (!saveTimer) saveTimer = setTimeout(saveNow, SAVE_MS);
}

/** Drops entries whose activity is gone or whose track_ref changed. Returns whether anything was dropped. */
function prune(): boolean {
  const all = completedWorkouts.value;
  if (all.length === 0) return false;
  const refs = new Map(all.map((w) => [w.id, w.track_ref]));
  let dropped = false;
  for (const [id, entry] of entries) {
    if (refs.get(id) !== entry.trackRef) {
      entries.delete(id);
      dropped = true;
    }
  }
  return dropped;
}

/** Signing out: forget everything, on the device too. */
export function clearSimilarIndex(): void {
  generation += 1;
  running = false;
  loaded = false;
  currentViewed = null;
  entries.clear();
  if (publishTimer) clearTimeout(publishTimer);
  if (saveTimer) clearTimeout(saveTimer);
  publishTimer = null;
  saveTimer = null;
  try {
    storage()?.removeItem(CELLS_KEY);
  } catch {
    // Nothing to clear.
  }
  indexProgress.value = { state: 'idle', checked: 0, total: 0 };
  indexVersion.value += 1;
}

// --- building ---------------------------------------------------------------

function buildDemo(): void {
  entries.clear();
  for (const w of candidates(null)) {
    const track = DEMO_TRACKS[w.id];
    if (track) entries.set(w.id, { trackRef: w.track_ref, cells: trackCells(track.geometry.coordinates) });
  }
  setProgress('complete', []);
  publish();
}

async function run(): Promise<void> {
  const mine = generation;
  running = true;
  let failures = 0;
  const skipped = new Set<string>();
  let stopped = false;
  try {
    for (;;) {
      const list = candidates(currentViewed);
      const next = list.find((w) => entries.get(w.id)?.trackRef !== w.track_ref && !skipped.has(w.id));
      if (!next) break;
      setProgress('building', list);
      try {
        const track = await requestTrack(next.id, latestToken, { keep: next.id === currentViewed }).promise;
        if (mine !== generation) return;
        entries.set(next.id, { trackRef: next.track_ref, cells: trackCells(track.geometry.coordinates) });
        failures = 0;
      } catch (err) {
        if (mine !== generation) return;
        // The API says there is no track: that is an answer, so it is kept as no cells and not asked again.
        if (err instanceof Error && err.message === 'no_track') {
          entries.set(next.id, { trackRef: next.track_ref, cells: [] });
          failures = 0;
        } else {
          skipped.add(next.id);
          failures += 1;
          if (failures >= MAX_FAILURES) {
            stopped = true;
            break;
          }
        }
      }
      setProgress('building', list);
      publishSoon();
      saveSoon();
    }
    const list = candidates(currentViewed);
    setProgress(stopped || skipped.size > 0 ? 'stopped' : 'complete', list);
    saveNow();
    publish();
  } finally {
    if (mine === generation) running = false;
  }
}

/**
 * Starts (or resumes) the index for an opened tracked activity. A second call while a run is going only
 * changes which activity it reads first.
 */
export function ensureIndex(viewedId: string, token: string | null): void {
  currentViewed = viewedId;
  latestToken = token;
  if (isDemo()) {
    buildDemo();
    return;
  }
  loadSaved();
  const dropped = prune();
  const list = candidates(viewedId);
  const pending = list.some((w) => entries.get(w.id)?.trackRef !== w.track_ref);
  if (dropped) saveSoon();
  if (!pending) {
    setProgress('complete', list);
    publish();
    return;
  }
  setProgress('building', list);
  publish();
  if (!running) void run();
}

// --- reading ----------------------------------------------------------------

export interface SimilarForActivity {
  routes: WorkoutWithRow[];
  near: WorkoutWithRow[];
}

const NONE: SimilarForActivity = { routes: [], near: [] };
let memo: { key: unknown[]; value: SimilarForActivity } | null = null;

/** Routes like this and Near here for an activity, from what the index holds now. Reads signals. */
export function similarFor(viewedId: string): SimilarForActivity {
  const version = indexVersion.value;
  const done = completedWorkouts.value;
  const key = [viewedId, version, done];
  if (memo && memo.key.every((k, i) => k === key[i])) return memo.value;

  const viewedEntry = entries.get(viewedId);
  let value = NONE;
  const viewedRow = done.find((w) => w.id === viewedId);
  if (viewedEntry && viewedRow && viewedEntry.trackRef === viewedRow.track_ref) {
    const byId = new Map<string, WorkoutWithRow>();
    const others: SimilarCandidate[] = [];
    for (const w of done) {
      const e = entries.get(w.id);
      if (!e || !w.track_ref || e.trackRef !== w.track_ref) continue;
      byId.set(w.id, w);
      others.push({ id: w.id, date: w.date, time: w.time, cells: e.cells });
    }
    const result = similarTo(
      { id: viewedId, date: viewedRow.date, time: viewedRow.time, cells: viewedEntry.cells },
      others,
    );
    value = {
      routes: result.routes.map((id) => byId.get(id)!),
      near: result.near.map((id) => byId.get(id)!),
    };
  }
  memo = { key, value };
  return value;
}

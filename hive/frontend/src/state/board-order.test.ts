import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { Board } from '../api/types';
import { applyBoardOrder, boardOrderKey, dropIndex, loadBoardOrder, moveId, saveBoardOrder } from './board-order';

const b = (id: string): Board => ({ id, name: id, created_at: '', created_by: '' });

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('board order helpers (#656)', () => {
  it('keys by lowercased email', () => {
    expect(boardOrderKey('Me@Test.com')).toBe('hive-board-order:me@test.com');
  });

  it('applies saved order, unlisted boards follow in sheet order, unknown ids ignored', () => {
    const out = applyBoardOrder([b('a'), b('b'), b('c'), b('d')], ['c', 'gone', 'a']);
    expect(out.map((x) => x.id)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('returns sheet order with no saved order', () => {
    expect(applyBoardOrder([b('a'), b('b')], []).map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('moveId moves, clamps and no-ops', () => {
    expect(moveId(['a', 'b', 'c'], 'a', 2)).toEqual(['b', 'c', 'a']);
    expect(moveId(['a', 'b', 'c'], 'c', 0)).toEqual(['c', 'a', 'b']);
    const same = ['a', 'b'];
    expect(moveId(same, 'a', 0)).toBe(same);
    expect(moveId(same, 'zzz', 1)).toBe(same);
  });

  it('dropIndex gives the final index for before/after', () => {
    const ids = ['a', 'b', 'c', 'd'];
    expect(dropIndex(ids, 'a', 'c', 'before')).toBe(1);
    expect(dropIndex(ids, 'a', 'c', 'after')).toBe(2);
    expect(dropIndex(ids, 'd', 'a', 'before')).toBe(0);
    expect(dropIndex(ids, 'a', 'a', 'after')).toBeNull();
  });

  it('round-trips through localStorage and survives bad data', () => {
    expect(saveBoardOrder('Me@test.com', ['x', 'y'])).toBe(true);
    expect(loadBoardOrder('me@test.com')).toEqual(['x', 'y']);
    localStorage.setItem(boardOrderKey('me@test.com'), '{not json');
    expect(loadBoardOrder('me@test.com')).toEqual([]);
    localStorage.setItem(boardOrderKey('me@test.com'), '{"a":1}');
    expect(loadBoardOrder('me@test.com')).toEqual([]);
  });

  it('does not throw when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(loadBoardOrder('me@test.com')).toEqual([]);
    expect(saveBoardOrder('me@test.com', ['a'])).toBe(false);
  });
});

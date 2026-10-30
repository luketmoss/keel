import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, createEvent } from '@testing-library/preact';
import {
  boards,
  permissions,
  items,
  statuses,
  activeBoardId,
  activeView,
  currentUserEmail,
  accessibleBoards,
  resetBoardOrderForTests,
  forgetBoardOrder,
} from '../../state/board-store';
import { NavRail } from './nav-rail';

// #656: reordering the rail's board list.

const ME = 'me@test.com';
const user = { email: ME, name: 'Me', picture: '' };
const ids = () => accessibleBoards.value.map((b) => b.id);
const BOX = { top: 0, height: 40, bottom: 40, left: 0, right: 100, width: 100, x: 0, y: 0 } as DOMRect;

beforeEach(() => {
  localStorage.clear();
  resetBoardOrderForTests();
  window.history.replaceState(null, '', '/?demo=true');
  boards.value = ['b1', 'b2', 'b3', 'b4'].map((id) => ({ id, name: `Board ${id}`, created_at: '', created_by: ME }));
  permissions.value = boards.value.flatMap((b) => [
    { board_id: b.id, user_email: ME, role: 'owner' as const },
    { board_id: b.id, user_email: 'other@test.com', role: 'owner' as const },
  ]);
  statuses.value = [];
  items.value = [];
  activeBoardId.value = 'b1';
  activeView.value = 'today';
  currentUserEmail.value = ME;
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const rail = () => render(<NavRail user={user} displayName="Me" />);
const rows = (c: Element) => [...c.querySelectorAll('.rail-board')].map((r) => r.getAttribute('title'));
const link = (c: Element, id: string) => c.querySelector(`[data-testid="rail-board-${id}"]`) as HTMLElement;
const row = (c: Element, id: string) => c.querySelector(`[data-testid="rail-row-${id}"]`) as HTMLElement;

// jsdom's DragEvent has no clientY, so give the event one.
function dragAt(type: 'dragOver' | 'drop', el: HTMLElement, clientY: number) {
  const ev = createEvent[type](el);
  Object.defineProperty(ev, 'clientY', { value: clientY });
  fireEvent(el, ev);
}

describe('rail board reorder (#656)', () => {
  it('Alt+ArrowDown moves down, announces, saves, and keeps focus', async () => {
    const { container } = rail();
    link(container, 'b1').focus();
    fireEvent.keyDown(link(container, 'b1'), { key: 'ArrowDown', altKey: true });
    expect(ids()).toEqual(['b2', 'b1', 'b3', 'b4']);
    expect(rows(container)).toEqual(['Board b2', 'Board b1', 'Board b3', 'Board b4']);
    expect(container.querySelector('[data-testid="rail-board-announce"]')!.textContent).toBe(
      'Board b1 moved to position 2 of 4',
    );
    expect(JSON.parse(localStorage.getItem(`hive-board-order:${ME}`)!)).toEqual(['b2', 'b1', 'b3', 'b4']);
    await new Promise((r) => setTimeout(r, 0));
    expect(document.activeElement).toBe(link(container, 'b1'));
  });

  it('Alt+ArrowUp at the top does nothing and announces nothing', () => {
    const { container } = rail();
    fireEvent.keyDown(link(container, 'b1'), { key: 'ArrowUp', altKey: true });
    expect(ids()).toEqual(['b1', 'b2', 'b3', 'b4']);
    expect(container.querySelector('[data-testid="rail-board-announce"]')!.textContent).toBe('');
    fireEvent.keyDown(link(container, 'b4'), { key: 'ArrowDown', altKey: true });
    expect(ids()).toEqual(['b1', 'b2', 'b3', 'b4']);
    fireEvent.keyDown(link(container, 'b2'), { key: 'ArrowUp', altKey: true });
    expect(ids()).toEqual(['b2', 'b1', 'b3', 'b4']);
  });

  it('plain arrows do not reorder', () => {
    const { container } = rail();
    fireEvent.keyDown(link(container, 'b1'), { key: 'ArrowDown' });
    expect(ids()).toEqual(['b1', 'b2', 'b3', 'b4']);
  });

  it('drag and drop moves a row after another and shows a drop line', () => {
    const { container } = rail();
    row(container, 'b3').getBoundingClientRect = () => BOX;
    fireEvent.dragStart(row(container, 'b1'));
    expect(row(container, 'b1').classList.contains('rail-board-dragging')).toBe(true);
    dragAt('dragOver', row(container, 'b3'), 35);
    expect(row(container, 'b3').classList.contains('rail-drop-after')).toBe(true);
    dragAt('drop', row(container, 'b3'), 35);
    expect(ids()).toEqual(['b2', 'b3', 'b1', 'b4']);
    expect(container.querySelector('.rail-drop-after')).toBeNull();
  });

  it('no drop line over the dragged row or a no-change position; dragend changes nothing', () => {
    const { container } = rail();
    row(container, 'b2').getBoundingClientRect = () => BOX;
    fireEvent.dragStart(row(container, 'b1'));
    dragAt('dragOver', row(container, 'b1'), 5);
    dragAt('dragOver', row(container, 'b2'), 5); // before b2 is where b1 already is
    expect(container.querySelector('.rail-drop-before, .rail-drop-after')).toBeNull();
    fireEvent.dragEnd(row(container, 'b1'));
    expect(ids()).toEqual(['b1', 'b2', 'b3', 'b4']);
    expect(localStorage.getItem(`hive-board-order:${ME}`)).toBeNull();
  });

  it('works for the session when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const { container } = rail();
    expect(ids()).toEqual(['b1', 'b2', 'b3', 'b4']);
    fireEvent.keyDown(link(container, 'b1'), { key: 'ArrowDown', altKey: true });
    expect(ids()).toEqual(['b2', 'b1', 'b3', 'b4']);
  });

  it('is per user, new boards go last, lost boards leave the rest in order', () => {
    localStorage.setItem(`hive-board-order:${ME}`, JSON.stringify(['b3', 'b1']));
    currentUserEmail.value = 'other@test.com';
    expect(ids()).toEqual(['b1', 'b2', 'b3', 'b4']);
    currentUserEmail.value = ME;
    expect(ids()).toEqual(['b3', 'b1', 'b2', 'b4']);
    boards.value = [...boards.value, { id: 'b5', name: 'New', created_at: '', created_by: ME }];
    permissions.value = [...permissions.value, { board_id: 'b5', user_email: ME, role: 'owner' as const }];
    expect(ids()).toEqual(['b3', 'b1', 'b2', 'b4', 'b5']);
    boards.value = boards.value.map((b) => (b.id === 'b1' ? { ...b, archived_at: '2026-01-01T00:00:00Z' } : b));
    expect(ids()).toEqual(['b3', 'b2', 'b4', 'b5']);
  });

  it('forgetBoardOrder (archive) puts an unarchived board back at the end', () => {
    localStorage.setItem(`hive-board-order:${ME}`, JSON.stringify(['b3', 'b1', 'b2', 'b4']));
    forgetBoardOrder('b1');
    boards.value = boards.value.map((b) => (b.id === 'b1' ? { ...b, archived_at: '2026-01-01T00:00:00Z' } : b));
    expect(ids()).toEqual(['b3', 'b2', 'b4']);
    boards.value = boards.value.map((b) => ({ ...b, archived_at: undefined }));
    expect(ids()).toEqual(['b3', 'b2', 'b4', 'b1']);
  });

  it('a click without drag still navigates', () => {
    const { container } = rail();
    fireEvent.click(link(container, 'b2'));
    expect(activeBoardId.value).toBe('b2');
  });
});

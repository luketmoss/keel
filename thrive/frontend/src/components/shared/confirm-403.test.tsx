// #403: every window.confirm is an in-app dialog that names the thing and the
// action. The copy is the design note's (thrive/docs/design/403-in-app-confirms.md).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, act } from '@testing-library/preact';
import { h } from 'preact';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ask } from '../../state/confirm';
import { ConfirmModal } from './confirm-modal';
import {
  deleteWorkoutCopy,
  deleteTemplateCopy,
  deleteExerciseCopy,
  removeExerciseCopy,
  discardWorkoutCopy,
  replaceSetsCopy,
  discardChangesCopy,
  deleteLabelCopy,
  finishUnsyncedCopy,
} from './confirm-copy';
import { mountConfirmHost, confirmText, confirmDialog, answerConfirm, openedConfirm } from './confirm-test-utils';

beforeEach(() => {
  mountConfirmHost();
});
afterEach(cleanup);

describe('no browser dialog is left (AC1)', () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? walk(p) : [p];
    });
  it('no confirm( call remains in the non-test sources', () => {
    const offenders = walk('src')
      .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.|confirm-test-utils/.test(f))
      .filter((f) => /(^|[^\w.])confirm\(|window\.confirm/.test(readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '')));
    expect(offenders).toEqual([]);
  });
});

describe('the copy (AC2, AC3, AC5)', () => {
  const w = { name: 'Push Day', type: 'weight' as const, date: '2026-09-12' };

  it('delete a workout: name, date and logged sets', () => {
    expect(deleteWorkoutCopy(w, 18)).toEqual({
      title: 'Delete "Push Day"?',
      message: "Sat 12 Sep 2026 · its 18 logged sets go with it. This can't be undone.",
      confirmLabel: 'Delete Workout',
    });
  });
  it('one logged set is singular, and zero drops the clause', () => {
    expect(deleteWorkoutCopy(w, 1).message).toBe(
      "Sat 12 Sep 2026 · its 1 logged set goes with it. This can't be undone.",
    );
    expect(deleteWorkoutCopy(w, 0).message).toBe("Sat 12 Sep 2026. This can't be undone.");
  });
  it('a blank name falls back to the type, unquoted', () => {
    expect(deleteWorkoutCopy({ ...w, name: '  ', type: 'bike' }, 0).title).toBe('Delete Bike workout?');
    expect(deleteWorkoutCopy({ ...w, name: '', type: 'weight' }, 0).title).toBe('Delete Weight workout?');
  });
  it('delete a template', () => {
    expect(deleteTemplateCopy('Push Day', 6)).toEqual({
      title: 'Delete the template "Push Day"?',
      message: "Its 6 exercises go with it. Workouts you've logged from it are kept. This can't be undone.",
      confirmLabel: 'Delete Template',
    });
    expect(deleteTemplateCopy('Push Day', 1).message).toMatch(/^Its 1 exercise goes with it\./);
    expect(deleteTemplateCopy('Push Day', 0).message).toBe(
      "Workouts you've logged from it are kept. This can't be undone.",
    );
  });
  it('delete an exercise', () => {
    expect(deleteExerciseCopy('Bench Press')).toEqual({
      title: 'Delete "Bench Press" from your exercises?',
      message: "This can't be undone.",
      confirmLabel: 'Delete Exercise',
    });
  });
  it('remove an exercise from the workout; zero drops the message', () => {
    expect(removeExerciseCopy('Bench Press', 4)).toEqual({
      title: 'Remove "Bench Press" from this workout?',
      message: 'Its 4 logged sets are deleted.',
      confirmLabel: 'Remove Exercise',
    });
    expect(removeExerciseCopy('Bench Press', 1).message).toBe('Its 1 logged set is deleted.');
    expect(removeExerciseCopy('Bench Press', 0).message).toBe('');
  });
  it('discard the workout in progress', () => {
    expect(discardWorkoutCopy(12)).toEqual({
      title: 'Discard this workout?',
      message: "Its 12 logged sets are deleted, and it won't appear in your activities.",
      confirmLabel: 'Discard Workout',
    });
    expect(discardWorkoutCopy(0).message).toBe("It won't appear in your activities.");
  });
  it('replace sets with last time', () => {
    expect(replaceSetsCopy('Bench Press', 5, 3)).toEqual({
      title: 'Replace your 5 "Bench Press" sets with last time\'s 3?',
      message: "2 sets are removed, and the rest take last time's weights and reps.",
      confirmLabel: 'Replace Sets',
    });
    expect(replaceSetsCopy('Bench Press', 4, 3).message).toMatch(/^1 set is removed/);
  });
  it('discard unsaved edits says what is being edited, and Cancel reads Keep Editing', () => {
    for (const thing of ['workout', 'template', 'plan'] as const) {
      expect(discardChangesCopy(thing)).toEqual({
        title: 'Discard your changes?',
        message: `Your edits to this ${thing} won't be saved.`,
        confirmLabel: 'Discard Changes',
        cancelLabel: 'Keep Editing',
      });
    }
  });
  it('delete a label', () => {
    expect(deleteLabelCopy('Push', 7)).toEqual({
      title: 'Delete the label "Push"?',
      message: "7 exercises use it and will lose it. This can't be undone.",
      confirmLabel: 'Delete Label',
    });
    expect(deleteLabelCopy('Push', 1).message).toMatch(/^1 exercise uses it/);
    expect(deleteLabelCopy('Push', 0).message).toBe("This can't be undone.");
  });
  it('finish with unsynced sets is not destructive', () => {
    expect(finishUnsyncedCopy(2)).toEqual({
      title: 'Finish with 2 unsynced sets?',
      message: "They're saved on this phone and will sync next time you open Thrive.",
      confirmLabel: 'Finish Anyway',
      cancelLabel: 'Not Yet',
      danger: false,
    });
    expect(finishUnsyncedCopy(1).title).toBe('Finish with 1 unsynced set?');
  });
  it('no confirming button is a bare verb or OK', () => {
    const all = [
      deleteWorkoutCopy(w, 1),
      deleteTemplateCopy('t', 1),
      deleteExerciseCopy('e'),
      removeExerciseCopy('e', 1),
      discardWorkoutCopy(1),
      replaceSetsCopy('e', 2, 1),
      discardChangesCopy('workout'),
      deleteLabelCopy('l', 1),
      finishUnsyncedCopy(1),
    ];
    for (const c of all) expect(c.confirmLabel).not.toMatch(/^(OK|Delete|Remove|Discard|Replace|Finish)$/);
  });
});

describe('the dialog (AC3, AC4, AC6)', () => {
  const opener = () => {
    const b = document.createElement('button');
    b.textContent = 'Delete Workout';
    document.body.appendChild(b);
    b.focus();
    return b;
  };

  it('a destructive confirm is a danger button; the unsynced one is primary', async () => {
    void ask(deleteExerciseCopy('Bench Press'));
    await openedConfirm();
    expect(confirmText()).toMatchObject({ confirm: 'Delete Exercise', confirmIsDanger: true, cancel: 'Cancel' });
    await answerConfirm(false);
    void ask(finishUnsyncedCopy(2));
    await openedConfirm();
    expect(confirmText()).toMatchObject({ confirm: 'Finish Anyway', confirmIsDanger: false, cancel: 'Not Yet' });
  });

  it('focus is on Cancel, and Cancel resolves false and returns focus to the opener', async () => {
    const o = opener();
    const p = ask(deleteExerciseCopy('Bench Press'));
    const d = await openedConfirm();
    expect(document.activeElement).toBe(d.querySelectorAll('button')[0]);
    await answerConfirm(false);
    expect(await p).toBe(false);
    expect(confirmDialog()).toBeNull();
    expect(document.activeElement).toBe(o);
    o.remove();
  });

  it('Escape resolves false and returns focus', async () => {
    const o = opener();
    const p = ask(deleteExerciseCopy('Bench Press'));
    await openedConfirm();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(await p).toBe(false);
    await act(async () => {});
    expect(confirmDialog()).toBeNull();
    expect(document.activeElement).toBe(o);
    o.remove();
  });

  it('the overlay resolves false', async () => {
    const p = ask(deleteExerciseCopy('Bench Press'));
    await openedConfirm();
    fireEvent.click(document.querySelector('.modal-overlay')!);
    expect(await p).toBe(false);
    await act(async () => {});
    expect(confirmDialog()).toBeNull();
  });

  it('confirming resolves true and closes the dialog at once', async () => {
    const p = ask(deleteExerciseCopy('Bench Press'));
    await openedConfirm();
    await answerConfirm(true);
    expect(await p).toBe(true);
    expect(confirmDialog()).toBeNull();
  });

  it('asking again while one is open cancels the first rather than stacking', async () => {
    const first = ask(deleteExerciseCopy('Bench Press'));
    await openedConfirm();
    const second = ask(deleteExerciseCopy('Squat'));
    expect(await first).toBe(false);
    await act(async () => {});
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(confirmText()!.title).toBe('Delete "Squat" from your exercises?');
    await answerConfirm(true);
    expect(await second).toBe(true);
  });

  it('a very long name wraps instead of truncating', async () => {
    void ask(deleteExerciseCopy('x'.repeat(200)));
    await openedConfirm();
    const heading = document.querySelector('h2') as HTMLElement;
    expect(heading.style.overflowWrap).toBe('anywhere');
    expect(heading.textContent).toContain('x'.repeat(200));
  });

  it('a confirm with no message renders no empty paragraph', async () => {
    void ask(removeExerciseCopy('Bench Press', 0));
    await openedConfirm();
    expect(document.querySelector('[role="dialog"] p')).toBeNull();
  });

  it('confirmLabel is required (AC8)', () => {
    // @ts-expect-error confirmLabel has no default any more
    const bad = h(ConfirmModal, { title: 't', message: 'm', onConfirm: () => {}, onCancel: () => {} });
    expect(bad).toBeTruthy();
  });
});

// #403: an awaitable in-app confirm, replacing `window.confirm`.
//
//   if (!(await ask(deleteWorkoutCopy(w, n)))) return;
//
// `ask` publishes the dialog on a signal; <ConfirmHost /> (mounted once, in
// the app shell) renders it as a ConfirmModal and settles the promise. One
// dialog at a time: asking again while one is open cancels the open one.

import { signal } from '@preact/signals';
import type { ConfirmCopy } from '../components/shared/confirm-copy';

export interface PendingConfirm extends ConfirmCopy {
  settle: (confirmed: boolean) => void;
}

export const pendingConfirm = signal<PendingConfirm | null>(null);

export function ask(copy: ConfirmCopy): Promise<boolean> {
  pendingConfirm.value?.settle(false);
  return new Promise<boolean>((resolve) => {
    const pending: PendingConfirm = {
      ...copy,
      settle: (confirmed) => {
        // A stale settle (already replaced or answered) changes nothing.
        if (pendingConfirm.value === pending) pendingConfirm.value = null;
        resolve(confirmed);
      },
    };
    pendingConfirm.value = pending;
  });
}

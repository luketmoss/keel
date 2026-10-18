// #403: test helpers for the in-app confirm. A screen under test is rendered on
// its own, so the <ConfirmHost /> the app shell mounts is mounted here; the
// tests then answer the dialog the way a person would, by tapping a button.

import { h } from 'preact';
import { render, fireEvent, act } from '@testing-library/preact';
import { ConfirmHost } from './confirm-host';
import { pendingConfirm } from '../../state/confirm';

/** Mount the host. Call from beforeEach; testing-library's cleanup unmounts it. */
export function mountConfirmHost() {
  pendingConfirm.value = null;
  return render(h(ConfirmHost, {}));
}

export const confirmDialog = () => document.querySelector<HTMLElement>('[role="dialog"]');

/** What the open dialog says: title, message and the two button labels. */
export function confirmText() {
  const d = confirmDialog();
  if (!d) return null;
  const [cancel, confirm] = [...d.querySelectorAll('button')];
  return {
    title: d.querySelector('h2')!.textContent!,
    message: d.querySelector('p')?.textContent ?? '',
    cancel: cancel.textContent!,
    confirm: confirm.textContent!,
    confirmIsDanger: confirm.classList.contains('btn-danger'),
  };
}

/** Wait for the dialog to open. */
export async function openedConfirm() {
  await act(async () => {
    await Promise.resolve();
  });
  const d = confirmDialog();
  if (!d) throw new Error('no confirm dialog is open');
  return d;
}

/** Tap Cancel (false) or the confirming button (true) on the open dialog. */
export async function answerConfirm(confirmed: boolean) {
  const d = await openedConfirm();
  const [cancel, confirm] = [...d.querySelectorAll('button')];
  fireEvent.click(confirmed ? confirm : cancel);
  await act(async () => {
    await Promise.resolve();
  });
}

/** Whether a confirm is (now) open, after letting the asking handler run. */
export async function confirmAsked(): Promise<boolean> {
  await act(async () => {
    await Promise.resolve();
  });
  return confirmDialog() !== null;
}

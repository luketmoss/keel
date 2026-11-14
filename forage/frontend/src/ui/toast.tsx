// A short message over the app (#718): "Trip closed. Its meals are marked shopped." The region is always in
// the DOM, so a screen reader announces each new message once.
import { signal } from '@preact/signals';

export const toastText = signal<string | null>(null);

/** A button on the toast (#884's Undo): its label and what it does. Tapping it dismisses the toast first. */
export interface ToastAction {
  label: string;
  run: () => void;
}
export const toastAction = signal<ToastAction | null>(null);

let timer: ReturnType<typeof setTimeout> | undefined;

/** Show `text` for four seconds (five with an action), replacing whatever was showing. */
export function showToast(text: string, action?: ToastAction): void {
  toastText.value = text;
  toastAction.value = action ?? null;
  clearTimeout(timer);
  timer = setTimeout(
    () => {
      toastText.value = null;
      toastAction.value = null;
    },
    action ? 5000 : 4000,
  );
}

export function Toast() {
  const text = toastText.value;
  const action = toastAction.value;
  return (
    <div class={text ? 'toast' : 'toast toast-empty'} role="status" aria-live="polite" data-testid="toast">
      {text ?? ''}
      {text && action && (
        <button
          type="button"
          class="toast-action"
          onClick={() => {
            toastText.value = null;
            toastAction.value = null;
            clearTimeout(timer);
            action.run();
          }}
          data-testid="toast-action"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

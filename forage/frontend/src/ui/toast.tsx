// A short message over the app (#718): "Trip closed. Its meals are marked shopped." The region is always in
// the DOM, so a screen reader announces each new message once.
import { signal } from '@preact/signals';

export const toastText = signal<string | null>(null);

let timer: ReturnType<typeof setTimeout> | undefined;

/** Show `text` for four seconds, replacing whatever was showing. */
export function showToast(text: string): void {
  toastText.value = text;
  clearTimeout(timer);
  timer = setTimeout(() => (toastText.value = null), 4000);
}

export function Toast() {
  const text = toastText.value;
  return (
    <div class={text ? 'toast' : 'toast toast-empty'} role="status" aria-live="polite" data-testid="toast">
      {text ?? ''}
    </div>
  );
}

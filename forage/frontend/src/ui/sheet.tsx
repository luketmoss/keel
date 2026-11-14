import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface Props {
  title: string;
  onClose: () => void;
  children: ComponentChildren;
  /** A close button in the header; dialogs that must be answered leave it out. */
  closable?: boolean;
  testId?: string;
  /** #707: header controls either side of the title (the food form's Cancel and Save), in place of the close button. */
  headerStart?: ComponentChildren;
  headerEnd?: ComponentChildren;
  /** A sheet as tall as the screen allows, for a long form. */
  tall?: boolean;
  /** #779: leave focus on the panel itself, so no field takes it and no keyboard opens; the content may focus a control later. */
  focusPanel?: boolean;
}

/**
 * A bottom sheet over the overlay (#706): it traps focus, closes on Escape,
 * and gives focus back to whatever opened it. The first `[data-autofocus]`
 * inside takes focus on open, else the first control.
 */
export function Sheet({
  title,
  onClose,
  children,
  closable = true,
  testId,
  headerStart,
  headerEnd,
  tall,
  focusPanel,
}: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const root = panel.current!;
    const first = focusPanel
      ? null
      : (root.querySelector<HTMLElement>('[data-autofocus]') ?? root.querySelector<HTMLElement>(FOCUSABLE));
    (first ?? root).focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (!items.length) return;
      const firstItem = items[0];
      const last = items[items.length - 1];
      // #870: with the panel itself focused (focusPanel), Shift+Tab goes to the last control and Tab to the first.
      if (e.shiftKey && (document.activeElement === firstItem || document.activeElement === root)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === root) {
        e.preventDefault();
        firstItem.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        firstItem.focus();
      }
    };
    root.addEventListener('keydown', onKey);
    return () => {
      root.removeEventListener('keydown', onKey);
      if (opener && document.contains(opener)) opener.focus();
    };
  }, []);

  const titleId = `sheet-${title.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <div class="sheet-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={panel}
        class={tall ? 'sheet sheet-tall' : 'sheet'}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid={testId}
      >
        <header class="sheet-header">
          {headerStart}
          <h2 id={titleId}>{title}</h2>
          {headerEnd}
          {closable && !headerEnd && (
            <button type="button" class="icon-btn" aria-label="Close" onClick={onClose}>
              ×
            </button>
          )}
        </header>
        <div class="sheet-body">{children}</div>
      </div>
    </div>
  );
}

interface ConfirmProps {
  title: string;
  message?: string;
  confirm: string;
  cancel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** A question with two answers, as a sheet. */
export function ConfirmSheet({ title, message, confirm, cancel, danger, onConfirm, onCancel }: ConfirmProps) {
  return (
    <Sheet title={title} onClose={onCancel} closable={false} testId="confirm">
      {message && <p class="sheet-message">{message}</p>}
      <div class="sheet-actions">
        <button type="button" class={danger ? 'btn btn-danger' : 'btn btn-primary'} onClick={onConfirm}>
          {confirm}
        </button>
        <button type="button" class="btn btn-secondary" onClick={onCancel} data-autofocus>
          {cancel}
        </button>
      </div>
    </Sheet>
  );
}

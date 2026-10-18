import { pendingConfirm } from '../../state/confirm';
import { ConfirmModal } from './confirm-modal';

/** Renders the confirm `ask()` opened, if any. Mounted once, beside the toasts. */
export function ConfirmHost() {
  const pending = pendingConfirm.value;
  if (!pending) return null;
  return (
    <ConfirmModal
      // A new question is a new dialog: fresh focus, fresh opener.
      key={pending.title + pending.message}
      title={pending.title}
      message={pending.message}
      confirmLabel={pending.confirmLabel}
      cancelLabel={pending.cancelLabel}
      danger={pending.danger}
      onConfirm={() => pending.settle(true)}
      onCancel={() => pending.settle(false)}
    />
  );
}

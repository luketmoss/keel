import { useEffect, useRef, useState } from 'preact/hooks';
import { useAuth } from '../auth/auth-context';

/** The header's account button, until a settings issue exists: the email and "Sign out". */
export function AccountMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!user) return null;
  const initial = (user.name || user.email).trim().charAt(0).toUpperCase();

  return (
    <div class="account" ref={root}>
      <button
        ref={button}
        type="button"
        class="account-btn"
        aria-label={`Account: ${user.email}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        data-testid="account-btn"
      >
        {initial}
      </button>
      {open && (
        <div class="account-menu" role="menu" data-testid="account-menu">
          <p class="account-email">{user.email}</p>
          <button type="button" class="account-signout" role="menuitem" onClick={logout}>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

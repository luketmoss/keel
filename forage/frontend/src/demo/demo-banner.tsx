import { useAuth } from '../auth/auth-context';

/** Under the header in demo mode. "Exit demo" is sign-out, which drops the query. */
export function DemoBanner() {
  const { logout } = useAuth();
  return (
    <div class="demo-banner" role="status" data-testid="demo-banner">
      <span>Demo — sample data, nothing is saved</span>
      <button type="button" class="demo-exit" onClick={logout}>
        Exit demo
      </button>
    </div>
  );
}

import { useEffect, useRef } from 'preact/hooks';
import { useAuth } from './auth-context';
import { ForageMark } from '../shell/forage-mark';

const TAGLINE = 'Plan meals. Shop once. Log what you eat.';

export function LoginScreen() {
  const { login, rememberedUser, ready, renewing, renewError, continueAs } = useAuth();
  const continueRef = useRef<HTMLButtonElement>(null);

  // Continue is the screen's one action; start on it. A disabled button can't
  // take focus, so this waits for GIS to be ready.
  useEffect(() => {
    if (rememberedUser && ready) continueRef.current?.focus();
  }, [!!rememberedUser, ready]);

  // Always in the DOM, so the card doesn't jump when an error arrives.
  const error = (
    <p class="login-error" role="status" aria-live="polite">
      {renewError ?? ''}
    </p>
  );

  if (rememberedUser) {
    return (
      <div class="login-screen">
        <div class="login-card">
          <ForageMark size={64} />
          <h1>Forage</h1>
          <p class="login-tagline">Welcome back{rememberedUser.name ? `, ${rememberedUser.name}` : ''}.</p>
          <button
            ref={continueRef}
            type="button"
            class="login-btn"
            onClick={continueAs}
            disabled={!ready || renewing}
            aria-busy={renewing || undefined}
          >
            Continue as {rememberedUser.email}
          </button>
          {error}
          <button type="button" class="login-link" onClick={login} disabled={!ready}>
            Use a different account
          </button>
        </div>
      </div>
    );
  }

  return (
    <div class="login-screen">
      <div class="login-card">
        <ForageMark size={64} />
        <h1>Forage</h1>
        <p class="login-tagline">{TAGLINE}</p>
        <button type="button" class="login-btn" onClick={login} disabled={!ready}>
          Sign in with Google
        </button>
        {error}
      </div>
    </div>
  );
}

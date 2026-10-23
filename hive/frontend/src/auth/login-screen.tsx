import { useEffect, useRef } from 'preact/hooks';
import { useAuth } from './auth-context';
import { HiveLogo } from '../components/shared/hive-logo';

export function LoginScreen() {
  const { login, rememberedUser, ready, renewing, renewError, continueAs } = useAuth();
  const continueRef = useRef<HTMLButtonElement>(null);

  // #609: the Continue button is the screen's one action; start on it.
  useEffect(() => {
    if (rememberedUser) continueRef.current?.focus();
  }, [!!rememberedUser]);

  if (rememberedUser) {
    return (
      <div class="login-screen">
        <div class="login-card">
          <HiveLogo size={64} class="login-logo" />
          <h1>Hive</h1>
          <p>Welcome back{rememberedUser.name ? `, ${rememberedUser.name}` : ''}.</p>
          <button
            ref={continueRef}
            class="login-btn"
            onClick={continueAs}
            disabled={!ready || renewing}
            aria-busy={renewing || undefined}
          >
            Continue as {rememberedUser.email}
          </button>
          <p class="login-error" role="status" aria-live="polite">
            {renewError ?? ''}
          </p>
          <button class="login-link" onClick={login} disabled={!ready}>
            Use a different account
          </button>
        </div>
      </div>
    );
  }

  return (
    <div class="login-screen">
      <div class="login-card">
        <HiveLogo size={64} class="login-logo" />
        <h1>Hive</h1>
        <p>Plan. Track. Do.</p>
        <button class="login-btn" onClick={login}>
          Sign in with Google
        </button>
        <p class="login-error" role="status" aria-live="polite">
          {renewError ?? ''}
        </p>
      </div>
    </div>
  );
}

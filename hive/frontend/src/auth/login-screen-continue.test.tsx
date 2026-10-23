import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/preact';
import { LoginScreen } from './login-screen';

let state: any;
vi.mock('./auth-context', () => ({ useAuth: () => state }));
vi.mock('../components/shared/hive-logo', () => ({ HiveLogo: () => <div /> }));

const FAILED = 'Could not sign you in. Try again, or use a different account.';

const base = () => ({
  login: vi.fn(),
  continueAs: vi.fn(),
  ready: true,
  renewing: false,
  renewError: null as string | null,
  rememberedUser: { email: 'me@example.com', name: 'Me', picture: '' } as any,
});

describe('LoginScreen with a remembered user (#609)', () => {
  afterEach(cleanup);
  beforeEach(() => {
    state = base();
  });

  it('state 3: tagline names the user and the primary button names the email', () => {
    const { container, getByRole } = render(<LoginScreen />);
    expect(container.querySelector('.login-card p')!.textContent).toBe('Welcome back, Me.');
    fireEvent.click(getByRole('button', { name: 'Continue as me@example.com' }));
    expect(state.continueAs).toHaveBeenCalledTimes(1);
  });

  it('state 3: a user with no name gets "Welcome back."', () => {
    state.rememberedUser = { email: 'me@example.com', name: '', picture: '' };
    const { container } = render(<LoginScreen />);
    expect(container.querySelector('.login-card p')!.textContent).toBe('Welcome back.');
  });

  it('state 3: "Use a different account" opens the chooser', () => {
    const { getByRole } = render(<LoginScreen />);
    const link = getByRole('button', { name: 'Use a different account' });
    expect(link.className).toBe('login-link');
    fireEvent.click(link);
    expect(state.login).toHaveBeenCalledTimes(1);
  });

  it('state 3: focus starts on Continue', () => {
    const { getByRole } = render(<LoginScreen />);
    expect(document.activeElement).toBe(getByRole('button', { name: /Continue as/ }));
  });

  it('state 3: the status line is in the DOM and empty', () => {
    const { getByRole } = render(<LoginScreen />);
    const status = getByRole('status');
    expect(status.className).toBe('login-error');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.textContent).toBe('');
  });

  it('state 4: busy disables Continue with aria-busy, keeps its label, and leaves the link enabled', () => {
    state.renewing = true;
    const { getByRole } = render(<LoginScreen />);
    const btn = getByRole('button', { name: 'Continue as me@example.com' }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute('aria-busy')).toBe('true');
    expect((getByRole('button', { name: 'Use a different account' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('state 3: Continue is not aria-busy when idle', () => {
    const { getByRole } = render(<LoginScreen />);
    expect(getByRole('button', { name: /Continue as/ }).hasAttribute('aria-busy')).toBe(false);
  });

  it('state 5: the failure line shows, Continue is enabled again and the link is still offered', () => {
    state.renewError = FAILED;
    const { getByRole } = render(<LoginScreen />);
    expect(getByRole('status').textContent).toBe(FAILED);
    expect((getByRole('button', { name: /Continue as/ }) as HTMLButtonElement).disabled).toBe(false);
    expect(getByRole('button', { name: 'Use a different account' })).toBeTruthy();
  });

  it('state 6: both buttons are disabled until GIS is ready', () => {
    state.ready = false;
    const { getByRole } = render(<LoginScreen />);
    expect((getByRole('button', { name: /Continue as/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((getByRole('button', { name: 'Use a different account' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('state 1: with no remembered user the plain screen shows, with an empty status line', () => {
    state.rememberedUser = null;
    const { container, getByRole, queryByText } = render(<LoginScreen />);
    expect(container.querySelector('.login-card p')!.textContent).toBe('Plan. Track. Do.');
    expect(getByRole('button', { name: 'Sign in with Google' })).toBeTruthy();
    expect(queryByText(/Continue as/)).toBeNull();
    expect(getByRole('status').textContent).toBe('');
  });

  it('state 1: the plain Sign in button is enabled before GIS is ready (a tap does nothing)', () => {
    state.rememberedUser = null;
    state.ready = false;
    const { getByRole } = render(<LoginScreen />);
    expect((getByRole('button', { name: 'Sign in with Google' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('state 2: a failed fresh sign-in shows the line under the button and the button retries', () => {
    state.rememberedUser = null;
    state.renewError = FAILED;
    const { getByRole } = render(<LoginScreen />);
    expect(getByRole('status').textContent).toBe(FAILED);
    fireEvent.click(getByRole('button', { name: 'Sign in with Google' }));
    expect(state.login).toHaveBeenCalledTimes(1);
  });
});

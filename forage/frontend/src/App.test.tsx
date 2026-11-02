// #704: the four tabs, the hash, and each tab's empty state.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import App from './App';
import { TABS } from './shell/tabs';
import { _resetPlan } from './plan/plan-store';
import { fakeApi } from './test-api';

function signIn() {
  localStorage.setItem('forage_user', JSON.stringify({ email: 'luke@example.com', name: 'Luke', picture: '' }));
  localStorage.setItem('forage_token', 'tok');
  localStorage.setItem('forage_token_expiry', String(Date.now() + 3_600_000));
}

function go(hash: string) {
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

function tabs() {
  return screen.getAllByRole('link').filter((a) => a.closest('nav'));
}

beforeEach(() => {
  localStorage.clear();
  signIn();
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  localStorage.clear();
  document.head.querySelectorAll('script').forEach((s) => s.remove());
  window.history.replaceState(null, '', '/');
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  _resetPlan();
});

describe('the tab bar', () => {
  it('is a nav labelled Forage with Plan, Shop, Eaten, Library in order', () => {
    render(<App />);
    expect(screen.getByRole('navigation', { name: 'Forage' })).toBeDefined();
    expect(tabs().map((a) => a.textContent)).toEqual(['Plan', 'Shop', 'Eaten', 'Library']);
    expect(tabs().map((a) => a.getAttribute('href'))).toEqual(['#/plan', '#/shop', '#/eaten', '#/library']);
  });

  it('opens Plan by default and rewrites the empty hash without a history entry', () => {
    const push = vi.spyOn(window.history, 'pushState');
    render(<App />);
    expect(window.location.hash).toBe('#/plan');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Plan');
    expect(screen.getByTestId('tab-plan').getAttribute('aria-current')).toBe('page');
    expect(push).not.toHaveBeenCalled();
  });

  it.each(TABS.map((t) => [t.id, t.label]))('selecting %s shows its header and marks it current', (id, label) => {
    render(<App />);
    go(`#/${id}`);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(label);
    for (const t of TABS) {
      expect(screen.getByTestId(`tab-${t.id}`).getAttribute('aria-current')).toBe(t.id === id ? 'page' : null);
    }
    expect(window.location.hash).toBe(`#/${id}`);
  });

  it('reloading on #/shop opens Shop', () => {
    window.history.replaceState(null, '', '/#/shop');
    render(<App />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Shop');
  });

  it('an unknown hash opens Plan', () => {
    window.history.replaceState(null, '', '/#/settings');
    render(<App />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Plan');
    expect(window.location.hash).toBe('#/plan');
  });

  it('back returns to the previous tab', () => {
    render(<App />);
    go('#/eaten');
    go('#/plan');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Plan');
  });

  it('tapping the current tab stays put and scrolls to the top', () => {
    const scroll = vi.spyOn(window, 'scrollTo');
    render(<App />);
    const plan = screen.getByTestId('tab-plan');
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    plan.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(scroll).toHaveBeenCalledWith({ top: 0 });
  });

  it('a tab that is not current is a plain link', () => {
    render(<App />);
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    screen.getByTestId('tab-shop').dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});

describe('empty states', () => {
  const COPY: Record<string, [string, string]> = {
    plan: ['Nothing planned yet', 'Meals you plan will show here, by day, with their calories.'],
    shop: ['No shopping list', 'When you plan meals, the groceries you need will collect here, grouped by store.'],
    eaten: ['Nothing logged', 'What you eat will show here by day, with its calories and macros.'],
    library: ['No foods yet', 'Foods you use in recipes and logs will be kept here, with their nutrition.'],
  };

  it.each(Object.entries(COPY))('%s names what will appear, with no control', async (id, [heading, sentence]) => {
    // #709: Plan reads the plan first; with nothing planned it shows the empty state.
    fakeApi();
    render(<App />);
    go(`#/${id}`);
    const screenEl = screen.getByTestId(`screen-${id}`);
    await waitFor(() => expect(screenEl.querySelector('h2')!.textContent).toBe(heading));
    expect(screenEl.querySelector('h2')!.textContent).toBe(heading);
    expect(screenEl.querySelector('p')!.textContent).toBe(sentence);
    // #707: Library's Recipes | Foods switch is the only control.
    const controls = [...screenEl.querySelectorAll('button, a, input')].filter((el) => !el.closest('.segmented'));
    expect(controls.length).toBe(0);
  });
});

describe('the account menu', () => {
  it('shows the initial, opens on tap and closes on Escape', () => {
    render(<App />);
    const btn = screen.getByTestId('account-btn');
    expect(btn.textContent).toBe('L');
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(btn);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('account-menu')).toBeNull();
  });
});

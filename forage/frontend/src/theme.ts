// Light and dark follow the system setting. There is no toggle yet: index.html
// sets data-theme before first paint, and this keeps it current while open.

const QUERY = '(prefers-color-scheme: dark)';

export function applySystemTheme() {
  const dark = window.matchMedia(QUERY).matches;
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
}

/** Apply the theme now and on every system change. Returns a stop function. */
export function followSystemTheme(): () => void {
  applySystemTheme();
  const mql = window.matchMedia(QUERY);
  mql.addEventListener('change', applySystemTheme);
  return () => mql.removeEventListener('change', applySystemTheme);
}

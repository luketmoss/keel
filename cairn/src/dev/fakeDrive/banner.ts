/* A permanently visible marker that this session is running against the
   fake Drive — #93's acceptance criterion 9: seeded fixtures must never be
   mistaken for a real account's real trips. Plain DOM rather than a React
   component: `installFakeDrive` runs before `main.tsx` calls `createRoot`,
   so there's no React tree yet to mount into, and this banner needs to
   outlive route changes and re-renders without being wired into either. */

const BANNER_ID = 'cairn-fake-drive-banner'

export function mountBanner(): void {
  if (document.getElementById(BANNER_ID)) return

  const banner = document.createElement('div')
  banner.id = BANNER_ID
  banner.textContent = 'FAKE DRIVE — dev only'
  banner.style.cssText = [
    'position: fixed',
    'bottom: 12px',
    'left: 12px',
    'z-index: 999999',
    'padding: 4px 10px',
    'border-radius: 999px',
    'background: #f1a33c',
    'color: #1a1300',
    'font: 600 12px system-ui, sans-serif',
    'letter-spacing: 0.02em',
    'pointer-events: none',
    'box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35)',
  ].join(';')
  document.body.appendChild(banner)
}

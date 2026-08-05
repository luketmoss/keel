/* Entry point for #93's dev-only fake Drive — the single thing `main.tsx`
   imports, and only via a dynamic `import()` behind `import.meta.env.DEV`
   so nothing under `src/dev/` reaches a production bundle (acceptance
   criterion 10). Everything else in this directory is wired together
   here rather than imported piecemeal from `main.tsx`, so that guard is
   the only place the boundary has to be maintained. */

import { FakeDriveStore } from './store'
import { installFetchInterceptor, forceNextRequest401 } from './fetchInterceptor'
import { buildFixtureFiles, FAKE_ACCOUNT } from './fixtures'
import { installFakeIdentity } from './fakeIdentity'
import { mountBanner } from './banner'

export interface FakeDriveConsole {
  account: string
  /** Fails the *next* Drive request of any kind with a 401 — drives the
      real app into `token-expired`/`Reconnect` exactly as an expired real
      token would. Acceptance criterion 7. */
  force401: () => void
  /** Every file currently in the fake Drive — the console-verifiable
      listing acceptance criterion 4 asks for. */
  dump: () => unknown[]
  /** Clears the fake Drive back to its seeded fixtures without a reload. */
  reset: () => Promise<void>
}

export async function installFakeDrive(): Promise<void> {
  const store = new FakeDriveStore(buildFixtureFiles)
  await store.whenReady()

  installFetchInterceptor(store)
  installFakeIdentity()
  mountBanner()

  const api: FakeDriveConsole = {
    account: FAKE_ACCOUNT.emailAddress,
    force401: forceNextRequest401,
    dump: () => store.all(),
    reset: () => store.reset(),
  }
  ;(window as unknown as { __cairnFakeDrive: FakeDriveConsole }).__cairnFakeDrive = api

  // eslint-disable-next-line no-console
  console.info(
    '[cairn] fake Drive active — sign in with the button in the top bar, no real Google account involved. window.__cairnFakeDrive exposes force401(), dump(), and reset().',
  )
}

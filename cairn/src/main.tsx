import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './index.css'

const root = document.getElementById('root')
if (!root) throw new Error('#root not found')

/** #93: a dev-only fake Drive, entirely absent from a production build.
    `import.meta.env.DEV` is a compile-time constant Vite substitutes with
    the literal `false` in `vite build` — that turns this whole branch into
    dead code, and esbuild/rollup drop it, dynamic `import()` included, so
    nothing under `src/dev/` reaches `dist/` no matter how `VITE_FAKE_DRIVE`
    is set at build time. */
async function bootstrap() {
  if (import.meta.env.DEV && import.meta.env.VITE_FAKE_DRIVE === '1') {
    const { installFakeDrive } = await import('./dev/fakeDrive')
    await installFakeDrive()
  }

  createRoot(root!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void bootstrap()

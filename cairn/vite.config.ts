import { fileURLToPath } from 'node:url'
import { searchForWorkspaceRoot } from 'vite'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react()],
  server: {
    fs: {
      /* @keel/geo is a file: link to ../geo, shipped as TypeScript source with
         no build step, so the dev server has to be allowed to serve it from
         outside cairn/. The default allow-list is narrowed by naming
         anything, so the workspace root is restated. */
      allow: [searchForWorkspaceRoot(process.cwd()), fileURLToPath(new URL('../geo', import.meta.url))],
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    /* Vite loads .env.local into import.meta.env before the suite runs, so a
       developer's real keys leak in as the ambient baseline — vi.stubEnv and
       vi.unstubAllEnvs restore to that baseline, not to "unset". Blanking the
       VITE_* keys here makes the baseline the same on every machine; tests
       that need a value still opt in with vi.stubEnv. */
    env: {
      VITE_GOOGLE_MAPS_API_KEY: '',
      VITE_GOOGLE_CLIENT_ID: '',
      VITE_GOOGLE_MAPS_MAP_ID: '',
    },
  },
})

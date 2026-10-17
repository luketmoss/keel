import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react()],
  resolve: {
    /* @keel/geo is a file: link to ../geo, shipped as TypeScript source with
       no build step. Left to resolve through the link, its imports of jszip
       and @tmcw/togeojson would be looked up from geo/node_modules, which a
       fresh `npm ci` in cairn/ never creates. Keeping the link path makes them
       resolve from cairn/node_modules instead, so the package needs nothing
       installed beside it and cairn gets exactly one copy of each. */
    preserveSymlinks: true,
  },
  optimizeDeps: {
    // Source to be compiled with cairn's own pipeline, not a prebuilt dependency.
    exclude: ['@keel/geo'],
  },
  test: {
    environment: 'jsdom',
    // Vitest externalizes node_modules paths; @keel/geo is TypeScript source.
    server: { deps: { inline: ['@keel/geo'] } },
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

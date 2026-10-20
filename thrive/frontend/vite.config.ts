import { fileURLToPath } from 'url';
import { defineConfig, searchForWorkspaceRoot } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  base: process.env.VITE_BASE_PATH || '/',
  resolve: {
    // @keel/geo is a file: link to ../../geo, shipped as TypeScript source with no
    // build step. Left to resolve through the link, its imports (jszip, @tmcw/togeojson)
    // would be looked up from geo/node_modules, which a fresh `npm ci` here never creates.
    // Keeping the link path resolves them from this folder's node_modules instead.
    preserveSymlinks: true,
  },
  // Source to be compiled with Thrive's own pipeline, not a prebuilt dependency.
  // geo's own imports are named here, since nothing in this folder imports them: the dev
  // server would otherwise serve jszip's CommonJS file raw, and its default import would fail.
  optimizeDeps: { exclude: ['@keel/geo'], include: ['jszip', '@tmcw/togeojson'] },
  server: {
    port: 5175,
    // global.css imports the suite token file from outside this folder (#402).
    fs: {
      allow: [searchForWorkspaceRoot(process.cwd()), fileURLToPath(new URL('../../ui/tokens', import.meta.url))],
    },
  },
  test: {
    environment: 'jsdom',
    // Vitest externalizes node_modules paths; @keel/geo is TypeScript source.
    server: { deps: { inline: ['@keel/geo'] } },
    setupFiles: ['./src/test-setup.ts'],
    // Vite loads .env.local before the suite, so a developer's real key would leak in as the
    // ambient baseline. Blanking them makes the baseline the same on every machine; a test
    // that needs a value opts in with vi.stubEnv.
    env: { VITE_GOOGLE_MAPS_API_KEY: '', VITE_THRIVE_API_URL: '' },
  },
});

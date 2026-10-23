import { fileURLToPath } from 'url';
import { defineConfig, searchForWorkspaceRoot } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  base: process.env.VITE_BASE_PATH || '/',
  // Source to be compiled with Hive's own pipeline, not a prebuilt dependency.
  optimizeDeps: { exclude: ['@keel/auth'] },
  server: {
    port: 5176,
    // global.css imports the suite token file from outside this folder (#446).
    fs: {
      allow: [searchForWorkspaceRoot(process.cwd()), fileURLToPath(new URL('../../ui/tokens', import.meta.url))],
    },
  },
  test: {
    environment: 'jsdom',
    // Vitest externalizes node_modules paths; @keel/auth is TypeScript source.
    server: { deps: { inline: ['@keel/auth'] } },
    setupFiles: ['./src/test-setup.ts'],
  },
});

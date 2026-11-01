import { fileURLToPath } from 'url';
import { defineConfig, searchForWorkspaceRoot } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  // `/` locally; #705 sets it to `/keel/forage/` for Pages.
  base: process.env.VITE_BASE_PATH || '/',
  resolve: {
    alias: {
      react: 'preact/compat',
      'react-dom': 'preact/compat',
    },
  },
  // Source to be compiled with Forage's own pipeline, not a prebuilt dependency.
  optimizeDeps: { exclude: ['@keel/auth'] },
  // 5177: cairn is 5173, thrive 5175, hive 5176.
  server: {
    port: 5177,
    // global.css imports the suite token file from outside this folder.
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

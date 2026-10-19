import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  base: '/hive/',
  server: { port: 5176 },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
});

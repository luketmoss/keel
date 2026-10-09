import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      'cloudflare:workers': fileURLToPath(new URL('./test/cloudflare-workers-stub.ts', import.meta.url)),
    },
  },
  test: {
    // The OAuth library is ESM in node_modules; inline it so the alias above
    // applies to its `cloudflare:workers` import.
    server: { deps: { inline: ['@cloudflare/workers-oauth-provider'] } },
  },
})

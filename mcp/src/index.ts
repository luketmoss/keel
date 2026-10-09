import type { Env } from './env'

export async function handle(request: Request, _env: Env): Promise<Response> {
  const { pathname } = new URL(request.url)
  if (pathname === '/health') return new Response('ok')
  return new Response('Not found', { status: 404 })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await handle(request, env)
    } catch (err) {
      console.error('unhandled', err instanceof Error ? err.message : err)
      return new Response('Internal error', { status: 500 })
    }
  },
}

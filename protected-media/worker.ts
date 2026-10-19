import { handleMediaDelivery, MEDIA_PATH_PREFIX } from '../nexus/workers/api/routes/mediaDelivery'
import { ApiError } from '../nexus/workers/api/http'
import type { Env } from '../nexus/workers/api/types'

export type MediaEnv = Pick<Env, 'MEDIA_BUCKET' | 'MEDIA_TOKEN_SECRET'> & { ALLOWED_ORIGINS?: string }

/** Dedicated private-bucket gateway. No pricing, vouchers, public object listing or write API. */
export default {
  async fetch(request: Request, env: MediaEnv): Promise<Response> {
    const origin = request.headers.get('Origin')
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean)
    const headers = new Headers({ 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'Vary': 'Origin' })
    if (origin && !allowed.includes(origin)) return new Response(null, { status: 403, headers })
    if (origin) {
      headers.set('Access-Control-Allow-Origin', origin)
      headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
      headers.set('Access-Control-Allow-Headers', 'Range')
      headers.set('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges')
    }
    if (!new URL(request.url).pathname.startsWith(MEDIA_PATH_PREFIX)) return new Response(null, { status: 404, headers })
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    try {
      const response = await handleMediaDelivery(request, env as Env)
      const result = new Response(response.body, response)
      for (const [key, value] of headers) result.headers.set(key, value)
      // PDF and WebM are also protected documents/media, never executable HTML.
      const path = new URL(request.url).pathname.toLowerCase()
      if (response.ok && path.endsWith('.pdf')) result.headers.set('Content-Type', 'application/pdf')
      if (response.ok && path.endsWith('.webm')) result.headers.set('Content-Type', 'video/webm')
      if (response.ok && path.endsWith('.wav')) result.headers.set('Content-Type', 'audio/wav')
      if (response.ok && path.endsWith('.ogg')) result.headers.set('Content-Type', 'audio/ogg')
      return result
    } catch (error) {
      return new Response(null, { status: error instanceof ApiError ? error.status : 503, headers })
    }
  },
}

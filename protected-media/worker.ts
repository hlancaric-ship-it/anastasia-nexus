import { handleMediaDelivery, MEDIA_PATH_PREFIX } from '../nexus/workers/api/routes/mediaDelivery'
import { ApiError } from '../nexus/workers/api/http'
import type { Env } from '../nexus/workers/api/types'

export type MediaEnv = Pick<Env, 'MEDIA_BUCKET' | 'MEDIA_TOKEN_SECRET'> & { ALLOWED_ORIGINS?: string, MEDIA_BUCKET_PROTECTED?: Env['MEDIA_BUCKET'] }

/** PDF materiály leží v samostatném soukromém bucketu, video a audio v hlavním: hledá se v obou, nejdřív v hlavním. */
function withFallback(env: MediaEnv): Env {
  const primary = env.MEDIA_BUCKET, secondary = env.MEDIA_BUCKET_PROTECTED
  if (!primary || !secondary) return env as Env
  const bucket = {
    head: async (key: string) => (await primary.head(key)) ?? (await secondary.head(key)),
    get: async (key: string, options?: unknown) => (await primary.get(key, options as never)) ?? (await secondary.get(key, options as never)),
  } as unknown as Env['MEDIA_BUCKET']
  return { ...env, MEDIA_BUCKET: bucket } as Env
}

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
    // Video/audio only for the library player (CORS request from an allowed origin). Opening the link directly,
    // "Save as" or a download manager sends no Origin / navigates as a document, so it gets 403. PDFs open in a tab.
    const isDocument = new URL(request.url).pathname.toLowerCase().endsWith('.pdf')
    const dest = request.headers.get('Sec-Fetch-Dest')
    if (!isDocument && (!origin || (dest && !['video', 'audio', 'empty', 'track'].includes(dest)))) {
      return new Response(null, { status: 403, headers })
    }
    try {
      const response = await handleMediaDelivery(request, withFallback(env))
      const result = new Response(response.body, response)
      for (const [key, value] of headers) result.headers.set(key, value)
      if (!isDocument) result.headers.set('Content-Disposition', 'inline')
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

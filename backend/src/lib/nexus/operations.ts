import { z } from 'zod'
import { requestIdHeaders } from '../observability/log'

const item = z.object({
  id: z.string().min(1).max(256), type: z.string().min(1).max(128),
  state: z.enum(['PLANNED','APPROVED','EXECUTING','EXECUTED','FAILED','UNKNOWN','SUPERSEDED','ABANDONED','RECEIVED','PROCESSING','PROCESSED','NEEDS_REVIEW']),
  attempt: z.number().int().nonnegative(), updatedAt: z.string().min(1).max(40),
  statusLabel: z.string().min(1).max(120), needsReview: z.boolean(),
})
const result = z.object({ ok: z.literal(true), version: z.literal(1), tenantId: z.string(),
  kind: z.enum(['executions','events']), count: z.number().int().nonnegative(),
  limit: z.number().int(), offset: z.number().int(), items: z.array(item).max(100) })

export function operationsPage(query: Record<string, unknown>) {
  const kind = query.kind ?? 'executions'
  const parse = (value: unknown, fallback: number, min: number, max: number) => {
    if (value === undefined) return fallback
    if (typeof value !== 'string' || !/^\d+$/.test(value)) throw new Error('INVALID_OPERATIONS_PAGE')
    const n = Number(value)
    if (!Number.isSafeInteger(n) || n < min || n > max) throw new Error('INVALID_OPERATIONS_PAGE')
    return n
  }
  if (kind !== 'executions' && kind !== 'events') throw new Error('INVALID_OPERATIONS_PAGE')
  if (Object.keys(query).some(key => !['kind','limit','offset'].includes(key))) throw new Error('INVALID_OPERATIONS_PAGE')
  return { kind, limit: parse(query.limit, 25, 1, 100), offset: parse(query.offset, 0, 0, 10_000) } as const
}

export async function loadOperations(page: ReturnType<typeof operationsPage>, env: Record<string,string|undefined> = process.env, fetchImpl = fetch) {
  const pricing = env.NEXUS_PRICING_URL
  const raw = env.NEXUS_OPERATIONS_URL ?? (pricing && /\/pricing\/?$/.test(pricing) ? pricing.replace(/\/pricing\/?$/, '/operations') : undefined)
  if (!raw || !env.NEXUS_PRICING_API_KEY || !env.NEXUS_TENANT_ID) throw new Error('NEXUS_OPERATIONS_UNAVAILABLE')
  const url = new URL(raw)
  if (url.username || url.password || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname)))) {
    throw new Error('NEXUS_OPERATIONS_UNAVAILABLE')
  }
  url.search = new URLSearchParams({ ...page, limit: String(page.limit), offset: String(page.offset), tenantId: env.NEXUS_TENANT_ID }).toString()
  const response = await fetchImpl(url, { headers: { authorization: `Bearer ${env.NEXUS_PRICING_API_KEY}`, ...requestIdHeaders() },
    redirect: 'error', signal: AbortSignal.timeout(5000) })
  if (!response.ok) throw new Error('NEXUS_OPERATIONS_UNAVAILABLE')
  const parsed = result.parse(await response.json())
  if (parsed.tenantId !== env.NEXUS_TENANT_ID || parsed.kind !== page.kind || parsed.limit !== page.limit || parsed.offset !== page.offset ||
      !Number.isSafeInteger(parsed.count) || parsed.items.length > page.limit || parsed.count < parsed.items.length) throw new Error('NEXUS_OPERATIONS_UNAVAILABLE')
  // Zod strips every unlisted field, including an accidentally returned payload.
  return { kind: parsed.kind, count: parsed.count, limit: parsed.limit, offset: parsed.offset, items: parsed.items }
}

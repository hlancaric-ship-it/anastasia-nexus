import { createHash, createHmac } from 'node:crypto'

export type MedusaDelivery = { tenantId: string; event: 'order.placed' | 'customer.created' | 'order.canceled' | 'payment.captured'; targetId: string; occurrenceId?: string }
export class MedusaDeliveryError extends Error {
  constructor(readonly retryable: boolean) { super('NEXUS_EVENT_DELIVERY_FAILED') }
}

/** Only server configuration, never event payloads, can select a destination or tenant. */
export function deliveryConfig(env: NodeJS.ProcessEnv = process.env) {
  if (!env.NEXUS_MEDUSA_WEBHOOK_URL) return null
  try {
    const url = new URL(env.NEXUS_MEDUSA_WEBHOOK_URL)
    if (url.username || url.password || url.search || url.hash ||
        (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) ||
        !env.NEXUS_MEDUSA_WEBHOOK_SECRET || !/^[a-z0-9_-]{2,32}$/.test(env.NEXUS_TENANT_ID ?? '')) throw new Error()
    return { url, secret: env.NEXUS_MEDUSA_WEBHOOK_SECRET, tenantId: env.NEXUS_TENANT_ID! }
  } catch { throw new MedusaDeliveryError(false) }
}

export function deliveryId(input: MedusaDelivery): string {
  if (!/^[a-z0-9_-]{2,32}$/.test(input.tenantId) || !['order.placed', 'customer.created', 'order.canceled', 'payment.captured'].includes(input.event) ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(input.targetId)) throw new MedusaDeliveryError(false)
  if (input.event === 'payment.captured') {
    // One payment can have multiple captures. Native workflow event groups survive bus retries.
    if (typeof input.occurrenceId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(input.occurrenceId)) throw new MedusaDeliveryError(false)
    return 'mdlv_' + createHash('sha256').update(JSON.stringify([2, input.tenantId, input.event, input.targetId, input.occurrenceId])).digest('hex')
  }
  if (input.occurrenceId !== undefined) throw new MedusaDeliveryError(false)
  // Creation and terminal cancellation happen once per entity; preserve their original keys.
  return 'mdlv_' + createHash('sha256').update(JSON.stringify([1, input.tenantId, input.event, input.targetId])).digest('hex')
}

/** A receipt confirms durable intake only, never payment, booking or fulfilment. */
export async function deliverMedusaEvent(input: MedusaDelivery, env: NodeJS.ProcessEnv = process.env, fetchImpl = fetch) {
  const eventId = deliveryId(input)
  const config = deliveryConfig(env)
  if (!config || config.tenantId !== input.tenantId) throw new MedusaDeliveryError(false)
  const body = JSON.stringify({ id: eventId, event: input.event, data: { id: input.targetId } })
  const timestamp = String(Math.floor(Date.now() / 1000))
  const signature = createHmac('sha256', config.secret).update(`${timestamp}.${body}`).digest('hex')
  try {
    const response = await fetchImpl(config.url, { method: 'POST', body, redirect: 'error',
      signal: AbortSignal.timeout(5000), headers: { 'content-type': 'application/json',
        'x-medusa-delivery': eventId, 'x-medusa-signature': `t=${timestamp},v1=${signature}` } })
    if (!response.ok) {
      await response.body?.cancel().catch(() => {})
      throw new MedusaDeliveryError(response.status === 408 || response.status === 429 || response.status >= 500)
    }
    // Limit and time-bound the entire acknowledgement, not just response headers.
    const reader = response.body?.getReader()
    if (!reader) throw new MedusaDeliveryError(true)
    let raw = ''
    const decoder = new TextDecoder()
    let bytes = 0
    try {
      for (;;) {
        const chunk = await reader.read()
        if (chunk.done) break
        bytes += chunk.value.byteLength
        if (bytes > 4096) { await reader.cancel(); throw new MedusaDeliveryError(true) }
        raw += decoder.decode(chunk.value, { stream: true })
      }
      raw += decoder.decode()
    } finally { reader.releaseLock() }
    const ack = JSON.parse(raw)
    if (ack?.received !== true || ack.eventId !== eventId || ack.event !== input.event || ack.tenantId !== input.tenantId) {
      throw new MedusaDeliveryError(true)
    }
    return { received: true as const, eventId }
  } catch (error) {
    // No raw fetch/provider error or response enters workflow storage, logs, or the caller.
    if (error instanceof MedusaDeliveryError) throw error
    throw new MedusaDeliveryError(true)
  }
}

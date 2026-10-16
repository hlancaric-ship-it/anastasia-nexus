import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { z } from 'zod'
import { EdgeIngestError, verifyEdgeSignature } from '../../../../modules/ops-audit/edge-ingest'
import { BookingSyncError, inspectOrderBooking, synchronizeOrderBooking } from '../../../../lib/nexus/booking-order'
import { recordEvent } from '../../../../lib/observability/events'

const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/)
const bodySchema = z.object({ version: z.literal(1), tenantId: z.string(), operationId: id, orderId: id,
  mode: z.enum(['inspect', 'synchronize']) }).strict()

/** Dedicated machine capability: only synchronize a booking from its authoritative order. */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  res.setHeader('Cache-Control', 'no-store')
  try {
    if (req.headers.origin !== undefined) return res.status(403).json({ error: 'BOOKING_SYNC_UNAUTHORIZED' })
    const tenantId = process.env.NEXUS_TENANT_ID
    if (!tenantId || !/^[a-z0-9_-]{2,32}$/.test(tenantId)) throw new BookingSyncError(503)
    const raw = (req as MedusaRequest & { rawBody?: Buffer | string }).rawBody
    const rawBody = Buffer.isBuffer(raw) ? raw.toString('utf8') : typeof raw === 'string' ? raw : ''
    verifyEdgeSignature(process.env.NEXUS_BOOKING_SYNC_SECRET, req.headers['x-nexus-timestamp'], req.headers['x-nexus-signature'], rawBody)
    let parsed: unknown
    try { parsed = JSON.parse(rawBody) } catch { return res.status(400).json({ error: 'BOOKING_SYNC_INVALID' }) }
    const result = bodySchema.safeParse(parsed)
    if (!result.success) return res.status(400).json({ error: 'BOOKING_SYNC_INVALID' })
    const input = result.data
    if (input.tenantId !== tenantId) return res.status(403).json({ error: 'BOOKING_SYNC_UNAUTHORIZED' })
    const actual = await (input.mode === 'inspect' ? inspectOrderBooking : synchronizeOrderBooking)(req.scope, input.orderId)
    await recordEvent(req.scope, actual.synchronized ? 'info' : 'warn', 'booking', actual.synchronized ? 'nexus_sync_verified' : 'nexus_sync_needs_review',
      { order_id: input.orderId, entity_id: input.operationId, mode: input.mode })
    return res.json({ ok: true, version: 1, tenantId, operationId: input.operationId, orderId: input.orderId,
      synchronized: actual.synchronized, result: actual.result })
  } catch (error) {
    const status = error instanceof EdgeIngestError || error instanceof BookingSyncError ? error.status : 503
    await recordEvent(req.scope, 'warn', 'booking', 'nexus_sync_failed', { http_status: status })
    return res.status(status).json({ error: 'BOOKING_SYNC_UNVERIFIED' })
  }
}

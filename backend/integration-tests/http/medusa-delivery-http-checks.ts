import { createServer } from 'node:http'
import { createHmac, randomUUID } from 'node:crypto'
import { Modules } from '@medusajs/framework/utils'
import { createCustomersWorkflow } from '@medusajs/medusa/core-flows'
import type { IEventBusModuleService, IWorkflowEngineService } from '@medusajs/framework/types'
import { deliveryId } from '../../src/lib/nexus/medusa-delivery'
import { MEDUSA_DELIVERY_WORKFLOW, medusaEventDeliveryWorkflow } from '../../src/workflows/medusa-event-delivery'

/** Real native event + Medusa workflow/PostgreSQL; HTTP receipt fixture, not a live D1 deployment. */
export async function verifyMedusaDelivery({ container, evidence }: any) {
  const keys = ['NEXUS_MEDUSA_WEBHOOK_URL', 'NEXUS_MEDUSA_WEBHOOK_SECRET'] as const
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]))
  const secret = 'synthetic-delivery-signing-secret'
  const engine = container.resolve(Modules.WORKFLOW_ENGINE) as IWorkflowEngineService
  let mode: 'normal' | 'lost-reply' | 'reject' | 'unavailable' = 'normal'
  const attempts = new Map<string, number>()
  const stored = new Set<string>()
  let signed = true
  let checkpointBeforeSend = true
  const server = createServer(async (req, res) => {
    try {
      const chunks: Buffer[] = []
      for await (const chunk of req) chunks.push(Buffer.from(chunk))
      const raw = Buffer.concat(chunks).toString()
      const payload = JSON.parse(raw)
      const id = payload.id
      attempts.set(id, (attempts.get(id) ?? 0) + 1)
      const parts = Object.fromEntries(String(req.headers['x-medusa-signature']).split(',').map(part => part.split('=')))
      signed &&= parts.v1 === createHmac('sha256', secret).update(`${parts.t}.${raw}`).digest('hex') && req.headers['x-medusa-delivery'] === id
      expect(Object.keys(payload).sort()).toEqual(['data', 'event', 'id'])
      expect(Object.keys(payload.data)).toEqual(['id'])
      const executions = await engine.listWorkflowExecutions({ workflow_id: MEDUSA_DELIVERY_WORKFLOW, transaction_id: id })
      checkpointBeforeSend &&= executions.length === 1
      expect(JSON.stringify(executions)).not.toContain(secret)
      expect(JSON.stringify(executions)).not.toContain('@example.test')
      if (mode === 'reject') { res.writeHead(409); res.end('{}'); return }
      if (mode === 'unavailable') { res.writeHead(503); res.end('{}'); return }
      const duplicate = stored.has(id)
      stored.add(id)
      if (mode === 'lost-reply' && !duplicate) { req.socket.destroy(); return }
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ received: true, tenantId: process.env.NEXUS_TENANT_ID, eventId: id, event: payload.event, duplicate }))
    } catch { res.writeHead(500); res.end('{}') }
  })
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  const waitFor = async (fn: () => Promise<boolean>, timeout = 25_000) => {
    const deadline = Date.now() + timeout
    while (!(await fn())) {
      if (Date.now() > deadline) throw new Error('SYNTHETIC_DELIVERY_TIMEOUT')
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }
  const execution = async (id: string) => (await engine.listWorkflowExecutions({ workflow_id: MEDUSA_DELIVERY_WORKFLOW, transaction_id: id }))[0]
  const inputFor = (targetId: string) => ({ tenantId: process.env.NEXUS_TENANT_ID!, event: 'customer.created' as const, targetId })
  try {
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('SYNTHETIC_DELIVERY_ADDRESS')
    process.env.NEXUS_MEDUSA_WEBHOOK_URL = `http://127.0.0.1:${address.port}/api/webhooks/medusa`
    process.env.NEXUS_MEDUSA_WEBHOOK_SECRET = secret
    // A real native customer workflow publishes the real event consumed by the new subscriber.
    const { result: [customer] } = await createCustomersWorkflow(container).run({ input: { customersData: [{ email: `delivery-${randomUUID()}@example.test` }] } })
    const input = inputFor(customer!.id)
    const id = deliveryId(input)
    await waitFor(async () => (await execution(id))?.state === 'done')
    expect(attempts.get(id)).toBe(1)
    await medusaEventDeliveryWorkflow(container).run({ input, context: { transactionId: id } })
    expect(attempts.get(id)).toBe(1)
    evidence.push({ scenario: 'MEDUSA_NATIVE_EVENT_DURABLE_DELIVERY', status: 'PASS', checkpointBeforeSend, signed, replayRequests: 0 })

    const bus = container.resolve(Modules.EVENT_BUS) as IEventBusModuleService
    const paymentId = `pay_synthetic_${randomUUID()}`
    const occurrenceIds = [`capture_${randomUUID()}`, `capture_${randomUUID()}`]
    const captureDeliveryIds: string[] = []
    for (const group of occurrenceIds) {
      await bus.emit({ name: 'payment.captured', data: { id: paymentId }, metadata: { eventGroupId: group } })
      await bus.releaseGroupedEvents(group)
      const captureId = deliveryId({ tenantId: process.env.NEXUS_TENANT_ID!, event: 'payment.captured', targetId: paymentId, occurrenceId: group })
      captureDeliveryIds.push(captureId)
      await waitFor(async () => (await execution(captureId))?.state === 'done')
      expect(attempts.get(captureId)).toBe(1)
    }
    expect(new Set(captureDeliveryIds).size).toBe(2)
    evidence.push({ scenario: 'MEDUSA_CAPTURE_OCCURRENCE_DELIVERY', status: 'PASS', nativeBusGroups: 2, distinctDeliveries: 2 })

    mode = 'lost-reply'
    const uncertain = inputFor(`cus_synthetic_${randomUUID()}`)
    const uncertainId = deliveryId(uncertain)
    await medusaEventDeliveryWorkflow(container).run({ input: uncertain, context: { transactionId: uncertainId } })
    await waitFor(async () => (await execution(uncertainId))?.state === 'done')
    expect(attempts.get(uncertainId)).toBe(2)
    expect(stored.has(uncertainId)).toBe(true)
    evidence.push({ scenario: 'MEDUSA_DELIVERY_LOST_REPLY_RECOVERY', status: 'PASS', attempts: 2, sameInboxKey: true })

    mode = 'reject'
    const rejected = inputFor(`cus_synthetic_${randomUUID()}`)
    const rejectedId = deliveryId(rejected)
    await medusaEventDeliveryWorkflow(container).run({ input: rejected, context: { transactionId: rejectedId }, throwOnError: false })
    await waitFor(async () => (await execution(rejectedId))?.state === 'reverted')
    expect(attempts.get(rejectedId)).toBe(1)
    expect(stored.has(rejectedId)).toBe(false)
    expect((await execution(rejectedId))?.state).toBe('reverted')
    evidence.push({ scenario: 'MEDUSA_DELIVERY_PERMANENT_FAILURE', status: 'PASS', attempts: 1, state: 'reverted' })

    mode = 'unavailable'
    const unavailable = inputFor(`cus_synthetic_${randomUUID()}`)
    const unavailableId = deliveryId(unavailable)
    await medusaEventDeliveryWorkflow(container).run({ input: unavailable, context: { transactionId: unavailableId } })
    await waitFor(async () => (await execution(unavailableId))?.state === 'reverted')
    expect(attempts.get(unavailableId)).toBe(4)
    const ops = await container.resolve('ops_audit').listOpsEvents({ event: 'nexus_event_needs_review', entity_id: unavailable.targetId })
    expect(ops.length).toBeGreaterThan(0)
    expect(checkpointBeforeSend).toBe(true)
    expect(signed).toBe(true)
    evidence.push({ scenario: 'MEDUSA_DELIVERY_RETRY_EXHAUSTION', status: 'PASS', attempts: 4, state: 'reverted', needsReview: true })
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key]
      else process.env[key] = previous[key]
    }
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
}

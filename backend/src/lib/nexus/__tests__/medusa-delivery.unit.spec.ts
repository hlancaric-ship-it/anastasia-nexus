import { createHmac } from 'node:crypto'
import { deliverMedusaEvent, deliveryConfig, deliveryId } from '../medusa-delivery'

const env = { NEXUS_MEDUSA_WEBHOOK_URL: 'https://nexus.example.test/api/webhooks/medusa',
  NEXUS_MEDUSA_WEBHOOK_SECRET: 'synthetic-secret', NEXUS_TENANT_ID: 'synthetic' }
const input = { tenantId: 'synthetic', event: 'order.placed' as const, targetId: 'order_synthetic' }
const ack = () => ({ received: true, tenantId: input.tenantId, event: input.event, eventId: deliveryId(input) })

it('sends a signed minimal reference with stable identity and validates durable acknowledgement', async () => {
  const request = jest.fn(async () => new Response(JSON.stringify(ack()))) as any
  await expect(deliverMedusaEvent(input, env, request)).resolves.toEqual({ received: true, eventId: deliveryId(input) })
  const [url, options] = request.mock.calls[0]
  expect(String(url)).toBe(env.NEXUS_MEDUSA_WEBHOOK_URL)
  const [t, v1] = options.headers['x-medusa-signature'].split(',').map((v: string) => v.split('=')[1])
  expect(v1).toBe(createHmac('sha256', env.NEXUS_MEDUSA_WEBHOOK_SECRET).update(`${t}.${options.body}`).digest('hex'))
  expect(JSON.parse(options.body)).toEqual({ id: deliveryId(input), event: input.event, data: { id: input.targetId } })
  expect(options.redirect).toBe('error')
  expect(options.signal).toBeDefined()
  expect(options.headers['x-medusa-delivery']).toBe(deliveryId(input))
})

it('isolates semantic creation identities by tenant, entity and event', () => {
  expect(new Set([deliveryId(input), deliveryId({ ...input, tenantId: 'other' }),
    deliveryId({ ...input, targetId: 'order_other' }), deliveryId({ ...input, event: 'customer.created' })]).size).toBe(4)
  expect(deliveryId({ ...input })).toBe(deliveryId(input))
})

it.each(['http://external.test/webhooks', 'https://user:secret@nexus.test', 'https://nexus.test?secret=x', 'ftp://nexus.test', 'https://nexus.test/#fragment'])('rejects unsafe destinations before network: %s', async url => {
  const request = jest.fn() as any
  await expect(deliverMedusaEvent(input, { ...env, NEXUS_MEDUSA_WEBHOOK_URL: url }, request)).rejects.toMatchObject({ retryable: false })
  expect(request).not.toHaveBeenCalled()
})

it('requires explicit valid configuration and binds retries to the original tenant', async () => {
  expect(deliveryConfig({})).toBeNull()
  for (const patch of [{ NEXUS_MEDUSA_WEBHOOK_SECRET: '' }, { NEXUS_TENANT_ID: 'other' }, { NEXUS_TENANT_ID: '' }]) {
    const request = jest.fn() as any
    await expect(deliverMedusaEvent(input, { ...env, ...patch }, request)).rejects.toMatchObject({ retryable: false })
    expect(request).not.toHaveBeenCalled()
  }
})

it.each([400, 401, 403, 409, 422, 408, 429, 500, 503])('classifies HTTP %s without leaking response data', async status => {
  await expect(deliverMedusaEvent(input, env, async () => new Response('private-provider-response', { status })))
    .rejects.toMatchObject({ message: 'NEXUS_EVENT_DELIVERY_FAILED', retryable: status === 408 || status === 429 || status >= 500 })
})

it.each([{ received: false }, { eventId: 'wrong' }, { event: 'customer.created' }, { tenantId: 'other' }, { tenantId: undefined }])('never accepts a mismatched receipt %j', async patch => {
  await expect(deliverMedusaEvent(input, env, async () => new Response(JSON.stringify({ ...ack(), ...patch }))))
    .rejects.toMatchObject({ retryable: true })
})

it('keeps an ambiguous remote success retryable under the same durable inbox key', async () => {
  const ids: string[] = []
  const request = jest.fn(async (_: unknown, options: any) => {
    ids.push(options.headers['x-medusa-delivery'])
    if (ids.length === 1) throw new Error('private-network-error')
    return new Response(JSON.stringify({ ...ack(), duplicate: true }))
  }) as any
  await expect(deliverMedusaEvent(input, env, request)).rejects.toMatchObject({ message: 'NEXUS_EVENT_DELIVERY_FAILED', retryable: true })
  await expect(deliverMedusaEvent(input, env, request)).resolves.toMatchObject({ received: true })
  expect(ids).toEqual([deliveryId(input), deliveryId(input)])
})

it.each(['{', 'x'.repeat(4097)])('rejects malformed or oversized acknowledgement', async body => {
  await expect(deliverMedusaEvent(input, env, async () => new Response(body))).rejects.toMatchObject({ retryable: true })
})

it.each([{ targetId: '../foreign' }, { targetId: '' }, { event: 'payment.captured' }, { tenantId: 'BAD' }])('rejects invalid source reference %j', patch => {
  expect(() => deliveryId({ ...input, ...patch } as any)).toThrow('NEXUS_EVENT_DELIVERY_FAILED')
})

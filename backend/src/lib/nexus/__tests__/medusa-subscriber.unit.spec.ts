const run = jest.fn()
jest.mock('../../../workflows/medusa-event-delivery', () => ({ medusaEventDeliveryWorkflow: () => ({ run }) }))
jest.mock('../../observability/events', () => ({ recordEvent: jest.fn() }))
import subscriber, { config } from '../../../subscribers/nexus-medusa-events'
import { deliveryId } from '../medusa-delivery'
import { recordEvent } from '../../observability/events'

const original = { ...process.env }
beforeEach(() => {
  jest.clearAllMocks()
  process.env.NEXUS_MEDUSA_WEBHOOK_URL = 'https://nexus.example.test/api/webhooks/medusa'
  process.env.NEXUS_MEDUSA_WEBHOOK_SECRET = 'synthetic-secret'
  process.env.NEXUS_TENANT_ID = 'synthetic'
})
afterEach(() => { process.env = { ...original } })

it.each(['order.placed', 'customer.created'])('starts a native stored workflow with stable creation identity for %s', async name => {
  const event = { name, data: { id: 'entity_synthetic', tenantId: 'foreign', email: 'private@example.test' } }
  await subscriber({ event, container: {} } as any)
  const input = { tenantId: 'synthetic', event: name, targetId: 'entity_synthetic' }
  expect(run).toHaveBeenCalledWith({ input, context: { transactionId: deliveryId(input as any) } })
  expect(JSON.stringify(run.mock.calls)).not.toContain('private')
  expect(JSON.stringify(run.mock.calls)).not.toContain('secret')
  expect(config.context?.subscriberId).toBe('nexus-medusa-events-v1')
})
it('does not fabricate delivery when integration is unconfigured', async () => {
  delete process.env.NEXUS_MEDUSA_WEBHOOK_URL
  await subscriber({ event: { name: 'order.placed', data: { id: 'order_synthetic' } }, container: {} } as any)
  expect(run).not.toHaveBeenCalled()
})
it.each(['bad-config', 'storage-failure'])('surfaces and audits %s before acknowledging source event', async mode => {
  if (mode === 'bad-config') delete process.env.NEXUS_MEDUSA_WEBHOOK_SECRET
  else run.mockRejectedValueOnce(new Error('private-database-error'))
  await expect(subscriber({ event: { name: 'order.placed', data: { id: 'order_synthetic' } }, container: {} } as any))
    .rejects.toThrow('NEXUS_EVENT_DELIVERY_FAILED')
  expect(recordEvent).toHaveBeenCalledWith({}, 'error', 'webhook', 'nexus_event_needs_review', { entity_id: 'order_synthetic', source_event: 'order.placed' })
  expect(JSON.stringify((recordEvent as jest.Mock).mock.calls)).not.toContain('private')
})
it('retains native event-group identity for captured payments without copying provider data', async () => {
  const event = { name: 'payment.captured', data: { id: 'pay_synthetic', amount: 999 }, metadata: { eventGroupId: 'native_group_a' } }
  await subscriber({ event, container: {} } as any)
  expect(run).toHaveBeenCalledWith({ input: { tenantId: 'synthetic', event: 'payment.captured', targetId: 'pay_synthetic', occurrenceId: 'native_group_a' },
    context: { transactionId: expect.any(String) } })
  expect(JSON.stringify(run.mock.calls)).not.toContain('amount')
})
it('does not invent a random capture identity when native correlation is missing', async () => {
  await expect(subscriber({ event: { name: 'payment.captured', data: { id: 'pay_synthetic' } }, container: {} } as any))
    .rejects.toThrow('NEXUS_EVENT_DELIVERY_FAILED')
  expect(run).not.toHaveBeenCalled()
  expect(recordEvent).toHaveBeenCalled()
})

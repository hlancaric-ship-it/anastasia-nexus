const run = jest.fn()
jest.mock('../../../workflows/order-email-recovery', () => ({ orderEmailRecoveryWorkflow: () => ({ run }) }))
jest.mock('../../observability/events', () => ({ recordEvent: jest.fn() }))
import handler from '../../../subscribers/email-order-placed'
import { orderEmailOperationId } from '../order-recovery'
import { recordEvent } from '../../observability/events'

const originalTenant = process.env.NEXUS_TENANT_ID
beforeEach(() => { jest.clearAllMocks(); process.env.NEXUS_TENANT_ID = 'synthetic' })
afterEach(() => { if (originalTenant === undefined) delete process.env.NEXUS_TENANT_ID; else process.env.NEXUS_TENANT_ID = originalTenant })
it('persists only the trusted tenant and order reference, with stable retry identity', async () => {
  const event = { data: { id: 'order_synthetic', tenantId: 'foreign', email: 'private@example.test', total: 999 } }
  await handler({ event, container: {} } as any)
  const input = { tenantId: 'synthetic', orderId: 'order_synthetic' }
  expect(run).toHaveBeenCalledWith({ input, context: { transactionId: orderEmailOperationId(input) } })
  expect(JSON.stringify(run.mock.calls)).not.toContain('private')
  expect(JSON.stringify(run.mock.calls)).not.toContain('999')
})
it.each(['missing-tenant', 'storage-failure'])('audits %s instead of losing the background notification silently', async mode => {
  if (mode === 'missing-tenant') delete process.env.NEXUS_TENANT_ID
  else run.mockRejectedValueOnce(new Error('private storage error'))
  await expect(handler({ event: { data: { id: 'order_synthetic' } }, container: {} } as any)).rejects.toThrow('ORDER_EMAIL_WORKFLOW_START_FAILED')
  expect(recordEvent).toHaveBeenCalledWith({}, 'error', 'notification', 'order_email_needs_review', { order_id: 'order_synthetic', reason: 'WORKFLOW_START_FAILED' })
  expect(JSON.stringify((recordEvent as jest.Mock).mock.calls)).not.toContain('private')
})

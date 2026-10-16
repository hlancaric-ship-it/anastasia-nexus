jest.mock('../../notify/order', () => ({ notifyOrderPlaced: jest.fn() }))
import { notifyOrderPlaced } from '../../notify/order'
import { recoverOrderEmail, orderEmailOperationId } from '../order-recovery'

const reference = { tenantId: 'synthetic', orderId: 'order_synthetic' }
const originalTenant = process.env.NEXUS_TENANT_ID
beforeEach(() => { jest.clearAllMocks(); process.env.NEXUS_TENANT_ID = reference.tenantId })
afterEach(() => { if (originalTenant === undefined) delete process.env.NEXUS_TENANT_ID; else process.env.NEXUS_TENANT_ID = originalTenant })
const sender = notifyOrderPlaced as jest.Mock

it('keeps replay identity stable and separates tenants/orders', () => {
  expect(orderEmailOperationId(reference)).toBe(orderEmailOperationId({ ...reference }))
  expect(new Set([orderEmailOperationId(reference), orderEmailOperationId({ ...reference, tenantId: 'other' }), orderEmailOperationId({ ...reference, orderId: 'order_other' })]).size).toBe(3)
})
it.each([{ tenantId: '' }, { tenantId: 12 }, { orderId: '../foreign' }, { orderId: 123 }])('rejects invalid reference %j', patch => {
  expect(() => orderEmailOperationId({ ...reference, ...patch } as any)).toThrow('ORDER_EMAIL_REQUIRES_REVIEW')
})
it('rejects foreign tenant before reading or sending', async () => {
  await expect(recoverOrderEmail({} as any, { ...reference, tenantId: 'foreign' })).rejects.toMatchObject({ retryable: false, reason: 'TENANT_MISMATCH' })
  expect(sender).not.toHaveBeenCalled()
})
it.each([{ status: 'sent' }, { status: 'duplicate' }, { status: 'skipped', reason: 'TEMPLATE_DISABLED' }])('preserves proven or intentionally disabled result %j', async result => {
  sender.mockResolvedValueOnce(result)
  const resolve = jest.fn()
  expect(await recoverOrderEmail({ resolve } as any, reference)).toEqual(result)
  expect(resolve).not.toHaveBeenCalled()
})
it.each(['ORDER_NOT_FOUND', 'NO_EMAIL'])('does not retry missing business context: %s', async reason => {
  sender.mockResolvedValueOnce({ status: 'skipped', reason })
  await expect(recoverOrderEmail({} as any, reference)).rejects.toMatchObject({ retryable: false, reason: 'BUSINESS_CONTEXT_UNAVAILABLE' })
})
it.each([[], [{ status: 'success' }]].map(rows => [rows]))('allows bounded recovery only with absent or successful native checkpoint %j', async rows => {
  sender.mockResolvedValueOnce({ status: 'skipped', reason: 'SEND_FAILED' })
  const listNotifications = jest.fn(async () => rows)
  await expect(recoverOrderEmail({ resolve: () => ({ listNotifications }) } as any, reference)).rejects.toMatchObject({ retryable: true, reason: 'SAFE_RECEIPT_RECOVERY' })
  expect(listNotifications).toHaveBeenCalledWith({ idempotency_key: 'order.placed:order_synthetic' }, { take: 2, select: ['id', 'status'] })
  expect(sender).toHaveBeenCalledTimes(1)
})
it.each([[{ status: 'pending' }], [{ status: 'failure' }], [{ status: 'unknown' }], [{ status: 'success' }, { status: 'success' }]].map(rows => [rows]))('quarantines uncertain native checkpoint %j without another send', async rows => {
  sender.mockResolvedValueOnce({ status: 'skipped', reason: 'SEND_FAILED' })
  await expect(recoverOrderEmail({ resolve: () => ({ listNotifications: async () => rows }) } as any, reference)).rejects.toMatchObject({ retryable: false, reason: 'OUTCOME_UNCERTAIN' })
  expect(sender).toHaveBeenCalledTimes(1)
})
it('unreadable native state is never permission to resend', async () => {
  sender.mockResolvedValueOnce({ status: 'skipped', reason: 'SEND_FAILED' })
  await expect(recoverOrderEmail({ resolve: () => ({ listNotifications: async () => { throw new Error('private database error') } }) } as any, reference))
    .rejects.toMatchObject({ retryable: false, reason: 'OUTCOME_UNREADABLE', message: 'ORDER_EMAIL_REQUIRES_REVIEW' })
})

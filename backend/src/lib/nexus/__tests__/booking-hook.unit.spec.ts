import { createHmac } from 'node:crypto'
import { resolveOrderIdByPayment } from '../../../modules/entitlement/order-sync'
jest.mock('../../../modules/entitlement/order-sync', () => ({ resolveOrderIdByPayment: jest.fn() }))
import { POST } from '../../../api/hooks/nexus/booking-order/route'
import { inspectOrderBooking, synchronizeOrderBooking } from '../booking-order'
jest.mock('../booking-order', () => ({ BookingSyncError: class extends Error { constructor(readonly status: number) { super() } }, inspectOrderBooking: jest.fn(), synchronizeOrderBooking: jest.fn() }))
jest.mock('../../observability/events', () => ({ recordEvent: jest.fn() }))
const original = { ...process.env }
const secret = 'synthetic-booking-sync-secret-32-characters'
function req(patch: Record<string, unknown> = {}, headers: Record<string, string | undefined> = {}) {
  const rawBody = JSON.stringify({ version: 1, tenantId: 'synthetic', operationId: 'op_synthetic', orderId: 'order_synthetic', mode: 'inspect', ...patch })
  const timestamp = String(Math.floor(Date.now() / 1000))
  return { rawBody, scope: {}, headers: { 'x-nexus-timestamp': timestamp,
    'x-nexus-signature': createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex'), ...headers } } as any
}
function res() { const r: any = { setHeader: jest.fn(), status: jest.fn(), json: jest.fn() }; r.status.mockReturnValue(r); r.json.mockReturnValue(r); return r }
beforeEach(() => {
  jest.clearAllMocks(); process.env.NEXUS_TENANT_ID = 'synthetic'; process.env.NEXUS_BOOKING_SYNC_SECRET = secret
  ;(resolveOrderIdByPayment as jest.Mock).mockResolvedValue('order_from_payment')
  ;(inspectOrderBooking as jest.Mock).mockResolvedValue({ synchronized: true, result: 'CONFIRMED' })
  ;(synchronizeOrderBooking as jest.Mock).mockResolvedValue({ synchronized: true, result: 'CONFIRMED' })
})
afterEach(() => { process.env = { ...original } })
it.each(['inspect', 'synchronize'])('binds the %s result to the signed operation and exposes no private data', async mode => {
  const response = res(); await POST(req({ mode }), response)
  expect(response.json).toHaveBeenCalledWith({ ok: true, version: 1, tenantId: 'synthetic', operationId: 'op_synthetic', orderId: 'order_synthetic', synchronized: true, result: 'CONFIRMED' })
  expect(mode === 'inspect' ? inspectOrderBooking : synchronizeOrderBooking).toHaveBeenCalledWith({}, 'order_synthetic')
})
it.each([{ tenantId: 'other' }, { paid: true }, { orderId: '../other' }])('rejects unauthorized/extra source assertions %j', async patch => {
  const response = res(); await POST(req(patch), response)
  expect(response.status).toHaveBeenCalledWith(patch.tenantId ? 403 : 400)
  expect(inspectOrderBooking).not.toHaveBeenCalled(); expect(synchronizeOrderBooking).not.toHaveBeenCalled()
})
it.each([{ 'x-nexus-signature': '0'.repeat(64) }, { 'x-nexus-timestamp': '1000000000' }, { origin: 'https://browser.test' }])('rejects invalid or browser authentication %j', async headers => {
  const response = res(); await POST(req({}, headers), response)
  expect(response.status).toHaveBeenCalledWith(headers.origin ? 403 : 401)
  expect(inspectOrderBooking).not.toHaveBeenCalled()
})
it('fails closed without a dedicated machine secret', async () => {
  delete process.env.NEXUS_BOOKING_SYNC_SECRET
  const response = res(); await POST(req(), response)
  expect(response.status).toHaveBeenCalledWith(503)
  expect(inspectOrderBooking).not.toHaveBeenCalled()
})

it('resolves a captured payment through the authoritative Medusa link instead of a caller order ID', async () => {
  const response = res()
  await POST(req({ version: 2, orderId: undefined, eventType: 'payment.captured', targetId: 'pay_synthetic', mode: 'synchronize' }), response)
  expect(resolveOrderIdByPayment).toHaveBeenCalledWith({}, 'pay_synthetic')
  expect(synchronizeOrderBooking).toHaveBeenCalledWith({}, 'order_from_payment')
  expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ version: 2, orderId: 'order_from_payment', targetId: 'pay_synthetic', eventType: 'payment.captured' }))
})
it('rejects caller-selected orders in the payment contract', async () => {
  const response = res()
  await POST(req({ version: 2, eventType: 'payment.captured', targetId: 'pay_synthetic' }), response)
  expect(response.status).toHaveBeenCalledWith(400)
  expect(resolveOrderIdByPayment).not.toHaveBeenCalled()
  expect(synchronizeOrderBooking).not.toHaveBeenCalled()
})
it('does not confirm an unlinked payment', async () => {
  ;(resolveOrderIdByPayment as jest.Mock).mockResolvedValueOnce(null)
  const response = res()
  await POST(req({ version: 2, orderId: undefined, eventType: 'payment.captured', targetId: 'pay_synthetic' }), response)
  expect(response.status).toHaveBeenCalledWith(409)
  expect(inspectOrderBooking).not.toHaveBeenCalled()
  expect(synchronizeOrderBooking).not.toHaveBeenCalled()
  expect(response.json).not.toHaveBeenCalledWith(expect.objectContaining({ synchronized: true }))
})

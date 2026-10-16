import { inspectOrderBooking, synchronizeOrderBooking } from '../booking-order'
import { confirmBookingForOrder } from '../../../modules/booking/order-sync'
jest.mock('../../../modules/booking/order-sync', () => ({ confirmBookingForOrder: jest.fn() }))

function fixture() {
  const order: any = { id: 'order_synthetic', status: 'pending', total: 50, customer_id: 'cus_synthetic', metadata: { booking_id: 'book_synthetic' },
    items: [{ product_id: 'prod_synthetic' }], payment_collections: [{ captured_amount: 50, payments: [{ captured_at: '2026-10-16' }] }] }
  const booking: any = { id: 'book_synthetic', order_id: order.id, customer_id: order.customer_id, product_id: 'prod_synthetic',
    status: 'confirmed', held_until: null, metadata: { checkout_cart_id: 'cart_synthetic' } }
  const graph = jest.fn(async ({ entity }: any) => ({ data: entity === 'order' ? [order] : entity === 'product' ? [{ id: 'prod_synthetic', metadata: {} }] : [{ cart_id: 'cart_synthetic' }] }))
  const listBookings = jest.fn(async () => [booking])
  const container: any = { resolve: (key: string) => key === 'query' ? { graph } : { listBookings } }
  return { order, booking, graph, listBookings, container }
}
beforeEach(() => jest.clearAllMocks())
it('confirms only a matching persisted paid booking', async () => {
  const f = fixture()
  expect(await inspectOrderBooking(f.container, f.order.id)).toMatchObject({ synchronized: true, result: 'CONFIRMED' })
  expect(confirmBookingForOrder).not.toHaveBeenCalled()
})
it('keeps an unpaid order held without granting a confirmed booking', async () => {
  const f = fixture(); f.order.payment_collections = []; f.booking.status = 'held'
  expect(await inspectOrderBooking(f.container, f.order.id)).toMatchObject({ synchronized: true, result: 'HELD' })
})
it('checks canceled state rather than reviving a canceled booking', async () => {
  const f = fixture(); f.order.status = 'canceled'; f.booking.status = 'canceled'
  expect(await synchronizeOrderBooking(f.container, f.order.id)).toMatchObject({ synchronized: true, result: 'CANCELED' })
  f.order.status = 'pending'
  expect(await synchronizeOrderBooking(f.container, f.order.id)).toMatchObject({ synchronized: false })
  expect(confirmBookingForOrder).not.toHaveBeenCalled()
})
it.each([{ customer_id: 'other' }, { product_id: 'other' }, { order_id: 'other' }, { metadata: { checkout_cart_id: 'other' } }])('does not synchronize a mismatched booking %j', async patch => {
  const f = fixture(); Object.assign(f.booking, patch)
  expect(await synchronizeOrderBooking(f.container, f.order.id)).toMatchObject({ synchronized: false, canSynchronize: false })
  expect(confirmBookingForOrder).not.toHaveBeenCalled()
})
it('reloads authoritative state after using the existing native synchronization', async () => {
  const f = fixture(); f.booking.status = 'held'
  ;(confirmBookingForOrder as jest.Mock).mockImplementationOnce(async () => { f.booking.status = 'confirmed'; return { confirmed: true } })
  expect(await synchronizeOrderBooking(f.container, f.order.id)).toMatchObject({ synchronized: true })
  expect(confirmBookingForOrder).toHaveBeenCalledWith(f.container, f.order.id)
  expect(f.graph.mock.calls.filter(([q]) => q.entity === 'order')).toHaveLength(2)
})
it('does not accept a successful helper result without a matching read-back', async () => {
  const f = fixture(); f.booking.status = 'held'
  ;(confirmBookingForOrder as jest.Mock).mockResolvedValueOnce({ confirmed: true })
  expect(await synchronizeOrderBooking(f.container, f.order.id)).toMatchObject({ synchronized: false })
})
it('does not conceal a missing order', async () => {
  const f = fixture(); f.graph.mockResolvedValueOnce({ data: [] })
  await expect(inspectOrderBooking(f.container, f.order.id)).rejects.toMatchObject({ status: 404 })
})
it('accepts no booking only after checking the actual product requirements', async () => {
  const f = fixture(); f.order.metadata = {}
  expect(await inspectOrderBooking(f.container, f.order.id)).toMatchObject({ synchronized: true, result: 'NO_BOOKING' })
  f.graph.mockImplementation(async ({ entity }: any) => ({ data: entity === 'order' ? [f.order] : [{ id: 'prod_synthetic', metadata: { booking: {} } }] }))
  expect(await inspectOrderBooking(f.container, f.order.id)).toMatchObject({ synchronized: false })
})

it.each([NaN, Infinity, -1, '', 'invalid', true, null])('rejects invalid authoritative monetary data before synchronization: %s', async total => {
  const f = fixture(); f.order.total = total; f.booking.status = 'held'
  await expect(synchronizeOrderBooking(f.container, f.order.id)).rejects.toMatchObject({ status: 409 })
  expect(confirmBookingForOrder).not.toHaveBeenCalled()
})

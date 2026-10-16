import type { MedusaContainer } from '@medusajs/framework/types'
import { ContainerRegistrationKeys } from '@medusajs/framework/utils'
import { confirmBookingForOrder } from '../../modules/booking/order-sync'
import { isOrderPaid } from '../../modules/entitlement/policy'

export class BookingSyncError extends Error {
  constructor(readonly status: number) { super('BOOKING_SYNC_UNVERIFIED') }
}
type Container = Pick<MedusaContainer, 'resolve'>
type Inspection = { synchronized: boolean; result: 'NO_BOOKING' | 'HELD' | 'CONFIRMED' | 'CANCELED' | 'MISMATCH'; canSynchronize: boolean }

/** Read the current Medusa order and booking, never a payment assertion from the caller. */
export async function inspectOrderBooking(container: Container, orderId: string): Promise<Inspection> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any
  const { data } = await query.graph({ entity: 'order', filters: { id: orderId }, fields: ['id', 'status', 'total', 'customer_id', 'metadata',
    'items.product_id', 'payment_collections.captured_amount', 'payment_collections.refunded_amount', 'payment_collections.payments.captured_at'] })
  const order = data?.[0]
  if (!order || order.id !== orderId) throw new BookingSyncError(404)
  if (order.total == null || typeof order.total === 'boolean' || (typeof order.total === 'string' && !order.total.trim()) ||
      !Number.isFinite(Number(order.total)) || Number(order.total) < 0 || !order.status || !Array.isArray(order.items)) throw new BookingSyncError(409)
  const bookingId = order.metadata?.booking_id
  const mismatch: Inspection = { synchronized: false, result: 'MISMATCH', canSynchronize: false }
  if (!bookingId) {
    const ids = [...new Set(order.items.map((item: any) => item.product_id).filter(Boolean))]
    if (!ids.length) return mismatch
    const { data: products } = await query.graph({ entity: 'product', fields: ['id', 'metadata'], filters: { id: ids } })
    if (products.length !== ids.length || products.some((p: any) => p.metadata?.booking)) return mismatch
    const active = await (container.resolve('booking') as any).listBookings({ order_id: orderId, status: ['held', 'confirmed'] }, { take: 1, select: ['id'] })
    if (active.length) return mismatch // Missing metadata cannot hide an existing active reservation.
    return { synchronized: true, result: 'NO_BOOKING', canSynchronize: false }
  }
  if (typeof bookingId !== 'string' || !order.customer_id) return mismatch
  const bookings = container.resolve('booking') as any
  const [booking] = await bookings.listBookings({ id: bookingId }, { take: 1 })
  const { data: links } = await query.graph({ entity: 'order_cart', fields: ['cart_id'], filters: { order_id: orderId } })
  const cartId = links?.[0]?.cart_id
  if (!booking || !cartId || booking.customer_id !== order.customer_id ||
      !order.items.some((item: any) => item.product_id === booking.product_id) ||
      booking.metadata?.checkout_cart_id !== cartId || (booking.order_id && booking.order_id !== orderId)) return mismatch
  const desired = order.status === 'canceled' ? 'canceled' : isOrderPaid(order) ? 'confirmed' : 'held'
  const synchronized = booking.order_id === orderId && booking.status === desired && booking.held_until == null
  return { synchronized, result: synchronized ? desired.toUpperCase() as Inspection['result'] : 'MISMATCH',
    canSynchronize: !synchronized && ['held', 'confirmed'].includes(booking.status) }
}

export async function synchronizeOrderBooking(container: Container, orderId: string) {
  const before = await inspectOrderBooking(container, orderId)
  if (before.synchronized || !before.canSynchronize) return before
  await confirmBookingForOrder(container, orderId)
  // A successful update is not evidence: reload both authoritative records afterwards.
  return inspectOrderBooking(container, orderId)
}

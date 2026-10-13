import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { BOOKING_MODULE } from "./index"
import { isOrderPaid, type OrderPaymentView } from "../entitlement/policy"
import type BookingModuleService from "./service"

type Container = Pick<MedusaContainer, "resolve">

const ORDER_FIELDS = [
  "id", "status", "total", "customer_id", "metadata", "items.product_id",
  "payment_collections.captured_amount", "payment_collections.refunded_amount", "payment_collections.payments.captured_at",
]

function deps(container: Container) {
  return {
    query: container.resolve(ContainerRegistrationKeys.QUERY) as any,
    logger: container.resolve(ContainerRegistrationKeys.LOGGER) as any,
    bookings: container.resolve(BOOKING_MODULE) as BookingModuleService,
  }
}

type OrderView = OrderPaymentView & { id: string; customer_id: string; items: Array<{ product_id: string }>; metadata?: Record<string, unknown> | null }

/**
 * Přihlášený klient připojí rezervaci přes POST /store/bookings/:id/cart.
 * Locked validate hook ověří vlastnictví/produkt a atomicky přiřadí hold ke košíku.
 * Po zaplacení se rezervace potvrdí; bez tohoto metadata objednávka žádnou rezervaci nemá.
 */
export async function confirmBookingForOrder(container: Container, orderId: string): Promise<{ confirmed: boolean; skipped?: string }> {
  const { query, logger, bookings } = deps(container)
  const { data } = await query.graph({ entity: "order", fields: ORDER_FIELDS, filters: { id: orderId } })
  const order = data?.[0] as OrderView | undefined
  if (!order) return { confirmed: false, skipped: "ORDER_NOT_FOUND" }
  const bookingId = typeof order.metadata?.booking_id === "string" ? order.metadata.booking_id : undefined
  if (!bookingId) return { confirmed: false, skipped: "NO_BOOKING" }
  const { data: links } = await query.graph({ entity: "order_cart", fields: ["cart_id"], filters: { order_id: orderId } })
  if (!links?.[0]?.cart_id) throw new Error("BOOKING_ORDER_CART_MISSING")
  const paid = isOrderPaid(order)
  try {
    await bookings.attachCheckoutOrder({ id: bookingId, order_id: orderId, cart_id: links[0].cart_id,
      customer_id: order.customer_id, product_ids: order.items.map(item => item.product_id), paid,
      ...(order.status === "canceled" ? { canceled: true } : {}) })
    if (order.status === "canceled") return { confirmed: false, skipped: "ORDER_CANCELED" }
    return paid ? { confirmed: true } : { confirmed: false, skipped: "NOT_PAID" }
  } catch (error) {
    logger.error(`[booking] potvrzení rezervace ${bookingId} pro objednávku ${orderId} selhalo`, error as Error)
    throw error
  }
}

export async function cancelBookingForCanceledOrder(container: Container, orderId: string): Promise<number> {
  const { bookings } = deps(container)
  return bookings.cancelByOrder(orderId, "order_canceled")
}

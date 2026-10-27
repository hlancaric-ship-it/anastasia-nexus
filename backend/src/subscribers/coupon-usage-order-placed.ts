import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { storedCouponCode } from "../lib/pricing/coupon"
import { COUPON_LINK_MODULE } from "../modules/coupon-link"
import type CouponLinkModuleService from "../modules/coupon-link/service"
import { recordEvent } from "../lib/observability/events"

/** Confirms the checkout reservation once the order exists; cancellation releases it. */
export default async function couponUsageOrderHandler({ event, container }: SubscriberArgs<{ id: string }>) {
  const orderId = event.data?.id
  if (!orderId) return
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any
  const { data: links } = await query.graph({ entity: "order_cart", fields: ["cart_id"], filters: { order_id: orderId } })
  const cartId = links?.[0]?.cart_id
  if (!cartId) return // Imported/admin-created orders have no checkout reservation.

  const usage = container.resolve<CouponLinkModuleService>(COUPON_LINK_MODULE)
  if (event.name === "order.canceled") {
    const released = await usage.cancelUsage({ cart_id: cartId, order_id: orderId })
    if (released) await recordEvent(container as any, "info", "coupon", "usage_released", { cart_id: cartId, order_id: orderId, source: "order_canceled" })
    return
  }

  if (event.name !== "order.placed") return
  const { data: carts } = await query.graph({ entity: "cart", fields: ["id", "metadata"], filters: { id: cartId } })
  const couponCode = storedCouponCode(carts?.[0]?.metadata)
  if (!couponCode) return
  const reservation = await usage.confirmUsage({ cart_id: cartId, order_id: orderId, coupon_code: couponCode })
  if (!reservation) throw new Error("COUPON_USAGE_RESERVATION_MISSING")
  if (reservation.status === "released") return // A cancellation event may have arrived first.
  await recordEvent(container as any, "info", "coupon", "used", {
    cart_id: cartId, order_id: orderId, promotion_id: reservation.promotion_id, source: "order_placed",
  })
}

export const config: SubscriberConfig = {
  event: ["order.placed", "order.canceled"],
  context: { subscriberId: "coupon-usage-order-placed" },
}

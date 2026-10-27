import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { recordCouponUsage } from "../lib/pricing/coupon-usage"
import { recordEvent } from "../lib/observability/events"

/**
 * Použitie kupónu sa započíta pre KAŽDÚ objednávku z košíka, nielen pre tú z `/store/nexus-checkout`.
 *
 * Platbu kartou môže dokončiť aj Stripe webhook (`processPaymentWorkflow` → dokončenie košíka),
 * napr. keď zákazník potvrdí PaymentIntent priamo cez stripe.js alebo sa po 3DS nevráti na web.
 * Bez tohto zápisu by taká objednávka mala zľavu, ale počítadlo `promotion.used` by ostalo
 * nezmenené a jednorazový kupón by sa dal použiť opakovane.
 *
 * `recordCouponUsage` je idempotentný podľa ID objednávky – súbeh s `/store/nexus-checkout`
 * nezapočíta použitie dvakrát.
 */
export default async function handler({ event, container }: SubscriberArgs<{ id: string }>) {
  const orderId = event.data?.id
  if (!orderId) return
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any
  const { data } = await query.graph({ entity: "order_cart", fields: ["cart_id"], filters: { order_id: orderId } })
  const cartId = data?.[0]?.cart_id
  if (!cartId) return // importované/ručne založené objednávky nevznikli z košíka
  const usage = await recordCouponUsage(container, { cartId, orderId })
  if (!usage.promotion_id || usage.duplicate) return
  await recordEvent(container as any, usage.counted ? "info" : "warn", "coupon", usage.counted ? "used" : "limit_exhausted", {
    cart_id: cartId, order_id: orderId, promotion_id: usage.promotion_id, source: "order_placed",
  })
}

export const config: SubscriberConfig = { event: "order.placed" }

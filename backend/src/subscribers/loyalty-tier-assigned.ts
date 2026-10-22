import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { resolveOrderIdByPayment } from "../modules/entitlement/order-sync"
import { assignCustomerTierAutomatically, orderCustomerId } from "../lib/loyalty/auto-assign"
import { recordEvent } from "../lib/observability/events"

/**
 * Po zachytení platby sa prepočíta celková útrata zákazníka a podľa prahov
 * v politike sa priradí vernostná úroveň. Ručný zámok (správca nastavil úroveň
 * ručne) automatické zaradenie nikdy neprepiše.
 */
export default async function loyaltyTierAssignedHandler({ event, container }: SubscriberArgs<{ id: string }>) {
  try {
    const orderId = await resolveOrderIdByPayment(container, event.data.id)
    if (!orderId) return // platba zatiaľ nemá objednávku
    const customerId = await orderCustomerId(container, orderId)
    if (!customerId) return // objednávka hosta – prístup sa neudelí
    const result = await assignCustomerTierAutomatically(container, customerId)
    if (result.assigned) {
      await recordEvent(container, "info", "loyalty", "tier_assigned", {
        order_id: orderId, customer_id: customerId, tier_code: result.tier_code, spend_total_eur: result.spend_total_eur,
      })
    }
  } catch (error) {
    await recordEvent(container, "error", "loyalty", "assign_failed", { payment_id: event.data.id, error })
    throw error // event bus môže retry; automatické zaradenie je idempotentní
  }
}

export const config: SubscriberConfig = { event: "payment.captured" }

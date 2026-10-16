import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { orderEmailOperationId } from "../lib/email/order-recovery"
import { orderEmailRecoveryWorkflow } from "../workflows/order-email-recovery"
import { recordEvent } from "../lib/observability/events"

/** Durable native workflow; background notification cannot roll back the placed order. */
export default async function emailOrderPlacedHandler({ event, container }: SubscriberArgs<{ id: string }>) {
  try {
    const input = { tenantId: process.env.NEXUS_TENANT_ID ?? "", orderId: event.data.id }
    await orderEmailRecoveryWorkflow(container).run({ input, context: { transactionId: orderEmailOperationId(input) } })
  } catch {
    await recordEvent(container, "error", "notification", "order_email_needs_review", { order_id: event.data?.id, reason: "WORKFLOW_START_FAILED" })
    throw new Error("ORDER_EMAIL_WORKFLOW_START_FAILED")
  }
}

export const config: SubscriberConfig = { event: "order.placed" }

import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { toNumber } from "../modules/entitlement/policy"
import crypto from "node:crypto"

/**
 * When an order containing voucher products is placed, calls NEXUS
 * /api/vouchers/issue to create the credit voucher.
 *
 * A voucher product is identified by metadata.voucher_product = true.
 * The value is computed server-side by NEXUS from order lines.
 */
export default async function nexusVoucherIssuanceHandler({ event, container }: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as any
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any

  const nexusUrl = process.env.NEXUS_PRICING_URL?.replace(/\/api\/nexus\/pricing$/, "")
  const apiKey = process.env.NEXUS_PRICING_API_KEY
  const tenantId = process.env.NEXUS_TENANT_ID

  if (!nexusUrl || !apiKey || !tenantId) return

  const orderId = event.data.id
  const { data } = await query.graph({
    entity: "order",
    fields: [
      "id", "status", "customer_id", "email",
      "items.id", "items.product_id", "items.variant_id", "items.quantity", "items.unit_price",
      "payment_collections.captured_amount", "payment_collections.payments.captured_at",
    ],
    filters: { id: orderId },
  })
  const order = data?.[0]
  if (!order) return

  const hasCapturedPayment = order.payment_collections?.some(
    (pc: any) => pc.payments?.some((p: any) => p.captured_at)
  )
  if (!hasCapturedPayment && toNumber(order.total) > 0) return

  const productIds = [...new Set((order.items ?? []).map((i: any) => i.product_id).filter(Boolean))]
  if (!productIds.length) return

  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "metadata"],
    filters: { id: productIds },
  })
  const voucherProductIds = new Set(
    (products ?? [])
      .filter((p: any) => p.metadata?.voucher_product === true || p.metadata?.voucher_product === "true")
      .map((p: any) => p.id)
  )

  if (voucherProductIds.size === 0) return

  const voucherLines = (order.items ?? [])
    .filter((item: any) => voucherProductIds.has(item.product_id))
    .map((item: any) => ({
      sku: item.variant_id || item.product_id,
      quantity: item.quantity,
      unitPriceMinor: Math.round(toNumber(item.unit_price) * 100),
      isVoucherProduct: true,
    }))

  if (!voucherLines.length) return

  const orderState = hasCapturedPayment ? "PAID" : "COMPLETED"
  const payload = JSON.stringify({
    tenantId,
    orderId,
    orderState,
    customerEmail: order.email || "",
    lines: voucherLines,
    currency: "EUR",
  })

  try {
    const issueUrl = `${nexusUrl}/api/vouchers/issue`
    const response = await fetch(issueUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${apiKey}`,
      },
      body: payload,
      signal: AbortSignal.timeout(10000),
    })

    const result = await response.json() as any
    if (result.ok) {
      logger.info(`[nexus-voucher] order ${orderId}: voucher issued (alreadyIssued=${result.alreadyIssued})`)
    } else {
      logger.warn(`[nexus-voucher] order ${orderId}: issuance failed ${response.status} — ${typeof result?.error === "string" ? result.error.slice(0, 80) : "unknown"}`)
    }
  } catch (error) {
    logger.error(`[nexus-voucher] order ${orderId}: issuance error — ${error instanceof Error ? error.message : String(error)}`)
  }
}

export const config: SubscriberConfig = { event: ["order.placed", "payment.captured"] }

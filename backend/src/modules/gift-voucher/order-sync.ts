import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { GIFT_VOUCHER_MODULE } from "./index"
import { isOrderPaid, type OrderPaymentView } from "../entitlement/policy"
import {
  GIFT_VOUCHER_ISSUED_EVENT, isGiftVoucherProduct, issueKey, maskVoucherCode, MESSAGE_MAX_LENGTH, toMinor, variantAmountMinor,
  type Recipient,
} from "./policy"
import type GiftVoucherModuleService from "./service"

type Container = Pick<MedusaContainer, "resolve">

const ORDER_FIELDS = [
  "id", "status", "total", "email", "currency_code", "metadata",
  "items.id", "items.variant_id", "items.product_id", "items.quantity", "items.unit_price",
  "payment_collections.captured_amount", "payment_collections.refunded_amount", "payment_collections.payments.captured_at",
]

type OrderView = OrderPaymentView & {
  id: string
  email?: string | null
  currency_code?: string
  metadata?: Record<string, unknown> | null
  items?: Array<{ id: string; variant_id: string | null; product_id: string | null; quantity: unknown; unit_price: unknown }>
}

function deps(container: Container) {
  return {
    query: container.resolve(ContainerRegistrationKeys.QUERY) as any,
    logger: container.resolve(ContainerRegistrationKeys.LOGGER) as any,
    vouchers: container.resolve(GIFT_VOUCHER_MODULE) as GiftVoucherModuleService,
  }
}

/** Obdarovaný byl ověřen v checkout hooku; tady jen obranně ořízneme typy a délky. */
function storedRecipient(raw: unknown): Recipient | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  if (typeof r.name !== "string" || typeof r.email !== "string" || typeof r.delivery_date !== "string") return null
  const message = typeof r.message === "string" ? [...r.message].slice(0, MESSAGE_MAX_LENGTH).join("") : null
  return { name: r.name.slice(0, 120), email: r.email.slice(0, 254), message: message || null, delivery_date: r.delivery_date.slice(0, 10) }
}

export type IssueSummary = { orderId: string; skipped?: string; issued: string[]; existing: string[]; rejected: string[] }

/**
 * Vystaví poukazy za zaplacenou objednávku. Volá se z order.placed i payment.captured;
 * idempotenci drží unikátní issue_key, takže opakovaná událost nevystaví druhý poukaz.
 * Nezaplacená (např. dobírka) nebo zrušená objednávka nevystaví nic.
 */
export async function issueVouchersForOrder(container: Container, orderId: string): Promise<IssueSummary> {
  const { query, logger, vouchers } = deps(container)
  const summary: IssueSummary = { orderId, issued: [], existing: [], rejected: [] }
  const { data } = await query.graph({ entity: "order", fields: ORDER_FIELDS, filters: { id: orderId } })
  const order = data?.[0] as OrderView | undefined
  if (!order) return { ...summary, skipped: "ORDER_NOT_FOUND" }
  if (order.status === "canceled") return { ...summary, skipped: "ORDER_CANCELED" }
  const variantIds = [...new Set((order.items ?? []).map((item) => item.variant_id).filter(Boolean) as string[])]
  if (!variantIds.length) return { ...summary, skipped: "NO_VOUCHER_ITEMS" }
  const { data: variants } = await query.graph({ entity: "product_variant", fields: ["id", "metadata", "product.id", "product.metadata"], filters: { id: variantIds }, withDeleted: true })
  const byId = new Map<string, any>((variants ?? []).map((variant: any) => [variant.id, variant]))
  const lines = (order.items ?? []).filter((item) => item.variant_id && isGiftVoucherProduct(byId.get(item.variant_id)?.product))
  if (!lines.length) return { ...summary, skipped: "NO_VOUCHER_ITEMS" }
  if (!isOrderPaid(order)) return { ...summary, skipped: "NOT_PAID" }
  if (order.currency_code !== "eur") {
    logger.error(`[gift-voucher] objednávka ${orderId} není v EUR, poukazy se nevystaví`)
    return { ...summary, skipped: "CURRENCY_MISMATCH" }
  }
  const settings = await vouchers.getSettings()
  const recipients = (order.metadata?.gift_voucher_recipients ?? {}) as Record<string, unknown[]>
  const counters = new Map<string, number>()
  for (const line of lines) {
    const variantId = line.variant_id!
    const amount = variantAmountMinor(byId.get(variantId))
    const quantity = Number(line.quantity)
    // Hodnota poukazu musí odpovídat zaplacené ceně řádku, jinak se nic nevystaví.
    if (!Number.isInteger(amount) || toMinor(line.unit_price) !== amount || !Number.isInteger(quantity) || quantity < 1) {
      logger.error(`[gift-voucher] řádek ${line.id} objednávky ${orderId}: nesouhlasí hodnota poukazu, nevystaveno`)
      summary.rejected.push(line.id)
      continue
    }
    for (let unit = 0; unit < quantity; unit++) {
      const index = counters.get(variantId) ?? 0
      counters.set(variantId, index + 1)
      const list = Array.isArray(recipients[variantId]) ? recipients[variantId] : []
      let recipient = storedRecipient(list[index])
      if (recipient && settings.delivery_method === "buyer_pdf") recipient = { ...recipient, delivery_date: null }
      const { voucher, created } = await vouchers.issueVoucher({
        issue_key: issueKey(orderId, variantId, index), amount_minor: amount, order_id: orderId, variant_id: variantId,
        settings, recipient, purchaser_email: order.email ?? null,
      })
      if (created) summary.issued.push(voucher.id)
      else summary.existing.push(voucher.id)
    }
  }
  if (summary.issued.length) {
    const eventBus = container.resolve(Modules.EVENT_BUS) as any
    // V události jen ID – žádný kód ani e-mail neputuje přes event bus.
    await eventBus.emit(summary.issued.map((id) => ({ name: GIFT_VOUCHER_ISSUED_EVENT, data: { id } })))
    logger.info(`[gift-voucher] objednávka ${orderId}: vystaveno ${summary.issued.length} poukazů`)
  }
  return summary
}

/** Přiřadí čerpání poukazu z košíku k vytvořené objednávce (podklad pro vratky). */
export async function attachRedemptionsToOrder(container: Container, orderId: string): Promise<number> {
  const { query, vouchers } = deps(container)
  const { data: links } = await query.graph({ entity: "order_cart", fields: ["cart_id"], filters: { order_id: orderId } })
  const cartId = links?.[0]?.cart_id
  if (!cartId) return 0
  return vouchers.attachOrder(cartId, orderId)
}

/**
 * Storno objednávky: (1) částka uhrazená poukazem se vrátí na poukaz (včetně propadlého
 * zbytku jednorázového poukazu), (2) nevyčerpané poukazy koupené touto objednávkou se zneplatní.
 */
export async function handleCanceledOrder(container: Container, orderId: string) {
  const { logger, vouchers } = deps(container)
  await attachRedemptionsToOrder(container, orderId)
  const refunds = await vouchers.refundOrderToVoucher({ order_id: orderId, includeForfeited: true, idempotency_key: `cancel:${orderId}`, note: "order_canceled" })
  const issued = await vouchers.voidIssuedForCanceledOrder(orderId)
  for (const id of issued.used) {
    const voucher = await vouchers.getVoucher(id)
    logger.warn(`[gift-voucher] storno objednávky ${orderId}: poukaz ${voucher ? maskVoucherCode(voucher.code) : id} už byl čerpán, ruční řešení`)
  }
  return { refunds, ...issued }
}

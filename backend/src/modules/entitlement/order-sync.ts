import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { ENTITLEMENT_MODULE } from "./index"
import {
  computeExpiry,
  isEntitlementProduct,
  isFullyRefunded,
  isOrderPaid,
  orderDedupeKey,
  type OrderPaymentView,
  type ProductLike,
} from "./policy"
import type EntitlementModuleService from "./service"

type Container = Pick<MedusaContainer, "resolve">

type OrderView = OrderPaymentView & {
  id: string
  customer_id?: string | null
  email?: string | null
  customer?: { has_account?: boolean | null } | null
  items?: Array<{ id: string; product_id?: string | null; variant_id?: string | null }> | null
}

const ORDER_FIELDS = [
  "id",
  "status",
  "total",
  "customer_id",
  "email",
  "customer.has_account",
  "items.id",
  "items.product_id",
  "items.variant_id",
  "payment_collections.captured_amount",
  "payment_collections.refunded_amount",
  "payment_collections.payments.captured_at",
]

function deps(container: Container) {
  return {
    query: container.resolve(ContainerRegistrationKeys.QUERY) as any,
    logger: container.resolve(ContainerRegistrationKeys.LOGGER) as any,
    entitlements: container.resolve(ENTITLEMENT_MODULE) as EntitlementModuleService,
  }
}

async function loadOrder(query: any, orderId: string): Promise<OrderView | null> {
  const { data } = await query.graph({ entity: "order", fields: ORDER_FIELDS, filters: { id: orderId } })
  return (data?.[0] as OrderView) ?? null
}

/** Z ID platby najde objednávku přes link order_payment_collection. */
export async function resolveOrderIdByPayment(container: Container, paymentId: string): Promise<string | null> {
  const { query } = deps(container)
  const { data: payments } = await query.graph({
    entity: "payment",
    fields: ["id", "payment_collection_id"],
    filters: { id: paymentId },
  })
  const collectionId = payments?.[0]?.payment_collection_id
  if (!collectionId) return null
  const { data: links } = await query.graph({
    entity: "order_payment_collection",
    fields: ["order_id", "payment_collection_id"],
    filters: { payment_collection_id: collectionId },
  })
  return links?.[0]?.order_id ?? null
}

/**
 * Nákup bez prihlásenia: Medusa priradí objednávke hosťovského zákazníka z e-mailu.
 * Ak už existuje práve jeden registrovaný účet s rovnakým e-mailom, prístup patrí jemu,
 * aby ho zákazník videl v Mojej knižnici. Inak hosťovský zákazník – magic link ho neskôr aktivuje.
 */
async function entitlementOwner(query: any, order: OrderView): Promise<string> {
  const guestId = order.customer_id as string
  const email = order.email?.trim().toLowerCase()
  if (order.customer?.has_account !== false || !email) return guestId
  try {
    const { data } = await query.graph({ entity: "customer", fields: ["id", "email", "has_account"], filters: { email, has_account: true } })
    const accounts = (data ?? []).filter((c: any) => c?.has_account === true && String(c.email || "").toLowerCase() === email)
    return accounts.length === 1 ? accounts[0].id : guestId
  } catch {
    return guestId
  }
}

export type GrantSummary = { orderId: string; skipped?: string; granted: string[]; existing: string[] }

/**
 * Po zaplacení objednávky zpřístupní digitální produkty. Idempotentní: opakované volání
 * (order.placed i payment.captured, retry eventu) nevytvoří duplicitní záznamy.
 */
export async function grantEntitlementsForOrder(container: Container, orderId: string): Promise<GrantSummary> {
  const { query, logger, entitlements } = deps(container)
  const summary: GrantSummary = { orderId, granted: [], existing: [] }

  const order = await loadOrder(query, orderId)
  if (!order) return { ...summary, skipped: "ORDER_NOT_FOUND" }
  if (!isOrderPaid(order)) return { ...summary, skipped: "NOT_PAID" }
  if (!order.customer_id) {
    logger.warn(`[entitlement] objednávka ${orderId} nemá customer_id (host): přístup nelze přiřadit`)
    return { ...summary, skipped: "NO_CUSTOMER" }
  }

  const customerId = await entitlementOwner(query, order)

  const productIds = [...new Set((order.items ?? []).map((i) => i.product_id).filter((v): v is string => Boolean(v)))]
  if (!productIds.length) return { ...summary, skipped: "NO_PRODUCTS" }

  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "metadata", "shipping_profile.type"],
    filters: { id: productIds },
  })
  const productById = new Map<string, ProductLike>((products ?? []).map((p: ProductLike) => [p.id, p]))
  const now = new Date()

  for (const productId of productIds) {
    const product = productById.get(productId)
    if (!product || !isEntitlementProduct(product)) continue
    const variantId = order.items?.find((i) => i.product_id === productId)?.variant_id ?? null
    const { entitlement, created } = await entitlements.grant({
      customer_id: customerId,
      product_id: productId,
      variant_id: variantId,
      order_id: orderId,
      source: "order",
      dedupe_key: orderDedupeKey(orderId, productId),
      expires_at: computeExpiry(product, now),
      tenant_id: "default",
    })
    ;(created ? summary.granted : summary.existing).push(entitlement.id)
  }
  return summary
}

/** Zrušení objednávky: zruší všechny přístupy z ní. */
export async function revokeEntitlementsForCanceledOrder(container: Container, orderId: string): Promise<number> {
  const { entitlements } = deps(container)
  return entitlements.revokeByOrder(orderId, "order_canceled")
}

/** Refund: přístup se zruší jen při plném vrácení platby (vráceno >= zachyceno). */
export async function revokeEntitlementsForRefund(container: Container, orderId: string): Promise<number> {
  const { query, entitlements } = deps(container)
  const order = await loadOrder(query, orderId)
  if (!order || !isFullyRefunded(order)) return 0
  return entitlements.revokeByOrder(orderId, "order_refunded")
}

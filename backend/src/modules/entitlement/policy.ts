/** Čistá business logika modulu (bez infrastruktury, plně testovatelná). */

const EPSILON = 0.005

export function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  if (typeof value === "string") {
    const n = Number(value)
    return Number.isFinite(n) ? n : 0
  }
  if (typeof value === "object") {
    const v = value as Record<string, unknown>
    // BigNumber z Medusy: { value: "12.3" } nebo { numeric: 12.3 } / { numeric_: 12.3 }
    for (const key of ["numeric", "numeric_", "value"]) {
      if (key in v) return toNumber(v[key])
    }
  }
  return 0
}

export function orderDedupeKey(orderId: string, productId: string): string {
  return `order:${orderId}:${productId}`
}

export function isTruthyFlag(value: unknown): boolean {
  return value === true || value === "true" || value === 1 || value === "1"
}

export function isFalseFlag(value: unknown): boolean {
  return value === false || value === "false" || value === 0 || value === "0"
}

export type ProductLike = {
  id: string
  metadata?: Record<string, unknown> | null
  shipping_profile?: { type?: string | null } | null
}

/**
 * Digitální produkt = shipping profil typu "digital" (viz bootstrap), nebo metadata.digital=true.
 * metadata.entitlement=false produkt z automatického zpřístupnění vyřadí.
 */
export function isEntitlementProduct(product: ProductLike): boolean {
  const meta = product.metadata ?? {}
  if (isFalseFlag(meta.entitlement)) return false
  if (isTruthyFlag(meta.digital) || isTruthyFlag(meta.entitlement)) return true
  return product.shipping_profile?.type === "digital"
}

/** Volitelná platnost přístupu ve dnech (metadata.entitlement_days). Bez hodnoty = bez expirace (jednorázový nákup). */
export function computeExpiry(product: ProductLike, grantedAt: Date): Date | null {
  const days = toNumber((product.metadata ?? {}).entitlement_days)
  if (!(days > 0) || days > 36500) return null
  return new Date(grantedAt.getTime() + Math.round(days * 86_400_000))
}

export type PaymentCollectionLike = {
  captured_amount?: unknown
  refunded_amount?: unknown
  payments?: Array<{ captured_at?: unknown }> | null
}

export type OrderPaymentView = {
  status?: string | null
  total?: unknown
  payment_collections?: PaymentCollectionLike[] | null
}

export function capturedTotal(order: OrderPaymentView): number {
  return (order.payment_collections ?? []).reduce((sum, c) => sum + toNumber(c.captured_amount), 0)
}

export function refundedTotal(order: OrderPaymentView): number {
  return (order.payment_collections ?? []).reduce((sum, c) => sum + toNumber(c.refunded_amount), 0)
}

/** Objednávka je zaplacená: nulový total, nebo zachycená částka >= total, nebo jsou všechny platby captured. */
export function isOrderPaid(order: OrderPaymentView): boolean {
  if (order.status === "canceled") return false
  const total = toNumber(order.total)
  if (total <= 0) return true
  if (capturedTotal(order) >= total - EPSILON) return true
  const payments = (order.payment_collections ?? []).flatMap((c) => c.payments ?? [])
  return payments.length > 0 && payments.every((p) => Boolean(p.captured_at))
}

/** Plný refund = vráceno >= zachyceno (a zachyceno > 0). Částečný refund přístup nezruší. */
export function isFullyRefunded(order: OrderPaymentView): boolean {
  const captured = capturedTotal(order)
  return captured > 0 && refundedTotal(order) >= captured - EPSILON
}

export function isActiveAt(
  e: { status: string; expires_at?: Date | string | null },
  at: Date = new Date()
): boolean {
  if (e.status !== "active") return false
  if (!e.expires_at) return true
  return new Date(e.expires_at).getTime() > at.getTime()
}

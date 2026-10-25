import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { GIFT_VOUCHER_MODULE } from "../../../../modules/gift-voucher"
import { isExpired } from "../../../../modules/gift-voucher/policy"
import type GiftVoucherModuleService from "../../../../modules/gift-voucher/service"
import type { GiftVoucherRow } from "../../../../modules/gift-voucher/service"

const MAX_ORDERS = 500

/**
 * Poukazy zákazníka: z objednávok jeho účtu a z nákupov bez prihlásenia na rovnaký e-mail
 * (rovnaké pravidlo ako prístupy v Mojej knižnici, entitlementOwner).
 */
export async function ownedVouchers(scope: any, customerId: string): Promise<GiftVoucherRow[]> {
  const query: any = scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: customers } = await query.graph({ entity: "customer", fields: ["id", "email"], filters: { id: customerId } })
  const email = String(customers?.[0]?.email || "").trim().toLowerCase()
  const orderIds = new Set<string>()
  const collect = async (filters: Record<string, unknown>) => {
    const { data } = await query.graph({ entity: "order", fields: ["id", "email", "customer_id"], filters, pagination: { take: MAX_ORDERS } })
    for (const o of data ?? []) if (o?.id) orderIds.add(o.id)
  }
  await collect({ customer_id: customerId })
  if (email) await collect({ email })
  if (!orderIds.size) return []
  const service = scope.resolve(GIFT_VOUCHER_MODULE) as GiftVoucherModuleService
  const rows = await service.listGiftVouchers({ source_order_id: [...orderIds] }, { order: { issued_at: "DESC" }, take: MAX_ORDERS })
  return rows.map((row: any) => ({ ...row, initial_amount: Number(row.initial_amount), balance: Number(row.balance), delivery_attempts: Number(row.delivery_attempts ?? 0) }))
}

/** Pohľad pre vlastníka: celý kód, aby ho mohol uplatniť alebo vytlačiť. */
export function ownerView(row: GiftVoucherRow) {
  return {
    id: row.id,
    code: row.code,
    currency_code: row.currency_code,
    initial_amount: row.initial_amount / 100,
    balance: row.balance / 100,
    status: row.status !== "void" && row.status !== "expired" && isExpired(row) ? "expired" : row.status,
    issued_at: row.issued_at,
    expires_at: row.expires_at,
    recipient_name: row.recipient_name,
    order_id: row.source_order_id,
  }
}

export function customerOf(req: any): string | undefined {
  const auth = req.auth_context
  return auth?.actor_type === "customer" ? auth.actor_id : undefined
}

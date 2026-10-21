import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { GIFT_VOUCHER_MODULE } from "../../modules/gift-voucher"
import type GiftVoucherModuleService from "../../modules/gift-voucher/service"
import { attachRedemptionsToOrder } from "../../modules/gift-voucher/order-sync"
import { capturedTotal, isFullyRefunded, refundedTotal, type OrderPaymentView } from "../../modules/entitlement/policy"

type Container = Pick<MedusaContainer, "resolve">

const ORDER_FIELDS = ["id", "status", "total", "payment_collections.captured_amount", "payment_collections.refunded_amount", "payment_collections.payments.captured_at"]

export type RefundCompensation =
  | { action: "none"; reason: "ORDER_NOT_FOUND" | "ORDER_CANCELED" | "NOT_REFUNDED" }
  | { action: "manual_review"; reason: "PARTIAL_REFUND"; captured: number; refunded: number }
  | { action: "compensated"; voucher_refunds: Array<{ voucher_id: string; amount_minor: number }>; issued_voided: string[]; issued_used: string[] }

/**
 * Kompenzace po vrácení platby kartou (payment.refunded) – obrácený tok checkoutu bez storna objednávky.
 *
 * Plný refund karty se chová jako ekonomické storno:
 *  - část objednávky uhrazená poukazem se vrátí zpět na poukaz (jinak by zákazník o hodnotu poukazu přišla);
 *  - nevyčerpané poukazy koupené touto objednávkou se zneplatní (jinak by zůstal poukaz zdarma);
 *    už čerpané vrátí `issued_used` k ručnímu řešení;
 *  - přístupy (entitlementy) ruší samostatný subscriber `entitlement-payment-refunded`.
 *
 * Částečný refund se automaticky NEROZPOČÍTÁVÁ (není jasné, kterou položku / platební prostředek vracel):
 * vrací `manual_review` pro admin. Idempotence: klíč `refund:<order_id>`; strop vratky na poukaz
 * (čerpáno − už vráceno) zároveň brání dvojí vratce při pozdějším stornu (`cancel:<order_id>`).
 * Storno objednávky vyřizuje vlastní cesta (`handleCanceledOrder`), tady se přeskočí.
 */
export async function compensatePaymentRefund(container: Container, orderId: string): Promise<RefundCompensation> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any
  const vouchers = container.resolve(GIFT_VOUCHER_MODULE) as GiftVoucherModuleService
  const { data } = await query.graph({ entity: "order", fields: ORDER_FIELDS, filters: { id: orderId } })
  const order = data?.[0] as (OrderPaymentView & { id: string; status?: string }) | undefined
  if (!order) return { action: "none", reason: "ORDER_NOT_FOUND" }
  if (order.status === "canceled") return { action: "none", reason: "ORDER_CANCELED" }
  const captured = capturedTotal(order)
  const refunded = refundedTotal(order)
  if (refunded <= 0) return { action: "none", reason: "NOT_REFUNDED" }
  if (!isFullyRefunded(order)) return { action: "manual_review", reason: "PARTIAL_REFUND", captured, refunded }

  await attachRedemptionsToOrder(container, orderId)
  const refunds = await vouchers.refundOrderToVoucher({ order_id: orderId, includeForfeited: true, idempotency_key: `refund:${orderId}`, note: "order_refunded" })
  const issued = await vouchers.voidIssuedForCanceledOrder(orderId, "order_refunded")
  return {
    action: "compensated",
    voucher_refunds: refunds.map((r) => ({ voucher_id: r.voucher_id, amount_minor: r.amount_minor })),
    issued_voided: issued.voided,
    issued_used: issued.used,
  }
}

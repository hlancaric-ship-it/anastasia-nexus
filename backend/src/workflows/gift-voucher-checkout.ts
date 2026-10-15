import type { MedusaContainer } from "@medusajs/framework/types"
import { GIFT_VOUCHER_MODULE } from "../modules/gift-voucher"
import { eligibleMinorForCart, giftVoucherCreditLines, loadVariants, type CartLike, type VariantInfo } from "../modules/gift-voucher/cart"
import {
  GiftVoucherError, GIFT_VOUCHER_CURRENCY, isGiftVoucherProduct, isoDateInZone, toMinor, validateRecipients, variantAmountMinor,
} from "../modules/gift-voucher/policy"
import type GiftVoucherModuleService from "../modules/gift-voucher/service"
import type { RedeemInput } from "../modules/gift-voucher/service"

type Container = Pick<MedusaContainer, "resolve">

export type GiftVoucherCheckout = { redeem?: RedeemInput; voucher_lines: number }

/**
 * Ověření poukazů nad zamčeným snapshotem košíku v completeCartWorkflow (nic nemění):
 * 1) koupě poukazu: povolené hodnoty, cena řádku = nominální hodnota, obdarovaní;
 * 2) čerpání: nejvýš jeden poukaz, kredit 0 < částka ≤ způsobilá částka podle rozsahu poukazu.
 * Košík bez variant i bez kreditu se vrací hned (žádný dotaz).
 */
export async function prepareGiftVoucherCheckout(cart: CartLike, container: Container): Promise<GiftVoucherCheckout | null> {
  const creditLines = giftVoucherCreditLines(cart)
  const variantIds = [...new Set((cart.items ?? []).map((item) => item.variant_id).filter(Boolean) as string[])]
  if (!variantIds.length && !creditLines.length) return null
  const variants: Map<string, VariantInfo> = await loadVariants(container, variantIds)
  const voucherLines = (cart.items ?? []).filter((item) => item.variant_id && isGiftVoucherProduct(variants.get(item.variant_id)?.product))
  if (!voucherLines.length && !creditLines.length) return null
  if (cart.currency_code !== GIFT_VOUCHER_CURRENCY) throw new GiftVoucherError("GIFT_VOUCHER_CURRENCY_MISMATCH")
  const vouchers = container.resolve(GIFT_VOUCHER_MODULE) as GiftVoucherModuleService

  if (voucherLines.length) {
    const settings = await vouchers.getSettings()
    if (!settings.enabled) throw new GiftVoucherError("GIFT_VOUCHER_DISABLED")
    for (const line of voucherLines) {
      const amount = variantAmountMinor(variants.get(line.variant_id!))
      if (!Number.isInteger(amount) || !settings.values_minor.includes(amount) || toMinor(line.unit_price) !== amount) {
        throw new GiftVoucherError("GIFT_VOUCHER_PRODUCT_INVALID")
      }
    }
    const recipients = validateRecipients({
      lines: voucherLines.map((line) => ({ variant_id: line.variant_id!, quantity: Number(line.quantity) })),
      recipients: cart.metadata?.gift_voucher_recipients, method: settings.delivery_method,
      today: isoDateInZone(), validityMonths: settings.validity_months,
    })
    if (!recipients.ok) throw new GiftVoucherError(recipients.error)
  }

  if (!creditLines.length) return { voucher_lines: voucherLines.length }
  if (creditLines.length > 1) throw new GiftVoucherError("GIFT_VOUCHER_MULTIPLE")
  const line = creditLines[0]
  const voucher = line.reference_id ? await vouchers.getVoucher(line.reference_id) : null
  if (!voucher) throw new GiftVoucherError("GIFT_VOUCHER_INVALID")
  const eligible = eligibleMinorForCart(cart, variants, voucher.scope)
  const amount = toMinor(line.amount)
  if (!Number.isInteger(amount) || amount <= 0 || amount > eligible) throw new GiftVoucherError("GIFT_VOUCHER_AMOUNT_CHANGED")
  return { voucher_lines: voucherLines.length, redeem: { voucher_id: voucher.id, cart_id: cart.id, amount_minor: amount, eligible_minor: eligible } }
}

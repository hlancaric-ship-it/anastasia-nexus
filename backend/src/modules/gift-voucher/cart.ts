import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  createCartCreditLinesWorkflow, deleteCartCreditLinesWorkflow, refreshPaymentCollectionForCartWorkflow, updateCartWorkflow,
} from "@medusajs/medusa/core-flows"
import { GIFT_VOUCHER_MODULE } from "./index"
import {
  assertUsable, computeEligibleMinor, fromMinor, GiftVoucherError, GIFT_VOUCHER_CREDIT_REFERENCE, isGiftVoucherProduct,
  isoDateInZone, maskVoucherCode, plannedCreditMinor, toMinor, toMinorFloor, validateRecipients, type EligibleItem, type VoucherScope,
} from "./policy"
import type GiftVoucherModuleService from "./service"
import type { GiftVoucherRow } from "./service"

type Scope = Pick<MedusaContainer, "resolve">

const CART_FIELDS = [
  "id", "currency_code", "completed_at", "metadata", "total",
  "items.id", "items.variant_id", "items.product_id", "items.quantity", "items.unit_price", "items.total",
  "shipping_methods.id", "shipping_methods.total",
  "credit_lines.id", "credit_lines.amount", "credit_lines.reference", "credit_lines.reference_id",
]

export type CartLike = {
  id: string
  currency_code?: string
  completed_at?: unknown
  metadata?: Record<string, unknown> | null
  items?: Array<{ id: string; variant_id?: string | null; product_id?: string | null; quantity: unknown; unit_price: unknown; total?: unknown }>
  shipping_methods?: Array<{ total?: unknown }>
  credit_lines?: Array<{ id: string; amount: unknown; reference?: string | null; reference_id?: string | null; deleted_at?: unknown }>
}

export type VariantInfo = { id: string; metadata?: Record<string, unknown> | null; product?: { id: string; metadata?: Record<string, unknown> | null; categories?: Array<{ id: string }> | null } | null }

export function giftVoucherCreditLines(cart: CartLike) {
  return (cart.credit_lines ?? []).filter((line) => line && line.reference === GIFT_VOUCHER_CREDIT_REFERENCE && !line.deleted_at)
}

export async function loadVariants(scope: Scope, variantIds: string[]): Promise<Map<string, VariantInfo>> {
  if (!variantIds.length) return new Map()
  const query = scope.resolve(ContainerRegistrationKeys.QUERY) as any
  const { data } = await query.graph({ entity: "product_variant", fields: ["id", "metadata", "product.id", "product.metadata", "product.categories.id"], filters: { id: variantIds } })
  return new Map((data ?? []).map((variant: VariantInfo) => [variant.id, variant]))
}

/** Položky pro výpočet způsobilé částky; total položky už obsahuje daň i slevy. */
export function eligibleItems(cart: CartLike, variants: Map<string, VariantInfo>): EligibleItem[] {
  return (cart.items ?? []).map((item) => {
    const variant = item.variant_id ? variants.get(item.variant_id) : undefined
    const total = item.total !== undefined && item.total !== null ? toMinorFloor(item.total) : toMinorFloor(Number(item.unit_price) * Number(item.quantity))
    return {
      is_gift_voucher: isGiftVoucherProduct(variant?.product),
      category_ids: (variant?.product?.categories ?? []).map((category) => category.id),
      total_minor: total,
    }
  })
}

export function eligibleMinorForCart(cart: CartLike, variants: Map<string, VariantInfo>, scope: VoucherScope): number {
  const shipping = (cart.shipping_methods ?? []).reduce((sum, method) => sum + toMinorFloor(method.total ?? 0), 0)
  return computeEligibleMinor({ items: eligibleItems(cart, variants), shipping_minor: shipping, scope })
}

async function loadCart(scope: Scope, cartId: string): Promise<CartLike> {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY) as any
  const { data } = await query.graph({ entity: "cart", fields: CART_FIELDS, filters: { id: cartId } })
  const cart = data?.[0]
  if (!cart) throw new GiftVoucherError("CART_NOT_FOUND")
  return cart
}

export type CreditState = { masked_code: string; amount: number; balance: number; forfeit: number; partial_redemption: boolean; expires_at: Date } | null

/**
 * Nastaví kredit poukazu na košíku na min(zůstatek, způsobilá částka). Volá se při
 * uplatnění kódu a po každém přepočtu košíku. Neplatný/vyčerpaný poukaz kredit odebere.
 * `code` = nové uplatnění (chyby se vrací zákazníkovi), jinak tichá resynchronizace.
 */
export async function syncGiftVoucherCredit(scope: Scope, cartId: string, input: { code?: string; voucher?: GiftVoucherRow } = {}): Promise<{ changed: boolean; credit: CreditState }> {
  const vouchers = scope.resolve(GIFT_VOUCHER_MODULE) as GiftVoucherModuleService
  const cart = await loadCart(scope, cartId)
  if (cart.completed_at) throw new GiftVoucherError("GIFT_VOUCHER_CART_COMPLETED")
  const existing = giftVoucherCreditLines(cart)
  const explicit = input.voucher ?? (input.code !== undefined ? await vouchers.findByCode(input.code) : undefined)
  if (input.code !== undefined && !explicit) throw new GiftVoucherError("GIFT_VOUCHER_INVALID")
  const voucher = explicit ?? (existing.length === 1 && existing[0].reference_id ? await vouchers.getVoucher(existing[0].reference_id) : null)
  let target = 0
  let eligible = 0
  if (voucher) {
    try {
      if (cart.currency_code !== voucher.currency_code) throw new GiftVoucherError("GIFT_VOUCHER_CURRENCY_MISMATCH")
      assertUsable(voucher)
      const variants = await loadVariants(scope, [...new Set((cart.items ?? []).map((item) => item.variant_id).filter(Boolean) as string[])])
      eligible = eligibleMinorForCart(cart, variants, voucher.scope)
      target = plannedCreditMinor(voucher.balance, eligible)
      if (target <= 0) throw new GiftVoucherError("GIFT_VOUCHER_NOT_APPLICABLE")
    } catch (error) {
      if (explicit) throw error
      target = 0
    }
  }
  const unchanged = voucher && target > 0 && existing.length === 1 && existing[0].reference_id === voucher.id && toMinor(existing[0].amount) === target
  if (!unchanged) {
    if (existing.length) await deleteCartCreditLinesWorkflow(scope as any).run({ input: { id: existing.map((line) => line.id) } })
    if (voucher && target > 0) {
      await createCartCreditLinesWorkflow(scope as any).run({ input: [{
        cart_id: cart.id, amount: fromMinor(target), reference: GIFT_VOUCHER_CREDIT_REFERENCE, reference_id: voucher.id,
        metadata: { code_last4: voucher.code_last4, eligible_minor: eligible },
      }] as any })
    }
    await refreshPaymentCollectionForCartWorkflow(scope as any).run({ input: { cart_id: cart.id } })
  }
  if (!voucher || target <= 0) return { changed: !unchanged && existing.length > 0, credit: null }
  return {
    changed: !unchanged,
    credit: {
      masked_code: maskVoucherCode(voucher.code), amount: fromMinor(target), balance: fromMinor(voucher.balance),
      forfeit: voucher.partial_redemption ? 0 : fromMinor(voucher.balance - target), partial_redemption: voucher.partial_redemption, expires_at: voucher.expires_at,
    },
  }
}

export async function removeGiftVoucherCredit(scope: Scope, cartId: string): Promise<boolean> {
  const cart = await loadCart(scope, cartId)
  if (cart.completed_at) throw new GiftVoucherError("GIFT_VOUCHER_CART_COMPLETED")
  const existing = giftVoucherCreditLines(cart)
  if (!existing.length) return false
  await deleteCartCreditLinesWorkflow(scope as any).run({ input: { id: existing.map((line) => line.id) } })
  await refreshPaymentCollectionForCartWorkflow(scope as any).run({ input: { cart_id: cart.id } })
  return true
}

/** Uloží obdarované do cart.metadata po ověření na serveru (znovu se ověří v checkout hooku). */
export async function setGiftVoucherRecipients(scope: Scope, cartId: string, recipients: unknown) {
  const vouchers = scope.resolve(GIFT_VOUCHER_MODULE) as GiftVoucherModuleService
  const cart = await loadCart(scope, cartId)
  if (cart.completed_at) throw new GiftVoucherError("GIFT_VOUCHER_CART_COMPLETED")
  const settings = await vouchers.getSettings()
  const variants = await loadVariants(scope, [...new Set((cart.items ?? []).map((item) => item.variant_id).filter(Boolean) as string[])])
  const lines = (cart.items ?? []).filter((item) => item.variant_id && isGiftVoucherProduct(variants.get(item.variant_id)?.product))
    .map((item) => ({ variant_id: item.variant_id!, quantity: Number(item.quantity) }))
  if (!lines.length) throw new GiftVoucherError("GIFT_VOUCHER_RECIPIENT_COUNT_MISMATCH")
  const parsed = validateRecipients({ lines, recipients, method: settings.delivery_method, today: isoDateInZone(), validityMonths: settings.validity_months })
  if (!parsed.ok) throw new GiftVoucherError(parsed.error)
  await updateCartWorkflow(scope as any).run({ input: { id: cart.id, metadata: { ...(cart.metadata ?? {}), gift_voucher_recipients: parsed.value } } })
  return parsed.value
}

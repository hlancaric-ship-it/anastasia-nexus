import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules, QueryContext } from "@medusajs/framework/utils"
import type { IPromotionModuleService, PromotionDTO } from "@medusajs/framework/types"
import { updateLineItemInCartWorkflow, updateCartWorkflow } from "@medusajs/medusa/core-flows"
import { refreshPaymentCollectionForCartWorkflow } from "@medusajs/medusa/core-flows"
import { resolveCustomerTier } from "./customer-tier"
import { codeAvailable } from "../../admin/coupon-links/validation"
import { GIFT_VOUCHER_CREDIT_REFERENCE, isGiftVoucherProduct, toMinor, fromMinor, variantAmountMinor } from "../../../modules/gift-voucher/policy"
import { syncGiftVoucherCredit, type CreditState } from "../../../modules/gift-voucher/cart"
import { recordEvent } from "../../../lib/observability/events"
import { requestIdHeaders } from "../../../lib/observability/log"

type PriceResponse = {
  ok: true
  tenantId: string
  calculated: { finalPrice: number; appliedRules: string[]; rejected: unknown[] }
}

/**
 * Server-resolved kupón uložený na cart.metadata.nexus_coupon -- NIKDY se
 * nebere znovu z klientského requestu při každém repriceCart() volání (K2
 * propojení s checkout gate by jinak padalo na PRICE_CHANGED, protože by
 * se stejný kód posuzoval dvakrát nezávisle). Jen procentuální sleva --
 * `type: "fixed"` kupóny tahle verze zatím nepodporuje (viz
 * CouponDiscountRule.ts v NEXUSu, per-item calculator neumí alokaci pevné
 * částky napříč položkami košíku).
 */
type StoredCoupon = { code: string; promotion_id: string; type: "percentage"; value: number }

function readStoredCoupon(metadata: Record<string, unknown> | null | undefined): StoredCoupon | undefined {
  const raw = metadata?.nexus_coupon
  if (!raw || typeof raw !== "object") return undefined
  const c = raw as Record<string, unknown>
  if (typeof c.code !== "string" || typeof c.promotion_id !== "string" || c.type !== "percentage" || typeof c.value !== "number") return undefined
  return { code: c.code, promotion_id: c.promotion_id, type: "percentage", value: c.value }
}

async function persistCartCoupon(scope: MedusaRequest["scope"], cartId: string, existingMetadata: Record<string, unknown> | null | undefined, coupon: StoredCoupon | null) {
  const metadata = { ...(existingMetadata || {}) }
  if (coupon) metadata.nexus_coupon = coupon
  else delete metadata.nexus_coupon
  await updateCartWorkflow(scope).run({ input: { id: cartId, metadata } })
}

/**
 * Vyhledá a ověří kupón podle kódu (bez vazby na konkrétní SKU -- na
 * rozdíl od `validateLink` v admin/coupon-links, který QR odkaz váže na
 * produkt). Vrací `undefined`, pokud kód neexistuje nebo není momentálně
 * dostupný (`codeAvailable`) -- volající rozhodne, jestli je to chyba
 * (nový kód od zákaznice) nebo tichý pokles (dřív uložený kód mezitím
 * vypršel/došel limit).
 */
async function lookupCoupon(scope: MedusaRequest["scope"], code: string): Promise<StoredCoupon | undefined> {
  const promotions = scope.resolve<IPromotionModuleService>(Modules.PROMOTION)
  const matches = await promotions.listPromotions({ code }, { relations: ["campaign", "application_method"], take: 2 })
  const promotion = matches[0] as PromotionDTO | undefined
  if (matches.length !== 1 || !promotion || !codeAvailable(promotion, code)) return undefined
  const method = promotion.application_method
  if (!method || method.type !== "percentage" || typeof method.value !== "number" || method.value <= 0 || method.value > 100) return undefined
  return { code, promotion_id: promotion.id, type: "percentage", value: method.value }
}

/**
 * Vyřeší kupón platný pro tenhle reprice:
 * - `couponCodeInput === null` -> zákaznice kupón explicitně odebírá.
 * - `couponCodeInput` je string -> nový/změněný kód, musí projít ověřením
 *   (jinak COUPON_INVALID -- na rozdíl od "tiše zmizelého" starého kódu).
 * - `couponCodeInput === undefined` -> žádná změna z klienta; použije se
 *   dřív uložený kód, ale ZNOVU se ověří dostupnost (limit/platnost se
 *   mohly mezitím změnit -- nikdy se nespoléhá na starou uloženou platnost).
 */
async function resolveCartCoupon(scope: MedusaRequest["scope"], cartId: string, cartMetadata: Record<string, unknown> | null | undefined, couponCodeInput: string | null | undefined): Promise<StoredCoupon | undefined> {
  if (couponCodeInput === null) {
    await persistCartCoupon(scope, cartId, cartMetadata, null)
    return undefined
  }
  if (typeof couponCodeInput === "string" && couponCodeInput.trim().length > 0) {
    const resolved = await lookupCoupon(scope, couponCodeInput.trim())
    if (!resolved) throw new Error("COUPON_INVALID")
    await persistCartCoupon(scope, cartId, cartMetadata, resolved)
    return resolved
  }
  const stored = readStoredCoupon(cartMetadata)
  if (!stored) return undefined
  const revalidated = await lookupCoupon(scope, stored.code)
  if (!revalidated) {
    await persistCartCoupon(scope, cartId, cartMetadata, null)
    return undefined
  }
  return revalidated
}

/**
 * Recalculate every existing cart line using Medusa catalog data and NEXUS.
 * `couponCodeInput`: `undefined` = nezasahovat (jen znovu ověřit uložený
 * kupón, pokud nějaký je); `string` = nastavit/vyměnit kupón; `null` =
 * odebrat uložený kupón. Viz `resolveCartCoupon`.
 */
export async function repriceCart(cartId: string, scope: MedusaRequest["scope"], applyChanges = true, couponCodeInput?: string | null) {
  if (!cartId || typeof cartId !== "string") throw new Error("INVALID_CART_ID")
  const query: any = scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "cart",
    fields: [
      "id", "currency_code", "region_id", "metadata", "customer.metadata", "customer.groups.name", "customer.groups.metadata",
      "items.id", "items.quantity", "items.variant_id", "items.unit_price",
      "credit_lines.id", "credit_lines.reference",
    ],
    filters: { id: cartId },
  })
  const cart = data?.[0]
  if (!cart) throw new Error("CART_NOT_FOUND")
  const coupon = await resolveCartCoupon(scope, cartId, cart.metadata, couponCodeInput)
  const tenantId = process.env.NEXUS_TENANT_ID
  const pricingUrl = process.env.NEXUS_PRICING_URL
  const apiKey = process.env.NEXUS_PRICING_API_KEY
  if (!tenantId || !pricingUrl || !apiKey) throw new Error("NEXUS_PRICING_NOT_CONFIGURED")
  let endpoint: URL
  try { endpoint = new URL(pricingUrl) } catch { throw new Error("NEXUS_PRICING_NOT_CONFIGURED") }
  if (endpoint.username || endpoint.password || (endpoint.protocol !== "https:" && !(endpoint.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(endpoint.hostname)))) {
    throw new Error("NEXUS_PRICING_NOT_CONFIGURED")
  }
  if (cart.currency_code !== "eur") throw new Error("UNSUPPORTED_CURRENCY")
  const variantIds = (cart.items || []).map((item: any) => item.variant_id).filter(Boolean)
  const variantsResult = variantIds.length ? await query.graph({
    entity: "product_variant",
    fields: ["id", "sku", "calculated_price.calculated_amount", "calculated_price.original_amount", "calculated_price.currency_code", "metadata", "product.title", "product.metadata"],
    filters: { id: variantIds },
    context: {
      calculated_price: QueryContext({
        region_id: cart.region_id,
        currency_code: cart.currency_code,
      }),
    },
  }) : { data: [] }
  const variants = new Map((variantsResult.data || []).map((variant: any) => [variant.id, variant]))

  const customerTier = resolveCustomerTier(cart.customer?.groups)
  const pricedItems: Array<{ id: string; sku: string; quantity: number; unit_price: number; is_discountable: boolean; metadata: Record<string, unknown> }> = []
  let pricesChanged = false
  let giftVoucher: CreditState = null
  for (const item of cart.items || []) {
    const variant = variants.get(item.variant_id) as any
    const product = variant?.product
    const currentAmount = Number(variant?.calculated_price?.calculated_amount)
    const originalAmount = Number(variant?.calculated_price?.original_amount)
    const quantity = Number(item.quantity)
    if (!variant?.id || !variant.sku || variant.calculated_price?.currency_code !== cart.currency_code || !Number.isFinite(currentAmount) || currentAmount < 0 || !Number.isInteger(quantity) || quantity < 1) {
      throw new Error("INVALID_MEDUSA_LINE_ITEM")
    }
    if (isGiftVoucherProduct(product)) {
      // Darčekový poukaz: cena = nominální hodnota varianty, NEXUS (slevy, věrnost, kupón) se nepoužije.
      const amount = variantAmountMinor(variant)
      if (!Number.isInteger(amount) || toMinor(currentAmount) !== amount) throw new Error("GIFT_VOUCHER_PRODUCT_INVALID")
      const unitPrice = fromMinor(amount)
      pricedItems.push({ id: item.id, sku: variant.sku, quantity, unit_price: unitPrice, is_discountable: false, metadata: { gift_voucher: true } })
      pricesChanged ||= Number(item.unit_price) !== unitPrice
      continue
    }
    const basePrice = Number.isFinite(originalAmount) && originalAmount >= currentAmount ? originalAmount : currentAmount
    const salePrice = basePrice > currentAmount ? currentAmount : undefined
    const metadata = product?.metadata || {}
    let response: Response
    try {
      response = await fetch(pricingUrl, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(5000),
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}`, ...requestIdHeaders() },
        body: JSON.stringify({
        tenantId,
        sku: variant.sku,
        basePrice,
        salePrice,
        customerTier,
        manufacturer: typeof metadata.manufacturer === "string" ? metadata.manufacturer : undefined,
        category: typeof metadata.category === "string" ? metadata.category : undefined,
        productMaxDiscount: typeof metadata.max_discount === "number" ? metadata.max_discount : undefined,
        allowLoyaltyDiscount: true,
        couponDiscountPercent: coupon ? coupon.value / 100 : undefined,
        }),
      })
    } catch {
      throw new Error("NEXUS_PRICING_UNAVAILABLE")
    }
    if (!response.ok) throw new Error(`NEXUS_PRICING_FAILED_${response.status}`)
    let price: PriceResponse
    try { price = await response.json() as PriceResponse } catch { throw new Error("INVALID_NEXUS_PRICE_RESPONSE") }
    if (!price || price.ok !== true || price.tenantId !== tenantId || !Number.isFinite(price.calculated?.finalPrice) || price.calculated.finalPrice < 0 || !Array.isArray(price.calculated.appliedRules) || price.calculated.appliedRules.some((rule) => typeof rule !== "string")) {
      throw new Error("INVALID_NEXUS_PRICE_RESPONSE")
    }
    pricedItems.push({
      id: item.id,
      sku: variant.sku,
      quantity,
      unit_price: price.calculated.finalPrice,
      is_discountable: false,
      metadata: { nexus_tenant_id: tenantId, nexus_pricing_rules: price.calculated.appliedRules, nexus_coupon_code: coupon?.code },
    })
    pricesChanged ||= Number(item.unit_price) !== price.calculated.finalPrice
  }

  if (applyChanges) {
    for (const item of pricedItems) {
      await updateLineItemInCartWorkflow(scope).run({ input: { cart_id: cartId, item_id: item.id, update: { unit_price: item.unit_price, is_discountable: false, metadata: item.metadata } } })
    }
    // Kredit poukazu se po přepočtu cen znovu srovná se zůstatkem a způsobilou částkou.
    if ((cart.credit_lines || []).some((line: any) => line?.reference === GIFT_VOUCHER_CREDIT_REFERENCE)) {
      const synced = await syncGiftVoucherCredit(scope, cartId)
      giftVoucher = synced.credit
      pricesChanged ||= synced.changed
    }
    await refreshPaymentCollectionForCartWorkflow(scope).run({ input: { cart_id: cartId } })
  }
  return { tenantId, items: pricedItems, pricesChanged, coupon: coupon ? { code: coupon.code } : null, gift_voucher: giftVoucher }
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    const { cart_id: cartId, couponCode } = req.body as { cart_id?: string; couponCode?: string | null }
    if (couponCode !== undefined && couponCode !== null && typeof couponCode !== "string") {
      return res.status(400).json({ ok: false, error: "VALIDATION_ERROR" })
    }
    const pricing = await repriceCart(cartId || "", req.scope, true, couponCode)
    await recordEvent(req.scope, "info", "pricing", "repriced", {
      cart_id: cartId, tenant_id: pricing.tenantId, lines: pricing.items.length, prices_changed: pricing.pricesChanged,
      coupon_applied: Boolean(pricing.coupon), gift_voucher_applied: Boolean(pricing.gift_voucher),
    })
    return res.status(200).json({ ok: true, ...pricing })
  } catch (error) {
    const message = error instanceof Error ? error.message : "PRICING_FAILED"
    const cartId = (req.body as { cart_id?: unknown } | undefined)?.cart_id
    await recordEvent(req.scope, message.startsWith("NEXUS_PRICING") || message === "INVALID_NEXUS_PRICE_RESPONSE" ? "error" : "warn", message === "COUPON_INVALID" ? "coupon" : "pricing", "reprice_failed", {
      cart_id: typeof cartId === "string" ? cartId : null, error_code: /^[A-Z][A-Z0-9_]{2,63}$/.test(message) ? message : "PRICING_FAILED",
    })
    const status = message === "CART_NOT_FOUND" ? 404 : message === "COUPON_INVALID" ? 400 : message.startsWith("NEXUS_PRICING") ? 503 : 400
    return res.status(status).json({ ok: false, error: message })
  }
}

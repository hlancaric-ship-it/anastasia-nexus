import { MedusaRequest, MedusaResponse, AuthenticatedMedusaRequest } from "@medusajs/framework/http"
import { assertCartAccess, customerActor } from "../../../lib/checkout/cart-access"
import { ContainerRegistrationKeys, Modules, QueryContext } from "@medusajs/framework/utils"
import type { IPromotionModuleService, PromotionDTO } from "@medusajs/framework/types"
import { updateLineItemInCartWorkflow, updateCartWorkflow } from "@medusajs/medusa/core-flows"
import { refreshPaymentCollectionForCartWorkflow } from "@medusajs/medusa/core-flows"
import { resolveCustomerTier } from "./customer-tier"
import { codeAvailable } from "../../admin/coupon-links/validation"
import { allocateFixedCoupon, couponAppliesToProduct, resolveCoupon } from "../../../lib/pricing/coupon"
import { resolveSalePrice } from "../../../lib/pricing/sale"
import { GIFT_VOUCHER_CREDIT_REFERENCE, isGiftVoucherProduct, toMinor, fromMinor, variantAmountMinor } from "../../../modules/gift-voucher/policy"
import { syncGiftVoucherCredit, type CreditState } from "../../../modules/gift-voucher/cart"
import { recordEvent } from "../../../lib/observability/events"
import { requestIdHeaders } from "../../../lib/observability/log"
import { productRequiresShipping } from "../../../lib/checkout/product-delivery"

type PriceResponse = {
  ok: true
  tenantId: string
  calculated: { finalPrice: number; appliedRules: string[]; rejected: unknown[] }
}

/**
 * Server-resolved kupón uložený na cart.metadata.nexus_coupon -- NIKDY se
 * nebere znovu z klientského requestu při každém repriceCart() volání (K2
 * propojení s checkout gate by jinak padalo na PRICE_CHANGED, protože by
 * se stejný kód posuzoval dvakrát nezávisle).
 *
 * Klient posiela LEN kód. Percentá aj pevná suma, rozsah (celý košík /
 * vybrané produkty), limit a platnosť rieši server (Medusa = autorita pravidiel,
 * NEXUS Worker = autorita výpočtu ceny).
 */
type StoredCoupon = {
  code: string
  promotion_id: string
  type: "percentage" | "fixed"
  value: number
  target: "order" | "items"
  product_ids: string[] | null
  currency: string
}

function readStoredCoupon(metadata: Record<string, unknown> | null | undefined): StoredCoupon | undefined {
  const raw = metadata?.nexus_coupon
  if (!raw || typeof raw !== "object") return undefined
  const c = raw as Record<string, unknown>
  if (typeof c.code !== "string" || typeof c.promotion_id !== "string") return undefined
  if (c.type !== "percentage" && c.type !== "fixed") return undefined
  if (typeof c.value !== "number" || !Number.isFinite(c.value) || c.value <= 0) return undefined
  const target = c.target === "order" ? "order" : "items"
  const productIds = Array.isArray(c.product_ids) ? c.product_ids.map((value) => String(value)).filter(Boolean) : null
  return {
    code: c.code,
    promotion_id: c.promotion_id,
    type: c.type,
    value: c.value,
    target,
    product_ids: productIds,
    currency: typeof c.currency === "string" ? c.currency : "eur",
  }
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
 * (nový kód od zákazníka) nebo tichý pokles (dřív uložený kód mezitím
 * vypršel/došel limit).
 *
 * Podporuje se percentuálna aj pevná zľava (EUR), rozsah `order` aj `items`
 * a obmedzenie na produkty (`target_rules items.product.id`). Nepodporovaná
 * pravidla (pravidla pro zákazníka, „kúpi X a dostane Y“) se odmietajú.
 */
async function lookupCoupon(scope: MedusaRequest["scope"], code: string): Promise<StoredCoupon | undefined> {
  const promotions = scope.resolve<IPromotionModuleService>(Modules.PROMOTION)
  // `application_method.target_rules.values` je nutné načítať – hodnoty pravidla
  // (napr. `items.product.id in [...]`) ležia v samostatnej tabuľke a bez nich sa
  // obmedzenie na produkty nedá prečítať (kupón by sa vôbec neuplatnil).
  const matches = await promotions.listPromotions({ code }, { relations: ["campaign", "rules", "application_method", "application_method.target_rules", "application_method.target_rules.values", "application_method.buy_rules"], take: 2 })
  const promotion = matches[0] as PromotionDTO | undefined
  if (matches.length !== 1 || !promotion || !codeAvailable(promotion, code)) return undefined
  const resolved = resolveCoupon(promotion as any, code)
  if (!resolved) return undefined
  return {
    code: resolved.code,
    promotion_id: resolved.promotion_id,
    type: resolved.type,
    value: resolved.value,
    target: resolved.target,
    product_ids: resolved.product_ids,
    currency: resolved.currency,
  }
}

/**
 * Vyřeší kupón platný pro tenhle reprice:
 * - `couponCodeInput === null` -> zákazník kupón explicitně odebírá.
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
  // Uložené pole (promotion_id, hodnota, rozsah) mohol prepísať klient alebo ich medzitým
  // zmenil správca – v košíku sa vždy prepíšu hodnotami zo servera.
  if (JSON.stringify(stored) !== JSON.stringify(revalidated)) await persistCartCoupon(scope, cartId, cartMetadata, revalidated)
  return revalidated
}

/**
 * Recalculate every existing cart line using Medusa catalog data and NEXUS.
 * `couponCodeInput`: `undefined` = nezasahovat (jen znovu ověřit uložený
 * kupón, pokud nějaký je); `string` = nastavit/vyměnit kupón; `null` =
 * odebrat uložený kupón. Viz `resolveCartCoupon`.
 *
 * `expectedCustomerId`: vlastník, který smí s košíkem manipulovat. Pokud je
 * zadán, cart.customer_id se mu musí PŘESNĚ rovnat (guest košík s
 * `customer_id === null` je odmítnut) -- jinak CART_ACCESS_DENIED. Vynechání
 * parametru ownership kontrolu přeskakuje a je určené JEN pro důvěryhodné
 * interní volající (hooks.ts), NIKDY pro HTTP handlery, kde se vlastník bere
 * z auth_context.
 *
 * `guest`: nákup bez registrácie (HTTP handler bez prihláseného zákazníka). Host smie
 * len košík bez účtu, viz `canAccessCart`.
 */
export async function repriceCart(cartId: string, scope: MedusaRequest["scope"], applyChanges = true, couponCodeInput?: string | null, expectedCustomerId?: string, guest = false) {
  if (!cartId || typeof cartId !== "string") throw new Error("INVALID_CART_ID")
  const query: any = scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "cart",
    fields: [
      "id", "currency_code", "region_id", "metadata", "customer_id", "customer.has_account", "customer.metadata", "customer.groups.name", "customer.groups.metadata",
      "items.id", "items.quantity", "items.variant_id", "items.unit_price", "items.requires_shipping",
      "credit_lines.id", "credit_lines.reference",
    ],
    filters: { id: cartId },
  })
  const cart = data?.[0]
  if (!cart) throw new Error("CART_NOT_FOUND")
  if (guest || expectedCustomerId) assertCartAccess(cart, expectedCustomerId)
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
    fields: ["id", "sku", "calculated_price.calculated_amount", "calculated_price.original_amount", "calculated_price.currency_code", "metadata", "product.id", "product.title", "product.metadata", "product.shipping_profile.type"],
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
  const pricedItems: Array<{ id: string; sku: string; quantity: number; unit_price: number; requires_shipping: boolean; is_discountable: boolean; metadata: Record<string, unknown> }> = []
  let pricesChanged = false
  let giftVoucher: CreditState = null

  // 1) Cena každej položky: základná cena (bez výpredaja) a výpredajová cena.
  //    Základná cena je vstup pre NEXUS (z ktorej sa počíta zľava), výpredaj
  //    sa rozhoduje z metadát `vyprodej` (aktívna + platná do) a z cenového zoznamu.
  type Prepared = { id: string; variant: any; quantity: number; basePrice: number; salePrice: number | null; productId: string | null }
  const prepared: Prepared[] = []
  for (const item of cart.items || []) {
    const variant = variants.get(item.variant_id) as any
    const product = variant?.product
    const currentAmount = Number(variant?.calculated_price?.calculated_amount)
    const originalAmount = Number(variant?.calculated_price?.original_amount)
    const quantity = Number(item.quantity)
    if (!variant?.id || !variant.sku || variant.calculated_price?.currency_code !== cart.currency_code || !Number.isFinite(currentAmount) || currentAmount < 0 || !Number.isInteger(quantity) || quantity < 1) {
      throw new Error("INVALID_MEDUSA_LINE_ITEM")
    }
    const sale = resolveSalePrice({
      originalAmount,
      currentAmount,
      metadata: product?.metadata?.vyprodej ?? variant?.metadata?.vyprodej,
    })
    prepared.push({
      id: item.id,
      variant,
      quantity,
      basePrice: sale.basePrice,
      salePrice: sale.salePrice,
      productId: typeof product?.id === "string" ? product.id : null,
    })
  }

  // 2) Pevná zľava (EUR) sa rozdeľuje medzi položky, na ktoré kupón platí.
  //    Percentuálna zľava nemusí alokáciu -- Worker ju aplikuje na každú položku.
  const couponItems = prepared
    .filter((item) => couponAppliesToProduct(coupon, item.productId))
    .map((item) => ({ id: item.id, productId: item.productId, basePrice: item.basePrice }))
  const fixedAllocation = coupon && coupon.type === "fixed"
    ? allocateFixedCoupon(coupon.value, couponItems)
    : new Map<string, number>()

  for (const item of prepared) {
    const variant = item.variant
    const product = variant?.product
    const quantity = item.quantity
    if (isGiftVoucherProduct(product)) {
      // Darčekový poukaz: cena = nominální hodnota varianty, NEXUS (slevy, věrnost, kupón) se nepoužije.
      const amount = variantAmountMinor(variant)
      if (!Number.isInteger(amount) || toMinor(Number(variant?.calculated_price?.calculated_amount)) !== amount) throw new Error("GIFT_VOUCHER_PRODUCT_INVALID")
      const unitPrice = fromMinor(amount)
      pricedItems.push({ id: item.id, sku: variant.sku, quantity, unit_price: unitPrice, requires_shipping: productRequiresShipping(product), is_discountable: false, metadata: { gift_voucher: true } })
      pricesChanged ||= Number(cart.items?.find((line: any) => line.id === item.id)?.unit_price) !== unitPrice
      continue
    }
    const basePrice = item.basePrice
    const salePrice = item.salePrice ?? undefined
    const metadata = product?.metadata || {}
    const couponApplies = couponAppliesToProduct(coupon, item.productId)
    const fixedAmount = couponApplies ? (fixedAllocation.get(item.id) ?? 0) : 0
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
        // Kupón: percentá len na položky, na ktoré platí; pevná suma je rozdelená
        // už v backendu (alokácia) a Worker ju odčíta od ceny (nikdy pod 0).
        couponDiscountPercent: couponApplies && coupon?.type === "percentage" ? coupon.value / 100 : undefined,
        couponFixedAmount: fixedAmount > 0 ? fixedAmount : undefined,
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
      requires_shipping: productRequiresShipping(product),
      is_discountable: false,
      metadata: { nexus_tenant_id: tenantId, nexus_pricing_rules: price.calculated.appliedRules, nexus_coupon_code: couponApplies ? coupon?.code : undefined },
    })
    pricesChanged ||= Number(cart.items?.find((line: any) => line.id === item.id)?.unit_price) !== price.calculated.finalPrice
  }

  if (applyChanges) {
    for (const item of pricedItems) {
      await updateLineItemInCartWorkflow(scope).run({ input: { cart_id: cartId, item_id: item.id, update: { unit_price: item.unit_price, requires_shipping: item.requires_shipping, is_discountable: false, metadata: item.metadata } } })
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

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const actorId = customerActor(req)
  try {
    const { cart_id: cartId, couponCode } = req.body as { cart_id?: string; couponCode?: string | null }
    if (couponCode !== undefined && couponCode !== null && typeof couponCode !== "string") {
      return res.status(400).json({ ok: false, error: "VALIDATION_ERROR" })
    }
    const pricing = await repriceCart(cartId || "", req.scope, true, couponCode, actorId, !actorId)
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
    const status = message === "CART_ACCESS_DENIED" ? 403 : message === "CART_NOT_FOUND" ? 404 : message === "COUPON_INVALID" ? 400 : message.startsWith("NEXUS_PRICING") ? 503 : 400
    return res.status(status).json({ ok: false, error: message })
  }
}

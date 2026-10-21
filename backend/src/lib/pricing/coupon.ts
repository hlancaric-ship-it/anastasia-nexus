/**
 * Serverová politika kupónov (A-03 / P0 auditu).
 *
 * Rozhodnutie o tom, či sa kupón uplatní a na čo, patrí serveru. Klient
 * posiela LEN kód kupónu – nikdy percentá, nikdy sumy, nikdy zoznam produktov.
 * Medusa je autorita pre pravidlá kupónu (limity, platnosť, pravidlá
 * produktov); NEXUS Worker je autorita pre výpočet ceny.
 *
 * Podporované (a nič iné):
 *   - `type: 'percentage'` – zľava v percentách,
 *   - `type: 'fixed'`      – pevná suma v EUR,
 *   - `target_type: 'order' | 'items'` – celý košík alebo položky,
 *   - `target_rules: [{ attribute: 'items.product.id', operator: 'in', values: [...] }]`
 *     – zľava platí LEN na uvedené produkty.
 *
 * Všetko ostatné (pravidlá pre zákazníka, „kúpi X a dostane Y“, limity
 * množstva) sa **odmietne** – kupón sa neurozní a nezníži cenu nič o nič.
 */

export type CouponType = "percentage" | "fixed"
export type CouponTarget = "order" | "items"

export type ResolvedCoupon = {
  code: string
  promotion_id: string
  type: CouponType
  /** percentá (0–100) alebo pevná suma v EUR */
  value: number
  /** `order` = celý košík, `items` = položky */
  target: CouponTarget
  /** obmedzenie na produkty (target_rules); null = bez obmedzenia */
  product_ids: string[] | null
  /** mena pevnej sumy (`eur`) */
  currency: string
  /** príznak `is_tax_inclusive` z kupónu (informácia pre audit; ceny sú s DPH) */
  tax_inclusive: boolean
}

type PromotionLike = {
  id?: string
  code?: string | null
  type?: string | null
  is_tax_inclusive?: boolean | null
  rules?: unknown[] | null
  application_method?: {
    type?: string | null
    target_type?: string | null
    allocation?: string | null
    value?: number | null
    currency_code?: string | null
    target_rules?: Array<{ attribute?: string | null; operator?: string | null; values?: unknown[] | null }> | null
    buy_rules?: unknown[] | null
    max_quantity?: number | null
    buy_rules_min_quantity?: number | null
    apply_to_quantity?: number | null
  } | null
}

export const SHOP_CURRENCY = "eur"

/**
export type PromotionLike = {
  id?: string
  code?: string | null
  type?: string | null
  is_tax_inclusive?: boolean | null
  rules?: unknown[] | null
  application_method?: {
    type?: string | null
    target_type?: string | null
    allocation?: string | null
    value?: number | null
    currency_code?: string | null
    target_rules?: Array<{
      attribute?: string | null
      operator?: string | null
      values?: unknown[] | null
    }> | null
    buy_rules?: unknown[] | null
    max_quantity?: number | null
    buy_rules_min_quantity?: number | null
    apply_to_quantity?: number | null
  } | null
}

/**
 * Prevedie Medusa Promotion na kupón, ktorý sa dá uplatniť. `null` = kupón
 * sa v košíku NEUPLATNÍ (neskryte zľava, neignorované pravidlo).
 */
export function resolveCoupon(promotion: PromotionLike | undefined | null, code: string): ResolvedCoupon | null {
  if (!promotion || !promotion.id || promotion.code !== code) return null
  const method = promotion.application_method
  if (!method) return null

  // Nepodporované pravidlá sa odmietajú celé (tichá strata zľavy by bola zle).
  if (promotion.type !== "standard") return null
  if (Array.isArray(promotion.rules) && promotion.rules.length) return null
  if (Array.isArray(method.buy_rules) && method.buy_rules.length) return null
  if (method.max_quantity != null || method.buy_rules_min_quantity != null || method.apply_to_quantity != null) return null

  const target = method.target_type
  if (target !== "order" && target !== "items") return null
  const type = method.type
  if (type !== "percentage" && type !== "fixed") return null
  const value = Number(method.value)
  if (!Number.isFinite(value) || value <= 0) return null
  if (type === "percentage" && value > 100) return null

  const currency = String(method.currency_code ?? SHOP_CURRENCY).trim().toLowerCase() || SHOP_CURRENCY
  if (type === "fixed" && currency !== SHOP_CURRENCY) return null

  // Obmedzenie na produkty: jediná podporovaná forma je `items.product.id in [...]`.
  const rules = Array.isArray(method.target_rules) ? method.target_rules : []
  let productIds: string[] | null = null
  if (rules.length) {
    if (rules.length !== 1) return null
    const rule = rules[0]
    if (rule?.attribute !== "items.product.id" || rule?.operator !== "in") return null
    // Medusa vracia hodnoty pravidla ako objekty `{ value }` (tabuľka promotion_rule_value).
    const values = Array.isArray(rule.values)
      ? rule.values.map((entry: unknown) => (entry && typeof entry === "object" ? String((entry as { value?: unknown }).value ?? "") : String(entry))).filter(Boolean)
      : []
    if (!values.length) return null
    productIds = [...new Set(values)]
  }

  return {
    code,
    promotion_id: promotion.id,
    type,
    value: type === "percentage" ? value : Math.round(value * 100) / 100,
    target,
    product_ids: productIds,
    currency,
    tax_inclusive: promotion.is_tax_inclusive !== false,
  }
}

/** Platí kupón na tento produkt? Bez `target_rules` platí na všetko. */
export function couponAppliesToProduct(
  coupon: { product_ids?: string[] | null } | null | undefined,
  productId: string | null | undefined,
): boolean {
  if (!coupon) return false
  if (!coupon.product_ids) return true
  if (!productId) return false
  return coupon.product_ids.includes(productId)
}

/**
 * Kód kupónu uloženého v metadátach košíka (`cart.metadata.nexus_coupon`), ak je platný.
 *
 * Uložený kupón znamená, že košík má zľavu a použitie kupónu sa musí započítať – natívna
 * trasa dokončenia košíka to nezapisuje, preto sa pre ňu košík s kupónom zakáže
 * (pozri `api/store/carts/complete-guard.ts`).
 */
export function storedCouponCode(metadata: unknown): string | null {
  const source = (metadata && typeof metadata === "object" ? metadata : {}) as Record<string, unknown>
  const raw = source.nexus_coupon
  if (!raw || typeof raw !== "object") return null
  const entry = raw as Record<string, unknown>
  const code = typeof entry.code === "string" ? entry.code.trim() : ""
  const promotionId = typeof entry.promotion_id === "string" ? entry.promotion_id.trim() : ""
  if (!code || !promotionId) return null
  return code
}

export type CouponAllocationItem = {
  /** id položky košíka */
  id: string
  productId: string | null | undefined
  /** cena pred zľavou (base price), podľa ktorej sa pevná suma rozdeľuje */
  basePrice: number
}

/**
 * Rozdelí pevnú sumu (EUR) medzi položky, na ktoré kupón platí.
 *
 * - rozdelenie je úmerné cenám položiek (rovnaké percentá pre všetky),
 * - žiadna položka nedostane viac než svoju cenu (zľava nikdy nezníži cenu pod 0),
 * - súčet zľavy je najviac pevná suma kupónu (zvyšok sa nerozdáva nikomu),
 * - deterministické a bez náhody (poradie = poradie košíka).
 */
export function allocateFixedCoupon(amount: number, items: CouponAllocationItem[]): Map<string, number> {
  const result = new Map<string, number>()
  const eligible = items.filter((item) => Number.isFinite(item.basePrice) && item.basePrice > 0)
  const total = eligible.reduce((sum, item) => sum + item.basePrice, 0)
  const value = Number(amount)
  if (!eligible.length || !Number.isFinite(value) || value <= 0 || total <= 0) return result
  const capped = Math.min(value, total)
  let distributed = 0
  eligible.forEach((item, index) => {
    const isLast = index === eligible.length - 1
    const share = isLast ? capped - distributed : Math.round((capped * item.basePrice / total) * 100) / 100
    const bounded = Math.max(0, Math.min(share, item.basePrice))
    result.set(item.id, Math.round(bounded * 100) / 100)
    distributed += bounded
  })
  return result
}

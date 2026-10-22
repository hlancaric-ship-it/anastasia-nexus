import { repriceCart } from "../route"

// Workflow zápisu do košíka je v tomto teste fake – reálny Medusa kontajner
// (zámok, databáza) tu nie je a testuje sa len výpočet ceny.
jest.mock("@medusajs/medusa/core-flows", () => ({
  updateLineItemInCartWorkflow: jest.fn(() => ({ run: jest.fn(async () => undefined) })),
  updateCartWorkflow: jest.fn(() => ({ run: jest.fn(async () => undefined) })),
  refreshPaymentCollectionForCartWorkflow: jest.fn(() => ({ run: jest.fn(async () => undefined) })),
}))

/**
 * Kupóny, výpredajová cena a ich poriadanie – všetko serverovo.
 *
 * Worker je v teste simulovaný presne tak, ako pracuje `nexusPricing.ts`:
 * základná cena → max(výpredaj, vernostná zľava) → kupón. Klient nikdy
 * neposiela cenu ani percentá – posiela len kód kupónu.
 */

const TENANT = "anastasia"

type Item = { id: string; variant_id: string; quantity: number; unit_price: number }

const RESET = { id: "prod_reset", title: "AI ANASTASIA RESET 40+" }
const OTHER = { id: "prod_other", title: "Tvoja pleťová voda" }

const items: Item[] = [
  { id: "line_reset", variant_id: "var_reset", quantity: 1, unit_price: 168 },
  { id: "line_other", variant_id: "var_other", quantity: 1, unit_price: 50 },
]

const variants: Record<string, any> = {
  var_reset: {
    id: "var_reset",
    sku: "EP.002",
    calculated_price: { calculated_amount: 168, original_amount: 168, currency_code: "eur" },
    metadata: {},
    product: { id: RESET.id, title: RESET.title, metadata: {} },
  },
  var_other: {
    id: "var_other",
    sku: "EP.OTHER",
    calculated_price: { calculated_amount: 50, original_amount: 50, currency_code: "eur" },
    metadata: {},
    product: { id: OTHER.id, title: OTHER.title, metadata: {} },
  },
}

const cart = (metadata: Record<string, unknown> = {}) => ({
  id: "cart_synthetic",
  currency_code: "eur",
  region_id: "region_synthetic",
  customer_id: "cus_synthetic",
  customer: { id: "cus_synthetic", metadata: {}, groups: [] },
  metadata,
  items,
  credit_lines: [],
})

const scope = (promotion: any = null, cartMetadata: Record<string, unknown> = {}) => {
  const promotions = {
    listPromotions: jest.fn(async ({ code }: any) => {
      if (!promotion || promotion.code !== code) return []
      return [promotion]
    }),
  }
  const query = {
    graph: jest.fn(async ({ entity }: any) => {
      if (entity === "cart") return { data: [cart(cartMetadata)] }
      if (entity === "product_variant") return { data: Object.values(variants) }
      return { data: [] }
    }),
  }
  return {
    resolve: (key: string) => {
      if (key === "promotion") return promotions
      if (key === "query") return query
      if (key === "logger") return { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
      return {}
    },
    __promotions: promotions,
  } as any
}

/** Worker v teste: základ → max(výpredaj, vernostná zľava) → kupón. */
const workerFetch = (calls: any[]) => jest.fn(async (_url: string, options: any) => {
  const body = JSON.parse(options.body)
  calls.push(body)
  let price = body.basePrice
  const sale = typeof body.salePrice === "number" ? body.salePrice : undefined
  const loyalty = body.customerTier ? 0 : 0
  const loyaltyPrice = body.customerTier ? price * (1 - loyalty) : undefined
  if (sale !== undefined && loyaltyPrice !== undefined) price = Math.min(sale, loyaltyPrice)
  else if (sale !== undefined) price = sale
  else if (loyaltyPrice !== undefined) price = loyaltyPrice
  if (typeof body.couponDiscountPercent === "number") price = price * (1 - body.couponDiscountPercent)
  if (typeof body.couponFixedAmount === "number") price = price - body.couponFixedAmount
  price = Math.max(0, Math.round(price * 100) / 100)
  const rules: string[] = []
  if (body.couponDiscountPercent || body.couponFixedAmount) rules.push("COUPON")
  return new Response(JSON.stringify({
    ok: true,
    tenantId: TENANT,
    calculated: { finalPrice: price, appliedRules: rules, rejected: [] },
  }))
}) as any

const promotion = (application_method: any) => ({
  id: "promo_1",
  code: "MONTELOPE",
  status: "active",
  is_automatic: false,
  is_tax_inclusive: true,
  type: "standard",
  rules: [],
  limit: null,
  used: 0,
  campaign: null,
  application_method,
})

beforeEach(() => {
  process.env.NEXUS_PRICING_URL = "https://nexus.test/api/nexus/pricing"
  process.env.NEXUS_PRICING_API_KEY = "synthetic-service-key"
  process.env.NEXUS_TENANT_ID = TENANT
})

describe('Kupóny a výpredajová cena v košíku (serverovo)', () => {
  it('Montelope: -20 € fixne len na EP.002, ostatné položky bez zľavy', async () => {
    const calls: any[] = []
    global.fetch = workerFetch(calls)
    const result = await repriceCart('cart_synthetic', scope(promotion({
      type: 'fixed', target_type: 'items', allocation: 'across', value: 20, currency_code: 'eur',
      target_rules: [{ attribute: 'items.product.id', operator: 'in', values: [RESET.id] }],
    })), false, 'MONTELOPE')
    const reset = result.items.find((item) => item.id === 'line_reset')!
    const other = result.items.find((item) => item.id === 'line_other')!
    expect(reset.unit_price).toBe(148)
    expect(other.unit_price).toBe(50)
    // druhá položka nedostane žiadnu pevnú zľavu
    expect(calls.find((call) => call.sku === 'EP.OTHER').couponFixedAmount).toBeUndefined()
    expect(calls.find((call) => call.sku === 'EP.002').couponFixedAmount).toBe(20)
  })

  it('kupón z administrácie (percentá, celý košík) zľavuje všetky položky', async () => {
    const calls: any[] = []
    global.fetch = workerFetch(calls)
    const result = await repriceCart('cart_synthetic', scope(promotion({
      type: 'percentage', target_type: 'order', value: 10, target_rules: [],
    })), false, 'MONTELOPE')
    const reset = result.items.find((item) => item.id === 'line_reset')!
    const other = result.items.find((item) => item.id === 'line_other')!
    expect(reset.unit_price).toBe(151.2)
    expect(other.unit_price).toBe(45)
    expect(calls.every((call) => call.couponDiscountPercent === 0.1)).toBe(true)
  })

  it('pevná zľava bez obmedzenia sa rozdelí medzi položky', async () => {
    const calls: any[] = []
    global.fetch = workerFetch(calls)
    const result = await repriceCart('cart_synthetic', scope(promotion({
      type: 'fixed', target_type: 'order', allocation: 'across', value: 20, currency_code: 'eur', target_rules: [],
    })), false, 'MONTELOPE')
    const total = result.items.reduce((sum, item) => sum + item.unit_price, 0)
    expect(total).toBeCloseTo(218 - 20, 2)
  })

  it('pevná zľava nikdy nezníži cenu pod 0', async () => {
    const calls: any[] = []
    global.fetch = workerFetch(calls)
    variants.var_other.calculated_price = { calculated_amount: 5, original_amount: 5, currency_code: 'eur' }
    const result = await repriceCart('cart_synthetic', scope(promotion({
      type: 'fixed', target_type: 'items', allocation: 'across', value: 20, currency_code: 'eur',
      target_rules: [{ attribute: 'items.product.id', operator: 'in', values: [OTHER.id] }],
    })), false, 'MONTELOPE')
    const other = result.items.find((item) => item.id === 'line_other')!
    expect(other.unit_price).toBe(0)
    variants.var_other.calculated_price = { calculated_amount: 50, original_amount: 50, currency_code: 'eur' }
  })

  it('výpredajová cena z metadát sa použije a kupón sa počíta z nej', async () => {
    const calls: any[] = []
    global.fetch = workerFetch(calls)
    variants.var_reset.product.metadata = { vyprodej: { active: true, akcna_cena: 100 } }
    const result = await repriceCart('cart_synthetic', scope(promotion({
      type: 'percentage', target_type: 'items', value: 10, target_rules: [],
    })), false, 'MONTELOPE')
    const reset = result.items.find((item) => item.id === 'line_reset')!
    expect(calls.find((call) => call.sku === 'EP.002').salePrice).toBe(100)
    expect(reset.unit_price).toBe(90)
    variants.var_reset.product.metadata = {}
  })

  it('vypnutá výpredajová cena sa neuplatní ani s cenovým zoznamom', async () => {
    const calls: any[] = []
    global.fetch = workerFetch(calls)
    variants.var_reset.calculated_price = { calculated_amount: 120, original_amount: 168, currency_code: 'eur' }
    variants.var_reset.product.metadata = { vyprodej: { active: false, akcna_cena: 100 } }
    const result = await repriceCart('cart_synthetic', scope(), false)
    expect(calls.find((call) => call.sku === 'EP.002').salePrice).toBeUndefined()
    expect(result.items.find((item) => item.id === 'line_reset')!.unit_price).toBe(168)
    variants.var_reset.calculated_price = { calculated_amount: 168, original_amount: 168, currency_code: 'eur' }
    variants.var_reset.product.metadata = {}
  })

  it('nepodporovaný kupón sa odmietne (zákazník dostane chybu, žiadna zľava)', async () => {
    const calls: any[] = []
    global.fetch = workerFetch(calls)
    await expect(repriceCart('cart_synthetic', scope(promotion({
      type: 'percentage', target_type: 'items', value: 10,
      target_rules: [{ attribute: 'items.variant_id', operator: 'in', values: ['var_reset'] }],
    })), false, 'MONTELOPE')).rejects.toThrow('COUPON_INVALID')
    expect(calls.every((call) => call.couponDiscountPercent === undefined)).toBe(true)
  })

  it('neplatný kód kupónu spôsobí chybu, nie tichú zľavu', async () => {
    global.fetch = workerFetch([])
    await expect(repriceCart('cart_synthetic', scope(), false, 'NEEXISTUJE')).rejects.toThrow('COUPON_INVALID')
  })

  it('cena zo stránky klienta sa nikdy nepoužije – počíta ju server', async () => {
    const calls: any[] = []
    global.fetch = workerFetch(calls)
    // Klient posílá kód kupónu a hotovo – žiadna cena, žiadne percentá.
    await repriceCart('cart_synthetic', scope(promotion({
      type: 'percentage', target_type: 'items', value: 10, target_rules: [],
    })), false, 'MONTELOPE')
    const call = calls[0]
    expect(call.basePrice).toBe(168)
    expect(call.couponDiscountPercent).toBe(0.1)
    expect(Object.keys(call)).not.toContain('unit_price')
    expect(Object.keys(call)).not.toContain('price')
  })
})

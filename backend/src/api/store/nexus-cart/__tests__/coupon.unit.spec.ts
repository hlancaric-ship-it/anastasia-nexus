// Propojení QR/kupón kódu s NEXUS pricing (12. 10. 2026, Krok 2 bod 6 z
// PROGRESS_LOG.md). Kupón se NIKDY nepočítá na klientovi -- `/store/nexus-cart`
// jen ověří kód přes Medusa Promotion modul a pošle procentuální sazbu
// (ne klientem dodanou slevu) do NEXUS Workeru, který ji zapojí do
// deterministického rule chainu (CouponDiscountRule, AŽ PO DiscountLimitRule).
//
// Server-side persistence na cart.metadata.nexus_coupon (ne v klientském
// requestu při každém volání) -- jinak by checkout reprice bez znovu
// poslaného kódu kupón ztratil a spadl na PRICE_CHANGED.

const runMock = jest.fn(async () => ({}))
jest.mock("@medusajs/medusa/core-flows", () => ({
  updateLineItemInCartWorkflow: jest.fn(() => ({ run: runMock })),
  refreshPaymentCollectionForCartWorkflow: jest.fn(() => ({ run: runMock })),
  updateCartWorkflow: jest.fn(() => ({ run: runMock })),
}))

import { repriceCart } from "../route"
import { updateCartWorkflow } from "@medusajs/medusa/core-flows"

describe("kupón v /store/nexus-cart", () => {
  const originalEnv = { ...process.env }
  const originalFetch = global.fetch

  function scopeWith(opts: { cartMetadata?: Record<string, unknown>; promotions?: any[]; reservations?: any[]; reservationFailure?: boolean }) {
    const graph = jest.fn(async ({ entity }: any) => ({
      data:
        entity === "cart"
          ? [{
              id: "cart_synthetic", currency_code: "eur", region_id: "region_synthetic",
              metadata: opts.cartMetadata ?? null,
              items: [{ id: "line_synthetic", variant_id: "variant_synthetic", quantity: 1, unit_price: 100 }],
            }]
          : [{ id: "variant_synthetic", sku: "SYNTHETIC", calculated_price: { calculated_amount: 100, original_amount: 100, currency_code: "eur" }, product: { metadata: {} } }],
    }))
    const listPromotions = jest.fn(async () => opts.promotions ?? [])
    return { resolve: (key: string) => (key === "query" ? { graph } : key === "promotion" ? { listPromotions } : key === "coupon_link" ? { listCouponUsageReservations: async()=>{if(opts.reservationFailure)throw Error("unavailable");return opts.reservations||[]} } : undefined) } as any
  }

  const activePercentagePromotion = {
    id: "promo_1", code: "SLEVA10", status: "active", is_automatic: false, limit: null, used: 0, campaign_id: null,
    type: "standard", rules: [],
    application_method: { type: "percentage", value: 10, target_type: "items", target_rules: [], buy_rules: [] },
  }

  beforeEach(() => {
    process.env.NEXUS_PRICING_URL = "https://nexus.test/api/nexus/pricing"
    process.env.NEXUS_PRICING_API_KEY = "synthetic-service-key"
    process.env.NEXUS_TENANT_ID = "anastasia"
    jest.clearAllMocks()
  })
  afterEach(() => { process.env = { ...originalEnv }; global.fetch = originalFetch })

  it("platný kód: pošle couponDiscountPercent do NEXUS a uloží kupón na cart.metadata", async () => {
    let sentBody: any
    global.fetch = jest.fn(async (_url, options: any) => {
      sentBody = JSON.parse(options.body)
      return new Response(JSON.stringify({ ok: true, tenantId: "anastasia", calculated: { finalPrice: 90, appliedRules: ["COUPON"], rejected: [] } }))
    }) as any

    const scope = scopeWith({ promotions: [activePercentagePromotion] })
    const result = await repriceCart("cart_synthetic", scope, true, "SLEVA10")

    expect(sentBody.couponDiscountPercent).toBeCloseTo(0.1)
    expect(result.items[0].unit_price).toBe(90)
    expect(result.coupon).toEqual({ code: "SLEVA10" })
    expect(updateCartWorkflow).toHaveBeenCalled()
  })

  it.each([
    { rules: [{ attribute: "customer_id" }] },
    { application_method: { ...activePercentagePromotion.application_method, target_rules: [{ attribute: "product_id" }] } },
    { application_method: { ...activePercentagePromotion.application_method, buy_rules: [{ attribute: "quantity" }] } },
    { application_method: { ...activePercentagePromotion.application_method, target_type: "shipping_methods" } },
    { application_method: { ...activePercentagePromotion.application_method, max_quantity: 1 } },
  ])("rejects unsupported native restrictions instead of silently discounting every item", async restriction => {
    global.fetch = jest.fn()
    const scope = scopeWith({ promotions: [{ ...activePercentagePromotion, ...restriction }] })
    await expect(repriceCart("cart_synthetic", scope, false, "SLEVA10")).rejects.toThrow("COUPON_INVALID")
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it("neznámý/neplatný kód vyhodí COUPON_INVALID, žádný reprice se neprovede", async () => {
    global.fetch = jest.fn()
    const scope = scopeWith({ promotions: [] })
    await expect(repriceCart("cart_synthetic", scope, false, "NEEXISTUJE")).rejects.toThrow("COUPON_INVALID")
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it("fixed-amount kupón se (zatím) ignoruje jako neplatný -- tahle verze umí jen percentage", async () => {
    const fixed = { ...activePercentagePromotion, application_method: { type: "fixed", value: 5 } }
    const scope = scopeWith({ promotions: [fixed] })
    await expect(repriceCart("cart_synthetic", scope, false, "SLEVA10")).rejects.toThrow("COUPON_INVALID")
  })

  it("couponCode: null odstraní dřív uložený kupón a přepočítá bez něj", async () => {
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ ok: true, tenantId: "anastasia", calculated: { finalPrice: 100, appliedRules: [], rejected: [] } }))) as any
    const scope = scopeWith({ cartMetadata: { nexus_coupon: { code: "stary", promotion_id: "promo_old", type: "percentage", value: 10 } } })
    const result = await repriceCart("cart_synthetic", scope, true, null)
    expect(result.coupon).toBeNull()
    expect(updateCartWorkflow).toHaveBeenCalled()
    expect(runMock).toHaveBeenCalledWith(expect.objectContaining({input:expect.objectContaining({metadata:expect.objectContaining({nexus_coupon:null})})}))
  })

  it("beze změny (undefined) dřív uložený kupón znovu ověří a použije", async () => {
    let sentBody: any
    global.fetch = jest.fn(async (_url, options: any) => {
      sentBody = JSON.parse(options.body)
      return new Response(JSON.stringify({ ok: true, tenantId: "anastasia", calculated: { finalPrice: 90, appliedRules: ["COUPON"], rejected: [] } }))
    }) as any
    const scope = scopeWith({
      cartMetadata: { nexus_coupon: { code: "SLEVA10", promotion_id: "promo_1", type: "percentage", value: 10 } },
      promotions: [activePercentagePromotion],
    })
    const result = await repriceCart("cart_synthetic", scope, false, undefined)
    expect(sentBody.couponDiscountPercent).toBeCloseTo(0.1)
    expect(result.coupon).toEqual({ code: "SLEVA10" })
  })

  it("neaktivní starý kupón se při zápisu odebere", async () => {
    let sentBody: any
    global.fetch = jest.fn(async (_url, options: any) => {
      sentBody = JSON.parse(options.body)
      return new Response(JSON.stringify({ ok: true, tenantId: "anastasia", calculated: { finalPrice: 100, appliedRules: [], rejected: [] } }))
    }) as any
    const exhausted = { ...activePercentagePromotion, status: "inactive" }
    const scope = scopeWith({
      cartMetadata: { nexus_coupon: { code: "SLEVA10", promotion_id: "promo_1", type: "percentage", value: 10 } },
      promotions: [exhausted],
    })
    const result = await repriceCart("cart_synthetic", scope, true, undefined)
    expect(sentBody.couponDiscountPercent).toBeUndefined()
    expect(result.coupon).toBeNull()
    expect(updateCartWorkflow).toHaveBeenCalled() // vyčištění zastaralého metadata
  })

  it("bez jakéhokoli kupónu (žádný parametr, žádné uložené metadata) nic nemění", async () => {
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ ok: true, tenantId: "anastasia", calculated: { finalPrice: 100, appliedRules: [], rejected: [] } }))) as any
    const scope = scopeWith({})
    const result = await repriceCart("cart_synthetic", scope, false, undefined)
    expect(result.coupon).toBeNull()
    expect(updateCartWorkflow).not.toHaveBeenCalled()
  })
  it("vyčerpaný kupón odmítne před změnou ceny či metadat",async()=>{
    global.fetch=jest.fn()
    const scope=scopeWith({cartMetadata:{nexus_coupon:{code:"SLEVA10",promotion_id:"promo_1",type:"percentage",value:10}},promotions:[{...activePercentagePromotion,limit:1,used:1}]})
    await expect(repriceCart("cart_synthetic",scope,true)).rejects.toThrow("COUPON_LIMIT_EXHAUSTED")
    expect(global.fetch).not.toHaveBeenCalled();expect(runMock).not.toHaveBeenCalled()
  })
  it.each(["reserved","confirmed"])("vlastní %s rezervace dovolí opakování",async status=>{
    global.fetch=jest.fn(async()=>new Response(JSON.stringify({ok:true,tenantId:"anastasia",calculated:{finalPrice:90,appliedRules:["COUPON"],rejected:[]}}))) as any
    const scope=scopeWith({cartMetadata:{nexus_coupon:{code:"SLEVA10",promotion_id:"promo_1",type:"percentage",value:10}},promotions:[{...activePercentagePromotion,limit:1,used:1}],reservations:[{promotion_id:"promo_1",coupon_code:"SLEVA10",status}]})
    expect((await repriceCart("cart_synthetic",scope,false)).coupon).toEqual({code:"SLEVA10"});expect(runMock).not.toHaveBeenCalled()
  })
  it("nedostupný ledger odmítne přepočet uzavřeně",async()=>{
    const scope=scopeWith({promotions:[{...activePercentagePromotion,limit:1,used:1}],reservationFailure:true})
    await expect(repriceCart("cart_synthetic",scope,false,"SLEVA10")).rejects.toThrow("COUPON_USAGE_RESERVATION_UNAVAILABLE")
  })
  it.each([null,"SLEVA10",undefined])("read-only přepočet nezapisuje ani pro změnu %s",async code=>{
    global.fetch=jest.fn(async()=>new Response(JSON.stringify({ok:true,tenantId:"anastasia",calculated:{finalPrice:90,appliedRules:["COUPON"],rejected:[]}}))) as any
    await repriceCart("cart_synthetic",scopeWith({cartMetadata:{nexus_coupon:{code:"SLEVA10",promotion_id:"promo_1",type:"percentage",value:999}},promotions:[activePercentagePromotion]}),false,code)
    expect(runMock).not.toHaveBeenCalled()
  })

})

import { repriceCart } from "../route"
import { readLoyaltySettings } from "../../../../lib/loyalty/settings"
import { workerLoyaltyTiers } from "../../../../lib/loyalty/policy"

/**
 * Košík počíta zľavu podľa politiky v DATABÁZE.
 *
 * Backend posiela Workeru iba kód úrovne (`ZR3`) – nie percentá. Percentá
 * prejdú z DB politiky do Workera podepsaným webhookom a tam sa použijú.
 * Tento test simuluje Workera právě mapou z DB politiky.
 */
describe("zľava podľa DB politiky vernostnej úrovne", () => {
  const originalEnv = { ...process.env }
  const originalFetch = global.fetch

  const policy = {
    tiers: [
      { code: "ZR1", name: "Bronze", discount_percent: 2, spend_threshold_eur: 0, enabled: true, rank: 1 },
      { code: "ZR3", name: "Gold", discount_percent: 10, spend_threshold_eur: 500, enabled: true, rank: 2 },
    ],
    updated_at: null,
    updated_by: null,
  }

  const scope = (groups: Array<{ name: string; metadata: Record<string, unknown> }>) => ({
    resolve: () => ({
      graph: jest.fn(async ({ entity }: any) => ({
        data: entity === "cart" ? [{
          id: "cart_synthetic", currency_code: "eur", region_id: "region_synthetic", customer_id: "cus_synthetic",
          customer: { id: "cus_synthetic", metadata: {}, groups },
          items: [{ id: "line_synthetic", variant_id: "variant_synthetic", quantity: 1, unit_price: 100 }],
        }] : [{
          id: "variant_synthetic", sku: "SYNTHETIC", calculated_price: { calculated_amount: 100, original_amount: 100, currency_code: "eur" },
          product: { metadata: {} },
        }],
      })),
    }),
  }) as any

  beforeEach(() => {
    process.env.NEXUS_PRICING_URL = "https://nexus.test/api/nexus/pricing"
    process.env.NEXUS_PRICING_API_KEY = "synthetic-service-key"
    process.env.NEXUS_TENANT_ID = "anastasia"
  })
  afterEach(() => { process.env = { ...originalEnv }; global.fetch = originalFetch })

  it("pošle Workeru kód úrovne a použije zľavu z DB politiky", async () => {
    const tiers = workerLoyaltyTiers(readLoyaltySettings({ loyalty_policy: policy }).tiers)
    expect(tiers).toEqual({ ZR1: 0.02, ZR3: 0.1 })

    let sent: any = null
    global.fetch = jest.fn(async (_url: string, options: any) => {
      sent = JSON.parse(options.body)
      const ratio = tiers[sent.customerTier] ?? 0
      const finalPrice = Number((sent.basePrice * (1 - ratio)).toFixed(2))
      return new Response(JSON.stringify({
        ok: true, tenantId: "anastasia",
        calculated: { finalPrice, appliedRules: ratio ? ["LOYALTY"] : [], rejected: [] },
      }))
    }) as any

    const result = await repriceCart("cart_synthetic", scope([{ name: "Gold", metadata: { nexus_tier: "ZR3", rank: 2 } }]), false)
    expect(sent.customerTier).toBe("ZR3")
    expect(sent.basePrice).toBe(100)
    expect(result.items[0].unit_price).toBe(90)
  })

  it("zákazníčka bez úrovne nezľavuje", async () => {
    let sent: any = null
    global.fetch = jest.fn(async (_url: string, options: any) => {
      sent = JSON.parse(options.body)
      return new Response(JSON.stringify({
        ok: true, tenantId: "anastasia",
        calculated: { finalPrice: sent.basePrice, appliedRules: [], rejected: [] },
      }))
    }) as any
    const result = await repriceCart("cart_synthetic", scope([{ name: "Newsletter", metadata: {} }]), false)
    expect(sent.customerTier).toBeUndefined()
    expect(result.items[0].unit_price).toBe(100)
  })
})

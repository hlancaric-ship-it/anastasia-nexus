import { repriceCart } from "../route"

describe("pricing service transport boundary", () => {
  const originalEnv = { ...process.env }
  const originalFetch = global.fetch
  const scope = () => ({ resolve: () => ({ graph: jest.fn(async ({ entity }: any) => ({ data: entity === "cart" ? [{
    id: "cart_synthetic", currency_code: "eur", region_id: "region_synthetic",
    items: [{ id: "line_synthetic", variant_id: "variant_synthetic", quantity: 1, unit_price: 50 }],
  }] : [{ id: "variant_synthetic", sku: "SYNTHETIC", calculated_price: { calculated_amount: 50, original_amount: 50, currency_code: "eur" }, product: { metadata: {} } }] })) }) }) as any
  const valid = { ok: true, tenantId: "anastasia", calculated: { finalPrice: 50, appliedRules: [], rejected: [] } }
  beforeEach(() => {
    process.env.NEXUS_PRICING_URL = "https://nexus.test/api/nexus/pricing"
    process.env.NEXUS_PRICING_API_KEY = "synthetic-service-key"
    process.env.NEXUS_TENANT_ID = "anastasia"
  })
  afterEach(() => { process.env = { ...originalEnv }; global.fetch = originalFetch })

  it.each(["http://remote.test/pricing", "https://user:password@nexus.test/pricing", "file:///pricing", "invalid-url"])("refuses unsafe credential destination %s before any request", async (url) => {
    process.env.NEXUS_PRICING_URL = url
    global.fetch = jest.fn()
    await expect(repriceCart("cart_synthetic", scope(), false)).rejects.toThrow("NEXUS_PRICING_NOT_CONFIGURED")
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it("refuses an HTTP redirect instead of repricing from a second destination", async () => {
    global.fetch = jest.fn(async (_url, options) => {
      expect(options?.redirect).toBe("error")
      expect(options?.signal).toBeInstanceOf(AbortSignal)
      throw new TypeError("fetch failed: redirect")
    }) as any
    await expect(repriceCart("cart_synthetic", scope(), false)).rejects.toThrow("NEXUS_PRICING_UNAVAILABLE")
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it.each([null, {}, { ...valid, ok: 1 }, { ...valid, tenantId: "other" }, { ...valid, calculated: { ...valid.calculated, finalPrice: -1 } }, { ...valid, calculated: { ...valid.calculated, appliedRules: ["rule", {}] } }])("rejects malformed or tenant-mismatched response %#", async (body) => {
    global.fetch = jest.fn(async () => new Response(JSON.stringify(body))) as any
    await expect(repriceCart("cart_synthetic", scope(), false)).rejects.toThrow("INVALID_NEXUS_PRICE_RESPONSE")
  })

  it("replaces JSON parser details with a fixed error code", async () => {
    global.fetch = jest.fn(async () => new Response("synthetic-private@example.test")) as any
    await expect(repriceCart("cart_synthetic", scope(), false)).rejects.toThrow(/^INVALID_NEXUS_PRICE_RESPONSE$/)
  })

  it.each(["https://nexus.test/pricing", "http://127.0.0.1:8787/pricing"])("preserves verified server prices over allowed transport %s", async (url) => {
    process.env.NEXUS_PRICING_URL = url
    global.fetch = jest.fn(async () => new Response(JSON.stringify(valid))) as any
    const result = await repriceCart("cart_synthetic", scope(), false)
    expect(result.pricesChanged).toBe(false)
    expect(result.items[0].unit_price).toBe(50)
    expect(result.tenantId).toBe("anastasia")
  })
})

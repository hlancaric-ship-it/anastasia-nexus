var mockValidate: any
jest.mock("@medusajs/medusa/core-flows", () => ({
  addToCartWorkflow: { hooks: { setPricingContext: jest.fn() } },
  completeCartWorkflow: { hooks: { validate: jest.fn((handler) => { mockValidate = handler }) } },
}))
jest.mock("../../api/store/nexus-cart/route", () => ({ repriceCart: jest.fn() }))
import { repriceCart } from "../../api/store/nexus-cart/route"
import { SafeOrderError } from "../../api/store/nexus-checkout/safeorder"
import "../hooks"

const item = { id: "line_synthetic", quantity: 1, unit_price: 50 }
const snapshot = () => ({ id: "cart_synthetic", email: "synthetic@example.test", currency_code: "eur", total: 55, items: [item], payment_collection: { amount: 55, currency_code: "eur", payment_sessions: [{ amount: 55, currency_code: "eur", provider_id: "pp_stripe_stripe", status: "pending" }] } })
const run = (cart = snapshot()) => mockValidate({ input: { id: cart.id }, cart }, { container: {} })

describe("SafeOrder guard on every completeCartWorkflow path", () => {
  const originalEnv = { ...process.env }
  const originalFetch = global.fetch
  beforeEach(() => {
    process.env.NEXUS_SAFEORDER_URL = "https://nexus.internal/api/nexus/safeorder"
    process.env.NEXUS_PRICING_API_KEY = "synthetic-key"
    process.env.NEXUS_TENANT_ID = "anastasia"
    ;(repriceCart as jest.Mock).mockResolvedValue({ pricesChanged: false, items: [item] })
  })
  afterEach(() => { process.env = { ...originalEnv }; global.fetch = originalFetch; jest.clearAllMocks() })
  it("evaluates the locked total including shipping, not a client price or a later cart query", async () => {
    global.fetch = jest.fn(async (_url, options) => {
      const body = JSON.parse(options!.body as string)
      expect(body).toEqual({ tenantId: "anastasia", currency: "eur", orderSum: 55, customerEmail: "synthetic@example.test", paymentMethod: "pp_stripe_stripe" })
      return new Response(JSON.stringify({ ...body, ok: true, decision: "ALLOW", score: 0, factors: [] }))
    }) as any
    await expect(run()).resolves.toBeUndefined()
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })
  it.each([401, 403, 500, 503])("HTTP %s prevents completion", async (status) => {
    global.fetch = jest.fn(async () => new Response('{}', { status })) as any
    await expect(run()).rejects.toMatchObject({ code: "SAFEORDER_UNAVAILABLE" })
  })
  it.each(["BLOCK", "REVIEW", "UNKNOWN"])("decision %s prevents completion", async (decision) => {
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ ok: true, tenantId: "anastasia", currency: "eur", orderSum: 55, score: decision === "BLOCK" ? 90 : 50, decision, factors: [] }))) as any
    await expect(run()).rejects.toBeInstanceOf(SafeOrderError)
  })
  it("missing credentials and unavailable Worker prevent completion", async () => {
    delete process.env.NEXUS_PRICING_API_KEY
    await expect(run()).rejects.toMatchObject({ code: "SAFEORDER_NOT_CONFIGURED" })
    process.env.NEXUS_PRICING_API_KEY = "synthetic-key"
    global.fetch = jest.fn(async () => { throw new Error('network') })
    await expect(run()).rejects.toMatchObject({ code: "SAFEORDER_UNAVAILABLE" })
  })
  it("a changed locked line fails even when the later queried cart price matches NEXUS", async () => {
    const cart = snapshot(); cart.items = [{ ...item, unit_price: 1 }]
    await expect(run(cart)).rejects.toThrow("NEXUS_PRICE_MISMATCH")
  })
  it("all processable sessions must pass, so the first session cannot mask COD", async () => {
    const cart = snapshot(); cart.payment_collection.payment_sessions.push({ ...cart.payment_collection.payment_sessions[0], provider_id: "cod" })
    global.fetch = jest.fn(async (_url, options) => {
      const body = JSON.parse(options!.body as string)
      return new Response(JSON.stringify({ ...body, ok: true, decision: body.paymentMethod === "cod" ? "REVIEW" : "ALLOW", score: body.paymentMethod === "cod" ? 50 : 0, factors: [] }))
    }) as any
    await expect(run(cart)).rejects.toMatchObject({ code: "SAFEORDER_REVIEW_REQUIRED" })
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })
})

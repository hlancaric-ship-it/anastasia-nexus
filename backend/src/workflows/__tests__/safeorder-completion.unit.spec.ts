jest.mock("../../lib/membership/checkout-guard",()=>({assertMembershipCheckoutCart:jest.fn(async()=>{})}))
jest.mock("../../lib/legal/checkout", () => ({ assertCartConsent: jest.fn(async () => {}) }))
var mockValidate: any
var mockCompensate: any
jest.mock("@medusajs/medusa/core-flows", () => ({
  addToCartWorkflow: { hooks: { setPricingContext: jest.fn() } },
  completeCartWorkflow: { hooks: { validate: jest.fn((handler, compensate) => { mockValidate = handler; mockCompensate = compensate }) } },
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
  it("COD session without physical goods and the COD courier never reaches SafeOrder", async () => {
    const cart = snapshot(); cart.payment_collection.payment_sessions[0].provider_id = "pp_cod_cod"
    global.fetch = jest.fn() as any
    await expect(run(cart)).rejects.toThrow("COD_NOT_AVAILABLE")
    expect(global.fetch).not.toHaveBeenCalled()
  })
  it("a refunded/canceled (compensated) card payment cannot complete the order", async () => {
    const cart: any = snapshot(); cart.metadata = { compensated_payment_intents: ["pi_123"] }; cart.payment_collection.payment_sessions[0].data = { id: "pi_123" }
    global.fetch = jest.fn() as any
    await expect(run(cart)).rejects.toThrow("PAYMENT_COMPENSATED")
    expect(global.fetch).not.toHaveBeenCalled()
  })
})


describe("C3 coupon usage after SafeOrder", () => {
  const originalEnv = { ...process.env }
  const originalFetch = global.fetch
  const registerUsage = jest.fn()
  const revertUsage = jest.fn()
  const container = { resolve: jest.fn(() => ({ registerUsage, revertUsage })) }
  const cart = () => ({ ...snapshot(), metadata: { nexus_coupon: { code: "SYNTHETIC-ONCE" } } })
  const validate = (value: any = cart()) => mockValidate({ input: { id: value.id }, cart: value }, { container })
  beforeEach(() => {
    jest.resetAllMocks()
    container.resolve.mockReturnValue({ registerUsage, revertUsage })
    registerUsage.mockResolvedValue(undefined)
    process.env.NEXUS_SAFEORDER_URL = "https://nexus.internal/api/nexus/safeorder"
    process.env.NEXUS_PRICING_API_KEY = "synthetic-key"
    process.env.NEXUS_TENANT_ID = "anastasia"
    ;(repriceCart as jest.Mock).mockResolvedValue({ pricesChanged: false, items: [item] })
    global.fetch = jest.fn(async (_url, options) => new Response(JSON.stringify({ ...JSON.parse(options!.body as string), ok: true, decision: "ALLOW", score: 0, factors: [] }))) as any
  })
  afterEach(() => { process.env = { ...originalEnv }; global.fetch = originalFetch })
  it("registers one action after ALLOW and compensates only a successful registration", async () => {
    const response = await validate()
    expect(registerUsage).toHaveBeenCalledWith([{ code: "SYNTHETIC-ONCE", amount: 1 }], { customer_id: null, customer_email: "synthetic@example.test" })
    expect(container.resolve).toHaveBeenCalledWith("promotion")
    await mockCompensate(response.compensateInput, { container })
    expect(revertUsage).toHaveBeenCalledWith(...registerUsage.mock.calls[0])
  })
  it("releases a claimed booking when coupon registration rejects inside validate", async () => {
    const claim = { id: "b1", cart_id: "cart_synthetic", held_until: new Date() }
    const releaseCheckoutClaim = jest.fn()
    container.resolve.mockImplementation(((key: string) => key === "query"
      ? { graph: async () => ({ data: [{ id: "p1", metadata: { booking: {} } }] }) }
      : key === "booking" ? { claimForCheckout: async () => claim, releaseCheckoutClaim }
      : { registerUsage, revertUsage }) as any)
    registerUsage.mockRejectedValue(new Error("coupon exhausted"))
    await expect(validate({ ...cart(), customer_id: "c1", metadata: { ...cart().metadata, booking_id: "b1" }, items: [{ ...item, product_id: "p1" }] })).rejects.toThrow("coupon exhausted")
    expect(releaseCheckoutClaim).toHaveBeenCalledWith(claim)
    expect(revertUsage).not.toHaveBeenCalled()
  })
  it.each(["BLOCK", "REVIEW"])("never consumes for %s", async decision => {
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ ok: true, tenantId: "anastasia", currency: "eur", orderSum: 55, decision, score: decision === "BLOCK" ? 90 : 50, factors: [] }))) as any
    await expect(validate()).rejects.toBeInstanceOf(SafeOrderError)
    expect(registerUsage).not.toHaveBeenCalled()
  })
  it("does not consume if a later payment provider rejects", async () => {
    const value = cart()
    value.payment_collection.payment_sessions.push({ ...value.payment_collection.payment_sessions[0], provider_id: "cod" })
    global.fetch = jest.fn(async (_url, options) => {
      const body = JSON.parse(options!.body as string)
      return new Response(JSON.stringify({ ...body, ok: true, decision: body.paymentMethod === "cod" ? "REVIEW" : "ALLOW", score: body.paymentMethod === "cod" ? 50 : 0, factors: [] }))
    }) as any
    await expect(validate(value)).rejects.toBeInstanceOf(SafeOrderError)
    expect(registerUsage).not.toHaveBeenCalled()
  })
  it("propagates the original registration failure", async () => {
    const error = new Error("Promotion usage exceeds the limit.")
    registerUsage.mockRejectedValue(error)
    await expect(validate()).rejects.toBe(error)
    await mockCompensate(undefined, { container })
    expect(revertUsage).not.toHaveBeenCalled()
  })
  it("skips carts without coupons and already completed carts", async () => {
    await validate(snapshot())
    await validate({ ...cart(), completed_at: new Date() })
    expect(registerUsage).not.toHaveBeenCalled()
  })
})

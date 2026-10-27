jest.mock("../../lib/membership/checkout-guard",()=>({assertMembershipCheckoutCart:jest.fn(async()=>{})}))
jest.mock("../../lib/legal/checkout", () => ({ assertCartConsent: jest.fn(async () => {}) }))
jest.mock("../gift-voucher-checkout", () => ({ prepareGiftVoucherCheckout: jest.fn(async () => null) }))
var mockValidate: any
var mockCompensate: any
jest.mock("@medusajs/medusa/core-flows", () => ({
  addToCartWorkflow: { hooks: { setPricingContext: jest.fn() } },
  completeCartWorkflow: { hooks: { validate: jest.fn((handler, compensate) => { mockValidate = handler; mockCompensate = compensate }) } },
}))
jest.mock("../../api/store/nexus-cart/route", () => ({ repriceCart: jest.fn() }))
jest.mock("../../lib/pricing/coupon-usage", () => ({ promotionIdForCode: jest.fn(async () => "promo_1") }))
jest.mock("../../modules/coupon-link", () => ({ COUPON_LINK_MODULE: "coupon_link" }))
import { repriceCart } from "../../api/store/nexus-cart/route"
import { promotionIdForCode } from "../../lib/pricing/coupon-usage"
import { prepareGiftVoucherCheckout } from "../gift-voucher-checkout"
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


describe("coupon usage reservation after SafeOrder", () => {
  const originalEnv = { ...process.env }
  const originalFetch = global.fetch
  const reserveUsage = jest.fn()
  const releaseReservation = jest.fn()
  const couponService = { reserveUsage, releaseReservation }
  const giftVoucherService = { redeem: jest.fn(), reverseRedemption: jest.fn() }
  const container = { resolve: jest.fn((key?: string) => key === "coupon_link" ? couponService : giftVoucherService) }
  const cart = () => ({ ...snapshot(), metadata: { nexus_coupon: { code: "SYNTHETIC-ONCE", promotion_id: "promo_1" } } })
  const validate = (value: any = cart()) => mockValidate({ input: { id: value.id }, cart: value }, { container })
  beforeEach(() => {
    jest.resetAllMocks()
    container.resolve.mockImplementation((key?: string) => key === "coupon_link" ? couponService : giftVoucherService)
    reserveUsage.mockResolvedValue({ id: "reservation_1", status: "reserved" })
    releaseReservation.mockResolvedValue(undefined)
    giftVoucherService.redeem.mockResolvedValue({ transaction_id: "redemption_1" })
    ;(prepareGiftVoucherCheckout as jest.Mock).mockResolvedValue(null)
    ;(promotionIdForCode as jest.Mock).mockResolvedValue("promo_1")
    process.env.NEXUS_SAFEORDER_URL = "https://nexus.internal/api/nexus/safeorder"
    process.env.NEXUS_PRICING_API_KEY = "synthetic-key"
    process.env.NEXUS_TENANT_ID = "anastasia"
    ;(repriceCart as jest.Mock).mockResolvedValue({ pricesChanged: false, items: [item] })
    global.fetch = jest.fn(async (_url, options) => new Response(JSON.stringify({ ...JSON.parse(options!.body as string), ok: true, decision: "ALLOW", score: 0, factors: [] }))) as any
  })
  afterEach(() => { process.env = { ...originalEnv }; global.fetch = originalFetch })
  it("reserves a use by server-resolved coupon code", async () => {
    const response = await validate()
    expect(reserveUsage).toHaveBeenCalledWith({ promotion_id: "promo_1", coupon_code: "SYNTHETIC-ONCE", cart_id: "cart_synthetic" })
    expect(response).toBeTruthy()
  })
  it("fails closed when atomic reservation says the limit is exhausted", async () => {
    reserveUsage.mockRejectedValue(new Error("COUPON_LIMIT_EXHAUSTED"))
    await expect(validate()).rejects.toThrow("COUPON_LIMIT_EXHAUSTED")
  })
  it("neplatný kód kupónu zastaví checkout", async () => {
    await expect(validate({ ...cart(), metadata: { nexus_coupon: { code: "  " } } })).rejects.toThrow("COUPON_INVALID")
  })
  it("resolves the promotion from code, not a client-supplied promotion_id", async () => {
    await validate({ ...cart(), metadata: { nexus_coupon: { code: "SYNTHETIC-ONCE", promotion_id: "promo_spoofed" } } })
    expect(promotionIdForCode).toHaveBeenCalledWith(expect.anything(), "SYNTHETIC-ONCE")
    expect(reserveUsage).toHaveBeenCalledWith(expect.objectContaining({ promotion_id: "promo_1" }))
  })
  it("kód bez akcie zastaví checkout (fail closed)", async () => {
    ;(promotionIdForCode as jest.Mock).mockResolvedValue(null)
    await expect(validate()).rejects.toThrow("COUPON_INVALID")
    expect(reserveUsage).not.toHaveBeenCalled()
  })
  it("does not reserve a cart without a coupon", async () => {
    await validate(snapshot())
    expect(reserveUsage).not.toHaveBeenCalled()
  })
  it.each(["BLOCK", "REVIEW"])("never consumes for %s", async decision => {
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ ok: true, tenantId: "anastasia", currency: "eur", orderSum: 55, decision, score: decision === "BLOCK" ? 90 : 50, factors: [] }))) as any
    await expect(validate()).rejects.toBeInstanceOf(SafeOrderError)
    expect(reserveUsage).not.toHaveBeenCalled()
  })
  it("does not consume if a later payment provider rejects", async () => {
    const value = cart()
    value.payment_collection.payment_sessions.push({ ...value.payment_collection.payment_sessions[0], provider_id: "cod" })
    global.fetch = jest.fn(async (_url, options) => {
      const body = JSON.parse(options!.body as string)
      return new Response(JSON.stringify({ ...body, ok: true, decision: body.paymentMethod === "cod" ? "REVIEW" : "ALLOW", score: body.paymentMethod === "cod" ? 50 : 0, factors: [] }))
    }) as any
    await expect(validate(value)).rejects.toBeInstanceOf(SafeOrderError)
    expect(reserveUsage).not.toHaveBeenCalled()
  })
  it("allows only one of five competing carts at a one-use limit", async () => {
    const held = new Set<string>()
    let tail = Promise.resolve()
    reserveUsage.mockImplementation(async (input: { cart_id: string }) => {
      const previous = tail
      let unlock!: () => void
      tail = new Promise<void>((resolve) => { unlock = resolve })
      await previous
      try {
        if (held.size >= 1) throw new Error("COUPON_LIMIT_EXHAUSTED")
        held.add(input.cart_id)
        return { id: `reservation_${input.cart_id}`, status: "reserved" }
      } finally { unlock() }
    })
    const outcomes = await Promise.allSettled(Array.from({ length: 5 }, (_, index) => validate({ ...cart(), id: `cart_${index}` })))
    expect(outcomes.filter((entry) => entry.status === "fulfilled")).toHaveLength(1)
    expect(outcomes.filter((entry) => entry.status === "rejected")).toHaveLength(4)
    expect(held.size).toBe(1)
  })
  it("releases a reservation when a later checkout step fails", async () => {
    ;(prepareGiftVoucherCheckout as jest.Mock).mockResolvedValue({ redeem: { voucher_id: "voucher_synthetic" } })
    giftVoucherService.redeem.mockRejectedValue(new Error("VOUCHER_REDEEM_FAILED"))
    await expect(validate()).rejects.toThrow("VOUCHER_REDEEM_FAILED")
    expect(releaseReservation).toHaveBeenCalledWith({ cart_id: "cart_synthetic" })
  })
  it("skips carts without coupons and already completed carts", async () => {
    await validate(snapshot())
    await validate({ ...cart(), completed_at: new Date() })
    expect(reserveUsage).not.toHaveBeenCalled()
  })
})

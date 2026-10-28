jest.mock("../../../../lib/legal/checkout", () => ({ assertCartConsent: jest.fn(async () => {}), loadConsentCart: jest.fn(async () => ({id:"cart_test",customer_id:"cust_owner"})) }))
jest.mock("../../nexus-cart/route", () => ({ repriceCart: jest.fn() }))
jest.mock("../../../../lib/pricing/coupon-usage", () => ({ ...jest.requireActual("../../../../lib/pricing/coupon-usage"), assertCouponNotExhausted: jest.fn(async () => {}) }))
jest.mock("@medusajs/medusa/core-flows", () => ({ completeCartWorkflow: jest.fn() }))
jest.mock("../../../../lib/checkout/payment-compensation", () => ({ compensateUnfinishedCheckout: jest.fn(async () => ({ status: "refunded", payment_intents: [] })), stripeIntentsOfCart: jest.fn(async () => ["pi_paid"]) }))
import { compensateUnfinishedCheckout } from "../../../../lib/checkout/payment-compensation"

import { assertCartConsent, loadConsentCart } from "../../../../lib/legal/checkout"
import { completeCartWorkflow } from "@medusajs/medusa/core-flows"
import { repriceCart } from "../../nexus-cart/route"
import { LegalError } from "../../../../modules/legal/policy"
import { SafeOrderError } from "../safeorder"
import { POST } from "../route"
import { assertCouponNotExhausted } from "../../../../lib/pricing/coupon-usage"

const AUTH = { actor_type: "customer", actor_id: "cust_owner" }

const makeScope = () => {
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
  const events = { createOpsEvents: jest.fn().mockResolvedValue({ id: "oevt_1" }) }
  const scope = { resolve: (key: string) => (key === "ops_audit" ? events : logger) }
  return { logger, events, scope }
}

beforeEach(() => jest.clearAllMocks())

describe("checkout auth gate", () => {
  it.each([
    ["registrovaný účet", "cust_owner", true],
    ["bez zákazníka", null, null],
  ])("host (bez prihlásenia): %s", async (_label, customer_id, has_account) => {
    jest.mocked(loadConsentCart).mockResolvedValueOnce({ id: "cart_test", customer_id, customer: customer_id ? { has_account } : null })
    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() }
    await POST({ body: { cart_id: "cart_test" }, scope: makeScope().scope, auth_context: undefined } as any, res)
    if (customer_id) {
      expect(res.status).toHaveBeenCalledWith(403)
      expect(repriceCart).not.toHaveBeenCalled()
    } else {
      expect(res.status).not.toHaveBeenCalledWith(401)
      expect(assertCartConsent).toHaveBeenCalled()
    }
  })

  it.each(["cust_foreign", null])("rejects foreign and guest carts before consent or mutation (%s)", async (customer_id) => {
    jest.mocked(loadConsentCart).mockResolvedValueOnce({ id: "cart_test", customer_id })
    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() }
    await POST({ body: { cart_id: "cart_test" }, scope: makeScope().scope, auth_context: AUTH } as any, res)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(assertCartConsent).not.toHaveBeenCalled()
    expect(repriceCart).not.toHaveBeenCalled()
    expect(completeCartWorkflow).not.toHaveBeenCalled()
  })

  it("records a missing cart without exposing the legal module error payload", async () => {
    jest.mocked(loadConsentCart).mockRejectedValueOnce(new LegalError("CART_NOT_FOUND", 404))
    const { events, scope } = makeScope()
    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() }
    await POST({ body: { cart_id: "cart_missing" }, scope, auth_context: AUTH } as any, res)
    expect(res.status).toHaveBeenCalledWith(404)
    expect(events.createOpsEvents).toHaveBeenCalledWith(expect.objectContaining({ domain: "checkout", event: "failed", cart_id: "cart_missing" }))
    expect(repriceCart).not.toHaveBeenCalled()
  })

  it("předá actor_id jako vlastníka do repriceCart (5. argument)", async () => {
    jest.mocked(repriceCart).mockResolvedValue({ pricesChanged: true, tenantId: "anastasia", items: [] } as any)
    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() }
    await POST({ body: { cart_id: "synthetic-cart" }, scope: { resolve: () => ({ warn: jest.fn(), error: jest.fn() }) }, auth_context: AUTH } as any, res)
    expect(repriceCart).toHaveBeenCalledWith("synthetic-cart", expect.anything(), true, undefined, "cust_owner", false)
  })

  it("vrátí 403 na CART_ACCESS_DENIED z repriceCart a nespustí completeCartWorkflow", async () => {
    jest.mocked(repriceCart).mockRejectedValue(new Error("CART_ACCESS_DENIED"))
    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() }
    await POST({ body: { cart_id: "synthetic-cart" }, scope: { resolve: () => ({ warn: jest.fn(), error: jest.fn() }) }, auth_context: AUTH } as any, res)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: false, error: "CART_ACCESS_DENIED" }))
    expect(completeCartWorkflow).not.toHaveBeenCalled()
  })
})

describe("checkout workflow error transport", () => {
  it("vyčerpaný kupón odmietne pred dokončením košíka (bez zámku) a vráti platbu", async () => {
    jest.mocked(repriceCart).mockResolvedValue({ pricesChanged: false } as any)
    jest.mocked(assertCouponNotExhausted).mockRejectedValueOnce(new Error("COUPON_LIMIT_EXHAUSTED"))
    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() }
    await POST({ body: { cart_id: "synthetic-cart" }, scope: makeScope().scope, auth_context: AUTH } as any, res)
    expect(repriceCart).not.toHaveBeenCalled()
    expect(completeCartWorkflow).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(409)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: false, error: "COUPON_LIMIT_EXHAUSTED" }))
    expect(compensateUnfinishedCheckout).toHaveBeenCalled()
  })

  it.each([
    ["kupón medzitým došiel", true, "COUPON_LIMIT_EXHAUSTED"],
    ["košík dokončuje iná požiadavka", false, "CHECKOUT_IN_PROGRESS"],
  ])("chybu zámku košíka nevracia surovo: %s", async (_label, exhausted, code) => {
    jest.mocked(repriceCart).mockResolvedValue({ pricesChanged: false } as any)
    jest.mocked(completeCartWorkflow).mockReturnValue({ run: jest.fn().mockRejectedValue(new Error('Failed to acquire lock for key "cart_synthetic"')) } as any)
    jest.mocked(assertCouponNotExhausted).mockResolvedValueOnce(undefined)
    if (exhausted) jest.mocked(assertCouponNotExhausted).mockRejectedValueOnce(new Error("COUPON_LIMIT_EXHAUSTED"))
    const { scope, events } = makeScope()
    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() }
    await POST({ body: { cart_id: "synthetic-cart" }, scope, auth_context: AUTH } as any, res)
    expect(res.status).toHaveBeenCalledWith(409)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: false, error: code }))
    expect(JSON.stringify(res.json.mock.calls)).not.toContain("acquire lock")
    expect(events.createOpsEvents).toHaveBeenCalledWith(expect.objectContaining({ domain: "checkout", event: "cart_locked" }))
  })

  it.each(["COUPON_LIMIT_EXHAUSTED", "COUPON_USAGE_RESERVATION_UNAVAILABLE", "COUPON_USAGE_RESERVATION_CONFLICT"])("returns 409 for coupon reservation failure %s", async (code) => {
    jest.mocked(repriceCart).mockResolvedValue({ pricesChanged: false } as any)
    jest.mocked(completeCartWorkflow).mockReturnValue({ run: jest.fn().mockRejectedValue(new Error(code)) } as any)
    const { scope, events } = makeScope()
    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() }
    await POST({ body: { cart_id: "synthetic-cart" }, scope, auth_context: AUTH } as any, res)
    expect(res.status).toHaveBeenCalledWith(409)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: false, error: code }))
    expect(events.createOpsEvents).toHaveBeenCalledWith(expect.objectContaining({ level: "warn", domain: "coupon", event: "reservation_rejected" }))
  })

  it.each([
    ["SAFEORDER_UNAVAILABLE", 503],
    ["SAFEORDER_NOT_CONFIGURED", 503],
    ["SAFEORDER_REVIEW_REQUIRED", 409],
    ["SAFEORDER_BLOCKED", 403],
  ] as const)("preserves %s for native and serialized errors", async (code, status) => {
    for (const error of [new SafeOrderError(code), new Error(code), { message: code }]) {
      jest.mocked(repriceCart).mockResolvedValue({ pricesChanged: false } as any)
      jest.mocked(completeCartWorkflow).mockReturnValue({ run: jest.fn().mockRejectedValue(error) } as any)
      const { logger, events, scope } = makeScope()
      const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() }
      await POST({ body: { cart_id: "synthetic-cart" }, scope, auth_context: AUTH } as any, res)
      expect(res.status).toHaveBeenCalledWith(status)
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: false, error: code }))
      expect(JSON.parse(logger.warn.mock.calls[0][0])).toMatchObject({ domain: "safeorder", event: code.toLowerCase(), cart_id: "synthetic-cart" })
      expect(events.createOpsEvents).toHaveBeenCalledWith(expect.objectContaining({ level: "warn", domain: "safeorder", cart_id: "synthetic-cart" }))
      expect(logger.error).not.toHaveBeenCalled()
    }
  })

  it("does not match arbitrary error messages containing a SafeOrder code", async () => {
    jest.mocked(repriceCart).mockResolvedValue({ pricesChanged: false } as any)
    jest.mocked(completeCartWorkflow).mockReturnValue({ run: jest.fn().mockRejectedValue(new Error("prefix SAFEORDER_BLOCKED")) } as any)
    const { logger, scope } = makeScope()
    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() }
    await POST({ body: { cart_id: "synthetic-cart" }, scope, auth_context: AUTH } as any, res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(logger.warn).not.toHaveBeenCalled()
    const line = JSON.parse(logger.error.mock.calls[0][0])
    expect(line).toMatchObject({ domain: "checkout", event: "failed", error_code: "CHECKOUT_FAILED" })
  })
})

describe("checkout failure after card payment", () => {
  it("objednávka nevznikla (napr. chýba doprava) → platba sa vráti a klient to vie", async () => {
    jest.mocked(repriceCart).mockResolvedValue({ pricesChanged: false } as any)
    jest.mocked(completeCartWorkflow).mockReturnValue({ run: jest.fn().mockRejectedValue({ message: "The cart items require shipping profiles that are not satisfied by the current shipping methods" }) } as any)
    const { scope } = makeScope()
    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() }
    await POST({ body: { cart_id: "cart_test" }, scope, auth_context: AUTH } as any, res)
    expect(compensateUnfinishedCheckout).toHaveBeenCalledWith(scope, "cart_test", "CHECKOUT_FAILED", {}, ["pi_paid"])
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: false, payment_compensation: "refunded" }))
  })
  it("zmena ceny po zaplatení → platba sa vráti", async () => {
    jest.mocked(repriceCart).mockResolvedValue({ pricesChanged: true, tenantId: "anastasia", items: [] } as any)
    const { scope } = makeScope()
    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() }
    await POST({ body: { cart_id: "cart_test" }, scope, auth_context: AUTH } as any, res)
    expect(res.status).toHaveBeenCalledWith(409)
    expect(compensateUnfinishedCheckout).toHaveBeenCalledWith(scope, "cart_test", "PRICE_CHANGED", {}, ["pi_paid"])
  })
  it("cudzí košík nikdy nekompenzuje", async () => {
    jest.mocked(loadConsentCart).mockResolvedValueOnce({ id: "cart_test", customer_id: "cust_foreign" })
    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() }
    await POST({ body: { cart_id: "cart_test" }, scope: makeScope().scope, auth_context: AUTH } as any, res)
    expect(compensateUnfinishedCheckout).not.toHaveBeenCalled()
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ payment_compensation: "none" }))
  })
})

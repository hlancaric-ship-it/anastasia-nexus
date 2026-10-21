import { assertNoCompensatedSession, compensateUnfinishedCheckout, COMPENSATED_PI_KEY } from "../payment-compensation"

const KEY = "sk_test_synthetic"

function setup(opts: { completed?: boolean; completedAfterLock?: boolean; sessions?: any[]; piStatus?: string; stripeFail?: boolean } = {}) {
  let cart: any = {
    id: "cart_1", completed_at: opts.completed ? new Date() : null, metadata: { booking_id: "" },
    payment_collection: { payment_sessions: opts.sessions ?? [{ provider_id: "pp_stripe_stripe", data: { id: "pi_123" } }] },
  }
  let loads = 0
  const query = { graph: jest.fn(async () => { loads++; if (opts.completedAfterLock && loads > 1) cart = { ...cart, completed_at: new Date() }; return { data: [cart] } }) }
  const cartModule = { updateCarts: jest.fn(async (_id: string, data: any) => { cart = { ...cart, ...data } }) }
  const locking = { execute: jest.fn(async (key: string, fn: () => Promise<unknown>) => { expect(key).toBe("cart_1"); return fn() }) }
  const ops = { createOpsEvents: jest.fn(async (e: any) => ({ id: "ev", ...e })) }
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
  const map: Record<string, unknown> = { query, cart: cartModule, locking, ops_audit: ops, logger }
  const container: any = { resolve: (k: string) => map[k] }
  const calls: Array<{ url: string; method: string; body?: string; idem?: string }> = []
  const fetchImpl: any = jest.fn(async (url: string, init: any) => {
    calls.push({ url, method: init.method, body: init.body, idem: init.headers["idempotency-key"] })
    if (opts.stripeFail) return { ok: false, status: 500, json: async () => ({ error: { code: "api_error" } }) }
    if (init.method === "GET") return { ok: true, status: 200, json: async () => ({ id: "pi_123", status: opts.piStatus ?? "succeeded" }) }
    return { ok: true, status: 200, json: async () => ({ id: "re_1" }) }
  })
  return { container, calls, fetchImpl, cartModule, ops, get cart() { return cart } }
}

describe("kompenzácia platby, keď objednávka nevznikla", () => {
  it("stiahnutú platbu vráti (idempotentne) a session zablokuje pre ďalšie dokončenie", async () => {
    const t = setup()
    const result = await compensateUnfinishedCheckout(t.container, "cart_1", "SHIPPING_REQUIRED", { fetch: t.fetchImpl, apiKey: KEY })
    expect(result).toEqual({ status: "refunded", payment_intents: [{ id: "pi_123", action: "refunded" }] })
    const refund = t.calls.find((c) => c.url.endsWith("/refunds"))!
    expect(refund.body).toContain("payment_intent=pi_123")
    expect(refund.idem).toBe("checkout-compensation-refund:pi_123")
    expect(t.cart.metadata[COMPENSATED_PI_KEY]).toEqual(["pi_123"])
    expect(t.cart.metadata.booking_id).toBe("")
    expect(() => assertNoCompensatedSession(t.cart)).toThrow("PAYMENT_COMPENSATED")
  })
  it("autorizovanú platbu zruší", async () => {
    const t = setup({ piStatus: "requires_capture" })
    const result = await compensateUnfinishedCheckout(t.container, "cart_1", "SAFEORDER_REVIEW_REQUIRED", { fetch: t.fetchImpl, apiKey: KEY })
    expect(result.status).toBe("canceled")
    expect(t.calls.some((c) => c.url.endsWith("/payment_intents/pi_123/cancel"))).toBe(true)
  })
  it("nezaplatenú session nechá tak (nič na vrátenie)", async () => {
    const t = setup({ piStatus: "requires_payment_method" })
    expect((await compensateUnfinishedCheckout(t.container, "cart_1", "X_FAILED", { fetch: t.fetchImpl, apiKey: KEY })).status).toBe("none")
    expect(t.calls.filter((c) => c.method === "POST")).toHaveLength(0)
  })
  it.each([{ completed: true }, { completedAfterLock: true }])("dokončenú objednávku (aj súbežne cez webhook) nikdy nevracia %j", async (opts) => {
    const t = setup(opts)
    expect((await compensateUnfinishedCheckout(t.container, "cart_1", "X_FAILED", { fetch: t.fetchImpl, apiKey: KEY })).status).toBe("completed")
    expect(t.calls).toHaveLength(0)
    expect(t.cartModule.updateCarts).not.toHaveBeenCalled()
  })
  it("manuálne platby (dobierka, prevod) nekompenzuje – žiadne peniaze neodišli", async () => {
    const t = setup({ sessions: [{ provider_id: "pp_cod_cod", data: { method: "cod" } }] })
    expect((await compensateUnfinishedCheckout(t.container, "cart_1", "X_FAILED", { fetch: t.fetchImpl, apiKey: KEY })).status).toBe("none")
    expect(t.calls).toHaveLength(0)
  })
  it("zlyhanie Stripe = alert (error udalosť) a status failed", async () => {
    const t = setup({ stripeFail: true })
    expect((await compensateUnfinishedCheckout(t.container, "cart_1", "X_FAILED", { fetch: t.fetchImpl, apiKey: KEY })).status).toBe("failed")
    expect(t.ops.createOpsEvents).toHaveBeenCalledWith(expect.objectContaining({ level: "error", event: "payment_compensation_failed" }))
  })
})

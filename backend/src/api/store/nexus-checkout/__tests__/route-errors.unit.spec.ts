jest.mock("../../../../lib/legal/checkout", () => ({ assertCartConsent: jest.fn(async () => {}), loadConsentCart: jest.fn(async () => ({id:"cart_test",customer_id:"cust_owner"})) }))
jest.mock("../../nexus-cart/route", () => ({ repriceCart: jest.fn() }))
jest.mock("@medusajs/medusa/core-flows", () => ({ completeCartWorkflow: jest.fn() }))

import { assertCartConsent, loadConsentCart } from "../../../../lib/legal/checkout"
import { completeCartWorkflow } from "@medusajs/medusa/core-flows"
import { repriceCart } from "../../nexus-cart/route"
import { LegalError } from "../../../../modules/legal/policy"
import { SafeOrderError } from "../safeorder"
import { POST } from "../route"

const AUTH = { actor_type: "customer", actor_id: "cust_owner" }

const makeScope = () => {
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
  const events = { createOpsEvents: jest.fn().mockResolvedValue({ id: "oevt_1" }) }
  const scope = { resolve: (key: string) => (key === "ops_audit" ? events : logger) }
  return { logger, events, scope }
}

beforeEach(() => jest.clearAllMocks())

describe("checkout auth gate", () => {
  it("vrátí 401 bez přihlášené zákaznice a nezavolá reprice ani workflow", async () => {
    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() }
    await POST({ body: { cart_id: "synthetic-cart" }, scope: { resolve: jest.fn() }, auth_context: undefined } as any, res)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ ok: false, error: "UNAUTHORIZED" })
    expect(repriceCart).not.toHaveBeenCalled()
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
    expect(repriceCart).toHaveBeenCalledWith("synthetic-cart", expect.anything(), true, undefined, "cust_owner")
  })

  it("vrátí 403 na CART_ACCESS_DENIED z repriceCart a nespustí completeCartWorkflow", async () => {
    jest.mocked(repriceCart).mockRejectedValue(new Error("CART_ACCESS_DENIED"))
    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() }
    await POST({ body: { cart_id: "synthetic-cart" }, scope: { resolve: () => ({ warn: jest.fn(), error: jest.fn() }) }, auth_context: AUTH } as any, res)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).toHaveBeenCalledWith({ ok: false, error: "CART_ACCESS_DENIED" })
    expect(completeCartWorkflow).not.toHaveBeenCalled()
  })
})

describe("checkout workflow error transport", () => {
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
      expect(res.json).toHaveBeenCalledWith({ ok: false, error: code })
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

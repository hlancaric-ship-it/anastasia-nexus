jest.mock("../../nexus-cart/route", () => ({ repriceCart: jest.fn() }))
jest.mock("@medusajs/medusa/core-flows", () => ({ completeCartWorkflow: jest.fn() }))

import { completeCartWorkflow } from "@medusajs/medusa/core-flows"
import { repriceCart } from "../../nexus-cart/route"
import { SafeOrderError } from "../safeorder"
import { POST } from "../route"

const AUTH = { actor_type: "customer", actor_id: "cust_owner" }

beforeEach(() => jest.clearAllMocks())

describe("checkout auth gate", () => {
  it("vrátí 401 bez přihlášené zákaznice a nezavolá reprice ani workflow", async () => {
    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() }
    await POST({ body: { cart_id: "synthetic-cart" }, scope: { resolve: jest.fn() }, auth_context: undefined } as any, res)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ ok: false, error: "UNAUTHORIZED" })
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
      const logger = { warn: jest.fn(), error: jest.fn() }
      const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() }
      await POST({ body: { cart_id: "synthetic-cart" }, scope: { resolve: () => logger }, auth_context: AUTH } as any, res)
      expect(res.status).toHaveBeenCalledWith(status)
      expect(res.json).toHaveBeenCalledWith({ ok: false, error: code })
      expect(logger.warn).toHaveBeenCalledWith(`SafeOrder ${code}`)
      expect(logger.error).not.toHaveBeenCalled()
    }
  })

  it("does not match arbitrary error messages containing a SafeOrder code", async () => {
    jest.mocked(repriceCart).mockResolvedValue({ pricesChanged: false } as any)
    jest.mocked(completeCartWorkflow).mockReturnValue({ run: jest.fn().mockRejectedValue(new Error("prefix SAFEORDER_BLOCKED")) } as any)
    const logger = { warn: jest.fn(), error: jest.fn() }
    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() }
    await POST({ body: { cart_id: "synthetic-cart" }, scope: { resolve: () => logger }, auth_context: AUTH } as any, res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(logger.warn).not.toHaveBeenCalled()
  })
})

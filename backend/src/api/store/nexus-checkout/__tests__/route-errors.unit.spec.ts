jest.mock("../../nexus-cart/route", () => ({ repriceCart: jest.fn() }))
jest.mock("@medusajs/medusa/core-flows", () => ({ completeCartWorkflow: jest.fn() }))

import { completeCartWorkflow } from "@medusajs/medusa/core-flows"
import { repriceCart } from "../../nexus-cart/route"
import { SafeOrderError } from "../safeorder"
import { POST } from "../route"

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
      await POST({ body: { cart_id: "synthetic-cart" }, scope: { resolve: () => logger } } as any, res)
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
    await POST({ body: { cart_id: "synthetic-cart" }, scope: { resolve: () => logger } } as any, res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(logger.warn).not.toHaveBeenCalled()
  })
})

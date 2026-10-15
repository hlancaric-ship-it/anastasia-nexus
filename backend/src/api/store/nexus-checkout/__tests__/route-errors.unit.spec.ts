jest.mock("../../../../lib/legal/checkout", () => ({ assertCartConsent: jest.fn(async () => {}), loadConsentCart: jest.fn(async () => ({id:"cart_test"})) }))
jest.mock("../../nexus-cart/route", () => ({ repriceCart: jest.fn() }))
jest.mock("@medusajs/medusa/core-flows", () => ({ completeCartWorkflow: jest.fn() }))

import { completeCartWorkflow } from "@medusajs/medusa/core-flows"
import { repriceCart } from "../../nexus-cart/route"
import { SafeOrderError } from "../safeorder"
import { POST } from "../route"

const makeScope = () => {
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
  const events = { createOpsEvents: jest.fn().mockResolvedValue({ id: "oevt_1" }) }
  const scope = { resolve: (key: string) => (key === "ops_audit" ? events : logger) }
  return { logger, events, scope }
}

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
      await POST({ body: { cart_id: "synthetic-cart" }, scope } as any, res)
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
    await POST({ body: { cart_id: "synthetic-cart" }, scope } as any, res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(logger.warn).not.toHaveBeenCalled()
    const line = JSON.parse(logger.error.mock.calls[0][0])
    expect(line).toMatchObject({ domain: "checkout", event: "failed", error_code: "CHECKOUT_FAILED" })
  })
})

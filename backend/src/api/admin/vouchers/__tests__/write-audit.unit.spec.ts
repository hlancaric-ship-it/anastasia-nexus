jest.mock("../../../../lib/observability/audit", () => ({ auditAdminChange: jest.fn().mockResolvedValue("oaud_test") }))
jest.mock("../../../../modules/gift-voucher/product-sync", () => ({ syncGiftVoucherProduct: jest.fn().mockResolvedValue({ id: "prod_test" }) }))

import { auditAdminChange } from "../../../../lib/observability/audit"
import { syncGiftVoucherProduct } from "../../../../modules/gift-voucher/product-sync"
import { DEFAULT_SETTINGS } from "../../../../modules/gift-voucher/policy"
import { POST as settings } from "../settings/route"
import { POST as refund } from "../refund/route"
import { POST as voidVoucher } from "../[id]/void/route"

function fixture(body: unknown) {
  const service = {
    saveSettings: jest.fn().mockResolvedValue(DEFAULT_SETTINGS),
    refundOrderToVoucher: jest.fn().mockResolvedValue([{ voucher_id: "gv_test", amount_minor: 500, balance_after: 2500 }]),
    voidVoucher: jest.fn().mockResolvedValue({ id: "gv_test", code: "GV-AAAA-BBBB-CCCC-DDDD", status: "void", balance: 0, initial_amount: 5000 }),
  }
  const logger = { error: jest.fn() }
  const req: any = { auth_context: { actor_id: "user_test", actor_type: "user" }, params: { id: "gv_test" }, body, scope: { resolve: (key: string) => key === "logger" ? logger : service } }
  const res: any = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() }
  return { req, res, service }
}

describe("voucher admin changes in the shared audit", () => {
  beforeEach(() => { jest.clearAllMocks(); (syncGiftVoucherProduct as jest.Mock).mockResolvedValue({ id: "prod_test" }) })
  const input = { enabled: true, values: [50, 100, 200], validity_months: 12, scope_type: "all", category_ids: [], partial_redemption: true, delivery_method: "both" }

  it("records the applied settings snapshot if product synchronization subsequently fails", async () => {
    const { req, res } = fixture(input)
    ;(syncGiftVoucherProduct as jest.Mock).mockRejectedValue(new Error("synthetic sync failure"))
    await settings(req, res)
    expect(res.status).toHaveBeenCalledWith(502)
    expect(auditAdminChange).toHaveBeenCalledWith(req, "gift_voucher.settings.update", "gift_voucher_settings", "default", null, DEFAULT_SETTINGS)
  })
  it("does not record an unsuccessful settings write", async () => {
    const { req, res, service } = fixture(input)
    service.saveSettings.mockRejectedValue(new Error("synthetic storage failure"))
    await settings(req, res)
    expect(res.status).toHaveBeenCalledWith(500)
    expect(auditAdminChange).not.toHaveBeenCalled()
  })
  it("records a refund once and leaves replay without a second audit entry", async () => {
    const { req, res, service } = fixture({ order_id: "order_test", amount: 5, idempotency_key: "synthetic-refund-key", note: "private synthetic note" })
    await refund(req, res)
    expect(auditAdminChange).toHaveBeenCalledTimes(1)
    expect(auditAdminChange).toHaveBeenCalledWith(req, "gift_voucher.refund", "order", "order_test", null, { refunds: [{ voucher_id: "gv_test", amount_minor: 500, balance_after_minor: 2500 }] })
    service.refundOrderToVoucher.mockResolvedValue([])
    await refund(req, res)
    expect(auditAdminChange).toHaveBeenCalledTimes(1)
    expect(res.json.mock.calls[1][0].replayed).toBe(true)
  })
  it("records void state without the voucher code or freeform reason", async () => {
    const { req, res } = fixture({ reason: "private synthetic reason" })
    await voidVoucher(req, res)
    expect(auditAdminChange).toHaveBeenCalledWith(req, "gift_voucher.void", "gift_voucher", "gv_test", null, { status: "void", balance_minor: 0 })
    const fields = JSON.stringify((auditAdminChange as jest.Mock).mock.calls[0].slice(1))
    expect(fields).not.toMatch(/GV-AAAA|private synthetic/)
  })
  it("rejects customer actors before writes or audit", async () => {
    const { req, res, service } = fixture(input)
    req.auth_context.actor_type = "customer"
    await settings(req, res)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(service.saveSettings).not.toHaveBeenCalled()
    expect(auditAdminChange).not.toHaveBeenCalled()
  })
})

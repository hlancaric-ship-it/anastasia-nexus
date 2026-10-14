import { GET } from "../[id]/transactions/route"

function fixture(actor = "user") {
  const service = {
    getVoucher: jest.fn().mockResolvedValue({ currency_code: "eur", code: "SECRET-CODE", recipient_email: "private@example.test" }),
    listAndCountGiftVoucherTransactions: jest.fn().mockResolvedValue([[{
      id: "gvtx_test", type: "redeemed", amount: 2500, balance_after: 7500,
      code: "SECRET-CODE", note: "private@example.test", metadata: { token: "SECRET" }, idempotency_key: "private-key",
    }], 1]),
  }
  const req: any = { auth_context: { actor_id: "user_test", actor_type: actor }, params: { id: "gv_test" }, query: {}, scope: { resolve: () => service } }
  const res: any = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() }
  return { req, res, service }
}

describe("voucher financial history", () => {
  it("rejects customer actors before accessing records", async () => {
    const { req, res, service } = fixture("customer")
    await GET(req, res)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(service.getVoucher).not.toHaveBeenCalled()
  })
  it("exposes server monetary values but no codes, notes, recipient data or arbitrary metadata", async () => {
    const { req, res } = fixture()
    await GET(req, res)
    const body = res.json.mock.calls[0][0]
    expect(body.transactions[0]).toMatchObject({ amount: 25, balance_after: 75 })
    expect(JSON.stringify(body)).not.toMatch(/SECRET|private|idempotency/)
    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "no-store")
  })
  it("caps pagination and scopes the audit to the selected voucher", async () => {
    const { req, res, service } = fixture()
    req.query = { limit: "9999", offset: "-3" }
    await GET(req, res)
    expect(service.listAndCountGiftVoucherTransactions.mock.calls[0][0]).toEqual({ voucher_id: "gv_test" })
    expect(res.json.mock.calls[0][0]).toMatchObject({ limit: 100, offset: 0 })
  })
  it("reports absent vouchers instead of an empty successful audit", async () => {
    const { req, res, service } = fixture()
    service.getVoucher.mockResolvedValue(null as any)
    await GET(req, res)
    expect(res.status).toHaveBeenCalledWith(404)
    expect(service.listAndCountGiftVoucherTransactions).not.toHaveBeenCalled()
  })
})

import { compensatePaymentRefund } from "../payment-refunded"

function makeContainer(order: any) {
  const vouchers = {
    attachOrder: jest.fn(async () => 1),
    refundOrderToVoucher: jest.fn(async () => [{ voucher_id: "gv_1", amount_minor: 3000, balance_after: 3000 }]),
    voidIssuedForCanceledOrder: jest.fn(async () => ({ voided: ["gv_2"], used: ["gv_3"] })),
  }
  const query = { graph: jest.fn(async ({ entity }: any) => ({ data: entity === "order_cart" ? [{ cart_id: "cart_1" }] : order ? [order] : [] })) }
  const container: any = { resolve: (key: string) => (key === "gift_voucher" ? vouchers : key === "query" ? query : { warn: jest.fn(), error: jest.fn(), info: jest.fn() }) }
  return { container, vouchers }
}

const order = (captured: number, refunded: number, status = "completed") => ({ id: "o1", status, total: 70, payment_collections: [{ captured_amount: captured, refunded_amount: refunded }] })

describe("compensatePaymentRefund", () => {
  it("plný refund karty vrátí poukazovou část a zneplatní nevyčerpané poukazy z objednávky", async () => {
    const { container, vouchers } = makeContainer(order(70, 70))
    expect(await compensatePaymentRefund(container, "o1")).toEqual({ action: "compensated", voucher_refunds: [{ voucher_id: "gv_1", amount_minor: 3000 }], issued_voided: ["gv_2"], issued_used: ["gv_3"] })
    expect(vouchers.attachOrder).toHaveBeenCalledWith("cart_1", "o1")
    expect(vouchers.refundOrderToVoucher).toHaveBeenCalledWith({ order_id: "o1", includeForfeited: true, idempotency_key: "refund:o1", note: "order_refunded" })
    expect(vouchers.voidIssuedForCanceledOrder).toHaveBeenCalledWith("o1", "order_refunded")
  })
  it("částečný refund nic automaticky nepřepočítá – jen manual_review", async () => {
    const { container, vouchers } = makeContainer(order(70, 20))
    expect(await compensatePaymentRefund(container, "o1")).toEqual({ action: "manual_review", reason: "PARTIAL_REFUND", captured: 70, refunded: 20 })
    expect(vouchers.refundOrderToVoucher).not.toHaveBeenCalled()
    expect(vouchers.voidIssuedForCanceledOrder).not.toHaveBeenCalled()
  })
  it("stornovanou objednávku řeší storno, ne refund", async () => {
    const { container, vouchers } = makeContainer(order(70, 70, "canceled"))
    expect(await compensatePaymentRefund(container, "o1")).toEqual({ action: "none", reason: "ORDER_CANCELED" })
    expect(vouchers.refundOrderToVoucher).not.toHaveBeenCalled()
  })
  it("bez refundu nebo bez objednávky nic nedělá", async () => {
    expect(await compensatePaymentRefund(makeContainer(order(70, 0)).container, "o1")).toEqual({ action: "none", reason: "NOT_REFUNDED" })
    expect(await compensatePaymentRefund(makeContainer(null).container, "o1")).toEqual({ action: "none", reason: "ORDER_NOT_FOUND" })
  })
})

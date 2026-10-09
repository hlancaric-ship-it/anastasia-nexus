import { cancelBookingForCanceledOrder, confirmBookingForOrder } from "../order-sync"

function makeContainer(order: any, overrides: Partial<Record<string, jest.Mock>> = {}) {
  const bookings = { confirm: jest.fn(async (i: any) => ({ id: i.id, status: "confirmed" })), cancelByOrder: jest.fn(async () => 1), ...overrides }
  const query = { graph: jest.fn(async () => ({ data: order ? [order] : [] })) }
  const logger = { error: jest.fn(), info: jest.fn() }
  const container: any = { resolve: (key: string) => (key === "booking" ? bookings : key === "query" ? query : logger) }
  return { container, bookings }
}

const paidOrder = { id: "o1", total: 69, metadata: { booking_id: "bkg_1" }, payment_collections: [{ captured_amount: 69, refunded_amount: 0 }] }

describe("confirmBookingForOrder", () => {
  it("zaplacená objednávka s booking_id potvrdí rezervaci", async () => {
    const { container, bookings } = makeContainer(paidOrder)
    expect((await confirmBookingForOrder(container, "o1")).confirmed).toBe(true)
    expect(bookings.confirm).toHaveBeenCalledWith({ id: "bkg_1", order_id: "o1" })
  })
  it("bez booking_id v metadatech se přeskočí", async () => {
    const { container, bookings } = makeContainer({ ...paidOrder, metadata: {} })
    expect((await confirmBookingForOrder(container, "o1")).skipped).toBe("NO_BOOKING")
    expect(bookings.confirm).not.toHaveBeenCalled()
  })
  it("nezaplacená objednávka se přeskočí", async () => {
    const unpaid = { ...paidOrder, payment_collections: [{ captured_amount: 0, payments: [{ captured_at: null }] }] }
    const { container, bookings } = makeContainer(unpaid)
    expect((await confirmBookingForOrder(container, "o1")).skipped).toBe("NOT_PAID")
    expect(bookings.confirm).not.toHaveBeenCalled()
  })
})

describe("cancelBookingForCanceledOrder", () => {
  it("volá cancelByOrder", async () => {
    const { container, bookings } = makeContainer(null)
    expect(await cancelBookingForCanceledOrder(container, "o1")).toBe(1)
    expect(bookings.cancelByOrder).toHaveBeenCalledWith("o1", "order_canceled")
  })
})

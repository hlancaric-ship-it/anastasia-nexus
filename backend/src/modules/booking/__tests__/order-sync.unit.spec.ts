import { cancelBookingForCanceledOrder, confirmBookingForOrder } from "../order-sync"

function makeContainer(order: any, overrides: Partial<Record<string, jest.Mock>> = {}) {
  const bookings = { attachCheckoutOrder: jest.fn(async (i: any) => ({ id: i.id, status: "confirmed" })), cancelByOrder: jest.fn(async () => 1), listBookings: jest.fn(async () => [{ id: "bkg_1" }]), ...overrides }
  const query = { graph: jest.fn(async ({ entity }: any) => ({ data: entity === "order_cart" ? [{ cart_id: "cart_1" }] : order ? [order] : [] })) }
  const logger = { error: jest.fn(), info: jest.fn() }
  const container: any = { resolve: (key: string) => (key === "booking" ? bookings : key === "query" ? query : logger) }
  return { container, bookings }
}

const paidOrder = { id: "o1", total: 69, customer_id: "cus_1", items: [{ product_id: "p1" }], metadata: { booking_id: "bkg_1" }, payment_collections: [{ captured_amount: 69, refunded_amount: 0 }] }

describe("confirmBookingForOrder", () => {
  it("a delayed payment event cannot confirm a canceled order", async () => {
    const { container, bookings } = makeContainer({ ...paidOrder, status: "canceled" })
    expect((await confirmBookingForOrder(container, "o1")).skipped).toBe("ORDER_CANCELED")
    expect(bookings.attachCheckoutOrder).toHaveBeenCalledWith(expect.objectContaining({ canceled: true }))
  })
  it("zaplacená objednávka s booking_id potvrdí rezervaci", async () => {
    const { container, bookings } = makeContainer(paidOrder)
    expect(await confirmBookingForOrder(container, "o1")).toEqual({ confirmed: true, booking_id: "bkg_1" })
    expect(bookings.attachCheckoutOrder).toHaveBeenCalledWith({ id: "bkg_1", order_id: "o1", cart_id: "cart_1", customer_id: "cus_1", product_ids: ["p1"], paid: true })
  })
  it("bez booking_id v metadatech se přeskočí", async () => {
    const { container, bookings } = makeContainer({ ...paidOrder, metadata: {} })
    expect((await confirmBookingForOrder(container, "o1")).skipped).toBe("NO_BOOKING")
    expect(bookings.attachCheckoutOrder).not.toHaveBeenCalled()
  })
  it("nezaplacená objednávka se přeskočí", async () => {
    const unpaid = { ...paidOrder, payment_collections: [{ captured_amount: 0, payments: [{ captured_at: null }] }] }
    const { container, bookings } = makeContainer(unpaid)
    expect((await confirmBookingForOrder(container, "o1")).skipped).toBe("NOT_PAID")
    expect(bookings.attachCheckoutOrder).toHaveBeenCalledWith(expect.objectContaining({ paid: false }))
  })
})

describe("cancelBookingForCanceledOrder", () => {
  it("volá cancelByOrder a vrátí dříve potvrzené rezervace pro upozornění", async () => {
    const { container, bookings } = makeContainer(null)
    expect(await cancelBookingForCanceledOrder(container, "o1")).toEqual({ canceled: 1, confirmed_ids: ["bkg_1"] })
    expect(bookings.listBookings).toHaveBeenCalledWith({ order_id: "o1", status: "confirmed" }, expect.anything())
    expect(bookings.cancelByOrder).toHaveBeenCalledWith("o1", "order_canceled")
  })
  it("když nic nezrušilo (už zrušeno), neupozorňuje", async () => {
    const { container } = makeContainer(null, { cancelByOrder: jest.fn(async () => 0) })
    expect(await cancelBookingForCanceledOrder(container, "o1")).toEqual({ canceled: 0, confirmed_ids: [] })
  })
})

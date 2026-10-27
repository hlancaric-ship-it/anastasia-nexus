/** @jest-environment node */
import handler, { config } from "../coupon-usage-order-placed"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

const confirmUsage = jest.fn()
const cancelUsage = jest.fn()
const recordEvent = jest.fn(async () => null)
jest.mock("../../modules/coupon-link", () => ({ COUPON_LINK_MODULE: "coupon_link" }))
jest.mock("../../lib/observability/events", () => ({ recordEvent: (...args: any[]) => (recordEvent as any)(...args) }))

const containerWith = (links: any[], carts: any[] = [{ id: "cart_1", metadata: { nexus_coupon: { code: "ONCE", promotion_id: "promo_1" } } }]) => {
  const query = { graph: jest.fn(async ({ entity }: any) => ({ data: entity === "order_cart" ? links : carts })) }
  return {
    resolve: (key: string) => key === ContainerRegistrationKeys.QUERY ? query : { confirmUsage, cancelUsage },
    query,
  } as any
}

beforeEach(() => {
  jest.clearAllMocks()
  confirmUsage.mockResolvedValue({ id: "reservation_1", promotion_id: "promo_1", status: "confirmed", order_id: "order_1" })
  cancelUsage.mockResolvedValue(true)
})

describe("coupon reservation order lifecycle", () => {
  it("handles both confirmation and cancellation events", () => {
    expect(config.event).toEqual(["order.placed", "order.canceled"])
  })

  it("confirms the cart reservation idempotently when the order is placed", async () => {
    const container = containerWith([{ cart_id: "cart_1" }])
    const event = { data: { id: "order_1" }, name: "order.placed" }
    await handler({ event, container } as any)
    await handler({ event, container } as any)
    expect(confirmUsage).toHaveBeenNthCalledWith(1, { cart_id: "cart_1", order_id: "order_1", coupon_code: "ONCE" })
    expect(confirmUsage).toHaveBeenNthCalledWith(2, { cart_id: "cart_1", order_id: "order_1", coupon_code: "ONCE" })
    expect(recordEvent).toHaveBeenCalledWith(expect.anything(), "info", "coupon", "used", expect.objectContaining({ source: "order_placed" }))
  })

  it("fails visibly if a coupon order has no reservation", async () => {
    confirmUsage.mockResolvedValue(null)
    await expect(handler({ event: { data: { id: "order_1" }, name: "order.placed" }, container: containerWith([{ cart_id: "cart_1" }]) } as any))
      .rejects.toThrow("COUPON_USAGE_RESERVATION_MISSING")
  })

  it("releases the use when an order is canceled", async () => {
    const container = containerWith([{ cart_id: "cart_1" }])
    await handler({ event: { data: { id: "order_1" }, name: "order.canceled" }, container } as any)
    expect(cancelUsage).toHaveBeenCalledWith({ cart_id: "cart_1", order_id: "order_1" })
    expect(recordEvent).toHaveBeenCalledWith(expect.anything(), "info", "coupon", "usage_released", expect.objectContaining({ source: "order_canceled" }))
  })

  it("ignores orders without a cart or without a server-stored coupon", async () => {
    const noCart = containerWith([])
    await handler({ event: { data: { id: "order_1" }, name: "order.placed" }, container: noCart } as any)
    const noCoupon = containerWith([{ cart_id: "cart_1" }], [{ id: "cart_1", metadata: {} }])
    await handler({ event: { data: { id: "order_2" }, name: "order.placed" }, container: noCoupon } as any)
    expect(confirmUsage).not.toHaveBeenCalled()
  })
})

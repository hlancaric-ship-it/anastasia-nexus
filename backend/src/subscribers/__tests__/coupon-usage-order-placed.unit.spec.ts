/** @jest-environment node */
import handler, { config } from "../coupon-usage-order-placed"

const recordCouponUsage = jest.fn()
jest.mock("../../lib/pricing/coupon-usage", () => ({ recordCouponUsage: (...args: any[]) => (recordCouponUsage as any)(...args) }))
const recordEvent = jest.fn(async () => null)
jest.mock("../../lib/observability/events", () => ({ recordEvent: (...args: any[]) => (recordEvent as any)(...args) }))

const containerWith = (links: any[]) => ({
  resolve: () => ({ graph: jest.fn(async () => ({ data: links })) }),
}) as any

beforeEach(() => jest.clearAllMocks())

describe("započítanie kupónu pri order.placed (aj objednávky zo Stripe webhooku)", () => {
  it("počúva na order.placed", () => {
    expect(config.event).toBe("order.placed")
  })

  it("započíta použitie pre košík objednávky a zapíše udalosť", async () => {
    recordCouponUsage.mockResolvedValue({ promotion_id: "promo_1", counted: true, duplicate: false })
    await handler({ event: { data: { id: "order_1" } }, container: containerWith([{ cart_id: "cart_1" }]) } as any)
    expect(recordCouponUsage).toHaveBeenCalledWith(expect.anything(), { cartId: "cart_1", orderId: "order_1" })
    expect(recordEvent).toHaveBeenCalledWith(expect.anything(), "info", "coupon", "used", expect.objectContaining({ source: "order_placed" }))
  })

  it("duplicita (už započítané cez nexus-checkout) nezapíše udalosť znova", async () => {
    recordCouponUsage.mockResolvedValue({ promotion_id: "promo_1", counted: false, duplicate: true })
    await handler({ event: { data: { id: "order_1" } }, container: containerWith([{ cart_id: "cart_1" }]) } as any)
    expect(recordEvent).not.toHaveBeenCalled()
  })

  it("vyčerpaný limit zapíše varovanie", async () => {
    recordCouponUsage.mockResolvedValue({ promotion_id: "promo_1", counted: false, duplicate: false })
    await handler({ event: { data: { id: "order_1" } }, container: containerWith([{ cart_id: "cart_1" }]) } as any)
    expect(recordEvent).toHaveBeenCalledWith(expect.anything(), "warn", "coupon", "limit_exhausted", expect.anything())
  })

  it("objednávka bez košíka sa preskočí", async () => {
    await handler({ event: { data: { id: "order_1" } }, container: containerWith([]) } as any)
    expect(recordCouponUsage).not.toHaveBeenCalled()
  })
})

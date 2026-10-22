import { requireNexusCheckoutForCouponCart } from "../complete-guard"

/**
 * Poistka natívnej trasy dokončenia košíka (`POST /store/carts/:id/complete`):
 * použitie kupónu zapisuje len `/store/nexus-checkout`, takže košík s kupónom sa natívnou
 * trasou dokončiť nesmie (409 USE_NEXUS_CHECKOUT) – inak by sa jednorazový kupón dal použiť
 * opakovane (počítadlo `promotion.used` by zostalo na nule).
 */
const res = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() }) as any

const req = (cart: any) => ({
  params: { id: "cart_synthetic" },
  scope: {
    resolve: jest.fn(() => ({
      graph: jest.fn(async ({ entity }: any) => (entity === "cart" ? { data: cart ? [cart] : [] } : { data: [] })),
    })),
  },
}) as any

const couponMetadata = { nexus_coupon: { code: "SYNTHETIC-C3", promotion_id: "promo_synthetic", type: "percentage", value: 10 } }

describe("poistka natívneho dokončenia košíka s kupónom", () => {
  it("odmietne košík s Medusa promotion kódom (409 USE_NEXUS_CHECKOUT)", async () => {
    const r = res()
    const next = jest.fn()
    await requireNexusCheckoutForCouponCart(req({ id: "cart_synthetic", metadata: {}, promotions: [{ code: "SYNTHETIC-C3" }] }), r, next)
    expect(r.status).toHaveBeenCalledWith(409)
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ code: "USE_NEXUS_CHECKOUT", error: "USE_NEXUS_CHECKOUT" }))
    expect(next).not.toHaveBeenCalled()
  })

  it("odmietne košík s kupónom uloženým v metadátach (NEXUS kupón)", async () => {
    const r = res()
    const next = jest.fn()
    await requireNexusCheckoutForCouponCart(req({ id: "cart_synthetic", metadata: couponMetadata, promotions: [] }), r, next)
    expect(r.status).toHaveBeenCalledWith(409)
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ code: "USE_NEXUS_CHECKOUT" }))
    expect(next).not.toHaveBeenCalled()
  })

  it("pustí košík bez kupónu ďalej", async () => {
    const r = res()
    const next = jest.fn()
    await requireNexusCheckoutForCouponCart(req({ id: "cart_synthetic", metadata: {}, promotions: [] }), r, next)
    expect(next).toHaveBeenCalledTimes(1)
    expect(r.status).not.toHaveBeenCalled()
  })

  it("pustí košík, ktorý neexistuje, ďalej (rozhodne workflow)", async () => {
    const r = res()
    const next = jest.fn()
    await requireNexusCheckoutForCouponCart(req(null), r, next)
    expect(next).toHaveBeenCalledTimes(1)
    expect(r.status).not.toHaveBeenCalled()
  })

  it("nečitateľný metadát kupónu sa nepočíta za kupón", async () => {
    const r = res()
    const next = jest.fn()
    await requireNexusCheckoutForCouponCart(req({ id: "cart_synthetic", metadata: { nexus_coupon: { code: "X" } }, promotions: [] }), r, next)
    expect(next).toHaveBeenCalledTimes(1)
  })

  it("pri chybe čítania košíka fail-closed (chybou ďalej, nie ticho)", async () => {
    const r = res()
    const next = jest.fn()
    const failing = {
      params: { id: "cart_synthetic" },
      scope: { resolve: jest.fn(() => ({ graph: jest.fn(async () => { throw new Error("DB_UNAVAILABLE") }) })) },
    } as any
    await requireNexusCheckoutForCouponCart(failing, r, next)
    expect(next).toHaveBeenCalledTimes(1)
    expect(next.mock.calls[0][0]).toBeInstanceOf(Error)
    expect(r.status).not.toHaveBeenCalled()
  })
})

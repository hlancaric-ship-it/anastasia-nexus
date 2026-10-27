import { rejectServerOwnedCartMetadata, reservedCartMetadataKeys } from "../metadata-guard"

/**
 * `cart.metadata.nexus_coupon` zapisuje len server – natívne Store API ho od klienta odmietne,
 * inak by si zákazník podvrhol `promotion_id` a obišiel limit použití kupónu.
 */
const res = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() }) as any

describe("poistka server-owned metadát košíka", () => {
  it("odmietne podvrhnutý nexus_coupon (400 RESERVED_METADATA)", () => {
    const r = res()
    const next = jest.fn()
    rejectServerOwnedCartMetadata({ body: { metadata: { nexus_coupon: { promotion_id: "promo_other" } } } } as any, r, next)
    expect(r.status).toHaveBeenCalledWith(400)
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ code: "RESERVED_METADATA" }))
    expect(next).not.toHaveBeenCalled()
  })

  it("odmietne aj nexus_coupon: null (zmazanie kupónu mimo servera)", () => {
    expect(reservedCartMetadataKeys({ metadata: { nexus_coupon: null } })).toEqual(["nexus_coupon"])
  })

  it("pustí bežné metadáta a telo bez metadát", () => {
    for (const body of [{ metadata: { note: "x" } }, { email: "a@b.test" }, undefined, { metadata: "x" }, { metadata: [] }]) {
      const r = res()
      const next = jest.fn()
      rejectServerOwnedCartMetadata({ body } as any, r, next)
      expect(next).toHaveBeenCalledTimes(1)
      expect(r.status).not.toHaveBeenCalled()
    }
  })
})

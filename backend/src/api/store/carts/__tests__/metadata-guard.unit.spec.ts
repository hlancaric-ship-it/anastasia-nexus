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

describe("firemné údaje v košíku (IČO, DIČ, IČ DPH)", () => {
  const run = (body: unknown) => {
    const r = res()
    const next = jest.fn()
    rejectServerOwnedCartMetadata({ body } as any, r, next)
    return { r, next }
  }

  it("pustí platné SK a CZ údaje aj prázdne hodnoty", () => {
    for (const metadata of [
      { company_ico: "36652164", company_dic: "2022216372", company_ic_dph: "SK2022216372" },
      { company_ico: "12 345 678", company_dic: "CZ12345678", company_ic_dph: "cz12345678" },
      { company_ico: "", company_dic: "", company_ic_dph: "" },
    ]) {
      const { r, next } = run({ metadata, billing_address: { company: "Firma s.r.o." } })
      expect(next).toHaveBeenCalledTimes(1)
      expect(r.status).not.toHaveBeenCalled()
    }
  })

  it("odmietne neplatný formát, ne-reťazec a dlhý názov firmy (400 INVALID_COMPANY_ID)", () => {
    for (const body of [
      { metadata: { company_ico: "<script>alert(1)</script>" } },
      { metadata: { company_dic: "Zaplatené v hotovosti" } },
      { metadata: { company_ic_dph: { $ne: 1 } } },
      { metadata: { company_ico: "1".repeat(5000) } },
      { billing_address: { company: "x".repeat(121) } },
      { shipping_address: { company: 42 } },
    ]) {
      const { r, next } = run(body)
      expect(next).not.toHaveBeenCalled()
      expect(r.status).toHaveBeenCalledWith(400)
      expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ code: "INVALID_COMPANY_ID" }))
    }
  })
})

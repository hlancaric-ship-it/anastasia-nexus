import { resolveCustomerTier } from "../customer-tier"

describe("resolveCustomerTier", () => {
  it("čte tier z metadata.nexus_tier", () => {
    expect(resolveCustomerTier([{ name: "Gold", metadata: { nexus_tier: "ZR3", rank: 3 } }])).toBe("ZR3")
  })
  it("záloha: název skupiny ZR\\d+", () => {
    expect(resolveCustomerTier([{ name: "zr2" }])).toBe("ZR2")
  })
  it("vybere nejvyšší rank při více skupinách", () => {
    expect(resolveCustomerTier([
      { name: "Bronze", metadata: { nexus_tier: "ZR1", rank: 1 } },
      { name: "VIP", metadata: { nexus_tier: "ZR4", rank: 4 } },
    ])).toBe("ZR4")
  })
  it("ignoruje neplatné hodnoty a žádnou skupinu", () => {
    expect(resolveCustomerTier([{ name: "Newsletter", metadata: { nexus_tier: "gold" } }])).toBeUndefined()
    expect(resolveCustomerTier(undefined)).toBeUndefined()
    expect(resolveCustomerTier([])).toBeUndefined()
  })
})

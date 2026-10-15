import {
  computeExpiry, isActiveAt, isEntitlementProduct, isFullyRefunded, isOrderPaid, orderDedupeKey, toNumber,
} from "../policy"

describe("entitlement policy", () => {
  it("toNumber zvládá BigNumber tvary a neplatné vstupy", () => {
    expect(toNumber({ value: "38" })).toBe(38)
    expect(toNumber({ numeric: 12.5 })).toBe(12.5)
    expect(toNumber("x")).toBe(0)
    expect(toNumber(null)).toBe(0)
  })

  it("digitální produkt: shipping profil digital nebo metadata, entitlement=false vyřadí", () => {
    expect(isEntitlementProduct({ id: "p", shipping_profile: { type: "digital" } })).toBe(true)
    expect(isEntitlementProduct({ id: "p", metadata: { digital: "true" } })).toBe(true)
    expect(isEntitlementProduct({ id: "p", metadata: { entitlement: false }, shipping_profile: { type: "digital" } })).toBe(false)
    expect(isEntitlementProduct({ id: "p", shipping_profile: { type: "default" } })).toBe(false)
  })

  it("isOrderPaid: nezaplacená, zaplacená, zrušená", () => {
    expect(isOrderPaid({ total: 38, payment_collections: [{ captured_amount: 0, payments: [{ captured_at: null }] }] })).toBe(false)
    expect(isOrderPaid({ total: 38, payment_collections: [{ captured_amount: 38 }] })).toBe(true)
    expect(isOrderPaid({ total: 38, status: "canceled", payment_collections: [{ captured_amount: 38 }] })).toBe(false)
    expect(isOrderPaid({ total: 0 })).toBe(true)
    expect(isOrderPaid({ total: 38, payment_collections: [] })).toBe(false)
  })

  it("částečný refund přístup neruší, plný ano", () => {
    expect(isFullyRefunded({ payment_collections: [{ captured_amount: 38, refunded_amount: 10 }] })).toBe(false)
    expect(isFullyRefunded({ payment_collections: [{ captured_amount: 38, refunded_amount: 38 }] })).toBe(true)
    expect(isFullyRefunded({ payment_collections: [{ captured_amount: 0, refunded_amount: 0 }] })).toBe(false)
  })

  it("expirace a aktivita", () => {
    const now = new Date("2026-10-09T00:00:00Z")
    expect(computeExpiry({ id: "p" }, now)).toBeNull()
    expect(computeExpiry({ id: "p", metadata: { entitlement_days: 112 } }, now)?.toISOString()).toBe("2027-01-29T00:00:00.000Z")
    expect(isActiveAt({ status: "active", expires_at: null }, now)).toBe(true)
    expect(isActiveAt({ status: "active", expires_at: "2026-10-08T00:00:00Z" }, now)).toBe(false)
    expect(isActiveAt({ status: "revoked", expires_at: null }, now)).toBe(false)
  })

  it("dedupe klíč je stabilní", () => {
    expect(orderDedupeKey("o1", "p1")).toBe("order:o1:p1")
  })
})

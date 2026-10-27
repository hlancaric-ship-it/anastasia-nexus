import { isBookingService, productRequiresShipping } from "../product-delivery"

describe("catalog delivery classification", () => {
  it("valid booking services need no delivery even with a default shipping profile", () => {
    const product = { metadata: { booking: { durationMinutes: 60 } }, shipping_profile: { type: "default" } }
    expect(isBookingService(product)).toBe(true)
    expect(productRequiresShipping(product)).toBe(false)
  })
  it.each([undefined, null, {}, { metadata: { booking: true } }, { metadata: { booking: {} } }, { metadata: { booking: { durationMinutes: 0 } } }])("keeps unknown or malformed catalog data physical: %j", product => {
    expect(isBookingService(product)).toBe(false)
    expect(productRequiresShipping(product)).toBe(true)
  })
  it("preserves digital profiles and physical goods", () => {
    expect(productRequiresShipping({ shipping_profile: { type: "digital" } })).toBe(false)
    expect(productRequiresShipping({ shipping_profile: { type: "default" } })).toBe(true)
  })
})

import {
  LOYALTY_GROUPS,
  SK_VAT_RATES,
  STRIPE_PROVIDER_ID,
  SYSTEM_PROVIDER_ID,
  buildShippingOptionInputs,
  parseCountries,
  pickPaymentProviders,
} from "../anastasia-bootstrap"

describe("anastasia-bootstrap config", () => {
  it("parseCountries defaults to sk and normalizes input", () => {
    expect(parseCountries(undefined)).toEqual(["sk"])
    expect(parseCountries(" SK, cz ,sk")).toEqual(["sk", "cz"])
  })

  it("parseCountries rejects invalid codes and empty lists", () => {
    expect(() => parseCountries("svk")).toThrow(/Invalid ISO-2/)
    expect(() => parseCountries(" , ")).toThrow(/at least one/)
  })

  it("pickPaymentProviders prefers Stripe, falls back only outside production", () => {
    expect(pickPaymentProviders([SYSTEM_PROVIDER_ID, STRIPE_PROVIDER_ID], true)).toEqual([STRIPE_PROVIDER_ID])
    expect(pickPaymentProviders([SYSTEM_PROVIDER_ID], false)).toEqual([SYSTEM_PROVIDER_ID])
    expect(() => pickPaymentProviders([SYSTEM_PROVIDER_ID], true)).toThrow(/STRIPE_API_KEY/)
  })

  it("has exactly one default VAT rate (23 %) and unique codes", () => {
    const defaults = SK_VAT_RATES.filter((r) => r.is_default)
    expect(defaults).toHaveLength(1)
    expect(defaults[0].rate).toBe(23)
    expect(new Set(SK_VAT_RATES.map((r) => r.code)).size).toBe(SK_VAT_RATES.length)
  })

  it("defines Bronze/Silver/Gold/VIP with unique tiers", () => {
    expect(LOYALTY_GROUPS.map((g) => g.name)).toEqual(["Bronze", "Silver", "Gold", "VIP"])
    expect(new Set(LOYALTY_GROUPS.map((g) => g.nexus_tier)).size).toBe(4)
  })

  it("builds a paid courier option and a free digital option in EUR", () => {
    const [courier, digital] = buildShippingOptionInputs({
      regionId: "reg_1",
      physicalZoneId: "zone_p",
      digitalZoneId: "zone_d",
      physicalProfileId: "sp_p",
      digitalProfileId: "sp_d",
    })
    expect(courier.service_zone_id).toBe("zone_p")
    expect(courier.prices.every((p) => p.amount === 6)).toBe(true)
    expect(digital.service_zone_id).toBe("zone_d")
    expect(digital.shipping_profile_id).toBe("sp_d")
    expect(digital.prices.every((p) => p.amount === 0)).toBe(true)
    expect(digital.prices.some((p) => "currency_code" in p && p.currency_code === "eur")).toBe(true)
  })
})

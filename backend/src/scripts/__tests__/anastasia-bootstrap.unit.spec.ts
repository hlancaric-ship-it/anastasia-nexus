import {
  LOYALTY_GROUPS,
  SK_VAT_RATES,
  STRIPE_PROVIDER_ID,
  SYSTEM_PROVIDER_ID,
  buildShippingOptionInputs,
  parseFreeShippingThreshold,
  parseCountries,
  pickPaymentProviders,
  MEMBERSHIP_PROVIDER_ID,
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
    expect(pickPaymentProviders([STRIPE_PROVIDER_ID, MEMBERSHIP_PROVIDER_ID, SYSTEM_PROVIDER_ID], true)).toEqual([STRIPE_PROVIDER_ID, MEMBERSHIP_PROVIDER_ID])
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
  it("adds a rule-based free courier price only when a threshold is configured", () => {
    const args = { regionId: "reg_1", physicalZoneId: "zone_p", digitalZoneId: "zone_d", physicalProfileId: "sp_p", digitalProfileId: "sp_d" }
    const [plain] = buildShippingOptionInputs({ ...args, freeShippingFromEur: null })
    expect(plain.prices).toHaveLength(2)
    const [courier, digital] = buildShippingOptionInputs({ ...args, freeShippingFromEur: 49.9 })
    const free = courier.prices.filter((p) => p.amount === 0)
    expect(free).toHaveLength(2)
    expect(free.every((p: any) => p.rules?.[0]?.attribute === "item_total" && p.rules[0].operator === "gte" && p.rules[0].value === 49.9)).toBe(true)
    // Base price without rules stays, so carts below the threshold still pay 6 EUR.
    expect(courier.prices.filter((p: any) => p.amount === 6 && !p.rules)).toHaveLength(2)
    expect(digital.prices).toHaveLength(2)
  })

  it("parses the free shipping threshold strictly", () => {
    expect(parseFreeShippingThreshold(undefined)).toBeNull()
    expect(parseFreeShippingThreshold("  ")).toBeNull()
    expect(parseFreeShippingThreshold("50")).toBe(50)
    expect(parseFreeShippingThreshold("49.90")).toBe(49.9)
    for (const bad of ["0", "-5", "50,00", "1e3", "50.123", "abc", "1234567"]) {
      expect(() => parseFreeShippingThreshold(bad)).toThrow("ANASTASIA_FREE_SHIPPING_FROM_EUR")
    }
  })
})

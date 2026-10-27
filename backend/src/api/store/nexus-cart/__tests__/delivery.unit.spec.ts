jest.mock("@medusajs/medusa/core-flows", () => ({
  updateLineItemInCartWorkflow: jest.fn(() => ({ run: jest.fn(async () => undefined) })),
  updateCartWorkflow: jest.fn(),
  refreshPaymentCollectionForCartWorkflow: jest.fn(() => ({ run: jest.fn(async () => undefined) })),
}))
import { updateLineItemInCartWorkflow } from "@medusajs/medusa/core-flows"
import { repriceCart } from "../route"

describe("cart line delivery normalization", () => {
  const originalEnv = { ...process.env }, originalFetch = global.fetch
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.NEXUS_TENANT_ID = "anastasia"
    process.env.NEXUS_PRICING_URL = "https://nexus.test/pricing"
    process.env.NEXUS_PRICING_API_KEY = "synthetic"
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ ok: true, tenantId: "anastasia", calculated: { finalPrice: 50, appliedRules: [] } }))) as any
  })
  afterEach(() => { process.env = { ...originalEnv }; global.fetch = originalFetch })

  it.each([
    [{ metadata: { booking: { durationMinutes: 60 } }, shipping_profile: { type: "default" } }, false],
    [{ metadata: {}, shipping_profile: { type: "default" } }, true],
    [{ metadata: {}, shipping_profile: { type: "digital" } }, false],
    [{ metadata: { booking: true } }, true],
  ] as const)("uses catalog classification %j instead of client line metadata", async (product, expected) => {
    const graph = jest.fn(async ({ entity }: any) => ({ data: entity === "cart" ? [{
      id: "cart_test", currency_code: "eur", region_id: "reg_test", items: [{ id: "line_test", variant_id: "var_test", quantity: 1, unit_price: 50, requires_shipping: !expected, metadata: { booking: { durationMinutes: 60 } } }],
    }] : [{ id: "var_test", sku: "SERVICE", calculated_price: { calculated_amount: 50, original_amount: 50, currency_code: "eur" }, product }] }))
    const result = await repriceCart("cart_test", { resolve: () => ({ graph }) } as any)
    expect(result.items[0].requires_shipping).toBe(expected)
    const run = jest.mocked(updateLineItemInCartWorkflow).mock.results[0].value.run as jest.Mock
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ input: expect.objectContaining({ item_id: "line_test", update: expect.objectContaining({ requires_shipping: expected }) }) }))
  })
})

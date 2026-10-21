jest.mock("@medusajs/medusa/core-flows", () => ({
  updateLineItemInCartWorkflow: jest.fn(() => ({ run: jest.fn() })),
  updateCartWorkflow: jest.fn(() => ({ run: jest.fn() })),
  refreshPaymentCollectionForCartWorkflow: jest.fn(() => ({ run: jest.fn() })),
}))

import { updateCartWorkflow } from "@medusajs/medusa/core-flows"
import { repriceCart, POST } from "../route"

/**
 * Ownership gate (SECURITY FIX C3/F3): cart.customer_id se musí přesně rovnat
 * ověřenému zákazníkovi. Cizí ani guest (null) košík nesmí být přeceněn.
 */
const scopeWithCart = (customerId: string | null) => ({
  resolve: () => ({
    graph: jest.fn(async ({ entity }: any) => ({
      data: entity === "cart"
        ? [{ id: "cart_synthetic", customer_id: customerId, currency_code: "eur", region_id: "region_synthetic", metadata: {}, items: [] }]
        : [],
    })),
  }),
}) as any

describe("repriceCart ownership gate", () => {
  const originalFetch = global.fetch
  const originalEnv = { ...process.env }
  beforeEach(() => {
    global.fetch = jest.fn() as any
    process.env.NEXUS_PRICING_URL = "https://nexus.test/api/nexus/pricing"
    process.env.NEXUS_PRICING_API_KEY = "synthetic-service-key"
    process.env.NEXUS_TENANT_ID = "anastasia"
  })
  afterEach(() => { global.fetch = originalFetch; process.env = { ...originalEnv }; jest.clearAllMocks() })

  it.each([
    ["cizí zákazník", "cust_other"],
    ["guest košík (null)", null],
  ])("odmítne %s s CART_ACCESS_DENIED bez jakékoli mutace", async (_label, cartCustomerId) => {
    await expect(repriceCart("cart_synthetic", scopeWithCart(cartCustomerId as any), true, undefined, "cust_owner"))
      .rejects.toThrow("CART_ACCESS_DENIED")
    expect(global.fetch).not.toHaveBeenCalled()
    expect(updateCartWorkflow).not.toHaveBeenCalled()
  })

  it("vynechání expectedCustomerId ownership přeskočí (interní volající)", async () => {
    // Prázdný košík projde ownership i cenotvorbou bez volání NEXUSu.
    const result = await repriceCart("cart_synthetic", scopeWithCart("cust_any"), false)
    expect(result.items).toEqual([])
    expect(global.fetch).not.toHaveBeenCalled()
  })
})

describe("POST /store/nexus-cart auth", () => {
  const res = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() }) as any

  it("vrátí 401 bez přihlášené zákazník a nesáhne na scope", async () => {
    const scope = { resolve: jest.fn(() => { throw new Error("scope must not be touched") }) }
    const r = res()
    await POST({ body: { cart_id: "cart_synthetic" }, scope, auth_context: undefined } as any, r)
    expect(r.status).toHaveBeenCalledWith(401)
    expect(r.json).toHaveBeenCalledWith({ ok: false, error: "UNAUTHORIZED" })
    expect(scope.resolve).not.toHaveBeenCalled()
  })

  it("vrátí 403, když ověřená zákazník míří na cizí košík", async () => {
    const r = res()
    await POST({ body: { cart_id: "cart_synthetic" }, scope: scopeWithCart("cust_other"), auth_context: { actor_type: "customer", actor_id: "cust_owner" } } as any, r)
    expect(r.status).toHaveBeenCalledWith(403)
    expect(r.json).toHaveBeenCalledWith({ ok: false, error: "CART_ACCESS_DENIED" })
  })
})

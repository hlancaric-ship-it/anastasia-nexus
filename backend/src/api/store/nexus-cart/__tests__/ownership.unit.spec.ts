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
const scopeWithCart = (customerId: string | null, hasAccount: boolean | null = true) => ({
  resolve: () => ({
    graph: jest.fn(async ({ entity }: any) => ({
      data: entity === "cart"
        ? [{ id: "cart_synthetic", customer_id: customerId, customer: customerId ? { has_account: hasAccount } : null, currency_code: "eur", region_id: "region_synthetic", metadata: {}, items: [] }]
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

  it("host (bez prihlásenia) smie prepočítať košík bez účtu", async () => {
    const r = res()
    await POST({ body: { cart_id: "cart_synthetic" }, scope: scopeWithCart(null), auth_context: undefined } as any, r)
    // prístup prešiel (ďalej by bez NEXUS konfigurácie nasledovala 503, nie 401/403)
    expect(r.status).not.toHaveBeenCalledWith(401)
    expect(r.status).not.toHaveBeenCalledWith(403)
  })

  it("host smie košík s hosťovským zákazníkom z e-mailu (has_account=false)", async () => {
    const r = res()
    await POST({ body: { cart_id: "cart_synthetic" }, scope: scopeWithCart("cust_guest", false), auth_context: undefined } as any, r)
    // prístup prešiel (ďalej by bez NEXUS konfigurácie nasledovala 503, nie 401/403)
    expect(r.status).not.toHaveBeenCalledWith(401)
    expect(r.status).not.toHaveBeenCalledWith(403)
  })

  it("host nesmie košík registrovaného účtu", async () => {
    const r = res()
    await POST({ body: { cart_id: "cart_synthetic" }, scope: scopeWithCart("cust_owner", true), auth_context: undefined } as any, r)
    expect(r.status).toHaveBeenCalledWith(403)
    expect(r.json).toHaveBeenCalledWith({ ok: false, error: "CART_ACCESS_DENIED" })
  })

  it("vrátí 403, když ověřený zákazník míří na cizí košík", async () => {
    const r = res()
    await POST({ body: { cart_id: "cart_synthetic" }, scope: scopeWithCart("cust_other"), auth_context: { actor_type: "customer", actor_id: "cust_owner" } } as any, r)
    expect(r.status).toHaveBeenCalledWith(403)
    expect(r.json).toHaveBeenCalledWith({ ok: false, error: "CART_ACCESS_DENIED" })
  })
})

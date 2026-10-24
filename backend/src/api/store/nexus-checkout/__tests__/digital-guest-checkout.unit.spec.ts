import { grantEntitlementsForOrder } from "../../../../modules/entitlement/order-sync"
import { isEntitlementProduct } from "../../../../modules/entitlement/policy"

/**
 * Digitálny produkt sa dá kúpiť aj bez registrácie (Medusa priradí hosťovského zákazníka z e-mailu).
 *  - objednávka úplne bez zákazníka nedostane žiadny prístup,
 *  - hosťovský nákup dostane prístup, pri existujúcom účte s rovnakým e-mailom ho dostane účet,
 *  - prístup sa udeľuje len produktu s dopravným profilom typu „digital“.
 */

const paidOrder = (customer_id: string | null, extra: Record<string, unknown> = {}) => ({
  ...extra,
  id: "order_1",
  status: "completed",
  total: 168,
  customer_id,
  items: [{ id: "item_1", product_id: "prod_digital", variant_id: "var_1" }],
  payment_collections: [{ captured_amount: 168, refunded_amount: 0, payments: [{ captured_at: "2026-10-20T10:00:00.000Z" }] }],
})

const makeContainer = (order: unknown, accounts: unknown[] = []) => {
  const query = {
    graph: jest.fn(async ({ entity }: any) => {
      if (entity === "order") return { data: [order] }
      if (entity === "customer") return { data: accounts }
      if (entity === "product") {
        return { data: [{ id: "prod_digital", metadata: {}, shipping_profile: { type: "digital" } }] }
      }
      return { data: [] }
    }),
  }
  const entitlements = { grant: jest.fn(async () => ({ entitlement: { id: "ent_1" }, created: true })) }
  const logger = { warn: jest.fn(), info: jest.fn(), error: jest.fn() }
  const container = { resolve: (key: string) => (key === "query" ? query : key === "logger" ? logger : entitlements) }
  return { container: container as any, entitlements, logger }
}

beforeEach(() => jest.clearAllMocks())

describe("Digitálny produkt a nákup bez registrácie", () => {
  it("objednávka bez zákazníka nezíska prístup", async () => {
    const { container, entitlements, logger } = makeContainer(paidOrder(null))
    const summary = await grantEntitlementsForOrder(container, "order_1")
    expect(summary.granted).toEqual([])
    expect(summary.skipped).toBe("NO_CUSTOMER")
    expect(entitlements.grant).not.toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalled()
  })

  it("prihlásený zákazník prístup dostane", async () => {
    const { container, entitlements } = makeContainer(paidOrder("cust_owner"))
    const summary = await grantEntitlementsForOrder(container, "order_1")
    expect(summary.granted).toEqual(["ent_1"])
    expect(entitlements.grant).toHaveBeenCalledWith(expect.objectContaining({
      customer_id: "cust_owner",
      product_id: "prod_digital",
      source: "order",
    }))
  })

  it("hosťovský nákup dostane prístup na hosťovského zákazníka", async () => {
    const { container, entitlements } = makeContainer(paidOrder("cust_guest", { email: "host@example.test", customer: { has_account: false } }))
    await grantEntitlementsForOrder(container, "order_1")
    expect(entitlements.grant).toHaveBeenCalledWith(expect.objectContaining({ customer_id: "cust_guest" }))
  })

  it("hosťovský nákup s e-mailom existujúceho účtu pripíše prístup účtu", async () => {
    const { container, entitlements } = makeContainer(
      paidOrder("cust_guest", { email: "Ucet@Example.test", customer: { has_account: false } }),
      [{ id: "cust_account", email: "ucet@example.test", has_account: true }],
    )
    await grantEntitlementsForOrder(container, "order_1")
    expect(entitlements.grant).toHaveBeenCalledWith(expect.objectContaining({ customer_id: "cust_account" }))
  })

  it("prístup sa udeľuje len digitálnemu produktu", () => {
    expect(isEntitlementProduct({ id: "p", shipping_profile: { type: "digital" } })).toBe(true)
    expect(isEntitlementProduct({ id: "p", shipping_profile: { type: "default" } })).toBe(false)
    expect(isEntitlementProduct({ id: "p", shipping_profile: null })).toBe(false)
  })
})

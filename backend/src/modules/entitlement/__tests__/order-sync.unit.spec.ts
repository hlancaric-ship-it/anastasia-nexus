import { grantEntitlementsForOrder, revokeEntitlementsForRefund } from "../order-sync"

function makeContainer(order: any, products: any[]) {
  const store = new Map<string, any>()
  const entitlements = {
    grant: jest.fn(async (input: any) => {
      const existing = store.get(input.dedupe_key)
      if (existing) return { entitlement: existing, created: false }
      const created = { id: `ent_${store.size + 1}`, ...input }
      store.set(input.dedupe_key, created)
      return { entitlement: created, created: true }
    }),
    revokeByOrder: jest.fn(async () => 1),
  }
  const query = {
    graph: jest.fn(async ({ entity }: any) => ({ data: entity === "order" ? (order ? [order] : []) : products })),
  }
  const logger = { warn: jest.fn(), info: jest.fn(), error: jest.fn() }
  const container: any = {
    resolve: (key: string) => (key === "entitlement" ? entitlements : key === "query" ? query : logger),
  }
  return { container, entitlements }
}

const paidOrder = {
  id: "o1", status: "pending", total: 38, customer_id: "cus_1",
  items: [{ id: "i1", product_id: "p_ep001", variant_id: "v1" }, { id: "i2", product_id: "p_phys", variant_id: "v2" }],
  payment_collections: [{ captured_amount: 38, refunded_amount: 0 }],
}
const products = [
  { id: "p_ep001", metadata: { digital: true }, shipping_profile: { type: "digital" } },
  { id: "p_phys", metadata: {}, shipping_profile: { type: "default" } },
]

describe("grantEntitlementsForOrder", () => {
  it("zaplacená objednávka zpřístupní jen digitální produkt a je idempotentní", async () => {
    const { container, entitlements } = makeContainer(paidOrder, products)
    const first = await grantEntitlementsForOrder(container, "o1")
    const second = await grantEntitlementsForOrder(container, "o1")
    expect(first.granted).toHaveLength(1)
    expect(second.granted).toHaveLength(0)
    expect(second.existing).toHaveLength(1)
    expect(entitlements.grant.mock.calls[0][0].product_id).toBe("p_ep001")
  })

  it("nezaplacená objednávka nic nezpřístupní", async () => {
    const unpaid = { ...paidOrder, payment_collections: [{ captured_amount: 0, payments: [{ captured_at: null }] }] }
    const { container, entitlements } = makeContainer(unpaid, products)
    const result = await grantEntitlementsForOrder(container, "o1")
    expect(result.skipped).toBe("NOT_PAID")
    expect(entitlements.grant).not.toHaveBeenCalled()
  })

  it("hostovská objednávka bez customer_id se přeskočí", async () => {
    const { container, entitlements } = makeContainer({ ...paidOrder, customer_id: null }, products)
    expect((await grantEntitlementsForOrder(container, "o1")).skipped).toBe("NO_CUSTOMER")
    expect(entitlements.grant).not.toHaveBeenCalled()
  })

  it("neexistující objednávka", async () => {
    const { container } = makeContainer(null, products)
    expect((await grantEntitlementsForOrder(container, "x")).skipped).toBe("ORDER_NOT_FOUND")
  })
})

describe("revokeEntitlementsForRefund", () => {
  it("zruší jen při plném refundu", async () => {
    const partial = makeContainer({ ...paidOrder, payment_collections: [{ captured_amount: 38, refunded_amount: 5 }] }, products)
    expect(await revokeEntitlementsForRefund(partial.container, "o1")).toBe(0)
    const full = makeContainer({ ...paidOrder, payment_collections: [{ captured_amount: 38, refunded_amount: 38 }] }, products)
    expect(await revokeEntitlementsForRefund(full.container, "o1")).toBe(1)
  })
})

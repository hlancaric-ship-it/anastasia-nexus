import { syntheticBuyer, associateCart } from "./customer-fixtures"

/** Actual Medusa authentication and ownership; no middleware or database mocks. */
export async function verifyCartOwnership({ api, container, options, region, countOrders, evidence }: any) {
  const owner = await syntheticBuyer(container, options, "cart-owner@example.test")
  const other = await syntheticBuyer(container, options, "cart-other@example.test")
  const created = await api.post("/store/carts", { region_id: region.id }, options)
  expect(created.status).toBe(200)
  const id = created.data.cart.id
  const beforeOrders = await countOrders()
  const snapshot = async () => {
    const { data } = await container.resolve("query").graph({ entity: "cart", fields: ["id", "customer_id", "metadata", "completed_at", "items.id", "items.unit_price"], filters: { id } })
    return data[0]
  }
  for (const path of ["/store/nexus-cart", "/store/nexus-checkout"]) {
    expect((await api.post(path, { cart_id: id }, options)).status).toBe(401)
    const guest = await api.post(path, { cart_id: id }, owner.options)
    expect([guest.status, guest.data.error]).toEqual([403, "CART_ACCESS_DENIED"])
  }
  await associateCart(api, id, owner.options)
  const before = await snapshot()
  for (const path of ["/store/nexus-cart", "/store/nexus-checkout"]) {
    const foreign = await api.post(path, { cart_id: id, couponCode: "ATTACKER" }, other.options)
    expect([foreign.status, foreign.data.error]).toEqual([403, "CART_ACCESS_DENIED"])
    expect(await snapshot()).toEqual(before)
  }
  expect((await api.post("/store/nexus-cart", { cart_id: id }, owner.options)).status).toBe(200)
  expect(await countOrders()).toBe(beforeOrders)
  evidence.push({ scenario: "SECURITY_CART_OWNERSHIP", status: "PASS", anonymous: 401, foreign: 403, guest: 403, ownPricing: 200, orderDelta: 0 })
}

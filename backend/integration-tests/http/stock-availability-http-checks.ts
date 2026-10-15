import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import type { IInventoryService, IOrderModuleService } from "@medusajs/framework/types"
import { cancelOrderWorkflow, createProductsWorkflow, createStockLocationsWorkflow, linkSalesChannelsToStockLocationWorkflow } from "@medusajs/medusa/core-flows"
import { acceptCheckoutConsent } from "./legal-fixtures"

/** Real Medusa/PostgreSQL checks; called serially by the synthetic CI runner. */
export async function verifyStockAvailability({ api, container, options, channel, region, profile, evidence }: any) {
  const inventory: IInventoryService = container.resolve(Modules.INVENTORY)
  const orders: IOrderModuleService = container.resolve(Modules.ORDER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { result: locations } = await createStockLocationsWorkflow(container).run({ input: {
    locations: [{ name: "Synthetic stock checkout" }, { name: "Synthetic unrelated stock" }],
  } })
  const [location, unrelated] = locations
  await linkSalesChannelsToStockLocationWorkflow(container).run({ input: { id: location.id, add: [channel.id] } })
  // The second location deliberately has no link to this shop's sales channel.
  const items = await inventory.createInventoryItems([
    { sku: "STOCK-LAST-UNIT", title: "Synthetic last unit" },
    { sku: "STOCK-EMPTY", title: "Synthetic empty stock" },
  ])
  await inventory.createInventoryLevels(items.flatMap((item, index) => [
    { inventory_item_id: item.id, location_id: location.id, stocked_quantity: index === 0 ? 1 : 0 },
    { inventory_item_id: item.id, location_id: unrelated.id, stocked_quantity: 100 },
  ]))
  const { result: products } = await createProductsWorkflow(container).run({ input: { products: items.map((item, index) => ({
    title: `Synthetic stock ${index}`, handle: `synthetic-stock-${index}`, status: "published",
    shipping_profile_id: profile.id, sales_channels: [{ id: channel.id }],
    options: [{ title: "Default", values: ["Default"] }],
    variants: [{ title: "Default", sku: `STOCK-VARIANT-${index}`, manage_inventory: true, allow_backorder: false,
      inventory_items: [{ inventory_item_id: item.id, required_quantity: 1 }],
      options: { Default: "Default" }, prices: [{ amount: 50, currency_code: "eur" }] }],
  })) } })
  const success = async (request: Promise<any>) => {
    const response = await request
    expect(response.status).toBe(200)
    return response.data
  }
  const record = (name: string) => evidence.push({ scenario: `C3_STOCK_${name}`, status: "PASS" })
  const availability = async (index: number, expected: number) => {
    const data = await success(api.get(`/store/products/${products[index].id}?fields=%2Bvariants.inventory_quantity`, options))
    const variant = data.product.variants.find((entry: any) => entry.id === products[index].variants[0].id)
    expect(variant.manage_inventory).toBe(true)
    expect(variant.allow_backorder).toBe(false)
    expect(variant.inventory_quantity).toBe(expected)
  }
  const stock = () => inventory.retrieveInventoryLevelByItemAndLocation(items[0].id, location.id)
  const reservations = () => inventory.listReservationItems({ inventory_item_id: items[0].id })
  const countOrders = async () => (await orders.listAndCountOrders({}, { take: 1 }))[1]
  const createCart = async () => (await success(api.post("/store/carts", {
    region_id: region.id, sales_channel_id: channel.id, email: "stock-checkout@example.test",
    shipping_address: { first_name: "Synthetic", last_name: "Stock", address_1: "Synthetic 1", city: "Bratislava", postal_code: "81101", country_code: "sk" },
  }, options))).cart.id
  const prepareCart = async () => {
    const id = await createCart()
    await success(api.post(`/store/carts/${id}/line-items`, { variant_id: products[0].variants[0].id, quantity: 1 }, options))
    await success(api.post("/store/nexus-cart", { cart_id: id }, options))
    const shipping = await success(api.get(`/store/shipping-options?cart_id=${id}`, options))
    const option = shipping.shipping_options.find((entry: any) => entry.shipping_profile_id === profile.id)
    expect(option).toBeDefined()
    await success(api.post(`/store/carts/${id}/shipping-methods`, { option_id: option.id }, options))
    const collection = await success(api.post("/store/payment-collections", { cart_id: id }, options))
    await success(api.post(`/store/payment-collections/${collection.payment_collection.id}/payment-sessions`, { provider_id: "pp_system_default" }, options))
    await acceptCheckoutConsent(api, id, options)
    return id
  }
  const assertInventoryRejection = (response: any) => {
    // Native Medusa uses 400 for inventory errors; do not accept an unrelated
    // consent, pricing, payment, SafeOrder or transport failure as stock proof.
    expect(response.status).toBe(400)
    expect(response.data.order).toBeUndefined()
    const message = response.data.error?.message ?? response.data.error ?? response.data.message
    expect(message).toMatch(/required inventory|not enough stock|insufficient inventory/i)
  }

  await availability(0, 1)
  await availability(1, 0)
  const list = await success(api.get(`/store/products?id[]=${products[0].id}&id[]=${products[1].id}&fields=%2Bvariants.inventory_quantity`, options))
  for (let index = 0; index < products.length; index++) {
    expect(list.products.find((entry: any) => entry.id === products[index].id)?.variants[0].inventory_quantity).toBe(index === 0 ? 1 : 0)
  }
  record("SERVER_AVAILABILITY_AND_LOCATION_ISOLATION")
  const emptyCart = await createCart()
  assertInventoryRejection(await api.post(`/store/carts/${emptyCart}/line-items`, { variant_id: products[1].variants[0].id, quantity: 1 }, options))
  record("SOLD_OUT_ADD_DENIED")

  for (const mode of ["STANDARD", "NEXUS"] as const) {
    // Both carts are prepared before reserving stock. Merely adding to a cart
    // must not hoard the last unit; checkout is the reservation boundary.
    const cartIds = [await prepareCart(), await prepareCart()]
    expect(Number((await stock()).reserved_quantity)).toBe(0)
    expect(await reservations()).toHaveLength(0)
    const before = await countOrders()
    const responses = await Promise.all(cartIds.map(id => mode === "STANDARD"
      ? api.post(`/store/carts/${id}/complete`, {}, options)
      : api.post("/store/nexus-checkout", { cart_id: id }, options)))
    const winners = responses.filter(response => response.status === 200 && response.data.order?.id)
    expect(winners).toHaveLength(1)
    const loser = responses.find(response => response !== winners[0])!
    assertInventoryRejection(loser)
    expect(await countOrders()).toBe(before + 1)
    const winner = winners[0].data.order
    const { data: persisted } = await query.graph({ entity: "order", fields: ["id", "status", "items.id", "items.variant_id"], filters: { id: winner.id } })
    expect(persisted[0].status).toBe("pending")
    expect(persisted[0].items[0].variant_id).toBe(products[0].variants[0].id)
    const held = await reservations()
    expect(held).toHaveLength(1)
    expect(held[0].line_item_id).toBe(persisted[0].items[0].id)
    expect(held[0].location_id).toBe(location.id)
    expect(Number(held[0].quantity)).toBe(1)
    expect(Number((await stock()).reserved_quantity)).toBe(1)
    expect(Number((await stock()).stocked_quantity)).toBe(1)
    await availability(0, 0)
    record(`${mode}_LAST_UNIT_RACE`)

    await cancelOrderWorkflow(container).run({ input: { order_id: winner.id } })
    expect(await reservations()).toHaveLength(0)
    expect(Number((await stock()).reserved_quantity)).toBe(0)
    expect(Number((await stock()).stocked_quantity)).toBe(1)
    await availability(0, 1)
    record(`${mode}_CANCEL_RELEASES_RESERVATION`)
  }
  // No reservation can silently spill into an unrelated warehouse.
  for (const item of items) {
    const level = await inventory.retrieveInventoryLevelByItemAndLocation(item.id, unrelated.id)
    expect(Number(level.stocked_quantity)).toBe(100)
    expect(Number(level.reserved_quantity)).toBe(0)
  }
}

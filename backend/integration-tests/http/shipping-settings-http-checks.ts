import { createProductsWorkflow } from "@medusajs/medusa/core-flows"

/**
 * C-3 doprava: kurýr z bootstrapu (DB, upravitelný v adminu) a doprava zdarma od částky
 * (`ANASTASIA_FREE_SHIPPING_FROM_EUR`, runner nastavuje syntetických 100 EUR) jako nativní
 * pravidlo ceny `item_total >= hranice`. Ověřuje hranici, přepočet při změně košíku a že
 * klient cenu dopravy nepřepíše. Dokončení objednávky tu není – to pokrývají ostatní scénáře.
 */
export async function verifyShippingSettings({ api, container, options, channel, region, evidence }: any) {
  const query = container.resolve("query")
  const threshold = Number(process.env.ANASTASIA_FREE_SHIPPING_FROM_EUR)
  expect(threshold).toBe(100)
  const { data: profiles } = await query.graph({ entity: "shipping_profile", fields: ["id"], filters: { type: "default" } })
  expect(profiles).toHaveLength(1)
  const { result: products } = await createProductsWorkflow(container).run({ input: { products: [{
    title: "Synthetic shipping goods", handle: "synthetic-shipping-goods", status: "published", shipping_profile_id: profiles[0].id,
    sales_channels: [{ id: channel.id }], options: [{ title: "Default", values: ["Default"] }],
    variants: [{ title: "Default", sku: "SYNTHETIC-SHIPPING-50", manage_inventory: false, options: { Default: "Default" }, prices: [{ amount: 50, currency_code: "eur" }] }],
  }] } })
  const variantId = products[0].variants[0].id
  const ok = async (request: Promise<any>) => {
    const response = await request
    expect(response.status).toBe(200)
    return response.data
  }
  const record = (name: string) => evidence.push({ scenario: `C3_SHIPPING_${name}`, status: "PASS" })

  const { cart } = await ok(api.post("/store/carts", {
    region_id: region.id, sales_channel_id: channel.id, email: "shipping@example.test",
    shipping_address: { first_name: "Synthetic", last_name: "Shipping", address_1: "Synthetic 1", city: "Bratislava", postal_code: "81101", country_code: "sk" },
  }, options))
  const added = await ok(api.post(`/store/carts/${cart.id}/line-items`, { variant_id: variantId, quantity: 1 }, options))
  const lineId = added.cart.items.find((item: any) => item.variant_id === variantId).id
  const courierFor = async () => {
    const data = await ok(api.get(`/store/shipping-options?cart_id=${cart.id}`, options))
    const courier = data.shipping_options.find((option: any) => option.name === "Kuriér (zásielka)")
    expect(courier).toBeDefined()
    // Fyzický košík nesmí dostat digitální "bez dopravy" jako levnější únik.
    expect(data.shipping_options.some((option: any) => option.name === "Digitálny produkt (bez dopravy)")).toBe(false)
    return courier
  }
  const methodAmount = async () => {
    const data = await ok(api.get(`/store/carts/${cart.id}`, options))
    expect(data.cart.shipping_methods).toHaveLength(1)
    return { amount: Number(data.cart.shipping_methods[0].amount), itemTotal: Number(data.cart.item_total) }
  }
  const setQuantity = (quantity: number) => ok(api.post(`/store/carts/${cart.id}/line-items/${lineId}`, { quantity }, options))

  const below = await courierFor()
  expect(Number(below.amount)).toBe(6)
  record("COURIER_PRICE_FROM_DB")

  // Klient nemá jak cenu dopravy určit: přidaná pole se buď odmítnou, nebo ignorují.
  const forged = await api.post(`/store/carts/${cart.id}/shipping-methods`, { option_id: below.id, amount: 0, data: { amount: 0 } }, options)
  if (forged.status !== 200) {
    expect(forged.status).toBe(400)
    await ok(api.post(`/store/carts/${cart.id}/shipping-methods`, { option_id: below.id }, options))
  }
  expect(await methodAmount()).toEqual({ amount: 6, itemTotal: 50 })
  record("CLIENT_CANNOT_SET_SHIPPING_PRICE")

  // Hranice je včetně: přesně 100 EUR = doprava zdarma, a už vybraná doprava se přepočítá.
  await setQuantity(2)
  expect(await methodAmount()).toEqual({ amount: 0, itemTotal: 100 })
  expect(Number((await courierFor()).amount)).toBe(0)
  record("FREE_FROM_THRESHOLD_INCLUSIVE")

  await setQuantity(1)
  expect(await methodAmount()).toEqual({ amount: 6, itemTotal: 50 })
  record("BELOW_THRESHOLD_PAYS_AGAIN")
}

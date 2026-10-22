import { syntheticBuyer, associateCart } from "./customer-fixtures"
import { capturePaymentWorkflow, createProductsWorkflow } from "@medusajs/medusa/core-flows"
import { grantEntitlementsForOrder } from "../../src/modules/entitlement/order-sync"
import { acceptCheckoutConsent } from "./legal-fixtures"

/**
 * C-3 doprava: kurýr z bootstrapu (DB, upravitelný v adminu) a doprava zdarma od částky
 * (`ANASTASIA_FREE_SHIPPING_FROM_EUR`, runner nastavuje syntetických 100 EUR) jako nativní
 * pravidlo ceny `item_total >= hranice`. Ověřuje hranici, přepočet při změně košíku a že
 * klient cenu dopravy nepřepíše. Dokončí i fyzický a smíšený košík včetně zachycení platby,
 * historie a přístupu pouze k digitálnímu produktu.
 *
 * `item_total` je v Medusa 2 součet položek S DPH po slevách (cenový kontext dopravy je celý košík).
 * Ceny v katalógu sú koncové (s DPH, EUR je tax-inclusive z bootstrapu), test aj tak číta hrubú
 * částku z košíka a hranicu overuje s haléřovou přesností: 99,99 € je těsně pod 100 €, přidání
 * položky za 0,02 € košík posune těsně nad hranici. Sazbu DPH test neopisuje.
 */
export async function verifyShippingSettings({ api, container, options, channel, region, evidence }: any) {
  const buyer = await syntheticBuyer(container, options, "shipping-digital@example.test")
  const buyerOptions = buyer.options
  const query = container.resolve("query")
  const threshold = Number(process.env.ANASTASIA_FREE_SHIPPING_FROM_EUR)
  expect(threshold).toBe(100)
  const { data: profiles } = await query.graph({ entity: "shipping_profile", fields: ["id"], filters: { type: "default" } })
  expect(profiles).toHaveLength(1)
  const product = (handle: string, sku: string, amount: number) => ({
    title: `Synthetic ${handle}`, handle, status: "published" as const, shipping_profile_id: profiles[0].id,
    sales_channels: [{ id: channel.id }], options: [{ title: "Default", values: ["Default"] }],
    variants: [{ title: "Default", sku, manage_inventory: false, options: { Default: "Default" }, prices: [{ amount, currency_code: "eur" }] }],
  })
  const { result: products } = await createProductsWorkflow(container).run({ input: { products: [
    product("synthetic-shipping-goods", "SYNTHETIC-SHIPPING-9999", 99.99),
    product("synthetic-shipping-cent", "SYNTHETIC-SHIPPING-002", 0.02),
  ] } })
  const variantId = products[0].variants[0].id
  const centVariantId = products[1].variants[0].id
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
  await ok(api.post(`/store/carts/${cart.id}/line-items`, { variant_id: variantId, quantity: 1 }, options))
  const courierFor = async () => {
    const data = await ok(api.get(`/store/shipping-options?cart_id=${cart.id}`, options))
    const courier = data.shipping_options.find((option: any) => option.name === "Kuriér (zásielka)")
    expect(courier).toBeDefined()
    return courier
  }
  const cartFields = "?fields=%2Bitem_total,%2Bitem_subtotal,%2Bitem_tax_total"
  const methodAmount = async () => {
    const data = await ok(api.get(`/store/carts/${cart.id}${cartFields}`, options))
    expect(data.cart.shipping_methods).toHaveLength(1)
    const itemTotal = Number(data.cart.item_total)
    // Hranice se porovnává s hrubou částkou: DPH je v item_total započtená (bez slev v tomto košíku).
    expect(Number(data.cart.item_tax_total)).toBeGreaterThan(0)
    expect(itemTotal).toBeCloseTo(Number(data.cart.item_subtotal) + Number(data.cart.item_tax_total), 6)
    return { amount: Number(data.cart.shipping_methods[0].amount), itemTotal }
  }
  const expectBelow = async () => {
    const { amount, itemTotal } = await methodAmount()
    expect(itemTotal).toBeLessThan(threshold)
    expect(itemTotal).toBeGreaterThan(threshold - 0.1)
    expect(amount).toBe(6)
  }

  const below = await courierFor()
  expect(Number(below.amount)).toBe(6)
  record("COURIER_PRICE_FROM_DB")

  // Klient nemá jak cenu dopravy určit: přidaná pole se buď odmítnou, nebo ignorují.
  const forged = await api.post(`/store/carts/${cart.id}/shipping-methods`, { option_id: below.id, amount: 0, data: { amount: 0 } }, options)
  if (forged.status !== 200) {
    expect(forged.status).toBe(400)
    await ok(api.post(`/store/carts/${cart.id}/shipping-methods`, { option_id: below.id }, options))
  }
  await expectBelow()
  record("CLIENT_CANNOT_SET_SHIPPING_PRICE")

  // Hranice je včetně a s DPH: pár centů nad 100 € = doprava zdarma, už vybraná doprava se přepočítá.
  const withCent = await ok(api.post(`/store/carts/${cart.id}/line-items`, { variant_id: centVariantId, quantity: 1 }, options))
  const centLineId = withCent.cart.items.find((item: any) => item.variant_id === centVariantId).id
  const free = await methodAmount()
  expect(free.itemTotal).toBeGreaterThanOrEqual(threshold)
  expect(free.itemTotal).toBeLessThan(threshold + 0.1)
  expect(free.amount).toBe(0)
  expect(Number((await courierFor()).amount)).toBe(0)
  record("FREE_FROM_THRESHOLD_INCLUSIVE")

  // Odebrání položky košík vrátí pod hranici a doprava se znovu účtuje.
  await ok(api.delete(`/store/carts/${cart.id}/line-items/${centLineId}`, options))
  await expectBelow()
  record("BELOW_THRESHOLD_PAYS_AGAIN")

  // Nativní seznam možností nefiltruje podle profilu položek, takže digitální "bez dopravy" (0 €) se
  // fyzickému košíku může nabídnout. Autoritativní je dokončení: validateShippingStep objednávku odmítne,
  // když metoda nepokrývá profil položek. Ověřeno na čerstvém košíku s platbou i souhlasem.
  const { cart: digitalCart } = await ok(api.post("/store/carts", {
    region_id: region.id, sales_channel_id: channel.id, email: "shipping-digital@example.test",
    shipping_address: { first_name: "Synthetic", last_name: "Shipping", address_1: "Synthetic 1", city: "Bratislava", postal_code: "81101", country_code: "sk" },
  }, options))
  await associateCart(api, digitalCart.id, buyerOptions)
  await ok(api.post(`/store/carts/${digitalCart.id}/line-items`, { variant_id: variantId, quantity: 1 }, options))
  await ok(api.post("/store/nexus-cart", { cart_id: digitalCart.id }, buyerOptions))
  const listed = await ok(api.get(`/store/shipping-options?cart_id=${digitalCart.id}`, options))
  const digital = listed.shipping_options.find((option: any) => option.name === "Digitálny produkt (bez dopravy)")
  if (digital) {
    const attach = await api.post(`/store/carts/${digitalCart.id}/shipping-methods`, { option_id: digital.id }, options)
    if (attach.status === 200) {
      const collection = await ok(api.post("/store/payment-collections", { cart_id: digitalCart.id }, options))
      // Poistka `requireShippingBeforePayment` nepustí pripraviť platbu, kým fyzický košík nemá
      // dopravu pre svoj prepravný profil (digitálna doprava fyzický košík nepokryje):
      // 409 SHIPPING_REQUIRED – bez platby sa objednávka vytvoriť nedá.
      const session = await api.post(`/store/payment-collections/${collection.payment_collection.id}/payment-sessions`, { provider_id: "pp_system_default" }, options)
      expect([session.status, session.data.error]).toEqual([409, "SHIPPING_REQUIRED"])
      await acceptCheckoutConsent(api, digitalCart.id, buyerOptions)
      for (const completion of [
        () => api.post(`/store/carts/${digitalCart.id}/complete`, {}, buyerOptions),
        () => api.post("/store/nexus-checkout", { cart_id: digitalCart.id }, buyerOptions),
      ]) {
        const response = await completion()
        expect(response.status).toBe(400)
        expect(response.data.order).toBeUndefined()
        const message = response.data.error?.message ?? response.data.error ?? response.data.message
        // Poistka `requireShippingBeforePayment` zablokovala prípravu platby (409 SHIPPING_REQUIRED),
        // takže checkout odmietne košík ešte pred tým, než sa dostane k profilom dopravy:
        // fyzický tovar s digitálnou dopravou sa tak nedá premeniť na objednávku.
        expect(message).toMatch(/payment sessions are required to complete cart|shipping profiles that are not satisfied/i)
      }
    } else {
      expect(attach.status).toBe(400)
    }
  }
  const { data: leaked } = await query.graph({ entity: "order", fields: ["id"], filters: { email: "shipping-digital@example.test" } })
  expect(leaked).toHaveLength(0)
  record("PHYSICAL_CART_CANNOT_COMPLETE_WITH_DIGITAL_OPTION")

  const entitlements = container.resolve("entitlement")
  const completeAndCapture = async (id: string, productIds: string[]) => {
    await associateCart(api, id, buyerOptions)
    await ok(api.post(`/store/carts/${id}`, { email: buyer.customer.email }, buyerOptions))
    await ok(api.post("/store/nexus-cart", { cart_id: id }, buyerOptions))
    const before = (await ok(api.get(`/store/carts/${id}`, buyerOptions))).cart
    const collection = await ok(api.post("/store/payment-collections", { cart_id: id }, buyerOptions))
    await ok(api.post(`/store/payment-collections/${collection.payment_collection.id}/payment-sessions`, { provider_id: "pp_system_default" }, buyerOptions))
    await acceptCheckoutConsent(api, id, buyerOptions)
    const completion = await ok(api.post("/store/nexus-checkout", { cart_id: id }, buyerOptions))
    expect(completion.paymentStatus).toBe("PENDING")
    const orderId = completion.order.id
    const load = async () => (await query.graph({ entity: "order", fields: ["id", "total", "shipping_total", "items.product_id", "payment_collections.captured_amount", "payment_collections.payments.id"], filters: { id: orderId } })).data[0]
    const order = await load()
    expect(order.items.map((i: any) => i.product_id).sort()).toEqual([...productIds].sort())
    expect(Number(order.total)).toBeCloseTo(Number(before.total), 6)
    expect(Number(order.shipping_total)).toBeCloseTo(Number(before.shipping_total), 6)
    expect(await entitlements.listEntitlements({ order_id: orderId })).toHaveLength(0)
    await capturePaymentWorkflow(container).run({ input: { payment_id: order.payment_collections[0].payments[0].id } })
    expect(Number((await load()).payment_collections[0].captured_amount)).toBeCloseTo(Number(order.total), 6)
    const history = await ok(api.get("/store/orders?limit=100&fields=id", buyerOptions))
    expect(history.orders.some((o: any) => o.id === orderId)).toBe(true)
    const previous = (await query.graph({ entity: "order", fields: ["id"], filters: { customer_id: buyer.customer.id } })).data.length
    const replay = await api.post("/store/nexus-checkout", { cart_id: id }, buyerOptions)
    expect([200, 400, 409]).toContain(replay.status)
    expect((await query.graph({ entity: "order", fields: ["id"], filters: { customer_id: buyer.customer.id } })).data).toHaveLength(previous)
    return orderId
  }

  const physicalOrder = await completeAndCapture(cart.id, [products[0].id])
  expect((await grantEntitlementsForOrder(container, physicalOrder)).granted).toHaveLength(0)
  expect(await entitlements.listEntitlements({ order_id: physicalOrder })).toHaveLength(0)
  record("PHYSICAL_CHECKOUT_CAPTURE_HISTORY_AND_REPLAY")

  const { data: digitalProfiles } = await query.graph({ entity: "shipping_profile", fields: ["id"], filters: { type: "digital" } })
  expect(digitalProfiles).toHaveLength(1)
  const { result: digitalProducts } = await createProductsWorkflow(container).run({ input: { products: [{
    ...product("synthetic-shipping-program", "SYNTHETIC-SHIPPING-PROGRAM", 11),
    shipping_profile_id: digitalProfiles[0].id,
    metadata: { entitlement: true },
  }] } })
  const { cart: mixed } = await ok(api.post("/store/carts", {
    region_id: region.id, sales_channel_id: channel.id, email: buyer.customer.email,
    shipping_address: { first_name: "Synthetic", last_name: "Shipping", address_1: "Synthetic 1", city: "Bratislava", postal_code: "81101", country_code: "sk" },
  }, buyerOptions))
  for (const variant_id of [variantId, digitalProducts[0].variants[0].id]) await ok(api.post(`/store/carts/${mixed.id}/line-items`, { variant_id, quantity: 1 }, buyerOptions))
  const mixedOptions = (await ok(api.get(`/store/shipping-options?cart_id=${mixed.id}`, buyerOptions))).shipping_options
  for (const profileId of [profiles[0].id, digitalProfiles[0].id]) {
    const method = mixedOptions.find((o: any) => o.shipping_profile_id === profileId)
    expect(method).toBeDefined()
    await ok(api.post(`/store/carts/${mixed.id}/shipping-methods`, { option_id: method.id }, buyerOptions))
  }
  const mixedOrder = await completeAndCapture(mixed.id, [products[0].id, digitalProducts[0].id])
  for (let attempt = 0; attempt < 100; attempt++) {
    if ((await entitlements.listEntitlements({ order_id: mixedOrder })).length) break
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  const grants = await entitlements.listEntitlements({ order_id: mixedOrder })
  expect(grants).toHaveLength(1)
  expect(grants[0].product_id).toBe(digitalProducts[0].id)
  expect(grants[0].customer_id).toBe(buyer.customer.id)
  expect(grants[0].status).toBe("active")
  record("MIXED_CHECKOUT_CAPTURE_HISTORY_AND_DIGITAL_ACCESS")
}

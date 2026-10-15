const baseUrl = new URL(process.env.MEDUSA_BASE_URL || "http://127.0.0.1:9000")
const publishableKey = process.env.MEDUSA_TEST_PUBLISHABLE_KEY

if (!publishableKey) throw new Error("MEDUSA_TEST_PUBLISHABLE_KEY is required")
if (!["localhost", "127.0.0.1", "::1"].includes(baseUrl.hostname)) {
  throw new Error("This E2E script only allows a local Medusa server")
}

async function request(path, { method = "GET", body } = {}) {
  const response = await fetch(new URL(path, baseUrl), {
    method,
    headers: {
      "content-type": "application/json",
      "x-publishable-api-key": publishableKey,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const payload = await response.json()
  if (!response.ok) {
    throw new Error(`${method} ${path} returned ${response.status}: ${JSON.stringify(payload)}`)
  }
  return payload
}

const { regions } = await request("/store/regions")
const region = regions.find((entry) => entry.currency_code === "eur")
if (!region) throw new Error("No EUR region is configured")

const productsUrl = new URL("/store/products", baseUrl)
productsUrl.searchParams.set("region_id", region.id)
productsUrl.searchParams.set("limit", "100")
productsUrl.searchParams.set("fields", "+variants.calculated_price,+variants.sku")
const productsResponse = await request(`${productsUrl.pathname}${productsUrl.search}`)
const variant = productsResponse.products.flatMap((product) => product.variants || []).find((entry) =>
  entry.id && entry.sku && entry.calculated_price?.currency_code === "eur" &&
  Number.isFinite(Number(entry.calculated_price.calculated_amount))
)
if (!variant) throw new Error("No EUR product variant with a calculated Medusa price was found")

const { cart } = await request("/store/carts", { method: "POST", body: { region_id: region.id } })
await request(`/store/carts/${cart.id}/line-items`, {
  method: "POST",
  body: { variant_id: variant.id, quantity: 2 },
})

const firstPrice = await request("/store/nexus-cart", {
  method: "POST",
  body: { cart_id: cart.id, unit_price: 0, discount: 100, tenantId: "attacker" },
})
if (firstPrice.tenantId === "attacker" || firstPrice.items.some((item) => item.unit_price === 0)) {
  throw new Error("Client supplied tenant or price data overrode the server-side NEXUS result")
}
const repeatedPrice = await request("/store/nexus-cart", { method: "POST", body: { cart_id: cart.id } })
if (firstPrice.pricesChanged || repeatedPrice.pricesChanged) {
  throw new Error("The initial NEXUS price changed on a repeated calculation; restart this E2E with a fresh cart")
}
if (JSON.stringify(firstPrice.items) !== JSON.stringify(repeatedPrice.items)) {
  throw new Error("Repeated NEXUS calculation returned different prices")
}

const shippingResponse = await request(`/store/shipping-options?cart_id=${encodeURIComponent(cart.id)}`)
const shippingOption = shippingResponse.shipping_options?.[0]
if (!shippingOption) throw new Error("No shipping option is available for the test cart")
await request(`/store/carts/${cart.id}/shipping-methods`, {
  method: "POST",
  body: { option_id: shippingOption.id },
})

const { payment_collection: collection } = await request("/store/payment-collections", {
  method: "POST",
  body: { cart_id: cart.id },
})
const { payment_providers: providers } = await request(`/store/payment-providers?region_id=${encodeURIComponent(region.id)}`)
if (!providers.some((provider) => provider.id === "pp_system_default")) {
  throw new Error("The local pp_system_default test provider is not enabled for this region")
}
await request(`/store/payment-collections/${collection.id}/payment-sessions`, {
  method: "POST",
  body: { provider_id: "pp_system_default" },
})

const { cart: beforeCheckout } = await request(`/store/carts/${cart.id}?fields=%2Bpayment_collection.%2Bpayment_sessions`)
const checkout = await request("/store/nexus-checkout", { method: "POST", body: { cart_id: cart.id } })
if (checkout.paymentStatus === "PAID") throw new Error("A local system-default payment must not be reported as captured")

const orderUrl = new URL(`/store/orders/${checkout.order.id}`, baseUrl)
orderUrl.searchParams.set("fields", "id,total,items.variant_sku,items.quantity,items.unit_price,items.metadata")
const { order } = await request(`${orderUrl.pathname}${orderUrl.search}`)
const expectedLines = new Map(firstPrice.items.map((item) => [item.sku, item]))
const orderLines = order.items || []
if (orderLines.length !== expectedLines.size) throw new Error("Persisted order line count differs from NEXUS pricing lines")
for (const line of orderLines) {
  const expected = expectedLines.get(line.variant_sku)
  if (!expected || Number(line.quantity) !== expected.quantity || Number(line.unit_price) !== expected.unit_price) {
    throw new Error(`Persisted order line for ${line.variant_sku} differs from the NEXUS price snapshot`)
  }
  if (line.metadata?.nexus_tenant_id !== firstPrice.tenantId) {
    throw new Error(`Persisted order line for ${line.variant_sku} is missing its server-selected NEXUS tenant`)
  }
}
if (Number(order.total) !== Number(beforeCheckout.total)) {
  throw new Error(`Order total ${order.total} differs from checkout cart total ${beforeCheckout.total}`)
}

console.log(JSON.stringify({
  result: "PASS",
  product: variant.sku,
  currency: region.currency_code,
  orderId: order.id,
  itemPrices: orderLines.map(({ quantity, unit_price }) => ({ quantity, unit_price })),
  orderTotal: order.total,
  paymentStatus: checkout.paymentStatus,
  provider: "pp_system_default (local test provider; no real charge)",
}))

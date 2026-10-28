import { ContainerRegistrationKeys, generateJwtToken, Modules } from "@medusajs/framework/utils"
import { capturePaymentWorkflow, cancelOrderWorkflow, refundPaymentWorkflow } from "@medusajs/medusa/core-flows"
import { grantEntitlementsForOrder, revokeEntitlementsForRefund } from "../../src/modules/entitlement/order-sync"
import { verifyMediaToken } from "../../src/modules/entitlement/media/token"

/** Real HTTP/DB/payment lifecycle; synthetic identities and local payment provider only. */
export async function verifyDigitalCheckout({ api, container, options, newCart, product, evidence }: any) {
  const customers = await container.resolve(Modules.CUSTOMER).createCustomers([
    { email: "digital-owner@example.test" }, { email: "digital-other@example.test" },
  ])
  const auth = customers.map((c: any) => ({ Authorization: `Bearer ${generateJwtToken({ actor_id: c.id, actor_type: "customer", auth_identity_id: `synthetic-${c.id}`, app_metadata: { customer_id: c.id, session_epoch: 0 } }, { secret: process.env.JWT_SECRET!, expiresIn: "1h" })}` }))
  const opts = auth.map((headers: any) => ({ ...options, headers: { ...options.headers, ...headers } }))
  const mediaKey = "synthetic-reset/lesson-01.m3u8"
  await container.resolve(Modules.PRODUCT).updateProducts(product.id, { metadata: { booking: null, entitlement: true, protected_media: [{ key: mediaKey }] } })
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const entitlements = container.resolve("entitlement")
  const entries = (orderId: string) => entitlements.listEntitlements({ order_id: orderId })
  const media = (who = 0, body: any = {}) => api.post("/store/media-access", { product_id: product.id, media_key: mediaKey, ...body }, opts[who])
  const record = (scenario: string) => evidence.push({ scenario: `C8_${scenario}`, status: "PASS", provider: "pp_system_default" })
  const waitFor = async (check: () => Promise<boolean>) => {
    for (let i = 0; i < 100; i++) {
      if (await check()) return
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    throw new Error("DIGITAL_LIFECYCLE_TIMEOUT")
  }
  expect((await api.get("/store/entitlements", options)).status).toBe(401)
  expect((await api.post("/store/media-access", { product_id: product.id, media_key: mediaKey }, options)).status).toBe(401)
  record("AUTH_REQUIRED")
  const empty = await api.get("/store/entitlements", opts[0])
  expect(empty.status).toBe(200)
  expect(empty.data.entitlements).toHaveLength(0)
  expect((await media()).status).toBe(403)
  record("NO_PURCHASE_NO_ACCESS")

  const cartId = await newCart(50, false, undefined, auth[0])
  const completion = await api.post("/store/nexus-checkout", { cart_id: cartId }, opts[0])
  expect(completion.status).toBe(200)
  expect(completion.data.paymentStatus).toBe("PENDING")
  const orderId = completion.data.order.id
  expect((await grantEntitlementsForOrder(container, orderId)).skipped).toBe("NOT_PAID")
  expect(await entries(orderId)).toHaveLength(0)
  expect((await media()).status).toBe(403)
  record("UNPAID_ORDER_NO_ACCESS")

  const { data: orders } = await query.graph({ entity: "order", fields: ["id", "total", "payment_collections.payments.id"], filters: { id: orderId } })
  const paymentId = orders[0].payment_collections[0].payments[0].id
  const total = Number(orders[0].total)
  await capturePaymentWorkflow(container).run({ input: { payment_id: paymentId } })
  await waitFor(async () => (await entries(orderId)).some((e: any) => e.status === "active"))
  const granted = await entries(orderId)
  expect(granted).toHaveLength(1)
  expect(granted[0].customer_id).toBe(customers[0].id)
  expect(granted[0].product_id).toBe(product.id)
  record("CAPTURE_GRANTS_ONCE")

  const library = await api.get("/store/entitlements", opts[0])
  expect(library.status).toBe(200)
  expect(library.data.entitlements).toHaveLength(1)
  expect(library.data.entitlements[0].order_id).toBe(orderId)
  record("OWNER_LIBRARY")
  const foreign = await api.get(`/store/entitlements?customer_id=${customers[0].id}`, opts[1])
  expect(foreign.status).toBe(200)
  expect(foreign.data.entitlements).toHaveLength(0)
  record("LIBRARY_CUSTOMER_ISOLATION")
  expect((await media(1, { customer_id: customers[0].id })).status).toBe(403)
  record("MEDIA_CUSTOMER_ISOLATION")
  expect((await media(0, { media_key: "another-product/private.m3u8" })).status).toBe(403)
  record("MEDIA_KEY_ISOLATION")
  const access = await media()
  expect(access.status).toBe(200)
  expect(access.headers["cache-control"]).toBe("no-store")
  const token = new URL(access.data.url).searchParams.get("t")!
  const verified = verifyMediaToken(process.env.MEDIA_TOKEN_SECRET!, token, mediaKey)
  expect(verified.ok).toBe(true)
  if (!verified.ok) throw new Error("MEDIA_SIGNATURE_INVALID")
  expect(verified.payload.c).toBe(customers[0].id)
  expect(verified.payload.p).toBe(product.id)
  expect(Date.parse(access.data.expires_at) - Date.now()).toBeLessThanOrEqual(900000)
  expect(Date.parse(access.data.expires_at)).toBeGreaterThan(Date.now())
  record("SIGNED_ACCESS_ISSUED")
  expect(verifyMediaToken(process.env.MEDIA_TOKEN_SECRET!, token, mediaKey, new Date(Date.parse(access.data.expires_at) + 1000)).ok).toBe(false)
  expect(verifyMediaToken(process.env.MEDIA_TOKEN_SECRET!, token + "x", mediaKey).ok).toBe(false)
  record("SIGNATURE_AND_EXPIRY")
  await Promise.all([grantEntitlementsForOrder(container, orderId), grantEntitlementsForOrder(container, orderId)])
  expect(await entries(orderId)).toHaveLength(1)
  record("GRANT_REPLAY_IDEMPOTENT")

  await refundPaymentWorkflow(container).run({ input: { payment_id: paymentId, amount: 10 } })
  expect(await revokeEntitlementsForRefund(container, orderId)).toBe(0)
  expect((await entries(orderId))[0].status).toBe("active")
  expect((await media()).status).toBe(200)
  record("PARTIAL_REFUND_PRESERVES_ACCESS")
  await refundPaymentWorkflow(container).run({ input: { payment_id: paymentId, amount: total - 10 } })
  await waitFor(async () => (await entries(orderId))[0]?.status === "revoked")
  expect((await media()).status).toBe(403)
  await grantEntitlementsForOrder(container, orderId)
  expect((await entries(orderId))[0].status).toBe("revoked")
  record("FULL_REFUND_REVOKES_ACCESS")

  const secondCart = await newCart(50, false, undefined, auth[0])
  const second = await api.post(`/store/carts/${secondCart}/complete`, {}, opts[0])
  expect(second.status).toBe(200)
  const secondId = second.data.order.id
  const { data: secondOrders } = await query.graph({ entity: "order", fields: ["payment_collections.payments.id"], filters: { id: secondId } })
  await capturePaymentWorkflow(container).run({ input: { payment_id: secondOrders[0].payment_collections[0].payments[0].id } })
  await waitFor(async () => (await entries(secondId))[0]?.status === "active")
  await cancelOrderWorkflow(container).run({ input: { order_id: secondId } })
  await waitFor(async () => (await entries(secondId))[0]?.status === "revoked")
  expect((await api.get("/store/entitlements", opts[0])).data.entitlements).toHaveLength(0)
  expect((await media()).status).toBe(403)
  record("STANDARD_CHECKOUT_CANCEL_REVOKES_ACCESS")
}

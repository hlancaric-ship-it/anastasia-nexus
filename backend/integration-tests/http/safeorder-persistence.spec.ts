import { verifyMedusaDelivery } from "./medusa-delivery-http-checks"
import { verifyNotificationReceipts } from "./notification-receipts-http-checks"
import { verifyOrderEmailSource, verifyOrderEmailRecovery } from "./order-email-recovery-http-checks"
import { verifyCartOwnership } from "./cart-ownership-http-checks"
import { syntheticBuyer, associateCart } from "./customer-fixtures"
import { verifyAuthSecurity } from "./auth-security-http-checks"
import { verifyCouponSecurity } from "./coupon-security-http-checks"
import { verifyBookingHttp } from "./booking-http-checks"
import { verifyGiftVoucherHttp } from "./gift-voucher-http-checks"
import { verifyDigitalCheckout } from "./digital-checkout-checks"
import { verifyEntitlementIsolation } from "./entitlement-isolation-http-checks"
import { verifyOpsObservability } from "./ops-observability-checks"
import { verifyLegalConsents } from "./legal-consents-http-checks"
import { verifyCustomerGdpr } from "./customer-gdpr-http-checks"
import { verifyOrderSelfCancel } from "./order-self-cancel-http-checks"
import { verifyStockAvailability } from "./stock-availability-http-checks"
import { verifyShippingSettings } from "./shipping-settings-http-checks"
import { acceptCheckoutConsent } from "./legal-fixtures"
import { existsSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { Server } from "node:net"
import { Client } from "pg"
import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { asValue } from "@medusajs/framework/awilix"
import type { IPromotionModuleService } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createProductsWorkflow } from "@medusajs/medusa/core-flows"
import bootstrap, { API_KEY_TITLE, SALES_CHANNEL_NAME, DIGITAL_PROFILE_NAME } from "../../src/scripts/anastasia-bootstrap"

jest.setTimeout(600_000)
const root = process.env.WAVE1_SYNTHETIC_ROOT
const workerBase = process.env.WAVE1_WORKER_BASE
if (!root || !existsSync(resolve(root, "synthetic-only.marker")) || !workerBase?.startsWith("http://127.0.0.1:") || process.env.DB_HOST !== "localhost" || process.env.DB_USERNAME !== "wave1_synthetic" || process.env.DB_TEMP_NAME !== "anastasia_dev_wave1") {
  throw new Error("Run only through scripts/verify-safeorder-local.py in its private synthetic cluster")
}
// The installed Medusa test runner listens without a host. Constrain its real
// HTTP server to loopback; no routes, workflows, modules or DB calls are mocked.
const originalListen = Server.prototype.listen
Server.prototype.listen = function (...args: any[]) {
  if (typeof args[0] === "number" && (args.length === 1 || typeof args[1] === "function")) args.splice(1, 0, "127.0.0.1")
  return (originalListen as any).apply(this, args)
} as any

medusaIntegrationTestRunner({
  dbName: "anastasia_dev_wave1",
  hooks: {
    beforeServerStart: async () => {
      const client = new Client({ host: "127.0.0.1", port: Number(process.env.DB_PORT), user: "wave1_synthetic", database: "postgres" })
      await client.connect()
      try {
        const { rows } = await client.query("SELECT current_setting('data_directory') AS directory")
        if (resolve(rows[0].directory) !== resolve(process.env.WAVE1_PG_DATA!)) throw new Error("Refusing any cluster outside the newly created synthetic directory")
      } finally { await client.end() }
    },
  },
  testSuite: ({ api, getContainer, dbConnection }) => {
    afterAll(() => { Server.prototype.listen = originalListen })
    it("both real HTTP completion paths fail closed without persisted orders, then ALLOW persists verified totals", async () => {
      const container = getContainer()
      const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
      // Existing bootstrap logs a publishable token; suppress its logger during
      // synthetic seeding so neither tokens nor customer information enter logs.
      container.register({ [ContainerRegistrationKeys.LOGGER]: asValue({ info() {}, warn() {}, error() {}, debug() {}, log() {} }) })
      try { await bootstrap({ container }) } finally { container.register({ [ContainerRegistrationKeys.LOGGER]: asValue(logger) }) }
      const query: any = container.resolve(ContainerRegistrationKeys.QUERY)
      const entity = async (name: string, filters: any, fields: string[]) => (await query.graph({ entity: name, filters, fields })).data[0]
      const key = await entity("api_key", { title: API_KEY_TITLE }, ["token"])
      const channel = await entity("sales_channel", { name: SALES_CHANNEL_NAME }, ["id"])
      const profile = await entity("shipping_profile", { name: DIGITAL_PROFILE_NAME }, ["id"])
      const region = await entity("region", { name: "Slovensko" }, ["id"])
      const { result: products } = await createProductsWorkflow(container).run({ input: { products: [50, 400].map((amount) => ({
        title: `Synthetic P0 ${amount}`, handle: `synthetic-p0-${amount}`, status: "published", shipping_profile_id: profile.id,
        sales_channels: [{ id: channel.id }], options: [{ title: "Default", values: ["Default"] }],
        variants: [{ title: "Default", sku: `SYNTHETIC-P0-${amount}`, manage_inventory: false, options: { Default: "Default" }, prices: [{ amount, currency_code: "eur" }] }],
      })) } })
      const headers = { "x-publishable-api-key": key.token }
      const options = { headers, validateStatus: () => true }
      const success = async (path: string, body: unknown, requestOptions = options) => {
        const response = await api.post(path, body, requestOptions)
        expect(response.status).toBeLessThan(300)
        return response.data
      }
      const countOrders = async () => Number((await dbConnection.raw('SELECT count(*) AS count FROM "order"')).rows[0].count)
      const buyer = await syntheticBuyer(container, options, "synthetic@example.test")
      const disposableBuyer = await syntheticBuyer(container, options, "synthetic@tempmail.com")
      const cartOptions = new Map<string, typeof options>()
      const newCart = async (amount: 50 | 400, disposable = false, couponCode?: string, customerHeaders?: Record<string, string>) => {
        const ownedOptions = customerHeaders ? { ...options, headers: { ...headers, ...customerHeaders } } : (disposable ? disposableBuyer : buyer).options
        const createdResponse = await api.post("/store/carts", { region_id: region.id, email: disposable ? "synthetic@tempmail.com" : "synthetic@example.test", shipping_address: { first_name: "Synthetic", last_name: "Test", address_1: "Synthetic 1", city: "Bratislava", postal_code: "81101", country_code: "sk" } }, ownedOptions)
        expect(createdResponse.status).toBe(200)
        const id = createdResponse.data.cart.id
        cartOptions.set(id, ownedOptions)
        await associateCart(api, id, ownedOptions)
        await acceptCheckoutConsent(api, id, ownedOptions)
        const product = products.find((p) => p.handle === `synthetic-p0-${amount}`)!
        await success(`/store/carts/${id}/line-items`, { variant_id: product.variants[0].id, quantity: 1 })
        await success("/store/nexus-cart", { cart_id: id, couponCode, unit_price: 0.01, tenantId: "attacker" }, ownedOptions)
        const shipping = await api.get(`/store/shipping-options?cart_id=${id}`, options)
        expect(shipping.status).toBe(200)
        const option = shipping.data.shipping_options.find((item: any) => item.shipping_profile_id === profile.id) || shipping.data.shipping_options[0]
        expect(option).toBeDefined()
        await success(`/store/carts/${id}/shipping-methods`, { option_id: option.id })
        const collection = await success("/store/payment-collections", { cart_id: id })
        await success(`/store/payment-collections/${collection.payment_collection.id}/payment-sessions`, { provider_id: "pp_system_default" })
        return id
      }
      const control = async (mode: string) => {
        const response = await fetch(`${workerBase}/synthetic-control`, { method: "POST", body: JSON.stringify({ mode }) })
        expect(response.status).toBe(200)
      }
      const evidence: any[] = []
      await verifyCartOwnership({ api, container, options, region, countOrders, evidence })
      const giftVoucherOnly = process.env.WAVE1_GIFT_VOUCHER_ONLY === "1"
      const endpoints = process.env.WAVE1_BOOKING_ONLY === "1" || giftVoucherOnly ? [] : ["standard", "custom"] as const
      for (const endpoint of endpoints) {
        for (const scenario of ["unauthorized", "unavailable", "malformed", "REVIEW", "BLOCK", "pricing-redirect", "pricing-malformed", "pricing-tenant", "pricing-change"] as const) {
          await control("normal")
          const before = await countOrders()
          const id = await newCart(scenario === "BLOCK" ? 400 : 50, ["REVIEW", "BLOCK"].includes(scenario))
          await control(["REVIEW", "BLOCK"].includes(scenario) ? "normal" : scenario)
          const path = endpoint === "standard" ? `/store/carts/${id}/complete` : "/store/nexus-checkout"
          const response = await api.post(path, endpoint === "standard" ? {} : { cart_id: id, orderSum: 0.01, paymentMethod: "stripe", customerEmail: "client-override@example.test" }, cartOptions.get(id))
          expect(response.status).toBeGreaterThanOrEqual(400)
          if (endpoint === "custom") {
            const expected = scenario === "REVIEW" ? [409, "SAFEORDER_REVIEW_REQUIRED"] : scenario === "BLOCK" ? [403, "SAFEORDER_BLOCKED"] : scenario === "pricing-redirect" ? [503, "NEXUS_PRICING_UNAVAILABLE"] : ["pricing-malformed", "pricing-tenant"].includes(scenario) ? [400, "INVALID_NEXUS_PRICE_RESPONSE"] : scenario === "pricing-change" ? [409, "PRICE_CHANGED_PAYMENT_REINITIALIZATION_REQUIRED"] : [503, "SAFEORDER_UNAVAILABLE"]
            expect(response.status).toBe(expected[0])
            expect(response.data.error).toBe(expected[1])
          }
          expect(JSON.stringify(response.data)).not.toContain("synthetic-private@example.test")
          expect(response.data.order).toBeUndefined()
          expect(await countOrders()).toBe(before)
          const { rows } = await dbConnection.raw('SELECT completed_at FROM cart WHERE id = ?', [id])
          expect(rows[0].completed_at).toBeNull()
          evidence.push({ endpoint, scenario, status: response.status, orderDelta: 0, cartCompleted: false })
          // A rejected request must stay rejected on replay. A legitimate pricing
          // change asks the client to reinitialize payment; do not replay that
          // response as a security failure (covered in the later checkout gate).
          if (scenario !== "pricing-change") {
            const replay = await api.post(path, endpoint === "standard" ? {} : { cart_id: id }, cartOptions.get(id))
            expect(replay.status).toBeGreaterThanOrEqual(400)
            expect(await countOrders()).toBe(before)
            evidence.push({ endpoint, scenario: `${scenario}-REPLAY`, status: replay.status, orderDelta: 0 })
          }
          if (scenario === "pricing-redirect") {
            expect(await (await fetch(`${workerBase}/synthetic-stats`)).json()).toEqual({ redirectRequests: 0 })
          }
        }
        await control("normal")
        const concurrentId = await newCart(400, true)
        const concurrentBefore = await countOrders()
        const concurrentPath = endpoint === "standard" ? `/store/carts/${concurrentId}/complete` : "/store/nexus-checkout"
        const concurrent = await Promise.all([0, 1].map(() => api.post(concurrentPath, endpoint === "standard" ? {} : { cart_id: concurrentId }, cartOptions.get(concurrentId))))
        expect(concurrent.every((result) => result.status >= 400)).toBe(true)
        expect(await countOrders()).toBe(concurrentBefore)
        expect((await dbConnection.raw('SELECT completed_at FROM cart WHERE id = ?', [concurrentId])).rows[0].completed_at).toBeNull()
        evidence.push({ endpoint, scenario: "CONCURRENT_BLOCK", statuses: concurrent.map((result) => result.status), orderDelta: 0, cartCompleted: false })
        await control("normal")
        const id = await newCart(50)
        const before = await countOrders()
        const cart = (await api.get(`/store/carts/${id}`, options)).data.cart
        const response = await api.post(endpoint === "standard" ? `/store/carts/${id}/complete` : "/store/nexus-checkout", endpoint === "standard" ? {} : { cart_id: id }, cartOptions.get(id))
        expect(response.status).toBe(200)
        expect(response.data.order.id).toBeDefined()
        expect(await countOrders()).toBe(before + 1)
        const persisted = await entity("order", { id: response.data.order.id }, ["id", "total", "currency_code", "items.unit_price", "items.quantity"])
        expect(persisted.currency_code).toBe("eur")
        expect(Number(persisted.total)).toBe(Number(cart.total))
        expect(Number(persisted.items[0].unit_price)).toBe(50)
        expect(Number(persisted.items[0].quantity)).toBe(1)
        evidence.push({ endpoint, scenario: "ALLOW", status: 200, orderDelta: 1, currency: "eur", total: Number(persisted.total), unitPrice: 50 })
        if (endpoint === "custom") await verifyOrderEmailSource({ container, orderId: persisted.id, evidence })
      }
      // C3: real HTTP checkouts, real PromotionModuleService and PostgreSQL.
      // Barrier only aligns arrival; no usage counters or row locks are mocked.
      const promotions = container.resolve<IPromotionModuleService>(Modules.PROMOTION)
      for (const endpoint of endpoints) {
        const code = `SYNTHETIC-C3-${endpoint}`
        const promotion = await promotions.createPromotions({ code, type: "standard", status: "active", limit: 1,
          application_method: { type: "percentage", value: 10, target_type: "items", allocation: "across" } })
        const ids = await Promise.all([newCart(50, false, code), newCart(50, false, code)])
        const before = await countOrders()
        const original = promotions.registerUsage.bind(promotions)
        let arrivals = 0
        let release!: () => void
        const ready = new Promise<void>(resolve => { release = resolve })
        const registration = jest.spyOn(promotions, "registerUsage").mockImplementation(async (actions, context) => {
          if (actions.some(action => action.code === code)) {
            if (++arrivals === 2) release()
            let timer: ReturnType<typeof setTimeout> | undefined
            try {
              await Promise.race([ready, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("C3_BARRIER_TIMEOUT")), 15000) })])
            } finally { clearTimeout(timer) }
          }
          return original(actions, context)
        })
        let responses: any[]
        try {
          responses = await Promise.all(ids.map(id => api.post(endpoint === "standard" ? `/store/carts/${id}/complete` : "/store/nexus-checkout", endpoint === "standard" ? {} : { cart_id: id }, cartOptions.get(id))))
        } finally { registration.mockRestore() }
        expect(arrivals).toBe(2)
        const winner = responses!.findIndex(response => response.status === 200)
        expect(responses!.filter(response => response.status === 200)).toHaveLength(1)
        expect(responses![1 - winner].status).toBeGreaterThanOrEqual(400)
        expect(JSON.stringify(responses![1 - winner].data)).toContain("Promotion usage exceeds the limit")
        expect(responses![1 - winner].data.order).toBeUndefined()
        expect(await countOrders()).toBe(before + 1)
        expect((await promotions.retrievePromotion(promotion.id)).used).toBe(1)
        const failed = (await dbConnection.raw('SELECT completed_at FROM cart WHERE id = ?', [ids[1 - winner]])).rows[0]
        expect(failed.completed_at).toBeNull()
        const order = await entity("order", { id: responses![winner].data.order.id }, ["id", "items.unit_price"])
        expect(Number(order.items[0].unit_price)).toBe(45)
        evidence.push({ endpoint, scenario: "C3_CONCURRENT_SINGLE_USE", statuses: responses!.map(r => r.status), orderDelta: 1, used: 1, unitPrice: 45 })
      }
      if (!giftVoucherOnly) await verifyBookingHttp({ api, container, options, newCart, product: products[0], countOrders, evidence })
      if (process.env.WAVE1_BOOKING_ONLY !== "1") await verifyGiftVoucherHttp({ api, container, options, channel, region, profile, countOrders, dbConnection, evidence })
      if (!giftVoucherOnly && process.env.WAVE1_BOOKING_ONLY !== "1") await verifyDigitalCheckout({ api, container, options, newCart, product: products[0], evidence })
      if (!giftVoucherOnly && process.env.WAVE1_BOOKING_ONLY !== "1") await verifyEntitlementIsolation({ api, container, options, evidence })
      if (!giftVoucherOnly && process.env.WAVE1_BOOKING_ONLY !== "1") await verifyLegalConsents({ api, container, options, newCart, evidence })
      if (!giftVoucherOnly && process.env.WAVE1_BOOKING_ONLY !== "1") await verifyCustomerGdpr({ api, container, options, newCart, evidence })
      if (!giftVoucherOnly && process.env.WAVE1_BOOKING_ONLY !== "1") await verifyOrderSelfCancel({ api, container, options, channel, region, profile, evidence })
      if (!giftVoucherOnly && process.env.WAVE1_BOOKING_ONLY !== "1") await verifyStockAvailability({ api, container, options, channel, region, profile, evidence })
      if (!giftVoucherOnly && process.env.WAVE1_BOOKING_ONLY !== "1") await verifyShippingSettings({ api, container, options, channel, region, evidence })
      if (!giftVoucherOnly && process.env.WAVE1_BOOKING_ONLY !== "1") {
        await verifyAuthSecurity({ api, container, evidence })
        await verifyCouponSecurity({ api, container, options, channel, region, profile, evidence })
      }
      await verifyOpsObservability({ api, container, options, evidence, bookingRan: !giftVoucherOnly })
      if (!giftVoucherOnly && process.env.WAVE1_BOOKING_ONLY !== "1") await verifyMedusaDelivery({ container, evidence })
      if (!giftVoucherOnly && process.env.WAVE1_BOOKING_ONLY !== "1") await verifyNotificationReceipts({ container, dbConnection, evidence })
      if (!giftVoucherOnly && process.env.WAVE1_BOOKING_ONLY !== "1") await verifyOrderEmailRecovery({ container, dbConnection, evidence })
      writeFileSync(resolve(root!, "medusa-persistence-evidence.json"), JSON.stringify({ status: "PASS", runtime: "Medusa 2.19 + Node Worker handler (not workerd)", scenarios: evidence }, null, 2))
    })
  },
})

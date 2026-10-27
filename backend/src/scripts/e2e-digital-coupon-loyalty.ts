import type { MedusaContainer } from "@medusajs/framework/types"
import { createServer, type IncomingMessage, type Server } from "node:http"
import { mkdir, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { ContainerRegistrationKeys, Modules, QueryContext } from "@medusajs/framework/utils"
import { capturePaymentWorkflow, completeCartWorkflow, createPaymentCollectionForCartWorkflow, createPaymentSessionsWorkflow } from "@medusajs/medusa/core-flows"
import { repriceCart } from "../api/store/nexus-cart/route"
import { issueMediaAccess } from "../modules/entitlement/media/access"
import { clearLoyaltySettings, readLoyaltySettingsFromStore, saveLoyaltySettingsToStore } from "../lib/loyalty/settings"
import { workerLoyaltyTiers, type LoyaltyTier } from "../lib/loyalty/policy"
import { applyLoyaltyAssignment, loyaltyTierGroups } from "../lib/loyalty/assignment"

/**
 * Lokálny e2e scenár: nákup digitálneho produktu s kupónom Montelope
 * a s vernostnou úrovňou zákazníka.
 *
 *   npx medusa exec ./src/scripts/e2e-digital-coupon-loyalty.ts [stub]
 *
 * Overuje:
 *   1) politika v DB (zľava úrovne) sa počíta pri cene v košíku,
 *   2) kupón Montelope (-20 € fixne) zľavuje LEN produkt EP.002 (RESET 40+),
 *      ostatné položky zľavu kupónu nedostanú,
 *   3) objednávka vznikne so správnou sumou, po zachytení platby sa udelí
 *      prístup k digitálnemu obsahu a knižnica vráti podpísaný krátkodobý odkaz.
 *
 * Argument `stub` spustí lokálnu náhradu NEXUS pricingovej služby (Worker na tejto
 * macOS verzie nespustí – workerd vyžaduje macOS 13.5+). Bez argumentu sa použije
 * skutočný Worker z NEXUS_PRICING_URL (Stripe TEST = provider `pp_stripe_stripe`).
 * Report sa zapíše do `backend/ci-evidence/e2e-digital-coupon-loyalty.json`.
 */

const COUPON_CODE = "Montelope"
const COUPON_AMOUNT = 20
const DIGITAL_SKU = "EP.002"
const OTHER_SKU = "EP.001"
const TENANT = "anastasia"

type Check = { step: string; status: "PASS" | "FAIL"; detail?: string }

const fail = (message: string): never => {
  throw new Error(message)
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks).toString("utf8")
}

/**
 * Náhrada NEXUS služieb pri lokálnom behu: pricing (cenový výpočet) a SafeOrder
 * (rizikové posúdenie). Worker na tejto macOS verzii nespustí (workerd vyžaduje
 * macOS 13.5+), preto sa v režime `stub` použijú tieto náhrady s rovnakou zmluvou.
 */
function startLocalServices(tiers: Record<string, number>): Promise<{ server: Server; pricingUrl: string; safeOrderUrl: string }> {
  const server = createServer(async (req, res) => {
    if (req.method !== "POST") {
      res.writeHead(405).end()
      return
    }
    let body: any = {}
    try { body = JSON.parse(await readBody(req)) } catch { body = {} }
    if (String(req.url ?? "").includes("safeorder")) {
      res.writeHead(200, { "content-type": "application/json" })
      res.end(JSON.stringify({
        ok: true, tenantId: TENANT, currency: "eur", orderSum: Number(body.orderSum) || 0,
        decision: "ALLOW", score: 0, factors: [],
      }))
      return
    }
    let price = Number(body.basePrice) || 0
    if (typeof body.salePrice === "number") price = Math.min(price, body.salePrice)
    const ratio = body.customerTier ? tiers[String(body.customerTier)] : undefined
    if (typeof ratio === "number" && ratio > 0) price = price * (1 - ratio)
    if (typeof body.couponDiscountPercent === "number" && body.couponDiscountPercent > 0) {
      price = price * (1 - Math.min(body.couponDiscountPercent, 1))
    }
    if (typeof body.couponFixedAmount === "number" && body.couponFixedAmount > 0) {
      price = Math.max(0, price - body.couponFixedAmount)
    }
    res.writeHead(200, { "content-type": "application/json" })
    res.end(JSON.stringify({
      ok: true,
      tenantId: TENANT,
      calculated: { finalPrice: Number(price.toFixed(2)), appliedRules: [], rejected: [] },
    }))
  })
  return new Promise((resolveStub) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      const port = typeof address === "object" && address ? address.port : 0
      resolveStub({
        server,
        pricingUrl: `http://127.0.0.1:${port}/api/nexus/pricing`,
        safeOrderUrl: `http://127.0.0.1:${port}/api/nexus/safeorder`,
      })
    })
  })
}

export default async function e2eDigitalCouponLoyalty({ container, args = [] }: { container: MedusaContainer; args?: string[] }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as any
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any
  const products = container.resolve(Modules.PRODUCT) as any
  const customers = container.resolve(Modules.CUSTOMER) as any
  const promotions = container.resolve(Modules.PROMOTION) as any
  const entitlements = container.resolve("entitlement") as any
  const checks: Check[] = []
  const step = (name: string, ok: boolean, detail?: string) => {
    checks.push({ step: name, status: ok ? "PASS" : "FAIL", ...(detail ? { detail } : {}) })
    if (!ok) fail(`${name}${detail ? `: ${detail}` : ""}`)
  }
  const report: Record<string, unknown> = {
    scenario: "Nákup digitálneho produktu s kupónom Montelope a vernostnou úrovňou",
    started_at: new Date().toISOString(),
    database: "lokálna (anastasia_dev_wave1)",
    coupon: { code: COUPON_CODE, amount_eur: COUPON_AMOUNT, restricted_to: DIGITAL_SKU },
    checks: [] as Check[],
  }

  let stub: Server | null = null
  let originalSettings: { tiers: LoyaltyTier[]; updated_by: string | null } | null = null
  try {
    // --- 1) Politika v DB (zdroj zľavy úrovne) -------------------------------
    // Scenár potrebuje známu politiku; pôvodná sa po behu obnoví (nič sa nezmení).
    const originalPolicy = await readLoyaltySettingsFromStore(container)
    originalSettings = { tiers: originalPolicy.tiers, updated_by: originalPolicy.updated_by }
    const scenarioPolicy = [
      { code: "ZR1", name: "Bronze", discount_percent: 2, spend_threshold_eur: 0, enabled: true, rank: 1 },
      { code: "ZR3", name: "Gold", discount_percent: 10, spend_threshold_eur: 500, enabled: true, rank: 2 },
    ]
    await saveLoyaltySettingsToStore(container, scenarioPolicy, "e2e-digital-coupon-loyalty")
    const settings = await readLoyaltySettingsFromStore(container)
    const tiers = workerLoyaltyTiers(settings.tiers)
    step("politika v DB načítaná", settings.tiers.length > 0, `${settings.tiers.length} úrovní`)
    report.loyalty_policy = settings.tiers

    // --- 2) Cenová služba (Worker alebo lokálna náhrada) ---------------------
    const useStub = args.includes("stub")
    if (useStub) {
      const started = await startLocalServices(tiers)
      stub = started.server
      process.env.NEXUS_PRICING_URL = started.pricingUrl
      process.env.NEXUS_SAFEORDER_URL = started.safeOrderUrl
      process.env.NEXUS_PRICING_API_KEY = "synthetic-local-pricing-key"
    }
    if (!process.env.NEXUS_PRICING_URL) fail("NEXUS_PRICING_URL nie je nastavené (spustite s `stub` pre lokálnu náhradu)")
    process.env.NEXUS_TENANT_ID = TENANT
    report.pricing = { source: useStub ? "lokálna náhrada (stub)" : process.env.NEXUS_PRICING_URL, mode: useStub ? "stub" : "worker" }

    // --- 3) Kupón Montelope (idempotentne) ------------------------------------
    const [existingCoupon] = await promotions.listPromotions({ code: COUPON_CODE }, { take: 1 })
    let couponId = existingCoupon?.id as string | undefined
    if (!couponId) {
      const { data: productRows } = await query.graph({
        entity: "product_variant",
        fields: ["id", "sku", "product.id"],
        filters: { sku: DIGITAL_SKU },
      })
      const couponProductId = (productRows ?? [])[0]?.product?.id as string | undefined
      if (!couponProductId) fail(`Produkt so SKU ${DIGITAL_SKU} sa nenašiel`)
      const [created] = await promotions.createPromotions([
        {
          code: COUPON_CODE,
          type: "standard",
          status: "active",
          is_automatic: false,
          is_tax_inclusive: true,
          application_method: {
            type: "fixed",
            target_type: "items",
            allocation: "across",
            value: COUPON_AMOUNT,
            currency_code: "eur",
            target_rules: [{ attribute: "items.product.id", operator: "in", values: [couponProductId] }],
          },
        },
      ])
      couponId = created?.id
    }
    step("kupón Montelope je aktívny", Boolean(couponId), couponId)

    // --- 4) Produkty: digitálny (EP.002) a ďalší s cenou -------------------
    const region = (await query.graph({ entity: "region", fields: ["id"], filters: { currency_code: "eur" } })).data?.[0]
    if (!region) fail("EUR región sa nenašiel")
    const { data: variants } = await query.graph({
      entity: "product_variant",
      fields: ["id", "sku", "product.id", "product.title", "calculated_price.calculated_amount", "calculated_price.currency_code"],
      filters: { sku: [DIGITAL_SKU, OTHER_SKU] },
      context: {
        calculated_price: QueryContext({ region_id: region.id, currency_code: "eur" }),
      },
    })
    const digital = (variants ?? []).find((variant: any) => variant.sku === DIGITAL_SKU)
    const other = (variants ?? []).find((variant: any) => variant.sku === OTHER_SKU)
    if (!digital) fail(`Digitálny produkt ${DIGITAL_SKU} sa nenašiel`)
    const productId = digital.product.id as string
    step("digitálny produkt EP.002 je v katalógu", Boolean(digital), digital?.product?.title)

    // --- 5) Zákazník s vernostnou úrovňou (skupina Gold) ---------------------
    const tierGroups = await loyaltyTierGroups(container)
    const gold = tierGroups.find((group) => group.code === "ZR3")
    if (!gold) fail("Skupina úrovne ZR3 (Gold) v katalógu chýba")
    const email = `e2e-loyalty-${Date.now().toString(36)}@example.test`
    const [customer] = await customers.createCustomers([{ email, first_name: "E2E", last_name: "Vernost" }])
    const customerId = customer.id
    await applyLoyaltyAssignment(container, { customerId, tierCode: "ZR3", locked: false })
    step("zákazník má vernostnú úroveň ZR3", true, gold?.name)

    // --- 6) Košík: oba produkty, kupón Montelope -----------------------------
    const digitalPrice = Number(digital.calculated_price?.calculated_amount)
    const otherPrice = Number(other?.calculated_price?.calculated_amount)
    const { data: channels } = await query.graph({ entity: "sales_channel", fields: ["id", "name"], filters: {} })
    const salesChannelId = (channels ?? [])[0]?.id
    if (!salesChannelId) fail("V obchode nie je žiadny predajný kanál")
    const [cart] = await container.resolve(Modules.CART).createCarts([
      {
        region_id: region.id,
        customer_id: customerId,
        email,
        currency_code: "eur",
        sales_channel_id: salesChannelId,
        items: [
          // Oba produkty sú digitálne (dopravný profil `digital`) – žiadna doprava.
          { variant_id: digital.id, title: digital.product?.title ?? "Digitálny produkt", quantity: 1, unit_price: digitalPrice, requires_shipping: false },
          ...(other ? [{ variant_id: other.id, title: other.product?.title ?? "Produkt", quantity: 1, unit_price: otherPrice, requires_shipping: false }] : []),
        ],
      },
    ] as never)
    // applyChanges = true: cena aj kupón sa zapíšu do košíka (tak to prebieha aj v prevádzke).
    const priced = await repriceCart(cart.id, container as never, true, COUPON_CODE, customerId)
    const digitalLine = priced.items.find((item) => item.sku === DIGITAL_SKU)
    const otherLine = priced.items.find((item) => item.sku === OTHER_SKU)
    report.prices = {
      base: { digital: digitalPrice, other: otherPrice },
      with_loyalty_and_coupon: { digital: digitalLine?.unit_price, other: otherLine?.unit_price },
    }
    const goldRatio = tiers.ZR3 ?? 0
    const expectedDigital = Number((digitalPrice * (1 - goldRatio) - COUPON_AMOUNT).toFixed(2))
    step("cena digitálneho produktu = cena - zľava úrovne - 20 € kupónu", digitalLine?.unit_price === expectedDigital, `${digitalLine?.unit_price} € (očakávané ${expectedDigital} €)`)
    if (otherLine) {
      const expectedOther = Number((otherPrice * (1 - goldRatio)).toFixed(2))
      step("ostatný produkt bez zľavy kupónu", otherLine.unit_price === expectedOther, `${otherLine.unit_price} € (očakávané ${expectedOther} €)`)
    }
    const { data: carts } = await query.graph({ entity: "cart", fields: ["id", "metadata"], filters: { id: cart.id } })
    const cartMetadata = (carts?.[0]?.metadata ?? {}) as Record<string, unknown>
    step("kupón je zapísaný v košíku", Boolean(cartMetadata.nexus_coupon), JSON.stringify(cartMetadata.nexus_coupon))

    // --- 7) Objednávka, zachytenie platby, prístup a knižnica ---------------
    // Platba: lokálne manuálny provider (dobierka/prevod) alebo Stripe TEST.
    const { data: cartsWithPayment } = await query.graph({
      entity: "cart",
      fields: ["id", "payment_collection.id"],
      filters: { id: cart.id },
    })
    let collectionId = cartsWithPayment?.[0]?.payment_collection?.id as string | undefined
    if (!collectionId) {
      await createPaymentCollectionForCartWorkflow(container).run({ input: { cart_id: cart.id } })
      const refreshed = await query.graph({ entity: "cart", fields: ["id", "payment_collection.id"], filters: { id: cart.id } })
      collectionId = refreshed.data?.[0]?.payment_collection?.id as string | undefined
    }
    if (!collectionId) fail("Platobná kolekcia košíka sa nevytvorila")
    // Súhlas s VOP a GDPR (rovnaký guard ako v prevádzke).
    const legal = container.resolve("legal") as any
    await legal.accept({
      cart_id: cart.id,
      customer_id: customerId,
      terms_version: process.env.LEGAL_TERMS_VERSION ?? "",
      privacy_version: process.env.LEGAL_PRIVACY_VERSION ?? "",
    })
    // Provider: pri digitálnom produkte je dobierka nedostupná (platí len pri kuriérovi),
    // preto sa používa prevod (ručne potvrdená platba) alebo karta (Stripe TEST).
    const providerId = (process.env.E2E_PAYMENT_PROVIDER_ID ?? "pp_bank_transfer_bank_transfer") as string
    await createPaymentSessionsWorkflow(container).run({
      input: { payment_collection_id: collectionId!, provider_id: providerId, customer_id: customerId },
    })
    const { data: promoBeforeRows } = await query.graph({ entity: "promotion", fields: ["id", "used"], filters: { id: couponId } })
    const usedBefore = Number(promoBeforeRows?.[0]?.used ?? 0)
    const order = await completeCartWorkflow(container).run({ input: { id: cart.id } })
    const orderId = (order.result as any).id
    step("objednávka vznikla", Boolean(orderId), orderId)
    const { data: orders } = await query.graph({
      entity: "order",
      fields: ["id", "total", "payment_collections.payments.id"],
      filters: { id: orderId },
    })
    const paymentId = orders?.[0]?.payment_collections?.[0]?.payments?.[0]?.id
    if (paymentId) {
      await capturePaymentWorkflow(container).run({ input: { payment_id: paymentId } })
      for (let i = 0; i < 50; i++) {
        const rows = await entitlements.listEntitlements({ order_id: orderId })
        if ((rows ?? []).some((entry: any) => entry.product_id === productId)) break
        await new Promise((r) => setTimeout(r, 100))
      }
    }
    const granted = await entitlements.listEntitlements({ order_id: orderId })
    const grantedIds = (granted ?? []).map((entry: any) => entry.product_id)
    step("po zachytení platby je prístup udelený", grantedIds.includes(productId), `prístupy: ${grantedIds.join(", ")}`)
    report.entitlements = (granted ?? []).map((entry: any) => ({ product_id: entry.product_id, status: entry.status }))

    // --- 7b) Použitie kupónu: rezervácia sa potvrdí pri order.placed -----------
    let reservation: any
    for (let i = 0; i < 50; i++) {
      const rows = await query.graph({ entity: "coupon_usage_reservation", fields: ["id", "status", "order_id"], filters: { cart_id: cart.id } })
      reservation = rows.data?.[0]
      if (reservation?.status === "confirmed" && reservation.order_id === orderId) break
      await new Promise((r) => setTimeout(r, 100))
    }
    const { data: promoAfterRows } = await query.graph({ entity: "promotion", fields: ["id", "used"], filters: { id: couponId } })
    const usedAfter = Number(promoAfterRows?.[0]?.used ?? 0)
    step("použitie kupónu sa potvrdí práve raz", reservation?.status === "confirmed" && reservation.order_id === orderId && usedAfter - usedBefore === 1, `pred ${usedBefore} → po ${usedAfter}; stav rezervácie: ${reservation?.status ?? "nenašiel sa"}`)
    report.coupon_usage = { used_before: usedBefore, used_after: usedAfter, reservation_status: reservation?.status ?? null, order_id: reservation?.order_id ?? null }

    // --- 8) Podpísaný krátkodobý odkaz na obsah ------------------------------
    const productRow = (await query.graph({ entity: "product", fields: ["id", "metadata"], filters: { id: productId } })).data?.[0]
    const mediaKey = (productRow?.metadata as any)?.protected_media?.[0]?.key as string | undefined
    if (mediaKey) {
      const access = await issueMediaAccess(
        {
          guard: entitlements,
          getProductMetadata: async (id) => (await query.graph({ entity: "product", fields: ["metadata"], filters: { id } })).data?.[0]?.metadata ?? null,
          getCustomerEmail: async () => email,
          audit: () => undefined,
          secret: process.env.MEDIA_TOKEN_SECRET ?? "",
          deliveryBaseUrl: process.env.MEDIA_DELIVERY_BASE_URL ?? "http://127.0.0.1:8787/api/media",
        },
        { customerId, productId, mediaKey },
      )
      step("odkaz na chránený obsah je podpísaný a krátkodobý", Boolean(access.url) && new Date(access.expires_at).getTime() - Date.now() <= 15 * 60 * 1000)
      report.media_access = { key: mediaKey, expires_at: access.expires_at }
    } else {
      step("chránený obsah je v registri produktu", false, "produkt nemá protected_media")
    }

    report.status = "PASS"
  } catch (error) {
    report.status = "FAIL"
    report.error = error instanceof Error ? error.message : String(error)
    logger.error("[e2e-digital-coupon-loyalty] zlyhal", error as Error)
  } finally {
    if (stub) stub.close()
    // Pôvodná politika sa obnoví (scenár nesmie zmeniť nastavenie obchodu).
    try {
      if (originalSettings?.tiers?.length) await saveLoyaltySettingsToStore(container, originalSettings.tiers, originalSettings.updated_by)
      else await clearLoyaltySettings(container)
    } catch (error) {
      logger.error("[e2e-digital-coupon-loyalty] obnovenie politiky zlyhalo", error as Error)
    }
    report.finished_at = new Date().toISOString()
    report.checks = checks
    const output = resolve("ci-evidence/e2e-digital-coupon-loyalty.json")
    await mkdir(dirname(output), { recursive: true })
    await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 })
    logger.info(`[e2e-digital-coupon-loyalty] ${report.status} – report: ${output}`)
  }
  if (report.status !== "PASS") fail(String(report.error ?? "E2E scenár zlyhal"))
}

import { generateJwtToken, Modules } from "@medusajs/framework/utils"
import { capturePaymentWorkflow, cancelOrderWorkflow, createProductsWorkflow } from "@medusajs/medusa/core-flows"
import { GIFT_VOUCHER_MODULE } from "../../src/modules/gift-voucher"
import { issueVouchersForOrder } from "../../src/modules/gift-voucher/order-sync"
import { DEFAULT_SETTINGS } from "../../src/modules/gift-voucher/policy"

/**
 * K8 dárkový poukaz – reálné HTTP + PostgreSQL scénáře. Volá je jen chráněný syntetický
 * runner (scripts/verify-safeorder-local.py). JWT jsou lokální fixtures, data syntetická.
 */
export async function verifyGiftVoucherHttp({ api, container, options, channel, region, profile, countOrders, dbConnection, evidence }: any) {
  const vouchers = container.resolve(GIFT_VOUCHER_MODULE)
  const query = container.resolve("query")
  const [admin] = await container.resolve(Modules.USER).createUsers([{ email: "gift-voucher-admin@example.test" }])
  const adminToken = generateJwtToken({ actor_id: admin.id, actor_type: "user", auth_identity_id: `synthetic-${admin.id}` }, { secret: process.env.JWT_SECRET!, expiresIn: "1h" })
  const adminOpts = { ...options, headers: { ...options.headers, Authorization: `Bearer ${adminToken}` } }
  // Vlastní zboží bez rezervace: booking scénáře mohou svůj produkt dál používat.
  const { result: [product] } = await createProductsWorkflow(container).run({ input: { products: [{
    title: "Synthetic K8 goods", handle: "synthetic-k8-goods", status: "published", shipping_profile_id: profile.id,
    sales_channels: [{ id: channel.id }], options: [{ title: "Default", values: ["Default"] }],
    variants: [{ title: "Default", sku: "SYNTHETIC-K8-GOODS", manage_inventory: false, options: { Default: "Default" }, prices: [{ amount: 50, currency_code: "eur" }] }],
  }] } })
  expect((await container.resolve(Modules.PRODUCT).retrieveProduct(product.id)).metadata?.booking).toBeFalsy()
  const ok = async (promise: Promise<any>, status = 200) => {
    const response = await promise
    if (response.status !== status) throw new Error(`HTTP ${response.status} != ${status}: ${JSON.stringify(response.data).slice(0, 400)}`)
    return response.data
  }
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bratislava" }).format(new Date())
  const poll = async <T>(fn: () => Promise<T | null | undefined>, label: string): Promise<T> => {
    for (let i = 0; i < 100; i++) {
      const value = await fn()
      if (value) return value
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    throw new Error(`GIFT_VOUCHER_POLL_TIMEOUT ${label}`)
  }
  const voucherRow = async (id: string) => (await dbConnection.raw("SELECT * FROM gift_voucher WHERE id = ?", [id])).rows[0]
  const cartRow = async (id: string) => (await dbConnection.raw("SELECT completed_at FROM cart WHERE id = ?", [id])).rows[0]

  // --- 1) Nastavení v adminu ---------------------------------------------------
  expect((await api.get("/admin/vouchers/settings", options)).status).toBe(401)
  const initial = await ok(api.get("/admin/vouchers/settings", adminOpts))
  expect(initial.settings).toMatchObject({ values: [50, 100, 200], validity_months: 12, scope_type: "all", partial_redemption: true })
  expect((await api.post("/admin/vouchers/settings", { ...DEFAULT_SETTINGS, values: [50, 50], scope_type: "all" }, adminOpts)).status).toBe(400)
  const base = { enabled: true, validity_months: 12, scope_type: "all", category_ids: [], partial_redemption: true, delivery_method: "both" }
  const saved = await ok(api.post("/admin/vouchers/settings", { ...base, values: [50, 100, 200] }, adminOpts))
  expect(saved.product.created).toBe(3)
  // Změna hodnot: 200 € zmizí, přibude 150 € (nová hodnota volby produktu + varianta).
  const changed = await ok(api.post("/admin/vouchers/settings", { ...base, values: [50, 100, 150] }, adminOpts))
  expect(changed.product).toMatchObject({ created: 1, removed: 1 })
  const voucherProduct = (await query.graph({ entity: "product", filters: { handle: "darkovy-poukaz" }, fields: ["id", "status", "variants.id", "variants.sku", "variants.metadata"] })).data[0]
  expect(voucherProduct.status).toBe("published")
  expect(voucherProduct.variants.map((v: any) => v.sku).sort()).toEqual(["GIFT-VOUCHER-10000", "GIFT-VOUCHER-15000", "GIFT-VOUCHER-5000"])
  const v50 = voucherProduct.variants.find((v: any) => v.sku === "GIFT-VOUCHER-5000").id
  evidence.push({ scenario: "K8_ADMIN_SETTINGS_PRODUCT_SYNC", statuses: [401, 400, 200, 200], variants: 3 })

  // --- helpers košíku -------------------------------------------------------
  const createCart = async (variants: Array<{ id: string; quantity?: number }>) => {
    const created = await ok(api.post("/store/carts", { region_id: region.id, email: "gv-buyer@example.test", shipping_address: { first_name: "Synthetic", last_name: "Test", address_1: "Synthetic 1", city: "Bratislava", postal_code: "81101", country_code: "sk" } }, options))
    const id = created.cart.id
    for (const variant of variants) await ok(api.post(`/store/carts/${id}/line-items`, { variant_id: variant.id, quantity: variant.quantity ?? 1 }, options))
    return id
  }
  const prepare = async (id: string) => {
    await ok(api.post("/store/nexus-cart", { cart_id: id }, options))
    const shipping = await ok(api.get(`/store/shipping-options?cart_id=${id}`, options))
    const option = shipping.shipping_options.find((item: any) => item.shipping_profile_id === profile.id) || shipping.shipping_options[0]
    await ok(api.post(`/store/carts/${id}/shipping-methods`, { option_id: option.id }, options))
  }
  const pay = async (id: string) => {
    const collection = await ok(api.post("/store/payment-collections", { cart_id: id }, options))
    await ok(api.post(`/store/payment-collections/${collection.payment_collection.id}/payment-sessions`, { provider_id: "pp_system_default" }, options))
  }
  const cartTotal = async (id: string) => Number((await ok(api.get(`/store/carts/${id}`, options))).cart.total)
  const goodsCart = async () => { const id = await createCart([{ id: product.variants[0].id }]); await prepare(id); return id }
  const issue = async (amountMinor: number, patch: Record<string, unknown> = {}) => (await vouchers.issueVoucher({
    issue_key: `synthetic:${Math.random().toString(36).slice(2)}`, amount_minor: amountMinor, order_id: "order_synthetic", variant_id: v50,
    settings: { ...DEFAULT_SETTINGS, ...patch }, recipient: null, purchaser_email: null,
  })).voucher

  // --- 2) Koupě: obdarovaný ověřený serverem, vystavení až po zaplacení, idempotence
  const buyId = await createCart([{ id: v50, quantity: 2 }])
  await prepare(buyId)
  const before = await countOrders()
  await pay(buyId)
  const missing = await api.post("/store/nexus-checkout", { cart_id: buyId }, options)
  expect([missing.status, missing.data.error]).toEqual([400, "GIFT_VOUCHER_RECIPIENT_REQUIRED"])
  expect(await countOrders()).toBe(before)
  const badRecipient = await api.post("/store/gift-vouchers/recipients", { cart_id: buyId, recipients: { [v50]: [{ name: "Jana", email: "zle", delivery_date: today }] } }, options)
  expect([badRecipient.status, badRecipient.data.error]).toEqual([400, "GIFT_VOUCHER_RECIPIENT_EMAIL_INVALID"])
  const longMessage = await api.post("/store/gift-vouchers/recipients", { cart_id: buyId, recipients: { [v50]: [{ name: "Jana", email: "jana@example.test", message: "x".repeat(301) }] } }, options)
  expect(longMessage.data.error).toBe("GIFT_VOUCHER_MESSAGE_INVALID")
  await ok(api.post("/store/gift-vouchers/recipients", { cart_id: buyId, recipients: { [v50]: [
    { name: "Jana", email: "jana@example.test", message: "Všetko najlepšie", delivery_date: today },
    { name: "Eva", email: "eva@example.test" },
  ] } }, options))
  const selfPay = await api.post("/store/gift-vouchers/apply", { cart_id: buyId, code: (await issue(5000)).code }, options)
  expect([selfPay.status, selfPay.data.error]).toEqual([400, "GIFT_VOUCHER_NOT_APPLICABLE"]) // poukaz neplatí poukaz
  const bought = await ok(api.post("/store/nexus-checkout", { cart_id: buyId }, options))
  expect(await countOrders()).toBe(before + 1)
  const orderId = bought.order.id
  const listIssued = async () => (await dbConnection.raw("SELECT id, initial_amount, balance, status, recipient_email, delivery_date, code FROM gift_voucher WHERE source_order_id = ? ORDER BY created_at", [orderId])).rows
  // Zaplaceno? Systémový provider nemusí capturovat – bez capture nesmí vzniknout žádný poukaz.
  const paidAtCompletion = bought.paymentStatus === "PAID"
  if (!paidAtCompletion) {
    await new Promise((resolve) => setTimeout(resolve, 1000))
    expect(await listIssued()).toHaveLength(0)
    const payment = (await query.graph({ entity: "order", filters: { id: orderId }, fields: ["payment_collections.payments.id"] })).data[0].payment_collections[0].payments[0]
    await capturePaymentWorkflow(container).run({ input: { payment_id: payment.id } })
  }
  const issued = await poll(async () => { const rows = await listIssued(); return rows.length === 2 ? rows : null }, "issue")
  expect(issued.map((row: any) => [Number(row.initial_amount), Number(row.balance), row.status])).toEqual([[5000, 5000, "active"], [5000, 5000, "active"]])
  expect(issued.map((row: any) => row.recipient_email).sort()).toEqual(["eva@example.test", "jana@example.test"])
  const replay = await issueVouchersForOrder(container, orderId)
  const raced = await Promise.all([issueVouchersForOrder(container, orderId), issueVouchersForOrder(container, orderId)])
  expect([replay, ...raced].every((summary) => summary.issued.length === 0 && summary.existing.length === 2)).toBe(true)
  expect(await listIssued()).toHaveLength(2)
  evidence.push({ scenario: "K8_PURCHASE_ISSUE_AFTER_PAYMENT_IDEMPOTENT", orderDelta: 1, issued: 2, replays: 3, capturedAtCompletion: paidAtCompletion })

  // --- 3) Čerpání: plné pokrytí poukazem (bez platby), čerpání atomicky v completeCart
  const fullId = await goodsCart()
  const fullTotal = await cartTotal(fullId)
  const big = await issue(Math.round(fullTotal * 100) + 2000)
  const applied = await ok(api.post("/store/gift-vouchers/apply", { cart_id: fullId, code: big.code.toLowerCase().replace(/-/g, " ") }, options))
  expect(applied.gift_voucher.amount).toBe(fullTotal)
  expect(JSON.stringify(applied)).not.toContain(big.code)
  expect(await cartTotal(fullId)).toBe(0)
  const fullBefore = await countOrders()
  const full = await ok(api.post(`/store/carts/${fullId}/complete`, {}, options))
  expect(await countOrders()).toBe(fullBefore + 1)
  expect(Number((await voucherRow(big.id)).balance)).toBe(2000)
  const fullOrderId = full.order.id
  await poll(async () => (await dbConnection.raw("SELECT 1 FROM gift_voucher_transaction WHERE voucher_id = ? AND type = 'redeemed' AND order_id = ?", [big.id, fullOrderId])).rows[0], "attach")
  evidence.push({ scenario: "K8_FULL_COVER_NO_PAYMENT", status: 200, orderDelta: 1, balanceAfter: 20 })

  // --- 4) Částečné čerpání + platba zbytku přes nexus-checkout
  const partialId = await goodsCart()
  const partialTotal = await cartTotal(partialId)
  const small = await issue(1000)
  await ok(api.post("/store/gift-vouchers/apply", { cart_id: partialId, code: small.code }, options))
  expect(await cartTotal(partialId)).toBeCloseTo(partialTotal - 10, 2)
  await pay(partialId)
  const partial = await ok(api.post("/store/nexus-checkout", { cart_id: partialId }, options))
  expect(Number(partial.order.total)).toBeCloseTo(partialTotal - 10, 2)
  expect([Number((await voucherRow(small.id)).balance), (await voucherRow(small.id)).status]).toEqual([0, "depleted"])
  evidence.push({ scenario: "K8_PARTIAL_COVER_PAID_REST", status: 200, voucherBalanceAfter: 0 })

  // --- 5) Souběh: dva košíky, jeden poukaz – projde právě jedno čerpání, zůstatek nikdy záporný
  const raceIds = [await goodsCart(), await goodsCart()]
  const raceTotal = await cartTotal(raceIds[0])
  const exact = await issue(Math.round(raceTotal * 100))
  for (const id of raceIds) await ok(api.post("/store/gift-vouchers/apply", { cart_id: id, code: exact.code }, options))
  const original = vouchers.redeem.bind(vouchers)
  let arrivals = 0
  let release!: () => void
  const ready = new Promise<void>((resolve) => { release = resolve })
  const barrier = jest.spyOn(vouchers, "redeem").mockImplementation(async (...args: any[]) => {
    if (++arrivals === 2) release()
    let timer: ReturnType<typeof setTimeout> | undefined
    try { await Promise.race([ready, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("GV_BARRIER_TIMEOUT")), 15000) })]) } finally { clearTimeout(timer) }
    return original(...args)
  })
  const raceBefore = await countOrders()
  let race: any[]
  try {
    race = await Promise.all([api.post(`/store/carts/${raceIds[0]}/complete`, {}, options), api.post("/store/nexus-checkout", { cart_id: raceIds[1] }, options)])
  } finally { barrier.mockRestore() }
  expect(arrivals).toBe(2)
  expect(race!.filter((r) => r.status === 200)).toHaveLength(1)
  const loser = race!.findIndex((r) => r.status !== 200)
  expect(race![loser].status).toBeGreaterThanOrEqual(400)
  expect(await countOrders()).toBe(raceBefore + 1)
  expect((await cartRow(raceIds[loser])).completed_at).toBeNull()
  const exactRow = await voucherRow(exact.id)
  expect([Number(exactRow.balance), exactRow.status]).toEqual([0, "depleted"])
  const active = (await dbConnection.raw("SELECT count(*)::int AS n FROM gift_voucher_transaction WHERE voucher_id = ? AND type = 'redeemed' AND reversed_at IS NULL", [exact.id])).rows[0].n
  expect(active).toBe(1)
  evidence.push({ scenario: "K8_CONCURRENT_SINGLE_BALANCE", statuses: race!.map((r) => r.status), orderDelta: 1, activeRedemptions: 1, balanceAfter: 0 })

  // --- 6) Neplatné poukazy: prošlý, zneplatněný adminem, neexistující
  const expired = await issue(1000)
  await dbConnection.raw("UPDATE gift_voucher SET issued_at = now() - interval '13 months', expires_at = now() - interval '1 minute' WHERE id = ?", [expired.id])
  const probeId = await goodsCart()
  const expiredResponse = await api.post("/store/gift-vouchers/apply", { cart_id: probeId, code: expired.code }, options)
  expect([expiredResponse.status, expiredResponse.data.error]).toEqual([400, "GIFT_VOUCHER_EXPIRED"])
  const toVoid = await issue(1000)
  expect((await api.post(`/admin/vouchers/${toVoid.id}/void`, { reason: "test" }, options)).status).toBe(401)
  expect((await api.post(`/admin/vouchers/${toVoid.id}/void`, {}, adminOpts)).status).toBe(400)
  await ok(api.post(`/admin/vouchers/${toVoid.id}/void`, { reason: "syntetické zneplatnenie" }, adminOpts))
  const voidResponse = await api.post("/store/gift-vouchers/apply", { cart_id: probeId, code: toVoid.code }, options)
  const unknown = await api.post("/store/gift-vouchers/apply", { cart_id: probeId, code: "GV-AAAA-BBBB-CCCC-DDDD" }, options)
  expect([voidResponse.status, voidResponse.data.error, unknown.status, unknown.data.error]).toEqual([400, "GIFT_VOUCHER_INVALID", 400, "GIFT_VOUCHER_INVALID"])
  evidence.push({ scenario: "K8_INVALID_EXPIRED_VOID_UNKNOWN", statuses: [expiredResponse.status, voidResponse.status, unknown.status] })

  // --- 7) Poukaz zneplatněný mezi uplatněním a checkoutem: objednávka nevznikne, nic se nečerpá
  const lateId = await goodsCart()
  const late = await issue(Math.round((await cartTotal(lateId)) * 100))
  await ok(api.post("/store/gift-vouchers/apply", { cart_id: lateId, code: late.code }, options))
  await vouchers.voidVoucher({ id: late.id, reason: "synthetic" })
  const lateBefore = await countOrders()
  const lateResponse = await api.post("/store/nexus-checkout", { cart_id: lateId }, options)
  expect(lateResponse.status).toBeGreaterThanOrEqual(400)
  expect(await countOrders()).toBe(lateBefore)
  expect((await cartRow(lateId)).completed_at).toBeNull()
  evidence.push({ scenario: "K8_VOIDED_BEFORE_CHECKOUT", status: lateResponse.status, orderDelta: 0 })

  // --- 8) Vratka na poukaz (admin) – idempotentní, strop = čerpaná částka
  const refundBody = { order_id: fullOrderId, amount: 5, idempotency_key: "synthetic-refund-1" }
  expect((await api.post("/admin/vouchers/refund", refundBody, options)).status).toBe(401)
  const refund = await ok(api.post("/admin/vouchers/refund", refundBody, adminOpts))
  expect(refund.refunds).toEqual([{ voucher_id: big.id, amount: 5, balance: 25 }])
  expect((await ok(api.post("/admin/vouchers/refund", refundBody, adminOpts))).replayed).toBe(true)
  expect((await api.post("/admin/vouchers/refund", { ...refundBody, amount: 100000, idempotency_key: "synthetic-refund-2" }, adminOpts)).status).toBe(409)
  expect(Number((await voucherRow(big.id)).balance)).toBe(2500)
  evidence.push({ scenario: "K8_ADMIN_REFUND_TO_VOUCHER", balanceAfter: 25, replayed: true })

  // --- 9) Jednorázový poukaz: zbytek propadne; storno objednávky vrátí vše
  const single = await issue(Math.round((await cartTotal(probeId)) * 100) + 3000, { partial_redemption: false })
  await ok(api.post("/store/gift-vouchers/apply", { cart_id: probeId, code: single.code }, options))
  const singleOrder = await ok(api.post(`/store/carts/${probeId}/complete`, {}, options))
  expect([Number((await voucherRow(single.id)).balance), (await voucherRow(single.id)).status]).toEqual([0, "depleted"])
  await poll(async () => (await dbConnection.raw("SELECT 1 FROM gift_voucher_transaction WHERE voucher_id = ? AND type = 'redeemed' AND order_id IS NOT NULL", [single.id])).rows[0], "attach-single")
  await cancelOrderWorkflow(container).run({ input: { order_id: singleOrder.order.id } })
  const restored = await poll(async () => { const row = await voucherRow(single.id); return Number(row.balance) === Number(row.initial_amount) ? row : null }, "cancel-refund")
  expect(restored.status).toBe("active")
  evidence.push({ scenario: "K8_SINGLE_USE_FORFEIT_AND_CANCEL_RESTORE", balanceRestored: Number(restored.balance) / 100 })

  // --- 10) Admin přehled maskuje kódy
  expect((await api.get("/admin/vouchers", options)).status).toBe(401)
  const list = await ok(api.get("/admin/vouchers?limit=100", adminOpts))
  expect(list.count).toBeGreaterThanOrEqual(8)
  const serialized = JSON.stringify(list)
  for (const voucher of [big, small, exact, single]) expect(serialized).not.toContain(voucher.code)
  expect(list.vouchers.find((v: any) => v.id === toVoid.id)).toMatchObject({ status: "void", balance: 0 })
  evidence.push({ scenario: "K8_ADMIN_LIST_MASKED", count: list.count })

  expect((await api.get(`/admin/vouchers/${single.id}/transactions`, options)).status).toBe(401)
  const history = await ok(api.get(`/admin/vouchers/${single.id}/transactions?limit=100`, adminOpts))
  expect(history.voucher_id).toBe(single.id)
  expect(history.currency_code).toBe("eur")
  const { rows: [redeemed] } = await dbConnection.raw("SELECT amount FROM gift_voucher_transaction WHERE voucher_id = ? AND type = 'redeemed'", [single.id])
  expect(history.transactions.some((tx: any) => tx.type === "redeemed" && tx.amount === Number(redeemed.amount) / 100)).toBe(true)
  expect(history.transactions.some((tx: any) => tx.type === "refunded")).toBe(true)
  expect(history.transactions.every((tx: any) => !("note" in tx) && !("metadata" in tx) && !("idempotency_key" in tx))).toBe(true)
  expect(JSON.stringify(history)).not.toContain(single.code)
  evidence.push({ scenario: "K8_ADMIN_TRANSACTION_HISTORY", count: history.count })

  // Shared database limiter: HTTP middleware and real concurrent PostgreSQL upserts.
  await dbConnection.raw("DELETE FROM gift_voucher_rate_limit")
  const attempts = await Promise.all(Array.from({ length: 25 }, () => api.post("/store/gift-vouchers/apply", { cart_id: probeId, code: "invalid" }, options)))
  expect(attempts.filter((r) => r.status === 400)).toHaveLength(20)
  expect(attempts.filter((r) => r.status === 429)).toHaveLength(5)
  const limited = attempts.find((r) => r.status === 429)!
  expect(limited.data.error).toBe("GIFT_VOUCHER_RATE_LIMITED")
  expect(Number(limited.headers["retry-after"])).toBeGreaterThan(0)
  const { rows: counters } = await dbConnection.raw("SELECT subject, attempts FROM gift_voucher_rate_limit")
  expect(counters).toHaveLength(1)
  expect(counters[0].subject).toMatch(/^[a-f0-9]{64}$/)
  expect(counters[0].attempts).toBe(21)
  await dbConnection.raw("UPDATE gift_voucher_rate_limit SET expires_at = now() - interval '1 second'")
  expect((await api.post("/store/gift-vouchers/apply", { cart_id: probeId, code: "invalid" }, options)).status).toBe(400)
  const { rows: reset } = await dbConnection.raw("SELECT attempts FROM gift_voucher_rate_limit")
  expect(reset[0].attempts).toBe(1)
  evidence.push({ scenario: "K8_APPLY_RATE_LIMIT", accepted: 20, limited: 5, expiryReset: true })
}

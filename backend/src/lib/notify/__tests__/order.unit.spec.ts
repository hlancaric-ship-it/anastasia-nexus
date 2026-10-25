import { formatMoney, notifyCustomerWelcome, notifyOrderCanceled, notifyOrderPlaced, notifyPaymentCaptured, notifyRefunds, notifyShipment, orderPlacedData, orderUrl, welcomeEligibility } from "../order"

const EMAIL = "synthetic.customer@example.test"
const NOW = new Date("2026-10-15T10:00:00Z")

const baseOrder = (over: Record<string, unknown> = {}) => ({
  id: "order_1", display_id: 1042, email: EMAIL, currency_code: "eur", status: "pending",
  total: 111.5, item_total: 118, shipping_total: 3.5, discount_total: 10,
  customer: { first_name: "Jana" },
  items: [{ title: "Default", product_title: "Kurz RESET", quantity: 2, total: 118 }],
  payment_collections: [{ captured_amount: 111.5, refunded_amount: 0, payments: [{ captured_at: "2026-10-15T09:00:00Z" }] }],
  ...over,
})

function makeContainer(opts: { order?: any; notifications?: any[]; customer?: any; refunds?: any[]; labels?: any[]; createError?: Error } = {}) {
  const order = "order" in opts ? opts.order : baseOrder()
  const graph = jest.fn(async ({ entity, filters }: any) => {
    switch (entity) {
      case "order": return { data: order ? [order] : [] }
      case "payment": return filters?.id ? { data: [{ id: filters.id, payment_collection_id: "pc_1", currency_code: "eur", refunds: opts.refunds ?? [] }] } : { data: [] }
      case "order_payment_collection": return { data: order ? [{ order_id: order.id, payment_collection_id: "pc_1" }] : [] }
      case "order_fulfillment": return { data: order ? [{ order_id: order.id, fulfillment_id: filters.fulfillment_id }] : [] }
      case "fulfillment": return { data: [{ id: filters.id, labels: opts.labels ?? [] }] }
      case "customer": return { data: opts.customer ? [opts.customer] : [] }
      default: return { data: [] }
    }
  })
  const created: any[] = []
  const notifications = {
    listNotifications: jest.fn(async (filters: any) => [...(opts.notifications ?? []), ...created].filter(n => filters.id ? n.id === filters.id : n.idempotency_key === filters.idempotency_key)),
    createNotifications: jest.fn(async (input: any) => { if (opts.createError) throw opts.createError; const row = { ...input, id: "noti_" + created.length, status: "success" }; created.push(row); return row }),
  }
  const logs: string[] = []
  const logger = { info: (m: string) => logs.push(m), warn: (m: string) => logs.push(m), error: (m: string) => logs.push(m) }
  const ops = { createOpsEvents: jest.fn(async (e: any) => ({ id: "ev", ...e })) }
  const map: Record<string, unknown> = { query: { graph }, notification: notifications, logger, ops_audit: ops, entitlement: {}, email_template: { listEmailTemplateOverrides: async () => [] } }
  const container: any = { resolve: (key: string) => { if (key in map) return map[key]; throw new Error(`missing ${key}`) } }
  return { container, notifications, logs, graph }
}

const sent = (n: { createNotifications: jest.Mock }, i = 0) => (n.createNotifications.mock.calls[i] as any[])[0]

beforeEach(() => { process.env.ACCOUNT_ORDERS_URL = "https://anastasiaoz.eu/ucet/objednavky/"; process.env.ACCOUNT_URL = "https://anastasiaoz.eu/ucet" })

describe("orderPlacedData", () => {
  it("formátuje sumy v sk-SK a označí zaplatenú objednávku", () => {
    const data = orderPlacedData(baseOrder() as any)
    expect(data).toMatchObject({ order_display_id: "1042", first_name: "Jana", paid: true, url: "https://anastasiaoz.eu/ucet/objednavky/order_1" })
    expect(data.items).toEqual([{ title: "Kurz RESET", quantity: 2, total: formatMoney(118, "eur") }])
    expect(String(data.total)).toMatch(/^111,50\s€$/)
    expect(orderPlacedData(baseOrder({ shipping_total: 0, discount_total: 0 }) as any)).toMatchObject({ shipping_total: null, discount_total: null })
    expect(orderPlacedData(baseOrder({ payment_collections: [] }) as any).paid).toBe(false)
  })
})

describe("e-maily k objednávke", () => {
  it("potvrzení respektuje nativní zákaz oznámení po anonymizaci/importu", async () => {
    const { container, notifications } = makeContainer({ order: baseOrder({ no_notification: true }) })
    expect(await notifyOrderPlaced(container, "order_1")).toEqual({ status: "skipped", reason: "NO_NOTIFICATION" })
    expect(notifications.createNotifications).not.toHaveBeenCalled()
  })
  it("potvrdenie objednávky: adresát z objednávky, idempotentný kľúč", async () => {
    const { container, notifications } = makeContainer()
    expect(await notifyOrderPlaced(container, "order_1")).toEqual({ status: "sent" })
    expect(sent(notifications)).toMatchObject({ to: EMAIL, template: "order-placed-sk", idempotency_key: "order.placed:order_1", resource_type: "order", data: { paid: true } })
  })

  it("chyba odoslania nevyhodí a zapíše sa bez e-mailu v logu", async () => {
    const { container, logs } = makeContainer({ createError: new Error("down") })
    expect(await notifyOrderPlaced(container, "order_1")).toEqual({ status: "skipped", reason: "SEND_FAILED" })
    expect(logs.join("\n")).toContain("send_failed")
    expect(logs.join("\n")).not.toContain(EMAIL)
  })

  it("platba: nepošle, keď potvrdenie objednávky už hlásilo zaplatenie alebo ešte neodišlo", async () => {
    const paidInOrder = makeContainer({ notifications: [{ id: "n", idempotency_key: "order.placed:order_1", data: { paid: true } }] })
    expect(await notifyPaymentCaptured(paidInOrder.container, "pay_1")).toEqual({ status: "skipped", reason: "PAID_IN_ORDER_EMAIL" })
    const pending = makeContainer()
    expect(await notifyPaymentCaptured(pending.container, "pay_1")).toEqual({ status: "skipped", reason: "ORDER_EMAIL_PENDING" })
    const later = makeContainer({ notifications: [{ id: "n", idempotency_key: "order.placed:order_1", data: { paid: false } }] })
    expect(await notifyPaymentCaptured(later.container, "pay_1")).toEqual({ status: "sent" })
    expect(sent(later.notifications)).toMatchObject({ template: "payment-captured-sk", idempotency_key: "order.paid:order_1" })
  })

  it("zásielka: rešpektuje no_notification a prenesie číslo zásielky", async () => {
    const muted = makeContainer()
    expect(await notifyShipment(muted.container, "ful_1", true)).toEqual({ status: "skipped", reason: "NO_NOTIFICATION" })
    expect(muted.notifications.createNotifications).not.toHaveBeenCalled()
    const physical = baseOrder({ items: [{ title: "Default", product_title: "Bylinný čaj", quantity: 1, total: 12, requires_shipping: true }] })
    const { container, notifications } = makeContainer({ order: physical, labels: [{ tracking_number: "SK1", tracking_url: "https://track.example.test/SK1" }] })
    expect(await notifyShipment(container, "ful_1")).toEqual({ status: "sent" })
    expect(sent(notifications)).toMatchObject({ template: "order-shipped-sk", idempotency_key: "order.shipped:ful_1", data: { tracking_number: "SK1", tracking_url: "https://track.example.test/SK1" } })
  })

  it("zásielka: digitálna objednávka nedostane e-mail o odovzdaní dopravcovi", async () => {
    const { container, notifications } = makeContainer()
    expect(await notifyShipment(container, "ful_1")).toEqual({ status: "skipped", reason: "DIGITAL_ONLY" })
    expect(notifications.createNotifications).not.toHaveBeenCalled()
  })

  it("odkaz na objednávku: účet so záložkou v hashi dostane ID v query", () => {
    process.env.ACCOUNT_ORDERS_URL = "https://anastasia-test.l-code-dynamics.com/ucet#objednavky"
    expect(orderUrl("order_1")).toBe("https://anastasia-test.l-code-dynamics.com/ucet?objednavka=order_1#objednavky")
  })

  it("refund: jeden e-mail na každý refund, opakovanie neposiela znova", async () => {
    const refunds = [{ id: "ref_1", amount: 30 }, { id: "ref_2", amount: 10 }]
    const { container, notifications } = makeContainer({ refunds, notifications: [{ id: "n", status: "success", to: EMAIL, channel: "email", template: "order-refunded-sk", idempotency_key: "order.refunded:ref_1", resource_id: "order_1", resource_type: "order" }] })
    expect(await notifyRefunds(container, "pay_1")).toEqual([{ status: "duplicate" }, { status: "sent" }])
    expect(notifications.createNotifications).toHaveBeenCalledTimes(1)
    expect(sent(notifications)).toMatchObject({ template: "order-refunded-sk", idempotency_key: "order.refunded:ref_2" })
    expect(String(sent(notifications).data.amount)).toMatch(/^10,00\s€$/)
    expect(await notifyRefunds(makeContainer({ refunds: [] }).container, "pay_1")).toEqual([{ status: "skipped", reason: "NO_REFUNDS" }])
  })

  it("storno: veta o vrátení peňazí len pri nevrátenej platbe", async () => {
    const paid = makeContainer({ order: baseOrder({ status: "canceled" }) })
    await notifyOrderCanceled(paid.container, "order_1")
    expect(sent(paid.notifications)).toMatchObject({ template: "order-canceled-sk", idempotency_key: "order.canceled:order_1", data: { paid: true } })
    const refunded = makeContainer({ order: baseOrder({ status: "canceled", payment_collections: [{ captured_amount: 111.5, refunded_amount: 111.5 }] }) })
    await notifyOrderCanceled(refunded.container, "order_1")
    expect(sent(refunded.notifications).data.paid).toBe(false)
    expect(await notifyOrderCanceled(makeContainer({ order: baseOrder({ email: null }) }).container, "order_1")).toEqual({ status: "skipped", reason: "NO_EMAIL" })
  })
})

describe("uvítanie po registrácii", () => {
  const customer = (over: Record<string, unknown> = {}) => ({ id: "cus_1", email: EMAIL, first_name: "Jana", has_account: true, created_at: "2026-10-15T09:50:00Z", metadata: null, ...over })

  it("len nový účet, nie prenos zo starého webu ani hosť", () => {
    expect(welcomeEligibility(customer(), NOW)).toBeNull()
    expect(welcomeEligibility(customer({ has_account: false }), NOW)).toBe("NO_ACCOUNT")
    expect(welcomeEligibility(customer({ metadata: { legacy_customer_migration: { source: "x" } } }), NOW)).toBe("LEGACY_MIGRATION")
    expect(welcomeEligibility(customer({ created_at: "2026-10-14T09:00:00Z" }), NOW)).toBe("NOT_NEW")
    expect(welcomeEligibility(customer({ email: " " }), NOW)).toBe("NO_EMAIL")
    expect(welcomeEligibility(null, NOW)).toBe("CUSTOMER_NOT_FOUND")
  })

  it("pošle raz s odkazom do účtu", async () => {
    const { container, notifications } = makeContainer({ customer: customer() })
    expect(await notifyCustomerWelcome(container, "cus_1", NOW)).toEqual({ status: "sent" })
    expect(sent(notifications)).toMatchObject({ to: EMAIL, template: "customer-welcome-sk", idempotency_key: "customer.welcome:cus_1", data: { first_name: "Jana", url: "https://anastasiaoz.eu/ucet" } })
  })
})

describe("potvrdenie objednávky – spôsob platby a dopravy", () => {
  const { renderTemplate } = require("../../../modules/notification-zeptomail/templates")
  const unpaid = (provider: string, shipping = "Kuriér (zásielka)") => baseOrder({
    total: 66, shipping_methods: [{ name: shipping, amount: 6 }],
    payment_collections: [{ captured_amount: 0, refunded_amount: 0, payments: [{ captured_at: null, provider_id: provider }] }],
  })
  it("prevod: e-mail obsahuje IBAN, variabilný symbol (= číslo objednávky) a sumu", () => {
    const data = orderPlacedData(unpaid("pp_bank_transfer_bank_transfer") as any)
    expect(data).toMatchObject({ paid: false, payment_method: "bank_transfer", shipping_method: "Kuriér (zásielka)" })
    expect(data.bank_transfer).toMatchObject({ iban: "SK17 1100 0000 0026 2409 8906", variable_symbol: "1042", bank: "Tatra banka" })
    const mail = renderTemplate("order-placed-sk", data)
    expect(mail.text).toContain("IBAN: SK17 1100 0000 0026 2409 8906")
    expect(mail.text).toContain("Variabilný symbol: 1042")
    expect(mail.text).toMatch(/Suma: 66,00\s€/)
    expect(mail.text).toContain("Platba: Prevodom na účet")
  })
  it("dobierka: „Platíte pri prevzatí“, bez bankových údajov; osobný odber s adresou", () => {
    const cod = renderTemplate("order-placed-sk", orderPlacedData(unpaid("pp_cod_cod", "Kuriér – platba na dobierku") as any))
    expect(cod.text).toMatch(/Platíte pri prevzatí zásielky: 66,00\s€/)
    expect(cod.text).not.toContain("IBAN")
    const pickup = renderTemplate("order-placed-sk", orderPlacedData(unpaid("pp_bank_transfer_bank_transfer", "Osobný odber – Lucrat spol. s r.o., Sokolská 88, 960 01 Zvolen") as any))
    expect(pickup.text).toContain("Sokolská 88, 960 01 Zvolen")
  })
  it("zaplatená kartou: bez platobných údajov", () => {
    const data = orderPlacedData(baseOrder({ payment_collections: [{ captured_amount: 111.5, refunded_amount: 0, payments: [{ captured_at: "2026-10-15T09:00:00Z", provider_id: "pp_stripe_stripe" }] }] }) as any)
    expect(data).toMatchObject({ paid: true, payment_method: "card", bank_transfer: null })
    expect(renderTemplate("order-placed-sk", data).text).not.toContain("IBAN")
  })
})

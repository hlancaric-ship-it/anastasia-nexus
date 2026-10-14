jest.mock("@medusajs/medusa/core-flows", () => ({}))
jest.mock("../../../scripts/anastasia-bootstrap", () => ({ DIGITAL_PROFILE_NAME: "digital", SALES_CHANNEL_NAME: "channel" }))
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { GIFT_VOUCHER_MODULE } from "../index"
import { attachRedemptionsToOrder, handleCanceledOrder, issueVouchersForOrder } from "../order-sync"
import { deliverDueGiftVouchers, deliverGiftVoucher, resolveDeliveryChannel, voucherPdf, type DeliveryMessage, type GiftVoucherDeliveryChannel } from "../delivery"
import { pdfString, renderPdf, wrap } from "../pdf"
import { planVariantSync, variantSku } from "../product-sync"
import { DEFAULT_SETTINGS } from "../policy"

const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
const recipient = { name: "Jana", email: "jana@example.test", message: "Ahoj", delivery_date: "2026-10-14" }

function orderFixture(patch: Record<string, unknown> = {}) {
  return {
    id: "order_1", status: "pending", total: 150, email: "buyer@example.test", currency_code: "eur",
    metadata: { gift_voucher_recipients: { v50: [recipient, { ...recipient, name: "Eva" }], v100: [recipient] } },
    items: [
      { id: "li_1", variant_id: "v50", product_id: "p", quantity: 2, unit_price: 50 },
      { id: "li_2", variant_id: "v100", product_id: "p", quantity: 1, unit_price: 100 },
      { id: "li_3", variant_id: "vother", product_id: "q", quantity: 1, unit_price: 0 },
    ],
    payment_collections: [{ captured_amount: 250, refunded_amount: 0, payments: [{ captured_at: new Date() }] }],
    ...patch,
  }
}

const variants = [
  { id: "v50", metadata: { gift_voucher_amount_minor: 5000 }, product: { id: "p", metadata: { gift_voucher: true } } },
  { id: "v100", metadata: { gift_voucher_amount_minor: 10000 }, product: { id: "p", metadata: { gift_voucher: true } } },
  { id: "vother", metadata: {}, product: { id: "q", metadata: {} } },
]

/** In-memory úložiště s unikátním issue_key – stejná sémantika jako unikátní index v PG. */
function fakeVouchers() {
  const byKey = new Map<string, any>()
  return {
    byKey,
    getSettings: jest.fn(async () => ({ ...DEFAULT_SETTINGS })),
    issueVoucher: jest.fn(async (input: any) => {
      const existing = byKey.get(input.issue_key)
      if (existing) return { voucher: existing, created: false }
      const voucher = { id: `gv_${byKey.size + 1}`, ...input }
      byKey.set(input.issue_key, voucher)
      return { voucher, created: true }
    }),
    attachOrder: jest.fn(async () => 1),
    refundOrderToVoucher: jest.fn(async () => [{ voucher_id: "gv_x", amount_minor: 3000, balance_after: 5000 }]),
    voidIssuedForCanceledOrder: jest.fn(async () => ({ voided: ["gv_1"], used: ["gv_2"] })),
    getVoucher: jest.fn(async (id: string) => ({ id, code: "GV-AAAA-BBBB-CCCC-DDDD" })),
  }
}

function container(order: any, vouchers = fakeVouchers()) {
  const eventBus = { emit: jest.fn() }
  const query = { graph: jest.fn(async ({ entity }: any) => {
    if (entity === "order") return { data: order ? [order] : [] }
    if (entity === "product_variant") return { data: variants }
    if (entity === "order_cart") return { data: [{ cart_id: "cart_1" }] }
    return { data: [] }
  }) }
  const map: Record<string, unknown> = { [ContainerRegistrationKeys.QUERY]: query, [ContainerRegistrationKeys.LOGGER]: logger, [GIFT_VOUCHER_MODULE]: vouchers, [Modules.EVENT_BUS]: eventBus }
  return { resolve: (key: string) => map[key], vouchers, eventBus, query } as any
}

describe("vystavení po zaplacení", () => {
  afterEach(() => jest.clearAllMocks())
  it("vystaví poukaz za každý kus s obdarovaným a vyšle voucher.issued jen s ID", async () => {
    const c = container(orderFixture())
    const summary = await issueVouchersForOrder(c, "order_1")
    expect(summary.issued).toHaveLength(3)
    expect([...c.vouchers.byKey.keys()]).toEqual(["order:order_1:v50:0", "order:order_1:v50:1", "order:order_1:v100:0"])
    expect(c.vouchers.issueVoucher.mock.calls[1][0]).toMatchObject({ amount_minor: 5000, recipient: { name: "Eva" }, purchaser_email: "buyer@example.test" })
    expect(c.eventBus.emit).toHaveBeenCalledWith([{ name: "voucher.issued", data: { id: "gv_1" } }, { name: "voucher.issued", data: { id: "gv_2" } }, { name: "voucher.issued", data: { id: "gv_3" } }])
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain("jana@example.test")
  })
  it("je idempotentní: opakovaná událost (order.placed + payment.captured) nevystaví druhý poukaz", async () => {
    const vouchers = fakeVouchers()
    const c = container(orderFixture(), vouchers)
    await issueVouchersForOrder(c, "order_1")
    const again = await issueVouchersForOrder(c, "order_1")
    expect(again.issued).toHaveLength(0)
    expect(again.existing).toHaveLength(3)
    expect(vouchers.byKey.size).toBe(3)
    expect(c.eventBus.emit).toHaveBeenCalledTimes(1)
  })
  it("souběžné události vystaví každý kus nejvýš jednou", async () => {
    const vouchers = fakeVouchers()
    const c = container(orderFixture(), vouchers)
    const [a, b] = await Promise.all([issueVouchersForOrder(c, "order_1"), issueVouchersForOrder(c, "order_1")])
    expect(a.issued.length + b.issued.length).toBe(3)
    expect(vouchers.byKey.size).toBe(3)
  })
  it("nezaplacená, zrušená nebo cizoměnová objednávka nevystaví nic", async () => {
    const unpaid = container(orderFixture({ payment_collections: [{ captured_amount: 0, refunded_amount: 0, payments: [{ captured_at: null }] }] }))
    expect(await issueVouchersForOrder(unpaid, "order_1")).toMatchObject({ skipped: "NOT_PAID", issued: [] })
    expect(await issueVouchersForOrder(container(orderFixture({ status: "canceled" })), "order_1")).toMatchObject({ skipped: "ORDER_CANCELED" })
    expect(await issueVouchersForOrder(container(orderFixture({ currency_code: "czk" })), "order_1")).toMatchObject({ skipped: "CURRENCY_MISMATCH" })
    expect(await issueVouchersForOrder(container(null), "order_x")).toMatchObject({ skipped: "ORDER_NOT_FOUND" })
    expect(unpaid.vouchers.issueVoucher).not.toHaveBeenCalled()
  })
  it("řádek s cenou jinou než nominální hodnota se nevystaví", async () => {
    const order = orderFixture()
    order.items[0].unit_price = 1
    const c = container(order)
    const summary = await issueVouchersForOrder(c, "order_1")
    expect(summary.rejected).toEqual(["li_1"])
    expect(summary.issued).toHaveLength(1)
  })
  it("storno: vrátí čerpání na poukaz a zneplatní nevyčerpané koupené poukazy", async () => {
    const c = container(orderFixture())
    const result = await handleCanceledOrder(c, "order_1")
    expect(c.vouchers.attachOrder).toHaveBeenCalledWith("cart_1", "order_1")
    expect(c.vouchers.refundOrderToVoucher).toHaveBeenCalledWith(expect.objectContaining({ order_id: "order_1", includeForfeited: true, idempotency_key: "cancel:order_1" }))
    expect(result).toMatchObject({ voided: ["gv_1"], used: ["gv_2"] })
    expect(logger.warn.mock.calls[0][0]).toContain("GV-****-****-****-DDDD")
    expect(await attachRedemptionsToOrder(c, "order_1")).toBe(1)
  })
})

describe("doručení", () => {
  const voucher = (patch: Record<string, unknown> = {}) => ({
    id: "gv_1", code: "GV-AAAA-BBBB-CCCC-DDDD", code_last4: "DDDD", status: "active", initial_amount: 5000, expires_at: new Date("2027-10-14T00:00:00Z"),
    delivery_method: "both", recipient_name: "Jana", recipient_email: "jana@example.test", purchaser_email: "buyer@example.test",
    message: "Všetko najlepšie k narodeninám", delivery_date: "2026-10-14", metadata: null, ...patch,
  })
  function deliveryContainer(row: any) {
    const vouchers = {
      getVoucher: jest.fn(async () => row),
      claimDelivery: jest.fn(async () => row),
      claimBuyerCopy: jest.fn(async () => row),
      releaseBuyerCopy: jest.fn(),
      markDeliveryFailed: jest.fn(),
      listDueDeliveries: jest.fn(async () => [row]),
    }
    const map: Record<string, unknown> = { [ContainerRegistrationKeys.LOGGER]: logger, [GIFT_VOUCHER_MODULE]: vouchers }
    return { resolve: (key: string) => map[key], vouchers } as any
  }
  const channel = (fail?: string): GiftVoucherDeliveryChannel & { sent: DeliveryMessage[] } => {
    const sent: DeliveryMessage[] = []
    return { live: true, sent, async send(message) { if (message.kind === fail) throw new Error("smtp"); sent.push(message) } }
  }
  const now = new Date("2026-10-14T08:00:00Z")
  afterEach(() => jest.clearAllMocks())

  it("bez explicitního zapnutí nic neposílá a do logu dává jen maskovaný kód", async () => {
    const c = deliveryContainer(voucher())
    const result = await deliverGiftVoucher(c, "gv_1", resolveDeliveryChannel(c, {}), now)
    expect(result).toEqual({ recipient: "disabled", buyer: "disabled" })
    const logged = JSON.stringify(logger.info.mock.calls)
    expect(logged).toContain("GV-****-****-****-DDDD")
    expect(logged).not.toContain("AAAA")
    expect(logged).not.toContain("jana@example.test")
  })
  it("způsob both: PDF kupujícímu i e-mail obdarovanému v den doručení", async () => {
    const c = deliveryContainer(voucher())
    const ch = channel()
    expect(await deliverGiftVoucher(c, "gv_1", ch, now)).toEqual({ recipient: "sent", buyer: "sent" })
    expect(ch.sent.map((m) => [m.kind, m.to])).toEqual([["buyer_pdf", "buyer@example.test"], ["recipient_email", "jana@example.test"]])
    expect(ch.sent[0].attachments?.[0]).toMatchObject({ filename: "poukaz-DDDD.pdf", content_type: "application/pdf" })
  })
  it("budoucí datum: obdarovaný čeká na job, kupující dostane PDF hned", async () => {
    const c = deliveryContainer(voucher({ delivery_date: "2026-12-24" }))
    const ch = channel()
    expect(await deliverGiftVoucher(c, "gv_1", ch, now)).toEqual({ recipient: "scheduled", buyer: "sent" })
    expect(c.vouchers.claimDelivery).not.toHaveBeenCalled()
  })
  it("už zabrané doručení (souběh subscriber + job) se nepošle podruhé", async () => {
    const c = deliveryContainer(voucher({ delivery_method: "recipient_email" }))
    c.vouchers.claimDelivery.mockResolvedValue(null)
    const ch = channel()
    expect(await deliverGiftVoucher(c, "gv_1", ch, now)).toEqual({ recipient: "skipped", buyer: "skipped" })
    expect(ch.sent).toHaveLength(0)
  })
  it("selhání odeslání označí doručení k opakování", async () => {
    const c = deliveryContainer(voucher())
    expect(await deliverGiftVoucher(c, "gv_1", channel("recipient_email"), now)).toEqual({ recipient: "failed", buyer: "sent" })
    expect(c.vouchers.markDeliveryFailed).toHaveBeenCalledWith("gv_1")
    const c2 = deliveryContainer(voucher())
    expect(await deliverGiftVoucher(c2, "gv_1", channel("buyer_pdf"), now)).toEqual({ recipient: "sent", buyer: "failed" })
    expect(c2.vouchers.releaseBuyerCopy).toHaveBeenCalledWith("gv_1")
  })
  it("zneplatněný poukaz se nedoručí; job projde splatné", async () => {
    const c = deliveryContainer(voucher({ status: "void" }))
    expect(await deliverGiftVoucher(c, "gv_1", channel(), now)).toEqual({ recipient: "skipped", buyer: "skipped" })
    const c2 = deliveryContainer(voucher({ delivery_method: "buyer_pdf", delivery_date: null }))
    expect(await deliverDueGiftVouchers(c2, channel(), now)).toBe(1)
  })
  it("PDF je platný jednostránkový dokument bez externí knihovny", () => {
    const pdf = voucherPdf(voucher() as any).toString("latin1")
    expect(pdf.startsWith("%PDF-1.")).toBe(true)
    expect(pdf.trimEnd().endsWith("%%EOF")).toBe(true)
    expect(pdf).toContain("GV-AAAA-BBBB-CCCC-DDDD")
    expect(pdfString("a(b)\\c")).toContain("\\(")
    expect(wrap("slovo ".repeat(30).trim(), 20).every((line) => line.length <= 20)).toBe(true)
    expect(renderPdf([{ text: "x", size: 10 }]).length).toBeGreaterThan(200)
  })
})

describe("synchronizace produktu", () => {
  it("doplní chybějící hodnoty a odebere nenakonfigurované/duplicitní varianty", () => {
    const plan = planVariantSync([5000, 10000, 15000], [
      { id: "a", metadata: { gift_voucher_amount_minor: 5000 } },
      { id: "b", metadata: { gift_voucher_amount_minor: 20000 } },
      { id: "c", metadata: { gift_voucher_amount_minor: 5000 } },
      { id: "d", metadata: null },
    ])
    expect(plan).toEqual({ create: [10000, 15000], remove: ["b", "c", "d"], keep: [5000] })
    expect(variantSku(5000)).toBe("GIFT-VOUCHER-5000")
  })
})

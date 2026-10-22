jest.mock("../../lib/membership/checkout-guard",()=>({assertMembershipCheckoutCart:jest.fn(async()=>{})}))
jest.mock("../../lib/legal/checkout", () => ({ assertCartConsent: jest.fn(async () => {}) }))
var mockValidate: any
var mockCompensate: any
jest.mock("@medusajs/medusa/core-flows", () => ({
  addToCartWorkflow: { hooks: { setPricingContext: jest.fn() } },
  completeCartWorkflow: { hooks: { validate: jest.fn((handler, compensate) => { mockValidate = handler; mockCompensate = compensate }) } },
}))
jest.mock("../../api/store/nexus-cart/route", () => ({ repriceCart: jest.fn() }))
jest.mock("../booking-checkout", () => ({ claimCartBooking: jest.fn(async () => null) }))
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { repriceCart } from "../../api/store/nexus-cart/route"
import { giftVoucherHttpError } from "../../api/store/gift-vouchers/errors"
import { GIFT_VOUCHER_MODULE } from "../../modules/gift-voucher"
import { DEFAULT_SETTINGS } from "../../modules/gift-voucher/policy"
import { claimCartBooking } from "../booking-checkout"
import { prepareGiftVoucherCheckout } from "../gift-voucher-checkout"
import "../hooks"

const goods = { id: "li_goods", variant_id: "v_goods", quantity: 1, unit_price: 40, total: 40 }
const voucherLine = { id: "li_gv", variant_id: "v_gv50", quantity: 1, unit_price: 50, total: 50 }
const variants = [
  { id: "v_goods", metadata: {}, product: { id: "p_goods", metadata: {}, categories: [{ id: "pcat_a" }] } },
  { id: "v_gv50", metadata: { gift_voucher_amount_minor: 5000 }, product: { id: "p_gv", metadata: { gift_voucher: true }, categories: [] } },
]
const recipient = { name: "Jana", email: "jana@example.test", message: null, delivery_date: new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bratislava" }).format(new Date()) }
const activeVoucher = { id: "gv_1", status: "active", currency_code: "eur", balance: 3000, initial_amount: 5000, expires_at: new Date(Date.now() + 86400000), partial_redemption: true, scope: { type: "all", category_ids: [] } }

function cart(patch: Record<string, unknown> = {}) {
  return { id: "cart_1", email: "buyer@example.test", currency_code: "eur", total: 45, metadata: {}, items: [goods], shipping_methods: [{ total: 5 }], credit_lines: [], ...patch } as any
}

function makeContainer(opts: { voucher?: any; settings?: any } = {}) {
  const vouchers = {
    getSettings: jest.fn(async () => opts.settings ?? { ...DEFAULT_SETTINGS }),
    getVoucher: jest.fn(async () => opts.voucher === undefined ? activeVoucher : opts.voucher),
    redeem: jest.fn(async (input: any) => ({ transaction_id: "gvtx_1", ...input })),
    reverseRedemption: jest.fn(async () => true),
  }
  const promotions = { registerUsage: jest.fn(), revertUsage: jest.fn() }
  const booking = { releaseCheckoutClaim: jest.fn() }
  const query = { graph: jest.fn(async ({ filters }: any) => ({ data: variants.filter((v) => filters.id.includes(v.id)) })) }
  const map: Record<string, unknown> = { [GIFT_VOUCHER_MODULE]: vouchers, [Modules.PROMOTION]: promotions, booking, [ContainerRegistrationKeys.QUERY]: query }
  return { resolve: jest.fn((key: string) => map[key]), vouchers, promotions, booking, query } as any
}

const credit = (amount: number) => [{ id: "cl_1", amount, reference: "gift_voucher", reference_id: "gv_1" }]

describe("prepareGiftVoucherCheckout", () => {
  it("košík bez variant a bez kreditu nic nedotazuje", async () => {
    const container = makeContainer()
    expect(await prepareGiftVoucherCheckout(cart({ items: [{ id: "x", quantity: 1, unit_price: 1 }] }), container)).toBeNull()
    expect(container.resolve).not.toHaveBeenCalled()
  })
  it("běžný košík bez poukazu vrátí null", async () => {
    expect(await prepareGiftVoucherCheckout(cart(), makeContainer())).toBeNull()
  })
  it("čerpání v rámci způsobilé částky (zboží + doprava) projde", async () => {
    const result = await prepareGiftVoucherCheckout(cart({ credit_lines: credit(30) }), makeContainer())
    expect(result).toEqual({ voucher_lines: 0, redeem: { voucher_id: "gv_1", cart_id: "cart_1", amount_minor: 3000, eligible_minor: 4500 } })
  })
  it("poukaz neplatí jiný poukaz: kredit vyšší než zboží mimo poukazy selže", async () => {
    const c = cart({ items: [voucherLine], shipping_methods: [], credit_lines: credit(30), metadata: { gift_voucher_recipients: { v_gv50: [recipient] } } })
    await expect(prepareGiftVoucherCheckout(c, makeContainer())).rejects.toThrow("GIFT_VOUCHER_AMOUNT_CHANGED")
  })
  it("rozsah kategorie: zboží mimo kategorii ani doprava se nepočítá", async () => {
    const voucher = { ...activeVoucher, scope: { type: "categories", category_ids: ["pcat_other"] } }
    await expect(prepareGiftVoucherCheckout(cart({ credit_lines: credit(10) }), makeContainer({ voucher }))).rejects.toThrow("GIFT_VOUCHER_AMOUNT_CHANGED")
    const inScope = { ...activeVoucher, scope: { type: "categories", category_ids: ["pcat_a"] } }
    expect((await prepareGiftVoucherCheckout(cart({ credit_lines: credit(40) }), makeContainer({ voucher: inScope })))?.redeem?.eligible_minor).toBe(4000)
  })
  it("víc poukazů, neznámý poukaz a cizí měna selžou", async () => {
    await expect(prepareGiftVoucherCheckout(cart({ credit_lines: [...credit(10), { ...credit(10)[0], id: "cl_2" }] }), makeContainer())).rejects.toThrow("GIFT_VOUCHER_MULTIPLE")
    await expect(prepareGiftVoucherCheckout(cart({ credit_lines: credit(10) }), makeContainer({ voucher: null }))).rejects.toThrow("GIFT_VOUCHER_INVALID")
    await expect(prepareGiftVoucherCheckout(cart({ currency_code: "czk", credit_lines: credit(10) }), makeContainer())).rejects.toThrow("GIFT_VOUCHER_CURRENCY_MISMATCH")
  })
  it("koupě poukazu: hodnota, cena a obdarovaní se ověří na serveru", async () => {
    const withRecipient = { gift_voucher_recipients: { v_gv50: [recipient] } }
    expect(await prepareGiftVoucherCheckout(cart({ items: [voucherLine], metadata: withRecipient }), makeContainer())).toEqual({ voucher_lines: 1 })
    await expect(prepareGiftVoucherCheckout(cart({ items: [voucherLine] }), makeContainer())).rejects.toThrow("GIFT_VOUCHER_RECIPIENT_REQUIRED")
    await expect(prepareGiftVoucherCheckout(cart({ items: [{ ...voucherLine, unit_price: 1 }], metadata: withRecipient }), makeContainer())).rejects.toThrow("GIFT_VOUCHER_PRODUCT_INVALID")
    await expect(prepareGiftVoucherCheckout(cart({ items: [voucherLine], metadata: withRecipient }), makeContainer({ settings: { ...DEFAULT_SETTINGS, values_minor: [10000] } }))).rejects.toThrow("GIFT_VOUCHER_PRODUCT_INVALID")
    await expect(prepareGiftVoucherCheckout(cart({ items: [voucherLine], metadata: withRecipient }), makeContainer({ settings: { ...DEFAULT_SETTINGS, enabled: false } }))).rejects.toThrow("GIFT_VOUCHER_DISABLED")
  })
})

describe("completeCartWorkflow hook s poukazem", () => {
  const run = (snapshot: any, container: any) => mockValidate({ input: { id: snapshot.id }, cart: snapshot }, { container })
  beforeEach(() => {
    ;(repriceCart as jest.Mock).mockImplementation(async () => ({ pricesChanged: false, items: [{ id: goods.id, unit_price: 40, quantity: 1 }] }))
  })
  afterEach(() => jest.clearAllMocks())

  it("košík plně uhrazený poukazem nepotřebuje platbu ani SafeOrder a čerpá atomicky", async () => {
    const container = makeContainer({ voucher: { ...activeVoucher, balance: 5000 } })
    const response = await run(cart({ total: 0, credit_lines: credit(45) }), container)
    expect(container.vouchers.redeem).toHaveBeenCalledWith({ voucher_id: "gv_1", cart_id: "cart_1", amount_minor: 4500, eligible_minor: 4500 })
    expect(response.compensateInput).toEqual({ giftVoucherRedemption: "gvtx_1" })
    await mockCompensate(response.compensateInput, { container })
    expect(container.vouchers.reverseRedemption).toHaveBeenCalledWith("gvtx_1")
  })
  it("nulový košík bez kreditu poukazu dál vyžaduje shodu platby", async () => {
    await expect(run(cart({ total: 0 }), makeContainer())).rejects.toThrow("MEDUSA_PAYMENT_AMOUNT_MISMATCH")
  })
  it("selhání čerpání vrátí už registrovaný kupon i rezervaci a nic nečerpá", async () => {
    const container = makeContainer({ voucher: { ...activeVoucher, balance: 5000 } })
    ;(claimCartBooking as jest.Mock).mockResolvedValueOnce({ id: "claim_1" })
    container.vouchers.redeem.mockRejectedValueOnce(new Error("GIFT_VOUCHER_BALANCE_INSUFFICIENT"))
    const snapshot = cart({ total: 0, credit_lines: credit(45), metadata: { nexus_coupon: { code: "SYN10" } } })
    await expect(run(snapshot, container)).rejects.toThrow("GIFT_VOUCHER_BALANCE_INSUFFICIENT")
    // Použitie kupónu sa v hooku už nezapisuje (zapisuje sa až po vytvorení objednávky).
    expect(container.promotions.revertUsage).not.toHaveBeenCalled()
    expect(container.booking.releaseCheckoutClaim).toHaveBeenCalledWith({ id: "claim_1" })
    expect(container.vouchers.reverseRedemption).not.toHaveBeenCalled()
  })
  it("chyba při rollbacku nepřebije původní chybu; v kompenzaci se propaguje", async () => {
    const container = makeContainer({ voucher: { ...activeVoucher, balance: 5000 } })
    container.vouchers.reverseRedemption.mockRejectedValueOnce(new Error("db down"))
    await expect(mockCompensate({ giftVoucherRedemption: "gvtx_1" }, { container })).rejects.toThrow("db down")
  })
  it("dokončený košík (replay) nečerpá znovu", async () => {
    const container = makeContainer()
    await expect(run(cart({ total: 0, credit_lines: credit(45), completed_at: new Date() }), container)).resolves.toBeUndefined()
    expect(container.vouchers.redeem).not.toHaveBeenCalled()
  })
})

describe("mapování chyb poukazu na HTTP", () => {
  it.each([
    ["GIFT_VOUCHER_AMOUNT_CHANGED", 409], ["GIFT_VOUCHER_ALREADY_REDEEMED", 409], ["GIFT_VOUCHER_EXPIRED", 400], ["GIFT_VOUCHER_RECIPIENT_REQUIRED", 400],
  ])("%s -> %s", (code, status) => {
    expect(giftVoucherHttpError(code)).toMatchObject({ status, body: { ok: false, error: code } })
  })
  it("zneplatněný kód se tváří jako neplatný; neznámá chyba se nemapuje", () => {
    expect(giftVoucherHttpError("GIFT_VOUCHER_VOID")?.body.error).toBe("GIFT_VOUCHER_INVALID")
    expect(giftVoucherHttpError("SOMETHING_ELSE")).toBeNull()
    expect(giftVoucherHttpError(undefined)).toBeNull()
  })
})

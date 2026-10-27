jest.mock("@medusajs/medusa/core-flows", () => ({
  addShippingMethodToCartWorkflow: jest.fn(),
  createPaymentCollectionForCartWorkflow: jest.fn(),
  createPaymentSessionsWorkflow: jest.fn(),
  listShippingOptionsForCartWithPricingWorkflow: jest.fn(),
}))
jest.mock("../../../nexus-cart/route", () => ({ repriceCart: jest.fn(async () => ({ pricesChanged: false, items: [] })) }))

import {
  addShippingMethodToCartWorkflow, createPaymentCollectionForCartWorkflow, createPaymentSessionsWorkflow, listShippingOptionsForCartWithPricingWorkflow,
} from "@medusajs/medusa/core-flows"
import { GET, POST } from "../route"
import { repriceCart } from "../../../nexus-cart/route"

const AUTH = { actor_type: "customer", actor_id: "cus_1" }
const PROVIDERS = ["pp_stripe_stripe", "pp_cod_cod", "pp_bank_transfer_bank_transfer"].map((id) => ({ id }))
// item_total košíka určuje Medusa pravidlo ceny; tu je už vyhodnotená cena (calculated_amount).
const option = (id: string, code: string, profile: string, amount: number, prices: any[] = []) => ({ id, name: id, shipping_profile_id: profile, type: { code }, calculated_price: { calculated_amount: amount }, prices })
const freeRule = [{ amount: 0, price_rules: [{ attribute: "item_total", operator: "gte", value: "60" }] }]
const optionsFor = (free: boolean) => [
  option("so_courier", "courier", "sp_p", free ? 0 : 6, freeRule),
  option("so_cod", "courier_cod", "sp_p", free ? 2 : 8),
  option("so_pickup", "pickup", "sp_p", 0),
  option("so_digital", "digital", "sp_d", 0),
]

function setup(opts: { profiles: string[]; free?: boolean; customer?: string; total?: number; methods?: string[] } = { profiles: ["sp_p"] }) {
  const cart = {
    id: "cart_1", customer_id: opts.customer ?? "cus_1", completed_at: null, currency_code: "eur", region_id: "reg_1",
    shipping_address: { country_code: "cz" },
    items: opts.profiles.map((p, i) => ({ id: `item_${i}`, requires_shipping: p === "sp_p", product: { shipping_profile: { id: p } } })),
    shipping_methods: (opts.methods ?? []).map((id, i) => ({ id: `sm_${i}`, shipping_option_id: id })),
    region: { payment_providers: PROVIDERS }, payment_collection: null as any,
  }
  const added: string[] = []
  const graph = jest.fn(async ({ entity, filters }: any) => {
    if (entity === "cart") return { data: [{ ...cart, shipping_methods: added.length ? added.map((id) => ({ id, shipping_option_id: id, name: id, amount: 1 })) : cart.shipping_methods, total: opts.total ?? 66, item_total: 60, shipping_total: 0, tax_total: 12, payment_collection: cart.payment_collection }] }
    if (entity === "shipping_profile") return { data: filters.id.map((id: string) => ({ id, type: id === "sp_d" ? "digital" : "default" })) }
    if (entity === "shipping_option") return { data: filters.id.map((id: string) => ({ id, shipping_profile_id: id === "so_digital" ? "sp_d" : "sp_p", type: { code: optionsFor(false).find((o) => o.id === id)?.type.code } })) }
    return { data: [] }
  })
  jest.mocked(listShippingOptionsForCartWithPricingWorkflow).mockReturnValue({ run: async () => ({ result: optionsFor(Boolean(opts.free)) }) } as any)
  jest.mocked(addShippingMethodToCartWorkflow).mockReturnValue({ run: async ({ input }: any) => { added.push(...input.options.map((o: any) => o.id)) } } as any)
  jest.mocked(createPaymentCollectionForCartWorkflow).mockReturnValue({ run: async () => { cart.payment_collection = { id: "pc_1" } } } as any)
  jest.mocked(createPaymentSessionsWorkflow).mockReturnValue({ run: async ({ input }: any) => ({ result: { provider_id: input.provider_id, data: input.provider_id === "pp_stripe_stripe" ? { client_secret: "pi_1_secret_x" } : { method: "cod" } } }) } as any)
  const ops = { createOpsEvents: jest.fn(async () => ({ id: "ev" })) }
  const map: Record<string, unknown> = { query: { graph }, ops_audit: ops, logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }, cart: { deleteShippingMethods: jest.fn() } }
  const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() }
  return { scope: { resolve: (k: string) => map[k] }, res, added, cart }
}
const body = (res: any) => res.json.mock.calls[0][0]

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(repriceCart).mockResolvedValue({ pricesChanged: false, items: [] } as any)
})

describe("GET /store/nexus-checkout/options", () => {
  it("booking-only cart with default profile needs no delivery or shipping address", async () => {
    const t = setup({ profiles: ["sp_p"] })
    Object.assign(t.cart.items[0].product, { metadata: { booking: { durationMinutes: 60 } } })
    t.cart.shipping_address = null as any
    await GET({ query: { cart_id: "cart_1" }, scope: t.scope, auth_context: AUTH } as any, t.res)
    expect(body(t.res)).toMatchObject({ requires_delivery: false, delivery: [] })
    expect(body(t.res).payment[0].available).toBe(false)
    expect(listShippingOptionsForCartWithPricingWorkflow).not.toHaveBeenCalled()
  })
  it("physical goods sharing the booking profile still require delivery", async () => {
    const t = setup({ profiles: ["sp_p", "sp_p"] })
    Object.assign(t.cart.items[0].product, { metadata: { booking: { durationMinutes: 60 } } })
    await GET({ query: { cart_id: "cart_1" }, scope: t.scope, auth_context: AUTH } as any, t.res)
    expect(body(t.res).requires_delivery).toBe(true)
  })
  it("kuriér 6 € pod 60 €, zdarma nad 60 €, osobný odber 0 €, dobierka +2 € zo servera", async () => {
    for (const [free, courier] of [[false, 6], [true, 0]] as const) {
      const t = setup({ profiles: ["sp_p"], free })
      await GET({ query: { cart_id: "cart_1" }, scope: t.scope, auth_context: AUTH } as any, t.res)
      const b = body(t.res)
      expect(b.delivery).toEqual([
        expect.objectContaining({ code: "courier", amount: courier, free_from: 60 }),
        expect.objectContaining({ code: "pickup", amount: 0, address: expect.stringContaining("Vyšná Slaná 259") }),
      ])
      expect(b.payment.map((p: any) => p.code)).toEqual(["cod", "card", "bank_transfer"])
      expect(b.payment[0]).toMatchObject({ available: true, fee: 2, requires_delivery: "courier" })
    }
  })
  it("čisto digitálny košík: bez dopravy a bez dobierky", async () => {
    const t = setup({ profiles: ["sp_d"] })
    await GET({ query: { cart_id: "cart_1" }, scope: t.scope, auth_context: AUTH } as any, t.res)
    expect(body(t.res)).toMatchObject({ requires_delivery: false, delivery: [] })
    expect(body(t.res).payment[0]).toMatchObject({ code: "cod", available: false, reason: "DIGITAL_ONLY" })
  })
  it("cudzí košík odmietne", async () => {
    const t = setup({ profiles: ["sp_p"], customer: "cus_other" })
    await GET({ query: { cart_id: "cart_1" }, scope: t.scope, auth_context: AUTH } as any, t.res)
    expect(t.res.status).toHaveBeenCalledWith(403)
  })
})

describe("POST /store/nexus-checkout/options", () => {
  it("prepares a booking payment without shipping after the server normalizes the line", async () => {
    const t = setup({ profiles: ["sp_p"] })
    Object.assign(t.cart.items[0].product, { metadata: { booking: { durationMinutes: 60 } } })
    t.cart.shipping_address = null as any
    jest.mocked(repriceCart).mockImplementation(async () => { t.cart.items[0].requires_shipping = false; return { pricesChanged: false, items: [] } as any })
    await POST({ body: { cart_id: "cart_1", payment: "card" }, scope: t.scope, auth_context: AUTH } as any, t.res)
    expect(t.res.status).toHaveBeenCalledWith(200)
    expect(body(t.res)).toMatchObject({ ok: true, delivery: null, client_secret: "pi_1_secret_x" })
    expect(addShippingMethodToCartWorkflow).not.toHaveBeenCalled()
    expect(listShippingOptionsForCartWithPricingWorkflow).not.toHaveBeenCalled()
  })
  it("malformed booking metadata never exempts a physical cart from delivery", async () => {
    const t = setup({ profiles: ["sp_p"] })
    Object.assign(t.cart.items[0].product, { metadata: { booking: true } })
    await POST({ body: { cart_id: "cart_1", payment: "card" }, scope: t.scope, auth_context: AUTH } as any, t.res)
    expect(body(t.res)).toMatchObject({ error: "DELIVERY_REQUIRED" })
    expect(createPaymentSessionsWorkflow).not.toHaveBeenCalled()
  })
  it("zmiešaný košík (fyzický + digitálny): iba fyzické dopravy, digitálna sa odmietne", async () => {
    const t = setup({ profiles: ["sp_p", "sp_d"] })
    await POST({ body: { cart_id: "cart_1", delivery: "courier", payment: "card" }, scope: t.scope, auth_context: AUTH } as any, t.res)
    expect(t.res.status).toHaveBeenCalledWith(200)
    // Pre zmiešaný košík sa nastaví iba fyzická doprava (digitálna je odmítnuta)
    expect(t.added.sort()).toEqual(["so_courier"])
    expect(body(t.res)).toMatchObject({ ok: true, payment: "card", delivery: "courier" })
  })
  it("dobierka pre digitálny košík → 400 COD_NOT_AVAILABLE, nič sa nezmení", async () => {
    const t = setup({ profiles: ["sp_d"] })
    await POST({ body: { cart_id: "cart_1", payment: "cod" }, scope: t.scope, auth_context: AUTH } as any, t.res)
    expect(t.res.status).toHaveBeenCalledWith(400)
    expect(body(t.res)).toMatchObject({ error: "COD_NOT_AVAILABLE" })
    expect(addShippingMethodToCartWorkflow).not.toHaveBeenCalled()
    expect(createPaymentSessionsWorkflow).not.toHaveBeenCalled()
  })
  it("dobierka pri osobnom odbere → 400", async () => {
    const t = setup({ profiles: ["sp_p"] })
    await POST({ body: { cart_id: "cart_1", delivery: "pickup", payment: "cod" }, scope: t.scope, auth_context: AUTH } as any, t.res)
    expect(body(t.res)).toMatchObject({ error: "COD_NOT_AVAILABLE" })
  })
  it("karta: vráti client_secret až po nastavení dopravy pre všetky profily", async () => {
    const t = setup({ profiles: ["sp_p"] })
    await POST({ body: { cart_id: "cart_1", delivery: "pickup", payment: "card" }, scope: t.scope, auth_context: AUTH } as any, t.res)
    expect(t.added).toEqual(["so_pickup"])
    expect(body(t.res)).toMatchObject({ client_secret: "pi_1_secret_x", delivery: "pickup" })
  })
  it("fyzický tovar bez zvolenej dopravy → platba sa nepripraví", async () => {
    const t = setup({ profiles: ["sp_p"] })
    await POST({ body: { cart_id: "cart_1", payment: "card" }, scope: t.scope, auth_context: AUTH } as any, t.res)
    expect(body(t.res)).toMatchObject({ error: "DELIVERY_REQUIRED" })
    expect(createPaymentSessionsWorkflow).not.toHaveBeenCalled()
  })
  it("neznámu metódu a sumy z klienta ignoruje / odmietne", async () => {
    const t = setup({ profiles: ["sp_p"] })
    await POST({ body: { cart_id: "cart_1", delivery: "courier", payment: "pp_system_default" }, scope: t.scope, auth_context: AUTH } as any, t.res)
    expect(body(t.res)).toMatchObject({ error: "INVALID_PAYMENT_METHOD" })
  })
})

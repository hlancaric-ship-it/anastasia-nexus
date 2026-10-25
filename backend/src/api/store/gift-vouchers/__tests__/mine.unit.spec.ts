import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { GIFT_VOUCHER_MODULE } from "../../../../modules/gift-voucher"
import { GET as listMine } from "../mine/route"
import { GET as pdfMine } from "../mine/[id]/pdf/route"

// Poukazy v zákazníckej zóne: zákazník vidí len poukazy zo svojich objednávok
// (účet alebo nákup bez prihlásenia na rovnaký e-mail), cudzí poukaz je 404.

const future = new Date(Date.now() + 86400000 * 300)
const voucher = (id: string, order: string) => ({
  id, code: `ANA-${id.toUpperCase()}`, code_last4: id.slice(-4), currency_code: "eur", initial_amount: "5000", balance: "5000",
  status: "active", issued_at: new Date(), expires_at: future, source_order_id: order, recipient_name: null, delivery_attempts: 0,
})

function scope() {
  const graph = jest.fn(async ({ entity, filters }: any) => {
    if (entity === "customer") return { data: [{ id: "cus_1", email: "Jana@Example.test" }] }
    if (filters.customer_id === "cus_1") return { data: [{ id: "order_acc" }] }
    if (filters.email === "jana@example.test") return { data: [{ id: "order_guest" }] }
    return { data: [] }
  })
  const listGiftVouchers = jest.fn(async (f: any) =>
    [voucher("gv_a", "order_acc"), voucher("gv_b", "order_guest"), voucher("gv_x", "order_other")].filter((v) => f.source_order_id.includes(v.source_order_id)))
  const logger = { error: jest.fn() }
  return {
    graph, listGiftVouchers,
    resolve: (key: string) =>
      key === ContainerRegistrationKeys.QUERY ? { graph } : key === ContainerRegistrationKeys.LOGGER ? logger : key === GIFT_VOUCHER_MODULE ? { listGiftVouchers } : {},
  }
}

function res() {
  const r: any = { statusCode: 200, headers: {} as Record<string, string> }
  r.status = (c: number) => ((r.statusCode = c), r)
  r.json = (b: unknown) => ((r.body = b), r)
  r.send = (b: unknown) => ((r.body = b), r)
  r.setHeader = (k: string, v: string) => ((r.headers[k] = v), r)
  return r
}

const req = (s: any, actor?: string, params: Record<string, string> = {}) =>
  ({ scope: s, params, auth_context: actor ? { actor_type: "customer", actor_id: actor } : undefined }) as any

describe("GET /store/gift-vouchers/mine", () => {
  it("bez prihlásenia vráti 401", async () => {
    const r = res()
    await listMine(req(scope()), r)
    expect(r.statusCode).toBe(401)
  })

  it("vráti poukazy z účtu aj z nákupu bez prihlásenia na rovnaký e-mail, s celým kódom", async () => {
    const s = scope(); const r = res()
    await listMine(req(s, "cus_1"), r)
    expect(r.statusCode).toBe(200)
    expect(r.headers["Cache-Control"]).toBe("private, no-store")
    expect(r.body.vouchers.map((v: any) => v.id).sort()).toEqual(["gv_a", "gv_b"])
    expect(r.body.vouchers[0]).toMatchObject({ initial_amount: 50, balance: 50, status: "active" })
    expect(r.body.vouchers[0].code).toMatch(/^ANA-/)
  })

  it("cudzí poukaz v PDF je 404", async () => {
    const r = res()
    await pdfMine(req(scope(), "cus_1", { id: "gv_x" }), r)
    expect(r.statusCode).toBe(404)
  })
})

import { POST as CANCEL } from "../[id]/cancel/route"
import { POST as NOTE, GET as LIST } from "../[id]/notes/route"
import { POST as REFUND } from "../[id]/refund/route"

const cancelRun = jest.fn(async () => ({}))
const cancelOrderWorkflow = jest.fn(() => ({ run: cancelRun }))
const refundRun = jest.fn(async () => ({}))
const refundPaymentWorkflow = jest.fn(() => ({ run: refundRun }))
jest.mock("@medusajs/medusa/core-flows", () => ({
  cancelOrderWorkflow: (...args: any[]) => (cancelOrderWorkflow as any)(...args),
  refundPaymentWorkflow: (...args: any[]) => (refundPaymentWorkflow as any)(...args),
}))

const levels: any[] = [{ id: "ilev_1", location_id: "loc_1", stocked_quantity: 3, reserved_quantity: 5 }]
const updateInventoryLevels = jest.fn(async (updates: any[]) => updates.map((u) => ({ ...u })))
const listInventoryLevels = jest.fn(async () => levels)
const listInventoryItems = jest.fn(async () => [{ id: "iitem_1", sku: "EP.001" }])
jest.mock("../../../../../lib/observability/audit", () => ({
  adminActor: (r: any) => (r.auth_context?.actor_type === "user" ? r.auth_context.actor_id : null),
  auditAdminChange: jest.fn(async () => "audit_1"),
}))

const order: any = { id: "order_1", status: "open", metadata: {}, items: [{ id: "item_1", quantity: 2, variant_sku: "EP.001" }] }
const updateOrders = jest.fn(async (_id: string, patch: any) => {
  Object.assign(order, patch)
  return order
})
const retrieveOrder = jest.fn(async () => order)
const retrieveUser = jest.fn(async () => ({ id: "user_1", email: "lucia@anastasia.sk" }))
const graph = jest.fn(async () => ({ data: [{ id: "order_1", payment_collections: [{ payments: [{ id: "pay_1" }] }] }] }))

function fixture(actorId: string | null = "user_1", body: unknown = {}, id = "order_1") {
  const req: any = {
    body,
    query: {},
    params: { id },
    auth_context: actorId ? { actor_type: "user", actor_id: actorId } : undefined,
    scope: {
      resolve: (key: string) => {
        if (key === "order") return { retrieveOrder, updateOrders }
        if (key === "user") return { retrieveUser }
        if (key === "inventory") return { listInventoryItems, listInventoryLevels, updateInventoryLevels }
        if (key === "query") return { graph }
        return { error: jest.fn(), info: jest.fn() }
      },
    },
  }
  const res: any = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() }
  return { req, res }
}

beforeEach(() => {
  jest.clearAllMocks()
  order.status = "open"
  order.metadata = {}
  levels[0].stocked_quantity = 3
  levels[0].reserved_quantity = 5
})

describe("Zrušenie objednávky s dôvodom", () => {
  it("bez prihlásenia sa nič nestane", async () => {
    const f = fixture(null, { reason: "zrušené" })
    await CANCEL(f.req, f.res)
    expect(f.res.status).toHaveBeenCalledWith(401)
    expect(cancelOrderWorkflow).not.toHaveBeenCalled()
  })

  it("bez dôvodu sa objednávka zrušiť nedá", async () => {
    const f = fixture("user_1", { reason: "   " })
    await CANCEL(f.req, f.res)
    expect(f.res.status).toHaveBeenCalledWith(400)
    expect(f.res.json.mock.calls[0][0].message).toBe("Dôvod zrušenia je povinný.")
    expect(cancelOrderWorkflow).not.toHaveBeenCalled()
  })

  it("zruší objednávku, uloží dôvod, kto a kedy a zapíše audit", async () => {
    const f = fixture("user_1", { reason: "zákazník zrušil telefonicky" })
    await CANCEL(f.req, f.res)
    expect(f.res.status).toHaveBeenCalledWith(200)
    expect(cancelOrderWorkflow).toHaveBeenCalledWith(f.req.scope)
    expect(cancelRun).toHaveBeenCalledWith({ input: { order_id: "order_1", canceled_by: "user_1" } })
    const stored = order.metadata.anastasia_cancel
    expect(stored.reason).toBe("zákazník zrušil telefonicky")
    expect(stored.by).toBe("user_1")
    expect(typeof stored.at).toBe("string")
    const { auditAdminChange } = require("../../../../../lib/observability/audit")
    expect(auditAdminChange).toHaveBeenCalledWith(expect.anything(), "order.cancel", "order", "order_1", null, expect.objectContaining({ reason: "zákazník zrušil telefonicky" }))
  })

  it("už zrušenú objednávku neuhadne", async () => {
    order.status = "canceled"
    const f = fixture("user_1", { reason: "x" })
    await CANCEL(f.req, f.res)
    expect(f.res.status).toHaveBeenCalledWith(409)
    expect(cancelOrderWorkflow).not.toHaveBeenCalled()
  })
})

describe("Poznámky k objednávke", () => {
  it("prázdna poznámka sa odmietne", async () => {
    const f = fixture("user_1", { body: "  " })
    await NOTE(f.req, f.res)
    expect(f.res.status).toHaveBeenCalledWith(400)
    expect(f.res.json.mock.calls[0][0].message).toBe("Poznámka nemôže byť prázdna.")
    expect(updateOrders).not.toHaveBeenCalled()
  })

  it("poznámka sa uloží s autorom, časom a auditom", async () => {
    const f = fixture("user_1", { body: "zákazník si želá zabalenie daru" })
    await NOTE(f.req, f.res)
    expect(f.res.status).toHaveBeenCalledWith(201)
    const note = f.res.json.mock.calls[0][0].note
    expect(note.body).toBe("zákazník si želá zabalenie daru")
    expect(note.by).toBe("user_1")
    expect(note.by_email).toBe("lucia@anastasia.sk")
    expect(typeof note.at).toBe("string")
    expect(order.metadata.anastasia_notes).toHaveLength(1)
    const { auditAdminChange } = require("../../../../../lib/observability/audit")
    expect(auditAdminChange).toHaveBeenCalledWith(expect.anything(), "order.note_created", "order", "order_1", null, expect.objectContaining({ by: "user_1" }))
  })

  it("poznámky sa pripĺňajú a prečítajú späť", async () => {
    const first = fixture("user_1", { body: "prvá" })
    await NOTE(first.req, first.res)
    const f = fixture("user_1", { body: "druhá" })
    await NOTE(f.req, f.res)
    expect(order.metadata.anastasia_notes).toHaveLength(2)
    const list = fixture()
    await LIST(list.req, list.res)
    expect(list.res.json.mock.calls[0][0].notes).toHaveLength(2)
  })
})

describe("Vrátenie peňazí a tovaru na sklad", () => {
  it("bez dôvodu sa vrátenie neodosle", async () => {
    const f = fixture("user_1", { payment_id: "pay_1", amount: 10, note: "  " })
    await REFUND(f.req, f.res)
    expect(f.res.status).toHaveBeenCalledWith(400)
    expect(f.res.json.mock.calls[0][0].message).toBe("Dôvod vrátenia je povinný.")
    expect(refundRun).not.toHaveBeenCalled()
  })

  it("bez sumy sa vrátenie neodosle", async () => {
    const f = fixture("user_1", { payment_id: "pay_1", amount: 0, note: "reklamácia" })
    await REFUND(f.req, f.res)
    expect(f.res.status).toHaveBeenCalledWith(400)
    expect(refundRun).not.toHaveBeenCalled()
  })

  it("platbu z cudzej objednávky nevráti", async () => {
    const f = fixture("user_1", { payment_id: "pay_other", amount: 25, note: "reklamácia" })
    await REFUND(f.req, f.res)
    expect(f.res.status).toHaveBeenCalledWith(400)
    expect(f.res.json.mock.calls[0][0].message).toBe("Platba nepatrí k tejto objednávke.")
    expect(refundRun).not.toHaveBeenCalled()
  })

  it("vrátenie peňazí zapíše audit", async () => {
    const f = fixture("user_1", { payment_id: "pay_1", amount: 25, note: "zákazník vracia tovar" })
    await REFUND(f.req, f.res)
    expect(f.res.status).toHaveBeenCalledWith(200)
    expect(refundRun).toHaveBeenCalledWith({ input: { payment_id: "pay_1", amount: 25, note: "zákazník vracia tovar", created_by: "user_1" } })
    const { auditAdminChange } = require("../../../../../lib/observability/audit")
    expect(auditAdminChange).toHaveBeenCalledWith(expect.anything(), "order.refund", "order", "order_1", null, expect.objectContaining({ amount: 25, restock: false }))
    expect(updateInventoryLevels).not.toHaveBeenCalled()
  })

  it("so zaškrtnutím sa tovar vráti na sklad a rezervácia sa uvoľní", async () => {
    const f = fixture("user_1", { payment_id: "pay_1", amount: 25, note: "zákazník vracia tovar", restock: true })
    await REFUND(f.req, f.res)
    expect(f.res.status).toHaveBeenCalledWith(200)
    expect(listInventoryItems).toHaveBeenCalledWith({ sku: ["EP.001"] }, { take: 200 })
    expect(updateInventoryLevels).toHaveBeenCalledWith([{ id: "ilev_1", location_id: "loc_1", stocked_quantity: 5, reserved_quantity: 3 }])
    const body = f.res.json.mock.calls[0][0]
    expect(body.restocked).toBe(2)
    const { auditAdminChange } = require("../../../../../lib/observability/audit")
    expect(auditAdminChange).toHaveBeenCalledWith(expect.anything(), "order.refund", "order", "order_1", null, expect.objectContaining({ restock: true, restocked: 2 }))
  })
})

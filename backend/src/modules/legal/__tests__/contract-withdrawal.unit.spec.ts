import { POST as submit } from "../../../api/store/contract-withdrawal/route"
import { GET as list } from "../../../api/admin/contract-withdrawals/route"
import { POST as transition } from "../../../api/admin/contract-withdrawals/[id]/route"
import { parseContractWithdrawal } from "../../../api/store/contract-withdrawal/policy"

jest.mock("../../../lib/observability/audit", () => ({ auditAdminChange: jest.fn(async () => "audit") }))
import { auditAdminChange } from "../../../lib/observability/audit"

const response = () => ({ setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn(), send: jest.fn() })

const VALID = {
  order_number: "2026-0142",
  email: "zakaznik@example.test",
  items: "Kurz RESET 40+\nPracovný zošit",
  order_date: "2026-10-12",
  name: "Jana",
  reason: "",
  consent: true,
  website: "",
}

function request(service: any, body: any = {}, actor: any = undefined) {
  const sent: any[] = []
  const created: any[] = []
  const notification = {
    listNotifications: jest.fn(async (filters: any = {}) => {
      if (filters.idempotency_key) return created.filter(row => row.idempotency_key === filters.idempotency_key)
      if (filters.id) return created.filter(row => row.id === filters.id)
      return []
    }),
    createNotifications: jest.fn(async (dto: any) => {
      sent.push(dto)
      const row = { id: `n${sent.length}`, status: "success", to: dto.to, channel: "email", template: dto.template, idempotency_key: dto.idempotency_key, resource_id: dto.resource_id, resource_type: dto.resource_type }
      created.push(row)
      return row
    }),
  }
  const req: any = {
    params: {}, body, query: {}, auth_context: actor,
    scope: {
      resolve: (key: string) => {
        if (key === "notification") return notification
        if (key === "logger") return { error: jest.fn(), info: jest.fn(), warn: jest.fn() }
        if (key === "legal") return service
        if (key === "ops_audit") return { createOpsEvents: jest.fn(async () => ({ id: "e" })) }
        throw new Error(`unknown service ${key}`)
      },
    },
  }
  return { req, sent, notification }
}

describe("online odstúpenie od zmluvy – formulár", () => {
  it("vyžaduje číslo objednávky, e-mail, položky, dátum a súhlas", () => {
    const parsed = parseContractWithdrawal(VALID)
    expect(parsed.ok).toBe(true)
    if (parsed.ok !== true) return
    expect(parsed.value.order_number).toBe("2026-0142")
    expect(parsed.value.email).toBe("zakaznik@example.test")
    expect(parsed.value.items).toEqual(["Kurz RESET 40+", "Pracovný zošit"])
    expect(parsed.value.order_date).toBe("2026-10-12T00:00:00.000Z")
    expect(parsed.value.reason).toBeNull()

    const missing = parseContractWithdrawal({ ...VALID, order_number: "", email: "nie-e-mail", items: "", order_date: "12. 10. 2026", consent: false })
    expect(missing.ok).toBe(false)
    if (missing.ok) return
    expect(missing.errors).toEqual(expect.arrayContaining(["order_number", "email", "items", "order_date", "consent"]))
  })

  it("bot s vyplnenou pastou dostane rovnakú odpoveď ako človek a nič sa neuloží", () => {
    expect(parseContractWithdrawal({ ...VALID, website: "http://spam.test" })).toEqual({ ok: "spam" })
  })

  it("rovnaké oznámenie má rovnaký odtlačok – opakované odoslanie nevytvorí druhý záznam", () => {
    const first = parseContractWithdrawal(VALID)
    const second = parseContractWithdrawal({ ...VALID })
    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
    if (first.ok !== true || second.ok !== true) return
    expect(second.value.fingerprint).toBe(first.value.fingerprint)
    const other = parseContractWithdrawal({ ...VALID, order_number: "2026-0143" })
    expect(other.ok === true ? other.value.fingerprint : null).not.toBe(first.value.fingerprint)
  })
})

describe("online odstúpenie od zmluvy – trasa", () => {
  it("uloží záznam pre správcu a pošle zákazníkovi potvrdenie doručenia", async () => {
    const row = { id: "lcw_1", order_number: "2026-0142", status: "received", received_at: new Date("2026-10-21T08:00:00Z") }
    const service = { requestContractWithdrawal: jest.fn(async () => ({ row, replayed: false })) }
    const { req, sent } = request(service, VALID)
    const res = response()
    await submit(req, res as any)
    expect(res.status).toHaveBeenCalledWith(201)
    expect(service.requestContractWithdrawal).toHaveBeenCalledWith(expect.objectContaining({ order_number: "2026-0142", email: "zakaznik@example.test" }))
    const confirmation = sent.find(email => email.template === "contract-withdrawal-received-sk")
    expect(confirmation).toBeDefined()
    expect(confirmation.to).toBe("zakaznik@example.test")
    expect(confirmation.idempotency_key).toBe("contract-withdrawal.received:lcw_1")
    expect(confirmation.data).toEqual(expect.objectContaining({ order_number: "2026-0142", items: ["Kurz RESET 40+", "Pracovný zošit"] }))
  })

  it("opakované odoslanie rovnakého oznámenia nevytvorí druhý záznam", async () => {
    const row = { id: "lcw_1", order_number: "2026-0142", status: "received", received_at: new Date("2026-10-21T08:00:00Z") }
    const service = { requestContractWithdrawal: jest.fn(async () => ({ row, replayed: true })) }
    const { req } = request(service, VALID)
    const res = response()
    await submit(req, res as any)
    expect(res.status).toHaveBeenCalledWith(200)
  })

  it("neplatný formulár sa odmietne a nič sa neuloží", async () => {
    const service = { requestContractWithdrawal: jest.fn() }
    const { req } = request(service, { ...VALID, consent: false })
    const res = response()
    await submit(req, res as any)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(service.requestContractWithdrawal).not.toHaveBeenCalled()
  })

  it("robot dostane rovnakú odpoveď ako človek a nič sa neuloží", async () => {
    const service = { requestContractWithdrawal: jest.fn() }
    const { req, sent } = request(service, { ...VALID, website: "http://spam.test" })
    const res = response()
    await submit(req, res as any)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true }))
    expect(service.requestContractWithdrawal).not.toHaveBeenCalled()
    expect(sent).toHaveLength(0)
  })
})

describe("online odstúpenie od zmluvy – administrácia", () => {
  it("zoznam je len pre prihláseného správcu", async () => {
    const service = { listAndCountLegalContractWithdrawals: jest.fn(async () => [[{ id: "lcw_1" }], 1]) }
    const { req } = request(service)
    const denied = response()
    await list(req, denied as any)
    expect(denied.status).toHaveBeenCalledWith(401)

    req.auth_context = { actor_type: "user", actor_id: "admin" }
    const allowed = response()
    await list(req, allowed as any)
    expect(allowed.status).not.toHaveBeenCalledWith(401)
    expect(allowed.json).toHaveBeenCalledWith(expect.objectContaining({ count: 1 }))
  })

  it("zmena stavu sa zapíše do auditu, opakovaný prechod nie", async () => {
    const service = { transitionContractWithdrawal: jest.fn(async () => ({ row: { id: "lcw_1", status: "processed" }, before: "received", replayed: false })) }
    const { req } = request(service, { status: "processed" })
    req.params = { id: "lcw_1" }
    req.auth_context = { actor_type: "user", actor_id: "admin" }
    await transition(req, response() as any)
    expect(auditAdminChange).toHaveBeenCalledWith(req, "contract_withdrawal.status", "legal_contract_withdrawal", "lcw_1", { status: "received" }, { status: "processed" })
    ;(auditAdminChange as jest.Mock).mockClear()
    service.transitionContractWithdrawal = jest.fn(async () => ({ row: { id: "lcw_1", status: "processed" }, before: "processed", replayed: true }))
    await transition(req, response() as any)
    expect(auditAdminChange).not.toHaveBeenCalled()
  })
})

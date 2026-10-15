import { adminActor, recordAudit } from "../audit"
import { runWithRequestId } from "../log"

const makeScope = (create: jest.Mock) => {
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
  const scope = { resolve: (key: string) => (key === "logger" ? logger : { createOpsAuditEntries: create }) }
  return { scope: scope as any, logger }
}
const input = { actor_type: "user" as const, actor_id: "user_1", action: "entitlement.revoke", entity_type: "entitlement", entity_id: "ent_1", before: { status: "active" }, after: { status: "revoked" } }

describe("observability/recordAudit", () => {
  it("uloží záznam s request_id z kontextu a zaloguje admin_audit", async () => {
    const create = jest.fn().mockResolvedValue({ id: "oaud_1" })
    const { scope, logger } = makeScope(create)
    const id = await runWithRequestId("req_abcdefgh", () => recordAudit(scope, input))
    expect(id).toBe("oaud_1")
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ request_id: "req_abcdefgh", changes: { status: { from: "active", to: "revoked" } } }))
    const line = JSON.parse(logger.info.mock.calls[0][0])
    expect(line).toMatchObject({ domain: "admin_audit", event: "entitlement.revoke", audit_id: "oaud_1", changed_fields: ["status"], request_id: "req_abcdefgh" })
  })

  it("selhání zápisu vrátí null a zaloguje audit_write_failed", async () => {
    const { scope, logger } = makeScope(jest.fn().mockRejectedValue(new Error("db down")))
    await expect(recordAudit(scope, input)).resolves.toBeNull()
    expect(JSON.parse(logger.error.mock.calls[0][0])).toMatchObject({ event: "audit_write_failed", entity_id: "ent_1" })
  })

  it("neplatný vstup nevyhodí, jen zaloguje audit_invalid_input", async () => {
    const create = jest.fn()
    const { scope, logger } = makeScope(create)
    await expect(recordAudit(scope, { ...input, action: "BAD" })).resolves.toBeNull()
    expect(create).not.toHaveBeenCalled()
    expect(JSON.parse(logger.error.mock.calls[0][0]).event).toBe("audit_invalid_input")
  })

  it("adminActor vrací jen uživatele adminu", () => {
    expect(adminActor({ auth_context: { actor_type: "user", actor_id: "user_1" } })).toBe("user_1")
    expect(adminActor({ auth_context: { actor_type: "customer", actor_id: "cus_1" } })).toBeNull()
    expect(adminActor({})).toBeNull()
  })
})

import { auditPage, AUDIT_PAGE_MAX, buildAuditEntry, diffForAudit } from "../policy"

describe("ops-audit/policy", () => {
  it("diffForAudit vrací jen změněná pole, bez časových razítek, zredigovaně", () => {
    expect(diffForAudit(
      { title: "A", duration: 60, metadata: { b: 1, a: 2 }, updated_at: "x", email: "a@b.cz" },
      { title: "B", duration: 60, metadata: { a: 2, b: 1 }, updated_at: "y", email: "c@d.cz" },
    )).toEqual({ title: { from: "A", to: "B" } })
    expect(diffForAudit(null, { title: "N" })).toEqual({ title: { from: null, to: "N" } })
    expect(diffForAudit({ status: "active" }, null)).toEqual({ status: { from: "active", to: null } })
    expect(diffForAudit({ email: "a@b.cz" }, { email: "c@d.cz" })).toEqual({})
  })

  it("buildAuditEntry validuje aktéra, akci a entitu", () => {
    const base = { actor_type: "user" as const, actor_id: "user_1", action: "booking_type.update", entity_type: "booking_type" }
    expect(buildAuditEntry({ ...base, entity_id: "prod_1", before: { a: 1 }, after: { a: 2 }, request_id: "req_12345678" })).toEqual({
      actor_type: "user", actor_id: "user_1", action: "booking_type.update", entity_type: "booking_type",
      entity_id: "prod_1", changes: { a: { from: 1, to: 2 } }, request_id: "req_12345678",
    })
    expect(buildAuditEntry(base).entity_id).toBeNull()
    expect(() => buildAuditEntry({ ...base, actor_id: "" })).toThrow("OPS_AUDIT_INVALID_ACTOR")
    expect(() => buildAuditEntry({ ...base, actor_type: "customer" as any })).toThrow("OPS_AUDIT_INVALID_ACTOR")
    expect(() => buildAuditEntry({ ...base, action: "Bad Action" })).toThrow("OPS_AUDIT_INVALID_ACTION")
    expect(() => buildAuditEntry({ ...base, entity_type: "x" })).toThrow("OPS_AUDIT_INVALID_ENTITY")
  })

  it("auditPage ořeže limit a offset", () => {
    expect(auditPage(undefined)).toEqual({ limit: 50, offset: 0 })
    expect(auditPage({ limit: "5000", offset: "-3" })).toEqual({ limit: AUDIT_PAGE_MAX, offset: 0 })
    expect(auditPage({ limit: "0", offset: "20" })).toEqual({ limit: 50, offset: 20 })
    expect(auditPage({ limit: "abc", offset: "x" })).toEqual({ limit: 50, offset: 0 })
  })
})

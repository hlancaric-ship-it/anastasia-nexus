import { denyRevokedToken } from "../auth-revoke-middlewares"
import { POST as logout } from "../store/nexus-auth/logout/route"
import { sha256Hex } from "../../modules/auth-magic-link/policy"

type Fixture = {
  db: { raw: jest.Mock }
  logger: { error: jest.Mock; warn: jest.Mock }
  req: any
  res: { status: jest.Mock; json: jest.Mock; setHeader: jest.Mock }
  next: jest.Mock
}

/** Revokačná tabuľka: `revoked` = SELECT nájde revokáciu (token je zneplatnený). */
function fixture(revoked = false) {
  const db = { raw: jest.fn(async () => ({ rows: revoked ? [{ one: 1 }] : [] })) }
  const logger = { error: jest.fn(), warn: jest.fn() }
  const req: any = {
    headers: { authorization: "Bearer synthetic-token" },
    auth_context: { actor_type: "customer", actor_id: "cus_synthetic" },
    scope: { resolve: (key: string) => (key === "__pg_connection__" ? db : logger) },
  }
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn(), setHeader: jest.fn() }
  return { db, logger, req, res, next: jest.fn() } as Fixture
}

describe("revokácia JWT zákazníka", () => {
  it("odmietne revokovaný token stavom 401 SESSION_REVOKED", async () => {
    const f = fixture(true)
    await denyRevokedToken(f.req, f.res, f.next)
    expect(f.res.status).toHaveBeenCalledWith(401)
    expect(f.res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "SESSION_REVOKED" }))
    expect(f.next).not.toHaveBeenCalled()
  })

  it("platný token pustí ďalej", async () => {
    const f = fixture()
    await denyRevokedToken(f.req, f.res, f.next)
    expect(f.next).toHaveBeenCalledTimes(1)
    expect(f.res.status).not.toHaveBeenCalled()
  })

  it("bez Bearer hlavičky sa nedotáže databázy", async () => {
    const f = fixture()
    delete f.req.headers.authorization
    await denyRevokedToken(f.req, f.res, f.next)
    expect(f.db.raw).not.toHaveBeenCalled()
    expect(f.next).toHaveBeenCalledTimes(1)
  })

  it("hľadá token podľa hashu, nie podľa surového tokenu", async () => {
    const f = fixture()
    await denyRevokedToken(f.req, f.res, f.next)
    expect(f.db.raw.mock.calls[0][1]).toEqual([sha256Hex("synthetic-token")])
    expect(f.db.raw.mock.calls[0][0]).toContain("expires_at > now()")
  })

  it("výpadok databázy request nezablokuje a token neloguje", async () => {
    const f = fixture()
    f.db.raw.mockRejectedValue(new Error("synthetic database failure"))
    await denyRevokedToken(f.req, f.res, f.next)
    expect(f.next).toHaveBeenCalledTimes(1)
    expect(f.res.status).not.toHaveBeenCalled()
    expect(f.logger.warn).toHaveBeenCalled()
    expect(JSON.stringify(f.logger.warn.mock.calls)).not.toContain("synthetic-token")
  })
})

describe("odhlásenie zákazníka", () => {
  it("bez tokenu vráti 401", async () => {
    const f = fixture()
    delete f.req.headers.authorization
    await logout(f.req, f.res as any)
    expect(f.res.status).toHaveBeenCalledWith(401)
    expect(f.db.raw).not.toHaveBeenCalled()
  })

  it("bez zákazníckeho kontextu vráti 401", async () => {
    const f = fixture()
    f.req.auth_context = { actor_type: "user", actor_id: "usr_synthetic" }
    await logout(f.req, f.res as any)
    expect(f.res.status).toHaveBeenCalledWith(401)
    expect(f.db.raw).not.toHaveBeenCalled()
  })

  it("zapíše revokáciu tokenu a vráti 200", async () => {
    const f = fixture()
    await logout(f.req, f.res as any)
    expect(f.res.status).toHaveBeenCalledWith(200)
    expect(f.res.json).toHaveBeenCalledWith({ ok: true })
    expect(f.db.raw.mock.calls[0][1][0]).toBe(sha256Hex("synthetic-token"))
    expect(f.db.raw.mock.calls[0][0]).toContain("on conflict (id) do nothing")
  })

  it("výpadok databázy vráti 503 a neodhalí detail", async () => {
    const f = fixture()
    f.db.raw.mockRejectedValue(new Error("synthetic database failure"))
    await logout(f.req, f.res as any)
    expect(f.res.status).toHaveBeenCalledWith(503)
    expect(f.res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "AUTH_UNAVAILABLE" }))
  })
})

import jwt from "jsonwebtoken"
import { denyStaleSessionEpoch } from "../auth-revoke-middlewares"

const secret = "synthetic-session-epoch-secret"
function fixture(claims: any, epochRows: any[] = [{ epoch: 0 }]) {
  const db = { raw: jest.fn(async () => ({ rows: epochRows })) }
  const req: any = {
    path: "/store/customers/me",
    headers: { authorization: `Bearer ${jwt.sign(claims, secret)}` },
    scope: { resolve: (key: string) => key === "__pg_connection__" ? db : { projectConfig: { http: { jwtSecret: secret } } } },
  }
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() }
  return { req, res, db, next: jest.fn() }
}

describe("session epoch request guard", () => {
  it("permits a customer token at the current epoch", async () => {
    const f = fixture({ actor_type: "customer", actor_id: "cus_synthetic", session_epoch: 0 })
    await denyStaleSessionEpoch(f.req, f.res, f.next)
    expect(f.next).toHaveBeenCalledTimes(1)
  })

  it("rejects legacy, wrong-actor, and stale tokens", async () => {
    for (const claims of [
      { actor_type: "customer", actor_id: "cus_synthetic" },
      { actor_type: "user", actor_id: "usr_synthetic", session_epoch: 0 },
      { actor_type: "customer", actor_id: "cus_synthetic", session_epoch: 0 },
    ]) {
      const f = fixture(claims, [{ epoch: 1 }])
      await denyStaleSessionEpoch(f.req, f.res, f.next)
      expect(f.res.status).toHaveBeenCalledWith(401)
      expect(f.res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "SESSION_REVOKED" }))
      expect(f.next).not.toHaveBeenCalled()
    }
  })

  it("fails closed if the epoch store is unavailable", async () => {
    const f = fixture({ actor_type: "customer", actor_id: "cus_synthetic", session_epoch: 0 })
    f.db.raw.mockRejectedValue(new Error("synthetic database failure"))
    await denyStaleSessionEpoch(f.req, f.res, f.next)
    expect(f.res.status).toHaveBeenCalledWith(503)
    expect(f.next).not.toHaveBeenCalled()
  })

  it("checks refresh tokens against their own actor type", async () => {
    const f = fixture({ actor_type: "user", actor_id: "usr_synthetic", session_epoch: 0 })
    f.req.path = "/auth/token/refresh"
    await denyStaleSessionEpoch(f.req, f.res, f.next)
    expect(f.next).toHaveBeenCalledTimes(1)
  })
})

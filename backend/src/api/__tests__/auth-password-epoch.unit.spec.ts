import { asValue, createContainer } from "@medusajs/framework/awilix"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import jwt from "jsonwebtoken"
import { dirname, join } from "node:path"
import { prepareAdminPasswordEpoch } from "../auth-password-epoch"
import { denyStaleSessionEpoch } from "../auth-revoke-middlewares"

const secret = "synthetic-reset-epoch-secret"
function fixture(options: { epochFailure?: boolean; providerFailure?: boolean } = {}) {
  const state = { epoch: 0, events: [] as string[] }
  const db = { raw: jest.fn(async (sql: string, _bindings?: unknown[]) => {
    if (sql.startsWith("select")) return { rows: [{ epoch: state.epoch }] }
    if (options.epochFailure) throw new Error("synthetic epoch outage")
    state.events.push("epoch")
    return { rows: [{ epoch: ++state.epoch }] }
  }) }
  const auth = {
    marker: "original service",
    getMarker() { return this.marker },
    updateProvider: jest.fn(async () => {
      state.events.push("password")
      if (options.providerFailure) throw new Error("synthetic provider failure")
      return { success: true, authIdentity: { id: "auth_synthetic" } }
    }),
  }
  const users = { listUsers: jest.fn(async () => [{ id: "usr_synthetic" }]) }
  const root = createContainer().register({
    [Modules.AUTH]: asValue(auth), [Modules.USER]: asValue(users),
    [ContainerRegistrationKeys.PG_CONNECTION]: asValue(db),
    [ContainerRegistrationKeys.CONFIG_MODULE]: asValue({ projectConfig: { http: { jwtSecret: secret } } }),
  })
  const req: any = { params: { actor_type: "user", auth_provider: "emailpass" }, scope: root.createScope() }
  const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() }, next = jest.fn()
  const validateReset = () => { req.auth_context = { actor_type: "user", actor_id: "admin@example.test", auth_identity_id: "auth_synthetic" } }
  const update = () => req.scope.resolve(Modules.AUTH).updateProvider("emailpass", { entity_id: "admin@example.test", password: "synthetic-new-password" })
  return { root, req, res, next, db, auth, users, state, validateReset, update }
}

describe("administrator password reset epoch ordering", () => {
  it("works with the installed Medusa reset-token validator and native update route", async () => {
    const medusaDist = dirname(require.resolve("@medusajs/medusa"))
    const { validateToken } = require(join(medusaDist, "api/auth/utils/validate-token.js"))
    const { POST } = require(join(medusaDist, "api/auth/[actor_type]/[auth_provider]/update/route.js"))
    const f = fixture()
    const auth = Object.assign(f.auth, {
      consumePasswordResetToken: jest.fn(async () => { f.state.events.push("reset-token") }),
      listProviderIdentities: jest.fn(async () => [{ auth_identity_id: "auth_synthetic", entity_id: "admin@example.test", user_metadata: {} }]),
    })
    f.req.headers = { authorization: `Bearer ${jwt.sign({ actor_type: "user", entity_id: "admin@example.test", purpose: "reset", jti: "synthetic-reset-id" }, secret, { expiresIn: "10m" })}` }
    f.req.body = { password: "synthetic-new-password" }
    prepareAdminPasswordEpoch(f.req, f.res, f.next)
    const afterValidation = jest.fn()
    await validateToken()(f.req, f.res, afterValidation)
    expect(afterValidation).toHaveBeenCalledWith()
    await POST(f.req, f.res)
    expect(f.state.events).toEqual(["reset-token", "epoch", "password"])
    expect(auth.consumePasswordResetToken).toHaveBeenCalledTimes(1)
    expect(f.res.json).toHaveBeenCalledWith({ success: true })
  })
  it("does nothing before native token validation and advances the epoch before the password write", async () => {
    const f = fixture()
    prepareAdminPasswordEpoch(f.req, f.res, f.next)
    expect(f.next).toHaveBeenCalledTimes(1)
    expect(f.db.raw).not.toHaveBeenCalled()
    f.validateReset()
    await expect(f.update()).resolves.toMatchObject({ success: true })
    expect(f.state.events).toEqual(["epoch", "password"])
    expect(f.db.raw.mock.calls[0][1]).toEqual([expect.any(String), "user", "usr_synthetic"])
    expect(f.root.resolve(Modules.AUTH)).toBe(f.auth)
    expect(f.root.createScope().resolve(Modules.AUTH)).toBe(f.auth)
    expect(f.req.scope.resolve(Modules.AUTH).getMarker()).toBe("original service")
  })

  it("never updates the password when the epoch write fails", async () => {
    const f = fixture({ epochFailure: true })
    prepareAdminPasswordEpoch(f.req, f.res, f.next)
    f.validateReset()
    await expect(f.update()).rejects.toThrow("synthetic epoch outage")
    expect(f.auth.updateProvider).not.toHaveBeenCalled()
    expect(f.state.epoch).toBe(0)
  })

  it("never rolls the epoch back if the provider fails", async () => {
    const f = fixture({ providerFailure: true })
    prepareAdminPasswordEpoch(f.req, f.res, f.next)
    f.validateReset()
    await expect(f.update()).rejects.toThrow("synthetic provider failure")
    expect(f.state.events).toEqual(["epoch", "password"])
    expect(f.state.epoch).toBe(1)
    expect(f.db.raw).toHaveBeenCalledTimes(1)
  })

  it("refuses an unvalidated context or another entity before changing anything", async () => {
    const f = fixture()
    prepareAdminPasswordEpoch(f.req, f.res, f.next)
    await expect(f.update()).rejects.toThrow("AUTH_RESET_ACTOR_INVALID")
    f.validateReset()
    await expect(f.req.scope.resolve(Modules.AUTH).updateProvider("emailpass", { entity_id: "other@example.test" })).rejects.toThrow("AUTH_RESET_ACTOR_INVALID")
    expect(f.db.raw).not.toHaveBeenCalled()
    expect(f.auth.updateProvider).not.toHaveBeenCalled()
  })

  it("rejects the old admin session after a successful password reset", async () => {
    const f = fixture()
    const token = jwt.sign({ actor_type: "user", actor_id: "usr_synthetic", session_epoch: 0 }, secret)
    prepareAdminPasswordEpoch(f.req, f.res, f.next)
    f.validateReset()
    await f.update()
    const next = jest.fn()
    await denyStaleSessionEpoch({ path: "/admin/users/me", headers: { authorization: `Bearer ${token}` }, scope: f.req.scope }, f.res, next)
    expect(f.res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })
})

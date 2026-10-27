import { createServer, type Server } from "node:http"
import { dirname, join } from "node:path"
import jwt from "jsonwebtoken"
import { authenticate } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { authRevokeMiddlewares } from "../auth-revoke-middlewares"
import { POST as adminLogoutAll } from "../admin/nexus-auth/logout-all/route"
import { POST as customerLogoutAll } from "../store/nexus-auth/logout-all/route"
import { nexusAuthAdminMiddlewares } from "../admin/nexus-auth/middlewares"
import { nexusAuthStoreMiddlewares } from "../store/nexus-auth/middlewares"

const express = require("express")
const session = require("express-session")
const nativeSessionPost = require(join(dirname(require.resolve("@medusajs/medusa")), "api/auth/session/route.js")).POST
const servers: Server[] = []
const secret = "synthetic-c7-session-secret"
type Actor = "user" | "customer"

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => {
    server.closeAllConnections()
    server.close(() => resolve())
  })))
})

async function fixture() {
  const epochs = new Map<string, number>()
  const state = { failEpoch: false }
  const db = { raw: jest.fn(async (sql: string, bindings: any[] = []) => {
    if (!sql.includes("auth_session_epoch")) return { rows: [] }
    if (state.failEpoch) throw new Error("synthetic epoch outage")
    const insert = sql.trimStart().startsWith("insert")
    const key = `${bindings[insert ? 1 : 0]}:${bindings[insert ? 2 : 1]}`
    if (insert) epochs.set(key, (epochs.get(key) ?? 0) + 1)
    return { rows: [{ epoch: epochs.get(key) ?? 0 }] }
  }) }
  const config = { projectConfig: { http: { jwtSecret: secret } } }
  const scope = { resolve: (key: string) => key === ContainerRegistrationKeys.PG_CONNECTION ? db : key === ContainerRegistrationKeys.CONFIG_MODULE ? config : { warn: jest.fn(), error: jest.fn() } }
  const app = express()
  app.use(express.json())
  app.use(session({ secret, resave: false, saveUninitialized: false }))
  app.use((req: any, _res: any, next: any) => { req.scope = scope; next() })
  let seededContext: any
  app.post("/__fixture/session", (req: any, res: any) => { req.session.auth_context = seededContext; res.json({ ok: true }) })
  // This is how Medusa registers global middleware (app.use strips the matched path).
  for (const route of [...authRevokeMiddlewares, ...nexusAuthAdminMiddlewares, ...nexusAuthStoreMiddlewares]) {
    if (route.method) for (const method of Array.isArray(route.method) ? route.method : [route.method]) app[method.toLowerCase()](route.matcher, ...(route.middlewares || []))
    else app.use(route.matcher, ...(route.middlewares || []))
  }
  app.post("/auth/session", authenticate("*", ["bearer"]), nativeSessionPost)
  app.post("/auth/token/refresh", authenticate("*", ["session", "bearer"]), (_req: any, res: any) => res.json({ ok: true }))
  app.get("/admin/users/me", authenticate("user", ["session", "bearer"]), (_req: any, res: any) => res.json({ ok: true }))
  app.get("/store/customers/me", authenticate("customer", ["session", "bearer"]), (_req: any, res: any) => res.json({ ok: true }))
  app.get("/store/catalog", (_req: any, res: any) => res.json({ ok: true }))
  app.post("/store/customers", authenticate("customer", ["bearer"], { allowUnregistered: true }), (_req: any, res: any) => res.json({ ok: true }))
  app.post("/admin/invites/accept", authenticate("user", ["bearer"], { allowUnregistered: true }), (_req: any, res: any) => res.json({ ok: true }))
  app.post("/admin/nexus-auth/logout-all", adminLogoutAll)
  app.post("/store/nexus-auth/logout-all", customerLogoutAll)
  const server = createServer(app)
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
  const address = server.address() as { port: number }
  const base = `http://127.0.0.1:${address.port}`
  let issued = 0
  const token = (actor: Actor, id: string, epoch: number | undefined = 0) => jwt.sign({ actor_type: actor, actor_id: id, auth_identity_id: "auth_c7_synthetic", ...(epoch === undefined ? {} : { session_epoch: epoch }), jti: `c7_${++issued}` }, secret, { expiresIn: "1h" })
  const send = async (path: string, options: { method?: string; bearer?: string; cookie?: string } = {}) => {
    const response = await fetch(base + path, { method: options.method ?? "GET", headers: { ...(options.bearer ? { authorization: `Bearer ${options.bearer}` } : {}), ...(options.cookie ? { cookie: options.cookie } : {}) } })
    return { status: response.status, body: await response.json() as any, cookie: response.headers.get("set-cookie")?.split(";")[0] }
  }
  const cookieFor = async (bearer: string) => {
    const response = await send("/auth/session", { method: "POST", bearer })
    expect(response.status).toBe(200)
    expect(response.cookie).toBeTruthy()
    return response.cookie!
  }
  const legacyCookie = async (actor: Actor, id: string) => {
    seededContext = { actor_type: actor, actor_id: id, auth_identity_id: "auth_c7_synthetic" }
    return (await send("/__fixture/session", { method: "POST" })).cookie!
  }
  return { send, token, cookieFor, legacyCookie, epochs, state }
}

describe("epoch invalidation through mounted Express middleware and native Medusa authentication", () => {
  it.each([['user', 'bearer'], ['user', 'cookie'], ['customer', 'bearer'], ['customer', 'cookie']] as const)("invalidates two %s %s sessions and preserves another account", async (actor, transport) => {
    const f = await fixture()
    const path = actor === "user" ? "/admin/users/me" : "/store/customers/me"
    const logout = actor === "user" ? "/admin/nexus-auth/logout-all" : "/store/nexus-auth/logout-all"
    const id = actor === "user" ? "user_c7_synthetic" : "cus_c7_synthetic"
    const first = f.token(actor, id), second = f.token(actor, id)
    const device = async (bearer: string) => transport === "cookie" ? { cookie: await f.cookieFor(bearer) } : { bearer }
    const a = await device(first), b = await device(second)
    expect((await f.send(path, a)).status).toBe(200)
    expect((await f.send(path, b)).status).toBe(200)
    expect((await f.send(logout, { method: "POST", ...a })).status).toBe(200)
    expect((await f.send(path, a)).status).toBe(401)
    expect((await f.send(path, b)).status).toBe(401)
    expect((await f.send(path, { bearer: f.token(actor, id + "_other") })).status).toBe(200)
    expect(f.epochs.size).toBe(1)
    expect((await f.send(path, await device(f.token(actor, id, 1)))).status).toBe(200)
  }, 15000)
  it.each([['user', 'bearer'], ['user', 'cookie'], ['customer', 'bearer'], ['customer', 'cookie']] as const)("fails closed for %s %s if the epoch store is unavailable", async (actor, transport) => {
    const f = await fixture(), bearer = f.token(actor, "c7_synthetic")
    const credential = transport === "cookie" ? { cookie: await f.cookieFor(bearer) } : { bearer }
    f.state.failEpoch = true
    expect((await f.send(actor === "user" ? "/admin/users/me" : "/store/customers/me", credential)).status).toBe(503)
  })
  it.each(["user", "customer"] as const)("rejects a legacy %s cookie without an epoch", async actor => {
    const f = await fixture(), cookie = await f.legacyCookie(actor, "c7_synthetic")
    const result = await f.send(actor === "user" ? "/admin/users/me" : "/store/customers/me", { cookie })
    expect(result.status).toBe(401)
    expect(result.body.error).toBe("SESSION_REVOKED")
  })
  it.each(["user", "customer"] as const)("does not let a fresh bearer mask a stale %s cookie, but permits explicit re-login", async actor => {
    const f = await fixture(), id = "c7_synthetic", old = f.token(actor, id)
    const path = actor === "user" ? "/admin/users/me" : "/store/customers/me"
    const logout = actor === "user" ? "/admin/nexus-auth/logout-all" : "/store/nexus-auth/logout-all"
    const cookie = await f.cookieFor(old)
    expect((await f.send(logout, { method: "POST", bearer: old })).status).toBe(200)
    const fresh = f.token(actor, id, 1)
    expect((await f.send(path, { cookie, bearer: fresh })).status).toBe(401)
    expect((await f.send("/auth/session", { method: "POST", cookie, bearer: fresh })).status).toBe(200)
    expect((await f.send(path, { cookie })).status).toBe(200)
  })
  it.each(["user", "customer"] as const)("cannot refresh or create a new session from stale %s credentials", async actor => {
    const f = await fixture(), old = f.token(actor, "c7_synthetic")
    const cookie = await f.cookieFor(old)
    const logout = actor === "user" ? "/admin/nexus-auth/logout-all" : "/store/nexus-auth/logout-all"
    await f.send(logout, { method: "POST", bearer: old })
    expect((await f.send("/auth/token/refresh", { method: "POST", bearer: old })).status).toBe(401)
    expect((await f.send("/auth/token/refresh", { method: "POST", cookie })).status).toBe(401)
    expect((await f.send("/auth/session", { method: "POST", bearer: old })).status).toBe(401)
  })
  it("permits anonymous catalog reads without querying an unavailable epoch store", async () => {
    const f = await fixture(); f.state.failEpoch = true
    expect((await f.send("/store/catalog")).status).toBe(200)
  })
  it("ignores an unrelated admin cookie when native customer authentication selects the customer bearer", async () => {
    const f = await fixture(), cookie = await f.cookieFor(f.token("user", "user_c7_synthetic"))
    const response = await f.send("/store/customers/me", { cookie, bearer: f.token("customer", "cus_c7_synthetic") })
    expect(response.status).toBe(200)
  })
  it("lets an unregistered identity create its customer or accept an admin invite", async () => {
    const f = await fixture()
    const identity = (actor: Actor) => jwt.sign({ actor_type: actor, actor_id: "", auth_identity_id: "auth_c7_new", jti: `c7_new_${actor}` }, secret, { expiresIn: "1h" })
    expect((await f.send("/store/customers", { method: "POST", bearer: identity("customer") })).status).toBe(200)
    expect((await f.send("/admin/invites/accept", { method: "POST", bearer: identity("user") })).status).toBe(200)
    // A customer identity must not pass the admin namespace and vice versa.
    expect((await f.send("/admin/invites/accept", { method: "POST", bearer: identity("customer") })).status).toBe(401)
  })
})

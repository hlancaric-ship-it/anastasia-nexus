import { verifyOperationsStatusHttp } from "./operations-status-http-checks"
import { syntheticBuyer } from "./customer-fixtures"
import { generateJwtToken, Modules } from "@medusajs/framework/utils"
import { signEdgeBatch } from "../../src/modules/ops-audit/edge-ingest"

/**
 * Pozorovatelnost přes skutečné HTTP: x-request-id korelace, trvalé provozní události
 * (GET /admin/ops/events) a trvalý audit admin změn (GET /admin/ops/audit). Jen syntetická data.
 */
export async function verifyOpsObservability({ api, container, options, evidence, bookingRan }: any) {
  const [user] = await container.resolve(Modules.USER).createUsers([{ email: "ops-admin@example.test" }])
  const token = generateJwtToken({ actor_id: user.id, actor_type: "user", auth_identity_id: `synthetic-${user.id}`, app_metadata: { user_id: user.id, session_epoch: 0 } }, { secret: process.env.JWT_SECRET!, expiresIn: "1h" })
  const admin = { ...options, headers: { Authorization: `Bearer ${token}` } }

  // Admin čtení logů jen pro správce.
  expect((await api.get("/admin/ops/events", options)).status).toBe(401)
  expect((await api.get("/admin/ops/audit", options)).status).toBe(401)
  expect((await api.get("/admin/ops/events?domain=neexistuje", admin)).status).toBe(400)
  expect((await api.get("/admin/ops/events?from=2026-01-01&to=2026-10-01", admin)).status).toBe(400)

  // Korelace: bezpečné příchozí ID se vrátí, nebezpečné se nahradí novým.
  const buyer = await syntheticBuyer(container, options, "ops-buyer@example.test")
  await verifyOperationsStatusHttp({ api, admin, customer: buyer.options, anonymous: options, evidence })
  const requestId = `ops-verify-${Date.now()}`
  const failed = await api.post("/store/nexus-checkout", { cart_id: "cart_synthetic_missing" }, { ...buyer.options, headers: { ...buyer.options.headers, "x-request-id": requestId } })
  expect(failed.status).toBe(404)
  expect(failed.headers["x-request-id"]).toBe(requestId)
  const unsafe = await api.get("/admin/ops/events?limit=1", { ...admin, headers: { ...admin.headers, "x-request-id": "bad id <script>" } })
  expect(unsafe.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/)

  // Neúspěšný checkout je dohledatelný podle request_id i košíku; v polích nejsou osobní údaje.
  const byRequest = await api.get(`/admin/ops/events?request_id=${requestId}`, admin)
  expect(byRequest.status).toBe(200)
  expect(byRequest.headers["cache-control"]).toBe("no-store")
  expect(byRequest.data.count).toBeGreaterThanOrEqual(1)
  const failure = byRequest.data.events.find((row: any) => row.domain === "checkout" && row.event === "failed")
  expect(failure).toMatchObject({ level: "error", cart_id: "cart_synthetic_missing", request_id: requestId })
  expect(JSON.stringify(byRequest.data)).not.toMatch(/@example\.test/)
  const byCart = await api.get("/admin/ops/events?cart_id=cart_synthetic_missing&domain=checkout&level=error", admin)
  expect(byCart.data.events.every((row: any) => row.cart_id === "cart_synthetic_missing" && row.level === "error")).toBe(true)

  // Úspěšné nákupy a zpracování objednávek z předchozích kroků se zapsaly jako trvalé události.
  const completed = await api.get("/admin/ops/events?domain=checkout&event=completed&limit=5", admin)
  expect(completed.data.count).toBeGreaterThanOrEqual(1)
  expect(completed.data.events[0].order_id).toMatch(/^order_/)
  const window = await api.get(`/admin/ops/events?from=${new Date(Date.now() - 3_600_000).toISOString()}&to=${new Date(Date.now() + 60_000).toISOString()}&limit=100`, admin)
  expect(window.data.count).toBeGreaterThanOrEqual(completed.data.count)

  const edge = await verifyEdgeIngest(api, options, admin)

  const auditSummary: Record<string, number> = {}
  if (bookingRan) {
    // Změny nastavení z admin kroků (typ konzultace, týden dostupnosti, chat) jsou v trvalém auditu s aktérem a diffem.
    for (const action of ["booking_type.create", "booking_type.update", "booking_availability.set_week", "chat_conversation.close", "chat_customer.block"]) {
      const page = await api.get(`/admin/ops/audit?action=${action}`, admin)
      expect(page.status).toBe(200)
      expect(page.data.count).toBeGreaterThanOrEqual(1)
      expect(page.data.entries[0].actor_type).toBe("user")
      auditSummary[action] = page.data.count
    }
  }
  evidence.push({ endpoint: "/admin/ops/*", scenario: "OPS_OBSERVABILITY", requestIdEcho: true, failedCheckoutCorrelated: true, completedEvents: completed.data.count, audit: auditSummary, edgeIngest: edge })
}

/**
 * Skutečný HTTP příjem událostí z NEXUS Workeru (POST /hooks/ops/edge-events): podpis nad surovým tělem,
 * vazba na tenanta (NEXUS_TENANT_ID = anastasia), uložení do ops_event a čtení přes admin API.
 */
async function verifyEdgeIngest(api: any, options: any, admin: any) {
  const secret = process.env.OPS_INGEST_SECRET!
  const requestId = `edge-verify-${Date.now()}`
  const send = (body: unknown, sign: { secret?: string; ts?: string } = {}) => {
    const raw = JSON.stringify(body)
    const ts = sign.ts ?? String(Math.floor(Date.now() / 1000))
    const headers: Record<string, string> = { ...options.headers, "content-type": "application/json", "x-nexus-timestamp": ts }
    if (sign.secret !== "") headers["x-nexus-signature"] = signEdgeBatch(sign.secret ?? secret, ts, raw)
    return api.post("/hooks/ops/edge-events", raw, { ...options, headers, transformRequest: [(data: unknown) => data] })
  }
  const event = (tenant: string, extra: Record<string, unknown> = {}) => ({ tenant_id: tenant, level: "error", event: "http.unhandled_error", ts: new Date().toISOString(), request_id: requestId, path: "/api/nexus/pricing", status: 500, ...extra })

  expect((await send({ tenant_id: "anastasia", events: [event("anastasia")] }, { secret: "" })).status).toBe(401)
  expect((await send({ tenant_id: "anastasia", events: [event("anastasia")] }, { secret: "x".repeat(48) })).status).toBe(401)
  expect((await send({ tenant_id: "anastasia", events: [event("anastasia")] }, { ts: String(Math.floor(Date.now() / 1000) - 3600) })).status).toBe(401)
  const foreign = await send({ tenant_id: "okfish", events: [event("okfish")] })
  expect(foreign.status).toBe(403)
  expect(foreign.data.error).toBe("INGEST_TENANT_MISMATCH")

  const accepted = await send({ tenant_id: "anastasia", events: [event("anastasia", { message: "leak edge@example.test", stack: "at x" }), event("okfish"), { tenant_id: "anastasia", level: "fatal", event: "x.y" }] })
  expect(accepted.status).toBe(202)
  expect(accepted.data).toEqual({ accepted: 1, rejected: 2 })

  const stored = await api.get(`/admin/ops/events?domain=edge&request_id=${requestId}`, admin)
  expect(stored.status).toBe(200)
  expect(stored.data.count).toBe(1)
  expect(stored.data.events[0]).toMatchObject({ level: "error", domain: "edge", event: "http.unhandled_error", request_id: requestId })
  expect(JSON.stringify(stored.data)).not.toMatch(/leak|edge@example|at x|okfish/)
  return { unsigned: 401, badSignature: 401, staleTimestamp: 401, foreignTenant: 403, accepted: 1, rejected: 2, stored: stored.data.count }
}

import { ContainerRegistrationKeys, generateJwtToken, Modules } from "@medusajs/framework/utils"
import { stateKey, sha256Hex } from "../../src/modules/auth-magic-link/policy"

/**
 * Zrkadielko (členská zóna RESET 40+) – skutečné HTTP + PostgreSQL.
 *
 * Overuje, že Zrkadielko a štruktúra programu patria zákazníčke s aktívnym prístupom,
 * že sa cudzí záznam nedá prečítať / upraviť / zmazať, že validácia odmieta dátum v budúcnosti
 * a hodnoty mimo 1–10, a že záznamy sú v exporte osobných údajov a zmiznú pri výmaze zákazníka.
 * Synthetic only – volá sa v sériovom CI behe (Medusa + PostgreSQL).
 */
export async function verifyResetJournal({ api, container, options, evidence }: any) {
  const record = (scenario: string, extra: Record<string, unknown> = {}) => evidence.push({ scenario: `ZRK_${scenario}`, status: "PASS", ...extra })
  const jwt = (id: string, type = "customer") =>
    generateJwtToken({ actor_id: id, actor_type: type, auth_identity_id: `synthetic-${id}`, app_metadata: { [`${type}_id`]: id } }, { secret: process.env.JWT_SECRET!, expiresIn: "1h" })
  const as = (id: string, type = "customer") => ({ ...options, headers: { ...options.headers, Authorization: `Bearer ${jwt(id, type)}` } })

  const db = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const [owner, other] = await container.resolve(Modules.CUSTOMER).createCustomers([{ email: "zrk-owner@example.test" }, { email: "zrk-other@example.test" }])
  const [program] = await container.resolve(Modules.PRODUCT).createProducts([{
    title: "Synthetic RESET 40+",
    handle: "synthetic-reset-40-plus",
    status: "published",
    metadata: {
      program_key: "reset-40-plus",
      reset_journal_metrics: [
        { key: "energia", label: "Energia", min: 1, max: 10, order: 10 },
        { key: "spanok", label: "Spánok", min: 1, max: 10, order: 20 },
        { key: "stres", label: "Stres", min: 1, max: 10, order: 30 },
      ],
    },
  }])
  const entitlements = container.resolve("entitlement")
  await entitlements.grant({ customer_id: owner.id, product_id: program.id, source: "admin", dedupe_key: `zrk:${owner.id}:${program.id}`, tenant_id: "default" })
  const optOwner = as(owner.id)
  const optOther = as(other.id)

  // 1) Bez aktívneho prístupu k programu Zrkadielko neexistuje (403), nielen pre čítanie.
  expect((await api.get("/store/reset-journal", optOther)).status).toBe(403)
  expect((await api.post("/store/reset-journal", { date: "2026-08-14", metrics: { energia: 7 } }, optOther)).status).toBe(403)
  expect((await api.get("/store/reset-program", optOther)).status).toBe(403)
  record("NO_ENTITLEMENT_DENIED")

  // 2) Vlastný záznam sa uloží, prečíta a vráti sa s konfiguráciou hodnotení.
  const created = await api.post("/store/reset-journal", { date: "2026-08-14", week: 3, metrics: { energia: 7, spanok: 5, stres: 4 } }, optOwner)
  expect(created.status).toBe(201)
  const entryId = created.data.entry.id
  const list = await api.get("/store/reset-journal", optOwner)
  expect(list.status).toBe(200)
  expect(list.data.entries.length).toBe(1)
  expect(list.data.entries[0].metrics).toEqual({ energia: 7, spanok: 5, stres: 4 })
  expect(list.data.entries[0].date).toBe("2026-08-14")
  expect(list.data.metrics.map((metric: any) => metric.key)).toEqual(["energia", "spanok", "stres"])
  record("OWN_ENTRY_CREATED_AND_LISTED")

  // 3) Validácia: dátum v budúcnosti, hodnota mimo 1–10, neznámy kľúč, prázdne hodnotenia, zlé týždne.
  const future = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)
  expect((await api.post("/store/reset-journal", { date: future, metrics: { energia: 7 } }, optOwner)).status).toBe(400)
  expect((await api.post("/store/reset-journal", { date: "2026-08-14", metrics: { energia: 11 } }, optOwner)).status).toBe(400)
  expect((await api.post("/store/reset-journal", { date: "2026-08-14", metrics: { cudzi: 3 } }, optOwner)).status).toBe(400)
  expect((await api.post("/store/reset-journal", { date: "2026-08-14", metrics: {} }, optOwner)).status).toBe(400)
  expect((await api.post("/store/reset-journal", { date: "2026-08-14", week: 17, metrics: { energia: 5 } }, optOwner)).status).toBe(400)
  record("VALIDATION_REJECTS")

  // 4) Cudzí zákazník s vlastným prístupom nevidí cudzí záznam a nezmení ho.
  await entitlements.grant({ customer_id: other.id, product_id: program.id, source: "admin", dedupe_key: `zrk:${other.id}:${program.id}`, tenant_id: "default" })
  const otherList = await api.get("/store/reset-journal", optOther)
  expect(otherList.status).toBe(200)
  expect(otherList.data.entries.length).toBe(0)
  expect((await api.patch(`/store/reset-journal/${entryId}`, { metrics: { energia: 1 } }, optOther)).status).toBe(404)
  expect((await api.delete(`/store/reset-journal/${entryId}`, optOther)).status).toBe(404)
  expect((await api.get("/store/reset-journal", optOwner)).data.entries.length).toBe(1)
  record("CROSS_CUSTOMER_DENIED")

  // 5) Vlastný záznam sa dá upraviť a zmazať.
  expect((await api.patch(`/store/reset-journal/${entryId}`, { metrics: { energia: 3 } }, optOwner)).status).toBe(200)
  expect((await api.delete(`/store/reset-journal/${entryId}`, optOwner)).status).toBe(200)
  expect((await api.get("/store/reset-journal", optOwner)).data.entries.length).toBe(0)
  record("OWN_ENTRY_UPDATED_AND_DELETED")

  // 6) Štruktúra programu: 16 týždňov, pracovné listy po dňoch, vstupný dotazník; bez prihlásenia 401.
  const programResponse = await api.get("/store/reset-program", optOwner)
  expect(programResponse.status).toBe(200)
  expect(programResponse.data.weeks.length).toBe(16)
  expect(programResponse.data.weeks[0].days.map((day: any) => day.day)).toEqual([2, 3, 4, 5, 6, 7])
  expect(programResponse.data.entry_questionnaire_url).toBe("https://tally.so/r/440GBr")
  expect((await api.get("/store/reset-program", { ...options })).status).toBe(401)
  expect((await api.get("/store/reset-journal", { ...options })).status).toBe(401)
  record("PROGRAM_STRUCTURE_AND_AUTH")

  // 7) Export osobných údajov obsahuje Zrkadielko; výmaz zákazníka ho odstráni.
  const second = await api.post("/store/reset-journal", { date: "2026-08-13", metrics: { energia: 9 } }, optOwner)
  expect(second.status).toBe(201)
  const exported = await api.get("/store/customers/me/export", optOwner)
  expect(exported.status).toBe(200)
  expect(Array.isArray(exported.data.reset_journal)).toBe(true)
  expect(exported.data.reset_journal.some((row: any) => row.id === second.data.entry.id)).toBe(true)
  record("EXPORT_CONTAINS_JOURNAL")

  // Výmaz zákazníka (tombstone) musí odstrániť aj záznamy Zrkadielka.
  for (const customer of [owner]) {
    await db("auth_identity").insert({ id: `synthetic-${customer.id}`, app_metadata: JSON.stringify({ customer_id: customer.id }) })
    await db("provider_identity").insert({ id: `synthetic-provider-${customer.id}`, auth_identity_id: `synthetic-${customer.id}`, provider: "magic-link", entity_id: customer.email })
  }
  const [admin] = await container.resolve(Modules.USER).createUsers([{ email: "zrk-admin@example.test" }])
  const optAdmin = as(admin.id, "user")
  const request = await api.post("/store/customers/me/erasure-request", {}, optOwner)
  expect(request.status).toBe(202)
  const path = `/admin/customer-erasures/${request.data.request.id}/execute`
  const auth = container.resolve(Modules.AUTH).getAuthIdentityProviderService("magic-link")
  await auth.setState(stateKey(owner.email), { email: owner.email, tokenHash: "synthetic-only" }, 900)
  await db("auth_link_state").insert({ id: sha256Hex(owner.email), token_hash: sha256Hex("synthetic-pending"), expires_at: new Date(Date.now() + 900000) })
  const erased = await api.post(path, { confirm: true, customer_id: owner.id }, optAdmin)
  expect(erased.status).toBe(200)
  expect(await db("reset_journal_entry").where({ customer_id: owner.id }).first()).toBeFalsy()
  record("ERASURE_REMOVES_JOURNAL")
}

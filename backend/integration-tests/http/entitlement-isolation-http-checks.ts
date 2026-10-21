import { generateJwtToken, Modules } from "@medusajs/framework/utils"

/**
 * A-02 izolace přístupů (entitlementů) mezi zákazníky – skutečné HTTP + PostgreSQL.
 * Dva syntetickí zákazníci, každý s vlastním produktem; ověřuje se, že žádný parametr požadavku
 * (customer_id, stránkování, cizí product_id/media_key, cizí typ aktéra) nezpřístupní cizí knihovnu ani médium
 * a že admin zásah u jednoho zákazníka nezmění přístupy druhého.
 */
export async function verifyEntitlementIsolation({ api, container, options, evidence }: any) {
  const productModule = container.resolve(Modules.PRODUCT)
  const entitlements = container.resolve("entitlement")
  const record = (scenario: string, extra: Record<string, unknown> = {}) => evidence.push({ scenario: `A02_${scenario}`, status: "PASS", ...extra })
  const jwt = (actor_id: string, actor_type: string, extra: Record<string, unknown> = {}) =>
    `Bearer ${generateJwtToken({ actor_id, actor_type, auth_identity_id: `synthetic-${actor_id}`, ...extra }, { secret: process.env.JWT_SECRET!, expiresIn: "1h" })}`
  const as = (authorization: string) => ({ ...options, headers: { ...options.headers, Authorization: authorization } })

  const [a, b] = await container.resolve(Modules.CUSTOMER).createCustomers([{ email: "isolation-a@example.test" }, { email: "isolation-b@example.test" }])
  const keyA = "synthetic-isolation/a-lesson.m3u8"
  const keyB = "synthetic-isolation/b-lesson.m3u8"
  const [productA, productB] = await productModule.createProducts([
    { title: "Synthetic isolation A", status: "published", metadata: { entitlement: true, protected_media: [{ key: keyA }] } },
    { title: "Synthetic isolation B", status: "published", metadata: { entitlement: true, protected_media: [{ key: keyB }] } },
  ])
  const grant = (customer: any, product: any) => entitlements.grant({ customer_id: customer.id, product_id: product.id, source: "admin", dedupe_key: `a02:${customer.id}:${product.id}`, tenant_id: "default" })
  const { entitlement: entA } = await grant(a, productA)
  const { entitlement: entB } = await grant(b, productB)
  const optA = as(jwt(a.id, "customer"))
  const optB = as(jwt(b.id, "customer"))
  const library = async (opts: any, qs = "") => {
    const response = await api.get(`/store/entitlements${qs}`, opts)
    expect(response.status).toBe(200)
    return response.data.entitlements.map((e: any) => e.id) as string[]
  }
  const media = (opts: any, product_id: string, media_key: string, extra: Record<string, unknown> = {}) =>
    api.post("/store/media-access", { product_id, media_key, ...extra }, opts)

  // 1) Každá vidí jen svou knihovnu – i když podstrčí customer_id druhé nebo sáhne za konec stránky.
  expect(await library(optA)).toEqual([entA.id])
  expect(await library(optB)).toEqual([entB.id])
  for (const qs of [`?customer_id=${b.id}`, `?customer_id[]=${b.id}`, "?limit=1000", "?offset=1", "?limit=-5&offset=-1"]) {
    expect(await library(optA, qs)).not.toContain(entB.id)
  }
  const enriched = await api.get("/store/entitlements", optA)
  expect(enriched.data.entitlements[0].product.id).toBe(productA.id)
  expect(enriched.data.entitlements[0].product.media).toEqual([{ key: keyA, title: "a-lesson.m3u8", kind: "video" }])
  expect(JSON.stringify(enriched.data)).not.toContain(keyB)
  record("LIBRARY_BIDIRECTIONAL")

  // 2) Média: vlastní produkt projde, cizí produkt / cizí klíč / podstrčený customer_id ne.
  // runner nastavuje syntetické MEDIA_TOKEN_SECRET + MEDIA_DELIVERY_BASE_URL (bez nich by vše bylo 503)
  expect((await media(optA, productA.id, keyA)).status).toBe(200)
  for (const [product_id, key, extra] of [[productB.id, keyB, {}], [productA.id, keyB, {}], [productB.id, keyA, {}], [productB.id, keyB, { customer_id: b.id }]] as const) {
    expect((await media(optA, product_id, key, extra)).status).toBe(403)
  }
  const issued = await media(optB, productB.id, keyB)
  expect(issued.status).toBe(200)
  expect(new URL(issued.data.url).searchParams.get("t")).toBeTruthy()
  record("MEDIA_CROSS_CUSTOMER_DENIED")

  // 3) Cizí typ aktéra (admin token, neplatný podpis, žádný token) na zákaznické API neprojde.
  const [user] = await container.resolve(Modules.USER).createUsers([{ email: "isolation-admin@example.test" }])
  const adminOpts = as(jwt(user.id, "user", { app_metadata: { user_id: user.id } }))
  expect((await api.get("/store/entitlements", adminOpts)).status).toBe(401)
  expect((await media(adminOpts, productA.id, keyA)).status).toBe(401)
  const forged = `Bearer ${generateJwtToken({ actor_id: b.id, actor_type: "customer", auth_identity_id: "forged" }, { secret: "synthetic-wrong-secret", expiresIn: "1h" })}`
  expect((await api.get("/store/entitlements", as(forged))).status).toBe(401)
  expect((await api.get("/store/entitlements", options)).status).toBe(401)
  record("NON_CUSTOMER_ACTORS_REJECTED")

  // 4) Admin API je jen pro správce; zákaznický token ho nepoužije ani na čtení, ani na revoke.
  expect((await api.get(`/admin/entitlements?customer_id=${b.id}`, optA)).status).toBe(401)
  expect((await api.post(`/admin/entitlements/${entB.id}/revoke`, {}, optA)).status).toBe(401)
  expect((await entitlements.retrieveEntitlement(entB.id)).status).toBe("active")
  const adminList = await api.get(`/admin/entitlements?customer_id=${a.id}`, adminOpts)
  expect(adminList.status).toBe(200)
  expect(adminList.data.entitlements.every((e: any) => e.customer_id === a.id)).toBe(true)
  record("ADMIN_API_ADMIN_ONLY")

  // 5) Revoke u A nezmění B; B dál vidí a otevře svůj obsah.
  expect((await api.post(`/admin/entitlements/${entA.id}/revoke`, {}, adminOpts)).status).toBe(200)
  expect(await library(optA)).toEqual([])
  expect(await library(optB)).toEqual([entB.id])
  expect((await media(optA, productA.id, keyA)).status).toBe(403)
  expect((await media(optB, productB.id, keyB)).status).toBe(200)
  record("REVOKE_SCOPED_TO_ONE_CUSTOMER")
}

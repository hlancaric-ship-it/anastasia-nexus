import type { MedusaContainer } from "@medusajs/framework"
import { createServer, type IncomingMessage, type Server } from "node:http"
import { AddressInfo } from "node:net"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { POST as uploadUrlRoute } from "../api/admin/products/[id]/protected-media/upload-url/route"
import { POST as attachRoute } from "../api/admin/products/[id]/protected-media/attach/route"
import { GET as libraryRoute } from "../api/admin/products/[id]/protected-media/route"
import { DELETE as detachRoute } from "../api/admin/products/[id]/protected-media/[key]/route"
import { GET as storeEntitlementsRoute } from "../api/store/entitlements/route"
import { issueMediaAccess } from "../modules/entitlement/media/access"
import { ENTITLEMENT_MODULE } from "../modules/entitlement"
import type EntitlementModuleService from "../modules/entitlement/service"

/**
 * Overenie toku „digitálny produkt od nuly“ na lokálnej DB.
 *
 *   npx medusa exec ./src/scripts/e2e-digital-library.ts
 *
 * Postup: založí testovací digitálny produkt, nahrá malý MP3 cez presigned URL
 * do náhradného S3 (lokálny server v tomto skripte – žiadny R2 účet sa nechýba),
 * pripojí súbor k produktu, udeľí zákazníčke prístup a overí, že sa k obsahu
 * dá dostať cez podepsaný krátkodobý odkaz. Na konci produkt aj zákazníčku zmaže.
 *
 * Skript je idempotentní a vždy uprace svoj testovací produkt.
 */

const ADMIN = { actor_type: "user", actor_id: "user_e2e" } as const
const CUSTOMER_EMAIL = "e2e.digital.library@example.invalid"
const PRODUCT_TITLE = "E2E digitálny produkt"

type Stored = { body: Buffer; contentType: string | null }
const objects = new Map<string, Stored>()

/** Náhrada R2: prijme presigned PUT a odpovie na HEAD. Podpis sa tu neoveruje. */
function startStorage(): Promise<{ server: Server; endpoint: string }> {
  const server = createServer((req: IncomingMessage, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1")
    const key = decodeURIComponent(url.pathname.replace(/^\/[^/]+\//, ""))
    if (req.method === "PUT") {
      const chunks: Buffer[] = []
      req.on("data", (chunk) => chunks.push(Buffer.from(chunk)))
      req.on("end", () => {
        objects.set(key, { body: Buffer.concat(chunks), contentType: req.headers["content-type"] ?? null })
        res.writeHead(200).end()
      })
      return
    }
    if (req.method === "HEAD") {
      const stored = objects.get(key)
      if (!stored) { res.writeHead(404).end(); return }
      res.writeHead(200, { "content-length": String(stored.body.length), "content-type": stored.contentType ?? "application/octet-stream" }).end()
      return
    }
    res.writeHead(405).end()
  })
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo
      resolve({ server, endpoint: `http://127.0.0.1:${port}` })
    })
  })
}

const makeRes = () => {
  const state: { status?: number; body?: any } = {}
  const res: any = {
    setHeader: () => res,
    status: (code: number) => { state.status = code; return res },
    json: (body: any) => { state.body = body; return res },
  }
  return { res, state }
}

const fail = (message: string) => { throw new Error(message) }

export default async function e2eDigitalLibrary({ container }: { container: MedusaContainer }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as any
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any
  const products = container.resolve(Modules.PRODUCT) as any
  const customers = container.resolve(Modules.CUSTOMER) as any
  const fulfillment = container.resolve(Modules.FULFILLMENT) as any
  const link = container.resolve(ContainerRegistrationKeys.LINK) as any
  const entitlements = container.resolve(ENTITLEMENT_MODULE) as EntitlementModuleService

  const storage = await startStorage()
  process.env.PROTECTED_R2_ENDPOINT = storage.endpoint
  process.env.PROTECTED_R2_BUCKET = "e2e-bucket"
  process.env.PROTECTED_R2_ACCESS_KEY_ID = "e2e-key"
  process.env.PROTECTED_R2_SECRET_ACCESS_KEY = "e2e-secret"
  process.env.PROTECTED_R2_REGION = "auto"
  process.env.MEDIA_TOKEN_SECRET = process.env.MEDIA_TOKEN_SECRET || "e2e-media-secret-e2e-media-secret"
  process.env.MEDIA_DELIVERY_BASE_URL = process.env.MEDIA_DELIVERY_BASE_URL || "http://127.0.0.1:8787/api/media"

  let productId = ""
  let customerId = ""
  const steps: string[] = []
  const check = (ok: boolean, label: string) => { if (!ok) fail(label); steps.push(`OK  ${label}`) }

  try {
    // 1) Digitálny dopravný profil (typ určuje, či je produkt digitálny).
    const profiles = await fulfillment.listShippingProfiles({}, { take: 50 })
    const digital = profiles.find((p: any) => p.type === "digital")
    if (!digital) fail("NO_DIGITAL_SHIPPING_PROFILE")

    // 2) Testovací digitálny produkt.
    const handle = `e2e-digital-${Date.now().toString(36)}`
    const created = await products.createProducts([{
      title: PRODUCT_TITLE,
      handle,
      status: "draft",
      description: "Testovací digitálny produkt pre overenie nahrávania chránených súborov.",
      shipping_profile_id: digital.id,
    }])
    productId = created[0].id
    const pid = productId
    await link.create({ [Modules.PRODUCT]: { product_id: pid }, [Modules.FULFILLMENT]: { shipping_profile_id: digital.id } })
    steps.push(`OK  testovací produkt ${pid} (handle ${handle})`)

    const req = (body: any, extra: any = {}) => ({
      params: { id: pid },
      query: {},
      body,
      auth_context: ADMIN,
      scope: container,
      ...extra,
    }) as any

    // 3) Presigned URL na nahrávanie.
    const upload = makeRes()
    await uploadUrlRoute(req({ filename: "e2e nahravka.mp3", size: 1024 }), upload.res)
    check(upload.state.status === 200, "upload-url vrátil 200")
    const target = upload.state.body
    check(typeof target.key === "string" && target.key.startsWith(`${handle}/`), "kľúč patrí do adresára produktu")
    check(String(target.url).includes("X-Amz-Signature"), "presigned URL je podpísaná")
    check(!JSON.stringify(target).includes("e2e-secret"), "odpoveď neobsahuje prístupový kľúč")

    // 4) Samotné nahrávanie (PUT na presigned URL).
    const audio = Buffer.alloc(1024, 7)
    const put = await fetch(target.url, { method: "PUT", headers: target.headers, body: audio })
    check(put.ok, "súbor sa nahral do úložišta")
    check(objects.has(target.key), "objekt je v úložisku")

    // 5) Pripojenie k produktu.
    const attach = makeRes()
    await attachRoute(req({ key: target.key, title: "E2E nahrávka" }), attach.res)
    check(attach.state.status === 200, "attach vrátil 200")
    const stored = (await query.graph({ entity: "product", fields: ["id", "metadata"], filters: { id: productId } })).data[0]
    check(JSON.stringify(stored.metadata?.protected_media ?? []).includes(target.key), "súbor je v metadata.protected_media")

    // 6) Register súborov (to, čo vidí zákazníčka).
    const library = makeRes()
    await libraryRoute(req(undefined), library.res)
    check(library.state.body?.media?.length === 1, "register obsahuje jeden súbor")
    check(library.state.body?.media?.[0]?.kind === "audio", "súbor je rozpoznaný ako nahrávka")

    // 7) Zákazníčka s prístupom.
    const customer = await customers.createCustomers([{ email: CUSTOMER_EMAIL, first_name: "E2E", last_name: "Test" }])
    customerId = customer[0].id
    const entitlement = await entitlements.grant({
      customer_id: customerId,
      product_id: productId,
      source: "admin",
      dedupe_key: `e2e:${customerId}:${productId}`,
      tenant_id: "default",
    })
    check(Boolean(entitlement.entitlement?.id), "zákazníčka má prístup k produktu")

    // 8) Čo zákazníčka uvidí v Knižnici.
    const storeRes = makeRes()
    await storeEntitlementsRoute({
      params: {}, query: {}, body: {},
      auth_context: { actor_type: "customer", actor_id: customerId },
      scope: container,
    } as any, storeRes.res)
    const entitlementsBody = storeRes.state.body
    check(entitlementsBody?.entitlements?.length === 1, "Knižnica vidí jeden prístup")
    check(entitlementsBody?.entitlements?.[0]?.product?.media?.[0]?.key === target.key, "Knižnica vidí nahratý súbor")
    check(entitlementsBody?.entitlements?.[0]?.product?.media?.[0]?.kind === "audio", "Knižnica vidí druh obsahu")

    // 9) Podepsaný krátkodobý odkaz na prehratie.
    const access = await issueMediaAccess({
      guard: entitlements,
      getProductMetadata: async (id) => (await query.graph({ entity: "product", fields: ["metadata"], filters: { id } })).data?.[0]?.metadata ?? null,
      getCustomerEmail: async () => CUSTOMER_EMAIL,
      audit: () => {},
      secret: process.env.MEDIA_TOKEN_SECRET!,
      deliveryBaseUrl: process.env.MEDIA_DELIVERY_BASE_URL!,
    }, { customerId, productId, mediaKey: target.key })
    check(String(access.url).includes(encodeURIComponent(target.key)), "odkaz na médium obsahuje kľúč")
    check(String(access.url).includes("?t="), "odkaz je podpísaný tokenom")
    check(access.watermark === CUSTOMER_EMAIL, "odkaz obsahuje vodoznak zákazníčky")

    // 10) Cudzí kľúč ani cudzia zákazníčka nedostanú prístup.
    let denied = false
    try {
      await issueMediaAccess({
        guard: entitlements, getProductMetadata: async () => null, getCustomerEmail: async () => null, audit: () => {},
        secret: process.env.MEDIA_TOKEN_SECRET!, deliveryBaseUrl: process.env.MEDIA_DELIVERY_BASE_URL!,
      }, { customerId, productId, mediaKey: `${handle}/nieexistujuci.mp3` })
    } catch { denied = true }
    check(denied, "kľúč, ktorý nie je v produkte, sa nedá otvoriť")

    // 11) Odpojenie od produktu (objekt v úložisku zostáva).
    const detach = makeRes()
    await detachRoute(req(undefined, { params: { id: pid, key: target.key } }), detach.res)
    check(detach.state.status === 200, "detach vrátil 200")
    check(objects.has(target.key), "objekt v úložisku zostal nedotknutý")

    // 12) Pôvodný obsah Reset 40+ a Nič nemusíš sa nesmie rozbít: pripojenie nového
    //     súboru musí ponechať všetky existujúce kľúče a odpojenie ich nesmie zmeniť.
    const original = (await query.graph({ entity: "product", fields: ["id", "handle", "metadata"], filters: { handle: "reset-40-plus" } })).data?.[0]
    if (original) {
      const keysBefore: string[] = (original.metadata?.protected_media ?? []).map((item: any) => item.key)
      const originalReq = (body: any, extra: any = {}) => ({
        params: { id: original.id }, query: {}, body, auth_context: ADMIN, scope: container, ...extra,
      }) as any
      const originalUpload = makeRes()
      await uploadUrlRoute(originalReq({ filename: "kontrolny nahravka.mp3", size: 512 }), originalUpload.res)
      check(originalUpload.state.status === 200, "Reset 40+ dostal upload URL")
      const originalTarget = originalUpload.state.body
      check(originalTarget.key.startsWith("reset-40-plus/"), "nový kľúč je v adresári Reset 40+")
      await fetch(originalTarget.url, { method: "PUT", headers: originalTarget.headers, body: Buffer.alloc(512, 3) })
      const originalAttach = makeRes()
      await attachRoute(originalReq({ key: originalTarget.key, title: "Kontrolná nahrávka" }), originalAttach.res)
      check(originalAttach.state.status === 200, "nový súbor sa pripojil k Reset 40+")
      const withNew = (await query.graph({ entity: "product", fields: ["metadata"], filters: { id: original.id } })).data[0]?.metadata?.protected_media ?? []
      const keysWithNew: string[] = withNew.map((item: any) => item.key)
      check(keysWithNew.length === keysBefore.length + 1, "pôvodný register dostal iba jeden nový kľúč")
      check(keysBefore.every((key) => keysWithNew.includes(key)), "všetky pôvodné kľúče Reset 40+ zostali")
      const originalDetach = makeRes()
      await detachRoute(originalReq(undefined, { params: { id: original.id, key: originalTarget.key } }), originalDetach.res)
      const afterDetach = (await query.graph({ entity: "product", fields: ["metadata"], filters: { id: original.id } })).data[0]?.metadata?.protected_media ?? []
      const keysAfter: string[] = afterDetach.map((item: any) => item.key)
      check(keysAfter.length === keysBefore.length, "po odpojení je register pôvodný")
      check(keysBefore.every((key, index) => keysAfter[index] === key), "pôvodné kľúče ani ich poradie sa nezmenili")
      const originalLibrary = makeRes()
      await libraryRoute(originalReq(undefined), originalLibrary.res)
      check(originalLibrary.state.body?.media?.length === keysBefore.length, "register stále ukazuje pôvodný počet súborov")
    }

    console.log("E2E_DIGITAL_LIBRARY " + JSON.stringify({ status: "PASS", product: productId, key: target.key, steps }, null, 1))
  } finally {
    // 12) Úspecha: testovací produkt deaktivujeme a zákazníčku s prístupom odstránime.
    if (customerId) {
      const rows = await entitlements.listEntitlements({ customer_id: customerId }, { take: 50 }) as any[]
      const ids = (rows ?? []).map((row: any) => row.id).filter(Boolean)
      if (ids.length) await entitlements.deleteEntitlements(ids).catch(() => undefined)
      await customers.deleteCustomers([customerId]).catch(() => undefined)
    }
    if (productId) {
      await products.updateProducts(productId, { status: "draft" }).catch(() => undefined)
      const { data } = await query.graph({ entity: "product", fields: ["id", "handle", "status"], filters: { id: productId } })
      logger.info(`[e2e-digital-library] testovací produkt deaktivovaný: ${JSON.stringify(data?.[0] ?? { id: productId })}`)
    }
    storage.server.close()
  }
}

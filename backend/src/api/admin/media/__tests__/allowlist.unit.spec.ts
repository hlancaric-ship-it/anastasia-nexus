import { Modules } from "@medusajs/framework/utils"
import { ALLOWED_MEDIA_TYPES, GET, POST, isAllowedMediaType } from "../route"

// Knihovna obrázkov v administrácii.
//
// `image/svg+xml` je vyňatý z allowlistu: SVG je dokument s možnosťou
// vložiť skript, ktorý sa po otvorení adresy spustí v kontexte stránky
// (XSS). Test overuje, že server taký súbor do knižne nevezme.

function scope() {
  const state: { metadata: Record<string, unknown> } = { metadata: {} }
  const updateStores = jest.fn(async (_id: string, data: { metadata?: Record<string, unknown> }) => {
    if (data?.metadata) state.metadata = data.metadata
  })
  const listStores = jest.fn(async () => [{ id: "store_1", metadata: state.metadata }])
  const resolved = {
    [Modules.STORE]: { listStores, updateStores },
  }
  return {
    scope: { resolve: (key: string) => (resolved as Record<string, unknown>)[key] ?? {} } as never,
    updateStores,
    listStores,
  }
}

function request(files: unknown[]) {
  return {
    auth_context: { actor_type: "user", actor_id: "user_1" },
    body: { files },
    scope: undefined as never,
  }
}

function response() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    setHeader: jest.fn(),
    status: jest.fn(function (this: any, code: number) { res.statusCode = code; return res }),
    json: jest.fn(function (this: any, payload: unknown) { res.body = payload; return res }),
  }
  return res as any
}

describe("allowlist typov v knižnici obrázkov", () => {
  it("nepovolí SVG (vektorový dokument so skriptom)", () => {
    expect(ALLOWED_MEDIA_TYPES).not.toContain("image/svg+xml")
    expect(isAllowedMediaType("image/svg+xml")).toBe(false)
  })

  it("povoľuje len obrázkové formáty", () => {
    expect([...ALLOWED_MEDIA_TYPES].sort()).toEqual(["image/avif", "image/gif", "image/jpeg", "image/png", "image/webp"])
    expect(isAllowedMediaType("image/jpeg")).toBe(true)
    expect(isAllowedMediaType("image/png")).toBe(true)
    expect(isAllowedMediaType("image/webp")).toBe(true)
    expect(isAllowedMediaType("image/gif")).toBe(true)
    expect(isAllowedMediaType("image/avif")).toBe(true)
  })

  it("odmietne iné typy (PDF, HTML, SVG s iným príponou)", () => {
    expect(isAllowedMediaType("application/pdf")).toBe(false)
    expect(isAllowedMediaType("text/html")).toBe(false)
    expect(isAllowedMediaType("image/svg")).toBe(false)
  })
})

describe("POST /admin/media – typ súboru", () => {
  it("SVG súbor nezapíše do knižnice (400)", async () => {
    const { scope: sc, updateStores } = scope()
    const req = { ...request([{ key: "logo.svg", url: "https://media.test/logo.svg", name: "logo.svg", size: 1024, content_type: "image/svg+xml" }]), scope: sc }
    const res = response()
    await POST(req as never, res)
    expect(res.statusCode).toBe(400)
    expect(String(res.body.message)).not.toContain("SVG")
    expect(updateStores).not.toHaveBeenCalled()
  })

  it("bez prihlásenia je 401 a nič sa neoveruje", async () => {
    const { scope: sc } = scope()
    const req = { auth_context: undefined, body: { files: [] }, scope: sc }
    const res = response()
    await POST(req as never, res)
    expect(res.statusCode).toBe(401)
  })

  it("obrázok v povolenom type prejde a zapíše sa", async () => {
    const { scope: sc, updateStores } = scope()
    const req = { ...request([{ key: "foto.jpg", url: "https://media.test/foto.jpg", name: "foto.jpg", size: 1024, content_type: "image/jpeg" }]), scope: sc }
    const res = response()
    await POST(req as never, res)
    expect(res.statusCode).toBe(200)
    expect(updateStores).toHaveBeenCalledTimes(1)
  })
})

describe("GET /admin/media", () => {
  it("vyžaduje prihlásenie správcu", async () => {
    const { scope: sc } = scope()
    const res = response()
    await GET({ auth_context: undefined, scope: sc } as never, res)
    expect(res.statusCode).toBe(401)
  })
})

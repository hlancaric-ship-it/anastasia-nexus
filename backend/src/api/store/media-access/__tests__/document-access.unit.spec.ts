import { POST } from "../route"
import { libraryMedia } from "../../../../lib/protected-library/catalog"

/**
 * Chránený PDF z knižnice: prístup len s oprávnením, krátkodobý podpísaný odkaz
 * a žiadna trvalá adresa do R2.
 */
const PDF_KEY = "reset-40-plus/priloha-a1b2c3.pdf"
const SECRET = "synthetic-media-secret-".repeat(3)
const BASE = "https://media.example.test/api/media"

function fixture(options: { entitled?: boolean; metadata?: Record<string, unknown> | null } = {}) {
  const entitled = options.entitled !== false
  const metadata = options.metadata === undefined
    ? { protected_media: [{ key: PDF_KEY, title: "Príloha" }] }
    : options.metadata
  const guard = {
    findActiveAccess: jest.fn(async () => (entitled ? { id: "ent_1" } : null)),
  }
  const query = {
    graph: jest.fn(async ({ entity }: any) => {
      if (entity === "product") return { data: [{ id: "prod_1", metadata }] }
      if (entity === "customer") return { data: [{ id: "cus_1", email: "zákaznik@example.test" }] }
      return { data: [] }
    }),
  }
  const logger = { info: jest.fn(), error: jest.fn(), warn: jest.fn() }
  const req: any = {
    body: { product_id: "prod_1", media_key: PDF_KEY },
    auth_context: { actor_type: "customer", actor_id: "cus_1" },
    scope: { resolve: (key: string) => (key === "query" ? query : key === "entitlement" ? guard : logger) },
  }
  const res: any = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() }
  return { req, res, guard, query, logger }
}

beforeEach(() => {
  process.env.MEDIA_TOKEN_SECRET = SECRET
  process.env.MEDIA_DELIVERY_BASE_URL = BASE
})

describe("Chránený PDF z knižnice", () => {
  it("registr rozozná PDF ako dokument", () => {
    expect(libraryMedia({ protected_media: [{ key: PDF_KEY, title: "Príloha" }] })).toEqual([
      { key: PDF_KEY, title: "Príloha", kind: "document" },
    ])
  })

  it("oprávnený zákazník dostane krátkodobý podpísaný odkaz s vodoznakom", async () => {
    const f = fixture()
    await POST(f.req, f.res)
    expect(f.res.status).toHaveBeenCalledWith(200)
    const body = f.res.json.mock.calls[0][0]
    expect(body.url).toContain(`${encodeURIComponent(PDF_KEY)}`)
    expect(body.url).toContain("?t=")
    expect(body.watermark).toBe("zákaznik@example.test")
    expect(new Date(body.expires_at).getTime() - Date.now()).toBeLessThanOrEqual(15 * 60 * 1000)
    expect(f.res.setHeader).toHaveBeenCalledWith("Cache-Control", "no-store")
  })

  it("bez oprávnenia sa PDF nedostane", async () => {
    const f = fixture({ entitled: false })
    await POST(f.req, f.res)
    expect(f.res.status).toHaveBeenCalledWith(403)
    expect(f.res.json.mock.calls[0][0].type).toBe("forbidden")
  })

  it("PDF mimoregistra produktu sa nedostane", async () => {
    const f = fixture({ metadata: { protected_media: [{ key: "nic-nemusis/a1b2c3.mp3", title: "Nahrávka" }] } })
    await POST(f.req, f.res)
    expect(f.res.status).toHaveBeenCalledWith(403)
  })

  it("bez prihlásenia sa PDF nedostane", async () => {
    const f = fixture()
    f.req.auth_context = undefined
    await POST(f.req, f.res)
    expect(f.res.status).toHaveBeenCalledWith(401)
  })
})

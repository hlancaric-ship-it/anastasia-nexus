import { signMediaToken, verifyMediaToken, clampTtl, MAX_TTL_SECONDS } from "../token"
import { issueMediaAccess, MediaAccessDenied, readProtectedMedia } from "../access"

const SECRET = "x".repeat(40)
const NOW = new Date("2026-10-09T12:00:00Z")
const input = { customerId: "cus_1", productId: "p_ep001", mediaKey: "ep001/track-1.m3u8" }

describe("media token", () => {
  it("podepíše a ověří, vazba na klíč média", () => {
    const { token } = signMediaToken(SECRET, input, NOW)
    const ok = verifyMediaToken(SECRET, token, input.mediaKey, NOW)
    expect(ok.ok).toBe(true)
    expect(verifyMediaToken(SECRET, token, "jine/medium.m3u8", NOW)).toEqual({ ok: false, reason: "KEY_MISMATCH" })
  })
  it("po expiraci neplatí a TTL je omezeno na 15 minut", () => {
    const { token, expiresAt } = signMediaToken(SECRET, { ...input, ttlSeconds: 99999 }, NOW)
    expect(expiresAt.getTime() - NOW.getTime()).toBe(MAX_TTL_SECONDS * 1000)
    expect(verifyMediaToken(SECRET, token, undefined, new Date(NOW.getTime() + (MAX_TTL_SECONDS + 1) * 1000))).toEqual({ ok: false, reason: "EXPIRED" })
    expect(clampTtl(1)).toBe(30)
  })
  it("upravený payload nebo cizí tajemství neprojde", () => {
    const { token } = signMediaToken(SECRET, input, NOW)
    const [body, sig] = token.split(".")
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), c: "cus_2" })).toString("base64url")
    expect(verifyMediaToken(SECRET, `${forged}.${sig}`, undefined, NOW)).toEqual({ ok: false, reason: "BAD_SIGNATURE" })
    expect(verifyMediaToken("y".repeat(40), token, undefined, NOW)).toEqual({ ok: false, reason: "BAD_SIGNATURE" })
    expect(verifyMediaToken(SECRET, "nesmysl", undefined, NOW)).toEqual({ ok: false, reason: "MALFORMED" })
  })
  it("krátké tajemství se odmítne", () => {
    expect(() => signMediaToken("short", input, NOW)).toThrow("MEDIA_TOKEN_SECRET_TOO_SHORT")
  })
})

function deps(over: Partial<any> = {}) {
  const audit = jest.fn()
  return {
    audit,
    guard: { findActiveAccess: jest.fn(async () => ({ id: "ent_1" })) },
    getProductMetadata: jest.fn(async () => ({ protected_media: [{ key: input.mediaKey, title: "Stopa 1" }] })),
    getCustomerEmail: jest.fn(async () => "a@b.sk"),
    secret: SECRET,
    deliveryBaseUrl: "https://media.example.sk/",
    ...over,
  } as any
}
const code = async (p: Promise<unknown>) => { try { await p; return "OK" } catch (e) { return (e as MediaAccessDenied).code } }

describe("issueMediaAccess", () => {
  it("oprávněný zákazník dostane krátkodobý odkaz s vodoznakem a audit", async () => {
    const d = deps()
    const r: any = await issueMediaAccess(d, input, NOW)
    expect(r.url).toMatch(/^https:\/\/media\.example\.sk\/v1\/ep001%2Ftrack-1\.m3u8\?t=/)
    expect(r.watermark).toBe("a@b.sk")
    expect(d.audit).toHaveBeenCalledTimes(1)
  })
  it("bez nároku se nic nepodepíše", async () => {
    const d = deps({ guard: { findActiveAccess: jest.fn(async () => null) } })
    expect(await code(issueMediaAccess(d, input, NOW))).toBe("ACCESS_DENIED")
    expect(d.audit).not.toHaveBeenCalled()
  })
  it("médium, které produktu nepatří, se odmítne stejnou chybou", async () => {
    expect(await code(issueMediaAccess(deps(), { ...input, mediaKey: "cizi/video.mp4" }, NOW))).toBe("ACCESS_DENIED")
  })
  it("bez konfigurace 503 stav, ne vydání odkazu", async () => {
    expect(await code(issueMediaAccess(deps({ secret: "" }), input, NOW))).toBe("MEDIA_NOT_CONFIGURED")
  })
  it("registr médií čte řetězce i objekty", () => {
    expect(readProtectedMedia({ protected_media: ["a", { key: "b" }, 5, {}] })).toEqual([{ key: "a" }, { key: "b" }])
    expect(readProtectedMedia(null)).toEqual([])
  })
})

import { generateToken, isValidMagicLinkAttempt, normalizeEmail, parseRegistration, sha256Hex, stateKey, timingSafeEqualHex } from "../policy"

describe("auth-magic-link policy", () => {
  it("validates registration fields and versioned mandatory consents", () => {
    const env = { LEGAL_TERMS_VERSION: "terms-v1", LEGAL_PRIVACY_VERSION: "privacy-v2", NEWSLETTER_CONSENT_VERSION: "news-v3" } as NodeJS.ProcessEnv
    const body = { first_name: " Anna ", last_name: "Testová", terms_accepted: "true", privacy_acknowledged: "true", terms_version: "terms-v1", privacy_version: "privacy-v2", newsletter_accepted: "false" }
    expect(parseRegistration(body, "anna@example.test", env)).toMatchObject({ first_name: "Anna", terms_version: "terms-v1", privacy_version: "privacy-v2", newsletter_accepted: false })
    expect(parseRegistration({ ...body, terms_accepted: "false" }, "anna@example.test", env)).toBeNull()
    expect(parseRegistration({ ...body, first_name: "<script>" }, "anna@example.test", env)).toBeNull()
    expect(parseRegistration({ ...body, newsletter_accepted: "true", newsletter_version: "old" }, "anna@example.test", env)).toBeNull()
    expect(parseRegistration({ ...body, newsletter_accepted: "true", newsletter_version: "news-v3" }, "anna@example.test", env)).toMatchObject({ newsletter_accepted: true, newsletter_version: "news-v3" })
  })
  it("normalizeEmail ořízne, zmenší a odmítne neplatné", () => {
    expect(normalizeEmail(" A@B.sk ")).toBe("a@b.sk")
    expect(normalizeEmail("spatne")).toBeNull()
    expect(normalizeEmail(123)).toBeNull()
    expect(normalizeEmail("a@" + "b".repeat(260) + ".sk")).toBeNull()
  })
  it("token je náhodný a dost dlouhý", () => {
    const a = generateToken()
    const b = generateToken()
    expect(a).not.toBe(b)
    expect(a.length).toBeGreaterThan(30)
  })
  it("timingSafeEqualHex porovná jen platné hex stejné délky", () => {
    const h = sha256Hex("x")
    expect(timingSafeEqualHex(h, h)).toBe(true)
    expect(timingSafeEqualHex(h, sha256Hex("y"))).toBe(false)
    expect(timingSafeEqualHex("zz", "zz")).toBe(false)
    expect(timingSafeEqualHex(h, h.slice(0, -2))).toBe(false)
  })
  it("stateKey je stabilní pro stejný e-mail", () => {
    expect(stateKey("a@b.sk")).toBe(stateKey("a@b.sk"))
    expect(stateKey("a@b.sk")).not.toBe(stateKey("c@b.sk"))
  })
  it("isValidMagicLinkAttempt: správný token projde, špatný/cizí e-mail/chybějící stav neprojde", () => {
    const token = generateToken()
    const state = { email: "a@b.sk", tokenHash: sha256Hex(token) }
    expect(isValidMagicLinkAttempt(state, "a@b.sk", token)).toBe(true)
    expect(isValidMagicLinkAttempt(state, "a@b.sk", "jiny-token")).toBe(false)
    expect(isValidMagicLinkAttempt(state, "jiny@b.sk", token)).toBe(false)
    expect(isValidMagicLinkAttempt(null, "a@b.sk", token)).toBe(false)
    expect(isValidMagicLinkAttempt(state, "a@b.sk", "")).toBe(false)
  })
})

describe("normalizeEmail – odolnosť proti ReDoS", () => {
  it("odmietne obrovský vstup rýchlo (bez spätného prehľadávania)", () => {
    const { normalizeEmail } = require("../policy")
    const started = Date.now()
    expect(normalizeEmail("a@" + "a".repeat(100_000))).toBeNull()
    // Starý regex /^[^\s@]+@[^\s@]+\.[^\s@]+$/ na tomto vstupe bežal kvadraticky (20 k znakov ≈ 0,5 s).
    expect(normalizeEmail("a@" + ".".repeat(1000) + " ")).toBeNull()
    expect(normalizeEmail("a@" + "a.".repeat(400) + "@")).toBeNull()
    expect(normalizeEmail("a@b" + ".a".repeat(120) + "x".repeat(3000))).toBeNull()
    expect(Date.now() - started).toBeLessThan(200)
  })

  it("prijme bežné adresy a odmietne zlé tvary", () => {
    const { normalizeEmail } = require("../policy")
    expect(normalizeEmail(" Jana.Novakova+eshop@Mail.Example.sk ")).toBe("jana.novakova+eshop@mail.example.sk")
    for (const bad of ["a@b", "a@.b.sk", "a@b..sk", "a@b.sk.", "@b.sk", "a b@c.sk", "a@b@c.sk", "x".repeat(65) + "@b.sk"]) {
      expect(normalizeEmail(bad)).toBeNull()
    }
  })
})
